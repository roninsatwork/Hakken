import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DAY_JOIN, emptyRow } from "./googleAnalyticsLists";
import { ELSEWHERE_FLOOR, conversionsElsewhere, copiesAmong, daysAlike, enquiriesUncounted, lookalikeOf, neverHappening, somethingElse, timesByDay } from "./googleAnalyticsHealth";

/**
 * Tracking health's bell alerts (docs/plans/active/google-analytics-plan.md
 * §6, GA12): a check that starts failing tells the platform's super admins
 * once — not again while it stays failing, and not again while the same alert
 * waits unread, even when two runs read the same old results (§16: Ronins'
 * alerts reached the bell twice on 2026-10-10).
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/** A connected website with nothing ticked, so "nothing counted" fails; one super admin, one company admin. */
async function seeded(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const superAdminId = await ctx.db.insert("users", { name: "Platform", email: "platform@hakken.test", role: "SUPER_ADMIN", createdAt: 1 });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", propertyName: "Acme",
      stream: "https://www.acme-shop.test", addresses: ["www.acme-shop.test"], otherAddresses: [],
      timeZone: "Europe/London", currency: "GBP", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "generate_lead", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
      createdAt: 1, updatedAt: 1,
    });
    return { superAdminId, adminId, connectionId };
  });
}

const alertsOf = (t: Harness, userId: Id<"users">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("notifications").withIndex("by_user_created", (q) => q.eq("userId", userId)).collect())
      .filter((notice) => notice.kind === "GOOGLE_ANALYTICS_HEALTH"));

