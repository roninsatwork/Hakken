import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { listDayComplete, listDayReach } from "./siteSummaries";

/**
 * The everyday check (Anthony, 2026-09-27): of the keywords a site keeps, how
 * many every run checks again — 1,000 unless the company or the website says
 * otherwise, up to 10,000 — bought as the keyword list's first pages on every
 * run, with the rest of the list still weekly.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY_MS = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T23:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** A company collecting daily, one site of its own, and the site's last count. */
async function site(t: Harness, limits: { keywordsPerSite: number; everydayKeywords?: number }, count: number | null) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    await ctx.db.insert("companyDataLimits", { companyId, backlinksPerSite: 100, ...limits, updatedAt: Date.now() });
    await ctx.db.insert("schedules", { name: "Collection", companyId, intervalStr: "daily", isActive: true, createdAt: Date.now() } as never);
    if (count !== null) {
      await ctx.db.insert("siteDaySummaries", {
        websiteId, locationCode: UK, day: new Date(Date.now() - DAY_MS).toISOString().slice(0, 10), rankedKeywordsTotal: count, updatedAt: Date.now(),
      } as never);
    }
    return { companyId, websiteId, holdId };
  });
}

/** One run of the company's collection: what it plans. */
async function run(t: Harness, companyId: Id<"companies">) {
  const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
    companyId, trigger: "SCHEDULE", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
    readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
  }));
  await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
  return cycleId;
}

/** The keyword list's pages a run planned: where each starts, how many rows it asks, and how far its run meant to go. */
async function listPagesOf(t: Harness, cycleId: Id<"seoCollectionCycles">) {
  return (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))
    .filter((pull) => pull.operationId === KEYWORD_LIST_OPERATION_ID && pull.cycleId === cycleId)
    .map((pull) => {
      const sent = JSON.parse(pull.taskArgsJson) as { offset: number; limit: number };
      return { offset: sent.offset, limit: sent.limit, reach: pull.listReach };
    })
    .sort((left, right) => left.offset - right.offset);
}

/** Every page planned so far answered, as it would be by the next day's run. */
async function answerAll(t: Harness) {
  await t.run(async (ctx) => {
    for (const pull of await ctx.db.query("seoDataPulls").collect()) {
      if (pull.status === "PENDING") await ctx.db.patch(pull._id, { status: "READY", completedAt: Date.now() });
    }
  });
}

/**
 * A list filed on a day, page by page: where each page started, how many rows
 * it asked for and brought, and the searches among them — as the last list a
 * run sizes the next from.
 */
async function filedList(
  t: Harness,
  websiteId: Id<"websites">,
  day: string,
  pages: Array<[offset: number, limit: number, rows: number, searches: number]>,
  totals: { rows: number; searches: number },
  pull: Partial<{ companyId: Id<"companies">; listReach: number; submittedAt: number }> = {},
) {
  return await t.run(async (ctx) => {
    const ids: Array<Id<"seoDataPulls">> = [];
    for (const [offset, limit, rows, searches] of pages) {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "LIVE", websiteId, target: "ronins.co.uk", status: "READY",
        tag: `${day}-${offset}-${limit}`, attempts: 0, costUsd: 0.13, sandbox: false,
        taskArgsJson: JSON.stringify({ target: "ronins.co.uk", limit, offset, location_code: UK }),
        submittedAt: pull.submittedAt ?? Date.parse(`${day}T01:00:00Z`), completedAt: (pull.submittedAt ?? Date.parse(`${day}T01:00:00Z`)) + 300_000,
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        ...(pull.listReach !== undefined ? { listReach: pull.listReach } : {}),
      } as never);
      await ctx.db.insert("seoWebsiteMetrics", {
        websiteId, day, operationId: KEYWORD_LIST_OPERATION_ID, pullId, locationCode: UK, createdAt: Date.now(),
        metricsJson: JSON.stringify({
          listOffset: offset, listLimit: limit, listItems: rows, listDropped: 0, listTotal: totals.rows,
          returnedKeywords: offset + searches, rankedKeywords: totals.searches,
        }),
      });
      ids.push(pullId);
    }
    return ids;
  });
}

