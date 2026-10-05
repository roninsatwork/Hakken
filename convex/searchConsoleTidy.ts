import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isPageRef } from "./searchConsolePageRefs";
import { rollUpSite } from "./searchConsoleRollups";
import { countriesAsAllNow } from "./searchConsoleShrink";
import { firstDayKeptFor } from "./utils/searchConsolePacks";

/**
 * Search Console's figures kept before 2026-10-05 brought to what is kept
 * from then (docs/plans/active/finish-off-plan.md, items 2 and 12), on every
 * website on the platform with figures kept:
 *
 * - a country nearly all of a website's searches loses its own search-and-page
 *   lines and its first- and last-seen register (2B: read from all countries'),
 * - every page address kept becomes a reference (2A),
 * - image search's days before this week go into their weeks (2C),
 * - and the website's ready-made periods are built again from what is left.
 *
 * Run once on each deployment: first `go: false`, which changes nothing and
 * says what would change, website by website; then `go: true`. A few records
 * a step, in runs that hand on to the next before an action's ten minutes.
 * Safe to run again: what is already changed is left alone.
 */

/** Kept records read per step: each up to 8,000 lines, so few. */
const RECORDS_PER_STEP = 8;
/** First- and last-seen rows per step: small. */
const SEEN_PER_STEP = 2_000;
/** How long one run works before it hands on to the next: an action stops at ten minutes. */
const TIDY_RUN_MS = 6 * 60 * 1000;

const tallyValidator = v.object({
  websites: v.number(),
  countries: v.number(),
  copies: v.number(),
  seen: v.number(),
  addresses: v.number(),
  imageDays: v.number(),
});
type Tally = typeof tallyValidator.type;
const NO_TALLY: Tally = { websites: 0, countries: 0, copies: 0, seen: 0, addresses: 0, imageDays: 0 };

const taskValidator = v.object({
  kind: v.union(v.literal("copies"), v.literal("seen"), v.literal("addresses"), v.literal("images")),
  country: v.optional(v.string()),
  newest: v.optional(v.string()),
});
type Task = typeof taskValidator.type;

const stepValidator = v.object({ found: v.number(), continueCursor: v.string(), isDone: v.boolean() });
type Step = typeof stepValidator.type;

/** A website's name and the countries nearly all of its searches — settled again when going ahead. */
export const tidyPlan = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), go: v.boolean() },
  returns: v.union(v.null(), v.object({ host: v.string(), countries: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.clearing) return null;
    const hold = await ctx.db.get(connection.companyWebsiteId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    const countries = await countriesAsAllNow(ctx, connection);
    if (args.go) await ctx.db.patch(connection._id, { countriesAsAll: countries.length > 0 ? countries : undefined });
    return { host: website?.displayHost ?? website?.host ?? String(connection.companyWebsiteId), countries };
  },
});

