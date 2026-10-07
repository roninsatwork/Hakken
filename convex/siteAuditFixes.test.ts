import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { parseBacklinksSummary } from "./dataForSeoParsers";
import { answerPlace } from "./seoAiEngines";

/**
 * What the screen audit of 2026-09-26 found, fixed on the server
 * (docs/plans/active/sites-audit-fixes-plan.md). Each test is shaped like the
 * case that found it.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
  }));
  return t.withIdentity({ subject: userId });
}

async function website(t: Harness, host: string) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    return existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
  });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, against?: Id<"websites">) {
  const websiteId = await website(t, host);
  const holdId = await t.run(async (ctx) => await ctx.db.insert("companyWebsites", {
    companyId, websiteId, relationship: against ? "TRACKED" : "OWNED", createdAt: Date.now(),
    ...(against ? { againstWebsiteId: against } : { locationCode: UK }),
  }));
  return { websiteId, holdId };
}

async function track(t: Harness, list: { websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, keyword: string) {
  await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", {
    websiteId: list.websiteId, companyWebsiteId: list.holdId, keyword, isActive: true, createdAt: Date.now(),
  } as never));
}

/** A position row as the collection files it, under a request of the given operation. */
async function position(t: Harness, websiteId: Id<"websites">, keyword: string, day: string, operationId: string, rank?: number) {
  await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId, family: "SERP", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    await ctx.db.insert("seoKeywordPositions", {
      websiteId, keyword, day, pullId, locationCode: UK, createdAt: Date.now(), ...(rank === undefined ? {} : { position: rank }),
    });
  });
}

/** The site's latest ranking for a search, as a list pull leaves it. */
async function ranks(t: Harness, websiteId: Id<"websites">, keyword: string, rank: number, day: string) {
  await t.run(async (ctx) => await ctx.db.insert("siteKeywordRanks", {
    websiteId, locationCode: UK, keyword, position: rank, band: "p01_03", page: "/", volume: 50, volumeKnown: true,
    intent: "BUYING", status: "SAME", change: 0, day, firstSeenDay: day,
  } as never));
}

describe("a keyword's position over time (1.2)", () => {
  test("draws any search the site ranks for from its own keyword lists, and never another company's one-by-one checks", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const agency = await company(t, "Another agency");
    const own = await hold(t, korda, "kordatackle.com");
    const theirs = await hold(t, agency, "kordatackle.com");
    // The other company tracks the search one by one, checked every day,
    // and one day not found; Korda does not track it.
    await track(t, theirs, "carp rigs");
    for (const [day, rank] of [["2026-09-20", 4], ["2026-09-21", undefined], ["2026-09-22", 3]] as const) {
      await position(t, own.websiteId, "carp rigs", day, SEO_KEYWORD_CHECK_OPERATION, rank);
    }
    // Korda's own keyword lists found it twice.
    await position(t, own.websiteId, "carp rigs", "2026-09-19", "dataforseo_labs_google_ranked_keywords", 5);
    await position(t, own.websiteId, "carp rigs", "2026-09-23", "domain_ranked_keywords", 3);
    await ranks(t, own.websiteId, "carp rigs", 3, "2026-09-23");
    // A search it does not rank for, checked for the other company only.
    await position(t, own.websiteId, "bivvies", "2026-09-22", SEO_KEYWORD_CHECK_OPERATION, 9);

    const range = { from: "2026-09-01", to: "2026-09-30" };
    const asKorda = await member(t, korda);
    expect(await asKorda.query(api.siteGoogle.searchPositions, { siteId: own.holdId, keywords: ["carp rigs", "bivvies"], ...range, step: "day" })).toEqual([
      { keyword: "carp rigs", points: [{ day: "2026-09-19", lastDay: "2026-09-19", position: 5 }, { day: "2026-09-23", lastDay: "2026-09-23", position: 3 }], weeklyBefore: null },
    ]);
    // The company tracking it sees every check of it.
    const asAgency = await member(t, agency);
    const tracked = await asAgency.query(api.siteGoogle.searchPositions, { siteId: theirs.holdId, keywords: ["carp rigs"], ...range, step: "day" });
    expect(tracked[0].points.map((point) => [point.day, point.position])).toEqual([
      ["2026-09-19", 5], ["2026-09-20", 4], ["2026-09-21", null], ["2026-09-22", 3], ["2026-09-23", 3],
    ]);
    // In the step chosen (2026-10-04): each week or month where it stood on its last day checked.
    const weekly = await asAgency.query(api.siteGoogle.searchPositions, { siteId: theirs.holdId, keywords: ["carp rigs"], ...range, step: "week" });
    expect(weekly[0].points).toEqual([
      { day: "2026-09-14", lastDay: "2026-09-20", position: 4 },
      { day: "2026-09-21", lastDay: "2026-09-23", position: 3 },
    ]);
    const monthly = await asAgency.query(api.siteGoogle.searchPositions, { siteId: theirs.holdId, keywords: ["carp rigs"], ...range, step: "month" });
    expect(monthly[0].points).toEqual([{ day: "2026-09-01", lastDay: "2026-09-23", position: 3 }]);
  });
});

