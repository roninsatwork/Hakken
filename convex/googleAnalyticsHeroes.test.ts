import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { channelKey, packList, type ListRow } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";

/**
 * A landing page's four stages, end to end (docs/plans/active/
 * google-analytics-plan.md §13, §15 screen 7): Search Console's pages and
 * searches joined to Analytics' landing pages page by page, each page's
 * problems and worth, and whether it is a hero — read by the caller's own
 * hold.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const EVENTS = ["generate_lead"];

/** An Analytics row: visits, engaged visits and form fills at £20 each (set in Hakken). */
const row = (key: string, visits: number, engaged: number, leads: number): ListRow => ({
  key, visits, engaged, seconds: visits * 30, views: visits, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0,
  counts: new Map([["generate_lead", leads]]), values: new Map([["generate_lead", 0]]),
});

/** Last month, September, and the month before it, August: the period every figure here covers (calendar-periods-plan.md). */
const MONTHS = { NOW: { from: "2026-09-01", to: "2026-09-30" }, BEFORE: { from: "2026-08-01", to: "2026-08-31" } } as const;

async function slot(t: Harness, siteId: Id<"companyWebsites">, list: "landing" | "channel", which: "NOW" | "BEFORE", rows: ListRow[]) {
  await t.run(async (ctx) => {
    const key = slotKey(list, "lastMonth", which, "");
    const parts = packList(list, rows, EVENTS);
    await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, ...MONTHS[which], hash: "x", builtAt: 1 });
    for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
  });
}

/** Search Console's ready-made last month: a list of rows, as the collector keeps them unpacked. */
async function consoleList(t: Harness, siteId: Id<"companyWebsites">, list: "page" | "query", which: "NOW" | "BEFORE", rows: Array<[string, number, number, number]>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: siteId, searchType: "web", list, period: "lastMonth", which, part: 0, ...MONTHS[which],
      keys: rows.map(([key]) => key), clicks: rows.map(([, clicks]) => clicks), impressions: rows.map(([, , shown]) => shown),
      positionSums: rows.map(([, , shown, position]) => shown * position), counts: rows.map(() => 1), tops: rows.map(([key]) => key), builtAt: 1,
    });
  });
}

/** A website connected to both, with a hero, a page to push and a guide that does not convert. */
async function connected(t: Harness, withConsole = true) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme.test", role: "ADMIN", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "properties/1", addresses: ["www.acme.test"],
      currency: "GBP", newestDay: "2026-10-09", oldestDay: "2026-08-11", eventsReadAt: 1, listedWith: "EVENT_COUNT_ADDRESSES",
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 7 }],
      createdAt: 1, updatedAt: 1,
    });
    // The hold's page numbers: Analytics names its landing pages by them.
    await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record: 0, addresses: ["https://www.acme.test/", "https://www.acme.test/guide", "https://www.acme.test/service/"] });
    if (withConsole) {
      await ctx.db.insert("searchConsoleConnections", { companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", newestDay: "2026-10-08", createdAt: 1, updatedAt: 1 });
      // Search Console's own totals: more clicks than its pages add up to.
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: "2026-09-30", clicks: 400, impressions: 300_000, ctr: 400 / 300_000, position: 18, fetchedAt: 1 });
    }
    return { companyId, userId, siteId };
  });
  // 1,000 visits and 10 form fills: 1% converting, at £20 each.
  await slot(t, ids.siteId, "landing", "NOW", [row("~0", 200, 120, 6), row("~1", 188, 81, 0), row("~2", 5, 3, 0)]);
  await slot(t, ids.siteId, "landing", "BEFORE", [row("~0", 190, 110, 6), row("~1", 200, 90, 1)]);
  await slot(t, ids.siteId, "channel", "NOW", [row(channelKey("Organic Search", "google"), 600, 330, 4), row(channelKey("Direct", "(direct)"), 400, 220, 6)]);
  if (withConsole) {
    // The guide is /guide/ to Search Console and /guide to Analytics: one page.
    await consoleList(t, ids.siteId, "page", "NOW", [["https://www.acme.test/", 30, 4_000, 30], ["https://www.acme.test/guide/", 12, 2_000, 5], ["https://www.acme.test/service/", 5, 60_000, 14]]);
    await consoleList(t, ids.siteId, "page", "BEFORE", [["https://www.acme.test/service/", 4, 18_000, 15]]);
    // The website's searches: 0.7% clicked in the top three, 0.05% at 11 to 20.
    await consoleList(t, ids.siteId, "query", "NOW", [["acme", 70, 10_000, 2], ["acme services", 10, 20_000, 15]]);
  }
  return { ...ids, user: t.withIdentity({ subject: ids.userId }) };
}