describe("tracking health's bell alerts", () => {
  test("a failing check tells the super admins once, never a company's admins", async () => {
    const t = harness();
    const { superAdminId, adminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    const alerts = await alertsOf(t, superAdminId);
    expect(alerts.map((notice) => notice.title)).toEqual(["acme-shop.test: nothing counts as a conversion"]);
    expect(await alertsOf(t, adminId)).toEqual([]);
  });

  test("the same alert waiting unread is not sent again, even when a run reads no earlier results", async () => {
    const t = harness();
    const { superAdminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    // Two runs that both read the results before either was kept look like this.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { health: undefined }));
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    expect(await alertsOf(t, superAdminId)).toHaveLength(1);
  });

  test("once read, a check that passes and then fails again tells them again", async () => {
    const t = harness();
    const { superAdminId, connectionId } = await seeded(t);
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.run(async (ctx) => {
      for (const notice of await ctx.db.query("notifications").collect()) await ctx.db.patch(notice._id, { readAt: 2 });
      const connection = (await ctx.db.get(connectionId))!;
      await ctx.db.patch(connectionId, { events: connection.events!.map((event) => ({ ...event, counted: true, hakkenValue: 100 })) });
    });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    await t.run(async (ctx) => {
      const connection = (await ctx.db.get(connectionId))!;
      await ctx.db.patch(connectionId, { events: connection.events!.map((event) => ({ ...event, counted: false })) });
    });
    await t.mutation(internal.googleAnalyticsHealth.runHealthChecks, { connectionId });
    expect(await alertsOf(t, superAdminId)).toHaveLength(2);
  });
});

/**
 * What each conversion really is (docs/plans/active/conversion-checks-plan.md):
 * checks 10 to 12 on ronins.co.uk's shape before 2026-10-13 — "Form sent"
 * built from its link clicks, its real forms (`contact`) uncounted, its chat,
 * phone and email never arriving — and after the fix.
 */
describe("conversions on an address whose conversions don't count (conversion-addresses-plan.md)", () => {
  const week = [
    { host: "www.nec.ac.uk", conversions: 157 },
    { host: "store.nec.ac.uk", conversions: 210 },
    { host: "book.example-bookings.com", conversions: 12 },
    { host: "nec.staging.cm-hosting.com", conversions: 9 },
    { host: "spam.example.org", conversions: ELSEWHERE_FLOOR - 1 },
  ];

  test("a booking page Hakken didn't pick is named, the most first; the website's own, its shop, a copy and a stray test never are", () => {
    expect(conversionsElsewhere(week, "nec.ac.uk", ["store.nec.ac.uk"])).toEqual([{ host: "book.example-bookings.com", conversions: 12 }]);
  });

  test("before the shop counts, it is named first", () => {
    expect(conversionsElsewhere(week, "nec.ac.uk", []).map((entry) => entry.host)).toEqual(["store.nec.ac.uk", "book.example-bookings.com"]);
  });
});

describe("what each conversion really is", () => {
  /** Each event's times a day, as the 30 days' list of each event a day keeps them. */
  const seriesOf = (days: Record<string, Record<string, number>>) =>
    timesByDay(Object.entries(days).flatMap(([day, events]) =>
      Object.entries(events).map(([eventName, times]) => ({ ...emptyRow(`${day}${DAY_JOIN}${eventName}`), times }))));
  const day = (index: number) => `2026-10-${String(index).padStart(2, "0")}`;
  /** Ronins before the fix: a link click most days, "Form sent" the same, a real form now and then. */
  const before: Record<string, Record<string, number>> = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [day(index + 1), {
    click: index % 3 === 0 ? 0 : 1 + (index % 2),
    form_submission: index % 3 === 0 ? 0 : 1 + (index % 2),
    ...(index % 4 === 1 ? { contact: 1 } : {}),
  }]));
  const COUNTED = ["form_submission", "live_chat_event", "phone_number_click", "email_link_click"];

  test("days alike are counted back from the newest day either happened, to the last day they differed", () => {
    const series = seriesOf({ [day(1)]: { a: 2, b: 1 }, [day(2)]: { a: 1, b: 1 }, [day(3)]: {}, [day(4)]: { a: 3, b: 3 } });
    expect(daysAlike(series.get("a")!, series.get("b")!)).toBe(2);
    expect(daysAlike(series.get("a")!, new Map())).toBe(0);
  });

  test("a conversion matching link clicks day for day is really something else; one copying a real enquiry is not", () => {
    expect(somethingElse(COUNTED, seriesOf(before))).toEqual([{ eventName: "form_submission", other: "click", days: 8 }]);
    // Rebuilt from "contact": it copies a real enquiry, and differs from the clicks from the first day after.
    const after: Record<string, Record<string, number>> = { ...before, [day(13)]: { click: 2, contact: 1, form_submission: 1 }, [day(14)]: { click: 1 } };
    expect(somethingElse(COUNTED, seriesOf(after))).toEqual([]);
    // Fewer days alike than the floor say nothing yet.
    expect(somethingElse(["form_submission"], seriesOf({ [day(1)]: { click: 1, form_submission: 1 } }))).toEqual([]);
  });

  test("an enquiry happening uncounted is named the most first, until a counted conversion copies it", () => {
    const year = [
      { eventName: "contact", times: 179 }, { eventName: "click", times: 342 }, { eventName: "form_submission", times: 342 },
      { eventName: "ronins_enquiry_sent", times: 12 }, { eventName: "phone_menu_open", times: 4 },
    ];
    expect(enquiriesUncounted(COUNTED, year, seriesOf(before)).map((row) => row.eventName)).toEqual(["contact", "ronins_enquiry_sent"]);
    // Rebuilt from "contact": "Form sent" matches it on the newest day it happened, so it is counted.
    const after = { ...before, [day(13)]: { click: 2, contact: 1, form_submission: 1 } };
    expect(enquiriesUncounted(COUNTED, year, seriesOf(after)).map((row) => row.eventName)).toEqual(["ronins_enquiry_sent"]);
    // Ticked, it is counted as itself.
    expect(enquiriesUncounted([...COUNTED, "contact", "ronins_enquiry_sent"], year, seriesOf(before))).toEqual([]);
  });

  test("an uncounted event copying link clicks is no enquiry, however it is named", () => {
    // Ronins on 2026-10-13: "contact" counted, "Form sent" not, and still its link clicks in the days kept —
    // check 11 advised counting it, which would have priced 209 link clicks as enquiries for the year.
    const year = [{ eventName: "contact", times: 68 }, { eventName: "click", times: 209 }, { eventName: "form_submission", times: 209 }];
    const counted = ["contact", "live_chat_event", "phone_number_click", "email_link_click"];
    expect(enquiriesUncounted(counted, year, seriesOf(before))).toEqual([]);
    expect(lookalikeOf("form_submission", seriesOf(before))).toEqual({ other: "click", days: 8 });
    // Rebuilt from "contact", it differs from the clicks from the first day after, and is not named as them.
    const after = { ...before, [day(13)]: { click: 2, contact: 1, form_submission: 1 } };
    expect(lookalikeOf("form_submission", seriesOf(after))).toBeNull();
    // An event never an enquiry is never another's lookalike.
    expect(lookalikeOf("click", seriesOf(before))).toBeNull();
  });

  test("listed events counting the same day for day are paired for Choose what counts, the first in the list's order named", () => {
    // conversions-back-in-time-plan.md BT5: "Form sent" rebuilt from "contact" counts the same from then on.
    const after = seriesOf({
      [day(13)]: { click: 2, contact: 1, form_submission: 1 }, [day(14)]: { click: 1 },
      [day(15)]: { contact: 2, form_submission: 2 }, [day(16)]: { contact: 1, form_submission: 1, click: 3 },
    });
    expect(copiesAmong(["form_submission", "live_chat_event", "contact"], after)).toEqual([{ eventName: "form_submission", of: "contact" }]);
    // Fewer days alike than three say nothing.
    expect(copiesAmong(["form_submission", "contact"], seriesOf({ [day(13)]: { contact: 1, form_submission: 1 } }))).toEqual([]);
  });

  test("a conversion silent for 90 days on a busy website never happens; a quiet one is judged on 12 months", () => {
    const quarter = new Map([["form_submission", 21]]);
    expect(neverHappening(COUNTED, { visits: 750, times: quarter }, null))
      .toEqual({ names: ["live_chat_event", "phone_number_click", "email_link_click"], days: 90 });
    const year = new Map([["form_submission", 60], ["phone_number_click", 2]]);
    expect(neverHappening(COUNTED, { visits: 120, times: quarter }, year)).toEqual({ names: ["live_chat_event", "email_link_click"], days: 365 });
    // Neither list kept yet: nothing is guessed.
    expect(neverHappening(COUNTED, null, null)).toEqual({ names: [], days: 365 });
  });
});