describe("moves between checks (1.3)", () => {
  test("mark the site's first check, and never count its searches as moves", async () => {
    // Added on the 20th, before anything was collected for it.
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await t.run(async (ctx) => {
      // Backlinks came in before the first ranking check; they are not a check.
      await ctx.db.insert("siteDaySummaries", { websiteId: own.websiteId, locationCode: UK, day: "2026-09-21", backlinks: 40, updatedAt: Date.now() });
      await ctx.db.insert("siteDaySummaries", {
        websiteId: own.websiteId, locationCode: UK, day: "2026-09-22", keywords: 100,
        rankedNew: 100, rankedUp: 0, rankedDown: 0, rankedLost: 0, updatedAt: Date.now(),
      });
      await ctx.db.insert("siteDaySummaries", {
        websiteId: own.websiteId, locationCode: UK, day: "2026-09-24", keywords: 104,
        rankedNew: 5, rankedUp: 3, rankedDown: 2, rankedLost: 1, updatedAt: Date.now(),
      });
    });
    const asKorda = await member(t, korda);
    const range = { siteId: own.holdId, from: "2026-09-21", to: "2026-09-30" };

    const daily = (await asKorda.query(api.siteCharts.siteSeries, { ...range, step: "day" }))[0].points;
    expect(daily.map((point) => [point.day, point.firstCheck ?? false, point.rankedNew, point.rankedUp])).toEqual([
      ["2026-09-21", false, 0, 0],
      ["2026-09-22", true, 0, 0],
      ["2026-09-24", false, 5, 3],
    ]);
    // A week holding the first check and the next counts the next one's moves only.
    const weekly = (await asKorda.query(api.siteCharts.siteSeries, { ...range, step: "week" }))[0].points;
    expect(weekly.map((point) => [point.lastDay, point.firstCheck, point.rankedNew, point.rankedDown, point.rankedLost])).toEqual([
      ["2026-09-24", true, 5, 2, 1],
    ]);
  });
});

describe("a first check after years of history (1.3)", () => {
  test("is found past the months filled in from the archive, as ronins.co.uk's was not", async () => {
    // ronins.co.uk was added on the 21st of September 2026; its history goes
    // back to 2019, a row a month, and its first check came on the 23rd.
    vi.setSystemTime(new Date("2026-09-21T12:00:00Z"));
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    await t.run(async (ctx) => {
      for (let month = 0; month < 86; month += 1) {
        const day = new Date(Date.UTC(2019, 7 + month, 1)).toISOString().slice(0, 10);
        await ctx.db.insert("siteDaySummaries", { websiteId: own.websiteId, locationCode: UK, day, estimatedTraffic: 500 + month, updatedAt: Date.now() });
      }
      await ctx.db.insert("siteDaySummaries", {
        websiteId: own.websiteId, locationCode: UK, day: "2026-09-23", keywords: 101, rankedNew: 101, rankedUp: 0, rankedDown: 0, rankedLost: 0, updatedAt: Date.now(),
      });
    });
    const asRonins = await member(t, ronins);

    const [line] = await asRonins.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-08-28", to: "2026-09-26", step: "day" });
    expect(line.points.find((point) => point.day === "2026-09-23")).toMatchObject({ firstCheck: true, rankedNew: 0 });
  });
});