/** kordatackle.com's list on 25 September 2026: 2,545 searches in 2,989 rows, its first 1,000 rows holding 827. */
const KORDA: Array<[number, number, number, number]> = [[0, 1_000, 1_000, 827], [1_000, 1_000, 1_000, 781], [2_000, 1_000, 989, 937]];
const KORDA_TOTALS = { rows: 2_989, searches: 2_545 };
const TEN_DAYS_AGO = "2026-09-16";

describe("the everyday check", () => {
  test("buys the everyday check's searches on every run, and the whole list weekly, each sized from the last list", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, 2_545);
    await filedList(t, websiteId, TEN_DAYS_AGO, KORDA, KORDA_TOTALS);

    // The first run: the whole list is due — three pages, the last asking for
    // all of its page, since it ends there and rows are charged as returned.
    // The first two hold the everyday check's thousand searches.
    const first = await run(t, companyId);
    expect(await listPagesOf(t, first)).toEqual([
      { offset: 0, limit: 1_000, reach: 10_000 },
      { offset: 1_000, limit: 1_000, reach: 10_000 },
      { offset: 2_000, limit: 1_000, reach: 10_000 },
    ]);
    await answerAll(t);

    // The next day: only the rows a thousand searches take — not a thousand
    // rows, which held 827 of them.
    vi.setSystemTime(new Date("2026-09-27T23:00:00Z"));
    const second = await run(t, companyId);
    expect(await listPagesOf(t, second)).toEqual([{ offset: 0, limit: 1_000, reach: 1_000 }, { offset: 1_000, limit: 344, reach: 1_000 }]);
  });

  test("keeps searches, not rows: a thousand kept is a thousand searches", async () => {
    const t = harness();
    // chilliapple.co.uk: its last list held to 1,000 rows, 629 searches.
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 1_000 }, 1_857);
    await filedList(t, websiteId, TEN_DAYS_AGO, [[0, 1_000, 1_000, 629]], { rows: 2_393, searches: 1_857 });
    const first = await run(t, companyId);
    expect(await listPagesOf(t, first)).toEqual([{ offset: 0, limit: 1_000, reach: 1_000 }, { offset: 1_000, limit: 749, reach: 1_000 }]);
  });

  test("marks the pages bought on every run, so the monthly estimate prices them per run", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, 2_545);
    await filedList(t, websiteId, TEN_DAYS_AGO, KORDA, KORDA_TOTALS);
    const first = await run(t, companyId);
    const marks = (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))
      .filter((pull) => pull.operationId === KEYWORD_LIST_OPERATION_ID && pull.cycleId === first)
      .map((pull) => [JSON.parse(pull.taskArgsJson).offset, pull.eachRun === true])
      .sort((left, right) => (left[0] as number) - (right[0] as number));
    expect(marks).toEqual([[0, true], [1_000, true], [2_000, false]]);
  });

  test("at a hundred or fewer, the everyday call already brings it: the list stays weekly", async () => {
    const t = harness();
    const { companyId } = await site(t, { keywordsPerSite: 1_000, everydayKeywords: 100 }, 807);
    const first = await run(t, companyId);
    expect(await listPagesOf(t, first)).toEqual([{ offset: 0, limit: 1_000, reach: 1_000 }]);
    await answerAll(t);
    vi.setSystemTime(new Date("2026-09-27T23:00:00Z"));
    expect(await listPagesOf(t, await run(t, companyId))).toEqual([]);
  });

  test("a site whose whole list fits the everyday check has all of it checked on every run", async () => {
    const t = harness();
    // ronins.co.uk: 807 searches in 943 rows, a thousand kept, the default everyday check.
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 1_000 }, 807);
    await filedList(t, websiteId, TEN_DAYS_AGO, [[0, 1_000, 943, 807]], { rows: 943, searches: 807 });
    await run(t, companyId);
    await answerAll(t);
    vi.setSystemTime(new Date("2026-09-27T23:00:00Z"));
    expect(await listPagesOf(t, await run(t, companyId))).toEqual([{ offset: 0, limit: 1_000, reach: 1_000 }]);
  });

  test("a site never counted gets its first page alone, and the rest as its answers land", async () => {
    const t = harness();
    const { companyId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, null);
    const first = await run(t, companyId);
    expect(await listPagesOf(t, first)).toEqual([{ offset: 0, limit: 1_000, reach: 10_000 }]);
  });

  test("a company keeping more than the one that bought the week's list still gets its whole list", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, 2_545);
    await filedList(t, websiteId, TEN_DAYS_AGO, KORDA, KORDA_TOTALS);
    // Yesterday another company bought the list to its own 1,000.
    await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 1_000, 827], [1_000, 344, 344, 285]], KORDA_TOTALS, { listReach: 1_000, submittedAt: Date.now() - 3_600_000 });
    const pages = await listPagesOf(t, await run(t, companyId));
    expect(pages.every((page) => page.reach === 10_000)).toBe(true);
    expect(pages.map((page) => page.offset)).toEqual([0, 1_000, 2_000]);
  });
});

