import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { shiftDay } from "./searchConsoleDays";
import { bareHost } from "./googleAnalyticsApi";
import { slotKey } from "./googleAnalyticsCollect";
import { DAY_JOIN, splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { HEALTH_CHECKS, type HealthCheck } from "./googleAnalyticsSchema";
import { decodePages } from "./holdPageRefs";
import { NEVER_TICKED, readsAsEnquiry } from "./utils/analyticsEvents";
import { COUNTED_AGAIN } from "./utils/sees/analytics";

/**
 * Whether Google Analytics is counting a website properly
 * (docs/plans/active/google-analytics-plan.md §6, GA11, GA12): twelve checks,
 * run when the first collection finishes and with every weekly one, each
 * saying what is wrong, why it matters and how to fix it on the Tracking
 * health page. When a check starts failing the platform's super admins get
 * one alert in the bell — once, never every week it stays failing.
 *
 * Read from what the collection already keeps: the days, the 30 days' channels
 * and landing pages, the addresses' visits asked weekly, and each event's
 * times. Nothing is asked of Google here.
 */

/** A week's visits this far under the four weeks before is a sudden fall (§10, Q5). */
export const FALL_SHARE = 0.4;
/** On a website with at least this many visits a week (§10, Q5). */
export const FALL_FLOOR = 100;
/** Unassigned visits or "(not set)" landing pages above this share of visits (§10, Q13). */
export const UNKNOWN_SHARE = 0.05;
/** The 35 days the checks read, a part each, with room to spare. */
const DAYS_READ = 100;
/** Weeks of steady visits before a day with none reads as tracking stopped. */
const STEADY_DAYS = 14;
/** Views in 90 days a page needs before its views a visit are judged (check 9): fewer move by chance. */
export const COUNTED_AGAIN_FLOOR = 100;
/** Pages named by check 9, the most counted first. */
const COUNTED_AGAIN_NAMED = 3;
/** Days in a row a conversion matches an event that is never an enquiry before it reads as that event (check 10). */
export const SOMETHING_ELSE_DAYS = 5;
/** Times in 12 months an event that reads as an enquiry must happen, uncounted, before it is named (check 11). */
export const UNCOUNTED_FLOOR = 10;
/** Visits in 90 days that make a conversion's 90 silent days mean something (check 12); fewer, and 12 months are read. */
export const SILENT_VISITS = 300;

/** Payment pages that take the credit for sales when they come back as referrals (§6, check 6). */
export const PAYMENT_SOURCES: readonly string[] = [
  "paypal.com", "stripe.com", "checkout.stripe.com", "worldpay.com", "opayo.co.uk", "sagepay.com", "klarna.com",
  "clearpay.co.uk", "afterpay.com", "checkout.com", "adyen.com", "squareup.com", "mollie.com", "gocardless.com",
  "3dsecure", "secure5.arcot.com", "pay.google.com", "apple.com",
];

type Result = { check: HealthCheck; passing: boolean; names?: string[]; others?: string[]; count?: number; share?: number };

async function slotRows(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">, key: string) {
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", key))
    .first();
  if (!slot) return null;
  const parts = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", key).eq("slot", slot.slot))
    .take(Math.min(slot.parts, HEALTH_PARTS_READ));
  return parts.flatMap((part) => unpackPart(part as PackedPart));
}

/**
 * Parts of one list the checks read, 2,000 rows each (collection-reliability-plan.md, RR3): every check reads a list's
 * biggest rows, and three lists read whole passed a call's 16 MB on a website of 50,000 pages. 20,000 rows a list.
 */
const HEALTH_PARTS_READ = 10;

// ---------------------------------------------------------------------------
// What each conversion really is (conversion-checks-plan.md): checks 10 to 12
// ---------------------------------------------------------------------------

type Days = ReadonlyMap<string, number>;
const NO_DAYS: Days = new Map();

/** Days of each event's times read for the checks: Google's settled month. */
const EVENT_DAYS = 30;
/** Day records read for them: a part or two a day. */
const EVENT_DAY_RECORDS = 90;

/**
 * Each event's times a day over the last 30 days, every device, from the
 * events kept a day (ga-stored-figures-plan.md SF12) — each row keyed by its
 * day and event (`day␞event`), as `timesByDay` reads them — or null before a
 * day is kept.
 */
async function eventDays(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">): Promise<ListRow[] | null> {
  const newest = connection.newestDay;
  if (!newest) return null;
  const records = await ctx.db
    .query("googleAnalyticsDays")
    .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("list", "event").eq("device", "").gte("day", shiftDay(newest, -(EVENT_DAYS - 1))))
    .take(EVENT_DAY_RECORDS);
  if (records.length === 0) return null;
  return records.flatMap((record) => unpackPart(record as PackedPart).map((row) => ({ ...row, key: `${record.day}${DAY_JOIN}${row.key}` })));
}

