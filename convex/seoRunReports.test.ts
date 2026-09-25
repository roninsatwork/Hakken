import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { attentionOf, cadenceOf, collectsEveryRun, estimateMonthly, repeatDays, spendCategoryOf, stoppedOf } from "./seoRunReports";

/**
 * The Collection runs screens (Anthony, 2026-09-24): what each run for a
 * company cost and where the money went, worked out from its requests, the
 * Collector's own log and the AI judgements its answers led to — and never
 * another company's or another run's.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const NOW = Date.parse("2026-09-24T17:00:00Z");
const MINUTE = 60_000;
const WEEKLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "weekly", dayOfWeek: 1, timeLocal: "09:00", timezone: "UTC" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@test.com", role: "SUPER_ADMIN" as const, createdAt: NOW });
    const korda = await ctx.db.insert("companies", { name: "Korda", createdAt: NOW });
    const other = await ctx.db.insert("companies", { name: "Other", createdAt: NOW });
    const own = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: NOW });
    const rival = await ctx.db.insert("websites", { host: "nashtackle.co.uk", displayHost: "nashtackle.co.uk", firstSeenAt: NOW });
    const unrelated = await ctx.db.insert("websites", { host: "elsewhere.com", displayHost: "elsewhere.com", firstSeenAt: NOW });
    const ownHold = await ctx.db.insert("companyWebsites", { companyId: korda, websiteId: own, relationship: "OWNED", createdAt: NOW });
    await ctx.db.insert("companyWebsites", { companyId: korda, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: NOW });
    await ctx.db.insert("companyDataLimits", { companyId: korda, keywordsPerSite: 1_000, backlinksPerSite: 100, updatedAt: NOW });
    await ctx.db.insert("websiteDataLimits", { companyWebsiteId: ownHold, companyId: korda, keywordsPerSite: 10_000, updatedAt: NOW });
    // The company's setting: weekly, Mondays at 09:00. It wakes nothing; the
    // two agents' own schedules decide when its work is sent.
    await ctx.db.insert("schedules", {
      name: "SEO data — Korda", companyId: korda, intervalStr: WEEKLY, isActive: true, createdAt: NOW,
    } as never);
    const planner = await ctx.db.insert("agents", {
      name: "Data for SEO Queue Planner", modelId: "none", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_PLANNER",
      plannerMode: "LIVE", createdAt: NOW, updatedAt: NOW,
    } as never);
    const collector = await ctx.db.insert("agents", {
      name: "DataForSEO Agent Collector", modelId: "none", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR",
      createdAt: NOW, updatedAt: NOW,
    });
    const daily = (time: string) => JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: time, timezone: "UTC" });
    await ctx.db.insert("schedules", {
      name: "Planner", agentId: planner, intervalStr: daily("10:00"), isActive: true, nextRunAt: Date.parse("2026-09-25T10:00:00Z"), createdAt: NOW,
    });
    await ctx.db.insert("schedules", {
      name: "Collector", agentId: collector, intervalStr: daily("10:30"), isActive: true, nextRunAt: Date.parse("2026-09-25T10:30:00Z"), createdAt: NOW,
    });
    const cycle = (startedAt: number, status: "COLLECTING" | "DONE") => ctx.db.insert("seoCollectionCycles", {
      companyId: korda, trigger: "MANUAL", status, plannedCount: 6, reusedCount: 3, sentCount: 6, readyCount: 5, failedCount: 0,
      totalCostUsd: 0, startedAt,
    });
    const earlier = await cycle(NOW - 7 * 24 * 60 * MINUTE, "DONE");
    const run = await cycle(NOW - 60 * MINUTE, "COLLECTING");
    const collectorRun = (startedAt: number, finalOutput: string) => ctx.db.insert("agentRuns", {
      agentId: collector, triggerType: "MANUAL", objective: "collect", status: "SUCCESS", startedAt, updatedAt: startedAt, finalOutput,
    } as never);
    const first = await collectorRun(NOW - 55 * MINUTE, "Sent 3 requests and spent $1.10. Stopped because the spend limit was reached; the rest waits for the next run.");
    const second = await collectorRun(NOW - 50 * MINUTE, "Sent 3 requests and spent $0.21. Stopped because the queue is empty.");
    return { adminId, korda, other, own, rival, unrelated, earlier, run, collector, first, second };
  });
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function pull(t: Harness, s: Seeded, fields: {
  operationId: string;
  websiteId?: Id<"websites">;
  target?: string;
  status: "PENDING" | "SUBMITTED" | "READY" | "FAILED";
  costUsd: number;
  sentAt?: number;
}) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    family: "DataForSEO", mode: "LIVE", companyId: s.korda, cycleId: s.run, taskArgsJson: "{}",
    tag: `t-${Math.random()}`, attempts: 1, sandbox: false, submittedAt: NOW - 59 * MINUTE,
    ...(fields.status === "READY" ? { completedAt: (fields.sentAt ?? NOW) + MINUTE } : {}),
    ...fields,
  } as never));
}

/** One DataForSEO call on a Collector run's own log, as `recordCollectorCall` writes it. */
async function call(t: Harness, s: Seeded, runId: Id<"agentRuns">, costUsd: number, at: number, companyId = s.korda) {
  await t.run(async (ctx) => {
    const stepIndex = (await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runId)).collect()).length;
    await ctx.db.insert("agentRunSteps", {
      runId, agentId: s.collector, companyId, stepIndex, kind: "TOOL_CALL", status: "SUCCESS", costUsd, providerKey: "dataforseo",
      startedAt: at,
    } as never);
  });
}