describe("a competitor on the company's tracked searches (1.4)", () => {
  test("reads as of the list's newest check, not the last check that found it", async () => {
    vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "a.com");
    const rival = await hold(t, ronins, "rival.com", own.websiteId);
    const stats = (websiteId: Id<"websites">, keyword: string, facts: Record<string, unknown>) =>
      t.run(async (ctx) => await ctx.db.insert("websiteSearchStats", {
        websiteId, keyword, locationCode: UK, everRanked: true, updatedAt: Date.now(), ...facts,
      } as never));
    for (const keyword of ["carp rigs", "bivvies", "tackle box"]) {
      await track(t, own, keyword);
      // The owned site's list is checked on the 20th, 22nd and 24th.
      await stats(own.websiteId, keyword, {
        firstCheckedDay: "2026-09-20", lastCheckedDay: "2026-09-24", lastPosition: 4, previousCheckedDay: "2026-09-22", previousPosition: 6, bestPosition: 4,
      });
    }
    // The competitor was on the page on the 20th and 22nd, and not on the 24th.
    await stats(rival.websiteId, "carp rigs", {
      firstCheckedDay: "2026-09-20", lastCheckedDay: "2026-09-22", lastPosition: 2, previousCheckedDay: "2026-09-20", previousPosition: 3, bestPosition: 2,
    });
    // On the page on the 20th only.
    await stats(rival.websiteId, "bivvies", { firstCheckedDay: "2026-09-20", lastCheckedDay: "2026-09-20", lastPosition: 7, bestPosition: 7 });
    // "tackle box": never on the page.

    const asRonins = await member(t, ronins);
    const rows = await asRonins.query(api.siteGoogle.listSearches, { siteId: rival.holdId });
    const byKeyword = new Map(rows.map((row) => [row.keyword, row]));
    // Dropped off the page at the newest check, from second place at the one before.
    expect(byKeyword.get("carp rigs")).toMatchObject({ lastPosition: null, previousPosition: 2, bestPosition: 2, lastCheckedDay: "2026-09-24", verdict: "SLIPPING" });
    // Off the page since two checks ago: no place, and no fall at the newest check.
    expect(byKeyword.get("bivvies")).toMatchObject({ lastPosition: null, previousPosition: null, lastCheckedDay: "2026-09-24" });
    // Never on it, yet checked every time the list was.
    expect(byKeyword.get("tackle box")).toMatchObject({ lastPosition: null, lastCheckedDay: "2026-09-24", firstCheckedDay: "2026-09-20" });
    expect(byKeyword.get("tackle box")?.verdict).not.toBe("NOT_CHECKED");
    // The owned site's own rows are as they were.
    expect((await asRonins.query(api.siteGoogle.listSearches, { siteId: own.holdId })).map((row) => row.lastPosition)).toEqual([4, 4, 4]);
    // And the keyword's record says the same.
    const record = await asRonins.query(api.siteRecords.keywordRecord, { siteId: rival.holdId, keyword: "carp rigs" });
    expect(record.tracked).toMatchObject({ lastPosition: null, bestPosition: 2, lastCheckedDay: "2026-09-24" });
    // Side by side counts it above the site on none of them: it was on none at the newest check.
    const [sideBySide] = await asRonins.query(api.siteCompetitors.listRivals, { siteId: own.holdId });
    expect(sideBySide).toMatchObject({ host: "rival.com", beatsYouOn: 0, youBeatOn: 3, comparedOn: 3, rankedOn: 0 });
  });
});

describe("a run's day (2.1)", () => {
  test("every request in a run files under the day the run started, however late it comes back", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const { inRun, alone } = await t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: korda, trigger: "SCHEDULE", status: "DONE", plannedCount: 1, reusedCount: 0, sentCount: 1,
        readyCount: 1, failedCount: 0, totalCostUsd: 0, startedAt: Date.parse("2026-09-24T23:30:00Z"),
      });
      const pull = (extra: Record<string, unknown>) => ctx.db.insert("seoDataPulls", {
        operationId: "domain_ranked_keywords", family: "Labs", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, ...extra,
      } as never);
      return {
        // Sent before midnight UTC, back after it.
        inRun: await pull({ cycleId, submittedAt: Date.parse("2026-09-24T23:31:00Z"), completedAt: Date.parse("2026-09-25T00:30:00Z") }),
        // Asked for on its own, just after midnight.
        alone: await pull({ submittedAt: Date.parse("2026-09-25T00:05:00Z"), completedAt: Date.parse("2026-09-25T00:06:00Z") }),
      };
    });
    expect((await t.query(internal.seoCollectionParse.getPullForParse, { pullId: inRun }))?.runDay).toBe("2026-09-24");
    expect((await t.query(internal.seoCollectionParse.getPullForParse, { pullId: alone }))?.runDay).toBe("2026-09-25");
  });
});

describe("paid keywords (2.2)", () => {
  test("keep what DataForSEO did not say unknown, and carry its own count of searches with adverts", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "domain_ranked_keywords", family: "Labs", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
      status: "READY", tag: "paid", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never));
    await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId, websiteId: own.websiteId, operationId: "domain_ranked_keywords", day: "2026-09-25", locationCode: UK,
      metricsJson: JSON.stringify({ rankedKeywords: 100, estimatedTraffic: 900, paidKeywords: 450, paidTraffic: 1_200 }),
      positions: [],
      paidPositions: [
        { keyword: "carp rods", position: 1, url: "https://kordatackle.com/rods/", searchVolume: 900, cpc: 0.8, traffic: 40, trafficCost: 32 },
        // An advert DataForSEO gave no figures for.
        { keyword: "korda leads", position: 2, url: "https://kordatackle.com/leads/" },
      ],
    });
    await t.mutation(internal.siteSummaries.syncDays, { websiteId: own.websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: "2026-09-30" });

    const asKorda = await member(t, korda);
    const list = await asKorda.query(api.sitePaid.listPaidKeywords, { siteId: own.holdId, page: 1, rows: 25, sort: "traffic" });
    expect(list.total).toBe(2);
    expect(list.rows.map((row) => [row.keyword, row.volume, row.traffic, row.trafficCost])).toEqual([
      ["carp rods", 900, 40, 32],
      // Unknown, not nought — and last, where blanks sort.
      ["korda leads", null, null, null],
    ]);
    // DataForSEO's own count, for the screen to set the two held against.
    expect((await asKorda.query(api.sites.getMySite, { siteId: own.holdId }))?.counts.paidKeywords).toBe(450);
  });
});