describe("the list's next page, as each answer lands", () => {
  /** A site's page as filed today, and what the next step queues after it. */
  async function after(t: Harness, pullId: Id<"seoDataPulls">, total: number) {
    await t.mutation(internal.sitePagedLists.queueListPages, { pullId, total });
    return (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))
      .filter((pull) => pull.status === "PENDING")
      .map((pull) => ({ offset: JSON.parse(pull.taskArgsJson).offset as number, limit: JSON.parse(pull.taskArgsJson).limit as number, eachRun: pull.eachRun === true }));
  }

  test("asks for the rows still short of the searches kept, and stops when they are reached", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 1_000 }, 1_857);
    const [first] = await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 1_000, 629]], { rows: 2_393, searches: 1_857 }, { companyId, listReach: 1_000, submittedAt: Date.now() });
    // 629 of a thousand: the rows 371 more take, at the rate the page showed.
    expect(await after(t, first, 2_393)).toEqual([{ offset: 1_000, limit: 649, eachRun: true }]);

    // That page brings 380 more: a thousand held, nothing more asked for.
    const [second] = await filedList(t, websiteId, "2026-09-26", [[1_000, 649, 649, 380]], { rows: 2_393, searches: 1_857 }, { companyId, listReach: 1_000, submittedAt: Date.now() });
    await t.run(async (ctx) => {
      for (const pull of await ctx.db.query("seoDataPulls").collect()) if (pull.status === "PENDING") await ctx.db.delete(pull._id);
    });
    expect(await after(t, second, 2_393)).toEqual([]);
  });

  test("buys the whole list when its searches fit the check but its rows run past a page", async () => {
    // 900 searches in 1,300 rows, a thousand checked every run: the rows past
    // the first page are bought too, never left for good (sites-data-completeness-plan.md, A2).
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 2_500, everydayKeywords: 1_000 }, 900);
    const [first] = await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 1_000, 650]], { rows: 1_300, searches: 900 }, { companyId, listReach: 1_000, submittedAt: Date.now() });
    expect(await after(t, first, 1_300)).toEqual([{ offset: 1_000, limit: 300, eachRun: true }]);
  });

  test("a page bought for the everyday check stops at it; a page bought for the whole list goes on", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, 2_545);
    const [everyday] = await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 1_000, 827]], KORDA_TOTALS, { companyId, listReach: 1_000, submittedAt: Date.now() });
    expect(await after(t, everyday, 2_989)).toEqual([{ offset: 1_000, limit: 231, eachRun: true }]);

    await t.run(async (ctx) => {
      for (const pull of await ctx.db.query("seoDataPulls").collect()) if (pull.status === "PENDING") await ctx.db.delete(pull._id);
      await ctx.db.patch(everyday, { listReach: 10_000 });
    });
    expect(await after(t, everyday, 2_989)).toEqual([{ offset: 1_000, limit: 1_000, eachRun: true }]);
  });

  test("a list that came back short is whole: nothing more to ask", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 1_000 }, 807);
    const [first] = await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 943, 807]], { rows: 943, searches: 807 }, { companyId, listReach: 1_000, submittedAt: Date.now() });
    expect(await after(t, first, 943)).toEqual([]);
  });
});

