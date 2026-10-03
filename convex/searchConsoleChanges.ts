import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { searchTypeValidator } from "./searchConsoleSchema";
import { askLive, checkedRange, countryFilters, daysOf } from "./searchConsoleReads";
import { addUp, historyLimitDay, shiftDay, type Figures } from "./searchConsoleDays";
import { checkedCountry, countryScope } from "./searchConsoleCountries";
import { readPeriod } from "./searchConsolePeriods";
import { periodOf } from "./searchConsoleLists";
import { holdBrandNames } from "./holdProfiles";
import { updateInLanguage } from "./googleUpdates";
import { BANDS, bandOf, ctrCurve, type Band } from "./utils/searchConsoleViews";
import { weekStart } from "./utils/searchConsolePacks";
import { wordStartMatcher } from "./utils/wordStarts";

/**
 * Search Console's Changes pages that read more than one list
 * (docs/plans/active/search-console-plan.md §13.3): New and lost, from when
 * each keyword and page was first and last shown; and Google updates, each
 * update's 14 days before against the 14 after, from the website's day
 * totals. Read by the hold's indexes; searched, sorted and paged here.
 *
 * Each takes one country (§16): one the website keeps ready reads its own
 * register, days and periods. For any other, Google updates and the click
 * rate are asked of Google live; New and lost — a register built up run by
 * run — cannot be, and says the country is not kept ready (`notReady`).
 */

/** A keyword is lost when Google has not shown the website for it in this many days (the drawing's "14 days"). */
export const LOST_AFTER_DAYS = 14;
/** Days before an update began, and after it finished, that its change is read over (the drawing's "14 days"). */
export const UPDATE_WINDOW_DAYS = 14;
/** Keywords or pages read per page of the first- and last-seen register. */
const SEEN_PER_READ = 500;
/** The most new, or lost, keywords or pages a list reads: past this it holds the most recent. */
const SEEN_MOST = 5_000;
/** Weeks the New and lost chart shows. */
const CHART_WEEKS = 16;
/** Google's updates a website's list reads at most. */
const UPDATES_MOST = 100;

async function connectionOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

type Seen = Doc<"searchConsoleSeen">;

/** One page of register entries by when they were first, or last, shown: newest first, in a span of days or within one day. */
async function seenPage(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  kind: "query" | "page",
  by: "first" | "last",
  span: { from: string; to: string } | { day: string; before: number },
): Promise<Seen[]> {
  const query = ctx.db.query("searchConsoleSeen");
  const ordered = by === "first"
    ? query.withIndex("by_hold_country_kind_first", (q) => {
      const hold = q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("kind", kind);
      return "day" in span ? hold.eq("firstDay", span.day).lt("_creationTime", span.before) : hold.gte("firstDay", span.from).lte("firstDay", span.to);
    })
    : query.withIndex("by_hold_country_kind_last", (q) => {
      const hold = q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("kind", kind);
      return "day" in span ? hold.eq("lastDay", span.day).lt("_creationTime", span.before) : hold.gte("lastDay", span.from).lte("lastDay", span.to);
    });
  return await ordered.order("desc").take(SEEN_PER_READ);
}

/**
 * Register entries by when they were first, or last, shown — newest first, a
 * page at a time, up to `SEEN_MOST`. A page that ends inside a day carries on
 * within that day by when each entry was made, then with the days before, so
 * a day of more than a page's entries loses none.
 */
async function seenBetween(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  kind: "query" | "page",
  by: "first" | "last",
  from: string,
  to: string,
): Promise<Seen[]> {
  const out: Seen[] = [];
  let span: { from: string; to: string } | { day: string; before: number } | null = from <= to ? { from, to } : null;
  while (span && out.length < SEEN_MOST) {
    const page = await seenPage(ctx, companyWebsiteId, country, kind, by, span);
    out.push(...page);
    if (page.length === SEEN_PER_READ) {
      const last = page[page.length - 1];
      span = { day: by === "first" ? last.firstDay : last.lastDay, before: last._creationTime };
    } else if ("day" in span) {
      // That day is read: the days before it.
      const earlier = shiftDay(span.day, -1);
      span = earlier >= from ? { from, to: earlier } : null;
    } else {
      span = null;
    }
  }
  return out.slice(0, SEEN_MOST);
}