async function judgement(t: Harness, fields: {
  decisionKey: string; companyId?: Id<"companies">; subjectKind: string; subjectId: string; costUsd: number; createdAt: number;
}) {
  await t.run(async (ctx) => {
    await ctx.db.insert("decisionRuns", {
      answer: "{}", mode: "ACT", outcome: "ACTED", source: "TYPESAFE", ...fields,
    } as never);
  });
}

describe("a collection run's report", () => {
  test("adds up what the run bought — by kind, by website, by Collector run — and the AI its answers led to", async () => {
    const t = harness();
    const s = await seed(t);
    const at = (minutesAgo: number) => NOW - minutesAgo * MINUTE;

    await pull(t, s, { operationId: "site_crawl", websiteId: s.own, target: "kordatackle.com", status: "READY", costUsd: 0.15, sentAt: at(55) });
    const listPage = await pull(t, s, { operationId: "domain_ranked_keywords_list", websiteId: s.own, target: "kordatackle.com", status: "READY", costUsd: 0.132, sentAt: at(55) });
    const listPageTwo = await pull(t, s, { operationId: "domain_ranked_keywords_list", websiteId: s.own, target: "kordatackle.com", status: "READY", costUsd: 0.1, sentAt: at(50) });
    await pull(t, s, { operationId: "backlinks_list", websiteId: s.rival, target: "nashtackle.co.uk", status: "READY", costUsd: 0.04, sentAt: at(50) });
    await pull(t, s, { operationId: "site_crawl", websiteId: s.rival, target: "nashtackle.co.uk", status: "SUBMITTED", costUsd: 0.15, sentAt: at(50) });
    await pull(t, s, { operationId: "bulk_ranks", status: "READY", costUsd: 0.02, sentAt: at(50) });

    // Each page of a keyword list records how far through the list it got.
    await t.run(async (ctx) => {
      for (const [pullId, returned, offset] of [[listPage, 1_000, 0], [listPageTwo, 1_850, 1_000]] as const) {
        await ctx.db.insert("seoWebsiteMetrics", {
          websiteId: s.own, day: "2026-09-24", operationId: "domain_ranked_keywords_list", pullId,
          metricsJson: JSON.stringify({ returnedKeywords: returned, listOffset: offset }), createdAt: NOW,
        });
      }
    });
    // The Collector's log: three calls on its first run, three on its second, and one for another company.
    for (const [runId, cost, minutes] of [[s.first, 0.15, 55], [s.first, 0.132, 55], [s.first, 0.1, 54], [s.second, 0.04, 50], [s.second, 0.15, 50], [s.second, 0.02, 49]] as const) {
      await call(t, s, runId, cost, at(minutes));
    }
    await call(t, s, s.second, 9, at(49), s.other);
    // The AI its answers led to — and some that is none of its business.
    for (let n = 0; n < 3; n += 1) {
      await judgement(t, { decisionKey: "seo.keyword-intent", companyId: s.korda, subjectKind: "seo-keywords", subjectId: listPage, costUsd: 0.0001, createdAt: at(40) });
    }
    await judgement(t, { decisionKey: "seo.page-type", subjectKind: "seo-pages", subjectId: s.own, costUsd: 0.00003, createdAt: at(30) });
    await judgement(t, { decisionKey: "seo.page-type", subjectKind: "seo-pages", subjectId: s.unrelated, costUsd: 5, createdAt: at(30) });
    await judgement(t, { decisionKey: "seo.keyword-intent", companyId: s.other, subjectKind: "seo-keywords", subjectId: listPage, costUsd: 5, createdAt: at(40) });
    await judgement(t, { decisionKey: "seo.real-competitor", companyId: s.korda, subjectKind: "seo-competitors", subjectId: "not-a-pull-of-this-run", costUsd: 5, createdAt: at(40) });

    await t.action(internal.seoRunReports.buildRunReport, { cycleId: s.run });
    const report = await t.run(async (ctx) => await ctx.db.query("seoRunReports").withIndex("by_cycle", (q) => q.eq("cycleId", s.run)).unique());

    expect(report).toMatchObject({ requests: 6, filed: 5, answering: 1, waiting: 0, failed: 0, final: false });
    expect(report!.costUsd).toBeCloseTo(0.592, 6);
    expect(report!.byOperation.map((row) => [row.operationId, row.requests])).toEqual([
      ["site_crawl", 2], ["domain_ranked_keywords_list", 2], ["backlinks_list", 1], ["bulk_ranks", 1],
    ]);
    expect(report!.byOperation.find((row) => row.operationId === "site_crawl")?.answering).toBe(1);
    // kordatackle.com: two list pages brought back 1,000 and 850 keywords for $0.232.
    const own = report!.bySite.find((row) => row.websiteId === s.own)!;
    expect(own).toMatchObject({ host: "kordatackle.com", requests: 3, keywords: 1_850 });
    expect(own.keywordListCostUsd).toBeCloseTo(0.232, 6);
    // What was asked about several websites at once has none of its own.
    expect(report!.bySite.find((row) => !row.websiteId)).toMatchObject({ host: "", requests: 1 });
    expect(report!.byCollectorRun.map((row) => [row.requests, Math.round(row.costUsd * 1000), row.stopped])).toEqual([
      [3, 382, "SPEND_LIMIT"],
      [3, 210, "QUEUE_EMPTY"],
    ]);
    expect(report!.ai.map((row) => [row.decisionKey, row.judgements])).toEqual([
      ["seo.keyword-intent", 3],
      ["seo.page-type", 1],
    ]);
    expect(report!.aiCostUsd).toBeCloseTo(0.00033, 8);
  });

  test("a page's type judged while two runs hold its website is counted once, in the run whose request led to it", async () => {
    const t = harness();
    const s = await seed(t);
    const at = (minutesAgo: number) => NOW - minutesAgo * MINUTE;
    // Another company watching Korda's own website, its run asking about it at 44 minutes ago.
    const otherRun = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId: s.other, trigger: "MANUAL", status: "COLLECTING", plannedCount: 1, reusedCount: 0, sentCount: 1,
      readyCount: 1, failedCount: 0, totalCostUsd: 0, startedAt: at(45),
    }));
    await pull(t, s, { operationId: "site_crawl", websiteId: s.own, target: "kordatackle.com", status: "READY", costUsd: 0.15, sentAt: at(55) });
    await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "DataForSEO", mode: "LIVE", companyId: s.other, cycleId: otherRun, taskArgsJson: "{}",
      tag: "t-other", attempts: 1, sandbox: false, submittedAt: at(44), websiteId: s.own, target: "kordatackle.com",
      status: "READY", costUsd: 0.15, sentAt: at(44), completedAt: at(43),
    }));
    // Before the other run asked: Korda's. After it: the other run's.
    await judgement(t, { decisionKey: "seo.page-type", subjectKind: "seo-pages", subjectId: s.own, costUsd: 0.001, createdAt: at(50) });
    await judgement(t, { decisionKey: "seo.page-type", subjectKind: "seo-pages", subjectId: s.own, costUsd: 0.002, createdAt: at(30) });

    await t.action(internal.seoRunReports.buildRunReport, { cycleId: s.run });
    await t.action(internal.seoRunReports.buildRunReport, { cycleId: otherRun });
    const reportOf = (cycleId: Id<"seoCollectionCycles">) =>
      t.run(async (ctx) => await ctx.db.query("seoRunReports").withIndex("by_cycle", (q) => q.eq("cycleId", cycleId)).unique());

    expect((await reportOf(s.run))!.aiCostUsd).toBeCloseTo(0.001, 8);
    expect((await reportOf(otherRun))!.aiCostUsd).toBeCloseTo(0.002, 8);
  });

  test("the list, the figures above it and the run in full — each against the run before", async () => {
    const t = harness();
    const s = await seed(t);
    const admin = t.withIdentity({ subject: s.adminId });
    const report = (cycleId: Id<"seoCollectionCycles">, costUsd: number, aiCostUsd: number, byOperation: Array<[string, number]>) =>
      t.run(async (ctx) => {
        await ctx.db.insert("seoRunReports", {
          cycleId, companyId: s.korda, builtAt: NOW, final: true, requests: byOperation.length, costUsd, waiting: 0, answering: 0,
          filed: byOperation.length, failed: 0, aiJudgements: 1, aiCostUsd,
          byOperation: byOperation.map(([operationId, cost]) => ({ operationId, requests: 1, costUsd: cost, answering: 0 })),
          bySite: [{ websiteId: s.own, host: "kordatackle.com", requests: byOperation.length, costUsd, keywordListCostUsd: 0, keywords: 0 }],
          byCollectorRun: [], ai: [{ decisionKey: "seo.keyword-intent", judgements: 1, costUsd: aiCostUsd }],
        });
      });
    await report(s.earlier, 1.9, 0.1, [["site_crawl", 1.8], ["backlinks_list", 0.1]]);
    await report(s.run, 7.85, 0.33, [["site_crawl", 1.8], ["domain_ranked_keywords_list", 1.77], ["backlinks_list", 4.28]]);

    const runs = await admin.query(api.seoRunReports.listCompanyRuns, { companyId: s.korda, paginationOpts: { numItems: 15, cursor: null } });
    expect(runs.page.map((row) => [row.cycleId, row.totalUsd, row.previousTotalUsd])).toEqual([
      [s.run, 8.18, 2],
      [s.earlier, 2, null],
    ]);
    // Only the last three months.
    const recent = await admin.query(api.seoRunReports.listCompanyRuns, { companyId: s.korda, withinDays: 3, paginationOpts: { numItems: 15, cursor: null } });
    expect(recent.page.map((row) => row.cycleId)).toEqual([s.run]);
    expect(recent.page[0].previousTotalUsd).toBe(2);

    const summary = await admin.query(api.seoRunReports.getCompanyRunSummary, { companyId: s.korda });
    expect(summary.monthUsd).toBeCloseTo(10.18, 6);
    expect(summary.monthRuns).toBe(2);
    expect(summary.lastRun).toMatchObject({ cycleId: s.run, totalUsd: 8.18 });
    // Collected an hour ago, so next due Monday 09:00; the Planner's next run
    // after that is 10:00, and the Collector sends it at 10:30.
    expect(summary.nextRun).toEqual({ at: Date.parse("2026-09-28T10:30:00Z"), cadence: "weekly" });
    expect(summary.estimate?.perMonthUsd).toBeCloseTo(estimateMonthly([
      { operationId: "site_crawl", costUsd: 1.8 },
      { operationId: "domain_ranked_keywords_list", costUsd: 1.77 },
      { operationId: "backlinks_list", costUsd: 4.28 },
    ], "weekly").perMonthUsd, 6);

    const full = await admin.query(api.seoRunReports.getRunReport, { cycleId: s.run });
    expect(full).toMatchObject({ companyName: "Korda", reused: 3, cadence: "weekly" });
    expect(full?.previous).toMatchObject({ totalUsd: 2 });
    expect(full?.previous?.byOperation).toEqual([{ operationId: "site_crawl", costUsd: 1.8 }, { operationId: "backlinks_list", costUsd: 0.1 }]);
    expect(full?.sites).toEqual([{ websiteId: s.own, relationship: "OWNED", keywordsPerSite: 10_000, backlinksPerSite: 100 }]);
    // Korda collects weekly: the monthly crawl comes every fourth run.
    expect(full?.operations.find((row) => row.operationId === "site_crawl")).toEqual({ operationId: "site_crawl", category: "SITE_AUDIT", everyDays: 28 });
    expect(full?.decisions).toEqual([{ decisionKey: "seo.keyword-intent", copyKey: "seoKeywordIntent" }]);

    // Another company's admin view is the super admin's alone.
    const member = await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Member", email: "m@test.com", role: "ADMIN" as const, companyId: s.korda, createdAt: NOW,
    }));
    await expect(t.withIdentity({ subject: member }).query(api.seoRunReports.getRunReport, { cycleId: s.run })).rejects.toThrow();
  });

  test("a request sent or answered asks for its run's report, once for a burst, and again later once the run closes", async () => {
    const t = harness();
    const s = await seed(t);
    const pulls = [];
    for (let n = 0; n < 2; n += 1) {
      pulls.push(await pull(t, s, { operationId: "backlinks_list", websiteId: s.own, target: "kordatackle.com", status: "PENDING", costUsd: 0 }));
    }
    for (const pullId of pulls) {
      await t.mutation(internal.seoCollectionQueue.settleSeoSend, { pullId, costUsd: 0.04, sandbox: false, ready: true });
    }
    const waits = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.includes("buildRunReport"))
      .map((job) => Math.round((job.scheduledTime - NOW) / MINUTE))
      .sort((left, right) => left - right));
    // One a minute after the burst; then, the run closed, a quarter of an hour and two hours on.
    expect(waits).toEqual([1, 15, 120]);
  });
});