describe("where links come from (2.3)", () => {
  test("a breakdown counting each link once keeps the rest as one total; one whose groups overlap keeps none", () => {
    // Links from twenty countries, the largest fifteen holding most of them.
    const countries = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`C${index}`, 100 - index]));
    const parsed = parseBacklinksSummary({
      backlinks: 10_000,
      referring_links_countries: countries,
      referring_links_attributes: { nofollow: 1_200, noopener: 800, ugc: 50 },
    });
    const kept = JSON.parse(String(parsed.metrics.countriesJson)) as Array<[string, number]>;
    expect(kept).toHaveLength(16);
    expect(kept.slice(0, 15).map(([key]) => key)).toEqual(Array.from({ length: 15 }, (_, index) => `C${index}`));
    // The five smallest, added up: every link is in the total.
    expect(kept[15]).toEqual(["(rest)", 85 + 84 + 83 + 82 + 81]);
    expect(kept.reduce((sum, [, count]) => sum + count, 0)).toBe(Object.values(countries).reduce((sum, count) => sum + count, 0));
    // Attributes overlap, so there is no "rest" of them to add.
    expect(JSON.parse(String(parsed.metrics.attributesJson))).toEqual([["nofollow", 1_200], ["noopener", 800], ["ugc", 50]]);
  });
});

describe("suggested competitors (2.4, 3.4)", () => {
  test("offer nothing the company holds, anywhere, and the menu counts exactly what the page lists", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "a.com");
    const otherOwn = await hold(t, ronins, "b.com");
    const rival = await hold(t, ronins, "rival.com", own.websiteId);
    const big = await website(t, "bigagency.co.uk");
    const small = await website(t, "smallshop.co.uk");
    const prompt = "who are the best web designers in surrey";
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
    }));
    // Three answers naming the company's other own site, its competitor and
    // two websites it does not hold, the big agency most.
    for (const [day, names] of [
      ["2026-09-22", [otherOwn.websiteId, rival.websiteId, big]],
      ["2026-09-23", [big, small]],
      ["2026-09-24", [big, otherOwn.websiteId]],
    ] as const) {
      const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never));
      await t.mutation(internal.seoCollectionParse.writeAiCitations, {
        pullId, prompt, engine: "chatgpt", day, sources: [],
        brands: names.map((websiteId) => ({ websiteId, text: "A firm", variantKind: "NAME" as const, stance: "MENTIONED" as const })),
      });
    }
    await t.action(internal.siteListAi.summariseList, { holdId: own.holdId });
    // Discovery found the company's other own site, one it decided about, and a new one.
    await t.run(async (ctx) => {
      for (const [host, intersections, decided] of [["b.com", 90, false], ["decided.co.uk", 80, true], ["found.co.uk", 40, false]] as const) {
        await ctx.db.insert("discoveredCompetitors", {
          companyWebsiteId: own.holdId, companyId: ronins, host, intersections, discoveredAt: Date.now(), ...(decided ? { decidedAt: Date.now() } : {}),
        });
      }
    });

    const asRonins = await member(t, ronins);
    const suggested = await asRonins.query(api.siteCompetitors.listSuggested, { siteId: own.holdId });
    expect(suggested.map((row) => [row.host, row.reason, row.times])).toEqual([
      ["bigagency.co.uk", "NAMED_BY_AI", 3],
      ["smallshop.co.uk", "NAMED_BY_AI", 1],
      ["found.co.uk", "RANKS_FOR_YOUR_SEARCHES", null],
    ]);
    expect((await asRonins.query(api.sites.getMySite, { siteId: own.holdId }))?.counts.suggestions).toBe(3);
  });
});