/** Each event's times a day, from a list of each event a day. */
export function timesByDay(rows: readonly ListRow[]): Map<string, Map<string, number>> {
  const byEvent = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const at = row.key.indexOf(DAY_JOIN);
    if (at < 0) continue;
    const eventName = row.key.slice(at + DAY_JOIN.length);
    const days = byEvent.get(eventName) ?? new Map<string, number>();
    days.set(row.key.slice(0, at), (days.get(row.key.slice(0, at)) ?? 0) + (row.times ?? 0));
    byEvent.set(eventName, days);
  }
  return byEvent;
}

/**
 * The days in a row, newest first, on which two events happened the same
 * number of times, back to the last day they differed; days neither happened
 * are passed over. A conversion built from another event matches it on every
 * day; once it is rebuilt, the first day they differ ends the run.
 */
export function daysAlike(first: Days, second: Days): number {
  const days = [...new Set([...first.keys(), ...second.keys()])]
    .filter((day) => (first.get(day) ?? 0) > 0 || (second.get(day) ?? 0) > 0)
    .sort()
    .reverse();
  let alike = 0;
  for (const day of days) {
    if ((first.get(day) ?? 0) !== (second.get(day) ?? 0)) break;
    alike += 1;
  }
  return alike;
}

/**
 * Check 10: each counted conversion that matches, on each of at least
 * `SOMETHING_ELSE_DAYS` days in a row, an event that is never an enquiry — a
 * click on a link away, a scroll, a page view (Ronins' "Form sent" was its
 * link clicks, 2026-10-13). One conversion copying another real enquiry passes.
 */
export function somethingElse(counted: readonly string[], series: ReadonlyMap<string, Days>): Array<{ eventName: string; other: string; days: number }> {
  return counted.flatMap((eventName) => {
    const other = lookalikeOf(eventName, series);
    return other ? [{ eventName, ...other }] : [];
  });
}

/**
 * The event never an enquiry that an event matches, day for day, on at least
 * `SOMETHING_ELSE_DAYS` days in a row — the closest — or null. Check 10 asks
 * it of counted conversions, check 11 and Choose what counts of the rest.
 */
export function lookalikeOf(eventName: string, series: ReadonlyMap<string, Days>): { other: string; days: number } | null {
  if (NEVER_TICKED.has(eventName)) return null;
  const own = series.get(eventName) ?? NO_DAYS;
  const closest = [...NEVER_TICKED]
    .map((other) => ({ other, days: daysAlike(own, series.get(other) ?? NO_DAYS) }))
    .sort((left, right) => right.days - left.days)[0];
  return closest && closest.days >= SOMETHING_ELSE_DAYS ? closest : null;
}

/**
 * Check 11: events that read as a way to enquire, happening `UNCOUNTED_FLOOR`
 * times or more in 12 months, that nothing counts — neither ticked, nor
 * copied by a counted conversion on the newest days either happened (Ronins'
 * "Form sent" rebuilt from "contact"). One that copies an event never an
 * enquiry is no enquiry, however it is named: Ronins' "Form sent", its link
 * clicks until 2026-10-13, was advised as 209 uncounted enquiries. The most first.
 */
export function enquiriesUncounted(
  counted: readonly string[],
  year: ReadonlyArray<{ eventName: string; times: number }>,
  series: ReadonlyMap<string, Days>,
): Array<{ eventName: string; times: number }> {
  const countedNames = new Set(counted);
  return year
    .filter((row) => !countedNames.has(row.eventName) && readsAsEnquiry(row.eventName) && row.times >= UNCOUNTED_FLOOR)
    .filter((row) => !counted.some((eventName) => daysAlike(series.get(eventName) ?? NO_DAYS, series.get(row.eventName) ?? NO_DAYS) > 0))
    .filter((row) => !lookalikeOf(row.eventName, series))
    .sort((left, right) => right.times - left.times);
}

