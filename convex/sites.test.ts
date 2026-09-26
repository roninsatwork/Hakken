import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { finishScheduled } from "@/src/test/finishScheduled";
import { kdBandFor, pageTypeByAddress } from "./utils/siteShapes";

/**
 * The client's Sites screens (docs/plans/active/user-sites-plan.md).
 *
 * Three rules carry them. **Every hold is a Site** (D17): the company's own
 * website and the ones it watches are all on the list and all open, with the
 * rest of the group beside them. **The company comes from the caller**:
 * another company's hold answers "not found" exactly as a missing one does, on
 * every query. **Nothing counts on page load**: the tables read the latest
 * rankings and the summaries built from them when results are filed.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY = "2026-09-23";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function hold(
  t: Harness,
  companyId: Id<"companies">,
  host: string,
  relationship: "OWNED" | "TRACKED",
  againstWebsiteId?: Id<"websites">,
) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    const websiteId = existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship, createdAt: Date.now(),
      ...(againstWebsiteId ? { againstWebsiteId } : {}),
      ...(relationship === "OWNED" ? { locationCode: UK } : {}),
    });
    return { websiteId, holdId };
  });
}

async function summary(t: Harness, websiteId: Id<"websites">, day: string, fields: Record<string, unknown>) {
  await t.run(async (ctx) => await ctx.db.insert("siteDaySummaries", {
    websiteId, locationCode: UK, day, updatedAt: Date.now(), ...fields,
  } as never));
}

/** A list's AI line about one website on one day (`siteListAiDays`), as the day sync writes it. */
async function aiLine(
  t: Harness,
  list: { holdId: Id<"companyWebsites">; websiteId: Id<"websites"> },
  websiteId: Id<"websites">,
  day: string,
  ai: Array<{ engine: string; asked: number; named: number; recommended: number }>,
) {
  await t.run(async (ctx) => await ctx.db.insert("siteListAiDays", {
    companyWebsiteId: list.holdId, askerWebsiteId: list.websiteId, locationCode: UK, websiteId, day, ai, updatedAt: Date.now(),
  } as never));
}

async function pull(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

/** File a ranked-keywords result, exactly as the parser does. */
async function fileRanks(
  t: Harness,
  websiteId: Id<"websites">,
  day: string,
  positions: Array<{ keyword: string; position: number; url?: string; searchVolume?: number; [extra: string]: unknown }>,
  totals: { rankedKeywords: number; [metric: string]: number } = { rankedKeywords: 10_000 },
) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId: await pull(t, websiteId),
    websiteId,
    operationId: "domain_ranked_keywords",
    day,
    locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: positions.length, estimatedTraffic: 100, ...totals }),
    positions: positions as never,
  });
}

describe("the Sites list", () => {
  test("lists the company's own website and the ones it watches, owned first", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await hold(t, ronins, "chilliapple.co.uk", "TRACKED", own.websiteId);
    await summary(t, own.websiteId, DAY, {
      keywords: 100, rankedKeywordsTotal: 807, estimatedTraffic: 1937,
      bands: { p01_03: 18, p04_10: 72, p11_20: 10, p21_50: 0, p51_up: 0 },
    });
    // The AI figures are the company's own list's (docs/plans/active/private-tracking-lists-plan.md).
    await aiLine(t, own, own.websiteId, DAY, [
      { engine: "perplexity", asked: 1, named: 1, recommended: 1 }, { engine: "chatgpt", asked: 1, named: 0, recommended: 0 },
    ]);

    const rows = await (await member(t, ronins)).query(api.sites.listMySites, {});
    expect(rows.map((row) => [row.host, row.relationship, row.ofHost])).toEqual([
      ["ronins.co.uk", "OWNED", null],
      ["chilliapple.co.uk", "TRACKED", "ronins.co.uk"],
      ["lightflows.co.uk", "TRACKED", "ronins.co.uk"],
    ]);
    expect(rows[0]).toMatchObject({ checked: true, aiNamed: 1, aiAsked: 2, top3: 18, pageOne: 90, keywords: 807, estimatedTraffic: 1937 });
    // A watched site nothing has checked yet shows no figures, never zeros.
    expect(rows[1]).toMatchObject({ checked: false, aiNamed: null, top3: null, keywords: null, estimatedTraffic: null });
  });
});

describe("one company never sees another's websites", () => {
  test("not on the list, not by address, and not through any page's query", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Someone Else");
    await hold(t, ronins, "ronins.co.uk", "OWNED");
    const theirs = await hold(t, other, "pixelfield.co.uk", "OWNED");
    const asRonins = await member(t, ronins);

    expect((await asRonins.query(api.sites.listMySites, {})).map((row) => row.host)).toEqual(["ronins.co.uk"]);
    // Their hold, by address: not found, the same as a hold that never existed.
    expect(await asRonins.query(api.sites.getMySite, { siteId: theirs.holdId })).toBeNull();

    const siteId = theirs.holdId;
    const range = { from: "2026-09-01", to: DAY };
    const attempts: Array<() => Promise<unknown>> = [
      () => asRonins.query(api.siteKeywords.listKeywords, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteKeywords.keywordsOnDay, { siteId, day: DAY, keywords: ["web design"] }),
      () => asRonins.query(api.siteKeywords.listMoves, { siteId, page: 1, rows: 25, status: "UP" }),
      () => asRonins.query(api.siteKeywords.listPages, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteKeywords.listSections, { siteId }),
      () => asRonins.query(api.siteCharts.siteSeries, { siteId, ...range, step: "day", withRivals: true }),
      () => asRonins.query(api.siteCharts.siteCalendar, { siteId, month: "2026-09" }),
      () => asRonins.query(api.siteCharts.siteAndRivals, { siteId }),
      () => asRonins.query(api.siteAi.listMentions, { siteId }),
      () => asRonins.query(api.siteAi.shareOfVoice, { siteId }),
      () => asRonins.query(api.siteAi.listCitedPages, { siteId }),
      () => asRonins.query(api.siteAi.listSearched, { siteId }),
      () => asRonins.query(api.siteGoogle.listSearches, { siteId }),
      () => asRonins.query(api.siteGoogle.searchPositions, { siteId, keywords: ["web design"], ...range }),
      () => asRonins.query(api.siteCompetitors.listRivals, { siteId }),
      () => asRonins.query(api.siteCompetitors.listOrganicCompetitors, { siteId }),
      () => asRonins.query(api.siteCompetitors.listContentGap, { siteId, page: 1, rows: 25 }),
      () => asRonins.query(api.siteCompetitors.listSuggested, { siteId }),
      () => asRonins.query(api.siteCompetitors.marketMap, { siteId }),
      () => asRonins.query(api.siteOverview.overviewExtras, { siteId }),
      () => asRonins.query(api.siteAnswers.answerQuestions, { siteId }),
      () => asRonins.query(api.siteAnswers.listAnswers, { siteId, page: 1, rows: 25, prompt: "best agencies in leeds", ...range }),
      () => asRonins.query(api.siteGoogleSerp.listAbove, { siteId }),
      () => asRonins.query(api.siteGoogleSerp.listFeatures, { siteId }),
      () => asRonins.query(api.siteGoogleSerp.listQuestions, { siteId }),
      () => asRonins.query(api.siteLinks.linkProfile, { siteId }),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toThrow(/not one your company holds/);
  });
});