describe("last checked (2.6)", () => {
  test("is when a request last came back with data, not when one was planned", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const back = Date.parse("2026-09-25T09:00:00Z");
    await t.run(async (ctx) => {
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId: korda, trigger: "SCHEDULE", status: "COLLECTING", plannedCount: 3, reusedCount: 0, sentCount: 3,
        readyCount: 1, failedCount: 1, totalCostUsd: 0, startedAt: Date.parse("2026-09-25T08:00:00Z"),
      });
      for (const [status, planned, completedAt] of [
        ["READY", Date.parse("2026-09-25T08:01:00Z"), back],
        ["FAILED", Date.parse("2026-09-26T08:01:00Z"), Date.parse("2026-09-26T08:05:00Z")],
        // Planned a moment ago, still out.
        ["PENDING", Date.parse("2026-09-26T09:00:00Z"), undefined],
      ] as const) {
        const pullId = await ctx.db.insert("seoDataPulls", {
          operationId: "domain_ranked_keywords", family: "Labs", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
          status, tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: planned, cycleId,
          ...(completedAt === undefined ? {} : { completedAt }),
        } as never);
        await ctx.db.insert("seoCycleLines", {
          cycleId, companyId: korda, websiteId: own.websiteId, operationId: "domain_ranked_keywords", pullId, reused: false, createdAt: planned,
        } as never);
      }
    });
    const asKorda = await member(t, korda);
    expect((await asKorda.query(api.sites.getMySite, { siteId: own.holdId }))?.lastCheckedAt).toBe(back);
    expect((await asKorda.query(api.sites.listMySites, {}))[0].lastCheckedAt).toBe(back);
  });
});

describe("downloads that are cut (3.2)", () => {
  test("Sources cited's file says so when the list holds more questions than it reads", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await t.run(async (ctx) => {
      // One past the hundred questions the cited pages are read from.
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("websiteQuestions", {
          websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: `question ${index}`, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
        });
      }
    });
    const asKorda = await member(t, korda);
    expect((await asKorda.action(api.siteExports.exportSiteTable, { siteId: own.holdId, kind: "cited" })).complete).toBe(false);
  });
});

describe("fan-out queries (3.3)", () => {
  test("come only from the engines each question is asked of, and a list too long to read says so", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const prompt = "best carp fishing tackle brands";
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: "fan", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      // Korda asks the question of one engine; another company asks it of another.
      for (const [engine, query] of [["chatgpt", "best carp tackle uk"], ["claude", "carp tackle reviews"]] as const) {
        await ctx.db.insert("promptFanOutQueries", {
          prompt, engine, query, queryText: query, timesSeen: 1, firstSeenAt: Date.now(), lastSeenAt: Date.now(),
          lastSeenDay: "2026-09-25", lastPullId: pullId, place: "GB",
        });
      }
    });
    const asKorda = await member(t, korda);
    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: own.holdId });
    await finishScheduled(t);
    const first = await asKorda.query(api.siteAngles.listAngles, { siteId: own.holdId });
    expect(first.rows.map((row) => [row.query, row.engines.join(",")])).toEqual([["best carp tackle uk", "chatgpt"]]);
    expect(first.cut).toBeNull();

    // More searches for the question than a rebuild reads of one engine's (a hundred, unless the
    // company chose otherwise): the most seen are kept, and the page says the list is longer.
    await t.run(async (ctx) => {
      const pull = await ctx.db.query("seoDataPulls").first();
      for (let index = 0; index < 251; index += 1) {
        const query = `carp tackle ${index}`;
        await ctx.db.insert("promptFanOutQueries", {
          prompt, engine: "chatgpt", query, queryText: query, timesSeen: 1, firstSeenAt: Date.now(), lastSeenAt: Date.now(),
          lastSeenDay: "2026-09-25", lastPullId: pull!._id, place: "GB",
        });
      }
    });
    vi.advanceTimersByTime(60 * 60 * 1000);
    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: own.holdId });
    await finishScheduled(t);
    const long = await asKorda.query(api.siteAngles.listAngles, { siteId: own.holdId });
    expect(long.rows).toHaveLength(100);
    expect(long.cut).not.toBeNull();
  });
});

describe("side by side at its limits (3.5)", () => {
  test("shares its lookups among the competitors, and says on how many searches each is compared", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const rivals: Array<Id<"websites">> = [];
    for (let index = 0; index < 31; index += 1) rivals.push((await hold(t, korda, `rival-${index}.co.uk`, own.websiteId)).websiteId);
    // Standings for the site and one competitor only: every competitor is
    // still looked up on its share, but each lookup in the test's database
    // reads every row stored, and thirty-one competitors' rows made this the
    // one test over five seconds on its own (2026-10-05).
    const [ranked] = rivals;
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        const keyword = `tracked search ${index}`;
        await ctx.db.insert("websiteKeywords", { websiteId: own.websiteId, companyWebsiteId: own.holdId, keyword, isActive: true, createdAt: Date.now() });
        for (const websiteId of [own.websiteId, ranked]) {
          await ctx.db.insert("websiteSearchStats", {
            websiteId, keyword, locationCode: UK, firstCheckedDay: "2026-09-01", lastCheckedDay: "2026-09-23",
            lastPosition: websiteId === own.websiteId ? 5 : 3, bestPosition: 1, everRanked: true, updatedAt: Date.now(),
          });
        }
      }
    });
    const asKorda = await member(t, korda);
    const sideBySide = await asKorda.query(api.siteCompetitors.listRivals, { siteId: own.holdId });
    expect(sideBySide).toHaveLength(31);
    // Two and a half thousand lookups among thirty-one: eighty searches each, and each says so.
    expect(new Set(sideBySide.map((rival) => rival.comparedOn))).toEqual(new Set([80]));
    expect(sideBySide.find((rival) => rival.websiteId === ranked)).toMatchObject({ beatsYouOn: 80, rankedOn: 80 });
    expect(sideBySide.filter((rival) => rival.websiteId !== ranked).every((rival) => rival.rankedOn === 0)).toBe(true);
  });
});

