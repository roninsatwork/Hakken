import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readCompanyDataLimits, resolveSiteDataLimits } from "./companyDataLimits";
import { findSeoOperation } from "./dataForSeoRegistry";
import { getDecision } from "./decisionRegistry";
import { claimSchedule } from "./siteRankings";
import { superAdminQuery } from "./tenantFunctions";
import { runReportFields } from "./utils/siteShapes";

/**
 * What each collection run for a company cost, and where the money went: the
 * Collection runs screens inside a company (Admin → company → Websites →
 * Collection runs). Anthony, 2026-09-24, after Korda's first full run: "it's
 * really good intel and will help me a lot if I can view this kind of report
 * on the screen".
 *
 * **A run** is one collection for one company — "a run is when the agents run
 * for a company": the Planner's queue for it (`seoCollectionCycles`), however
 * many Collector runs it takes to send.
 *
 * **Worked out once, then read.** A run's requests carry their raw answers,
 * and its AI judgements run to thousands, so neither is added up while a
 * screen waits. A minute after any of its requests is sent or answered the
 * report is worked out again in the background (`buildRunReport`) and kept
 * (`seoRunReports`), and the screens read that.
 *
 * **AI belongs to a run through what it judged.** A keyword's meaning, a
 * competitor, an answer's stance and an address point at the request they
 * came from; a page's type points only at its website, so it is counted when
 * judged for one of the run's websites while the run was being filed.
 */

/** How long after a request is sent or answered its run's report is worked out: a burst asks once. */
const REPORT_DELAY_MS = 60_000;

/** Late passes after a run closes, for the AI judgements its last answers lead to. */
const LATE_PASSES_MS = [15 * 60_000, 2 * 60 * 60_000];

/** Requests read at a time: each can carry a raw answer of up to half a megabyte. */
const PULLS_PER_READ = 20;

const JUDGEMENTS_PER_READ = 1_000;
const METRICS_PER_READ = 100;

/** How long after its last send the Collector's log is read for the run's calls. */
const SENDS_AFTER_MS = 5 * 60_000;

/** How long after its last request a judgement still belongs to the run. */
const AI_AFTER_MS = 2 * 60 * 60_000;

/** The subjects that name the request a judgement came from. */
const PULL_SUBJECTS = new Set(["seo-keywords", "seo-competitors", "seo-citation", "seo-address"]);
const PAGE_TYPE_KEY = "seo.page-type";
const PAGE_SUBJECT = "seo-pages";
const KEYWORD_LIST = "domain_ranked_keywords_list";

/** Runs read to add up a month. A company collecting daily has about thirty. */
const MONTH_RUNS_READ = 200;
const HOLDS_READ = 500;
const DAYS_PER_MONTH = 30.44;
const DAY_MS = 86_400_000;

export function runReportKey(cycleId: Id<"seoCollectionCycles">): string {
  return `run:${cycleId}`;
}

/** Ask for a run's report to be worked out again, once, shortly. */
export async function requestRunReport(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">): Promise<void> {
  if (!(await claimSchedule(ctx, runReportKey(cycleId)))) return;
  await ctx.scheduler.runAfter(REPORT_DELAY_MS, internal.seoRunReports.buildRunReport, { cycleId });
}

/** A run has closed: work its report out again later, for the AI its last answers lead to. */
export async function scheduleLateRunReports(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">): Promise<void> {
  for (const wait of LATE_PASSES_MS) {
    await ctx.scheduler.runAfter(wait, internal.seoRunReports.buildRunReport, { cycleId });
  }
}

// ---------------------------------------------------------------------------
// Working a report out
// ---------------------------------------------------------------------------

const pullStatus = v.union(v.literal("PENDING"), v.literal("CLAIMED"), v.literal("SUBMITTED"), v.literal("READY"), v.literal("FAILED"));

const pullForReport = v.object({
  pullId: v.id("seoDataPulls"),
  operationId: v.string(),
  websiteId: v.optional(v.id("websites")),
  target: v.optional(v.string()),
  status: pullStatus,
  costUsd: v.number(),
  sentAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});