/**
 * Check 12: counted conversions that never happen — none in 90 days on a
 * website with `SILENT_VISITS` visits in them, or none in 12 months on a
 * quieter one, where 90 silent days mean little. The days judged go with them.
 */
export function neverHappening(
  counted: readonly string[],
  quarter: { visits: number; times: ReadonlyMap<string, number> } | null,
  year: ReadonlyMap<string, number> | null,
): { names: string[]; days: 90 | 365 } {
  if (quarter && quarter.visits >= SILENT_VISITS) return { names: counted.filter((eventName) => (quarter.times.get(eventName) ?? 0) === 0), days: 90 };
  return { names: year ? counted.filter((eventName) => (year.get(eventName) ?? 0) === 0) : [], days: 365 };
}

/** An event list's times by event: its rows' own names. */
const timesOf = (rows: readonly ListRow[]) => new Map(rows.map((row) => [row.key, row.times ?? 0]));

/** Days in a row two listed events must count the same before Connection says one is very likely a copy of the other. */
export const COPY_DAYS = 3;

/**
 * Listed events that count the same, day for day, on each of at least
 * `COPY_DAYS` days in a row back from the newest either happened — the first
 * in the list's order named with the one it matches — for Choose what counts
 * to say so when both are ticked (conversions-back-in-time-plan.md BT5).
 */
export function copiesAmong(listed: readonly string[], series: ReadonlyMap<string, Days>): Array<{ eventName: string; of: string }> {
  const copies: Array<{ eventName: string; of: string }> = [];
  for (const [at, eventName] of listed.entries()) {
    for (const of of listed.slice(at + 1)) {
      if (daysAlike(series.get(eventName) ?? NO_DAYS, series.get(of) ?? NO_DAYS) >= COPY_DAYS) copies.push({ eventName, of });
    }
  }
  return copies;
}