describe("one site", () => {
  test("a watched site opens with the rest of its group beside it", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const rival = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await hold(t, ronins, "pixelfield.co.uk", "TRACKED", own.websiteId);
    // Watched against nothing: not in the group.
    await hold(t, ronins, "stray.co.uk", "TRACKED");

    const asRonins = await member(t, ronins);
    const site = await asRonins.query(api.sites.getMySite, { siteId: rival.holdId });
    expect(site).toMatchObject({ host: "lightflows.co.uk", relationship: "TRACKED", ofHost: "ronins.co.uk", checked: false });
    expect(site?.holds.map((entry) => entry.host)).toEqual(["ronins.co.uk", "lightflows.co.uk", "pixelfield.co.uk", "stray.co.uk"]);
    expect(site?.rivals.map((entry) => entry.host)).toEqual(["ronins.co.uk", "pixelfield.co.uk"]);

    const owned = await asRonins.query(api.sites.getMySite, { siteId: own.holdId });
    expect(owned?.rivals.map((entry) => entry.host)).toEqual(["lightflows.co.uk", "pixelfield.co.uk"]);
  });

  test("a chart reads the days in range, in steps, plus the day before", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await summary(t, own.websiteId, "2026-08-20", { estimatedTraffic: 1500, rankedUp: 1 });
    await summary(t, own.websiteId, "2026-09-01", { estimatedTraffic: 1700, rankedUp: 2 });
    await summary(t, own.websiteId, "2026-09-10", { estimatedTraffic: 1937, rankedUp: 3 });
    await summary(t, own.websiteId, "2026-09-30", { estimatedTraffic: 2100, rankedUp: 4 });

    const asRonins = await member(t, ronins);
    const daily = await asRonins.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-01", to: DAY, step: "day" });
    expect(daily[0].points.map((point) => point.day)).toEqual(["2026-09-01", "2026-09-10"]);
    expect(daily[0].before?.day).toBe("2026-08-20");

    // A month is one point: the last level in it, and the flows added up.
    const monthly = await asRonins.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-01", to: "2026-09-30", step: "month" });
    expect(monthly[0].points).toHaveLength(1);
    expect(monthly[0].points[0]).toMatchObject({ day: "2026-09-01", estimatedTraffic: 2100, rankedUp: 9 });
  });
});