describe("the arithmetic", () => {
  test("a month from now: each kind as often as it is bought, never more often than the company collects", () => {
    const weekly = estimateMonthly([
      { operationId: "site_crawl", costUsd: 1.8 },
      { operationId: "domain_ranked_keywords_list", costUsd: 1.77 },
      { operationId: "backlinks_summary", costUsd: 0.29 },
    ], "weekly");
    expect(weekly.lines.map((line) => line.every)).toEqual(["WEEK", "MONTH"]);
    expect(weekly.lines[0].costUsd).toBeCloseTo(2.06, 6);
    // The crawl every fourth weekly run: every 28 days.
    expect(weekly.perMonthUsd).toBeCloseTo((2.06 * 30.44) / 7 + (1.8 * 30.44) / 28, 6);
    // Collected monthly, a weekly list is bought monthly too.
    expect(estimateMonthly([{ operationId: "domain_ranked_keywords_list", costUsd: 1 }], "monthly").lines).toEqual([
      { every: "MONTH", costUsd: 1, perMonthUsd: 1 },
    ]);
  });

  test("a call with its own cadence comes round on the run nearest it, and every run when the company collects no more often", () => {
    // Daily: weekly every 7th run, monthly every 30th.
    expect(repeatDays(7, 1)).toBe(7);
    expect(repeatDays(30, 1)).toBe(30);
    // Weekly: weekly every run, monthly every 4th.
    expect(repeatDays(7, 7)).toBeNull();
    expect(repeatDays(30, 7)).toBe(28);
    // Fortnightly: weekly every run, monthly every other.
    expect(repeatDays(7, 14)).toBeNull();
    expect(repeatDays(30, 14)).toBe(28);
    // Monthly: everything every run — the full scan, however soon after another run.
    expect(repeatDays(7, 30.44)).toBeNull();
    expect(repeatDays(30, 30.44)).toBeNull();
    expect(collectsEveryRun(30, 30.44)).toBe(true);
    expect(collectsEveryRun(30, 14)).toBe(false);
  });

  test("names for what was bought, how often the company collects, and why a Collector run stopped", () => {
    expect(spendCategoryOf("backlinks_all")).toBe("BACKLINKS");
    expect(spendCategoryOf("anchors_list")).toBe("BACKLINKS");
    expect(spendCategoryOf("backlinks_summary")).toBe("SUMMARIES");
    expect(spendCategoryOf("bulk_ranks")).toBe("COMPARISONS");
    expect(spendCategoryOf("ai_citation_chatgpt")).toBe("AI_ANSWERS");
    expect(cadenceOf(WEEKLY)).toBe("weekly");
    expect(cadenceOf("daily")).toBe("daily");
    expect(cadenceOf(undefined)).toBe("weekly");
    expect(stoppedOf("Stopped because this run's time was up; the rest waits.")).toBe("TIME_UP");
    expect(stoppedOf(undefined)).toBeUndefined();
  });
});