/** The twelve checks, worked out from what is kept. */
export async function checksOf(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">): Promise<Result[]> {
  const website = await ctx.db.get(connection.websiteId);
  const site = bareHost(website?.host ?? "");
  const events = connection.events ?? [];
  const counted = events.filter((event) => event.counted);
  const results: Result[] = [];

  // 1. Nothing counted: no key events in the property, or none ticked.
  results.push({ check: "NOTHING_COUNTED", passing: counted.length > 0 });

  // The days kept, every device, oldest first: checks 2 to 4 read them.
  const newest = connection.newestDay;
  const days = newest
    ? (await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("list", "total").eq("device", "").gte("day", shiftDay(newest, -34)))
      .take(DAYS_READ)).map((part) => ({ day: part.day, row: unpackPart(part as PackedPart)[0] }))
    : [];
  const byDay = new Map(days.map((entry) => [entry.day, entry.row]));
  const visitsOn = (day: string) => byDay.get(day)?.visits ?? 0;

  // 2. No value: a ticked event with conversions and no value in Analytics or Hakken.
  const unvalued = counted.filter((event) => event.analyticsValue === null && event.hakkenValue === null && event.eventName !== "purchase");
  const unvaluedCount = unvalued.reduce((sum, event) => sum + days.reduce((inner, entry) => inner + (entry.row?.counts.get(event.eventName) ?? 0), 0), 0);
  results.push({ check: "NO_VALUE", passing: unvalued.length === 0, names: unvalued.map((event) => event.eventName), count: unvaluedCount });

  // 3. Tracking stopped: the newest settled day had no visits after weeks of steady ones.
  if (newest) {
    const settled = shiftDay(newest, -2);
    const steady = Array.from({ length: STEADY_DAYS }, (_, index) => shiftDay(settled, -(index + 1))).every((day) => visitsOn(day) > 0);
    results.push({ check: "TRACKING_STOPPED", passing: !(steady && byDay.has(settled) && visitsOn(settled) === 0), names: [settled] });
  } else {
    results.push({ check: "TRACKING_STOPPED", passing: true });
  }

  // 4. A sudden fall: the last week's visits or conversions 40% under the four weeks before, on a website with 100 visits a week.
  if (newest) {
    const week = (from: number) => Array.from({ length: 7 }, (_, index) => shiftDay(newest, -(from + index)));
    const sum = (list: string[], field: "visits" | "conversions") => list.reduce((total, day) => {
      const row = byDay.get(day);
      if (!row) return total;
      return total + (field === "visits" ? row.visits : counted.reduce((inner, event) => inner + (row.counts.get(event.eventName) ?? 0), 0));
    }, 0);
    const recent = week(0);
    const earlier = [week(7), week(14), week(21), week(28)];
    const before = (field: "visits" | "conversions") => earlier.reduce((total, list) => total + sum(list, field), 0) / earlier.length;
    const fell = (["visits", "conversions"] as const).filter((field) => before("visits") >= FALL_FLOOR && before(field) > 0 && sum(recent, field) < before(field) * (1 - FALL_SHARE));
    const share = fell.length > 0 ? 1 - sum(recent, fell[0]) / before(fell[0]) : undefined;
    results.push({ check: "SUDDEN_FALL", passing: fell.length === 0, names: fell, ...(share !== undefined ? { share } : {}) });
  } else {
    results.push({ check: "SUDDEN_FALL", passing: true });
  }

  // 5 to 7, from the last 30 days' channels and landing pages.
  const channels = await slotRows(ctx, connection, slotKey("channel", "30", "NOW", "")) ?? [];
  const totalVisits = channels.reduce((sum, row) => sum + row.visits, 0);
  const referrals = channels.map((row) => ({ ...splitChannelKey(row.key), visits: row.visits })).filter((row) => row.channel === "Referral");
  const self = referrals.filter((row) => site && bareHost(row.source) === site);
  results.push({ check: "SELF_REFERRAL", passing: self.length === 0, names: self.map((row) => row.source), count: self.reduce((sum, row) => sum + row.visits, 0) });
  const payments = referrals.filter((row) => PAYMENT_SOURCES.some((payment) => row.source.toLowerCase() === payment || row.source.toLowerCase().endsWith(`.${payment}`) || row.source.toLowerCase().includes(payment)));
  results.push({ check: "PAYMENT_REFERRALS", passing: payments.length === 0, names: payments.map((row) => row.source), count: payments.reduce((sum, row) => sum + row.visits, 0) });
  const unassigned = channels.filter((row) => splitChannelKey(row.key).channel === "Unassigned").reduce((sum, row) => sum + row.visits, 0);
  const landing = await slotRows(ctx, connection, slotKey("landing", "30", "NOW", "")) ?? [];
  const notSet = landing.filter((row) => row.key === "(not set)").reduce((sum, row) => sum + row.visits, 0);
  const unknownShare = totalVisits > 0 ? Math.max(unassigned, notSet) / totalVisits : 0;
  results.push({ check: "TOO_MUCH_UNKNOWN", passing: unknownShare <= UNKNOWN_SHARE, share: unknownShare, count: Math.max(unassigned, notSet) });

  // 8. Strangers: visits recorded on other addresses — a staging site, spam.
  const strangers = (connection.hostVisits ?? []).filter((entry) => entry.visits > 0 && bareHost(entry.host) !== site && entry.host !== "(not set)");
  results.push({ check: "STRANGERS", passing: strangers.length === 0, names: strangers.map((entry) => entry.host), count: strangers.reduce((sum, entry) => sum + entry.visits, 0) });

  // 9. Counted again: a page Google counts 1.5 times or more a visit that saw it — its contents links taken as new views —
  // which makes visits look deeper than they are (analytics-page-screen-plan.md, phase 6). The last 90 days' pages.
  const pages = await slotRows(ctx, connection, slotKey("page", "90", "NOW", "")) ?? [];
  const again = pages
    .filter((row) => row.views >= COUNTED_AGAIN_FLOOR && row.visits > 0 && row.views / row.visits >= COUNTED_AGAIN && row.key !== "(not set)")
    .sort((left, right) => right.views / right.visits - left.views / left.visits);
  const named = await decodePages(ctx, connection.companyWebsiteId, again.slice(0, COUNTED_AGAIN_NAMED).map((row) => row.key));
  results.push({
    check: "COUNTED_AGAIN",
    passing: again.length === 0,
    names: named.map((address) => address.replace(/^https?:\/\/[^/]+/, "") || "/"),
    count: again.length,
  });

  // 10 to 12: what each conversion really is, from each event's times — a day for 30 days, and in 90 days and 12 months.
  // A list not kept yet (a website's first days; the long periods come weekly) passes rather than guesses.
  const countedNames = counted.map((event) => event.eventName);
  const seriesRows = await eventDays(ctx, connection);
  const series = timesByDay(seriesRows ?? []);
  const copies = seriesRows ? somethingElse(countedNames, series) : [];
  results.push({
    check: "SOMETHING_ELSE",
    passing: copies.length === 0,
    names: copies.map((copy) => copy.eventName),
    others: copies.map((copy) => copy.other),
    ...(copies.length > 0 ? { count: copies[0].days } : {}),
  });
  const yearRows = await slotRows(ctx, connection, slotKey("event", "365", "NOW", ""));
  const uncounted = yearRows && seriesRows
    ? enquiriesUncounted(countedNames, yearRows.map((row) => ({ eventName: row.key, times: row.times ?? 0 })), series)
    : [];
  results.push({
    check: "ENQUIRY_UNCOUNTED",
    passing: uncounted.length === 0,
    names: uncounted.map((row) => row.eventName),
    ...(uncounted.length > 0 ? { count: uncounted[0].times } : {}),
  });
  const quarterRows = await slotRows(ctx, connection, slotKey("event", "90", "NOW", ""));
  const quarterTotal = await slotRows(ctx, connection, slotKey("total", "90", "NOW", ""));
  const silent = neverHappening(
    countedNames,
    quarterRows && quarterTotal ? { visits: quarterTotal.reduce((sum, row) => sum + row.visits, 0), times: timesOf(quarterRows) } : null,
    yearRows ? timesOf(yearRows) : null,
  );
  results.push({ check: "NEVER_HAPPENS", passing: silent.names.length === 0, names: silent.names, count: silent.days });

  return HEALTH_CHECKS.map((check) => results.find((result) => result.check === check)!);
}

