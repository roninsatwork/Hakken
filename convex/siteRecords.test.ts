import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { answerPlace } from "./seoAiEngines";

/**
 * A record's own screen on the client's Sites pages (docs/plans/active/
 * sites-ux-updates-plan.md §3): everything kept about one keyword, one page,
 * one linking website, one anchor or one answer — read by its key, only
 * through the caller's own hold, and only against websites beside it.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY = "2026-09-24";

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

async function hold(t: Harness, companyId: Id<"companies">, host: string, against?: Id<"websites">) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    const websiteId = existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: against ? "TRACKED" : "OWNED", createdAt: Date.now(),
      ...(against ? { againstWebsiteId: against } : { locationCode: UK }),
    });
    return { websiteId, holdId };
  });
}

async function pull(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "backlinks_list", family: "Backlinks", mode: "LIVE", websiteId, target: "kordatackle.com", taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
  } as never));
}

async function rank(t: Harness, websiteId: Id<"websites">, keyword: string, fields: Record<string, unknown> = {}) {
  await t.run(async (ctx) => await ctx.db.insert("siteKeywordRanks", {
    websiteId, locationCode: UK, keyword, band: "p01_03", page: "/rods", url: "https://kordatackle.com/rods",
    volume: 480, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0, day: DAY, firstSeenDay: DAY,
    searchText: keyword, updatedAt: Date.now(), ...fields,
  } as never));
}

describe("a keyword's own screen", () => {
  test("gives everything kept about the search, its features, and each competitor's standing", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const rival = await hold(t, korda, "nashtackle.co.uk", own.websiteId);
    await rank(t, own.websiteId, "carp rods", { position: 3, cpc: 0.8, difficulty: 42, competitionLevel: "HIGH", searchIntent: "commercial", trend: [100, 200] });
    await rank(t, rival.websiteId, "carp rods", { position: 1, page: "/carp-rods" });
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => await ctx.db.insert("siteKeywordFeatures", {
      websiteId: own.websiteId, locationCode: UK, keyword: "carp rods", feature: "ai_overview_reference", position: 2, page: "/rods", day: DAY, pullId, updatedAt: Date.now(),
    }));

    const asKorda = await member(t, korda);
    // Typed any way, the search is the one row.
    const record = await asKorda.query(api.siteRecords.keywordRecord, { siteId: own.holdId, keyword: "  Carp   Rods " });
    expect(record.keyword).toBe("carp rods");
    expect(record.rank).toMatchObject({ position: 3, cpc: 0.8, difficulty: 42, competitionLevel: "HIGH", searchIntent: "commercial", trend: [100, 200] });
    expect(record.features).toEqual([{ feature: "ai_overview_reference", position: 2, page: "/rods", day: DAY }]);
    expect(record.rivals).toEqual([{ siteId: rival.holdId, host: "nashtackle.co.uk", relationship: "TRACKED", position: 1, page: "/carp-rods", day: DAY }]);
    expect(record.tracked).toBeNull();
  });

  test("is only ever read through the caller's own hold", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const other = await company(t, "Other");
    const own = await hold(t, korda, "kordatackle.com");
    await rank(t, own.websiteId, "carp rods");
    const asOther = await member(t, other);
    await expect(asOther.query(api.siteRecords.keywordRecord, { siteId: own.holdId, keyword: "carp rods" })).rejects.toThrow(/not one your company holds/);
  });
});

describe("a page's own screen", () => {
  test("gives how it ranks, what the crawl found on it, and the strongest links to it", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("sitePageRanks", {
        websiteId: own.websiteId, locationCode: UK, page: "/rods", url: "https://kordatackle.com/rods", section: "/", keywords: 12,
        bestPosition: 1, top3: 4, volumeSum: 900, topKeyword: "carp rods", topKeywordVolume: 480, firstSeenDay: DAY, day: DAY,
        searchText: "/rods", traffic: 240, rebuildId: "r1", updatedAt: Date.now(),
      });
      await ctx.db.insert("siteCrawlPages", {
        websiteId: own.websiteId, pullId, day: DAY, url: "https://kordatackle.com/rods", page: "/rods", statusCode: 200, problems: ["no_description"], words: 310,
      });
      for (const [domain, rankValue] of [["weak.com", 10], ["strong.com", 500]] as const) {
        await ctx.db.insert("siteBacklinks", {
          websiteId: own.websiteId, pass: "ALL", pullId, day: DAY, domainFrom: domain, urlFrom: `https://${domain}/post`, urlTo: "https://kordatackle.com/rods",
          pageTo: "/rods", dofollow: true, status: "LIVE", isBroken: false, domainRank: rankValue, searchText: domain,
        });
      }
    });

    const asKorda = await member(t, korda);
    const record = await asKorda.query(api.siteRecords.pageRecord, { siteId: own.holdId, page: "/rods" });
    expect(record.rank).toMatchObject({ keywords: 12, bestPosition: 1, topKeyword: "carp rods", traffic: 240, pageType: "UNJUDGED" });
    expect(record.crawl).toMatchObject({ statusCode: 200, problems: ["no_description"], words: 310 });
    expect(record.links.map((link) => link.domainFrom)).toEqual(["strong.com", "weak.com"]);
    expect(record.cited).toEqual({ times: 0, questions: [] });
  });
});

describe("a competitor's own screen", () => {
  test("lists the searches both rank for, and who is ahead on each", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const rival = await hold(t, korda, "nashtackle.co.uk", own.websiteId);
    await rank(t, own.websiteId, "carp rods", { position: 3 });
    await rank(t, own.websiteId, "bait boats", { position: 2 });
    await rank(t, rival.websiteId, "carp rods", { position: 1, traffic: 50 });
    await rank(t, rival.websiteId, "bait boats", { position: 8, traffic: 40 });
    await rank(t, rival.websiteId, "bivvies", { position: 4, traffic: 30 });

    const asKorda = await member(t, korda);
    const first = { numItems: 15, cursor: null };
    const shared = async (lead?: "THEM" | "YOU") =>
      (await asKorda.query(api.siteRecords.sharedSearches, { siteId: own.holdId, rivalId: rival.holdId, paginationOpts: first, ...(lead ? { lead } : {}) }))
        .page.map((row) => [row.keyword, row.theirPosition, row.yourPosition]);
    expect(await shared()).toEqual([["carp rods", 1, 3], ["bait boats", 8, 2]]);
    expect(await shared("THEM")).toEqual([["carp rods", 1, 3]]);
    expect(await shared("YOU")).toEqual([["bait boats", 8, 2]]);
  });

  test("refuses a website that is not beside this one", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const other = await company(t, "Other");
    const own = await hold(t, korda, "kordatackle.com");
    const theirs = await hold(t, other, "elsewhere.com");
    const asKorda = await member(t, korda);
    await expect(asKorda.query(api.siteRecords.sharedSearches, {
      siteId: own.holdId, rivalId: theirs.holdId, paginationOpts: { numItems: 15, cursor: null },
    })).rejects.toThrow(/not one beside this one/);
  });
});

describe("a linking website's and an anchor's own screens", () => {
  test("give each link in full, from every link kept, and an image link as the empty anchor", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("siteReferringDomains", {
        websiteId: own.websiteId, pullId, day: DAY, domain: "anglers.net", rank: 320, backlinks: 2, status: "LIVE", spamScore: 4, referringPages: 2,
      });
      const base = {
        websiteId: own.websiteId, pass: "ALL" as const, pullId, day: DAY, domainFrom: "anglers.net", urlTo: "https://kordatackle.com/",
        pageTo: "/", dofollow: true, status: "LIVE" as const, isBroken: false, domainRank: 320, searchText: "anglers.net",
      };
      await ctx.db.insert("siteBacklinks", { ...base, urlFrom: "https://anglers.net/a", anchor: "korda", attributes: ["ugc"], location: "article" });
      await ctx.db.insert("siteBacklinks", { ...base, urlFrom: "https://anglers.net/b" });
    });

    const asKorda = await member(t, korda);
    const website = await asKorda.query(api.siteLinkRecords.linkingWebsiteRecord, { siteId: own.holdId, domain: "Anglers.net" });
    expect(website.website).toMatchObject({ rank: 320, backlinks: 2, spamScore: 4 });
    expect(website.links.map((link) => [link.urlFrom, link.anchor, link.attributes, link.location])).toEqual(expect.arrayContaining([
      ["https://anglers.net/a", "korda", ["ugc"], "article"],
      ["https://anglers.net/b", null, [], null],
    ]));

    const words = await asKorda.query(api.siteLinkRecords.anchorRecord, { siteId: own.holdId, anchor: "korda" });
    expect(words.links.map((link) => link.urlFrom)).toEqual(["https://anglers.net/a"]);
    const image = await asKorda.query(api.siteLinkRecords.anchorRecord, { siteId: own.holdId, anchor: "" });
    expect(image.links.map((link) => link.urlFrom)).toEqual(["https://anglers.net/b"]);
  });
});

describe("an answer's own screen", () => {
  test("opens only an answer to a question on the site's own list", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const pullId = await pull(t, own.websiteId);
    const place = answerPlace("chatgpt", UK);
    const [ours, notOurs] = await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", { websiteId: own.websiteId, prompt: "best carp rods", engines: ["chatgpt"], isActive: true, createdAt: Date.now() });
      await ctx.db.insert("aiAnswers", {
        prompt: "best carp rods", engine: "chatgpt", locationCode: place, day: DAY, pullId,
        named: [own.websiteId], recommended: [own.websiteId], warnedAgainst: [], createdAt: Date.now(),
      } as never);
      const text = { engine: "chatgpt" as const, locationCode: place, day: DAY, pullId, createdAt: Date.now() };
      return [
        await ctx.db.insert("aiAnswerTexts", { ...text, prompt: "best carp rods", text: "Korda makes good rods.", sources: ["https://kordatackle.com/rods", "https://elsewhere.com/"] }),
        await ctx.db.insert("aiAnswerTexts", { ...text, prompt: "somebody else's question", text: "Not yours.", sources: [] }),
      ];
    });

    const asKorda = await member(t, korda);
    const answer = await asKorda.query(api.siteAnswers.answerRecord, { siteId: own.holdId, answerId: ours });
    expect(answer).toMatchObject({ prompt: "best carp rods", stance: "RECOMMENDED", text: "Korda makes good rods." });
    expect(answer?.sources).toEqual([{ url: "https://kordatackle.com/rods", page: "/rods" }, { url: "https://elsewhere.com/", page: null }]);
    expect(await asKorda.query(api.siteAnswers.answerRecord, { siteId: own.holdId, answerId: notOurs })).toBeNull();
  });
});
