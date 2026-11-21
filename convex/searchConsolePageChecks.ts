import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { bookStep, chainGoing, stepKey } from "./collectionSteps";
import { accessTokenFor } from "./searchConsoleConnect";
import { callGoogle } from "./googleApi";
import { yourPagesCount } from "./yourPages";
import { isTrackedHold } from "./utils/websitePairing";
import { memoryNow } from "./utils/stepMemory";
import {
  CHECKS_AT_ONCE,
  CHECKS_A_STEP,
  CHECKS_SAVED_EVERY,
  DAILY_CHECKS,
  DAYS_KEPT,
  INSPECT_URL,
  checkFrom,
  countsMoved,
  dayAfter,
  googleDay,
  googleDayStart,
  hostOf,
  refusalOf,
  type CheckFound,
} from "./utils/pageIndexChecks";

/**
 * Search Console's page checks (search-console-indexing-v1-plan-2026-11-18.md, "Reads, and the new collector"): each
 * page of a company's own website asked of Google's URL inspection, one at a time, as Google gives apps no Page
 * indexing totals. What Indexing reads.
 *
 * **Which pages, in what order.** Every page the website's own list knows (`holdPages`: what Google shows in Search
 * Console, the sitemap and the crawl). Pages never checked come first, most clicks first; then the sitemap's and the
 * crawl's pages Google never showed; then the page checked longest ago, once every page has an answer. A page checked
 * today waits for tomorrow.
 *
 * **How many.** Up to 1,600 a day for each website (`DAILY_CHECKS`), a fifth of Google's 2,000 kept in hand, four at
 * once. The day is Google's own (Pacific time), when its allowance comes back.
 *
 * **When.** After each website's nightly Search Console run (`afterDays`, `searchConsoleAgentRun.ts`), as a watched
 * chain of steps that hands itself on (`collectionSteps.ts`), as the collector's other work does: nothing waits on a
 * person. Only where `SEARCH_CONSOLE_PAGE_CHECKS` says so: `on` for every website, or the websites' ids, comma
 * separated. Until it's set, nothing asks Google.
 *
 * **A refusal.** Google's allowance used up stops the day, and the next night's run starts it again. A sign-in that's
 * no good stops it too, as the connection says. A page Google fails on waits its turn; a whole round of four failing
 * stops the day. Nothing is asked again in a loop.
 */

/** The time a step may take before handing on: well inside an action's ten minutes. */
const STEP_BUDGET_MS = 4 * 60 * 1000;
/** The website's own list read a piece at a time to find pages not checked yet. */
const SCAN_PIECE = 100;
/** Days of counts kept for each website (`utils/pageIndexChecks.ts`, where the screen reads it too). */
export { DAYS_KEPT };

export const phaseValidator = v.union(v.literal("SHOWN"), v.literal("UNSHOWN"), v.literal("OLDEST"));
export type CheckPhase = Infer<typeof phaseValidator>;
const stopValidator = v.union(v.literal("ALLOWANCE"), v.literal("SIGN_IN"), v.literal("BUSY"));
type Stop = Infer<typeof stopValidator>;

/** A website's page checks' watched chain: one a connection. */
export function checksStepKey(connectionId: Id<"searchConsoleConnections">): string {
  return stepKey("SC_CHECKS", connectionId);
}

/** Whether the checks may ask Google for this website: `SEARCH_CONSOLE_PAGE_CHECKS` is `on`, or names it. */
export function pageChecksOnFor(holdId: string, setting: string | undefined = process.env.SEARCH_CONSOLE_PAGE_CHECKS): boolean {
  const value = (setting ?? "").trim();
  if (!value) return false;
  if (value === "on" || value === "all") return true;
  return value.split(",").map((one) => one.trim()).includes(holdId);
}

/**
 * The address the website really uses, for asking Google about its pages: a web-address property's own, else the one
 * most of the pages Google showed lately were on (the www twin, where Google shows that: morehandles.co.uk's checks
 * asked without it and read every main page as not in Google), else the website's own address.
 */
