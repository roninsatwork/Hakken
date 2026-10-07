import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isPageRef, turnKeptStep } from "./searchConsolePageRefs";
import { dropOldLinesOf } from "./searchConsoleRollups";
import { firstDayKeptFor } from "./utils/searchConsolePacks";
import { SEARCH_TYPES, searchTypeValidator } from "./searchConsoleSchema";
import { LISTS_OF } from "./searchConsoleApi";
import { keptSearchesOf } from "./searchConsoleKeep";

/**
 * Search Console's figures kept before 2026-10-05 brought to what is kept
 * from then (docs/plans/active/finish-off-plan.md, items 2 and 12), on every
 * website on the platform with figures kept:
 *
 * - a country nearly all of a website's searches loses its own search-and-page
 *   lines and its first- and last-seen register (2B: read from all countries'),
 * - every page address kept becomes a reference (2A),
 * - image search's days before this week go into their weeks (2C),
 * - Google Images' searches go (round two, A), and New and lost's register
 *   for any but web search, all countries (round two, F),
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
  imageSearches: v.number(),
  register: v.number(),
  unkept: v.number(),
});
type Tally = typeof tallyValidator.type;
const NO_TALLY: Tally = { websites: 0, countries: 0, copies: 0, seen: 0, addresses: 0, imageDays: 0, imageSearches: 0, register: 0, unkept: 0 };

const taskValidator = v.object({
  kind: v.union(
    v.literal("copies"), v.literal("seen"), v.literal("addresses"), v.literal("images"), v.literal("imageSearches"), v.literal("imageSeen"),
    v.literal("register"), v.literal("registerDays"), v.literal("unkept"), v.literal("unkeptSeen"),
  ),
  country: v.optional(v.string()),
  /** The kind of result a register task clears, for all countries. */
  searchType: v.optional(searchTypeValidator),
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
    // No country is read as all countries since 2026-10-06, when all countries stopped being kept
    // (search-console-home-countries-plan.md): none has search-and-page lines to remove.
    const countries: string[] = [];
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

/**
 * One step through a website's Google Images searches for all countries or
 * one, no longer kept (store less round two, A): its search-and-page lines
 * counted, and removed when going ahead.
 */
