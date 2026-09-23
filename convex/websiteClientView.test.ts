import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * A company's view of one of its websites.
 *
 * Three behaviours carry the screen. **A price is never invented**: until an
 * operation has been charged at least once its cost is unknown, and the screen
 * says so. **What needs attention comes first**, sorted before the page is
 * cut, so page one of a long list is the part somebody has to act on. And **a
 * rival is compared on this site's own searches, from this site's place** —
 * never on another client's list or another town's page.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;
const WEEKLY = JSON.stringify({
  version: 2, kind: "recurring", cadence: "weekly", dayOfWeek: 1, timeLocal: "09:00", timezone: "UTC",
});

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function world(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
    await ctx.db.insert("schedules", {
      name: "Collection", companyId, intervalStr: WEEKLY, isActive: true, createdAt: Date.now(),
    } as never);
    const websiteId = await ctx.db.insert("websites", {
      host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now(),
    });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: "OWNED", createdAt: Date.now() - 90 * 86_400_000,
    });
    return { companyId, websiteId, holdId };
  });
}

async function searchStats(
  t: Harness,
  websiteId: Id<"websites">,
  keyword: string,
  fields: { firstCheckedDay: string; lastPosition?: number; previousPosition?: number; everRanked?: boolean },
) {
  await t.run(async (ctx) => await ctx.db.insert("websiteSearchStats", {
    websiteId,
    keyword,
    locationCode: UK,
    firstCheckedDay: fields.firstCheckedDay,
    lastCheckedDay: today(),
    ...(fields.lastPosition !== undefined ? { lastPosition: fields.lastPosition } : {}),
    ...(fields.previousPosition !== undefined ? { previousPosition: fields.previousPosition, previousCheckedDay: daysAgo(7) } : {}),
    everRanked: fields.everRanked ?? fields.lastPosition !== undefined,
    updatedAt: Date.now(),
  }));
}

async function track(t: Harness, websiteId: Id<"websites">, keyword: string) {
  await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", {
    websiteId, keyword, isActive: true, createdAt: Date.now(),
  }));
}

async function price(t: Harness, operationId: string, usd: number) {
  await t.run(async (ctx) => await ctx.db.insert("seoOperationCosts", {
    operationId, charged: 1, totalUsd: usd, lastUsd: usd, updatedAt: Date.now(),
  }));
}

describe("the header", () => {
  test("a price stays unknown until what it is built from has been charged", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await track(t, websiteId, "branding agency leeds");

    let header = await admin.query(api.websiteClientView.getSiteHeader, { companyWebsiteId: holdId });
    expect(header?.counts.searches).toBe(1);
    expect(header?.monthly.searches).toBeNull();

    await price(t, "serp_google_organic", 0.002);
    header = await admin.query(api.websiteClientView.getSiteHeader, { companyWebsiteId: holdId });
    // One search, weekly: the price of one page, about four and a third times a month.
    expect(header?.monthly.searches).toBeCloseTo(0.002 * 52 / 12, 6);
    expect(header?.placeLabel).toBe("United Kingdom");
    expect(header?.relationship).toBe("OWNED");
  });

  test("a site that is not collected costs nothing, however it is priced", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await track(t, websiteId, "branding agency leeds");
    await t.run(async (ctx) => await ctx.db.patch(holdId, { collectionEnabled: false, refreshIntervalStr: WEEKLY }));

    const header = await admin.query(api.websiteClientView.getSiteHeader, { companyWebsiteId: holdId });
    expect(header?.schedule.active).toBe(false);
    expect(header?.monthly.searches).toBe(0);
    expect(header?.monthly.total).toBe(0);
  });
});

describe("the searches list", () => {
  test("what needs attention comes first, and paging happens after the sort", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    for (const keyword of ["a top search", "b slipping search", "c never ranked"]) await track(t, websiteId, keyword);
    await searchStats(t, websiteId, "a top search", { firstCheckedDay: daysAgo(90), lastPosition: 2 });
    await searchStats(t, websiteId, "b slipping search", { firstCheckedDay: daysAgo(90), lastPosition: 12, previousPosition: 5 });
    await searchStats(t, websiteId, "c never ranked", { firstCheckedDay: daysAgo(90) });

    const firstPage = await admin.query(api.websiteClientView.listTrackedSearches, {
      companyWebsiteId: holdId, page: 1, pageSize: 2,
    });
    expect(firstPage.data.map((row) => [row.keyword, row.verdict])).toEqual([
      ["b slipping search", "SLIPPING"],
      ["c never ranked", "NEVER_RANKED"],
    ]);
    expect(firstPage.totalCount).toBe(3);
    expect(firstPage.data[0].weeksRunning).toBe(12);
  });

  test("a search nobody has checked says so", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await track(t, websiteId, "brand new search");

    const list = await admin.query(api.websiteClientView.listTrackedSearches, {
      companyWebsiteId: holdId, page: 1, pageSize: 15,
    });
    expect(list.data[0]).toMatchObject({ verdict: "NOT_CHECKED", lastPosition: null, weeksRunning: null });
  });
});