export async function usedOrigin(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">, property: string | null): Promise<string> {
  if (property && /^https?:\/\//i.test(property)) return property.replace(/\/+$/, "");
  const shown = await ctx.db
    .query("searchConsoleSeen")
    .withIndex("by_hold_country_type_kind_last", (q) => q.eq("companyWebsiteId", hold._id).eq("country", undefined).eq("searchType", undefined).eq("kind", "page"))
    .order("desc")
    .take(ORIGIN_SAMPLE);
  const counted = new Map<string, number>();
  for (const entry of shown) {
    const origin = /^https?:\/\/[^/?#]+/i.exec(entry.key)?.[0]?.toLowerCase();
    if (origin) counted.set(origin, (counted.get(origin) ?? 0) + 1);
  }
  const most = [...counted].sort((left, right) => right[1] - left[1])[0];
  if (most) return most[0];
  const website = await ctx.db.get(hold.websiteId);
  return `https://${(website?.displayHost ?? website?.host ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
}
/** The newest pages Google showed, read to find the address most are on. */
const ORIGIN_SAMPLE = 100;

/** A website's connection fit to check pages for: connected, not clearing, a property chosen, a website of the company's own. */
async function checkableConnection(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">) {
  const hold = await ctx.db.get(holdId);
  if (!hold || isTrackedHold(hold)) return null;
  const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  if (!connection || connection.status !== "CONNECTED" || connection.clearing || !connection.property) return null;
  return { hold, connection, property: connection.property };
}

async function dayRowOf(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, day: string) {
  return await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).eq("day", day)).unique();
}

const startedValidator = v.union(v.literal("STARTED"), v.literal("OFF"), v.literal("NOT_CONNECTED"), v.literal("GOING"), v.literal("DONE_TODAY"));

/** The day's checks started for one website, unless they're off, going already, or done for Google's day. */
export async function startChecks(ctx: MutationCtx, holdId: Id<"companyWebsites">, now = Date.now()): Promise<Infer<typeof startedValidator>> {
  if (!pageChecksOnFor(holdId)) return "OFF";
  const target = await checkableConnection(ctx, holdId);
  if (!target) return "NOT_CONNECTED";
  const key = checksStepKey(target.connection._id);
  if (await chainGoing(ctx, key, now)) return "GOING";
  const day = googleDay(now);
  const today = await dayRowOf(ctx, holdId, day);
  if (today && (today.asked >= DAILY_CHECKS || today.stopped)) return "DONE_TODAY";
  await bookStep(ctx, { key, chain: "SC_CHECKS", args: { holdId, connectionId: target.connection._id, day, phase: "SHOWN", cursor: null }, place: "the pages with most clicks" });
  return "STARTED";
}

/**
 * Start the day's page checks for a website: after its nightly run, or by hand
 * (`npx convex run searchConsolePageChecks:startPageChecks '{"siteId":"…"}'`). Asks Google nothing itself.
 */
export const startPageChecks = internalMutation({
  args: { siteId: v.optional(v.id("companyWebsites")), connectionId: v.optional(v.id("searchConsoleConnections")) },
  returns: startedValidator,
  handler: async (ctx, args) => {
    const holdId = args.siteId ?? (args.connectionId ? (await ctx.db.get(args.connectionId))?.companyWebsiteId : undefined);
    if (!holdId) return "NOT_CONNECTED";
    return await startChecks(ctx, holdId);
  },
});

/** What a step needs: the property, the address to ask on, the day's asks so far and whether it stopped, and the pages known. */
export const checkTarget = internalQuery({
  args: { holdId: v.id("companyWebsites"), day: v.string() },
  returns: v.union(v.null(), v.object({
    property: v.string(),
    origin: v.string(),
    asked: v.number(),
    stopped: v.union(stopValidator, v.null()),
    known: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const target = await checkableConnection(ctx, args.holdId);
    if (!target) return null;
    const today = await dayRowOf(ctx, args.holdId, args.day);
    return {
      property: target.property,
      origin: await usedOrigin(ctx, target.hold, target.property),
      asked: today?.asked ?? 0,
      stopped: today?.stopped ?? null,
      known: await yourPagesCount(ctx, args.holdId),
    };
  },
});

/**
 * A page to ask about: its title, and whether the website's own sitemap lists it (`holdPages.sitemapFile`), which its
 * check keeps beside Google's own word for it. Google knows no sitemap for a page it has never heard of ("URL is
 * unknown to Google"), so its answer alone would say none of those is in the sitemap (18 November 2026).
 */
const pageToCheck = v.object({ page: v.string(), title: v.union(v.string(), v.null()), sitemap: v.boolean() });

/**
 * The next pages to ask about, in the plan's order, a piece of the website's own list at a time: those never checked
 * that Google shows, most clicks first; then those it never showed; then the ones checked longest ago, before today.
 * A page checked whose page the list no longer holds goes (`gone`). One read of the list a call: the step calls again.
 */
export const pagesToCheck = internalQuery({
  args: { holdId: v.id("companyWebsites"), phase: phaseValidator, cursor: v.union(v.string(), v.null()), want: v.number(), before: v.number() },
  returns: v.object({
    pages: v.array(pageToCheck),
    gone: v.array(v.id("pageIndexChecks")),
    phase: phaseValidator,
    cursor: v.union(v.string(), v.null()),
    /** Every page has an answer from today: nothing more to ask until tomorrow. */
    finished: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.phase === "OLDEST") {
      const oldest = await ctx.db
        .query("pageIndexChecks")
        .withIndex("by_hold_checked", (q) => q.eq("companyWebsiteId", args.holdId).lt("checkedAt", args.before))
        .take(Math.max(1, args.want));
      const listed = (await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId)).first()) !== null;
      const pages: Array<Infer<typeof pageToCheck>> = [];
      const gone: Array<Id<"pageIndexChecks">> = [];
      for (const check of oldest) {
        const held = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId).eq("page", check.page)).first();
        // A list not built yet keeps every check: only a page a built list leaves out has gone.
        if (held) pages.push({ page: held.page, title: held.title ?? null, sitemap: held.sitemapFile !== undefined });
        else if (listed) gone.push(check._id);
        else pages.push({ page: check.page, title: check.title ?? null, sitemap: false });
      }
      return { pages, gone, phase: "OLDEST" as const, cursor: null, finished: oldest.length < Math.max(1, args.want) };
    }
    const piece = await ctx.db
      .query("holdPages")
      .withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", args.holdId))
      .order("desc")
      .paginate({ cursor: args.cursor, numItems: SCAN_PIECE });
    const wanted = args.phase === "SHOWN";
    const pages: Array<Infer<typeof pageToCheck>> = [];
    for (const row of piece.page) {
      if (row.shown !== wanted) continue;
      const held = await ctx.db.query("pageIndexChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId).eq("page", row.page)).first();
      if (!held) pages.push({ page: row.page, title: row.title ?? null, sitemap: row.sitemapFile !== undefined });
    }
    if (!piece.isDone) return { pages, gone: [], phase: args.phase, cursor: piece.continueCursor, finished: false };
    return { pages, gone: [], phase: wanted ? ("UNSHOWN" as const) : ("OLDEST" as const), cursor: null, finished: false };
  },
});

const foundValidator = v.object({
  reason: v.union(v.string(), v.null()),
  verdict: v.union(v.string(), v.null()),
  indexed: v.boolean(),
  crawled: v.union(v.string(), v.null()),
  googleCanonical: v.union(v.string(), v.null()),
  userCanonical: v.union(v.string(), v.null()),
  inSitemap: v.boolean(),
  linkedOwn: v.boolean(),
});
const checkedRow = v.object({
  page: v.string(),
  address: v.string(),
  title: v.union(v.string(), v.null()),
  found: v.union(foundValidator, v.null()),
  /** Why Google gave no answer, when it gave none. */
  problem: v.optional(v.union(v.literal("GOOGLE_ERROR"), v.literal("REFUSED"))),
});
type CheckedRow = Infer<typeof checkedRow>;

/** The day's row for a website, made from the newest before it where it has none yet: the counts carry over. Older days past those kept go. */
async function dayRowFor(ctx: MutationCtx, holdId: Id<"companyWebsites">, day: string, known: number | null, now: number): Promise<Doc<"pageIndexDays">> {
  const held = await dayRowOf(ctx, holdId, day);
  if (held) return held;
  const last = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).lt("day", day)).order("desc").first();
  const id = await ctx.db.insert("pageIndexDays", {
    companyWebsiteId: holdId,
    day,
    reasons: last?.reasons ?? [],
    indexed: last?.indexed ?? 0,
    known: known ?? last?.known ?? 0,
    asked: 0,
    failed: 0,
    updatedAt: now,
  });
  await clearOldDays(ctx, holdId, day);
  return (await ctx.db.get(id))!;
}

/** A website's days of counts older than those kept go, a few at a time, as each new day starts (`keepRules.ts`). */
export async function clearOldDays(ctx: MutationCtx, holdId: Id<"companyWebsites">, today: string): Promise<void> {
  const old = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).lt("day", dayAfter(today, -DAYS_KEPT))).take(10);
  for (const row of old) await ctx.db.delete(row._id);
}

/**
 * The checks a step made, kept: each page's row replaced, Google's counts for each reason moved with it, pages no
 * longer on the website's list gone, and the day's asks noted. A page Google gave no answer for keeps its last answer,
 * moved to the back of the queue. Dropped if the connection changed while the step ran: two properties' answers are
 * never mixed. Says the day's asks so far, whoever made them (`countOtherAsks`), or null when dropped.
 */
export const saveChecks = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    property: v.string(),
    day: v.string(),
    known: v.union(v.number(), v.null()),
    rows: v.array(checkedRow),
    gone: v.array(v.id("pageIndexChecks")),
    asked: v.number(),
    failed: v.number(),
    stopped: v.optional(stopValidator),
  },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const target = await checkableConnection(ctx, args.holdId);
    if (!target || target.property !== args.property) return null;
    const now = Date.now();
    const today = await dayRowFor(ctx, args.holdId, args.day, args.known, now);
    let counts: { reasons: Array<{ reason: string; pages: number }>; indexed: number } = { reasons: today.reasons, indexed: today.indexed };
    for (const row of args.rows) counts = await keepCheck(ctx, args.holdId, row, counts, now);
    for (const id of args.gone) {
      const check = await ctx.db.get(id);
      if (!check || check.companyWebsiteId !== args.holdId) continue;
      counts = countsMoved(counts, check.problem ? null : check, null);
      await ctx.db.delete(id);
    }
    await ctx.db.patch(today._id, {
      reasons: counts.reasons,
      indexed: counts.indexed,
      ...(args.known !== null ? { known: args.known } : {}),
      asked: today.asked + args.asked,
      failed: today.failed + args.failed,
      ...(args.stopped ? { stopped: args.stopped } : {}),
      updatedAt: now,
    });
    return today.asked + args.asked;
  },
});

/**
 * Asks of Google's URL inspection made for the website outside these checks, counted on Google's day as theirs are, so
 * the day's limit keeps a fifth of Google's 2,000 in hand whoever asked (review fixes, 18 November 2026): the weekly
 * money-page checks (`moneyPageChecks.ts`) ask the same inspection for the same property, up to 12 pages. Today's row is
 * made from the newest before it, as the checks' own first save makes it. A website whose checks have never begun has
 * no row to count on, and none is made: a row of nothing would read on Indexing as every page checked. Those asks are
 * at most 12 a week, well inside the 400 kept in hand.
 */
export async function countOtherAsks(ctx: MutationCtx, holdId: Id<"companyWebsites">, day: string, asked: number, failed: number, now = Date.now()): Promise<boolean> {
  if (asked <= 0) return false;
  if (!(await dayRowOf(ctx, holdId, day))) {
    const begun = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId).lt("day", day)).first();
    if (!begun) return false;
  }
  const today = await dayRowFor(ctx, holdId, day, null, now);
  await ctx.db.patch(today._id, { asked: today.asked + asked, failed: today.failed + failed, updatedAt: now });
  return true;
}

/**
 * The checks saved before 18 November 2026 brought in line once with the website's own sitemap: each check's "in the
 * sitemap" is Google's word or the website's own list's (`holdPages.sitemapFile`), as the checks keep it since. A piece
 * at a time, by the check's page: run again with the cursor until done
 * (`npx convex run searchConsolePageChecks:alignSitemapChecks '{"siteId":"…"}'`). Asks Google nothing.
 */
export const alignSitemapChecks = internalMutation({
  args: { siteId: v.id("companyWebsites"), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ read: v.number(), changed: v.number(), cursor: v.union(v.string(), v.null()), done: v.boolean() }),
  handler: async (ctx, args) => {
    const piece = await ctx.db
      .query("pageIndexChecks")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.siteId))
      .paginate({ cursor: args.cursor ?? null, numItems: ALIGN_PIECE });
    let changed = 0;
    for (const check of piece.page) {
      if (check.inSitemap) continue;
      const own = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.siteId).eq("page", check.page)).first();
      if (own?.sitemapFile === undefined) continue;
      await ctx.db.patch(check._id, { inSitemap: true });
      changed += 1;
    }
    return { read: piece.page.length, changed, cursor: piece.isDone ? null : piece.continueCursor, done: piece.isDone };
  },
});
/** Checks read in one call of `alignSitemapChecks`: two reads each, well inside a mutation's limits. */
const ALIGN_PIECE = 500;

/** One page's check kept, and the counts moved with it. */
async function keepCheck(ctx: MutationCtx, holdId: Id<"companyWebsites">, row: CheckedRow, counts: { reasons: Array<{ reason: string; pages: number }>; indexed: number }, now: number) {
  const held = await ctx.db.query("pageIndexChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId).eq("page", row.page)).first();
  if (!row.found) {
    // No answer: its last answer stands, at the back of the queue.
    if (held) await ctx.db.patch(held._id, { checkedAt: now });
    else {
      await ctx.db.insert("pageIndexChecks", {
        companyWebsiteId: holdId, page: row.page, address: row.address, ...(row.title ? { title: row.title } : {}),
        reason: null, verdict: null, indexed: false, crawled: null, googleCanonical: null, userCanonical: null, inSitemap: false, linkedOwn: false,
        problem: row.problem ?? "GOOGLE_ERROR", checkedAt: now,
      });
    }
    return counts;
  }
  const record = { companyWebsiteId: holdId, page: row.page, address: row.address, ...(row.title ? { title: row.title } : {}), ...row.found, checkedAt: now };
  const moved = countsMoved(counts, held && !held.problem ? held : null, row.found);
  if (held) await ctx.db.replace(held._id, record);
  else await ctx.db.insert("pageIndexChecks", record);
  return moved;
}

export const checkStepArgs = {
  holdId: v.id("companyWebsites"),
  connectionId: v.id("searchConsoleConnections"),
  /** Google's day the chain checks for: a step started on another day stops, and that night's run starts its own. */
  day: v.string(),
  phase: phaseValidator,
  cursor: v.union(v.string(), v.null()),
  booking: v.optional(v.number()),
  closeOnly: v.optional(v.boolean()),
};

/** One step of a website's day of page checks, watched: up to 400 pages, four at once, then it hands on. */
export const checkPagesStep = internalAction({
  args: checkStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => await checkPagesStepHandler(ctx, args),
});

type StepArgs = { holdId: Id<"companyWebsites">; connectionId: Id<"searchConsoleConnections">; day: string; phase: CheckPhase; cursor: string | null; booking?: number; closeOnly?: boolean };

/** Asks Google about one page: its answer, or what its refusal means. */
type Asked = { ok: true; found: CheckFound | null } | { ok: false; refusal: ReturnType<typeof refusalOf> };

export async function checkPagesStepHandler(ctx: ActionCtx, args: StepArgs): Promise<null> {
  const { booking, closeOnly, ...place } = args;
  const key = checksStepKey(args.connectionId);
  const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(booking !== undefined ? { booking } : {}) });
  if (!begun.go) return null;
  const close = async () => {
    await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key, ...(booking !== undefined ? { booking } : {}) });
  };
  const started = Date.now();
  if (closeOnly || googleDay(started) !== args.day) {
    await close();
    return null;
  }
  const target = await ctx.runQuery(internal.searchConsolePageChecks.checkTarget, { holdId: args.holdId, day: args.day });
  if (!target || target.stopped || target.asked >= DAILY_CHECKS) {
    await close();
    return null;
  }
  const ownHost = hostOf(target.origin) ?? "";
  // The day's asks once saved, or null when the connection changed meanwhile.
  const save = async (rows: CheckedRow[], gone: Array<Id<"pageIndexChecks">>, asked: number, failed: number, stopped?: Stop): Promise<number | null> => {
    if (rows.length === 0 && gone.length === 0 && asked === 0 && !stopped) return target.asked;
    return await ctx.runMutation(internal.searchConsolePageChecks.saveChecks, {
      holdId: args.holdId, property: target.property, day: args.day, known: target.known, rows, gone, asked, failed, ...(stopped ? { stopped } : {}),
    });
  };
  let token = await accessTokenFor(ctx, args.connectionId);
  if (!token.ok) {
    await save([], [], 0, 0, token.problem === "GOOGLE_BUSY" ? "BUSY" : "SIGN_IN");
    await close();
    return null;
  }
  // A token that ran out is renewed once a step, and every page asked with the old one asked again with the new. The
  // pages are asked a few at once, so when the hour's token runs out they all hear so together: each waits for the one
  // renewal rather than stop the day. Until 21 November 2026 only the first was asked again, and the rest stopped the
  // day as a sign-in problem — More Handles' checks stopped so after 388 pages on 19 November and 1,545 on the 20th
  // (search-console-and-analytics-data-plan-2026-11-21.md, fix 5).
  let renewing: Promise<Awaited<ReturnType<typeof accessTokenFor>>> | null = null;
  const ask = async (address: string): Promise<Asked> => {
    let retried = false;
    for (;;) {
      if (!token.ok) return { ok: false, refusal: "SIGN_IN" };
      const used = token;
      const answer = await callGoogle(INSPECT_URL, used.accessToken, { inspectionUrl: address, siteUrl: target.property, languageCode: "en-US" });
      if (answer.ok) return { ok: true, found: checkFrom(answer.json, ownHost) };
      if (answer.reason === "EXPIRED" && !retried) {
        retried = true;
        renewing ??= accessTokenFor(ctx, args.connectionId, true).then((fresh) => (token = fresh));
        await renewing;
        continue;
      }
      return { ok: false, refusal: refusalOf(answer) };
    }
  };

  let asked = target.asked;
  let checked = 0;
  let at: { phase: CheckPhase; cursor: string | null } = { phase: place.phase, cursor: place.cursor };
  // A piece of the website's list holds up to 100 pages to ask about, whatever `want` says: they're asked and saved
  // `CHECKS_SAVED_EVERY` at a time, so a step that dies loses at most that many asks (review fixes, 18 November 2026: on
  // dev the count rose in jumps of 100). Until the piece is done, a step handing on starts the next at the piece's own
  // place (`pieceAt`): its pages checked meanwhile are passed over there, as every page with a check is.
  let waiting: Array<Infer<typeof pageToCheck>> = [];
  let pieceAt = at;
  let gone: Array<Id<"pageIndexChecks">> = [];
  const before = googleDayStart(started);
  for (;;) {
    if (asked >= DAILY_CHECKS) break;
    if (checked >= CHECKS_A_STEP || Date.now() - started > STEP_BUDGET_MS) {
      const from = waiting.length > 0 ? pieceAt : at;
      await ctx.runMutation(internal.collectionSteps.handOn, {
        ...memoryNow(), key, chain: "SC_CHECKS", args: { ...place, phase: from.phase, cursor: from.cursor }, place: placeWords(from.phase), ...(booking !== undefined ? { from: booking } : {}),
      });
      return null;
    }
    if (waiting.length === 0) {
      const next = await ctx.runQuery(internal.searchConsolePageChecks.pagesToCheck, { holdId: args.holdId, ...at, want: Math.min(CHECKS_SAVED_EVERY, DAILY_CHECKS - asked), before });
      pieceAt = at;
      at = { phase: next.phase, cursor: next.cursor };
      waiting = next.pages;
      gone = next.gone;
      if (waiting.length === 0) {
        // Pages the list no longer holds go; a connection changed meanwhile keeps them, and the day ends.
        if (gone.length > 0 && (await save([], gone, 0, 0)) === null) break;
        if (next.finished) break;
        continue;
      }
    }
    // The day's limit exactly: never past it, whatever is left of the piece.
    const pages = waiting.splice(0, Math.min(CHECKS_SAVED_EVERY, DAILY_CHECKS - asked));
    const goneNow = gone;
    gone = [];
    const rows: CheckedRow[] = [];
    let made = 0;
    let failed = 0;
    let stopped: Stop | undefined;
    for (let start = 0; start < pages.length && !stopped; start += CHECKS_AT_ONCE) {
      const round = pages.slice(start, start + CHECKS_AT_ONCE);
      const addresses = round.map((page) => `${target.origin}${page.page}`);
      const answers = await Promise.all(addresses.map(ask));
      made += round.length;
      let errors = 0;
      answers.forEach((answer, index) => {
        const page = round[index];
        if (answer.ok) {
          // In the sitemap by Google's word or the website's own list's.
          const found = answer.found ? { ...answer.found, inSitemap: answer.found.inSitemap || page.sitemap } : null;
          rows.push({ page: page.page, address: addresses[index], title: page.title, found, ...(found ? {} : { problem: "GOOGLE_ERROR" as const }) });
          return;
        }
        failed += 1;
        if (answer.refusal === "ALLOWANCE" || answer.refusal === "SIGN_IN") {
          stopped = stopped === "SIGN_IN" ? "SIGN_IN" : answer.refusal;
          return;
        }
        if (answer.refusal === "GOOGLE_ERROR") errors += 1;
        rows.push({ page: page.page, address: addresses[index], title: page.title, found: null, problem: answer.refusal });
      });
      // A whole round failing is Google failing, not the pages: the day stops rather than ask on.
      if (!stopped && errors === round.length) stopped = "BUSY";
    }
    checked += made;
    // The day's asks as saved, whoever made them (`countOtherAsks`): the limit holds against the money-page checks too.
    const kept = await save(rows, goneNow, made, failed, stopped);
    if (stopped || kept === null) break;
    asked = Math.max(asked + made, kept);
  }
  await close();
  return null;
}

const placeWords = (phase: CheckPhase) =>
  phase === "SHOWN" ? "the pages Google shows, most clicks first" : phase === "UNSHOWN" ? "the pages Google never showed" : "the pages checked longest ago";

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

/** A website's checks and days of counts, a batch at a time: true once none are left (`searchConsoleSync.clearSome`). */
export async function clearPageChecks(ctx: MutationCtx, holdId: Id<"companyWebsites">, batch: number): Promise<boolean> {
  const checks = await ctx.db.query("pageIndexChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId)).take(batch);
  for (const row of checks) await ctx.db.delete(row._id);
  const days = await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", holdId)).take(batch);
  for (const row of days) await ctx.db.delete(row._id);
  return checks.length < batch && days.length < batch;
}