describe("the AI day lines (3.1)", () => {
  test("count every question on each list, and never take one company's lines for another's", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const agency = await company(t, "Another agency");
    const own = await hold(t, korda, "kordatackle.com");
    const theirs = await hold(t, agency, "kordatackle.com");
    const day = "2026-09-24";
    await t.run(async (ctx) => {
      // Korda's long list, asked first: two hundred and five questions.
      for (let index = 0; index < 205; index += 1) {
        await ctx.db.insert("websiteQuestions", {
          websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: `korda question ${index}`, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
        });
      }
      // The other company's one question, asked after them all.
      await ctx.db.insert("websiteQuestions", {
        websiteId: theirs.websiteId, companyWebsiteId: theirs.holdId, prompt: "best bivvy for carp fishing", engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      });
      for (const prompt of ["korda question 204", "best bivvy for carp fishing"]) {
        const pullId = await ctx.db.insert("seoDataPulls", {
          operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
          status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
        } as never);
        await ctx.db.insert("aiAnswers", {
          prompt, engine: "chatgpt", locationCode: UK, day, pullId, named: [own.websiteId], recommended: [], warnedAgainst: [], createdAt: Date.now(),
        });
      }
    });
    await t.action(internal.siteListAiDays.syncWindow, { websiteId: own.websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: "2026-09-30" });
    await t.action(internal.siteListAiDays.syncWindow, { websiteId: own.websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: "2026-09-30" });

    const lines = await t.run(async (ctx) => await ctx.db.query("siteListAiDays").collect());
    // Korda's 205th question counted; the other company's line there, and its own.
    expect(lines.map((row) => [row.companyWebsiteId, row.day, row.ai]).sort()).toEqual([
      [own.holdId, day, [{ engine: "chatgpt", asked: 1, named: 1, recommended: 0 }]],
      [theirs.holdId, day, [{ engine: "chatgpt", asked: 1, named: 1, recommended: 0 }]],
    ].sort());
  });
});

describe("a list with everything paused (4.2)", () => {
  test("is still set up, and says it is paused, while the menu counts only what is on", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const asRonins = await member(t, ronins);
    const counts = async () => (await asRonins.query(api.sites.getMySite, { siteId: own.holdId }))?.counts;

    expect(await counts()).toMatchObject({ trackedSearches: 0, searchesPaused: false, questionsSetUp: false, questionsPaused: false });

    await t.run(async (ctx) => {
      await ctx.db.insert("websiteKeywords", { websiteId: own.websiteId, companyWebsiteId: own.holdId, keyword: "web design surrey", isActive: false, createdAt: Date.now() });
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: "who designs websites in surrey", engines: ["chatgpt"], isActive: false, createdAt: Date.now(),
      });
    });
    expect(await counts()).toMatchObject({ trackedSearches: 0, searchesPaused: true, questionsSetUp: true, questionsPaused: true });

    // One switched back on: set up, not paused, and counted.
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteKeywords", { websiteId: own.websiteId, companyWebsiteId: own.holdId, keyword: "seo surrey", isActive: true, createdAt: Date.now() });
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: "best seo agency surrey", engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      });
    });
    expect(await counts()).toMatchObject({ trackedSearches: 1, searchesPaused: false, questionsSetUp: true, questionsPaused: false });
  });
});