describe("rankings, as they are filed", () => {
  test("the latest ranking of each keyword moves on with each check, and an older re-parse does not wind it back", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");

    await fileRanks(t, own.websiteId, "2026-09-20", [{ keyword: "Web Design Surrey", position: 9, url: "https://ronins.co.uk/web-design-surrey/", searchVolume: 390 }]);
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "web design surrey", position: 4, url: "https://ronins.co.uk/web-design-surrey/" }]);
    await fileRanks(t, own.websiteId, "2026-09-10", [{ keyword: "web design surrey", position: 30 }]);

    const rows = await t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "web design surrey", position: 4, previousPosition: 9, change: 5, status: "UP", band: "p04_10",
      day: DAY, firstSeenDay: "2026-09-20", page: "/web-design-surrey/", volume: 390, volumeKnown: true,
    });
  });

  test("the rebuild counts pages, folders and the day, and only a complete pull marks a keyword lost", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, "2026-09-20", [
      { keyword: "ai agency", position: 2, url: "https://ronins.co.uk/ai-agency/", searchVolume: 900 },
      { keyword: "ai agency london", position: 1, url: "https://ronins.co.uk/ai-agency/", searchVolume: 200 },
      { keyword: "bad websites", position: 14, url: "https://ronins.co.uk/hub/bad-websites/", searchVolume: 700 },
    ], { rankedKeywords: 50 });
    // A later pull that covered everything the site ranks for, without "bad websites".
    await fileRanks(t, own.websiteId, DAY, [
      { keyword: "ai agency", position: 3, url: "https://ronins.co.uk/ai-agency/", searchVolume: 900 },
      { keyword: "ai agency london", position: 1, url: "https://ronins.co.uk/ai-agency/", searchVolume: 200 },
    ], { rankedKeywords: 2 });

    await t.action(internal.siteSummaries.rebuildSite, { websiteId: own.websiteId, locationCode: UK });

    const [pages, sections, days, ranks] = await t.run(async (ctx) => [
      await ctx.db.query("sitePageRanks").collect(),
      await ctx.db.query("siteSections").collect(),
      await ctx.db.query("siteDaySummaries").collect(),
      await ctx.db.query("siteKeywordRanks").collect(),
    ] as const);
    expect(pages.map((row) => [row.page, row.keywords, row.bestPosition, row.topKeyword])).toEqual([
      ["/ai-agency/", 2, 1, "ai agency"],
    ]);
    expect(sections.map((row) => [row.section, row.pages, row.keywords])).toEqual([["/", 1, 2]]);
    expect(ranks.find((row) => row.keyword === "bad websites")).toMatchObject({ status: "LOST", band: "zz_none", previousPosition: 14 });
    const today = days.find((row) => row.day === DAY);
    expect(today).toMatchObject({ keywords: 2, pages: 1, rankedDown: 1, rankedLost: 1, rankedKeywordsTotal: 2 });
    expect(today?.bands).toEqual({ p01_03: 2, p04_10: 0, p11_20: 0, p21_50: 0, p51_up: 0 });
  });

  test("the keyword table filters, sorts and counts from its compact copy, and leaves lost keywords out unless asked", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, "2026-09-20", [
      { keyword: "ai agency", position: 2, url: "https://ronins.co.uk/ai-agency/", searchVolume: 900 },
      { keyword: "web design surrey", position: 9, url: "https://ronins.co.uk/web-design-surrey/", searchVolume: 390 },
      { keyword: "bad websites", position: 14, url: "https://ronins.co.uk/hub/bad-websites/", searchVolume: 1500 },
    ]);
    await t.mutation(internal.seoCollectionParse.writeKeywordIntents, {
      judged: [{ keyword: "ai agency", intent: "BUYING" }, { keyword: "web design surrey", intent: "BUYING" }],
    });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("siteKeywordRanks").collect()).find((entry) => entry.keyword === "bad websites")!;
      await ctx.db.patch(row._id, { status: "LOST", band: "zz_none", position: undefined });
    });
    await t.action(internal.siteSummaries.rebuildSite, { websiteId: own.websiteId, locationCode: UK });

    const asRonins = await member(t, ronins);
    const list = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteKeywords.listKeywords, { siteId: own.holdId, page: 1, rows: 25, ...args }))
        .rows.map((row) => row.keyword);

    expect(await list({})).toEqual(["ai agency", "web design surrey"]);
    expect(await list({ band: "p04_10" })).toEqual(["web design surrey"]);
    expect(await list({ intent: "BUYING", sort: "volume" })).toEqual(["ai agency", "web design surrey"]);
    expect(await list({ status: "LOST" })).toEqual(["bad websites"]);
    expect(await list({ path: "/ai-agency/" })).toEqual(["ai agency"]);
    // A search leaves lost keywords out too, unless they are asked for.
    expect(await list({ search: "websites" })).toEqual([]);
    expect(await list({ search: "websites", status: "LOST" })).toEqual(["bad websites"]);
    expect(await list({ search: "surrey" })).toEqual(["web design surrey"]);
  });

  test("wins and losses list the biggest move first", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, "2026-09-20", [
      { keyword: "small win", position: 5 },
      { keyword: "big win", position: 30 },
      { keyword: "a drop", position: 2 },
    ]);
    await fileRanks(t, own.websiteId, DAY, [
      { keyword: "small win", position: 4 },
      { keyword: "big win", position: 3 },
      { keyword: "a drop", position: 8 },
    ]);
    await t.action(internal.siteSummaries.rebuildSite, { websiteId: own.websiteId, locationCode: UK });
    const asRonins = await member(t, ronins);
    const moves = async (status: "UP" | "DOWN") =>
      (await asRonins.query(api.siteKeywords.listMoves, { siteId: own.holdId, status, page: 1, rows: 25 }))
        .rows.map((row) => [row.keyword, row.change]);
    expect(await moves("UP")).toEqual([["big win", 27], ["small win", 1]]);
    expect(await moves("DOWN")).toEqual([["a drop", -6]]);
    // Searched within the move chosen.
    const searched = await asRonins.query(api.siteKeywords.listMoves, {
      siteId: own.holdId, status: "UP", search: "small", page: 1, rows: 25,
    });
    expect(searched.rows.map((row) => row.keyword)).toEqual(["small win"]);
  });
});

describe("the content gap", () => {
  test("lists what the rest of the group ranks for and the site does not, for owned and watched sites alike", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const rival = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "ai agency", position: 2, searchVolume: 900 }]);
    await fileRanks(t, rival.websiteId, DAY, [
      { keyword: "ai agency", position: 5, searchVolume: 900 },
      { keyword: "web design agency london", position: 6, searchVolume: 1900 },
    ]);

    await t.action(internal.siteContentGap.rebuildGap, { companyWebsiteId: own.holdId });
    await t.action(internal.siteContentGap.rebuildGap, { companyWebsiteId: rival.holdId });
    for (const holdId of [own.holdId, rival.holdId]) {
      await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "gap", key: holdId });
    }

    const asRonins = await member(t, ronins);
    const gap = await asRonins.query(api.siteCompetitors.listContentGap, { siteId: own.holdId, page: 1, rows: 25 });
    expect(gap.rows.map((row) => [row.keyword, row.rivals.map((entry) => entry.host)])).toEqual([
      ["web design agency london", ["lightflows.co.uk"]],
    ]);
    // The watched site's gap is read against the owned site it is watched with.
    const theirs = await asRonins.query(api.siteCompetitors.listContentGap, { siteId: rival.holdId, page: 1, rows: 25 });
    expect(theirs.rows).toEqual([]);
  });

  test("a filing asks for the group's gaps to be rebuilt, and they are", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const rival = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await fileRanks(t, rival.websiteId, DAY, [{ keyword: "wordpress agency london", position: 2, searchVolume: 590 }]);

    await finishScheduled(t);

    const rows = await t.run(async (ctx) => await ctx.db.query("siteContentGaps").collect());
    expect(rows.map((row) => [row.companyWebsiteId, row.keyword])).toEqual([[own.holdId, "wordpress agency london"]]);
  });
});

