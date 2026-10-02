import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { searchTypeValidator } from "./searchConsoleSchema";
import { checkedRange, daysOf } from "./searchConsoleReads";
import { addUp, shiftDay } from "./searchConsoleDays";
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

/** Register entries by when they were first, or last, shown — newest first, a page at a time, up to `SEEN_MOST`. */
async function seenBetween(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  kind: "query" | "page",
  by: "first" | "last",
  from: string,
  to: string,
): Promise<Seen[]> {
  const out: Seen[] = [];
  if (from > to) return out;
  let upTo = to;
  let skip = new Set<string>();
  while (out.length < SEEN_MOST) {
    const bound = upTo;
    const page = by === "first"
      ? await ctx.db
        .query("searchConsoleSeen")
        .withIndex("by_hold_kind_first", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("kind", kind).gte("firstDay", from).lte("firstDay", bound))
        .order("desc")
        .take(SEEN_PER_READ)
      : await ctx.db
        .query("searchConsoleSeen")
        .withIndex("by_hold_kind_last", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("kind", kind).gte("lastDay", from).lte("lastDay", bound))
        .order("desc")
        .take(SEEN_PER_READ);
    const fresh = page.filter((entry) => !skip.has(entry._id));
    out.push(...fresh);
    if (page.length < SEEN_PER_READ || fresh.length === 0) break;
    // The next page starts on the last page's last day: its entries already read are skipped.
    upTo = by === "first" ? page[page.length - 1].firstDay : page[page.length - 1].lastDay;
    skip = new Set(page.filter((entry) => (by === "first" ? entry.firstDay : entry.lastDay) === upTo).map((entry) => entry._id));
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
 */
export const searchConsoleNewLost = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    from: v.string(),
    to: v.string(),
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
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const empty = { counts: { newKeywords: 0, lostKeywords: 0, newPages: 0, lostPages: 0 }, weeks: [], watchedFrom: null };
    if (!connection?.newestDay || !connection.oldestDay) return { ...pageOfList([] as Change[], args.page, args.rows, null), preparing: false, ...empty };
    const newest = connection.newestDay;
    const oldest = connection.oldestDay;
    const watched = watchedFrom(oldest);
    // The last day a keyword can have been shown and count as lost by now.
    const lastLost = shiftDay(newest, -LOST_AFTER_DAYS);
    const newFrom = args.from > watched ? args.from : watched;
    const lostFrom = shiftDay(args.from, -LOST_AFTER_DAYS);
    const lostTo = shiftDay(args.to, -LOST_AFTER_DAYS) < lastLost ? shiftDay(args.to, -LOST_AFTER_DAYS) : lastLost;
    const read = async (kind: "query" | "page") => ({
      gained: await seenBetween(ctx, holdId, kind, "first", newFrom, args.to),
      // Lost in the dates: last shown 14 days before a day in them, and not since.
      lost: await seenBetween(ctx, holdId, kind, "last", lostFrom, lostTo),
    });
    const keywords = await read("query");
    const pages = await read("page");

    // Each keyword's figures: the ready-made 90 days hold every one shown in them.
    const ninety = await readPeriod(ctx, holdId, "web", "query", "90", "NOW");
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
    const shown = await seenBetween(ctx, holdId, "query", "first", chartFrom > watched ? chartFrom : watched, newest);
    const gone = await seenBetween(ctx, holdId, "query", "last", shiftDay(chartFrom, -LOST_AFTER_DAYS), lastLost);
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

/**
 * Google updates (drawn as "8 · Google updates"): each update kept in Admin →
 * Content → Google updates that began in the days held, with the website's
 * clicks and average position for the 14 days before it began and the 14
 * after it finished. One still rolling out, or finished less than 14 days
 * ago, has no after yet.
 */
export const searchConsoleUpdates = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, language: v.string() },
  returns: v.object({
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    updates: v.array(v.object({
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
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay || !connection.oldestDay) return { from: null, to: null, updates: [] };
    const oldest = connection.oldestDay;
    const newest = connection.newestDay;
    const rows = await ctx.db
      .query("googleUpdates")
      .withIndex("by_started", (q) => q.gte("startedOn", oldest).lte("startedOn", newest))
      .take(UPDATES_MOST);
    const updates = [];
    for (const row of rows) {
      const { title, description } = await updateInLanguage(ctx as unknown as QueryCtx, row, args.language);
      const beforeFrom = shiftDay(row.startedOn, -UPDATE_WINDOW_DAYS);
      const before = beforeFrom >= oldest ? addUp(await daysOf(ctx, holdId, args.searchType, beforeFrom, shiftDay(row.startedOn, -1))) : null;
      const finished = row.finishedOn ?? null;
      const afterTo = finished ? shiftDay(finished, UPDATE_WINDOW_DAYS) : null;
      const state = !finished || !afterTo ? "rolling" as const : afterTo <= newest ? "done" as const : "waiting" as const;
      const after = state === "done" && finished && afterTo ? addUp(await daysOf(ctx, holdId, args.searchType, shiftDay(finished, 1), afterTo)) : null;
      updates.push({
        id: row._id,
        title,
        description,
        startedOn: row.startedOn,
        finishedOn: row.finishedOn ?? null,
        url: row.url,
        state,
        before,
        after,
      });
    }
    return { from: oldest, to: newest, updates };
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
 * over a ready-made period's keywords. Other dates are worked out on the
 * page from Google's answer, by the same rule.
 */
export const searchConsoleCurve = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string() },
  returns: v.object({
    live: v.boolean(),
    preparing: v.boolean(),
    points: v.array(v.object({ position: v.number(), keywords: v.number(), impressions: v.number(), clicks: v.number(), ctr: v.number() })),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    const period = periodOf(args.from, args.to, connection?.newestDay);
    if (!period) return { live: Boolean(connection?.newestDay), preparing: false, points: [] };
    const keywords = await readPeriod(ctx, site.hold._id, args.searchType, "query", period, "NOW");
    if (!keywords) return { live: false, preparing: true, points: [] };
    return {
      live: false,
      preparing: false,
      points: ctrCurve(keywords.rows.map((row) => ({ clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 ? row.positionSum / row.impressions : 0 }))),
    };
  },
});
