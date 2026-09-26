import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Each company's searches and questions are its own
 * (docs/plans/active/private-tracking-lists-plan.md, §4.8).
 *
 * Two companies own one website and track different things for it; a third
 * watches it as a competitor of its own site. Every screen a client opens is
 * asked here, as each company: each sees exactly its own searches, questions,
 * counts and chart lines, and nothing of the others' — not by the list, not by
 * a number, and not by asking for the other's search or question by name.
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

async function hold(t: Harness, companyId: Id<"companies">, host: string, relationship: "OWNED" | "TRACKED", againstWebsiteId?: Id<"websites">) {
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

/** A company's own list: one search and one question. */
async function lists(t: Harness, owner: { websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, keyword: string, prompt: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("websiteKeywords", { websiteId: owner.websiteId, companyWebsiteId: owner.holdId, keyword, isActive: true, createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", {
      websiteId: owner.websiteId, companyWebsiteId: owner.holdId, prompt, engines: ["perplexity"], isActive: true, createdAt: Date.now(),
    });
  });
}

async function pull(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "ai_citation_perplexity", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.01, sandbox: false, submittedAt: Date.now(),
  } as never));
}

describe("a company's searches and questions are its own", () => {
  test("two owners and a competitor each see only their own lists and figures", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const agency = await company(t, "Another agency");
    const nash = await company(t, "Nash");
    const kordaHold = await hold(t, korda, "kordatackle.com", "OWNED");
    const agencyHold = await hold(t, agency, "kordatackle.com", "OWNED");
    const nashOwn = await hold(t, nash, "nashtackle.co.uk", "OWNED");
    const nashWatch = await hold(t, nash, "kordatackle.com", "TRACKED", nashOwn.websiteId);
    const site = kordaHold.websiteId;

    await lists(t, kordaHold, "carp rigs", "best carp fishing tackle brands");
    await lists(t, agencyHold, "bivvies", "best bivvy for carp fishing");
    await lists(t, nashOwn, "fishing shop", "best fishing shop in the uk");

    // Every question answered once, each answer naming kordatackle.com.
    const prompts = ["best carp fishing tackle brands", "best bivvy for carp fishing", "best fishing shop in the uk"];
    const pulls = [await pull(t, site), await pull(t, site), await pull(t, site)];
    await t.run(async (ctx) => {
      for (const [index, prompt] of prompts.entries()) {
        await ctx.db.insert("aiAnswers", {
          prompt, engine: "perplexity", locationCode: UK, day: DAY, pullId: pulls[index],
          named: [site], recommended: [], warnedAgainst: [], createdAt: Date.now(),
        });
      }
      // Each search's stats, as its checks would have filed them.
      for (const keyword of ["carp rigs", "bivvies", "fishing shop"]) {
        await ctx.db.insert("websiteSearchStats", {
          websiteId: site, keyword, locationCode: UK, firstCheckedDay: "2026-09-01", lastCheckedDay: DAY,
          lastPosition: 3, everRanked: true, updatedAt: Date.now(),
        });
      }
    });
    for (const websiteId of [site, nashOwn.websiteId]) {
      await t.mutation(internal.siteSummaries.syncDays, { websiteId, locationCode: UK, fromDay: "2026-09-01", toDay: DAY });
    }

    const asKorda = await member(t, korda);
    const asAgency = await member(t, agency);
    const asNash = await member(t, nash);

    // Each owner: its own search and question, and nothing else.
    for (const [as, siteId, keyword, prompt] of [
      [asKorda, kordaHold.holdId, "carp rigs", "best carp fishing tackle brands"],
      [asAgency, agencyHold.holdId, "bivvies", "best bivvy for carp fishing"],
    ] as const) {
      expect((await as.query(api.siteGoogle.listSearches, { siteId })).map((row) => row.keyword)).toEqual([keyword]);
      expect((await as.query(api.siteAnswers.answerQuestions, { siteId })).questions.map((row) => row.prompt)).toEqual([prompt]);
      expect((await as.query(api.siteAi.listMentions, { siteId })).map((row) => row.prompt)).toEqual([prompt]);
      const header = await as.query(api.sites.getMySite, { siteId });
      expect(header?.counts).toMatchObject({ trackedSearches: 1, questionsSetUp: true, aiNamed: 1, aiAsked: 1 });
      // The chart counts this company's one answer, not three.
      const lines = await as.query(api.siteCharts.siteSeries, { siteId, from: "2026-09-01", to: DAY, step: "day" });
      expect(lines[0].points.flatMap((point) => point.ai)).toEqual([{ engine: "perplexity", asked: 1, named: 1, recommended: 0 }]);
    }

    // Asked for the other company's search or question by name: nothing.
    const siteId = kordaHold.holdId;
    expect(await asKorda.query(api.siteGoogle.searchPositions, { siteId, keywords: ["bivvies"], from: "2026-09-01", to: DAY })).toEqual([]);
    const record = await asKorda.query(api.siteRecords.keywordRecord, { siteId, keyword: "bivvies" });
    expect(record.tracked).toBeNull();
    expect(record.serp).toBeNull();
    await expect(asKorda.query(api.siteAnswers.listAnswers, {
      siteId, page: 1, rows: 25, prompt: "best bivvy for carp fishing", from: "2026-09-01", to: DAY,
    })).rejects.toThrow(/not one this website is measured on/);

    // The competitor is measured on Nash's own site's lists: none of Korda's
    // or the agency's searches or questions, and only Nash's answer naming it.
    const watched = nashWatch.holdId;
    expect(await asNash.query(api.siteGoogle.listSearches, { siteId: watched })).toEqual([
      expect.objectContaining({ keyword: "fishing shop" }),
    ]);
    expect((await asNash.query(api.siteAnswers.answerQuestions, { siteId: watched })).questions.map((row) => row.prompt))
      .toEqual(["best fishing shop in the uk"]);
    const nashRows = await asNash.query(api.sites.listMySites, {});
    expect(nashRows.find((row) => row.host === "kordatackle.com")).toMatchObject({ aiNamed: 1, aiAsked: 1 });
    const nashLines = await asNash.query(api.siteCharts.siteSeries, { siteId: watched, from: "2026-09-01", to: DAY, step: "day" });
    expect(nashLines[0].points.flatMap((point) => point.ai)).toEqual([{ engine: "perplexity", asked: 0, named: 1, recommended: 0 }]);
  });

  test("a company that stops watching a website takes its lists and lines with it", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const agency = await company(t, "Another agency");
    const kordaHold = await hold(t, korda, "kordatackle.com", "OWNED");
    const agencyHold = await hold(t, agency, "kordatackle.com", "OWNED");
    await lists(t, kordaHold, "carp rigs", "best carp fishing tackle brands");
    await lists(t, agencyHold, "bivvies", "best bivvy for carp fishing");

    await t.mutation(internal.websitePurge.purgeHoldListsInternal, { companyWebsiteId: agencyHold.holdId });

    const left = await t.run(async (ctx) => ({
      searches: (await ctx.db.query("websiteKeywords").collect()).map((row) => row.keyword),
      questions: (await ctx.db.query("websiteQuestions").collect()).map((row) => row.prompt),
    }));
    expect(left).toEqual({ searches: ["carp rigs"], questions: ["best carp fishing tackle brands"] });
  });
});