describe("a watched site's AI figures", () => {
  test("come from the answers to the owned site's questions, and never from another company's", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Someone Else");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const rival = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    const theirs = await hold(t, other, "otheragency.co.uk", "OWNED");
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: "best web designers in surrey", engines: ["perplexity"], isActive: true, createdAt: Date.now(),
      } as never);
      await ctx.db.insert("websiteQuestions", {
        websiteId: theirs.websiteId, companyWebsiteId: theirs.holdId, prompt: "best agencies in leeds", engines: ["perplexity"], isActive: true, createdAt: Date.now(),
      } as never);
    });
    const ownPull = await pull(t, own.websiteId);
    const theirPull = await pull(t, theirs.websiteId);
    const leedsPull = await pull(t, theirs.websiteId);
    const LEEDS = 1006886;
    await t.run(async (ctx) => {
      await ctx.db.insert("aiAnswers", {
        prompt: "best web designers in surrey", engine: "perplexity", locationCode: UK, day: DAY, pullId: ownPull,
        named: [own.websiteId, rival.websiteId], recommended: [rival.websiteId], warnedAgainst: [], createdAt: Date.now(),
      });
      // The other company's answers name the same rival: to its own question,
      // and to the very same question asked from another place.
      await ctx.db.insert("aiAnswers", {
        prompt: "best agencies in leeds", engine: "perplexity", locationCode: UK, day: DAY, pullId: theirPull,
        named: [rival.websiteId], recommended: [rival.websiteId], warnedAgainst: [], createdAt: Date.now(),
      });
      await ctx.db.insert("aiAnswers", {
        prompt: "best web designers in surrey", engine: "perplexity", locationCode: LEEDS, day: DAY, pullId: leedsPull,
        named: [rival.websiteId], recommended: [], warnedAgainst: [], createdAt: Date.now(),
      });
      for (const [prompt, pullId, locationCode] of [
        ["best web designers in surrey", ownPull, UK], ["best agencies in leeds", theirPull, UK], ["best web designers in surrey", leedsPull, LEEDS],
      ] as const) {
        await ctx.db.insert("aiCitations", {
          prompt, engine: "perplexity", locationCode, day: DAY, pullId, kind: "BRAND",
          mentionedWebsiteId: rival.websiteId, mentionedText: "Lightflows", stance: "RECOMMENDED", position: 1, createdAt: Date.now(),
        });
      }
    });
    // Worked out with the owned site's day summaries, as a filing does.
    for (const websiteId of [own.websiteId, theirs.websiteId]) {
      await t.mutation(internal.siteSummaries.syncDays, { websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: DAY });
    }

    const asRonins = await member(t, ronins);
    const rows = await asRonins.query(api.sites.listMySites, {});
    expect(rows.find((row) => row.host === "lightflows.co.uk")).toMatchObject({ aiNamed: 1, aiAsked: 1 });

    const lines = await asRonins.query(api.siteCharts.siteSeries, { siteId: rival.holdId, from: "2026-09-01", to: DAY, step: "day" });
    // Named once: the answer to Ronins' question, from Ronins' place. The
    // other company's answers naming the same website are not Ronins' to see.
    expect(lines[0].points.flatMap((point) => point.ai)).toEqual([{ engine: "perplexity", asked: 0, named: 1, recommended: 1 }]);
    // And an answer that no longer names it takes its line back down.
    await t.run(async (ctx) => {
      const answer = await ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", ownPull)).unique();
      await ctx.db.patch(answer!._id, { named: [own.websiteId], recommended: [] });
    });
    await t.mutation(internal.siteSummaries.syncDays, { websiteId: own.websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: DAY });
    const after = await asRonins.query(api.siteCharts.siteSeries, { siteId: rival.holdId, from: "2026-09-01", to: DAY, step: "day" });
    expect(after[0].points.flatMap((point) => point.ai)).toEqual([]);
  });
});