describe("the competitors list", () => {
  test("a rival is compared on this site's own searches, from its place", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { companyId, websiteId, holdId } = await world(t);
    const rival = await t.run(async (ctx) => await ctx.db.insert("websites", {
      host: "rival.co.uk", displayHost: "rival.co.uk", firstSeenAt: Date.now(),
    }));
    await t.run(async (ctx) => await ctx.db.insert("companyWebsites", {
      companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: websiteId,
      createdAt: Date.now() - 90 * 86_400_000,
    }));
    for (const keyword of ["one", "two", "three"]) await track(t, websiteId, keyword);
    await searchStats(t, websiteId, "one", { firstCheckedDay: daysAgo(90), lastPosition: 8 });
    await searchStats(t, websiteId, "two", { firstCheckedDay: daysAgo(90), lastPosition: 3 });
    await searchStats(t, websiteId, "three", { firstCheckedDay: daysAgo(90) });
    await searchStats(t, rival, "one", { firstCheckedDay: daysAgo(90), lastPosition: 2 });
    await searchStats(t, rival, "three", { firstCheckedDay: daysAgo(90), lastPosition: 40 });
    // The rival ranks first for something this site does not track. Not a
    // comparison: nobody asked this site about it.
    await searchStats(t, rival, "a search only someone else tracks", { firstCheckedDay: daysAgo(90), lastPosition: 1 });

    const { rivals } = await admin.query(api.websiteClientView.listTrackedCompetitors, { companyWebsiteId: holdId });
    expect(rivals).toHaveLength(1);
    expect(rivals[0]).toMatchObject({
      displayHost: "rival.co.uk",
      beatsYouOn: 2,
      youBeatOn: 1,
      comparedOn: 3,
      verdict: "AHEAD",
    });
  });

  test("a site the answers keep naming is suggested only if this company does not hold it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { companyId, websiteId, holdId } = await world(t);
    const [held, unheld] = await t.run(async (ctx) => [
      await ctx.db.insert("websites", { host: "held.co.uk", displayHost: "held.co.uk", firstSeenAt: Date.now() }),
      await ctx.db.insert("websites", { host: "northgate.co.uk", displayHost: "northgate.co.uk", firstSeenAt: Date.now() }),
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("companyWebsites", {
        companyId, websiteId: held, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: Date.now(),
      });
      const prompt = "who is the best branding agency in Leeds";
      await ctx.db.insert("websiteQuestions", { websiteId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now() });
      await ctx.db.insert("websiteQuestionStats", {
        websiteId, prompt, engine: "chatgpt", locationCode: UK, asked: 6, named: 2, recommended: 0, warnedAgainst: 0,
        firstAskedDay: daysAgo(40), lastAskedDay: today(), lastNamed: true,
        othersNamed: [{ websiteId: unheld, times: 4, lastDay: today() }, { websiteId: held, times: 3, lastDay: today() }],
        updatedAt: Date.now(),
      });
    });

    const { untrackedNamed, rivals } = await admin.query(api.websiteClientView.listTrackedCompetitors, {
      companyWebsiteId: holdId,
    });
    expect(untrackedNamed).toEqual([
      { websiteId: unheld, displayHost: "northgate.co.uk", times: 4, lastDay: today() },
    ]);
    expect(rivals[0]).toMatchObject({ displayHost: "held.co.uk", namedInAnswers: 3, answersCounted: 6 });
  });
});

describe("the portfolio", () => {
  test("each list counted by verdict", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    for (const keyword of ["one", "two"]) await track(t, websiteId, keyword);
    await searchStats(t, websiteId, "one", { firstCheckedDay: daysAgo(90), lastPosition: 2 });

    const portfolio = await admin.query(api.websiteClientView.getSitePortfolio, { companyWebsiteId: holdId });
    expect(portfolio.searches).toEqual({ TOP_THREE: 1, NOT_CHECKED: 1 });
    expect(portfolio.questions).toEqual({});
  });
});