describe("search features", () => {
  test("an everyday check's page replaces its own searches' sightings, and leaves the week's list past it", async () => {
    const t = harness();
    const { companyId, websiteId } = await site(t, { keywordsPerSite: 10_000, everydayKeywords: 1_000 }, 2_545);
    await t.run(async (ctx) => {
      for (const keyword of ["carp rods", "bivvies"]) {
        await ctx.db.insert("siteKeywordFeatures", {
          websiteId, locationCode: UK, keyword, feature: "ai_overview_reference", day: "2026-09-21",
          pullId: (await ctx.db.query("seoDataPulls").first())?._id ?? (await ctx.db.insert("seoDataPulls", {
            operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "LIVE", websiteId, status: "READY", tag: "week",
            attempts: 0, costUsd: 0.13, sandbox: false, taskArgsJson: "{}", submittedAt: Date.now(),
          } as never)),
        } as never);
      }
    });
    const [everyday] = await filedList(t, websiteId, "2026-09-26", [[0, 1_000, 1_000, 827]], KORDA_TOTALS, { companyId, listReach: 1_000, submittedAt: Date.now() });
    // The everyday page brought "carp rods", no longer in an AI Overview.
    await t.mutation(internal.siteKeywordList.writeListPage, {
      pullId: everyday, websiteId, day: "2026-09-26", locationCode: UK, positions: [{ keyword: "carp rods", position: 3 }], features: [],
    });
    const sightings = async () => (await t.run(async (ctx) => await ctx.db.query("siteKeywordFeatures").collect())).map((row) => row.keyword).sort();
    // "bivvies", past the everyday check, keeps the week's sighting.
    expect(await sightings()).toEqual(["bivvies"]);

    // A page of the whole list clears the older list's sightings.
    const [whole] = await filedList(t, websiteId, "2026-09-27", [[0, 1_000, 1_000, 827]], KORDA_TOTALS, { companyId, listReach: 10_000, submittedAt: Date.now() });
    await t.mutation(internal.siteKeywordList.writeListPage, {
      pullId: whole, websiteId, day: "2026-09-27", locationCode: UK, positions: [], features: [],
    });
    expect(await sightings()).toEqual([]);
  });
});

describe("the latest check, with everyday pages between the weekly lists", () => {
  const page = (listOffset: number, listItems: number, extra: Partial<{ listLimit: number; listTotal: number }> = {}) =>
    ({ listOffset, listLimit: 1_000, listItems, listDropped: 0, listTotal: 5_000, ...extra });

  test("how far a day's pages reached", () => {
    expect(listDayReach([page(0, 1_000)])).toBe(1_000);
    expect(listDayReach([page(0, 1_000), page(1_000, 1_000), page(2_000, 1_000)])).toBe(3_000);
    // A page that came back short reached the end of the site's list.
    expect(listDayReach([page(0, 807)])).toBe(Number.POSITIVE_INFINITY);
    expect(listDayReach([])).toBeNull();
  });

  test("a list is whole even where the everyday check's short page and the week's full page start at one row", () => {
    expect(listDayComplete([
      page(0, 1_000), page(1_000, 1_000), page(2_000, 500, { listLimit: 500 }), page(2_000, 1_000), page(3_000, 1_000), page(4_000, 1_000),
    ])).toBe(true);
    expect(listDayComplete([page(0, 1_000), page(1_000, 1_000), page(2_000, 500, { listLimit: 500 })])).toBe(false);
  });

  async function listDay(t: Harness, websiteId: Id<"websites">, day: string, pages: Array<ReturnType<typeof page>>) {
    await t.run(async (ctx) => {
      for (const figures of pages) {
        const pullId = await ctx.db.insert("seoDataPulls", {
          operationId: KEYWORD_LIST_OPERATION_ID, family: "DataForSEO Labs", mode: "LIVE", websiteId, status: "READY",
          tag: `${day}-${figures.listOffset}`, attempts: 0, costUsd: 0.13, sandbox: false, taskArgsJson: "{}",
          submittedAt: Date.parse(`${day}T01:00:00Z`), completedAt: Date.parse(`${day}T01:05:00Z`),
        } as never);
        await ctx.db.insert("seoWebsiteMetrics", {
          websiteId, day, operationId: KEYWORD_LIST_OPERATION_ID, pullId, metricsJson: JSON.stringify(figures), locationCode: UK, createdAt: Date.now(),
        });
      }
    });
  }

  test("is the newest whole list, not a newer day holding only the everyday pages", async () => {
    const t = harness();
    const { websiteId } = await site(t, { keywordsPerSite: 10_000 }, 5_000);
    await listDay(t, websiteId, "2026-09-26", [page(0, 1_000), page(1_000, 1_000), page(2_000, 1_000), page(3_000, 1_000), page(4_000, 1_000)]);
    await listDay(t, websiteId, "2026-09-27", [page(0, 1_000)]);
    expect(await t.query(internal.siteSummaries.latestKeywordCheck, { websiteId, locationCode: UK })).toBe("2026-09-26");

    // The next week's list reaches as far: it is the latest.
    await listDay(t, websiteId, "2026-10-03", [page(0, 1_000), page(1_000, 1_000), page(2_000, 1_000), page(3_000, 1_000), page(4_000, 1_000)]);
    expect(await t.query(internal.siteSummaries.latestKeywordCheck, { websiteId, locationCode: UK })).toBe("2026-10-03");
  });

  test("is the everyday day for a site whose whole list the everyday check covers", async () => {
    const t = harness();
    const { websiteId } = await site(t, { keywordsPerSite: 1_000 }, 807);
    await listDay(t, websiteId, "2026-09-26", [page(0, 807, { listTotal: 807 })]);
    await listDay(t, websiteId, "2026-09-27", [page(0, 809, { listTotal: 809 })]);
    expect(await t.query(internal.siteSummaries.latestKeywordCheck, { websiteId, locationCode: UK })).toBe("2026-09-27");
  });
});