describe("site structure (4.4)", () => {
  test("says when a site has more folders than the page shows", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const asRonins = await member(t, ronins);
    const folders = async (count: number) => await t.run(async (ctx) => {
      for (let index = 0; index < count; index += 1) {
        await ctx.db.insert("siteSections", {
          websiteId: own.websiteId, locationCode: UK, section: `/folder-${index}/`, pages: 1, keywords: index + 1, top3: 0,
          volumeSum: 10, rebuildId: "r1", updatedAt: Date.now(),
        });
      }
    });

    await folders(300);
    const whole = await asRonins.query(api.siteKeywords.listSections, { siteId: own.holdId });
    expect(whole.rows).toHaveLength(300);
    expect(whole.cut).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.insert("siteSections", {
        websiteId: own.websiteId, locationCode: UK, section: "/one-more/", pages: 1, keywords: 0, top3: 0, volumeSum: 1, rebuildId: "r1", updatedAt: Date.now(),
      });
    });
    const longer = await asRonins.query(api.siteKeywords.listSections, { siteId: own.holdId });
    expect(longer.rows).toHaveLength(300);
    expect(longer.cut).toBe(300);
    // The most keywords first: the folder left out is the smallest.
    expect(longer.rows.map((row) => row.section)).not.toContain("/one-more/");
  });
});

describe("change since (4.5)", () => {
  test("compares each figure with the newest earlier day that has it, not a day holding only a crawl", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const asRonins = await member(t, ronins);
    await t.run(async (ctx) => {
      const row = (day: string, figures: Record<string, number>) =>
        ctx.db.insert("siteDaySummaries", { websiteId: own.websiteId, locationCode: UK, day, updatedAt: Date.now(), ...figures });
      await row("2026-09-17", { keywords: 90, backlinks: 30 });
      await row("2026-09-18", { keywords: 100, estimatedTraffic: 400 });
      // The last day before the dates: a crawl and nothing else.
      await row("2026-09-19", { crawledPages: 12 });
      await row("2026-09-22", { keywords: 110, backlinks: 42 });
    });

    const [line] = await asRonins.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-20", to: "2026-09-26", step: "day" });
    expect(line.before).toMatchObject({ day: "2026-09-19", crawledPages: 12, keywords: 100, estimatedTraffic: 400, backlinks: 30 });
  });
});

describe("one answer, one stance (4.6)", () => {
  test("an answer that recommends the site and warns against it reads as warned on Mentions and Full answers alike", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const asRonins = await member(t, ronins);
    const prompt = "is ronins a good web design agency";
    const place = answerPlace("chatgpt", UK);
    const answerId = await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
      });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_optimization_chat_gpt_llm_responses", family: "AI", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      await ctx.db.insert("aiAnswers", {
        prompt, engine: "chatgpt", locationCode: place, day: "2026-09-25", pullId,
        named: [own.websiteId], recommended: [own.websiteId], warnedAgainst: [own.websiteId], createdAt: Date.now(),
      });
      return await ctx.db.insert("aiAnswerTexts", {
        pullId, prompt, engine: "chatgpt", locationCode: place, day: "2026-09-25", text: "Good work, but watch the price.", sources: [], createdAt: Date.now(),
      });
    });
    await t.mutation(internal.siteListAi.recountQuestion, { holdId: own.holdId, prompt });

    const [mention] = await asRonins.query(api.siteAi.listMentions, { siteId: own.holdId });
    expect(mention.lastStance).toBe("WARNED_AGAINST");
    const record = await asRonins.query(api.siteAnswers.answerRecord, { siteId: own.holdId, answerId });
    expect(record?.stance).toBe("WARNED_AGAINST");
  });
});

describe("nothing known yet, and a competitor's AI (4.8, 4.9)", () => {
  test("an assistant that has not answered has no pages yet, and one that has counts from nought", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const asRonins = await member(t, ronins);
    const prompt = "who designs websites in surrey";
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["chatgpt", "perplexity"], isActive: true, createdAt: Date.now(),
      });
    });
    const pagesOf = async () => new Map((await asRonins.query(api.siteOverview.overviewExtras, { siteId: own.holdId })).assistants.map((row) => [row.engine, row.pages]));
    expect([...(await pagesOf()).values()].every((pages) => pages === null)).toBe(true);

    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_optimization_chat_gpt_llm_responses", family: "AI", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      await ctx.db.insert("aiAnswers", {
        prompt, engine: "chatgpt", locationCode: answerPlace("chatgpt", UK), day: "2026-09-25", pullId,
        named: [], recommended: [], warnedAgainst: [], createdAt: Date.now(),
      });
    });
    await t.mutation(internal.siteListAi.recountQuestion, { holdId: own.holdId, prompt });
    await t.action(internal.siteListAi.summariseList, { holdId: own.holdId });
    const pages = await pagesOf();
    // ChatGPT has answered, and linked to none of the site's pages; Perplexity has not answered yet.
    expect(pages.get("chatgpt")).toBe(0);
    expect(pages.get("perplexity")).toBeNull();
  });
});

