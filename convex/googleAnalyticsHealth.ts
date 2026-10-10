import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { shiftDay } from "./searchConsoleDays";
import { bareHost } from "./googleAnalyticsApi";
import { slotKey } from "./googleAnalyticsCollect";
import { splitChannelKey, unpackPart, type PackedPart } from "./googleAnalyticsLists";
import { HEALTH_CHECKS, type HealthCheck } from "./googleAnalyticsSchema";

/**
 * Whether Google Analytics is counting a website properly
 * (docs/plans/active/google-analytics-plan.md §6, GA11, GA12): eight checks,
 * run when the first collection finishes and with every weekly one, each
 * saying what is wrong, why it matters and how to fix it on the Tracking
 * health page. When a check starts failing the company's admins get one
 * notification in the bell — once, never every week it stays failing.
 *
 * Read from what the collection already keeps: the days, the 30 days' channels
 * and landing pages, the addresses' visits asked weekly. Nothing is asked of
 * Google here.
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

/** Payment pages that take the credit for sales when they come back as referrals (§6, check 6). */
export const PAYMENT_SOURCES: readonly string[] = [
  "paypal.com", "stripe.com", "checkout.stripe.com", "worldpay.com", "opayo.co.uk", "sagepay.com", "klarna.com",
  "clearpay.co.uk", "afterpay.com", "checkout.com", "adyen.com", "squareup.com", "mollie.com", "gocardless.com",
  "3dsecure", "secure5.arcot.com", "pay.google.com", "apple.com",
];

type Result = { check: HealthCheck; passing: boolean; names?: string[]; count?: number; share?: number };

async function slotRows(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">, key: string) {
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", key))
    .first();
  if (!slot) return null;
  const parts = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("key", key).eq("slot", slot.slot))
    .take(slot.parts);
  return parts.flatMap((part) => unpackPart(part as PackedPart));
}

/** The eight checks, worked out from what is kept. */
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

  return HEALTH_CHECKS.map((check) => results.find((result) => result.check === check)!);
}

const BELL: Partial<Record<HealthCheck, (result: Result, host: string) => { title: string; body: string }>> = {
  NOTHING_COUNTED: (_, host) => ({ title: `${host}: nothing counts as a conversion`, body: "Tick the events that are a conversion on its Google Analytics Connection page, and they are counted for the past 90 days too." }),
  NO_VALUE: (result, host) => ({ title: `${host}: a conversion has no value`, body: `${(result.names ?? []).join(", ")} has no value in Google Analytics or here, so it adds nothing to Value. Set one from Tracking health.` }),
  TRACKING_STOPPED: (_, host) => ({ title: `${host}: Google Analytics stopped counting`, body: "A day went by with no visits after weeks of steady ones: the tracking tag may have come off the website. Tracking health says how to check." }),
  SUDDEN_FALL: (result, host) => ({ title: `${host}: a sudden fall`, body: `The last week's ${(result.names ?? ["visits"])[0]} were ${Math.round((result.share ?? 0) * 100)}% under the four weeks before. Tracking health says what to check.` }),
  SELF_REFERRAL: (_, host) => ({ title: `${host}: its own address as a referral`, body: "Visits are being split in two by a redirect or a second domain. Tracking health says how to fix it." }),
  PAYMENT_REFERRALS: (result, host) => ({ title: `${host}: payment pages taking the credit`, body: `${(result.names ?? []).join(", ")} show up as referrals, taking the credit for sales. Tracking health says how to fix it.` }),
  TOO_MUCH_UNKNOWN: (result, host) => ({ title: `${host}: too many visits of unknown origin`, body: `${Math.round((result.share ?? 0) * 100)}% of visits have no channel or no landing page. Tracking health says what to check.` }),
  STRANGERS: (result, host) => ({ title: `${host}: visits on another address`, body: `${result.count ?? 0} visits were recorded on ${(result.names ?? []).join(", ")}. They're left out of the figures; Tracking health says how to stop them.` }),
};

/**
 * Run the checks and keep their results. Each check that starts failing
 * tells the company's admins in the bell, once (GA12).
 */
export const runHealthChecks = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED") return null;
    const results = await checksOf(ctx, connection);
    const wasFailing = new Set((connection.health?.checks ?? []).filter((check) => !check.passing).map((check) => check.check));
    await ctx.db.patch(connection._id, { health: { checkedAt: Date.now(), checks: results }, updatedAt: Date.now() });
    const website = await ctx.db.get(connection.websiteId);
    const host = website?.displayHost ?? website?.host ?? "";
    for (const result of results) {
      if (result.passing || wasFailing.has(result.check)) continue;
      const words = BELL[result.check]?.(result, host);
      if (!words) continue;
      await tellAdmins(ctx, connection, words.title, words.body, `/app/analytics/${connection.companyWebsiteId}/tracking-health`, "GOOGLE_ANALYTICS_HEALTH");
    }
    return null;
  },
});

/** Users read for a company's admins, and for the platform's super admins: people, small by nature. */
const PEOPLE_READ = 200;
const PLATFORM_PEOPLE_READ = 500;

/**
 * The company's admins, each told in the bell. A company with no admin of
 * its own — one the platform's super admins run for it, as Ronins Agency —
 * tells the super admins instead, so a notice always reaches someone (board 10).
 */
export async function tellAdmins(
  ctx: MutationCtx,
  connection: Doc<"googleAnalyticsConnections">,
  title: string,
  body: string,
  href: string,
  kind: string,
) {
  const members = await ctx.db
    .query("users")
    .withIndex("by_company", (q) => q.eq("companyId", connection.companyId))
    .take(PEOPLE_READ);
  let told = members.filter((row) => row.role === "ADMIN");
  if (told.length === 0) {
    told = (await ctx.db.query("users").withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN")).take(PLATFORM_PEOPLE_READ));
  }
  for (const person of told) {
    await ctx.runMutation(internal.notifications.notifyUserInternal, { userId: person._id, companyId: connection.companyId, kind, title, body, href });
  }
}