describe("what the raw answers hold, read out (Phase 2)", () => {
  test("a ranking keeps what DataForSEO says about the search; a later sighting on another page keeps the search's facts and drops the old page's", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, "2026-09-20", [{
      keyword: "web design surrey", position: 4, url: "https://ronins.co.uk/web-design-surrey/", searchVolume: 390,
      cpc: 4.2, difficulty: 41, trend: [100, 120, 90], traffic: 58.5, trafficValue: 245.9, serpFeatures: ["local_pack"],
      pageRank: 312, pageReferringDomains: 14, pageBacklinks: 51,
    }]);
    const rank = async () => (await t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").collect()))[0];
    expect(await rank()).toMatchObject({
      cpc: 4.2, difficulty: 41, kdBand: "kd31_70", trend: [100, 120, 90], traffic: 58.5, trafficValue: 245.9,
      serpFeatures: ["local_pack"], pageRank: 312, pageReferringDomains: 14, pageBacklinks: 51,
    });

    // A tracked search's check adds nothing to the keyword list: the search is
    // one company's own (docs/plans/active/private-tracking-lists-plan.md, V5).
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, {
      pullId: await pull(t, own.websiteId), keyword: "web design surrey", locationCode: UK, day: DAY,
      found: [{ websiteId: own.websiteId, position: 3, url: "https://ronins.co.uk/services/web-design/" }],
    });
    expect(await rank()).toMatchObject({ position: 4, page: "/web-design-surrey/", day: "2026-09-20" });

    // The next list found the site with another page: the search's facts
    // still hold; the traffic and the old page's figures do not.
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "web design surrey", position: 3, url: "https://ronins.co.uk/services/web-design/" }]);
    const after = await rank();
    expect(after).toMatchObject({ position: 3, page: "/services/web-design/", cpc: 4.2, difficulty: 41, kdBand: "kd31_70", serpFeatures: ["local_pack"] });
    expect(after.traffic).toBeUndefined();
    expect(after.pageRank).toBeUndefined();
  });

  test("the rebuild carries traffic, page rank, links and page type to pages, and DataForSEO's own bands to the day", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, DAY, [
      { keyword: "ronins", position: 1, url: "https://ronins.co.uk/", searchVolume: 90, traffic: 40, trafficValue: 10, pageRank: 500, pageReferringDomains: 90 },
      { keyword: "ronins agency", position: 1, url: "https://ronins.co.uk/", searchVolume: 20, traffic: 10, trafficValue: 5, pageRank: 510, pageReferringDomains: 91 },
      { keyword: "what is a web app", position: 5, url: "https://ronins.co.uk/hub/what-is-a-web-app/", searchVolume: 900, traffic: 890, difficulty: 12, cpc: 1.5 },
      { keyword: "ai agency", position: 2, url: "https://ronins.co.uk/ai-agency/", searchVolume: 700, traffic: 240, difficulty: 55, cpc: 9 },
    ], {
      rankedKeywords: 807, bandTop3: 58, band4to10: 221, band11to20: 144, band21to50: 198, band51up: 186,
      trafficValue: 15552.4, keywordsNew: 250, keywordsUp: 201, keywordsDown: 309, keywordsLost: 0,
    });
    await t.action(internal.siteSummaries.rebuildSite, { websiteId: own.websiteId, locationCode: UK });

    const pages = await t.run(async (ctx) => await ctx.db.query("sitePageRanks").collect());
    const byPage = new Map(pages.map((row) => [row.page, row]));
    // The address settles what it can for free; the rest waits for the Decision.
    expect(byPage.get("/")).toMatchObject({ pageType: "HOME", traffic: 50, trafficValue: 15, pageRank: 510, referringDomains: 91 });
    expect(byPage.get("/hub/what-is-a-web-app/")).toMatchObject({ pageType: "ARTICLE", traffic: 890 });
    expect(byPage.get("/ai-agency/")).toMatchObject({ pageType: "UNJUDGED", traffic: 240 });
    const sections = await t.run(async (ctx) => await ctx.db.query("siteSections").collect());
    expect(sections.find((row) => row.section === "/hub/")).toMatchObject({ traffic: 890, day: DAY });

    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "pages", key: `${own.websiteId}:${UK}` });
    const asRonins = await member(t, ronins);
    const first = { page: 1, rows: 25 };
    const listPages = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteKeywords.listPages, { siteId: own.holdId, ...first, ...args })).rows.map((row) => row.page);
    expect(await listPages({ sort: "traffic" })).toEqual(["/hub/what-is-a-web-app/", "/ai-agency/", "/"]);
    expect(await listPages({ pageType: "ARTICLE" })).toEqual(["/hub/what-is-a-web-app/"]);
    // Best position and linking websites are held in the copy for every page,
    // so they order the whole list (docs/plans/active/sites-table-sorting-plan.md §4.6).
    expect(await listPages({ sort: "best" })).toEqual(["/", "/ai-agency/", "/hub/what-is-a-web-app/"]);
    expect(await listPages({ sort: "best", direction: "desc" })).toEqual(["/hub/what-is-a-web-app/", "/ai-agency/", "/"]);
    expect((await listPages({ sort: "linking" }))[0]).toBe("/");
    expect(await listPages({ sort: "page" })).toEqual(["/", "/ai-agency/", "/hub/what-is-a-web-app/"]);
    expect(await listPages({ sort: "traffic", direction: "asc" })).toEqual(["/", "/ai-agency/", "/hub/what-is-a-web-app/"]);

    const listKeywords = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteKeywords.listKeywords, { siteId: own.holdId, ...first, ...args })).rows.map((row) => row.keyword);
    expect(await listKeywords({ sort: "traffic" })).toEqual(["what is a web app", "ai agency", "ronins", "ronins agency"]);
    // Dearest first; the two with no price follow, in no promised order.
    expect((await listKeywords({ sort: "cpc" })).slice(0, 2)).toEqual(["ai agency", "what is a web app"]);
    // A heading pressed again: the other way round, over the whole list —
    // and the searches with no price still last, never the first page.
    expect(await listKeywords({ sort: "traffic", direction: "asc" })).toEqual(["ronins agency", "ronins", "ai agency", "what is a web app"]);
    expect(await listKeywords({ sort: "cpc", direction: "asc" })).toEqual(["what is a web app", "ai agency", "ronins", "ronins agency"]);
    expect(await listKeywords({ direction: "desc" })).toEqual(["what is a web app", "ai agency", "ronins", "ronins agency"]);
    expect(await listKeywords({})).toEqual(["ronins", "ronins agency", "ai agency", "what is a web app"]);
    expect(await listKeywords({ kdBand: "kd11_30" })).toEqual(["what is a web app"]);
    expect(await listKeywords({ kdBand: "kd31_70", search: "agency" })).toEqual(["ai agency"]);

    const [line] = await asRonins.query(api.siteCharts.siteSeries, { siteId: own.holdId, from: "2026-09-01", to: DAY, step: "day" });
    expect(line.points.at(-1)).toMatchObject({
      allBands: { p01_03: 58, p04_10: 221, p11_20: 144, p21_50: 198, p51_up: 186 },
      trafficValue: 15552, keywordsNew: 250, keywordsUp: 201, keywordsDown: 309, keywordsLost: 0,
    });
    // The list and the menu count the top 3 across everything the site ranks for.
    expect((await asRonins.query(api.sites.listMySites, {}))[0]).toMatchObject({ top3: 58, pageOne: 279 });
  });

  test("the page type is read from the address where the address says it plainly", () => {
    expect(pageTypeByAddress("/")).toBe("HOME");
    expect(pageTypeByAddress("/index.html")).toBe("HOME");
    expect(pageTypeByAddress("/contact-us/")).toBe("CONTACT");
    expect(pageTypeByAddress("/blog/why-sites-fail/")).toBe("ARTICLE");
    expect(pageTypeByAddress("/case-studies/pixelfield/")).toBe("CASE_STUDY");
    expect(pageTypeByAddress("/shop/")).toBe("CATEGORY");
    expect(pageTypeByAddress("/shop/blue-mug/")).toBe("PRODUCT");
    expect(pageTypeByAddress("/privacy-policy")).toBe("LEGAL");
    // Only reading the page would tell.
    expect(pageTypeByAddress("/ai-agency/")).toBeNull();
    expect(kdBandFor(undefined)).toBeUndefined();
    expect([0, 10, 11, 30, 31, 70, 71, 100].map((value) => kdBandFor(value))).toEqual([
      "kd00_10", "kd00_10", "kd11_30", "kd11_30", "kd31_70", "kd31_70", "kd71_100", "kd71_100",
    ]);
  });
});

