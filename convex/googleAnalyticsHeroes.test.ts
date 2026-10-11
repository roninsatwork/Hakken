import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { channelKey, packList, type ListRow } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";

/**
 * Heroes and attention, end to end (docs/plans/active/google-analytics-plan.md
 * §13): Search Console's pages and searches joined to Analytics' landing
 * pages page by page, the website's own figures from Search Console's totals,
 * each page's problems and worth, the tabs, and one page's own view — read by
 * the caller's own hold.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const EVENTS = ["generate_lead"];

/** An Analytics row: visits, engaged visits and form fills at £20 each (set in Hakken). */
const row = (key: string, visits: number, engaged: number, leads: number): ListRow => ({
  key, visits, engaged, seconds: visits * 30, views: visits, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0,
  counts: new Map([["generate_lead", leads]]), values: new Map([["generate_lead", 0]]),
});

async function slot(t: Harness, siteId: Id<"companyWebsites">, list: "landing" | "channel", which: "NOW" | "BEFORE", rows: ListRow[]) {
  await t.run(async (ctx) => {
    const key = slotKey(list, "30", which, "");
    const parts = packList(list, rows, EVENTS);
    await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: siteId, key, slot: 0, parts: parts.length, from: "2026-09-10", to: "2026-10-09", hash: "x", builtAt: 1 });
    for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: siteId, key, slot: 0, part, ...packed });
  });
}

/** Search Console's ready-made 30 days: a list of rows, as the collector keeps them unpacked. */
async function consoleList(t: Harness, siteId: Id<"companyWebsites">, list: "page" | "query", which: "NOW" | "BEFORE", rows: Array<[string, number, number, number]>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: siteId, searchType: "web", list, period: "30", which, part: 0, from: "2026-09-09", to: "2026-10-08",
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
      currency: "GBP", newestDay: "2026-10-09", oldestDay: "2026-08-11", eventsReadAt: 1,
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: 20, lastThirtyDays: 7 }],
      createdAt: 1, updatedAt: 1,
    });
    // The hold's page numbers: Analytics names its landing pages by them.
    await ctx.db.insert("holdPageAddresses", { companyWebsiteId: siteId, record: 0, addresses: ["https://www.acme.test/", "https://www.acme.test/guide", "https://www.acme.test/service/"] });
    if (withConsole) {
      await ctx.db.insert("searchConsoleConnections", { companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", newestDay: "2026-10-08", createdAt: 1, updatedAt: 1 });
      // Search Console's own totals: more clicks than its pages add up to.
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: "2026-10-08", clicks: 400, impressions: 300_000, ctr: 400 / 300_000, position: 18, fetchedAt: 1 });
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

const LIST = { tab: "all" as const, page: 1, rows: 25 };

describe("Heroes and attention", () => {
  test("joins each page from Google's results to its money, folding /guide and /guide/ into one page", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const heroes = await user.query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST });
    expect(heroes.state).toBe("READY");
    expect(heroes.rows[1]).toMatchObject({ ref: "~1", console: "https://www.acme.test/guide/" });
    expect(heroes.rows.map((one) => [one.page, one.main, one.hero])).toEqual([
      ["/service/", "push", false],
      ["/guide/", "convert", false],
      ["/", "hero", true],
    ]);
    // Not converting: 188 visits × the website's 1% × £20, in hundredths.
    expect(heroes.rows[1].worth).toBeCloseTo(188 * 0.01 * 2_000);
    // Push to page one: 60,000 showings × (0.7% − 0.05%) × 1% × £20.
    expect(heroes.rows[0].worth).toBeCloseTo(60_000 * (0.007 - 0.0005) * 0.01 * 2_000);
    expect(heroes.tabs).toEqual([
      { tab: "all", count: 3 }, { tab: "hero", count: 1 }, { tab: "push", count: 1 }, { tab: "click", count: 0 },
      { tab: "convert", count: 1 }, { tab: "leave", count: 0 }, { tab: "fall", count: 0 },
    ]);
  });

  test("the website's figures come from Search Console's own totals and Google's own visits", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const { stages, totalGain, seen } = await user.query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST });
    expect(stages).toMatchObject({ shown: 300_000, clicks: 400, position: 18, visits: 600, conversions: 4, value: 8_000, websiteValue: 20_000, heroes: 1, heroesValue: 12_000 });
    expect(stages.gainInGoogle + stages.gainOnPages).toBe(totalGain);
    expect(stages.marked).toBe(1);
    expect(seen.says[0]).toMatchObject({ code: "mostInGoogle", a: 300_000, c: totalGain });
    expect(seen.steps.map((step) => step.code)).toEqual(["pushOne", "nextStep", "leaveHeroesOne"]);
  });

  test("a tab lists its own pages, searched from the start of a word", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    const heroes = await user.query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST, tab: "hero" });
    expect(heroes.rows).toMatchObject([{ page: "/", main: "hero", worth: null }]);
    const searched = await user.query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST, q: "guide" });
    expect(searched.rows.map((one) => one.page)).toEqual(["/guide/"]);
  });

  test("one page's own view: its four stages, its problems, and where its other screens are", async () => {
    const t = harness();
    const { siteId, user } = await connected(t);
    // A landing page's own screen names it by Analytics' number; a row of Heroes by its path, with both of its sources' names.
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
    }
  });

  test("without Search Console, only what happens on the pages is judged", async () => {
    const t = harness();
    const { siteId, user } = await connected(t, false);
    const heroes = await user.query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST });
    expect(heroes.consoleConnected).toBe(false);
    expect(heroes.stages).toMatchObject({ shown: null, clicks: null });
    expect(heroes.rows.map((one) => one.main)).toEqual(["convert", "hero"]);
    expect(heroes.seen.says.map((phrase) => phrase.code)).toContain("noConsole");
  });

  test("another company's website answers as a missing one", async () => {
    const t = harness();
    const { siteId } = await connected(t);
    const stranger = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      return await ctx.db.insert("users", { name: "Other", email: "other@other.test", role: "ADMIN", companyId, createdAt: 1 });
    });
    await expect(t.withIdentity({ subject: stranger }).query(api.googleAnalyticsHeroes.analyticsHeroes, { siteId, ...LIST })).rejects.toThrow(/not one your company holds/);
  });
});