describe("side by side, one count (4.11)", () => {
  test("counts Top 3 as the Sites list does, and draws the five competitors with the most traffic", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const bands = (top3: number) => ({ p01_03: top3, p04_10: 0, p11_20: 0, p21_50: 0, p51_up: 0 });
    await t.run(async (ctx) => {
      await ctx.db.insert("siteDaySummaries", {
        // DataForSEO's bands arrive with its traffic figures; the stored keywords' own count fewer.
        websiteId: own.websiteId, locationCode: UK, day: "2026-09-24", keywords: 947, bands: bands(18), allBands: bands(40), estimatedTraffic: 1_200, updatedAt: Date.now(),
      });
    });
    const traffic = [300, 900, 100, 700, 500, 800, 200];
    for (const [index, visits] of traffic.entries()) {
      const rival = await hold(t, korda, `rival-${index}.co.uk`, own.websiteId);
      await t.run(async (ctx) => {
        await ctx.db.insert("siteDaySummaries", { websiteId: rival.websiteId, locationCode: UK, day: "2026-09-24", estimatedTraffic: visits, updatedAt: Date.now() });
      });
    }
    const asKorda = await member(t, korda);

    const listed = (await asKorda.query(api.sites.listMySites, {})).find((row) => row.host === "kordatackle.com");
    const [you] = await asKorda.query(api.siteCharts.siteAndRivals, { siteId: own.holdId });
    expect(listed?.top3).toBe(40);
    expect(you.top3).toBe(40);

    const lines = await asKorda.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-26", step: "day", withRivals: true });
    expect(lines.filter((line) => !line.isYou).map((line) => line.host)).toEqual([
      "rival-1.co.uk", "rival-5.co.uk", "rival-3.co.uk", "rival-4.co.uk", "rival-0.co.uk",
    ]);
  });
});

describe("content gap, ranking now (4.10)", () => {
  test("counts what a competitor ranks for at its latest check, against what the site ranks for at its own", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const rival = await hold(t, korda, "nashtackle.co.uk", own.websiteId);
    const listChecked = async (websiteId: Id<"websites">, day: string) => await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "domain_ranked_keywords_list", family: "Labs", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
        tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.parse(`${day}T08:00:00Z`),
      } as never);
      await ctx.db.insert("seoWebsiteMetrics", { websiteId, day, operationId: "domain_ranked_keywords_list", pullId, metricsJson: "{}", locationCode: UK, createdAt: Date.now() });
    });
    await listChecked(own.websiteId, "2026-09-24");
    await listChecked(rival.websiteId, "2026-09-24");
    // Both sites' rankings: the site held "carp rigs" only before its latest
    // check; the competitor was last seen on "tackle box" before its own.
    await ranks(t, own.websiteId, "carp rigs", 5, "2026-09-20");
    await ranks(t, own.websiteId, "bivvies", 3, "2026-09-24");
    await ranks(t, rival.websiteId, "carp rigs", 2, "2026-09-24");
    await ranks(t, rival.websiteId, "bivvies", 1, "2026-09-24");
    await ranks(t, rival.websiteId, "tackle box", 4, "2026-09-20");

    // The keyword copies the gap is worked out from when read, each with its latest check.
    for (const site of [own, rival]) await t.action(internal.siteSummaries.rebuildSite, { websiteId: site.websiteId, locationCode: UK });
    await finishScheduled(t);
    const asKorda = await member(t, korda);
    const gap = await asKorda.query(api.siteCompetitors.listContentGap, { siteId: own.holdId, page: 1, rows: 25 });
    // "carp rigs": the competitor ranks for it now and the site no longer does.
    // Not "tackle box": the competitor has not been seen on it since before its
    // latest check — as its shared searches have always read it (`keywordStanding`).
    expect(gap.rows.map((row) => row.keyword)).toEqual(["carp rigs"]);
  });
});

describe("nofollow linking websites (4.13)", () => {
  test("the linking websites list narrows to those with a nofollow link, the websites the count is of", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "backlinks_referring_domains", family: "Backlinks", mode: "LIVE", websiteId: own.websiteId, taskArgsJson: "{}",
        status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      for (const [domain, nofollowPages] of [["followed.co.uk", 0], ["mixed.co.uk", 2], ["unknown.co.uk", undefined], ["nofollow.com", 5]] as const) {
        await ctx.db.insert("siteReferringDomains", {
          websiteId: own.websiteId, pullId, day: "2026-09-24", domain, rank: 100, backlinks: 5, status: "LIVE", referringPages: 5,
          ...(nofollowPages === undefined ? {} : { nofollowPages }),
        });
      }
    });
    const asRonins = await member(t, ronins);
    const every = await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25 });
    const nofollow = await asRonins.query(api.siteLinkLists.listReferringDomains, { siteId: own.holdId, page: 1, rows: 25, status: "LIVE", follow: "NOFOLLOW" });
    expect(every.total).toBe(4);
    expect(nofollow.rows.map((row) => row.domain).sort()).toEqual(["mixed.co.uk", "nofollow.com"]);
    expect(nofollow.total).toBe(2);
  });
});