describe("Google's first page for each search", () => {
  test("who ranks above the site, which features show, and what people also ask", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await t.run(async (ctx) => {
      for (const keyword of ["web design surrey", "ai agency"]) {
        await ctx.db.insert("websiteKeywords", { websiteId: own.websiteId, companyWebsiteId: own.holdId, keyword, isActive: true, createdAt: Date.now() });
      }
    });
    const check = async (keyword: string, results: Array<{ position: number; domain: string; url?: string }>, extras: Record<string, unknown>) =>
      await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, {
        pullId: await pull(t, own.websiteId), keyword, locationCode: UK, day: DAY, found: [],
        serp: {
          resultCount: 1000, results, features: [], aiOverviewDomains: [], localPackDomains: [], questions: [], related: [],
          ...extras,
        } as never,
      });
    await check("web design surrey", [
      { position: 1, domain: "www.lightflows.co.uk" },
      { position: 2, domain: "example.com" },
      { position: 4, domain: "www.ronins.co.uk", url: "https://www.ronins.co.uk/web-design/" },
    ], {
      features: ["ai_overview", "people_also_ask", "related_searches"],
      aiOverviewDomains: ["www.ronins.co.uk", "example.com"],
      questions: ["How much does a website cost?"],
      related: ["cheap web design"],
    });
    await check("ai agency", [{ position: 1, domain: "reddit.com" }, { position: 2, domain: "example.com" }, { position: 12, domain: "deep.example" }], {
      features: ["people_also_ask", "local_pack"],
      localPackDomains: ["maps-agency.com"],
      questions: ["How much does a website cost?", "What does an AI agency do?"],
    });

    const asRonins = await member(t, ronins);
    const above = await asRonins.query(api.siteGoogleSerp.listAbove, { siteId: own.holdId });
    expect(above.map((row) => [row.keyword, row.position, row.above.map((result) => [result.domain, result.isRival]), row.rivalsAbove])).toEqual([
      ["web design surrey", 4, [["lightflows.co.uk", true], ["example.com", false]], 1],
      // Not in the hundred a check reads: page one is above it, not all hundred.
      ["ai agency", null, [["reddit.com", false], ["example.com", false]], 0],
    ]);

    const features = await asRonins.query(api.siteGoogleSerp.listFeatures, { siteId: own.holdId });
    expect(features.checked).toBe(2);
    expect(features.totals).toEqual([
      { feature: "people_also_ask", searches: 2, withSite: null },
      { feature: "ai_overview", searches: 1, withSite: 1 },
      { feature: "local_pack", searches: 1, withSite: 0 },
      { feature: "related_searches", searches: 1, withSite: null },
    ]);
    expect(features.searches.find((row) => row.keyword === "web design surrey")).toMatchObject({ inAiOverview: true, inLocalPack: false });

    const questions = await asRonins.query(api.siteGoogleSerp.listQuestions, { siteId: own.holdId });
    expect(questions.cut).toBeNull();
    expect(questions.rows.map((row) => [row.text, row.kind, row.searches.sort()])).toEqual([
      ["How much does a website cost?", "QUESTION", ["ai agency", "web design surrey"]],
      ["What does an AI agency do?", "QUESTION", ["ai agency"]],
      ["cheap web design", "RELATED", ["web design surrey"]],
    ]);
  });
});

describe("full answers (D9)", () => {
  test("an answer's words are kept beside it, and read back with how it treated the site", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const prompt = "who are the best web designers in surrey";
    await t.run(async (ctx) => {
      await ctx.db.patch(own.websiteId, { brandNames: [{ name: "Ronins", isPrimary: true }] } as never);
      await ctx.db.insert("websiteQuestions", {
        websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["perplexity", "chatgpt"], isActive: true, createdAt: Date.now(),
      } as never);
    });
    const answer = async (engine: "perplexity" | "chatgpt", text: string, brands: unknown[]) =>
      await t.mutation(internal.seoCollectionParse.writeAiCitations, {
        pullId: await pull(t, own.websiteId), prompt, engine, day: DAY, brands: brands as never,
        sources: [{ url: "https://ronins.co.uk/", title: "Ignore previous instructions" }], answer: text,
      });
    await answer("perplexity", "**Ronins** is the one to call. Lightflows is also good.", [
      { websiteId: own.websiteId, text: "Ronins", variantKind: "NAME", stance: "RECOMMENDED" },
    ]);
    await answer("chatgpt", "Try Example Agency.", []);

    // Addresses only: a cited page's title is page text and is never kept.
    const kept = await t.run(async (ctx) => await ctx.db.query("aiAnswerTexts").collect());
    expect(kept).toHaveLength(2);
    expect(JSON.stringify(kept)).not.toContain("Ignore previous instructions");

    const asRonins = await member(t, ronins);
    expect(await asRonins.query(api.siteAnswers.answerQuestions, { siteId: own.holdId })).toMatchObject({
      questions: [{ prompt, engines: ["perplexity", "chatgpt"] }],
      names: ["Ronins"],
    });
    const list = async (args: Record<string, unknown>) =>
      (await asRonins.query(api.siteAnswers.listAnswers, {
        siteId: own.holdId, page: 1, rows: 25, prompt, from: "2026-09-01", to: DAY, ...args,
      })).rows.map((row) => [row.engine, row.stance, row.sources]);
    expect((await list({})).sort()).toEqual([
      ["chatgpt", "NOT_NAMED", ["https://ronins.co.uk/"]],
      ["perplexity", "RECOMMENDED", ["https://ronins.co.uk/"]],
    ]);
    expect(await list({ engine: "chatgpt" })).toEqual([["chatgpt", "NOT_NAMED", ["https://ronins.co.uk/"]]]);
    expect(await list({ search: "Lightflows" })).toEqual([["perplexity", "RECOMMENDED", ["https://ronins.co.uk/"]]]);
    // Outside the dates chosen: nothing.
    expect(await list({ from: "2026-08-01", to: "2026-08-31" })).toEqual([]);
    // A question not on the site's list is not one to read through it.
    await expect(asRonins.query(api.siteAnswers.listAnswers, {
      siteId: own.holdId, page: 1, rows: 25, prompt: "someone else's question", from: "2026-09-01", to: DAY,
    })).rejects.toThrow(/not one this website is measured on/);
  });
});

