import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { slotKey, splitEventHourKey, splitTotalHourKey } from "./googleAnalyticsLists";
import { addInto, blank, connectionOf, conversionsOf, countedOf, readFor, readSlot } from "./googleAnalyticsRows";
import { daysIn } from "./searchConsoleDays";
import { readDayPoints } from "./googleAnalyticsHistory";
import { readListPage } from "./googleAnalyticsReads";
import { readPageKindViews } from "./googleAnalyticsPageKindViews";

/**
 * A usual half hour on the website, for Live (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 3: Anthony, 2026-11-03,
 * "Yes, write one"; live-new-page-plan-2026-11-06.md): last month's people, views, visits and conversions as Hakken keeps them day
 * by day, each divided by the half hours in the month, and the share of last month's views each of its busiest pages had, by its
 * title as Live names pages. Worked out from saved figures only: Live asks Google each minute for right now, and this never asks
 * Google anything. People are each day's own, added up (a month's people counted once would be fewer), so "a usual half hour" is a
 * guide, not a count.
 *
 * Each figure can also be set against this time of the week, which is a truer usual by day than an even spread over night and day:
 * conversions from `eventHour` (a Friday at 9am usually has about 27 a half hour on More Handles, where the even spread says 18),
 * people and views from `totalHour` (Anthony, 2026-11-06), once a website's next run has saved it.
 */

/** The month a usual half hour is worked out from: the last whole calendar month, as the date menu names it. */
const USUAL_PERIOD = "lastMonth" as const;
/** Half hours in a day. */
const HALF_HOURS = 48;
/** Last month's busiest pages whose share of views Live's eye may set beside a page's share of the views now. */
const USUAL_PAGES = 50;
const DEVICES = ["desktop", "mobile", "tablet"] as const;

/** A moment's day of the week (0 Sunday, as Google counts) and hour on a website's own clock. */
export function dayAndHourIn(at: number, timeZone: string): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? "";
  return { dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday")), hour: Number(part("hour")) };
}

/** How many of one day of the week fall in some dates, first and last included. */
export function weekdaysIn(from: string, to: string, dayOfWeek: number): number {
  let count = 0;
  for (let at = Date.parse(`${from}T12:00:00Z`); at <= Date.parse(`${to}T12:00:00Z`); at += 86_400_000) if (new Date(at).getUTCDay() === dayOfWeek) count += 1;
  return count;
}

const perHalfHour = (count: number, days: number) => Math.round((count / days / 2) * 10) / 10;

/** The counted events' times in a usual half hour at one hour of one day of the week; null with none of that day in the dates. */
export function usualThisTime(rows: ReadonlyArray<{ key: string; times?: number }>, counted: ReadonlySet<string>, dayOfWeek: number, hour: number, days: number): number | null {
  if (days <= 0) return null;
  let times = 0;
  for (const row of rows) {
    const key = splitEventHourKey(row.key);
    if (key.dayOfWeek === dayOfWeek && key.hour === hour && counted.has(key.eventName)) times += row.times ?? 0;
  }
  return perHalfHour(times, days);
}

/** People and views in a usual half hour at one hour of one day of the week, from the website's own hours; null with none of that day. */
export function usualPeopleThisTime(rows: ReadonlyArray<{ key: string; people: number; views: number }>, dayOfWeek: number, hour: number, days: number): { people: number; views: number } | null {
  if (days <= 0) return null;
  const row = rows.find((one) => {
    const key = splitTotalHourKey(one.key);
    return key.dayOfWeek === dayOfWeek && key.hour === hour;
  });
  return { people: perHalfHour(row?.people ?? 0, days), views: perHalfHour(row?.views ?? 0, days) };
}

const usualValidator = v.union(v.null(), v.object({
  from: v.string(),
  to: v.string(),
  /** Each figure in a usual half hour of the month: last month's total over its half hours, one decimal. */
  people: v.number(),
  visits: v.number(),
  views: v.number(),
  conversions: v.number(),
  /** Each figure in a usual half hour at this hour on this day of the week, where `at` is given and the hours are kept. */
  peopleThisTime: v.union(v.number(), v.null()),
  viewsThisTime: v.union(v.number(), v.null()),
  conversionsThisTime: v.union(v.number(), v.null()),
  /** The day of the week (0 Sunday) and hour those are for, on the website's own clock; null without `at`. */
  dayOfWeek: v.union(v.number(), v.null()),
  hour: v.union(v.number(), v.null()),
  /** Every device's month, where the device chosen has none kept yet. */
  everyDevice: v.boolean(),
  pages: v.array(v.object({ title: v.string(), viewsShare: v.number() })),
  /** Each device's share of last month's people, for every device only: empty with one chosen. */
  devices: v.array(v.object({ device: v.string(), peopleShare: v.number() })),
}));

const usualArgs = {
  siteId: v.id("companyWebsites"),
  device: v.string(),
  /** The moment the page was last asked about, for this time of the week. */
  at: v.optional(v.number()),
};