type Change = { key: string; status: "new" | "lost"; when: string; clicks: number; impressions: number; position: number | null; band: Band | null };

const CHANGE_SORTS: ListSorts<Change, "key" | "status" | "when" | "clicks" | "impressions" | "position"> = {
  key: { value: (row) => row.key, first: "asc" },
  status: { value: (row) => row.status, first: "asc" },
  when: { value: (row) => row.when, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};

const changeValidator = v.object({
  key: v.string(),
  status: v.union(v.literal("new"), v.literal("lost")),
  when: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  position: v.union(v.number(), v.null()),
  band: v.union(...BANDS.map((band) => v.literal(band)), v.null()),
});

/**
 * The first day a keyword first shown counts as new: once the website has
 * been watched long enough that it would have been seen before, had it been
 * shown — the same 14 days that make one lost.
 */
const watchedFrom = (oldestDay: string) => shiftDay(oldestDay, LOST_AFTER_DAYS);

/**
 * New and lost (drawn as "6 · New and lost"): the keywords Google started
 * showing the website for in the dates chosen, and those it stopped — lost
 * once 14 days have passed without one — with the page's four counts and
 * the chart's weeks. Web results.
 *
 * In one country kept ready, that country's own register, watched from its
 * own first day held. Any other country is `notReady` — the register is
 * built run by run, so Google cannot be asked for it — and one just added,
 * before its first collection, is `preparing`.
 */
export const searchConsoleNewLost = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
    q: v.optional(v.string()),
    what: v.optional(v.union(v.literal("new"), v.literal("lost"))),
    band: v.optional(v.union(...BANDS.map((band) => v.literal(band)))),
    sort: v.optional(v.union(v.literal("key"), v.literal("status"), v.literal("when"), v.literal("clicks"), v.literal("impressions"), v.literal("position"))),
    direction: sortDirectionArg,
    ...listPageArgs,
  },
  returns: v.object({
    rows: v.array(changeValidator),
    preparing: v.boolean(),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    counts: v.object({ newKeywords: v.number(), lostKeywords: v.number(), newPages: v.number(), lostPages: v.number() }),
    weeks: v.array(v.object({ week: v.string(), gained: v.number(), lost: v.number() })),
    /** The first day a keyword can count as new: the website watched 14 days by then. */
    watchedFrom: v.union(v.string(), v.null()),
    /** A country not kept ready: the page says to add it on the Market page. */
    notReady: v.boolean(),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const empty = { counts: { newKeywords: 0, lostKeywords: 0, newPages: 0, lostPages: 0 }, weeks: [], watchedFrom: null };
    const nothing = (preparing: boolean, notReady: boolean) => ({ ...pageOfList([] as Change[], args.page, args.rows, null), preparing, notReady, ...empty });
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (scope.read === "LIVE") return nothing(scope.kept, !scope.kept);
    const country = scope.read === "KEPT" ? scope.country : undefined;
    const held = scope.read === "KEPT" ? scope : connection;
    if (!held?.newestDay || !held.oldestDay) return nothing(false, false);
    const newest = held.newestDay;
    const oldest = held.oldestDay;
    const watched = watchedFrom(oldest);
    // The last day a keyword can have been shown and count as lost by now.
    const lastLost = shiftDay(newest, -LOST_AFTER_DAYS);
    const newFrom = args.from > watched ? args.from : watched;
    const lostFrom = shiftDay(args.from, -LOST_AFTER_DAYS);
    const lostTo = shiftDay(args.to, -LOST_AFTER_DAYS) < lastLost ? shiftDay(args.to, -LOST_AFTER_DAYS) : lastLost;
    const read = async (kind: "query" | "page") => ({
      gained: await seenBetween(ctx, holdId, country, kind, "first", newFrom, args.to),
      // Lost in the dates: last shown 14 days before a day in them, and not since.
      lost: await seenBetween(ctx, holdId, country, kind, "last", lostFrom, lostTo),
    });
    const keywords = await read("query");
    const pages = await read("page");

    // Each keyword's figures: the ready-made 90 days hold every one shown in them.
    const ninety = await readPeriod(ctx, holdId, "web", "query", "90", "NOW", country);
    const figures = new Map((ninety?.rows ?? []).map((row) => [row.key, row]));
    const rowOf = (entry: Seen, status: "new" | "lost"): Change => {
      const known = figures.get(entry.key);
      const position = known && known.impressions > 0 ? known.positionSum / known.impressions : null;
      return {
        key: entry.key,
        status,
        when: status === "new" ? entry.firstDay : shiftDay(entry.lastDay, LOST_AFTER_DAYS),
        clicks: status === "new" ? (known?.clicks ?? 0) : 0,
        impressions: status === "new" ? (known?.impressions ?? 0) : 0,
        position,
        band: position === null ? null : bandOf(position),
      };
    };
    const all = [...keywords.gained.map((entry) => rowOf(entry, "new")), ...keywords.lost.map((entry) => rowOf(entry, "lost"))];
    const matches = wordStartMatcher(args.q?.trim().toLowerCase());
    const kept = all
      .filter((row) => (!matches || matches(row.key)) && (!args.what || row.status === args.what) && (!args.band || row.band === args.band))
      .sort(listOrder(CHANGE_SORTS, args.sort ?? "when", args.direction, (row) => row.key));
    const cut = keywords.gained.length >= SEEN_MOST || keywords.lost.length >= SEEN_MOST ? SEEN_MOST : null;

    // The chart: keywords first shown, and lost, in each of the last weeks.
    const chartFrom = weekStart(shiftDay(newest, -7 * (CHART_WEEKS - 1)));
    const shown = await seenBetween(ctx, holdId, country, "query", "first", chartFrom > watched ? chartFrom : watched, newest);
    const gone = await seenBetween(ctx, holdId, country, "query", "last", shiftDay(chartFrom, -LOST_AFTER_DAYS), lastLost);
    const weeks = new Map<string, { week: string; gained: number; lost: number }>();
    for (let week = chartFrom; week <= newest; week = shiftDay(week, 7)) weeks.set(week, { week, gained: 0, lost: 0 });
    for (const entry of shown) {
      const week = weeks.get(weekStart(entry.firstDay));
      if (week) week.gained += 1;
    }
    for (const entry of gone) {
      const week = weeks.get(weekStart(shiftDay(entry.lastDay, LOST_AFTER_DAYS)));
      if (week) week.lost += 1;
    }

    return {
      ...pageOfList(kept, args.page, args.rows, cut),
      preparing: false,
      notReady: false,
      counts: {
        newKeywords: keywords.gained.length,
        lostKeywords: keywords.lost.length,
        newPages: pages.gained.length,
        lostPages: pages.lost.length,
      },
      weeks: [...weeks.values()].filter((week) => shiftDay(week.week, 6) >= oldest),
      watchedFrom: watched,
    };
  },
});

