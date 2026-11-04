import { readDayPoints } from "./googleAnalyticsHistory";
import { v, type ObjectType } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { VISITOR_LISTS, type ListRow, type VisitorList } from "./googleAnalyticsLists";
import { isUnknownValue } from "./utils/analyticsUnknown";
import { analyticsPeriodValidator, type AnalyticsList, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { seenValidator } from "./utils/hakkenSees";
import { visitorsSees } from "./utils/sees/analyticsVisitors";
import { connectionOf, readFor, readSlot, type Held } from "./googleAnalyticsRows";
import { readVisitorMap } from "./googleAnalyticsConversionReads";

/**
 * What Visits reads above its table (docs/plans/active/visits-redo-plan-2026-11-03.md, step 1; before that Visitors,
 * google-analytics-plan.md GA24): every figure in visits, never people (Anthony, 2026-11-03: "lets stick with visits
 * and change the page to visits") — the visits, new and returning visits and visits a person against the span before,
 * whether Google signals is on, read from the age and gender lists, and What Hakken sees over it. The days read their
 * own (`analyticsVisitorDays`), the bars their own list (`analyticsVisitorBars`), the
 * treemap its own (`analyticsPageKindViews`), the table its own (`analyticsListPage`). Every device's lists and each
 * device's are kept by each collection: `missing` names a device's not built yet. Only the caller's own website
 * (`requireMySite`).
 */

/** The lists this read needs besides the totals, each a device's built by the next collection. */
const NEEDED = ["visitorType", "browser", "age", "gender"] as const satisfies readonly AnalyticsList[];

const heldOf = (list: Held | "LIVE" | null) => (list && list !== "LIVE" ? list : null);

const analyticsVisitorsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/** Dates a span covers, as kept: the screen names a whole month by its name ("September"). */
const spanValidator = v.union(v.null(), v.object({ from: v.string(), to: v.string() }));
/** A day of new and returning visits; past 90 days a week or month to its `lastDay`, its visits its days' added up (SF2b, SF14). */
const pointValidator = v.object({ day: v.string(), lastDay: v.optional(v.string()), new: v.number(), returning: v.number() });
type Point = { day: string; lastDay?: string; new: number; returning: number };

export const analyticsVisitors = tenantQuery({
  args: analyticsVisitorsArgs,
  returns: v.union(v.null(), v.object({
    /** Visitors' lists not built yet: they come in with the next collection. */
    preparing: v.boolean(),
    /** One device's lists still to ask of Google. */
    missing: v.array(v.union(...NEEDED.map((list) => v.literal(list)))),
    span: spanValidator,
    spanBefore: spanValidator,
    figures: v.union(v.null(), v.object({
      visits: v.number(),
      visitsBefore: v.union(v.number(), v.null()),
      /** Visits from people new to the website, and from people back again: never more than the visits, as people can be. */
      newVisits: v.number(),
      newVisitsBefore: v.union(v.number(), v.null()),
      returningVisits: v.number(),
      returningVisitsBefore: v.union(v.number(), v.null()),
      /** People, for visits a person only. */
      people: v.number(),
      peopleBefore: v.union(v.number(), v.null()),
    })),
    signals: v.union(v.null(), v.literal("on"), v.literal("off")),
    thresholded: v.boolean(),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readVisitors(ctx, args),
});

/** New and returning visits a day from the day facts kept for a span; null when they are not kept that far back. */
async function visitPoints(ctx: SiteReader, connection: NonNullable<Awaited<ReturnType<typeof connectionOf>>>, device: string, span: { from: string; to: string } | null, country: string): Promise<Point[] | null> {
  if (!span?.from || !span.to) return null;
  const stored = await readDayPoints(ctx, connection, "visitorType", device, span.from, span.to, country);
  if (!stored) return null;
  const visits = (rows: readonly ListRow[], type: string) => rows.filter((row) => row.key === type).reduce((sum, row) => sum + row.visits, 0);
  return stored.map((point) => ({ day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), new: visits(point.rows, "new"), returning: visits(point.rows, "returning") }));
}

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readVisitors(ctx: SiteReader, args: ObjectType<typeof analyticsVisitorsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const lists = new Map<string, Held | "LIVE" | null>();
  for (const list of NEEDED) lists.set(list, await readFor(ctx, holdId, list, args.period, "NOW", args.device, undefined, country));
  const missing = NEEDED.filter((list) => lists.get(list) === "LIVE");
  const held = (list: (typeof NEEDED)[number]) => heldOf(lists.get(list) ?? null);
  const typesBefore = heldOf(await readFor(ctx, holdId, "visitorType", args.period, "BEFORE", args.device, undefined, country));
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
  const whole = total?.rows[0] ?? null;
  const was = before?.rows[0] ?? null;
  const types = held("visitorType");
  const visitsOf = (list: Held | null, key: string) => list?.rows.find((one) => one.key === key)?.visits ?? null;
  // Google signals is off when every age and every gender Google gives is unknown (§18.6.6).
  const known = (list: Held | null) => (list ? list.rows.some((row: ListRow) => row.visits > 0 && !isUnknownValue(row.key)) : null);
  const ages = known(held("age"));
  const genders = known(held("gender"));
  const signals: "on" | "off" | null = ages === null || genders === null || !whole?.visits ? null : ages || genders ? "on" : "off";
  const figures = whole ? {
    visits: whole.visits,
    visitsBefore: was ? was.visits : null,
    newVisits: visitsOf(types, "new") ?? 0,
    newVisitsBefore: typesBefore ? visitsOf(typesBefore, "new") ?? 0 : null,
    returningVisits: visitsOf(types, "returning") ?? 0,
    returningVisitsBefore: typesBefore ? visitsOf(typesBefore, "returning") ?? 0 : null,
    people: whole.people,
    peopleBefore: was ? was.people : null,
  } : null;
  const browsers = (held("browser")?.rows ?? []).map((row) => ({ label: row.key, visits: row.visits, engaged: row.engaged }));
  const thresholded = [...lists.values()].some((list) => heldOf(list)?.thresholded === true);
  const ready = missing.length === 0 && types !== null && whole !== null;
  // Where returning visitors land, from the landing pages by new or returning (CV7): the table's "Lands most on" too.
  const map = ready ? await readVisitorMap(ctx, { ...args, list: "visitorType" }) : null;
  const back = map?.rows.find((row) => row.key === "returning") ?? null;
  // A page group by its name, so the eye says it as the screens do. Only a group of the website's own: "most returning
  // visits started on Not sorted pages" tells a reader nothing they can act on.
  const kindNames = new Map((map?.kinds ?? []).map((kind) => [kind.kind, kind.name]));
  const landedOn = back?.lands ? kindNames.get(back.lands.kind) ?? null : null;
  return {
    preparing: lists.get("visitorType") === null,
    missing,
    span: total ? { from: total.from, to: total.to } : null,
    spanBefore: before ? { from: before.from, to: before.to } : null,
    figures,
    signals,
    thresholded,
    seen: ready && figures ? visitorsSees({
      visits: figures.visits, newVisits: figures.newVisits, engaged: whole.engaged, browsers, signals, thresholded,
      returningLands: back?.lands && landedOn ? { ...back.lands, kind: landedOn, visits: back.visits } : null,
    }) : { says: [], steps: [] },
  };
}

/**
 * New and returning visits by day, and the span before's days for the chart to compare (Anthony, 2026-11-03: "i think
 * we need a compare option on this chart"): stored a day, then a week, then a month (ga-stored-figures-plan.md SF12,
 * SF14), read on every device's dates. Its own read beside the boxes', as the two together came within a quarter of a
 * second of Convex's limit on morehandles.co.uk (0.78s, 3 November 2026).
 */
export const analyticsVisitorDays = tenantQuery({
  args: analyticsVisitorsArgs,
  returns: v.union(v.null(), v.object({
    points: v.array(pointValidator),
    /** The span before's days, in order, for the chart to lay under the period's: null where they are not kept. */
    pointsBefore: v.union(v.null(), v.array(pointValidator)),
  })),
  handler: async (ctx, args) => await readVisitorDays(ctx, args),
});

export async function readVisitorDays(ctx: SiteReader, args: ObjectType<typeof analyticsVisitorsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const every = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
  const everyBefore = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", "", country));
  return {
    points: (await visitPoints(ctx, connection, args.device, every, country)) ?? [],
    pointsBefore: await visitPoints(ctx, connection, args.device, everyBefore, country),
  };
}

const visitorBarsArgs = { ...analyticsVisitorsArgs, list: v.union(...VISITOR_LISTS.map((list) => v.literal(list))) };

/**
 * "Who visits your website, by …" (visits-redo-plan-2026-11-03.md, step 1; the chart Anthony approved on a page's own
 * screen on 3 November): one of Visits' six lists, each group's visits for the dates chosen and the span before, every
 * group Google gives, the unknown among them — the screen leaves those out where Google places only some (age,
 * gender, interests) and says how many it placed. Nothing is asked of Google: both spans are kept.
 */
export const analyticsVisitorBars = tenantQuery({
  args: visitorBarsArgs,
  returns: v.union(v.null(), v.object({
    /** One device's list not built yet: the next collection builds it. */
    waiting: v.boolean(),
    rows: v.array(v.object({ key: v.string(), visits: v.number(), visitsBefore: v.union(v.number(), v.null()), engaged: v.number() })),
    thresholded: v.boolean(),
  })),
  handler: async (ctx, args) => await readVisitorBars(ctx, args),
});

export async function readVisitorBars(ctx: SiteReader, args: ObjectType<typeof visitorBarsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, site.hold._id);
  if (!connection?.newestDay) return null;
  return await barsOf(ctx, site.hold._id, args.list, args.period, args.device, country);
}

/** One list's groups, the busiest first, each with its visits and the span before's; `waiting` while a device's isn't built. */
async function barsOf(ctx: SiteReader, holdId: Id<"companyWebsites">, list: VisitorList, period: AnalyticsPeriod, device: string, country: string) {
  const now = await readFor(ctx, holdId, list, period, "NOW", device, undefined, country);
  if (now === "LIVE") return { waiting: true, rows: [], thresholded: false };
  if (!now) return null;
  const was = heldOf(await readFor(ctx, holdId, list, period, "BEFORE", device, undefined, country));
  const before = new Map((was?.rows ?? []).map((row) => [row.key, row.visits]));
  return {
    waiting: false,
    rows: now.rows.filter((row) => row.visits > 0).sort((left, right) => right.visits - left.visits).map((row) => ({
      key: row.key, visits: row.visits, visitsBefore: was ? before.get(row.key) ?? 0 : null, engaged: row.engaged,
    })),
    thresholded: now.thresholded,
  };
}

/** Groups of each list the eye is handed: the busiest, as a reader would look down a chart. */
const EYE_GROUPS = 8;

/**
 * Every list Visits can show but interests, for What Hakken sees (visits-redo-plan-2026-11-03.md, step 2): each list's busiest groups
 * Google could name, with their visits and the span before's. The bars draw one list at a time; the eye reads them all,
 * as a reader can switch between them, so its code finds what moved in any (on morehandles.co.uk, October 2026, the one
 * list on screen moved too little for any finding). Nothing is asked of Google.
 */
export const analyticsVisitorGroups = tenantQuery({
  args: analyticsVisitorsArgs,
  returns: v.union(v.null(), v.array(v.object({
    list: v.union(...VISITOR_LISTS.map((list) => v.literal(list))),
    /** Each group's engaged visits too, so the eye can say which groups leave at once (pageOwnFindings.ts). */
    rows: v.array(v.object({ key: v.string(), visits: v.number(), visitsBefore: v.union(v.number(), v.null()), engaged: v.number() })),
  }))),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, site.hold._id);
    if (!connection?.newestDay) return null;
    const lists = [];
    // Not interests: one person sits in many, so their moves are noise ("Soccer Fans" fell, on a door handle shop).
    for (const list of VISITOR_LISTS.filter((one) => one !== "interest")) {
      const bars = await barsOf(ctx, site.hold._id, list, args.period, args.device, country);
      if (!bars || bars.waiting) continue;
      lists.push({ list, rows: bars.rows.filter((row) => !isUnknownValue(row.key)).slice(0, EYE_GROUPS) });
    }
    return lists;
  },
});