export async function readLiveUsual(ctx: SiteReader, args: { siteId: Id<"companyWebsites">; device: string; at?: number }): Promise<typeof usualValidator.type> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const country = await keptCountry(ctx, site.hold, undefined);
  const own = await readSlot(ctx, holdId, slotKey("total", USUAL_PERIOD, "NOW", args.device, country));
  const held = own ?? (args.device !== "" ? await readSlot(ctx, holdId, slotKey("total", USUAL_PERIOD, "NOW", "", country)) : null);
  if (!held) return null;
  const total = blank("");
  for (const row of held.rows) addInto(total, row);
  // People a day, added up: the month's own row counts a person once in the month, not once in each half hour.
  const days = await readDayPoints(ctx, connection, "total", own ? args.device : "", held.from, held.to, country);
  const people = days ? days.reduce((sum, day) => sum + day.rows.reduce((one, row) => one + row.people, 0), 0) : total.people;
  const halfHours = daysIn(held.from, held.to) * HALF_HOURS;
  if (halfHours <= 0) return null;
  const each = (count: number) => Math.round((count / halfHours) * 10) / 10;
  // The busiest pages by views, titled as Live names them (Google's page title), each its share of the month's views.
  const pages = await readListPage(ctx, { siteId: args.siteId, list: "page", period: USUAL_PERIOD, device: own ? args.device : "", sort: "views", direction: "desc", page: 1, rows: USUAL_PAGES });
  const byTitle = new Map<string, number>();
  for (const row of pages.rows) if (row.title && total.views > 0) byTitle.set(row.title, (byTitle.get(row.title) ?? 0) + row.views);
  const device = own ? args.device : "";
  const clock = args.at === undefined ? null : dayAndHourIn(args.at, connection.timeZone ?? "Europe/London");
  const weekdays = clock ? weekdaysIn(held.from, held.to, clock.dayOfWeek) : 0;
  const hours = clock ? await readFor(ctx, holdId, "eventHour", USUAL_PERIOD, "NOW", device, undefined, country) : null;
  const conversionsThisTime = hours && hours !== "LIVE" && clock
    ? usualThisTime(hours.rows, new Set(countedOf(connection).map((event) => event.eventName)), clock.dayOfWeek, clock.hour, weekdays)
    : null;
  // Only once the website's next run has saved them: until then, the month's even spread stands.
  const ownHours = clock ? await readFor(ctx, holdId, "totalHour", USUAL_PERIOD, "NOW", device, undefined, country) : null;
  const peopleThisTime = ownHours && ownHours !== "LIVE" && ownHours.rows.length > 0 && clock
    ? usualPeopleThisTime(ownHours.rows, clock.dayOfWeek, clock.hour, weekdays)
    : null;
  const deviceSlots = args.device === "" ? await Promise.all(DEVICES.map((one) => readSlot(ctx, holdId, slotKey("total", USUAL_PERIOD, "NOW", one, country)))) : [];
  const devicePeople = deviceSlots.map((slot) => slot?.rows.reduce((sum, row) => sum + row.people, 0) ?? 0);
  const everyDevicesPeople = devicePeople.reduce((sum, count) => sum + count, 0);
  return {
    from: held.from,
    to: held.to,
    people: each(people),
    visits: each(total.visits),
    views: each(total.views),
    conversions: each(conversionsOf(total, countedOf(connection)).conversions),
    peopleThisTime: peopleThisTime?.people ?? null,
    viewsThisTime: peopleThisTime?.views ?? null,
    conversionsThisTime,
    dayOfWeek: clock?.dayOfWeek ?? null,
    hour: clock?.hour ?? null,
    everyDevice: !own && args.device !== "",
    pages: [...byTitle.entries()].map(([title, views]) => ({ title, viewsShare: views / total.views })),
    devices: everyDevicesPeople > 0 ? DEVICES.flatMap((one, at) => (devicePeople[at] > 0 ? [{ device: one, peopleShare: devicePeople[at] / everyDevicesPeople }] : [])) : [],
  };
}

export const analyticsLiveUsual = tenantQuery({
  args: usualArgs,
  returns: usualValidator,
  handler: async (ctx, args) => await readLiveUsual(ctx, args),
});

/** The same for Ask Hakken, for a company's own website, so it says what the screen says, with each Classification's share of last month's views. */
export const liveUsualInternal = internalQuery({
  args: { companyId: v.id("companies"), ...usualArgs },
  handler: async (ctx, { companyId, ...args }) => {
    const site = { db: ctx.db, companyId };
    const usual = await readLiveUsual(site, args);
    if (!usual) return null;
    const month = await readPageKindViews(site, { siteId: args.siteId, period: USUAL_PERIOD, device: args.device, shopApart: true });
    const placed = month?.views ?? 0;
    return { ...usual, kindShares: month && placed > 0 ? month.kinds.map((kind) => ({ kind: kind.kind, share: kind.views / placed })) : [] };
  },
});