describe("pages the engines cite (D17)", () => {
  test("each company counts the answers to its own questions, never another's", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Someone Else");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const theirs = await hold(t, other, "otheragency.co.uk", "OWNED");
    // The other company watches ronins.co.uk too, against its own site.
    const watched = await hold(t, other, "ronins.co.uk", "TRACKED", theirs.websiteId);
    const surrey = "who are the best web designers in surrey";
    const leeds = "best agencies in leeds";
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", { websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: surrey, engines: ["perplexity"], isActive: true, createdAt: Date.now() } as never);
      await ctx.db.insert("websiteQuestions", { websiteId: theirs.websiteId, companyWebsiteId: theirs.holdId, prompt: leeds, engines: ["perplexity"], isActive: true, createdAt: Date.now() } as never);
    });
    const answer = async (asker: Id<"websites">, prompt: string, urls: string[]) =>
      await t.mutation(internal.seoCollectionParse.writeAiCitations, {
        pullId: await pull(t, asker), prompt, engine: "perplexity", day: DAY, brands: [],
        sources: urls.map((url) => ({ url, websiteId: own.websiteId })), answer: "An answer.",
      });
    await answer(own.websiteId, surrey, ["https://ronins.co.uk/web-design/"]);
    await answer(theirs.websiteId, leeds, ["https://www.ronins.co.uk/web-design/", "https://ronins.co.uk/about/"]);
    await answer(theirs.websiteId, leeds, ["https://ronins.co.uk/about/"]);
    // Each cited page is recounted in its own job, a moment after the filing.
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();

    const pages = async (as: Awaited<ReturnType<typeof member>>, siteId: Id<"companyWebsites">) =>
      (await as.query(api.siteAi.listCitedPages, { siteId })).rows.map((row) => [row.page, row.times]);
    // Ronins sees its own question's answer only.
    expect(await pages(await member(t, ronins), own.holdId)).toEqual([["/web-design/", 1]]);
    // The other company sees its own question's answers — every form of an
    // address one page — and none of Ronins'.
    expect(await pages(await member(t, other), watched.holdId)).toEqual([["/about/", 2], ["/web-design/", 1]]);
    // The menu's count and Top pages agree with the list.
    expect((await (await member(t, ronins)).query(api.sites.getMySite, { siteId: own.holdId }))?.counts.citedPages).toBe(1);
  });
});

describe("links and the market", () => {
  test("the link profile reads the newest backlinks summary's breakdowns", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => {
      for (const [day, spamScore] of [["2026-09-01", 9], [DAY, 5]] as const) {
        await ctx.db.insert("seoWebsiteMetrics", {
          websiteId: own.websiteId, day, operationId: "backlinks_summary", pullId, createdAt: Date.now(),
          metricsJson: JSON.stringify({
            backlinks: 1000, referringDomains: 505, rank: 201, brokenBacklinks: 2, brokenPages: 4, spamScore,
            nofollowReferringDomains: 97, countriesJson: JSON.stringify([["GB", 30], ["(none)", 5]]), tldsJson: JSON.stringify([["com", 3]]),
          }),
        });
      }
    });
    const profile = await (await member(t, ronins)).query(api.siteLinks.linkProfile, { siteId: own.holdId });
    expect(profile).toMatchObject({
      day: DAY, spamScore: 5, brokenPages: 4, brokenBacklinks: 2, nofollowReferringDomains: 97, domainRank: 201,
      countries: [{ key: "GB", count: 30 }, { key: "(none)", count: 5 }],
      tlds: [{ key: "com", count: 3 }],
      platforms: [],
    });
  });

  test("the market map places the site, its rivals and the competitors found, each once", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const rival = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    await summary(t, own.websiteId, DAY, { rankedKeywordsTotal: 807, estimatedTraffic: 1937 });
    await summary(t, rival.websiteId, DAY, { rankedKeywordsTotal: 754, estimatedTraffic: 2158 });
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => {
      for (const [host, domainKeywords, domainTraffic] of [["found.co.uk", 4757, 1163.4], ["lightflows.co.uk", 754, 2158]] as const) {
        await ctx.db.insert("discoveredCompetitors", {
          companyWebsiteId: own.holdId, companyId: ronins, host, intersections: 120, domainKeywords, domainTraffic,
          kind: "COMPETITOR", discoveredAt: Date.now(),
        });
        await ctx.db.insert("discoveredCompetitorDays", {
          companyWebsiteId: own.holdId, companyId: ronins, host, day: DAY, intersections: 120, pullId, createdAt: Date.now(),
        });
      }
    });
    const asRonins = await member(t, ronins);
    const map = await asRonins.query(api.siteCompetitors.marketMap, { siteId: own.holdId });
    expect(map.map((row) => [row.host, row.role, row.keywords, row.traffic, row.sharedKeywords, row.day])).toEqual([
      ["ronins.co.uk", "YOU", 807, 1937, null, DAY],
      ["lightflows.co.uk", "RIVAL", 754, 2158, 120, DAY],
      // A competitor the company already tracks is on the map once, as its rival.
      ["found.co.uk", "FOUND", 4757, 1163, 120, DAY],
    ]);
    const organic = await asRonins.query(api.siteCompetitors.listOrganicCompetitors, { siteId: own.holdId });
    expect(organic.find((row) => row.host === "found.co.uk")).toMatchObject({ domainKeywords: 4757, domainTraffic: 1163.4, day: DAY });
  });

  test("the Overview lists every competitor set up, with the searches shared from either side's found list", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    const listed = await hold(t, ronins, "lightflows.co.uk", "TRACKED", own.websiteId);
    const theirList = await hold(t, ronins, "pixelfield.co.uk", "TRACKED", own.websiteId);
    const neither = await hold(t, ronins, "quiet.co.uk", "TRACKED", own.websiteId);
    await summary(t, own.websiteId, DAY, { rankedKeywordsTotal: 807, estimatedTraffic: 1937 });
    await summary(t, listed.websiteId, DAY, { rankedKeywordsTotal: 754, estimatedTraffic: 2158 });
    await summary(t, theirList.websiteId, DAY, { rankedKeywordsTotal: 3100, estimatedTraffic: 9000 });
    await summary(t, neither.websiteId, DAY, { rankedKeywordsTotal: 90, estimatedTraffic: 40 });
    await t.run(async (ctx) => {
      const found = (companyWebsiteId: Id<"companyWebsites">, host: string, intersections: number, kind: "COMPETITOR" | "DIRECTORY", estimatedTraffic?: number) =>
        ctx.db.insert("discoveredCompetitors", {
          companyWebsiteId, companyId: ronins, host, intersections, kind, discoveredAt: Date.now(),
          ...(estimatedTraffic !== undefined ? { estimatedTraffic } : {}),
        });
      // Found for the site: one competitor it tracks, one it does not, and a directory.
      await found(own.holdId, "lightflows.co.uk", 120, "COMPETITOR", 1178.4);
      await found(own.holdId, "found.co.uk", 300, "COMPETITOR");
      await found(own.holdId, "yell.com", 500, "DIRECTORY");
      // Not in the site's list, but the site is in this competitor's own —
      // with the site's visits on those searches, which are not the
      // competitor's to borrow.
      await found(theirList.holdId, "ronins.co.uk", 45, "COMPETITOR", 1521);
    });

    const extras = await (await member(t, ronins)).query(api.siteOverview.overviewExtras, { siteId: own.holdId });
    expect(extras.competitors.you).toEqual({ keywords: 807, visits: 1937 });
    // Every one set up — not only the found — most searches shared first, and a
    // competitor neither list holds says it is not known rather than nought.
    expect(extras.competitors.rivals.map((row) => [row.host, row.keywords, row.visits, row.shared])).toEqual([
      ["lightflows.co.uk", 754, 2158, 120],
      ["pixelfield.co.uk", 3100, 9000, 45],
      ["quiet.co.uk", 90, 40, null],
    ]);
    expect(extras.competitors.rivals.map((row) => row.siteId)).toEqual([listed.holdId, theirList.holdId, neither.holdId]);
    // The Traffic view's visits on shared searches: from the site's own found
    // list only, and not known otherwise.
    expect(extras.competitors.rivals.map((row) => [row.host, row.sharedVisits])).toEqual([
      ["lightflows.co.uk", 1178.4],
      ["pixelfield.co.uk", null],
      ["quiet.co.uk", null],
    ]);
    // What Organic competitors lists as competitors: the directory is not one.
    expect(extras.competitors.found).toBe(2);
  });
});