const BELL: Partial<Record<HealthCheck, (result: Result, host: string) => { title: string; body: string }>> = {
  NOTHING_COUNTED: (_, host) => ({ title: `${host}: nothing counts as a conversion`, body: "Tick the events that are a conversion on its Google Analytics Connection page, and their whole history is counted too." }),
  NO_VALUE: (result, host) => ({ title: `${host}: a conversion has no value`, body: `${(result.names ?? []).join(", ")} has no value in Google Analytics or here, so it adds nothing to Value. Set one from Tracking health.` }),
  TRACKING_STOPPED: (_, host) => ({ title: `${host}: Google Analytics stopped counting`, body: "A day went by with no visits after weeks of steady ones: the tracking tag may have come off the website. Tracking health says how to check." }),
  SUDDEN_FALL: (result, host) => ({ title: `${host}: a sudden fall`, body: `The last week's ${(result.names ?? ["visits"])[0]} were ${Math.round((result.share ?? 0) * 100)}% under the four weeks before. Tracking health says what to check.` }),
  SELF_REFERRAL: (_, host) => ({ title: `${host}: its own address as a referral`, body: "Visits are being split in two by a redirect or a second domain. Tracking health says how to fix it." }),
  PAYMENT_REFERRALS: (result, host) => ({ title: `${host}: payment pages taking the credit`, body: `${(result.names ?? []).join(", ")} show up as referrals, taking the credit for sales. Tracking health says how to fix it.` }),
  TOO_MUCH_UNKNOWN: (result, host) => ({ title: `${host}: too many visits of unknown origin`, body: `${Math.round((result.share ?? 0) * 100)}% of visits have no channel or no landing page. Tracking health says what to check.` }),
  STRANGERS: (result, host) => ({ title: `${host}: visits on another address`, body: `${result.count ?? 0} visits were recorded on ${(result.names ?? []).join(", ")}. They're left out of the figures; Tracking health says how to stop them.` }),
  COUNTED_AGAIN: (result, host) => ({ title: `${host}: pages counted more than once a visit`, body: `Google Analytics counts ${(result.names ?? []).join(", ")} again and again in one visit, so pages a visit and bounce rate read better than they are. Tracking health says how to fix it.` }),
  SOMETHING_ELSE: (result, host) => ({
    title: `${host}: a conversion is really something else`,
    body: `${result.names?.[0] ?? ""} matches ${result.others?.[0] ?? ""} on each of the last ${result.count ?? 0} days either happened, so it isn't counting enquiries. Tracking health says how to fix it.`,
  }),
  ENQUIRY_UNCOUNTED: (result, host) => ({
    title: `${host}: an enquiry isn't counted`,
    body: `${(result.names ?? []).join(", ")} happened ${result.count ?? 0} times in 12 months, but nothing counts it as a conversion. Tracking health says how to fix it.`,
  }),
  NEVER_HAPPENS: (result, host) => ({
    title: `${host}: a conversion never happens`,
    body: `${(result.names ?? []).join(", ")} hasn't happened once in ${result.count === 90 ? "the last 90 days" : "12 months"}: the tag that sends it may be missing or broken. Tracking health says how to check.`,
  }),
};