/** One step through a country's kept lists: its search-and-page lines counted, and removed when going ahead. */
export const countryCopiesStep = internalMutation({
  args: { holdId: v.id("companyWebsites"), country: v.string(), go: v.boolean(), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    let found = 0;
    for (const record of page.page) {
      if (record.list !== "pair" && record.list !== "page") continue;
      found += 1;
      if (args.go) await ctx.db.delete(record._id);
    }
    return { found, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One step through a country's first- and last-seen register: counted, and removed when going ahead. */
export const countrySeenStep = internalMutation({
  args: { holdId: v.id("companyWebsites"), country: v.string(), go: v.boolean(), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleSeen")
      .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country))
      .paginate({ cursor: args.cursor, numItems: SEEN_PER_STEP });
    if (args.go) for (const row of page.page) await ctx.db.delete(row._id);
    return { found: page.page.length, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One step through a website's kept lists: the records still holding a page address. */
export const addressesStep = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    const found = page.page.filter((record) => (record.list === "pair" && record.pages?.some((value) => !isPageRef(value)))
      || (record.list === "page" && record.keys.some((value) => !isPageRef(value)))).length;
    return { found, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One step through a website's image search for all countries or one: the days kept that now go into their weeks. */
export const imageDaysStep = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), newest: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const line = firstDayKeptFor("image", args.newest);
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", "image"))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    const found = page.page.filter((record) => record.grain === "DAY" && record.start < line).length;
    return { found, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** The work for one website: each country's copies and register, its addresses, and each scope's image days. */
async function tasksFor(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">, countries: readonly string[]): Promise<Task[]> {
  const tasks: Task[] = [];
  for (const country of countries) tasks.push({ kind: "copies", country }, { kind: "seen", country });
  tasks.push({ kind: "addresses" });
  const all = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  if (!all?.newestDay) return tasks;
  tasks.push({ kind: "images", newest: all.newestDay });
  for (const country of all.countries) {
    const one = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId, country });
    if (one?.newestDay) tasks.push({ kind: "images", country, newest: one.newestDay });
  }
  return tasks;
}

/** One step of a task: what it found, and where to go on. */
async function stepOf(ctx: ActionCtx, holdId: Id<"companyWebsites">, task: Task, go: boolean, cursor: string | null): Promise<Step> {
  if (task.kind === "copies") return await ctx.runMutation(internal.searchConsoleTidy.countryCopiesStep, { holdId, country: task.country!, go, cursor });
  if (task.kind === "seen") return await ctx.runMutation(internal.searchConsoleTidy.countrySeenStep, { holdId, country: task.country!, go, cursor });
  if (task.kind === "addresses") {
    if (!go) return await ctx.runQuery(internal.searchConsoleTidy.addressesStep, { holdId, cursor });
    const step = await ctx.runMutation(internal.searchConsolePageRefs.encodeKeptPagesStep, { holdId, cursor });
    return { found: step.changed, continueCursor: step.continueCursor, isDone: step.isDone };
  }
  const scope = task.country === undefined ? {} : { country: task.country };
  if (!go) return await ctx.runQuery(internal.searchConsoleTidy.imageDaysStep, { holdId, ...scope, newest: task.newest!, cursor });
  // Every roll-up due for the scope, image search's finished weeks among them, in one go.
  const rolled = await rollUpSite(ctx, holdId, task.newest!, task.country);
  return { found: rolled, continueCursor: "", isDone: true };
}

const FIELD_OF: Record<Task["kind"], keyof Tally> = { copies: "copies", seen: "seen", addresses: "addresses", images: "imageDays" };

/** What one website comes to, as a line of the report. */
function lineOf(host: string, countries: readonly string[], tally: Tally, go: boolean): string {
  const as = countries.length > 0 ? `${countries.join(", ")} read as all countries` : "no country read as all countries";
  const verb = go ? "removed" : "to remove";
  return `${host}: ${as}; ${tally.copies} country records and ${tally.seen} register rows ${verb}; `
    + `${tally.addresses} records ${go ? "turned" : "to turn"} to page references; ${tally.imageDays} image days ${go ? "rolled up (with any other roll-up due)" : "to roll into weeks"}.`;
}

const add = (one: Tally, two: Tally): Tally => ({
  websites: one.websites + two.websites,
  countries: one.countries + two.countries,
  copies: one.copies + two.copies,
  seen: one.seen + two.seen,
  addresses: one.addresses + two.addresses,
  imageDays: one.imageDays + two.imageDays,
});

/**
 * Bring every website's kept Search Console figures to what is kept from
 * 2026-10-05. `go: false` counts; `go: true` changes, then asks for each
 * website's ready-made periods to be built again. Returns the report when it
 * finishes in its first run; otherwise hands on, and the last run logs it.
 */
export const tidyKeptFigures = internalAction({
  args: {
    go: v.boolean(),
    connections: v.optional(v.array(v.object({ connectionId: v.id("searchConsoleConnections"), holdId: v.id("companyWebsites") }))),
    at: v.optional(v.number()),
    site: v.optional(v.object({ host: v.string(), countries: v.array(v.string()), tasks: v.array(taskValidator), task: v.number(), cursor: v.union(v.string(), v.null()), tally: tallyValidator })),
    tally: v.optional(tallyValidator),
    lines: v.optional(v.array(v.string())),
  },
  returns: v.union(v.null(), v.object({ tally: tallyValidator, lines: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const started = Date.now();
    const connections = args.connections ?? await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    let at = args.at ?? 0;
    let site = args.site ?? null;
    let tally = args.tally ?? NO_TALLY;
    const lines = [...(args.lines ?? [])];
    while (at < connections.length) {
      if (Date.now() - started > TIDY_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.searchConsoleTidy.tidyKeptFigures, { go: args.go, connections, at, ...(site ? { site } : {}), tally, lines });
        return null;
      }
      const { connectionId, holdId } = connections[at];
      if (!site) {
        const plan = await ctx.runMutation(internal.searchConsoleTidy.tidyPlan, { connectionId, go: args.go });
        if (!plan) {
          at += 1;
          continue;
        }
        const tasks = await tasksFor(ctx, connectionId, plan.countries);
        site = { host: plan.host, countries: plan.countries, tasks, task: 0, cursor: null, tally: { ...NO_TALLY, websites: 1, countries: plan.countries.length } };
      }
      if (site.task < site.tasks.length) {
        const task = site.tasks[site.task];
        const step = await stepOf(ctx, holdId, task, args.go, site.cursor);
        const field = FIELD_OF[task.kind];
        site = { ...site, tally: { ...site.tally, [field]: site.tally[field] + step.found } };
        site = step.isDone ? { ...site, task: site.task + 1, cursor: null } : { ...site, cursor: step.continueCursor };
        continue;
      }
      // The website done: its periods built again from what is left, the countries after all countries.
      if (args.go) await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.rebuildSitePeriods, { connectionId });
      lines.push(lineOf(site.host, site.countries, site.tally, args.go));
      tally = add(tally, site.tally);
      site = null;
      at += 1;
    }
    lines.push(`All ${tally.websites} websites with Search Console figures: ${tally.countries} countries read as all countries; `
      + `${tally.copies} country records and ${tally.seen} register rows ${args.go ? "removed" : "to remove"}; `
      + `${tally.addresses} records ${args.go ? "turned" : "to turn"} to page references; ${tally.imageDays} image days ${args.go ? "rolled up" : "to roll into weeks"}.`);
    for (const line of lines) console.log(`Search Console tidy${args.go ? "" : " (count only)"}: ${line}`);
    return { tally, lines };
  },
});