const figuresValidator = v.union(v.null(), v.object({ clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() }));

const updateValidator = v.object({
  id: v.id("googleUpdates"),
  title: v.string(),
  description: v.string(),
  startedOn: v.string(),
  finishedOn: v.union(v.string(), v.null()),
  url: v.string(),
  /** Still rolling out; or finished, and its 14 days after not all in yet. */
  state: v.union(v.literal("done"), v.literal("rolling"), v.literal("waiting")),
  before: figuresValidator,
  after: figuresValidator,
});

type UpdateWords = { id: Id<"googleUpdates">; title: string; description: string; startedOn: string; finishedOn: string | null; url: string };

/** Each update kept in Admin → Content → Google updates that began in the days given, in the reader's language. */
async function updatesIn(ctx: { db: QueryCtx["db"] }, oldest: string, newest: string, language: string): Promise<UpdateWords[]> {
  const rows = await ctx.db
    .query("googleUpdates")
    .withIndex("by_started", (q) => q.gte("startedOn", oldest).lte("startedOn", newest))
    .take(UPDATES_MOST);
  const out: UpdateWords[] = [];
  for (const row of rows) {
    const { title, description } = await updateInLanguage(ctx as unknown as QueryCtx, row, language);
    out.push({ id: row._id, title, description, startedOn: row.startedOn, finishedOn: row.finishedOn ?? null, url: row.url });
  }
  return out;
}