/**
 * Run the checks and keep their results. Each check that starts failing
 * tells the platform's super admins in the bell, once (GA12).
 */
export const runHealthChecks = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED") return null;
    const results = await checksOf(ctx, connection);
    const wasFailing = new Set((connection.health?.checks ?? []).filter((check) => !check.passing).map((check) => check.check));
    // Which listed events count the same day for day, for Choose what counts (BT5), from the same 30 days a day,
    // and which copy an event never an enquiry, named with it, so ticking one is warned against.
    const series = await eventDays(ctx, connection);
    const listed = (connection.events ?? []).map((event) => event.eventName);
    const days = series ? timesByDay(series) : null;
    const copies = days
      ? [...copiesAmong(listed, days), ...listed.flatMap((eventName) => {
        const other = lookalikeOf(eventName, days);
        return other ? [{ eventName, of: other.other }] : [];
      })]
      : [];
    await ctx.db.patch(connection._id, { health: { checkedAt: Date.now(), checks: results }, copies, updatedAt: Date.now() });
    const website = await ctx.db.get(connection.websiteId);
    const host = website?.displayHost ?? website?.host ?? "";
    for (const result of results) {
      if (result.passing || wasFailing.has(result.check)) continue;
      const words = BELL[result.check]?.(result, host);
      if (!words) continue;
      await tellSuperAdmins(ctx, connection, words.title, words.body, `/app/analytics/${connection.companyWebsiteId}/tracking-health`, "GOOGLE_ANALYTICS_HEALTH", { once: true });
    }
    return null;
  },
});

/** The platform's super admins read for a notice: people, few by nature. */
const SUPER_ADMINS_READ = 500;
/** A person's unread notices read to find the same alert already waiting. */
const UNREAD_READ = 200;

/**
 * A system alert in the bell, for the platform's super admins alone — never a
 * company's own admins (Anthony, 2026-10-10: "These are system alerts not
 * company alerts; they need to only go to sys admins").
 *
 * With `once`, a person whose bell already holds the same alert unread is not
 * told again: Ronins' three alerts reached the same super admin at 07:43 and
 * again at 07:58 on 2026-10-10 (plan §16), and GA12 says once. The checks'
 * own "was failing" rule stays the first guard; this one holds even when two
 * runs see the same old results.
 */
export async function tellSuperAdmins(
  ctx: MutationCtx,
  connection: Doc<"googleAnalyticsConnections">,
  title: string,
  body: string,
  href: string,
  kind: string,
  options: { once?: boolean } = {},
) {
  const superAdmins = await ctx.db
    .query("users")
    .withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN"))
    .take(SUPER_ADMINS_READ);
  for (const person of superAdmins) {
    if (options.once) {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) => q.eq("userId", person._id).eq("readAt", undefined))
        .take(UNREAD_READ);
      if (unread.some((notice) => notice.kind === kind && notice.href === href && notice.title === title)) continue;
    }
    await ctx.runMutation(internal.notifications.notifyUserInternal, { userId: person._id, companyId: connection.companyId, kind, title, body, href });
  }
}