export const imageSearchesStep = internalMutation({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), go: v.boolean(), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", "image").eq("list", "pair"))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    if (args.go) for (const record of page.page) await ctx.db.delete(record._id);
    return { found: page.page.length, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** One step through a website's first- and last-seen Google Images searches for all countries or one: counted, and removed when going ahead. */
export const imageSeenStep = internalMutation({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), go: v.boolean(), cursor: v.union(v.string(), v.null()) },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleSeen")
      .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", "image").eq("kind", "query"))
      .paginate({ cursor: args.cursor, numItems: SEEN_PER_STEP });
    if (args.go) for (const row of page.page) await ctx.db.delete(row._id);
    return { found: page.page.length, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * One step through a website's first- and last-seen register, or its days,
 * no longer kept (store less round two, F — New and lost is kept for web
 * search, all countries): one country's whole, or one other kind of result's
 * for all countries. Counted, and removed when going ahead.
 */
export const registerStep = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: v.optional(searchTypeValidator),
    days: v.boolean(),
    go: v.boolean(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: stepValidator,
  handler: async (ctx, args) => {
    const paging = { cursor: args.cursor, numItems: SEEN_PER_STEP };
    const page = args.days
      ? await ctx.db
        .query("searchConsoleSeenDays")
        .withIndex("by_hold_country_type_kind_day", (q) => (args.country !== undefined
          ? q.eq("companyWebsiteId", args.holdId).eq("country", args.country)
          : q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", args.searchType)))
        .paginate(paging)
      : await ctx.db
        .query("searchConsoleSeen")
        .withIndex("by_hold_country_type_kind_key", (q) => (args.country !== undefined
          ? q.eq("companyWebsiteId", args.holdId).eq("country", args.country)
          : q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", args.searchType)))
        .paginate(paging);
    if (args.go) for (const row of page.page) await ctx.db.delete(row._id);
    return { found: page.page.length, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A few of a kind of result's search-and-page records, for all countries or one, as kept. */
export const pairRecordsPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator, cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    records: v.array(v.object({
      recordId: v.id("searchConsoleLists"),
      keys: v.array(v.string()),
      pages: v.optional(v.array(v.string())),
      clicks: v.array(v.number()),
      impressions: v.array(v.number()),
      positionSums: v.array(v.number()),
    })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", args.searchType).eq("list", "pair"))
      .paginate({ cursor: args.cursor, numItems: 3 });
    return {
      records: page.page.map((record) => ({
        recordId: record._id,
        keys: record.keys,
        ...(record.pages ? { pages: record.pages } : {}),
        clicks: record.clicks,
        impressions: record.impressions,
        positionSums: record.positionSums,
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** A kept search-and-page record with only its kept lines; removed when none is left. */
export const keepRecordLines = internalMutation({
  args: { recordId: v.id("searchConsoleLists"), lines: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) return null;
    if (args.lines.length === 0) {
      await ctx.db.delete(record._id);
      return null;
    }
    const pick = <T,>(values: readonly T[]) => args.lines.map((line) => values[line]);
    await ctx.db.patch(record._id, {
      keys: pick(record.keys),
      ...(record.pages ? { pages: pick(record.pages) } : {}),
      clicks: pick(record.clicks),
      impressions: pick(record.impressions),
      positionSums: pick(record.positionSums),
    });
    return null;
  },
});

/** A page of web search's first- and last-seen searches, all countries: their keys, to keep only the searches kept. */
export const registerSearchesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(v.object({ id: v.id("searchConsoleSeen"), key: v.string() })), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleSeen")
      .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", undefined).eq("kind", "query"))
      .paginate({ cursor: args.cursor, numItems: SEEN_PER_STEP });
    return { rows: page.page.map((row) => ({ id: row._id, key: row.key })), continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** First- and last-seen searches removed, by id: those no longer kept. */
export const removeRegisterRows = internalMutation({
  args: { ids: v.array(v.id("searchConsoleSeen")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.ids) if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
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
  // What is no longer kept goes before the addresses are turned, so none is turned only to go.
  const all = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  for (const country of [undefined, ...(all?.countries ?? [])]) {
    tasks.push({ kind: "imageSearches", ...(country === undefined ? {} : { country }) }, { kind: "imageSeen", ...(country === undefined ? {} : { country }) });
  }
  // New and lost is kept for web search, in every home country since 2026-10-06
  // (search-console-home-countries-plan.md): each other kind's register goes, never a country's.
  for (const searchType of SEARCH_TYPES.filter((type) => type !== "web")) tasks.push({ kind: "register", searchType }, { kind: "registerDays", searchType });
  // Only the searches kept (round two, D): each kind of result with searches, for all countries and each country; then the register.
  for (const country of [undefined, ...(all?.countries ?? [])]) {
    for (const searchType of SEARCH_TYPES.filter((type) => LISTS_OF[type].includes("pair"))) {
      tasks.push({ kind: "unkept", searchType, ...(country === undefined ? {} : { country }) });
    }
  }
  tasks.push({ kind: "unkeptSeen", searchType: "web" });
  tasks.push({ kind: "addresses" });
  // Image search's days are no longer rolled into weeks: it is neither kept nor shown since
  // 2026-10-06, and what is left of it goes when the website switches to its main country.
  return tasks;
}

/** One step of a task: what it found, and where to go on. */
async function stepOf(ctx: ActionCtx, holdId: Id<"companyWebsites">, task: Task, go: boolean, cursor: string | null, known: Map<string, string>, keeps: Map<string, Set<string> & { judged?: boolean }>): Promise<Step> {
  if (task.kind === "unkept" || task.kind === "unkeptSeen") {
    const searchType = task.searchType ?? "web";
    const which = `${task.country ?? ""}|${searchType}`;
    const keep: Set<string> & { judged?: boolean } = keeps.get(which) ?? await keptSearchesOf(ctx, holdId, task.country, searchType);
    keeps.set(which, keep);
    // Its 90 days not built yet: nothing to judge by, so nothing is removed.
    if (!keep.judged) return { found: 0, continueCursor: "", isDone: true };
    if (task.kind === "unkeptSeen") {
      const page: { rows: Array<{ id: Id<"searchConsoleSeen">; key: string }>; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.searchConsoleTidy.registerSearchesPart, { holdId, cursor });
      const gone = page.rows.filter((row) => !keep.has(row.key)).map((row) => row.id);
      if (go && gone.length > 0) await ctx.runMutation(internal.searchConsoleTidy.removeRegisterRows, { ids: gone });
      return { found: gone.length, continueCursor: page.continueCursor, isDone: page.isDone };
    }
    const page: { records: Array<{ recordId: Id<"searchConsoleLists">; keys: string[] }>; continueCursor: string; isDone: boolean } =
      await ctx.runQuery(internal.searchConsoleTidy.pairRecordsPart, { holdId, ...(task.country === undefined ? {} : { country: task.country }), searchType, cursor });
    let found = 0;
    for (const record of page.records) {
      const lines = record.keys.flatMap((key, line) => (keep.has(key) ? [line] : []));
      if (lines.length === record.keys.length) continue;
      found += record.keys.length - lines.length;
      if (go) await ctx.runMutation(internal.searchConsoleTidy.keepRecordLines, { recordId: record.recordId, lines });
    }
    return { found, continueCursor: page.continueCursor, isDone: page.isDone };
  }
  if (task.kind === "copies") return await ctx.runMutation(internal.searchConsoleTidy.countryCopiesStep, { holdId, country: task.country!, go, cursor });
  if (task.kind === "seen") return await ctx.runMutation(internal.searchConsoleTidy.countrySeenStep, { holdId, country: task.country!, go, cursor });
  if (task.kind === "addresses") {
    if (!go) return await ctx.runQuery(internal.searchConsoleTidy.addressesStep, { holdId, cursor });
    const step = await turnKeptStep(ctx, holdId, cursor, known);
    return { found: step.changed, continueCursor: step.continueCursor, isDone: step.isDone };
  }
  const scope = task.country === undefined ? {} : { country: task.country };
  if (task.kind === "imageSearches") return await ctx.runMutation(internal.searchConsoleTidy.imageSearchesStep, { holdId, ...scope, go, cursor });
  if (task.kind === "imageSeen") return await ctx.runMutation(internal.searchConsoleTidy.imageSeenStep, { holdId, ...scope, go, cursor });
  if (task.kind === "register" || task.kind === "registerDays") {
    return await ctx.runMutation(internal.searchConsoleTidy.registerStep, {
      holdId, ...scope, ...(task.searchType ? { searchType: task.searchType } : {}), days: task.kind === "registerDays", go, cursor,
    });
  }
  if (!go) return await ctx.runQuery(internal.searchConsoleTidy.imageDaysStep, { holdId, ...scope, newest: task.newest!, cursor });
  // Every line past the days kept for the scope, in one go (keep-less-history-plan.md, part 3).
  const steps = await dropOldLinesOf(ctx, holdId, task.newest!, task.country);
  return { found: steps, continueCursor: "", isDone: true };
}

const FIELD_OF: Record<Task["kind"], keyof Tally> = {
  copies: "copies",
  seen: "seen",
  addresses: "addresses",
  images: "imageDays",
  imageSearches: "imageSearches",
  imageSeen: "imageSearches",
  register: "register",
  registerDays: "register",
  unkept: "unkept",
  unkeptSeen: "unkept",
};

/** What one website comes to, as a line of the report. */
function lineOf(host: string, countries: readonly string[], tally: Tally, go: boolean): string {
  const as = countries.length > 0 ? `${countries.join(", ")} read as all countries` : "no country read as all countries";
  const verb = go ? "removed" : "to remove";
  return `${host}: ${as}; ${tally.copies} country records and ${tally.seen} register rows ${verb}; `
    + `${tally.addresses} records ${go ? "turned" : "to turn"} to page references; ${tally.imageDays} image days ${go ? "rolled up (with any other roll-up due)" : "to roll into weeks"}; `
    + `${tally.imageSearches} Google Images search records and ${tally.register} New and lost records not kept ${verb}; `
    + `${tally.unkept} lines and register rows of searches not kept ${verb}.`;
}

const add = (one: Tally, two: Tally): Tally => ({
  websites: one.websites + two.websites,
  countries: one.countries + two.countries,
  copies: one.copies + two.copies,
  seen: one.seen + two.seen,
  addresses: one.addresses + two.addresses,
  imageDays: one.imageDays + two.imageDays,
  imageSearches: one.imageSearches + two.imageSearches,
  register: one.register + two.register,
  unkept: one.unkept + two.unkept,
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
    // The website's page references known so far: its pages repeat from record to record.
    let known = new Map<string, string>();
    // Each kind of result's searches kept, for all countries or one, read once a run (round two, D).
    let keeps = new Map<string, Set<string> & { judged?: boolean }>();
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
        const step = await stepOf(ctx, holdId, task, args.go, site.cursor, known, keeps);
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
      known = new Map();
      keeps = new Map();
      at += 1;
    }
    lines.push(`All ${tally.websites} websites with Search Console figures: ${tally.countries} countries read as all countries; `
      + `${tally.copies} country records and ${tally.seen} register rows ${args.go ? "removed" : "to remove"}; `
      + `${tally.addresses} records ${args.go ? "turned" : "to turn"} to page references; ${tally.imageDays} image days ${args.go ? "rolled up" : "to roll into weeks"}; `
      + `${tally.imageSearches} Google Images search records and ${tally.register} New and lost records not kept ${args.go ? "removed" : "to remove"}; `
      + `${tally.unkept} lines and register rows of searches not kept ${args.go ? "removed" : "to remove"}.`);
    for (const line of lines) console.log(`Search Console tidy${args.go ? "" : " (count only)"}: ${line}`);
    return { tally, lines };
  },
});

// ---------------------------------------------------------------------------
// How much a website's Search Console figures take up, before and after
// ---------------------------------------------------------------------------

const TABLES = [
  "searchConsoleLists",
  "searchConsolePeriods",
  "searchConsoleDays",
  "searchConsoleWeeks",
  "searchConsoleSeen",
  "searchConsoleSeenDays",
  "searchConsolePageRefs",
] as const;
type Table = (typeof TABLES)[number];
/** Large packed records are read a few at a time; small rows many. */
const SIZE_PAGE: Record<Table, number> = {
  searchConsoleLists: 8,
  searchConsolePeriods: 8,
  searchConsoleDays: 2_000,
  searchConsoleWeeks: 2_000,
  searchConsoleSeen: 2_000,
  searchConsoleSeenDays: 2_000,
  searchConsolePageRefs: 2_000,
};

const bucketValidator = v.object({ name: v.string(), records: v.number(), bytes: v.number() });
type Bucket = typeof bucketValidator.type;

/** Which part of the kept lists a record is: the parts this tidy changes are shown apart. */
function listBucket(record: { country?: string; searchType: string; list: string }): string {
  if (record.country !== undefined && (record.list === "pair" || record.list === "page")) return "searchConsoleLists: a kept country's searches and pages";
  if (record.searchType === "image") return "searchConsoleLists: image search";
  // Held without a country: the main home country's since 2026-10-06 (search-console-home-countries-plan.md).
  if (record.list === "pair" || record.list === "page") return "searchConsoleLists: searches and pages, the main country";
  return "searchConsoleLists: the rest";
}

/** Which of the ready-made periods a record is, for a closer look at the largest table. */
function periodBucket(record: { country?: string; searchType: string; list: string; period: string; which: string }): string {
  return `searchConsolePeriods: ${record.list}, ${record.period} days${record.which === "BEFORE" ? " (the period before)" : ""}${record.country ? `, ${record.country}` : ""}${record.searchType === "web" ? "" : `, ${record.searchType}`}`;
}

/** One page of a website's rows in one table: how many, and their size as stored, near enough. */
export const sizeStep = internalQuery({
  args: { holdId: v.id("companyWebsites"), table: v.union(...TABLES.map((table) => v.literal(table))), cursor: v.union(v.string(), v.null()), detail: v.optional(v.boolean()) },
  returns: v.object({ buckets: v.array(bucketValidator), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const paging = { cursor: args.cursor, numItems: SIZE_PAGE[args.table] };
    const hold = args.holdId;
    const page = args.table === "searchConsoleLists"
      ? await ctx.db.query("searchConsoleLists").withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
      : args.table === "searchConsolePeriods"
        ? await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
        : args.table === "searchConsoleDays"
          ? await ctx.db.query("searchConsoleDays").withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
          : args.table === "searchConsoleWeeks"
            ? await ctx.db.query("searchConsoleWeeks").withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
            : args.table === "searchConsoleSeen"
              ? await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
              : args.table === "searchConsoleSeenDays"
                ? await ctx.db.query("searchConsoleSeenDays").withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", hold)).paginate(paging)
                : await ctx.db.query("searchConsolePageRefs").withIndex("by_hold_ref", (q) => q.eq("companyWebsiteId", hold)).paginate(paging);
    const buckets = new Map<string, Bucket>();
    for (const row of page.page as Array<Record<string, unknown>>) {
      const name = args.table === "searchConsoleLists"
        ? listBucket(row as { country?: string; searchType: string; list: string })
        : args.table === "searchConsolePeriods" && args.detail
          ? periodBucket(row as { country?: string; searchType: string; list: string; period: string; which: string })
          : args.table;
      const bucket = buckets.get(name) ?? { name, records: 0, bytes: 0 };
      bucket.records += 1;
      bucket.bytes += JSON.stringify(row).length;
      buckets.set(name, bucket);
    }
    return { buckets: [...buckets.values()], continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A website's name, for the report. */
export const hostOfConnection = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const hold = connection ? await ctx.db.get(connection.companyWebsiteId) : null;
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    return website?.displayHost ?? website?.host ?? null;
  },
});

/** How long the measure reads before it says how far it got: an action stops at ten minutes. */
const SIZE_RUN_MS = 9 * 60 * 1000;

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * How much each website's Search Console figures take up, table by table —
 * or one website's, named by its host: run before the tidy and after it.
 * Sizes are each row as JSON, near enough what is stored.
 */
const sizeReportValidator = v.object({
  host: v.string(),
  complete: v.boolean(),
  totalBytes: v.number(),
  total: v.string(),
  buckets: v.array(v.object({ name: v.string(), records: v.number(), size: v.string() })),
});
type SizeReport = typeof sizeReportValidator.type;

export const keptSize = internalAction({
  /** `detail`: the ready-made periods shown list by list and period by period. */
  args: { host: v.optional(v.string()), detail: v.optional(v.boolean()) },
  returns: v.array(sizeReportValidator),
  handler: async (ctx, args): Promise<SizeReport[]> => {
    const started = Date.now();
    const report: SizeReport[] = [];
    const connections: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> = await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    for (const { connectionId, holdId } of connections) {
      const host: string | null = await ctx.runQuery(internal.searchConsoleTidy.hostOfConnection, { connectionId });
      if (!host || (args.host !== undefined && host !== args.host)) continue;
      const buckets = new Map<string, Bucket>();
      let complete = true;
      for (const table of TABLES) {
        for (let cursor: string | null = null; ;) {
          if (Date.now() - started > SIZE_RUN_MS) {
            complete = false;
            break;
          }
          const step: { buckets: Bucket[]; continueCursor: string; isDone: boolean } = await ctx.runQuery(internal.searchConsoleTidy.sizeStep, { holdId, table, cursor, detail: args.detail });
          for (const one of step.buckets) {
            const held = buckets.get(one.name) ?? { name: one.name, records: 0, bytes: 0 };
            buckets.set(one.name, { name: one.name, records: held.records + one.records, bytes: held.bytes + one.bytes });
          }
          if (step.isDone) break;
          cursor = step.continueCursor;
        }
      }
      const sorted = [...buckets.values()].sort((one, two) => two.bytes - one.bytes);
      const totalBytes = sorted.reduce((sum, one) => sum + one.bytes, 0);
      report.push({ host, complete, totalBytes, total: mb(totalBytes), buckets: sorted.map((one) => ({ name: one.name, records: one.records, size: mb(one.bytes) })) });
    }
    return report;
  },
});

// ---------------------------------------------------------------------------
// What keeping only a website's top searches would keep (a question, 2026-10-05)
// ---------------------------------------------------------------------------

/** One part of a website's 90-day searches, most clicks first: web, all countries. */
export const searchesPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ keys: v.array(v.string()), clicks: v.array(v.number()), impressions: v.array(v.number()), positionSums: v.array(v.number()), counts: v.array(v.number()), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "90").eq("which", "NOW"))
      .paginate({ cursor: args.cursor, numItems: 1 });
    const part = page.page[0];
    return { keys: part?.keys ?? [], clicks: part?.clicks ?? [], impressions: part?.impressions ?? [], positionSums: part?.positionSums ?? [], counts: part?.counts ?? [], continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A page of a website's kept web search-and-page lines: how many, and how many are for each cap's top searches. */
export const linesWithin = internalQuery({
  args: { holdId: v.id("companyWebsites"), top: v.array(v.string()), caps: v.array(v.number()), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ lines: v.number(), within: v.array(v.number()), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const rank = new Map(args.top.map((key, index) => [key, index]));
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", "web").eq("list", "pair"))
      .paginate({ cursor: args.cursor, numItems: RECORDS_PER_STEP });
    let lines = 0;
    const within = args.caps.map(() => 0);
    for (const record of page.page) {
      lines += record.keys.length;
      for (const key of record.keys) {
        const at = rank.get(key);
        if (at === undefined) continue;
        args.caps.forEach((cap, index) => {
          if (at < cap) within[index] += 1;
        });
      }
    }
    return { lines, within, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Anthony, 2026-10-05: "what would happen to the database size if we only
 * track 2,000 keywords … or even 1,000". For one website: how many searches
 * its last 90 days hold, what share of its clicks and showings the top ones
 * carry, and what share of its kept search-and-page lines they are.
 */
export const searchCapEstimate = internalAction({
  args: { host: v.string(), caps: v.array(v.number()) },
  returns: v.union(v.null(), v.object({
    searches: v.number(),
    clicked: v.number(),
    clicks: v.number(),
    impressions: v.number(),
    lines: v.number(),
    caps: v.array(v.object({ cap: v.number(), clicksShare: v.number(), impressionsShare: v.number(), linesShare: v.number() })),
  })),
  handler: async (ctx, args) => {
    const connections: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> = await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    let holdId: Id<"companyWebsites"> | null = null;
    for (const connection of connections) {
      const host: string | null = await ctx.runQuery(internal.searchConsoleTidy.hostOfConnection, { connectionId: connection.connectionId });
      if (host === args.host) holdId = connection.holdId;
    }
    if (!holdId) return null;
    const keys: string[] = [];
    const clicks: number[] = [];
    const impressions: number[] = [];
    for (let cursor: string | null = null; ;) {
      const part: { keys: string[]; clicks: number[]; impressions: number[]; positionSums: number[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.searchConsoleTidy.searchesPart, { holdId, cursor });
      keys.push(...part.keys);
      clicks.push(...part.clicks);
      impressions.push(...part.impressions);
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const top = keys.slice(0, Math.max(...args.caps));
    let lines = 0;
    const within = args.caps.map(() => 0);
    for (let cursor: string | null = null; ;) {
      const step: { lines: number; within: number[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.searchConsoleTidy.linesWithin, { holdId, top, caps: args.caps, cursor });
      lines += step.lines;
      step.within.forEach((count, index) => {
        within[index] += count;
      });
      if (step.isDone) break;
      cursor = step.continueCursor;
    }
    const share = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);
    return {
      searches: keys.length,
      clicked: clicks.filter((count) => count > 0).length,
      clicks: sum(clicks),
      impressions: sum(impressions),
      lines,
      caps: args.caps.map((cap, index) => ({
        cap,
        clicksShare: share(sum(clicks.slice(0, cap)), sum(clicks)),
        impressionsShare: share(sum(impressions.slice(0, cap)), sum(impressions)),
        linesShare: share(within[index], lines),
      })),
    };
  },
});

/** Searches passed to one read of the lines: a function's list argument holds at most 8,192. */
const KEYS_PER_PASS = 8_000;

/**
 * What "keep a search if it got a click, ranks in the top N, or is tracked"
 * would keep of one website's last 90 days (2026-10-05: keeping only clicked
 * searches would empty Almost there, which lists positions 4 to 20, mostly
 * not yet clicked). Each rule's searches, and their share of showings and of
 * the kept search-and-page lines.
 */
export const searchKeepEstimate = internalAction({
  /** `showings`: the rules kept by showings in the 90 days instead — at least each figure — rather than by position. */
  args: { host: v.string(), positions: v.array(v.number()), showings: v.optional(v.array(v.number())), competing: v.optional(v.boolean()) },
  returns: v.union(v.null(), v.object({
    searches: v.number(),
    lines: v.number(),
    rules: v.array(v.object({ rule: v.string(), searches: v.number(), impressionsShare: v.number(), linesShare: v.number() })),
  })),
  handler: async (ctx, args) => {
    const connections: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> = await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    let holdId: Id<"companyWebsites"> | null = null;
    for (const connection of connections) {
      const host: string | null = await ctx.runQuery(internal.searchConsoleTidy.hostOfConnection, { connectionId: connection.connectionId });
      if (host === args.host) holdId = connection.holdId;
    }
    if (!holdId) return null;
    const rows: Array<{ key: string; clicks: number; impressions: number; position: number; pages: number }> = [];
    for (let cursor: string | null = null; ;) {
      const part: { keys: string[]; clicks: number[]; impressions: number[]; positionSums: number[]; counts: number[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.searchConsoleTidy.searchesPart, { holdId, cursor });
      part.keys.forEach((key, index) => rows.push({
        pages: part.counts[index] ?? 1,
        key,
        clicks: part.clicks[index],
        impressions: part.impressions[index],
        position: part.impressions[index] > 0 ? part.positionSums[index] / part.impressions[index] : 999,
      }));
      if (part.isDone) break;
      cursor = part.continueCursor;
    }
    const tracked = new Set<string>(await ctx.runQuery(internal.searchConsoleKeep.trackedSearches, { holdId }));
    // Nested rules, the smallest first: each the one before and the searches ranking within its position.
    const byShowings = args.showings !== undefined;
    const positions = byShowings ? [...args.showings!].sort((one, two) => two - one) : [...args.positions].sort((one, two) => one - two);
    const levelOf = (row: (typeof rows)[number]) => {
      if (row.clicks > 0 || tracked.has(row.key) || (args.competing === true && row.pages >= 2)) return 0;
      const at = positions.findIndex((limit) => (byShowings ? row.impressions >= limit : row.position <= limit));
      return at === -1 ? Infinity : at + 1;
    };
    const ordered = [...rows].sort((one, two) => levelOf(one) - levelOf(two));
    const caps = [0, ...positions].map((_, level) => ordered.filter((row) => levelOf(row) <= level).length);
    let lines = 0;
    const within = caps.map(() => 0);
    const top = ordered.slice(0, Math.max(...caps));
    // A function's list argument holds at most 8,192: the searches go a few thousand at a time, each a whole pass.
    for (let from = 0; from < top.length; from += KEYS_PER_PASS) {
      const chunk = top.slice(from, from + KEYS_PER_PASS);
      // Within this chunk, each cap is how many of its searches that rule keeps.
      const chunkCaps = caps.map((cap) => Math.max(0, Math.min(cap - from, chunk.length)));
      let passLines = 0;
      for (let cursor: string | null = null; ;) {
        const step: { lines: number; within: number[]; continueCursor: string; isDone: boolean } =
          await ctx.runQuery(internal.searchConsoleTidy.linesWithin, { holdId, top: chunk.map((row) => row.key), caps: chunkCaps, cursor });
        passLines += step.lines;
        step.within.forEach((count, index) => {
          within[index] += count;
        });
        if (step.isDone) break;
        cursor = step.continueCursor;
      }
      lines = passLines;
    }
    const all = rows.reduce((sum, row) => sum + row.impressions, 0);
    const share = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);
    return {
      searches: rows.length,
      lines,
      rules: caps.map((cap, level) => ({
        rule: level === 0 ? (args.competing ? "clicked, tracked or two pages or more" : "clicked or tracked") : byShowings ? `clicked, tracked or shown ${positions[level - 1]}+ times` : `clicked, tracked or in the top ${positions[level - 1]}`,
        searches: cap,
        impressionsShare: share(ordered.slice(0, cap).reduce((sum, row) => sum + row.impressions, 0), all),
        linesShare: share(within[level], lines),
      })),
    };
  },
});