/**
 * Each update's 14 days before it began against the 14 after it finished,
 * from the days `between` adds up: before only from `floor`, the first day
 * held; after only once all 14 are in by `newest`.
 */
async function withFigures(
  updates: readonly UpdateWords[],
  floor: string,
  newest: string,
  between: (from: string, to: string) => Promise<Figures | null>,
): Promise<UpdateFigures[]> {
  const out: UpdateFigures[] = [];
  for (const update of updates) {
    const beforeFrom = shiftDay(update.startedOn, -UPDATE_WINDOW_DAYS);
    const before = beforeFrom >= floor ? await between(beforeFrom, shiftDay(update.startedOn, -1)) : null;
    const finished = update.finishedOn;
    const afterTo = finished ? shiftDay(finished, UPDATE_WINDOW_DAYS) : null;
    const state = !finished || !afterTo ? "rolling" as const : afterTo <= newest ? "done" as const : "waiting" as const;
    const after = state === "done" && finished && afterTo ? await between(shiftDay(finished, 1), afterTo) : null;
    out.push({ ...update, state, before, after });
  }
  return out;
}

/**
 * Google updates (drawn as "8 · Google updates"): each update kept in Admin →
 * Content → Google updates that began in the days held, with the website's
 * clicks and average position for the 14 days before it began and the 14
 * after it finished. One still rolling out, or finished less than 14 days
 * ago, has no after yet.
 *
 * In one country kept ready, from its own days. Any other country is `live`
 * with nothing read: the page asks Google (`searchConsoleLiveUpdates`).
 */
export const searchConsoleUpdates = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, language: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    updates: v.array(updateValidator),
    /** A country not kept ready: asked of Google instead. */
    live: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (!connection?.newestDay || !connection.oldestDay) return { from: null, to: null, updates: [], live: false };
    if (scope.read === "LIVE") return { from: null, to: null, updates: [], live: true };
    const country = scope.read === "KEPT" ? scope.country : undefined;
    const oldest = scope.read === "KEPT" ? scope.oldestDay : connection.oldestDay;
    const newest = scope.read === "KEPT" ? scope.newestDay : connection.newestDay;
    const updates = await withFigures(
      await updatesIn(ctx, oldest, newest, args.language),
      oldest,
      newest,
      async (from, to) => addUp(await daysOf(ctx, holdId, args.searchType, from, to, country)),
    );
    return { from: oldest, to: newest, updates, live: false };
  },
});

/** What a live Google updates answer needs: the connection, the days held for all countries, and the updates in them. */
export const liveUpdatesTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), language: v.string() },
  returns: v.union(v.null(), v.object({
    connectionId: v.id("searchConsoleConnections"),
    property: v.string(),
    oldest: v.union(v.string(), v.null()),
    newest: v.union(v.string(), v.null()),
    updates: v.array(v.object({
      id: v.id("googleUpdates"), title: v.string(), description: v.string(), startedOn: v.string(), finishedOn: v.union(v.string(), v.null()), url: v.string(),
    })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection || connection.status !== "CONNECTED" || !connection.property) return null;
    const oldest = connection.oldestDay ?? null;
    const newest = connection.newestDay ?? null;
    return {
      connectionId: connection._id,
      property: connection.property,
      oldest,
      newest,
      updates: oldest && newest ? await updatesIn(ctx, oldest, newest, args.language) : [],
    };
  },
});

