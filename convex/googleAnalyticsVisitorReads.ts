import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { shiftDay } from "./searchConsoleDays";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { DAY_JOIN, type ListRow } from "./googleAnalyticsLists";
import { isUnknownValue } from "./utils/analyticsUnknown";
import { analyticsPeriodValidator, type AnalyticsList } from "./googleAnalyticsSchema";
import { seenValidator } from "./utils/hakkenSees";
import { visitorsSees } from "./utils/sees/analyticsVisitors";
import { connectionOf, conversionsOf, countedOf, readFor, readSlot, type Held } from "./googleAnalyticsRows";

/**
 * What Visitors reads above its table (docs/plans/active/google-analytics-plan.md
 * GA24, §18.2 board 15, §18.6.6): people, new and returning, visits a person
 * against the span before; new and returning people a day; whether Google
 * signals is on, read from the age and gender lists; and What Hakken sees
 * over all of it. The table reads its own list (`analyticsListPage`). One
 * device's lists are asked of Google when the screen opens: `missing` names
 * those not asked yet. Only the caller's own website (`requireMySite`).
 */

/** The lists this read needs besides the totals, each asked of Google for one device. */
const NEEDED = ["visitorType", "browser", "age", "gender", "visitorSeries"] as const satisfies readonly AnalyticsList[];

const heldOf = (list: Held | "LIVE" | null) => (list && list !== "LIVE" ? list : null);

const analyticsVisitorsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

export const analyticsVisitors = tenantQuery({
  args: analyticsVisitorsArgs,
  returns: v.union(v.null(), v.object({
    /** Visitors' lists not built yet: they come in with the next collection. */
    preparing: v.boolean(),
    /** One device's lists still to ask of Google. */
    missing: v.array(v.union(...NEEDED.map((list) => v.literal(list)))),
    figures: v.union(v.null(), v.object({
      people: v.number(),
      peopleBefore: v.union(v.number(), v.null()),
      visits: v.number(),
      visitsBefore: v.union(v.number(), v.null()),
      newPeople: v.number(),
      returningPeople: v.number(),
    })),
    points: v.array(v.object({ day: v.string(), new: v.number(), returning: v.number() })),
    signals: v.union(v.null(), v.literal("on"), v.literal("off")),
    thresholded: v.boolean(),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readVisitors(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readVisitors(ctx: SiteReader, args: ObjectType<typeof analyticsVisitorsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = countedOf(connection);
  const lists = new Map<string, Held | "LIVE" | null>();
  for (const list of NEEDED) lists.set(list, await readFor(ctx, holdId, list, args.period, "NOW", args.device, undefined, country));
  const missing = NEEDED.filter((list) => lists.get(list) === "LIVE");
  const held = (list: (typeof NEEDED)[number]) => heldOf(lists.get(list) ?? null);
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
  const whole = total?.rows[0] ?? null;
  const was = before?.rows[0] ?? null;
  const types = held("visitorType");
  const group = (key: string) => {
    const row = types?.rows.find((one) => one.key === key);
    return row ? { visits: row.visits, conversions: conversionsOf(row, counted).conversions, people: row.people } : null;
  };
  const newVisitors = group("new");
  const returning = group("returning");
  // Google signals is off when every age and every gender Google gives is unknown (§18.6.6).
  const known = (list: Held | null) => (list ? list.rows.some((row: ListRow) => row.visits > 0 && !isUnknownValue(row.key)) : null);
  const ages = known(held("age"));
  const genders = known(held("gender"));
  const signals: "on" | "off" | null = ages === null || genders === null || !whole?.visits ? null : ages || genders ? "on" : "off";
  const series = held("visitorSeries");
  const byDay = new Map<string, { new: number; returning: number }>();
  for (const row of series?.rows ?? []) {
    const at = row.key.indexOf(DAY_JOIN);
    if (at < 0) continue;
    const day = row.key.slice(0, at);
    const type = row.key.slice(at + DAY_JOIN.length);
    const point = byDay.get(day) ?? { new: 0, returning: 0 };
    if (type === "new") point.new += row.people;
    else if (type === "returning") point.returning += row.people;
    byDay.set(day, point);
  }
  const points: Array<{ day: string; new: number; returning: number }> = [];
  if (series) for (let day = series.from; day && day <= series.to; day = shiftDay(day, 1)) points.push({ day, ...(byDay.get(day) ?? { new: 0, returning: 0 }) });
  const figures = whole ? {
    people: whole.people,
    peopleBefore: was ? was.people : null,
    visits: whole.visits,
    visitsBefore: was ? was.visits : null,
    newPeople: newVisitors?.people ?? 0,
    returningPeople: returning?.people ?? 0,
  } : null;
  const browsers = (held("browser")?.rows ?? []).map((row) => ({ label: row.key, visits: row.visits, engaged: row.engaged }));
  const thresholded = [...lists.values()].some((list) => heldOf(list)?.thresholded === true);
  const ready = missing.length === 0 && types !== null && whole !== null;
  return {
    preparing: lists.get("visitorType") === null,
    missing,
    figures,
    points,
    signals,
    thresholded,
    seen: ready ? visitorsSees({
      people: whole.people, visits: whole.visits, engaged: whole.engaged, newPeople: newVisitors?.people ?? 0,
      newVisitors, returning, browsers, signals, thresholded,
    }) : { says: [], steps: [] },
  };
}