describe("a website watched by many companies", () => {
  test("asks for every content gap it takes part in, a few holds a step", async () => {
    // All at once, a website watched by two hundred companies with their
    // rivals was more requests than one transaction may schedule, and the
    // rebuild that asked failed (reliability plan 3.4).
    const t = harness();
    const rivals: Array<Awaited<ReturnType<typeof hold>>> = [];
    let watched: Id<"websites"> | null = null;
    for (let index = 0; index < 12; index += 1) {
      const companyId = await company(t, `Company ${index}`);
      const own = await hold(t, companyId, `own-${index}.co.uk`, "OWNED");
      const big = await hold(t, companyId, "bigrival.co.uk", "TRACKED", own.websiteId);
      watched = big.websiteId;
      rivals.push(await hold(t, companyId, `small-${index}.co.uk`, "TRACKED", own.websiteId));
    }

    let steps = 0;
    for (let cursor: string | null = null; ;) {
      const asked: { cursor: string; isDone: boolean } =
        await t.mutation(internal.siteSummaries.requestGapsFor, { websiteId: watched!, locationCode: UK, cursor });
      steps += 1;
      if (asked.isDone) break;
      cursor = asked.cursor;
    }

    expect(steps).toBeGreaterThan(1);
    const gaps = await t.run(async (ctx) => (await ctx.db.query("siteSummaryRequests").collect())
      .filter((row) => row.key.startsWith("gap:")));
    // Each company's group: its own site, the big rival and its small one.
    expect(gaps).toHaveLength(12 * 3);
    expect(gaps.map((row) => row.key)).toEqual(expect.arrayContaining(rivals.map((row) => `gap:${row.holdId}`)));
  });
});

describe("reading stored results again (free)", () => {
  test("a run stopped for time carries on from where it got to, with what it had counted", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "ai agency", position: 2, url: "https://ronins.co.uk/ai-agency/", searchVolume: 700 }]);
    const pullId = (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))[0]._id;
    await t.run(async (ctx) => await ctx.db.patch(pullId, {
      completedAt: Date.parse(`${DAY}T12:00:00Z`),
      resultJson: JSON.stringify([{ total_count: 1, items: [] }]),
    } as never));

    // The ranked-keywords results were read by the run before: this one starts after them.
    const counted = { results: 7, keywords: 3, pages: 0, answers: 0, competitors: 0, metrics: 2 };
    const read = await t.action(internal.siteBackfillRaw.readStoredResults, {
      resume: { operation: 1, cursor: null, site: 0 },
      counts: counted,
    });

    expect(read).toMatchObject({ ...counted, continued: false });
  });

  test("fills the new fields from a stored ranked-keywords result without judging anything again", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk", "OWNED");
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "ai agency", position: 2, url: "https://ronins.co.uk/ai-agency/", searchVolume: 700 }]);
    const pullId = (await t.run(async (ctx) => await ctx.db.query("seoDataPulls").collect()))[0]._id;
    await t.run(async (ctx) => await ctx.db.patch(pullId, {
      completedAt: Date.parse(`${DAY}T12:00:00Z`),
      taskArgsJson: JSON.stringify({ location_code: UK }),
      resultJson: JSON.stringify([{
        total_count: 1,
        metrics: { organic: { etv: 240, pos_2_3: 1, is_new: 1, estimated_paid_traffic_cost: 99 } },
        items: [{
          keyword_data: { keyword: "ai agency", keyword_info: { search_volume: 700, cpc: 9 }, keyword_properties: { keyword_difficulty: 55 } },
          ranked_serp_element: { serp_item: { rank_absolute: 2, url: "https://ronins.co.uk/ai-agency/", etv: 240, rank_info: { page_rank: 126 } } },
        }],
      }]),
    } as never));

    await t.action(internal.siteBackfillRaw.readStoredResults, { operationId: "domain_ranked_keywords" });

    const rank = (await t.run(async (ctx) => await ctx.db.query("siteKeywordRanks").collect()))[0];
    expect(rank).toMatchObject({ cpc: 9, difficulty: 55, kdBand: "kd31_70", traffic: 240, pageRank: 126 });
    const metrics = await t.run(async (ctx) => await ctx.db.query("seoWebsiteMetrics").collect());
    expect(JSON.parse(metrics[0].metricsJson)).toMatchObject({ bandTop3: 1, keywordsNew: 1, trafficValue: 99 });
    // Nothing was asked of a model.
    expect(await t.run(async (ctx) => await ctx.db.query("decisionRuns").collect())).toEqual([]);
  });
});
