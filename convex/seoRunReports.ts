import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readCompanyDataLimits, resolveSiteDataLimits } from "./companyDataLimits";
import { collectionTimetable, companyCollectionSchedule, companyCollectionState } from "./seoScheduleService";
import { findSeoOperation } from "./dataForSeoRegistry";
import { getDecision } from "./decisionRegistry";
import { claimSchedule } from "./siteRankings";
import { superAdminQuery } from "./tenantFunctions";
import { attentionRow, runReportFields } from "./utils/siteShapes";
import { PARSE_FAILED } from "./seoFiling";

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
 * **Worked out once, then read.** A run's requests and its AI judgements
 * both run to thousands, so neither is added up while a screen waits. A minute after any of its requests is sent or answered the
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

/**
 * Requests read at a time. A request row is a few hundred bytes since its
 * answer moved out (`seoPullAnswers.ts`, 2026-09-25); at twenty a page, when
 * each carried its answer, a large run took hundreds of reads to add up.
 */
const PULLS_PER_READ = 200;

/** Out this long and unanswered, a request is flagged: its pingback is late, and the hourly check is asking. */
const WAITING_LONG_MS = 60 * 60 * 1000;

/** A run's unanswered requests read for the flag, and how many of those out long are listed. */
const WAITING_READ = 500;
const WAITING_SHOWN = 20;

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
  /** What it asked about, when it was no one website: a question or a search. */
  asked: v.optional(v.string()),
  error: v.optional(v.string()),
  rawTruncated: v.optional(v.boolean()),
  rowsLeftOff: v.optional(v.number()),
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
  returns: v.union(v.null(), v.object({
    companyId: v.id("companies"),
    startedAt: v.number(),
    done: v.boolean(),
    /** When the company's next run started, if one has: what is sent from then is that run's. */
    nextStartedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const next = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", cycle.companyId).gt("startedAt", cycle.startedAt))
      .first();
    return {
      companyId: cycle.companyId,
      startedAt: cycle.startedAt,
      done: cycle.status === "DONE",
      nextStartedAt: next?.startedAt ?? null,
    };
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
        ...(pull.target ? {} : withAsked(pull.taskArgsJson)),
        ...(pull.error ? { error: pull.error.slice(0, DETAIL_CHARS) } : {}),
        ...(pull.rawTruncated ? { rawTruncated: true } : {}),
        ...(pull.rowsLeftOff ? { rowsLeftOff: pull.rowsLeftOff } : {}),
      })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/** What a request asked about when it named no website: its question, or its search. */
export function askedAbout(taskArgsJson: string | undefined): string | null {
  try {
    const sent = JSON.parse(taskArgsJson ?? "{}") as Record<string, unknown>;
    if (typeof sent.user_prompt === "string") return sent.user_prompt;
    if (typeof sent.keyword === "string") return sent.keyword;
  } catch {
    // Unreadable arguments name nothing.
  }
  return null;
}

function withAsked(taskArgsJson: string | undefined): { asked?: string } {
  const asked = askedAbout(taskArgsJson);
  return asked ? { asked } : {};
}

/** Enough of a reason to say what went wrong; never a payload. */
const DETAIL_CHARS = 300;

/** Requests needing a look kept on a report; the rest are counted. */
const ATTENTION_KEPT = 50;

type AttentionRow = Infer<typeof attentionRow>;

/**
 * A run's requests that need a look (reliability plan V1): failed, answered
 * but not filed, too large to keep at all, or with rows left off a list to
 * fit — the worst first, and how many in all.
 */
export function attentionOf(rows: readonly PullForReport[]): { attention: AttentionRow[]; total: number } {
  const found: AttentionRow[] = [];
  for (const row of rows) {
    const base = {
      pullId: row.pullId,
      operationId: row.operationId,
      about: row.target ?? row.asked ?? "",
      ...(row.completedAt !== undefined ? { at: row.completedAt } : {}),
    };
    if (row.status === "FAILED") {
      found.push({ ...base, kind: "FAILED", ...(row.error ? { detail: row.error } : {}) });
    } else if (row.status === "READY" && row.error?.startsWith(PARSE_FAILED)) {
      found.push({ ...base, kind: "NOT_FILED", detail: row.error.slice(PARSE_FAILED.length).trim() });
    } else if (row.status === "READY" && row.rawTruncated) {
      found.push({ ...base, kind: "TOO_LARGE" });
    } else if (row.status === "READY" && row.rowsLeftOff) {
      found.push({ ...base, kind: "ROWS_LEFT_OFF", rows: row.rowsLeftOff });
    }
  }
  const order = { FAILED: 0, NOT_FILED: 1, TOO_LARGE: 2, ROWS_LEFT_OFF: 3 } as const;
  found.sort((left, right) => order[left.kind] - order[right.kind] || (right.at ?? 0) - (left.at ?? 0));
  return { attention: found.slice(0, ATTENTION_KEPT), total: found.length };
}

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
 * a request forgets its claim once it is sent. Read through the Collector and
 * the company together — read by company, every step of every agent working
 * for it in the window came too (reliability plan 3.4). Two runs of one
 * company sending at the same moment would share these; the Planner opens one
 * at a time.
 */
export const collectorCallsForReport = internalQuery({
  args: { companyId: v.id("companies"), from: v.number(), to: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: stepPage,
  handler: async (ctx, args) => {
    const collector = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", "DATAFORSEO_COLLECTOR"))
      .first();
    if (!collector) return { rows: [], cursor: "", isDone: true };
    const result = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_agent_company_started", (q) => q.eq("agentId", collector._id).eq("companyId", args.companyId)
        .gte("startedAt", args.from).lte("startedAt", args.to))
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

/**
 * A page's type is judged for a website, not a company, so it is read by its
 * own key — and belongs to one run: the one whose request for that website
 * came last before it, since filing that request's answer is what led to it.
 * Counted for every run holding the website at the time, it was counted twice
 * when one company's runs overlapped, or two companies watched one rival
 * (reliability plan 2.5).
 */
export const pageTypeJudgementsForReport = internalQuery({
  args: {
    cycleId: v.id("seoCollectionCycles"),
    websiteIds: v.array(v.string()),
    from: v.number(),
    to: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: judgementPage,
  handler: async (ctx, args) => {
    const websites = new Set(args.websiteIds);
    const result = await ctx.db
      .query("decisionRuns")
      .withIndex("by_key_created", (q) => q.eq("decisionKey", PAGE_TYPE_KEY).gte("createdAt", args.from).lte("createdAt", args.to))
      .paginate({ cursor: args.cursor, numItems: JUDGEMENTS_PER_READ });
    const rows: JudgementForReport[] = [];
    for (const row of result.page) {
      const websiteId = row.subjectKind === PAGE_SUBJECT && websites.has(row.subjectId)
        ? ctx.db.normalizeId("websites", row.subjectId)
        : null;
      if (!websiteId) continue;
      const cause = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_website_submitted", (q) => q.eq("websiteId", websiteId).lte("submittedAt", row.createdAt))
        .order("desc")
        .first();
      if (cause?.cycleId === args.cycleId) rows.push(judgementOf(row));
    }
    return { rows, cursor: result.continueCursor, isDone: result.isDone };
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
    const run: { companyId: Id<"companies">; startedAt: number; done: boolean; nextStartedAt: number | null } | null =
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

    // Which Collector runs sent them, from the Collector's own log — up to
    // the company's next run, whose sends are its own.
    const byRun = new Map<string, { requests: number; costUsd: number }>();
    const sendsUntil = Math.min(
      Date.now(),
      (tally.lastSentAt ?? run.startedAt) + SENDS_AFTER_MS,
      run.nextStartedAt ?? Number.POSITIVE_INFINITY,
    );
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
        { cycleId: args.cycleId, websiteIds: [...tally.websiteIds], from, to, cursor: next },
      );
      for (const row of read.rows) count(row);
      if (read.isDone) break;
      next = read.cursor;
    }
    const judgements = [...ai.values()].sort(byCost);
    const needs = attentionOf(rows);

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
        attention: needs.attention,
        attentionTotal: needs.total,
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

/** How many days apart a schedule's runs come, from its cadence. */
export function everyDaysOf(intervalStr: string | undefined): number {
  return EVERY_DAYS[cadenceOf(intervalStr)];
}

/**
 * How often a call with its own cadence of `ownDays` is bought when its
 * company collects every `runDays`: on the run nearest its own cadence — held
 * until it is within half a run of due (`heldByOwnCadence`). Null: every run,
 * because the company collects no more often than the call — a monthly
 * company's run buys everything (Anthony, 2026-09-25: "if we run once a month
 * it's always the full scan").
 *
 * Daily: a weekly list every 7th run, a monthly crawl every 30th. Weekly: the
 * lists every run, the crawl every 4th. Fortnightly: the lists every run, the
 * crawl every other. Monthly: everything, every run.
 */
export function repeatDays(ownDays: number, runDays: number): number | null {
  if (collectsEveryRun(ownDays, runDays)) return null;
  const runs = Math.ceil((ownDays - runDays / 2) / runDays);
  return runs <= 1 ? null : runs * runDays;
}

/**
 * Whether a company whose runs come every `runDays` buys a call with its own
 * cadence of `ownDays` on every run: it collects about as seldom as the call,
 * or more seldom — a monthly company and a monthly crawl, a weekly one and a
 * weekly list — so every run is due one, however the months fall.
 */
export function collectsEveryRun(ownDays: number, runDays: number): boolean {
  return runDays >= ownDays * 0.9;
}

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
 * as it is bought — on the run nearest its own cadence where it has one (a
 * weekly list, a monthly crawl), and never more often than the company
 * collects (`repeatDays`).
 */
export function estimateMonthly(
  byOperation: ReadonlyArray<{ operationId: string; costUsd: number }>,
  cadence: Cadence,
): Estimate {
  const lines = new Map<Estimate["lines"][number]["every"], { costUsd: number; perMonthUsd: number }>();
  for (const { operationId, costUsd } of byOperation) {
    const ownDays = findSeoOperation(operationId)?.refresh?.everyDays;
    const everyDays = (ownDays !== undefined ? repeatDays(ownDays, EVERY_DAYS[cadence]) : null) ?? EVERY_DAYS[cadence];
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

    // The next run is when the company's work is next sent — its own schedule,
    // then the Planner's run, then the Collector's (`nextCollection`). The
    // company's row carries no next run of its own since it stopped waking
    // anything (2026-09-25).
    const { schedule, latest, next } = await companyCollectionState(ctx, args.companyId, await collectionTimetable(ctx), now);
    const latestReport = latest ? await reportOf(ctx, latest._id) : null;
    const cadence = cadenceOf(schedule?.intervalStr);

    return {
      monthUsd,
      monthRuns: month.length,
      lastRun: latest ? { cycleId: latest._id, startedAt: latest.startedAt, totalUsd: totalOf(latest, latestReport) } : null,
      estimate: schedule?.isActive && latestReport ? estimateMonthly(latestReport.byOperation, cadence) : null,
      nextRun: next.at !== null ? { at: next.at, cadence } : null,
    };
  },
});

const reportShape = v.object({ _id: v.id("seoRunReports"), _creationTime: v.number(), ...runReportFields });

/** The hourly check's name in the job ledger (`jobLedger.ts`). */
const HOURLY_CHECK_JOB = "seo-collection-sweep";

/** Not run for this long, the hourly check is overdue: three of its hours. */
const HOURLY_CHECK_OVERDUE_MS = 3 * 60 * 60 * 1000;

/**
 * The hourly check's last result, for the Collection runs screen — it was on
 * Admin → Health alone, so a check failing every hour went unseen from the
 * collection's own screens (reliability plan V3). Null before it has ever run.
 */
export const readHourlyCheck = superAdminQuery({
  args: {},
  returns: v.union(v.null(), v.object({
    lastRanAt: v.number(),
    ok: v.boolean(),
    error: v.union(v.string(), v.null()),
    lastSucceededAt: v.union(v.number(), v.null()),
    failuresInARow: v.number(),
    overdue: v.boolean(),
  })),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobRuns").withIndex("by_job", (q) => q.eq("job", HOURLY_CHECK_JOB)).unique();
    if (!row) return null;
    return {
      lastRanAt: row.lastRanAt,
      ok: row.lastOk,
      error: row.lastError ?? null,
      lastSucceededAt: row.lastSucceededAt ?? null,
      failuresInARow: row.consecutiveFailures,
      overdue: Date.now() - row.lastRanAt > HOURLY_CHECK_OVERDUE_MS,
    };
  },
});

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
      /** How often it is bought for this company, in days; none: every run, with the company's cadence. */
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
    /** Still being collected, so it can be closed by hand. */
    open: v.boolean(),
    /** Who closed it by hand, when, and how many unsent requests came off the queue. */
    closedByHand: v.union(v.null(), v.object({ name: v.string(), at: v.number(), unsent: v.number() })),
    /**
     * Its requests sent over an hour ago and still unanswered, read as the
     * page is — the longest out first — with the last word on each (V2).
     */
    waitingLong: v.object({
      rows: v.array(v.object({
        pullId: v.id("seoDataPulls"),
        operationId: v.string(),
        about: v.string(),
        since: v.number(),
        lastFetch: v.union(v.null(), v.object({ at: v.number(), said: v.string() })),
      })),
      total: v.number(),
    }),
  })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;
    const closer = cycle.closedBy ? await ctx.db.get(cycle.closedBy) : null;
    const company = await ctx.db.get(cycle.companyId);
    const report = await reportOf(ctx, cycle._id);
    const before = await runBefore(ctx, cycle);
    const beforeReport = before ? await reportOf(ctx, before._id) : null;
    const schedule = await companyCollectionSchedule(ctx, cycle.companyId);
    const cadence = cadenceOf(schedule?.intervalStr);

    // Out over an hour and still unanswered: read live, since nothing else
    // happening in the run would work its report out again to say so.
    const now = Date.now();
    const outLong = (await ctx.db
      .query("seoDataPulls")
      .withIndex("by_cycle_status", (q) => q.eq("cycleId", cycle._id).eq("status", "SUBMITTED"))
      .take(WAITING_READ))
      .filter((pull) => now - (pull.sentAt ?? pull.submittedAt) > WAITING_LONG_MS)
      .sort((left, right) => (left.sentAt ?? left.submittedAt) - (right.sentAt ?? right.submittedAt));

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
      operations: (report?.byOperation ?? []).map(({ operationId }) => {
        const ownDays = findSeoOperation(operationId)?.refresh?.everyDays;
        return {
          operationId,
          category: spendCategoryOf(operationId),
          everyDays: ownDays !== undefined ? repeatDays(ownDays, everyDaysOf(schedule?.intervalStr)) : null,
        };
      }),
      sites,
      decisions: (report?.ai ?? []).map(({ decisionKey }) => ({ decisionKey, copyKey: getDecision(decisionKey)?.copyKey ?? null })),
      cadence: schedule?.isActive ? cadence : null,
      estimate: schedule?.isActive && report ? estimateMonthly(report.byOperation, cadence) : null,
      open: cycle.status === "EXPANDING" || cycle.status === "SENDING" || cycle.status === "COLLECTING",
      // Known by what the close took off the queue; the name goes if the closer's data is erased.
      closedByHand: cycle.closedUnsent !== undefined
        ? { name: closer?.name ?? "", at: cycle.finishedAt ?? cycle.startedAt, unsent: cycle.closedUnsent }
        : null,
      waitingLong: {
        rows: outLong.slice(0, WAITING_SHOWN).map((pull) => ({
          pullId: pull._id,
          operationId: pull.operationId,
          about: pull.target ?? askedAbout(pull.taskArgsJson) ?? "",
          since: pull.sentAt ?? pull.submittedAt,
          lastFetch: pull.lastFetch ?? null,
        })),
        total: outLong.length,
      },
    };
  },
});