/** What a live Google updates answer reads, written out: the actions in this file read it through `internal`. */
type LiveUpdatesTarget = {
  connectionId: Id<"searchConsoleConnections">;
  property: string;
  oldest: string | null;
  newest: string | null;
  updates: UpdateWords[];
};

type UpdateFigures = UpdateWords & { state: "done" | "rolling" | "waiting"; before: Figures | null; after: Figures | null };

type LiveUpdatesAnswer =
  | { ok: true; from: string | null; to: string | null; updates: UpdateFigures[] }
  | { ok: false; problem: "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY" };

/**
 * Google updates in one country the website does not keep ready (§16):
 * `searchConsoleUpdates`' answer, the website's days in that country asked of
 * Google in one ask. The updates are those in the days held for all
 * countries; an update's days before are compared only where Google still
 * keeps them, sixteen months.
 */
export const searchConsoleLiveUpdates = tenantAction({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, language: v.string(), country: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()), updates: v.array(updateValidator) }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args): Promise<LiveUpdatesAnswer> => {
    checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: LiveUpdatesTarget | null = await ctx.runQuery(internal.searchConsoleChanges.liveUpdatesTarget, { companyId, siteId: args.siteId, language: args.language });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const { oldest, newest } = target;
    if (!oldest || !newest) return { ok: true as const, from: null, to: null, updates: [] };
    const limit = historyLimitDay(Date.now());
    const floor = oldest > limit ? oldest : limit;
    let days: Array<{ day: string; clicks: number; impressions: number; position: number }> = [];
    if (target.updates.length > 0 && floor <= newest) {
      const answer = await askLive(ctx, target, {
        startDate: floor,
        endDate: newest,
        type: args.searchType,
        dimensions: ["date"],
        dimensionFilterGroups: [{ filters: countryFilters(args.country) }],
      });
      if (!answer.ok) return answer;
      days = answer.rows.map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, position: row.position }));
    }
    const updates = await withFigures(target.updates, floor, newest, async (from, to) => addUp(days.filter((day) => day.day >= from && day.day <= to)));
    return { ok: true as const, from: oldest, to: newest, updates };
  },
});

/**
 * The website's brand words — the brand names and misspellings in its
 * Profile — for Brand and non-brand, and, for the platform's team, the way
 * to that Profile to change them. A company's own users see the words only
 * (search-console-plan.md §13.3, "Brand words").
 */
export const searchConsoleBrandWords = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ names: v.array(v.string()), profileHref: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const names = (await holdBrandNames(ctx, site.hold._id)).map((brand) => brand.name);
    const team = ctx.user.role === "SUPER_ADMIN";
    return { names, profileHref: team ? `/admin/companies/${site.hold.companyId}/websites/site/${site.hold._id}/profile` : null };
  },
});

/**
 * Click rate by position (drawn as "15 · Click rate by position"): how often
 * people clicked the website at each of Google's whole positions, 1 to 20,
 * over a ready-made period's keywords — all countries', or one country's
 * kept ready. Other dates, and any other country, are `live`: worked out on
 * the page from Google's answer (`searchConsoleLiveList`), by the same rule.
 */
export const searchConsoleCurve = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    live: v.boolean(),
    preparing: v.boolean(),
    points: v.array(v.object({ position: v.number(), keywords: v.number(), impressions: v.number(), clicks: v.number(), ctr: v.number() })),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    const period = scope.read === "LIVE" ? null : periodOf(args.from, args.to, scope.read === "KEPT" ? scope.newestDay : connection?.newestDay);
    if (!period) return { live: Boolean(connection?.newestDay), preparing: false, points: [] };
    const keywords = await readPeriod(ctx, site.hold._id, args.searchType, "query", period, "NOW", scope.read === "KEPT" ? scope.country : undefined);
    if (!keywords) return { live: false, preparing: true, points: [] };
    return {
      live: false,
      preparing: false,
      points: ctrCurve(keywords.rows.map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 ? row.positionSum / row.impressions : 0 }))),
    };
  },
});