type PullForReport = Infer<typeof pullForReport>;

const judgementForReport = v.object({
  decisionKey: v.string(),
  subjectKind: v.string(),
  subjectId: v.string(),
  costUsd: v.number(),
});
type JudgementForReport = Infer<typeof judgementForReport>;

const pullPage = v.object({ rows: v.array(pullForReport), cursor: v.string(), isDone: v.boolean() });
const judgementPage = v.object({ rows: v.array(judgementForReport), cursor: v.string(), isDone: v.boolean() });

export const readRunForReport = internalQuery({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.union(v.null(), v.object({ companyId: v.id("companies"), startedAt: v.number(), done: v.boolean() })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    return cycle ? { companyId: cycle.companyId, startedAt: cycle.startedAt, done: cycle.status === "DONE" } : null;
  },
});

export const pullsForReport = internalQuery({
  args: { cycleId: v.id("seoCollectionCycles"), cursor: v.union(v.string(), v.null()) },
  returns: pullPage,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_cycle", (q) => q.eq("cycleId", args.cycleId))
      .paginate({ cursor: args.cursor, numItems: PULLS_PER_READ });
    return {
      rows: result.page.map((pull) => ({
        pullId: pull._id,
        operationId: pull.operationId,
        ...(pull.websiteId ? { websiteId: pull.websiteId } : {}),
        ...(pull.target ? { target: pull.target } : {}),
        status: pull.status,
        costUsd: pull.costUsd,
        ...(pull.sentAt !== undefined ? { sentAt: pull.sentAt } : {}),
        ...(pull.completedAt !== undefined ? { completedAt: pull.completedAt } : {}),
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** How many keywords each page of a keyword list brought back (`writeListPage` records it). */
export const keywordsOnListPages = internalQuery({
  args: { pullIds: v.array(v.id("seoDataPulls")) },
  returns: v.array(v.object({ pullId: v.id("seoDataPulls"), keywords: v.number() })),
  handler: async (ctx, args) => {
    const counts: Array<{ pullId: Id<"seoDataPulls">; keywords: number }> = [];
    for (const pullId of args.pullIds) {
      const metrics = await ctx.db.query("seoWebsiteMetrics").withIndex("by_pull", (q) => q.eq("pullId", pullId)).first();
      if (!metrics) continue;
      try {
        const read = JSON.parse(metrics.metricsJson) as Record<string, unknown>;
        const returned = typeof read.returnedKeywords === "number" ? read.returnedKeywords : 0;
        const offset = typeof read.listOffset === "number" ? read.listOffset : 0;
        counts.push({ pullId, keywords: Math.max(0, returned - offset) });
      } catch {
        // A figure that cannot be read counts as none, never as a guess.
      }
    }
    return counts;
  },
});

const stepPage = v.object({
  rows: v.array(v.object({ runId: v.id("agentRuns"), costUsd: v.number() })),
  cursor: v.string(),
  isDone: v.boolean(),
});

/**
 * The company's DataForSEO calls in the Collector's own log (`recordCollectorCall`
 * writes one step per call), which is what says which Collector run sent them:
 * a request forgets its claim once it is sent. Two runs of one company sending
 * at the same moment would share these; the Planner opens one at a time.
 */
export const collectorCallsForReport = internalQuery({
  args: { companyId: v.id("companies"), from: v.number(), to: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: stepPage,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId).gte("startedAt", args.from).lte("startedAt", args.to))
      .paginate({ cursor: args.cursor, numItems: JUDGEMENTS_PER_READ });
    return {
      rows: result.page
        .filter((step) => step.kind === "TOOL_CALL" && step.providerKey === "dataforseo")
        .map((step) => ({ runId: step.runId, costUsd: step.costUsd ?? 0 })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** When each Collector run started, and why it stopped. */
export const collectorRunsForReport = internalQuery({
  args: { runIds: v.array(v.string()) },
  returns: v.array(v.object({ runId: v.id("agentRuns"), startedAt: v.number(), finalOutput: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const runs: Array<{ runId: Id<"agentRuns">; startedAt: number; finalOutput?: string }> = [];
    for (const raw of args.runIds) {
      const runId = ctx.db.normalizeId("agentRuns", raw);
      const run = runId ? await ctx.db.get(runId) : null;
      if (run) runs.push({ runId: run._id, startedAt: run.startedAt, ...(run.finalOutput ? { finalOutput: run.finalOutput } : {}) });
    }
    return runs;
  },
});

export const companyJudgementsForReport = internalQuery({
  args: { companyId: v.id("companies"), from: v.number(), to: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: judgementPage,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("decisionRuns")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId).gte("createdAt", args.from).lte("createdAt", args.to))
      .paginate({ cursor: args.cursor, numItems: JUDGEMENTS_PER_READ });
    return { rows: result.page.map(judgementOf), cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** A page's type is judged for a website, not a company, so it is read by its own key. */
export const pageTypeJudgementsForReport = internalQuery({
  args: { from: v.number(), to: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: judgementPage,
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("decisionRuns")
      .withIndex("by_key_created", (q) => q.eq("decisionKey", PAGE_TYPE_KEY).gte("createdAt", args.from).lte("createdAt", args.to))
      .paginate({ cursor: args.cursor, numItems: JUDGEMENTS_PER_READ });
    return { rows: result.page.map(judgementOf), cursor: result.continueCursor, isDone: result.isDone };
  },
});

function judgementOf(row: Doc<"decisionRuns">): JudgementForReport {
  return { decisionKey: row.decisionKey, subjectKind: row.subjectKind, subjectId: row.subjectId, costUsd: row.costUsd };
}

export const writeRunReport = internalMutation({
  args: { report: v.object(runReportFields) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("seoRunReports").withIndex("by_cycle", (q) => q.eq("cycleId", args.report.cycleId)).unique();
    if (existing) await ctx.db.replace(existing._id, args.report);
    else await ctx.db.insert("seoRunReports", args.report);
    return null;
  },
});

type SiteTally = {
  websiteId?: Id<"websites">;
  host: string;
  requests: number;
  costUsd: number;
  keywordListCostUsd: number;
  keywords: number;
};

/** A run's requests added up as they are read. */
export function tallyRequests(rows: readonly PullForReport[]) {
  const byOperation = new Map<string, { operationId: string; requests: number; costUsd: number; answering: number }>();
  const bySite = new Map<string, SiteTally>();
  const siteOfPull = new Map<string, string>();
  const pullIds = new Set<string>();
  const websiteIds = new Set<string>();
  const counts = { requests: 0, costUsd: 0, waiting: 0, answering: 0, filed: 0, failed: 0 };
  let firstSentAt: number | undefined;
  let lastSentAt: number | undefined;
  let lastActivity: number | undefined;

  for (const row of rows) {
    counts.requests += 1;
    counts.costUsd += row.costUsd;
    if (row.status === "PENDING" || row.status === "CLAIMED") counts.waiting += 1;
    else if (row.status === "SUBMITTED") counts.answering += 1;
    else if (row.status === "READY") counts.filed += 1;
    else counts.failed += 1;
    pullIds.add(row.pullId);

    const operation = byOperation.get(row.operationId) ?? { operationId: row.operationId, requests: 0, costUsd: 0, answering: 0 };
    operation.requests += 1;
    operation.costUsd += row.costUsd;
    if (row.status === "SUBMITTED") operation.answering += 1;
    byOperation.set(row.operationId, operation);

    const siteKey = row.websiteId ?? "";
    const site = bySite.get(siteKey) ?? {
      ...(row.websiteId ? { websiteId: row.websiteId } : {}),
      host: row.websiteId ? row.target ?? "" : "",
      requests: 0,
      costUsd: 0,
      keywordListCostUsd: 0,
      keywords: 0,
    };
    site.requests += 1;
    site.costUsd += row.costUsd;
    if (row.operationId === KEYWORD_LIST) site.keywordListCostUsd += row.costUsd;
    bySite.set(siteKey, site);
    siteOfPull.set(row.pullId, siteKey);
    if (row.websiteId) websiteIds.add(row.websiteId);

    if (row.sentAt !== undefined) {
      firstSentAt = firstSentAt === undefined ? row.sentAt : Math.min(firstSentAt, row.sentAt);
      lastSentAt = lastSentAt === undefined ? row.sentAt : Math.max(lastSentAt, row.sentAt);
    }
    const touched = row.completedAt ?? row.sentAt;
    if (touched !== undefined) lastActivity = lastActivity === undefined ? touched : Math.max(lastActivity, touched);
  }

  return {
    counts, byOperation, bySite, siteOfPull, pullIds, websiteIds, firstSentAt, lastSentAt, lastActivity,
    keywordListPulls: rows.filter((row) => row.operationId === KEYWORD_LIST).map((row) => row.pullId),
  };
}

/** Why a Collector run stopped, from the line it ends on (`seoAgentRuns.collect`). */
export function stoppedOf(finalOutput: string | undefined): "SPEND_LIMIT" | "QUEUE_EMPTY" | "TIME_UP" | undefined {
  if (!finalOutput) return undefined;
  if (/spend limit/i.test(finalOutput)) return "SPEND_LIMIT";
  if (/queue is empty/i.test(finalOutput)) return "QUEUE_EMPTY";
  if (/time was up/i.test(finalOutput)) return "TIME_UP";
  return undefined;
}

const byCost = <Row extends { costUsd: number }>(left: Row, right: Row) => right.costUsd - left.costUsd;

/** Work one run's report out, from its requests and the AI judgements they led to, and keep it. */
export const buildRunReport = internalAction({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.siteSummaries.releaseRequest, { key: runReportKey(args.cycleId) });
    const run: { companyId: Id<"companies">; startedAt: number; done: boolean } | null =
      await ctx.runQuery(internal.seoRunReports.readRunForReport, { cycleId: args.cycleId });
    if (!run) return null;

    const rows: PullForReport[] = [];
    let cursor: string | null = null;
    for (;;) {
      const read: { rows: PullForReport[]; cursor: string; isDone: boolean } =
        await ctx.runQuery(internal.seoRunReports.pullsForReport, { cycleId: args.cycleId, cursor });
      rows.push(...read.rows);
      if (read.isDone) break;
      cursor = read.cursor;
    }
    const tally = tallyRequests(rows);

    for (let at = 0; at < tally.keywordListPulls.length; at += METRICS_PER_READ) {
      const counts: Array<{ pullId: Id<"seoDataPulls">; keywords: number }> = await ctx.runQuery(
        internal.seoRunReports.keywordsOnListPages,
        { pullIds: tally.keywordListPulls.slice(at, at + METRICS_PER_READ) },
      );
      for (const { pullId, keywords } of counts) {
        const site = tally.bySite.get(tally.siteOfPull.get(pullId) ?? "");
        if (site) site.keywords += keywords;
      }
    }

    // Which Collector runs sent them, from the Collector's own log.
    const byRun = new Map<string, { requests: number; costUsd: number }>();
    const sendsUntil = Math.min(Date.now(), (tally.lastSentAt ?? run.startedAt) + SENDS_AFTER_MS);
    for (let next: string | null = null; ;) {
      const read: { rows: Array<{ runId: Id<"agentRuns">; costUsd: number }>; cursor: string; isDone: boolean } =
        await ctx.runQuery(internal.seoRunReports.collectorCallsForReport, {
          companyId: run.companyId, from: run.startedAt, to: sendsUntil, cursor: next,
        });
      for (const call of read.rows) {
        const entry = byRun.get(call.runId) ?? { requests: 0, costUsd: 0 };
        entry.requests += 1;
        entry.costUsd += call.costUsd;
        byRun.set(call.runId, entry);
      }
      if (read.isDone) break;
      next = read.cursor;
    }
    const collectorRuns: Array<{ runId: Id<"agentRuns">; startedAt: number; finalOutput?: string }> =
      await ctx.runQuery(internal.seoRunReports.collectorRunsForReport, { runIds: [...byRun.keys()] });

    // The AI its answers led to, while they were being filed and a while after.
    const from = run.startedAt;
    const to = Math.min(Date.now(), (tally.lastActivity ?? run.startedAt) + AI_AFTER_MS);
    const ai = new Map<string, { decisionKey: string; judgements: number; costUsd: number }>();
    const count = (row: JudgementForReport) => {
      const entry = ai.get(row.decisionKey) ?? { decisionKey: row.decisionKey, judgements: 0, costUsd: 0 };
      entry.judgements += 1;
      entry.costUsd += row.costUsd;
      ai.set(row.decisionKey, entry);
    };
    for (let next: string | null = null; ;) {
      const read: { rows: JudgementForReport[]; cursor: string; isDone: boolean } = await ctx.runQuery(
        internal.seoRunReports.companyJudgementsForReport,
        { companyId: run.companyId, from, to, cursor: next },
      );
      for (const row of read.rows) if (PULL_SUBJECTS.has(row.subjectKind) && tally.pullIds.has(row.subjectId)) count(row);
      if (read.isDone) break;
      next = read.cursor;
    }
    for (let next: string | null = null; ;) {
      const read: { rows: JudgementForReport[]; cursor: string; isDone: boolean } = await ctx.runQuery(
        internal.seoRunReports.pageTypeJudgementsForReport,
        { from, to, cursor: next },
      );
      for (const row of read.rows) if (row.subjectKind === PAGE_SUBJECT && tally.websiteIds.has(row.subjectId)) count(row);
      if (read.isDone) break;
      next = read.cursor;
    }
    const judgements = [...ai.values()].sort(byCost);

    await ctx.runMutation(internal.seoRunReports.writeRunReport, {
      report: {
        cycleId: args.cycleId,
        companyId: run.companyId,
        builtAt: Date.now(),
        final: run.done && tally.counts.waiting === 0 && tally.counts.answering === 0,
        ...tally.counts,
        aiJudgements: judgements.reduce((sum, entry) => sum + entry.judgements, 0),
        aiCostUsd: judgements.reduce((sum, entry) => sum + entry.costUsd, 0),
        ...(tally.firstSentAt !== undefined ? { firstSentAt: tally.firstSentAt } : {}),
        ...(tally.lastSentAt !== undefined ? { lastSentAt: tally.lastSentAt } : {}),
        byOperation: [...tally.byOperation.values()].sort(byCost),
        bySite: [...tally.bySite.values()].sort(byCost),
        byCollectorRun: collectorRuns
          .map((known) => {
            const stopped = stoppedOf(known.finalOutput);
            const sent = byRun.get(known.runId) ?? { requests: 0, costUsd: 0 };
            return { runId: known.runId, startedAt: known.startedAt, ...sent, ...(stopped ? { stopped } : {}) };
          })
          .sort((left, right) => left.startedAt - right.startedAt),
        ai: judgements,
      },
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

type Reader = { db: QueryCtx["db"] };
type Cadence = "daily" | "weekly" | "fortnightly" | "monthly";

async function reportOf(ctx: Reader, cycleId: Id<"seoCollectionCycles">) {
  return await ctx.db.query("seoRunReports").withIndex("by_cycle", (q) => q.eq("cycleId", cycleId)).unique();
}

/** What a run cost: its report when it has one, else what its requests have cost so far. */
function totalOf(cycle: Doc<"seoCollectionCycles">, report: Doc<"seoRunReports"> | null): number {
  return report ? report.costUsd + report.aiCostUsd : cycle.totalCostUsd;
}

async function runBefore(ctx: Reader, cycle: Doc<"seoCollectionCycles">) {
  return await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_company_started", (q) => q.eq("companyId", cycle.companyId).lt("startedAt", cycle.startedAt))
    .order("desc")
    .first();
}

async function companySchedule(ctx: Reader, companyId: Id<"companies">) {
  return await ctx.db.query("schedules").withIndex("by_company_agent", (q) => q.eq("companyId", companyId)).first();
}

/** A schedule's cadence, as the Data collection screen offers it; anything else reads as weekly. */
export function cadenceOf(intervalStr: string | undefined): Cadence {
  const plain = (intervalStr ?? "").trim();
  let cadence: unknown = plain;
  try {
    cadence = (JSON.parse(plain) as Record<string, unknown>).cadence;
  } catch {
    // An old plain-word schedule: "daily", "weekly".
  }
  if (cadence === "daily" || cadence === "hourly") return "daily";
  if (cadence === "fortnightly") return "fortnightly";
  if (cadence === "monthly") return "monthly";
  return "weekly";
}

const EVERY_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7, fortnightly: 14, monthly: DAYS_PER_MONTH };

const estimateShape = v.object({
  perMonthUsd: v.number(),
  lines: v.array(v.object({
    every: v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("FORTNIGHT"), v.literal("MONTH")),
    costUsd: v.number(),
    perMonthUsd: v.number(),
  })),
});
type Estimate = Infer<typeof estimateShape>;

/**
 * What a company will cost a month, from a run's requests: each kind as often
 * as it is bought — its own cadence where it has one (a weekly list, a monthly
 * crawl), but never more often than the company collects.
 */
export function estimateMonthly(
  byOperation: ReadonlyArray<{ operationId: string; costUsd: number }>,
  cadence: Cadence,
): Estimate {
  const lines = new Map<Estimate["lines"][number]["every"], { costUsd: number; perMonthUsd: number }>();
  for (const { operationId, costUsd } of byOperation) {
    const ownDays = findSeoOperation(operationId)?.refresh?.everyDays ?? 0;
    const everyDays = Math.max(EVERY_DAYS[cadence], ownDays);
    const every = everyDays <= 1 ? "DAY" : everyDays <= 7 ? "WEEK" : everyDays <= 14 ? "FORTNIGHT" : "MONTH";
    const line = lines.get(every) ?? { costUsd: 0, perMonthUsd: 0 };
    line.costUsd += costUsd;
    line.perMonthUsd += (costUsd * DAYS_PER_MONTH) / everyDays;
    lines.set(every, line);
  }
  const order = ["DAY", "WEEK", "FORTNIGHT", "MONTH"] as const;
  const listed = order.flatMap((every) => {
    const line = lines.get(every);
    return line ? [{ every, ...line }] : [];
  });
  return { perMonthUsd: listed.reduce((sum, line) => sum + line.perMonthUsd, 0), lines: listed };
}

/** Where each kind of request sits in the "where the money went" bar. */
export function spendCategoryOf(operationId: string) {
  if (operationId === "site_crawl") return "SITE_AUDIT" as const;
  if (operationId === KEYWORD_LIST) return "KEYWORD_LISTS" as const;
  if (operationId.startsWith("bulk_")) return "COMPARISONS" as const;
  if (operationId.startsWith("ai_citation_")) return "AI_ANSWERS" as const;
  if (operationId === "serp_google_organic" || operationId === "keyword_search_volume") return "SEARCHES" as const;
  if (["backlinks_summary", "domain_ranked_keywords", "domain_competitors", "ranking_history"].includes(operationId)) return "SUMMARIES" as const;
  if (operationId.startsWith("backlinks_") || operationId.startsWith("referring_") || operationId === "anchors_list") return "BACKLINKS" as const;
  return "OTHER" as const;
}

const runRow = v.object({
  cycleId: v.id("seoCollectionCycles"),
  startedAt: v.number(),
  websites: v.union(v.number(), v.null()),
  requests: v.number(),
  reused: v.number(),
  costUsd: v.number(),
  aiCostUsd: v.union(v.number(), v.null()),
  totalUsd: v.number(),
  previousTotalUsd: v.union(v.number(), v.null()),
  collectorRuns: v.union(v.number(), v.null()),
  waiting: v.number(),
  answering: v.number(),
  failed: v.number(),
  final: v.boolean(),
});

function runRowOf(cycle: Doc<"seoCollectionCycles">, report: Doc<"seoRunReports"> | null, previousTotalUsd: number | null) {
  return {
    cycleId: cycle._id,
    startedAt: cycle.startedAt,
    websites: report ? report.bySite.filter((site) => site.websiteId).length : null,
    requests: report?.requests ?? cycle.plannedCount,
    reused: cycle.reusedCount,
    costUsd: report?.costUsd ?? cycle.totalCostUsd,
    aiCostUsd: report ? report.aiCostUsd : null,
    totalUsd: totalOf(cycle, report),
    previousTotalUsd,
    collectorRuns: report ? report.byCollectorRun.filter((entry) => entry.runId).length : null,
    waiting: report?.waiting ?? Math.max(0, cycle.plannedCount - cycle.sentCount - cycle.failedCount),
    answering: report?.answering ?? 0,
    failed: report?.failed ?? cycle.failedCount,
    final: report?.final ?? false,
  };
}

/** A company's collection runs, newest first, each with what the one before it cost. */
export const listCompanyRuns = superAdminQuery({
  args: {
    companyId: v.id("companies"),
    /** Only runs from the last so many days; absent, every run. */
    withinDays: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(runRow),
  handler: async (ctx, args) => {
    // From the start of the day, so the list holds still while it is open.
    const since = args.withinDays === undefined
      ? undefined
      : Math.floor(Date.now() / DAY_MS) * DAY_MS - args.withinDays * DAY_MS;
    const result = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => {
        const company = q.eq("companyId", args.companyId);
        return since !== undefined ? company.gte("startedAt", since) : company;
      })
      .order("desc")
      .paginate(args.paginationOpts);

    const reports = new Map<string, Doc<"seoRunReports"> | null>();
    const read = async (cycleId: Id<"seoCollectionCycles">) => {
      if (!reports.has(cycleId)) reports.set(cycleId, await reportOf(ctx, cycleId));
      return reports.get(cycleId) ?? null;
    };
    const rows = [];
    for (const [index, cycle] of result.page.entries()) {
      const before = result.page[index + 1] ?? await runBefore(ctx, cycle);
      const previousTotalUsd = before ? totalOf(before, await read(before._id)) : null;
      rows.push(runRowOf(cycle, await read(cycle._id), previousTotalUsd));
    }
    return { ...result, page: rows };
  },
});

/** The four figures above a company's runs: this month, the last run, a month from now, the next run. */
export const getCompanyRunSummary = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({
    monthUsd: v.number(),
    monthRuns: v.number(),
    lastRun: v.union(v.null(), v.object({ cycleId: v.id("seoCollectionCycles"), startedAt: v.number(), totalUsd: v.number() })),
    estimate: v.union(v.null(), estimateShape),
    nextRun: v.union(v.null(), v.object({ at: v.number(), cadence: v.string() })),
  }),
  handler: async (ctx, args) => {
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const month = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId).gte("startedAt", monthStart))
      .take(MONTH_RUNS_READ);
    let monthUsd = 0;
    for (const cycle of month) monthUsd += totalOf(cycle, await reportOf(ctx, cycle._id));

    const latest = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .first();
    const latestReport = latest ? await reportOf(ctx, latest._id) : null;
    const schedule = await companySchedule(ctx, args.companyId);
    const cadence = cadenceOf(schedule?.intervalStr);

    return {
      monthUsd,
      monthRuns: month.length,
      lastRun: latest ? { cycleId: latest._id, startedAt: latest.startedAt, totalUsd: totalOf(latest, latestReport) } : null,
      estimate: schedule?.isActive && latestReport ? estimateMonthly(latestReport.byOperation, cadence) : null,
      nextRun: schedule?.isActive && schedule.nextRunAt ? { at: schedule.nextRunAt, cadence } : null,
    };
  },
});

const reportShape = v.object({ _id: v.id("seoRunReports"), _creationTime: v.number(), ...runReportFields });

/** One run in full, with the run before it for the changes, and what the company will cost from here. */
export const getRunReport = superAdminQuery({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.union(v.null(), v.object({
    cycleId: v.id("seoCollectionCycles"),
    companyId: v.id("companies"),
    companyName: v.string(),
    startedAt: v.number(),
    reused: v.number(),
    report: v.union(v.null(), reportShape),
    previous: v.union(v.null(), v.object({
      startedAt: v.number(),
      totalUsd: v.number(),
      byOperation: v.array(v.object({ operationId: v.string(), costUsd: v.number() })),
      bySite: v.array(v.object({ websiteId: v.optional(v.id("websites")), costUsd: v.number() })),
    })),
    operations: v.array(v.object({
      operationId: v.string(),
      category: v.string(),
      /** Its own cadence in days, or none: it follows the company's. */
      everyDays: v.union(v.number(), v.null()),
    })),
    sites: v.array(v.object({
      websiteId: v.id("websites"),
      relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
      keywordsPerSite: v.number(),
      backlinksPerSite: v.number(),
    })),
    decisions: v.array(v.object({ decisionKey: v.string(), copyKey: v.union(v.string(), v.null()) })),
    cadence: v.union(v.string(), v.null()),
    estimate: v.union(v.null(), estimateShape),
  })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const company = await ctx.db.get(cycle.companyId);
    const report = await reportOf(ctx, cycle._id);
    const before = await runBefore(ctx, cycle);
    const beforeReport = before ? await reportOf(ctx, before._id) : null;
    const schedule = await companySchedule(ctx, cycle.companyId);
    const cadence = cadenceOf(schedule?.intervalStr);

    const companyLimits = await readCompanyDataLimits(ctx, cycle.companyId);
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", cycle.companyId))
      .take(HOLDS_READ);
    const wanted = new Set((report?.bySite ?? []).flatMap((site) => (site.websiteId ? [site.websiteId as string] : [])));
    const sites = [];
    for (const hold of holds) {
      if (!wanted.has(hold.websiteId)) continue;
      const limits = await resolveSiteDataLimits(ctx, companyLimits, hold._id);
      sites.push({
        websiteId: hold.websiteId,
        // An older hold has no relationship written: it is the company's own.
        relationship: hold.relationship ?? ("OWNED" as const),
        keywordsPerSite: limits.keywordsPerSite,
        backlinksPerSite: limits.backlinksPerSite,
      });
    }

    return {
      cycleId: cycle._id,
      companyId: cycle.companyId,
      companyName: company?.name ?? "",
      startedAt: cycle.startedAt,
      reused: cycle.reusedCount,
      report,
      previous: before
        ? {
          startedAt: before.startedAt,
          totalUsd: totalOf(before, beforeReport),
          byOperation: (beforeReport?.byOperation ?? []).map(({ operationId, costUsd }) => ({ operationId, costUsd })),
          bySite: (beforeReport?.bySite ?? []).map(({ websiteId, costUsd }) => ({ ...(websiteId ? { websiteId } : {}), costUsd })),
        }
        : null,
      operations: (report?.byOperation ?? []).map(({ operationId }) => ({
        operationId,
        category: spendCategoryOf(operationId),
        everyDays: findSeoOperation(operationId)?.refresh?.everyDays ?? null,
      })),
      sites,
      decisions: (report?.ai ?? []).map(({ decisionKey }) => ({ decisionKey, copyKey: getDecision(decisionKey)?.copyKey ?? null })),
      cadence: schedule?.isActive ? cadence : null,
      estimate: schedule?.isActive && report ? estimateMonthly(report.byOperation, cadence) : null,
    };
  },
});