/**
 * What needs a look in a run (reliability plan V1–V3): its requests that
 * failed, were answered and not filed, were too large to keep or cut to fit;
 * those out over an hour unanswered, read as the page is; and how the hourly
 * check last went.
 */
describe("what needs a look", () => {
  test("a run's failed, unfiled, too large and cut requests — worst first — and nothing for the rest", () => {
    const row = (fields: Record<string, unknown>) => ({
      pullId: `pull_${Math.random()}` as Id<"seoDataPulls">, operationId: "site_crawl", status: "READY" as const, costUsd: 0.1, ...fields,
    });
    const { attention, total } = attentionOf([
      row({ target: "fine.co.uk" }),
      row({ target: "cut.co.uk", rowsLeftOff: 60, completedAt: 3 }),
      row({ target: "unfiled.co.uk", error: "Parse failed: Too many bytes read", completedAt: 2 }),
      row({ status: "FAILED", asked: "carp bait", error: "Invalid Field: 'keyword'.", completedAt: 1 }),
      row({ target: "huge.co.uk", rawTruncated: true, completedAt: 4 }),
      row({ status: "SUBMITTED", target: "waiting.co.uk" }),
    ]);

    expect(total).toBe(4);
    expect(attention.map((entry) => [entry.kind, entry.about, entry.detail ?? entry.rows ?? null])).toEqual([
      ["FAILED", "carp bait", "Invalid Field: 'keyword'."],
      ["NOT_FILED", "unfiled.co.uk", "Too many bytes read"],
      ["TOO_LARGE", "huge.co.uk", null],
      ["ROWS_LEFT_OFF", "cut.co.uk", 60],
    ]);
  });

  test("a run's report keeps them, and the run page reads those out over an hour live", async () => {
    const t = harness();
    const s = await seed(t);
    const admin = t.withIdentity({ subject: s.adminId });
    await pull(t, s, { operationId: "site_crawl", websiteId: s.own, target: "kordatackle.com", status: "FAILED", costUsd: 0, sentAt: NOW - 50 * MINUTE });
    await t.run(async (ctx) => {
      // Sent two hours ago, the last try saying DataForSEO is still at it; and one sent ten minutes ago.
      for (const [minutesAgo, tag] of [[120, "long"], [10, "recent"]] as const) {
        await ctx.db.insert("seoDataPulls", {
          operationId: "serp_google_organic", family: "SERP", mode: "QUEUED", companyId: s.korda, cycleId: s.run,
          taskArgsJson: JSON.stringify({ keyword: `carp bait ${tag}` }), status: "SUBMITTED", tag, attempts: 1, costUsd: 0.002,
          sandbox: false, submittedAt: NOW - minutesAgo * MINUTE, sentAt: NOW - minutesAgo * MINUTE,
          ...(tag === "long" ? { lastFetch: { at: NOW - 5 * MINUTE, said: "DataForSEO is still working on it." } } : {}),
        });
      }
    });

    await t.action(internal.seoRunReports.buildRunReport, { cycleId: s.run });
    const page = await admin.query(api.seoRunReports.getRunReport, { cycleId: s.run });

    expect(page?.report?.attention?.map((entry) => entry.kind)).toEqual(["FAILED"]);
    expect(page?.report?.attentionTotal).toBe(1);
    expect(page?.waitingLong.total).toBe(1);
    expect(page?.waitingLong.rows[0]).toMatchObject({
      operationId: "serp_google_organic", about: "carp bait long", lastFetch: { said: "DataForSEO is still working on it." },
    });
  });

  test("the hourly check's last result, overdue when it has not run for three hours", async () => {
    const t = harness();
    const s = await seed(t);
    const admin = t.withIdentity({ subject: s.adminId });
    expect(await admin.query(api.seoRunReports.readHourlyCheck, {})).toBeNull();

    await t.run(async (ctx) => await ctx.db.insert("jobRuns", {
      job: "seo-collection-sweep", lastRanAt: NOW - 4 * 60 * MINUTE, lastOk: false, lastDurationMs: 900,
      lastError: "Too many bytes read in a single function execution", consecutiveFailures: 3,
    }));

    expect(await admin.query(api.seoRunReports.readHourlyCheck, {})).toMatchObject({
      ok: false, error: "Too many bytes read in a single function execution", failuresInARow: 3, overdue: true,
    });
  });
});