describe("the everyday check's setting", () => {
  async function admin(t: Harness) {
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
    return t.withIdentity({ subject: userId });
  }

  test("is the platform's 1,000 until set, then set on the company, and on a website of its own or following the company", async () => {
    const t = harness();
    const { companyId, holdId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
      return { companyId, holdId };
    });
    const asAdmin = await admin(t);
    const company = async () => (await asAdmin.query(api.platformLimits.getCompanyLimits, { companyId }))!;
    const ownSite = async () => (await asAdmin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: holdId }))!;

    // Until a number is picked, the company uses the platform's: 1,000, up to 10,000 on offer.
    expect(await company()).toMatchObject({ own: { everydayKeywords: null }, platform: { everydayKeywords: 1_000 } });
    expect((await company()).choices.everydayKeywords).toContain(10_000);

    await asAdmin.mutation(api.companyDataLimits.setCompanyDataLimits, { companyId, keywordsPerSite: 10_000, backlinksPerSite: 1_000, everydayKeywords: 2_500 });
    expect((await company()).own).toMatchObject({ keywordsPerSite: 10_000, everydayKeywords: 2_500 });
    // Saved without it, the everyday check keeps what it was.
    await asAdmin.mutation(api.companyDataLimits.setCompanyDataLimits, { companyId, keywordsPerSite: 10_000, backlinksPerSite: 500 });
    expect((await company()).own).toMatchObject({ everydayKeywords: 2_500 });

    await asAdmin.mutation(api.companyDataLimits.setSiteDataLimits, { companyWebsiteId: holdId, keywordsPerSite: null, backlinksPerSite: null, everydayKeywords: 10_000 });
    expect(await ownSite()).toMatchObject({ own: { keywordsPerSite: null, backlinksPerSite: null, everydayKeywords: 10_000 }, company: { everydayKeywords: 2_500 } });
    // Following the company again on everything keeps no row of its own.
    await asAdmin.mutation(api.companyDataLimits.setSiteDataLimits, { companyWebsiteId: holdId, keywordsPerSite: null, backlinksPerSite: null, everydayKeywords: null });
    expect(await ownSite()).toMatchObject({ own: { everydayKeywords: null } });
    expect(await t.run(async (ctx) => await ctx.db.query("websiteDataLimits").collect())).toEqual([]);

    // Only the screen's choices.
    await expect(asAdmin.mutation(api.companyDataLimits.setCompanyDataLimits, { companyId, keywordsPerSite: 1_000, backlinksPerSite: 1_000, everydayKeywords: 12_345 }))
      .rejects.toThrow();
  });

});