describe("a landing page's four stages", () => {
  test("one page's own view: its four stages, its problems, and where its other screens are", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    // A landing page's own screen names it by Analytics' number; it can also be asked by its path, with both of its sources' names.
    // The guide is /guide/ to Search Console and /guide to Analytics: one page.
    for (const ask of [{ page: "~1" }, { page: "/guide/", ref: "~1", console: "https://www.acme.test/guide/" }]) {
      const { found } = await user.query(api.googleAnalyticsHeroes.analyticsHeroPage, { siteId, ...ask });
      expect(found).toMatchObject({
        page: "/guide/",
        landingKey: "~1",
        consoleAddress: "https://www.acme.test/guide/",
        google: { shown: 2_000, clicks: 12, position: 5 },
        visits: { visits: 188, conversions: 0 },
        visitsBefore: { visits: 200, conversions: 1 },
        marked: 3,
      });
      expect(found?.problems.map((problem) => problem.kind)).toEqual(["convert"]);
      // Not converting: 188 visits × the website's 1% × £20, in hundredths.
      expect(found?.problems[0].worth).toBeCloseTo(188 * 0.01 * 2_000, 0);
    }
  });

  test("a page to push is priced from the website's own click rates, and a hero is marked at its money", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const pushed = await user.query(api.googleAnalyticsHeroes.analyticsHeroPage, { siteId, page: "~2" });
    expect(pushed.state).toBe("READY");
    expect(pushed.found).toMatchObject({ page: "/service/", hero: false, marked: 0, google: { shown: 60_000 }, googleBefore: { shown: 18_000 } });
    expect(pushed.found?.problems.map((problem) => problem.kind)).toEqual(["push"]);
    // Push to page one: 60,000 showings × (0.7% − 0.05%) × 1% × £20.
    expect(pushed.found?.problems[0].worth).toBeCloseTo(60_000 * (0.007 - 0.0005) * 0.01 * 2_000, 0);
    const hero = await user.query(api.googleAnalyticsHeroes.analyticsHeroPage, { siteId, page: "~0" });
    expect(hero.found).toMatchObject({ page: "/", hero: true, problems: [], marked: 3 });
    expect(hero.found?.website.value).toBe(20_000);
  });

  test("without Search Console, only what happens on the page is judged", async () => {
    const t = harness();
    const { siteId, user } = await connected(t, false);
    const { consoleConnected, found } = await user.query(api.googleAnalyticsHeroes.analyticsHeroPage, { siteId, page: "~1" });
    expect(consoleConnected).toBe(false);
    expect(found).toMatchObject({ google: null, consoleAddress: null, problems: [{ kind: "convert" }] });
  });

  test("another company's website answers as a missing one", async () => {
    const t = harness();
    const { siteId } = await connected(t);
    const stranger = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      return await ctx.db.insert("users", { name: "Other", email: "other@other.test", role: "ADMIN", companyId, createdAt: 1 });
    });
    await expect(t.withIdentity({ subject: stranger }).query(api.googleAnalyticsHeroes.analyticsHeroPage, { siteId, page: "~1" })).rejects.toThrow(/not one your company holds/);
  });
});
