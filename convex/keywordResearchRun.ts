import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { LIVE_REQUEST_TIMEOUT_MS, postDataForSeoTasks, readDataForSeoCredentials, readDataForSeoOutcome, type DataForSeoCredentials } from "./dataForSeoRest";
import { countSettled, recordCollectorCall } from "./seoCollectionQueue";
import { recordOperationCost } from "./websiteTrackingStats";
import { failureSummary } from "./roleRuns";
import { readFanOutLimits } from "./fanOutLimits";
import {
  OVERVIEW_KEYWORDS_PER_CALL,
  RESEARCH_CALLS,
  TOP_PAGES,
  historyTask,
  ideasTask,
  overviewTask,
  pageKey,
  pageKeywordsTask,
  readGoogleResults,
  readIdeas,
  readKeywordOverviews,
  readPageKeywords,
  readPageLinking,
  readPageStrength,
  readPageTraffic,
  readSearchHistories,
  serpTask,
  strengthTask,
  trafficTask,
  type IdeaRow,
  type KeywordOverview,
  type ResearchCall,
} from "./keywordResearchCalls";
import { freshnessOf, newestSerp, overviewIsFresh, platformSandbox, serpIsFresh, serpIsFrom, type Freshness } from "./keywordResearchData";
import { findResearchCountry, searchPlaceOf } from "./utils/researchCountries";
import { RESEARCH_PROBLEMS, type ResearchProblem } from "./utils/researchProblems";

const problemValidator = v.union(...RESEARCH_PROBLEMS.map((code) => v.literal(code)));
import { AI_ENGINES, AI_ENGINE_CALLS, type AiEngine } from "./seoAiEngines";
import { seoAiCitationParams } from "./dataForSeoRegistry";
import { parseLlmResponse } from "./dataForSeoParsers";
import { findBrandMentions, type BrandName } from "./utils/websiteBrands";
import { aiOverviewFanOutParams } from "./dataForSeoAiOverviewOperations";
import { parseAiOverviewFanOuts } from "./aiOverviewFanOuts";
import { hostOf } from "./keywordResearchCalls";
import { getErrorMessage } from "./utils/lang";
import { getAgentTemplateById } from "./agentTemplates";

/**
 * The Keyword research agent's job (docs/plans/active/keyword-research-plan.md):
 * what an agent holding the role `KEYWORD_RESEARCH` does when Look up, or a
 * part of a lookup being opened, starts it. Each part asked for is a job of
 * the run (`researchJobs`); it buys what its jobs wait for and nothing else,
 * files it, settles the jobs, and says what it did:
 *
 * - **a lookup**: the keyword's overview and its last 24 months, Google's
 *   top 100, and the top ten's visits and keywords (the overview's top five
 *   show the visits);
 * - **another country** picked under Searches by country: its overview alone;
 * - **Google's results** opened: each top-ten page's strength, linking
 *   websites and what it ranks for — its top keyword, and the "also rank
 *   for" ideas, as many of them as the company's limit;
 * - **Ideas** opened: terms match and questions;
 * - **What the AI says** opened: the question behind the keyword — written
 *   by the agent's own model (a plain sentence when the platform is on
 *   DataForSEO's sandbox) — asked of
 *   four assistants at once, and Google's AI Overview searches.
 *
 * Every call is a live one, so the person waiting sees the answer in seconds;
 * each is written as a line on this run with its cost, and to the company's
 * DataForSEO spend (`seoDataPulls`), so Cost to serve counts it, and shared
 * among the lookups it was bought for. It always buys real figures: it has
 * no Test mode (Anthony, 2026-10-04). It buys a few keywords at once; a run
 * with more than about six minutes of buying carries on in a fresh part
 * rather than meet Convex's ten-minute limit. It stops at its own spend limit for a run, if it has one, and says
 * which lookups it left.
 */

const placeValidator = v.object({ keyword: v.string(), locationCode: v.number() });
type Place = { keyword: string; locationCode: number };
const keyOf = (place: Place) => `${place.locationCode}\u0000${place.keyword}`;
type Reader = { db: QueryCtx["db"] };

/** The most jobs a run reads: a Look up holds at most 100 keywords, one job each. */
const JOBS_READ = 500;

/** Whether both kinds of idea bought by the ideas call are held, fresh, and at least as many as the company asks for. */
async function ideasAreFresh(ctx: Reader, place: Place, fresh: Freshness, limit: number): Promise<boolean> {
  for (const kind of ["TERMS", "QUESTIONS"] as const) {
    const row = await newestIdeas(ctx, place, kind);
    if (!row || row.boughtAt < fresh.since || (!fresh.sandbox && row.sandbox) || row.limit < limit) return false;
  }
  return true;
}

async function newestIdeas(ctx: Reader, place: Place, kind: Doc<"researchIdeas">["kind"]): Promise<Doc<"researchIdeas"> | null> {
  return await ctx.db
    .query("researchIdeas")
    .withIndex("by_keyword_place_kind", (q) => q.eq("keyword", place.keyword).eq("locationCode", place.locationCode).eq("kind", kind))
    .order("desc")
    .first();
}

async function answersAreFresh(ctx: Reader, place: Place, fresh: Freshness): Promise<boolean> {
  const row = await ctx.db
    .query("researchAnswers")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", place.keyword).eq("locationCode", place.locationCode))
    .order("desc")
    .first();
  return Boolean(row && row.boughtAt >= fresh.since && (fresh.sandbox || !row.sandbox));
}

/** The top ten in full — strength, linking websites, what each ranks for — held, fresh, and with as many "also rank for" ideas as the company asks for. */
async function detailsAreFresh(ctx: Reader, place: Place, fresh: Freshness, ideasLimit: number): Promise<boolean> {
  const serp = await newestSerp(ctx, place.keyword, place.locationCode);
  if (!serp?.detailsBoughtAt || serp.detailsBoughtAt < fresh.since || (!fresh.sandbox && serp.sandbox) || !serpIsFrom(serp, place.keyword, place.locationCode)) return false;
  const also = await newestIdeas(ctx, place, "ALSO_RANK");
  return Boolean(also && also.boughtAt >= fresh.since && (fresh.sandbox || !also.sandbox) && also.limit >= ideasLimit);
}

/**
 * Whether the newest Google's results can take the top ten's details bought
 * now: fresh, and bought the way they will be — sample details never land on
 * real results, nor real ones on sample results.
 */
async function serpTakesDetails(ctx: Reader, place: Place, fresh: Freshness): Promise<boolean> {
  const serp = await newestSerp(ctx, place.keyword, place.locationCode);
  return Boolean(serp && serp.boughtAt >= fresh.since && serp.sandbox === fresh.sandbox && serpIsFrom(serp, place.keyword, place.locationCode));
}

/** Whether a job is still the newest asked for its part of its lookup: an older run never buys for, or settles, a part asked for again since. */
async function isNewestJob(ctx: Reader, job: Doc<"researchJobs">): Promise<boolean> {
  const newer = await ctx.db
    .query("researchJobs")
    .withIndex("by_lookup_part", (q) => q.eq("lookupId", job.lookupId).eq("part", job.part).gt("createdAt", job.createdAt))
    .take(20);
  return !newer.some((row) => row.locationCode === job.locationCode);
}

/** A run's jobs still its own to buy for and settle. */
async function runJobs(ctx: Reader, runId: Id<"agentRuns">): Promise<Doc<"researchJobs">[]> {
  const jobs = await ctx.db.query("researchJobs").withIndex("by_run", (q) => q.eq("runId", runId)).take(JOBS_READ);
  const own: Doc<"researchJobs">[] = [];
  for (const job of jobs) if (await isNewestJob(ctx, job)) own.push(job);
  return own;
}

/**
 * What counts as held for a job: within the company's days — and, for Look
 * up again or Ask again, bought since the run started, so it is bought afresh
 * once and never twice when a long run carries on.
 */
function freshFor(job: Doc<"researchJobs">, base: Freshness, run: Doc<"agentRuns">): Freshness {
  return job.again ? { since: Math.max(base.since, run.startedAt), sandbox: base.sandbox } : base;
}

/** What a run's jobs wait for that is not held, read when it starts and again each time it carries on. */
export const readWork = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.object({
    companyId: v.union(v.id("companies"), v.null()),
    sandbox: v.boolean(),
    maxCostUsd: v.union(v.number(), v.null()),
    ideasPerKind: v.number(),
    overviews: v.array(placeValidator),
    countries: v.array(placeValidator),
    serps: v.array(placeValidator),
    details: v.array(placeValidator),
    ideas: v.array(placeValidator),
    answers: v.array(placeValidator),
    overviewSearches: v.number(),
    lookups: v.array(v.object({ lookupId: v.id("keywordLookups"), keyword: v.string(), locationCode: v.number() })),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    const jobs = run ? await runJobs(ctx, args.runId) : [];
    const companyId = run?.companyId ?? jobs[0]?.companyId ?? null;
    const sandbox = platformSandbox();
    const limits = companyId ? await readFanOutLimits(ctx, companyId) : null;
    const base = freshnessOf(limits?.researchReuseDays ?? 30);
    const ideasPerKind = limits?.researchIdeasPerKind ?? 100;

    const overviews = new Map<string, Place>();
    const countries = new Map<string, Place>();
    const serps = new Map<string, Place>();
    const details = new Map<string, Place>();
    const ideas = new Map<string, Place>();
    const answers = new Map<string, Place>();
    const results: Array<{ place: Place; fresh: Freshness }> = [];
    for (const job of jobs) {
      const place: Place = { keyword: job.keyword, locationCode: job.locationCode };
      const key = keyOf(place);
      const fresh = freshFor(job, base, run!);
      if (job.part === "OVERVIEW") {
        if (!overviews.has(key) && !(await overviewIsFresh(ctx, place.keyword, place.locationCode, fresh))) overviews.set(key, place);
        if (!serps.has(key) && !(await serpIsFresh(ctx, place.keyword, place.locationCode, fresh))) serps.set(key, place);
      } else if (job.part === "COUNTRY") {
        if (!countries.has(key) && !(await overviewIsFresh(ctx, place.keyword, place.locationCode, fresh))) countries.set(key, place);
      } else if (job.part === "RESULTS") {
        results.push({ place, fresh });
      } else if (job.part === "IDEAS") {
        if (!ideas.has(key) && !(await ideasAreFresh(ctx, place, fresh, ideasPerKind))) ideas.set(key, place);
      } else if (!answers.has(key) && !(await answersAreFresh(ctx, place, fresh))) {
        answers.set(key, place);
      }
    }
    // After the overviews: results bought again this run need their details bought again on them.
    for (const { place, fresh } of results) {
      const key = keyOf(place);
      if (details.has(key)) continue;
      if (serps.has(key) || !(await detailsAreFresh(ctx, place, fresh, ideasPerKind))) {
        details.set(key, place);
        if (!serps.has(key) && !(await serpTakesDetails(ctx, place, fresh))) serps.set(key, place);
      }
    }
    return {
      companyId,
      sandbox,
      maxCostUsd: agent?.maxCostUsd ?? null,
      ideasPerKind,
      overviews: [...overviews.values()],
      // A country that is another lookup's home is bought with its 24 months there.
      countries: [...countries.values()].filter((place) => !overviews.has(keyOf(place))),
      serps: [...serps.values()],
      details: [...details.values()],
      ideas: [...ideas.values()],
      answers: [...answers.values()],
      overviewSearches: limits?.researchOverviewSearches ?? 25,
      lookups: jobs.map((job) => ({ lookupId: job.lookupId, keyword: job.keyword, locationCode: job.locationCode })),
    };
  },
});

/** The top ten's addresses of the newest Google's results held for a keyword. */
export const readTopUrls = internalQuery({
  args: placeValidator,
  returns: v.array(v.string()),
  handler: async (ctx, args) => ((await newestSerp(ctx, args.keyword, args.locationCode))?.results ?? []).slice(0, TOP_PAGES).map((result) => result.url),
});

/**
 * The agent's own instructions and model, for writing the question behind a
 * keyword — its template's instructions when it has none of its own, as an
 * agent made by hand from Admin → Agents may (without them the model asked
 * the person a question back, 2026-10-04).
 */
export const readQuestionSetup = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.null(), v.object({ instructions: v.string(), requestedModelId: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    if (!agent) return null;
    return {
      instructions: agent.systemPrompt?.trim() || (getAgentTemplateById("keyword-research-agent")?.systemPrompt ?? ""),
      ...(agent.modelSelectionMode === "inherit" ? {} : { requestedModelId: agent.modelId }),
    };
  },
});

/**
 * One call's cost and outcome: on this run, on the company's DataForSEO
 * spend, in the running mean by call, and shared among the lookups it was
 * bought for — what each lookup's header says it cost.
 */
export const recordResearchCall = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.optional(v.id("companies")),
    lookupIds: v.array(v.id("keywordLookups")),
    operationId: v.string(),
    family: v.string(),
    tag: v.string(),
    taskArgsJson: v.string(),
    costUsd: v.number(),
    sandbox: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = args.error ? ("FAILED" as const) : ("READY" as const);
    const rowId = await ctx.db.insert("seoDataPulls", {
      operationId: args.operationId,
      family: args.family,
      mode: "LIVE",
      ...(args.companyId ? { companyId: args.companyId } : {}),
      taskArgsJson: args.taskArgsJson,
      status,
      tag: args.tag,
      costUsd: args.costUsd,
      sandbox: args.sandbox,
      agentRunId: args.runId,
      submittedAt: now,
      sentAt: now,
      completedAt: now,
      // Filed as it was bought: nothing waits to be collected or filed later.
      filedAt: now,
      ...(args.error ? { error: args.error } : {}),
    });
    const row = await ctx.db.get(rowId);
    if (!row) return null;
    await countSettled(ctx, row, status, args.costUsd, "SEND");
    await recordOperationCost(ctx, args.operationId, args.costUsd);
    await recordCollectorCall(ctx, args.runId, row, status, args.costUsd, args.error);
    if (args.costUsd > 0) {
      const share = args.costUsd / Math.max(1, args.lookupIds.length);
      for (const lookupId of args.lookupIds) {
        const lookup = await ctx.db.get(lookupId);
        if (lookup) await ctx.db.patch(lookupId, { spentUsd: (lookup.spentUsd ?? 0) + share });
      }
    }
    return null;
  },
});

const overviewValidator = v.object({
  searchVolume: v.union(v.number(), v.null()),
  cpc: v.union(v.number(), v.null()),
  competitionLevel: v.union(v.string(), v.null()),
  difficulty: v.union(v.number(), v.null()),
  intent: v.union(v.string(), v.null()),
  monthly: v.array(v.object({ month: v.string(), volume: v.number() })),
  serpKinds: v.array(v.string()),
  resultsCount: v.union(v.number(), v.null()),
  topTenLinkingSites: v.union(v.number(), v.null()),
  topTenDomainStrength: v.union(v.number(), v.null()),
});

const pageValidator = v.object({
  url: v.string(),
  strength: v.union(v.number(), v.null()),
  linkingSites: v.union(v.number(), v.null()),
  visits: v.union(v.number(), v.null()),
  keywords: v.union(v.number(), v.null()),
  topKeyword: v.union(v.string(), v.null()),
});

const ideaValidator = v.object({
  keyword: v.string(),
  volume: v.union(v.number(), v.null()),
  difficulty: v.union(v.number(), v.null()),
  intent: v.union(v.string(), v.null()),
  cpc: v.union(v.number(), v.null()),
});

export const fileOverviews = internalMutation({
  args: { locationCode: v.number(), sandbox: v.boolean(), items: v.array(v.object({ keyword: v.string(), overview: overviewValidator })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const { keyword, overview } of args.items) {
      await ctx.db.insert("researchKeywords", { keyword, locationCode: args.locationCode, boughtAt: now, sandbox: args.sandbox, ...overview });
    }
    return null;
  },
});

export const fileSerp = internalMutation({
  args: {
    keyword: v.string(),
    locationCode: v.number(),
    sandbox: v.boolean(),
    from: v.optional(v.number()),
    results: v.array(v.object({ position: v.number(), url: v.string(), domain: v.string(), title: v.string() })),
    pages: v.array(pageValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("researchSerps", { ...args, boughtAt: Date.now() });
    return null;
  },
});

/** Google's results opened: the top ten's strength, linking websites and top keyword on the newest results, and the "also rank for" ideas. */
export const fileDetails = internalMutation({
  args: {
    keyword: v.string(),
    locationCode: v.number(),
    sandbox: v.boolean(),
    pages: v.array(pageValidator),
    ideas: v.array(ideaValidator),
    ideasLimit: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const serp = await newestSerp(ctx, args.keyword, args.locationCode);
    // Sample details never land on real results, nor real ones on sample results: the lookup is settled as failed instead.
    if (!serp || serp.sandbox !== args.sandbox) return null;
    const bought = new Map(args.pages.map((page) => [pageKey(page.url), page]));
    const pages = serp.results.slice(0, TOP_PAGES).map((result) => {
      const held = serp.pages?.find((page) => pageKey(page.url) === pageKey(result.url));
      const fresh = bought.get(pageKey(result.url));
      return {
        url: result.url,
        strength: fresh?.strength ?? held?.strength ?? null,
        linkingSites: fresh?.linkingSites ?? held?.linkingSites ?? null,
        visits: held?.visits ?? fresh?.visits ?? null,
        keywords: held?.keywords ?? fresh?.keywords ?? null,
        topKeyword: fresh?.topKeyword ?? held?.topKeyword ?? null,
      };
    });
    await ctx.db.patch(serp._id, { pages, detailsBoughtAt: now });
    await ctx.db.insert("researchIdeas", {
      keyword: args.keyword,
      locationCode: args.locationCode,
      kind: "ALSO_RANK",
      boughtAt: now,
      sandbox: args.sandbox,
      limit: args.ideasLimit,
      total: args.ideas.length,
      rows: args.ideas,
    });
    return null;
  },
});

/** Ideas: terms match and questions, each with how many DataForSEO holds in all. */
export const fileIdeas = internalMutation({
  args: {
    keyword: v.string(),
    locationCode: v.number(),
    sandbox: v.boolean(),
    limit: v.number(),
    kinds: v.array(v.object({ kind: v.union(v.literal("TERMS"), v.literal("QUESTIONS")), total: v.union(v.number(), v.null()), rows: v.array(ideaValidator) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const { kind, total, rows } of args.kinds) {
      await ctx.db.insert("researchIdeas", { keyword: args.keyword, locationCode: args.locationCode, kind, boughtAt: now, sandbox: args.sandbox, limit: args.limit, total, rows });
    }
    return null;
  },
});

export const fileAnswers = internalMutation({
  args: {
    keyword: v.string(),
    locationCode: v.number(),
    sandbox: v.boolean(),
    question: v.string(),
    engines: v.array(v.object({
      engine: v.string(),
      answered: v.boolean(),
      answer: v.string(),
      named: v.array(v.object({ websiteId: v.id("websites"), host: v.string() })),
      cited: v.array(v.object({ url: v.string(), host: v.string() })),
    })),
    overviewSearches: v.array(v.object({ query: v.string(), times: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("researchAnswers", { ...args, boughtAt: Date.now() });
    return null;
  },
});

/**
 * Each of the run's jobs, settled: ready where what it waited for is now held
 * and fresh — never because something older was — failed, saying why, where
 * it is not. A part asked for again since, by a newer run, is that run's.
 */
export const settleLookups = internalMutation({
  args: { runId: v.id("agentRuns"), problem: v.optional(problemValidator) },
  returns: v.object({ ready: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { ready: 0, failed: 0 };
    const jobs = await runJobs(ctx, args.runId);
    const companyId = run.companyId ?? jobs[0]?.companyId;
    const limits = companyId ? await readFanOutLimits(ctx, companyId) : null;
    const base = freshnessOf(limits?.researchReuseDays ?? 30);
    const ideasPerKind = limits?.researchIdeasPerKind ?? 100;
    const problem: ResearchProblem = args.problem ?? "NO_ANSWER";
    let ready = 0;
    let failed = 0;
    for (const job of jobs) {
      const lookup = await ctx.db.get(job.lookupId);
      if (!lookup) continue;
      const place: Place = { keyword: job.keyword, locationCode: job.locationCode };
      const fresh = freshFor(job, base, run);
      const held =
        job.part === "OVERVIEW" ? (await overviewIsFresh(ctx, place.keyword, place.locationCode, fresh)) && (await serpIsFresh(ctx, place.keyword, place.locationCode, fresh))
        : job.part === "COUNTRY" ? await overviewIsFresh(ctx, place.keyword, place.locationCode, fresh)
        : job.part === "RESULTS" ? await detailsAreFresh(ctx, place, fresh, ideasPerKind)
        : job.part === "IDEAS" ? await ideasAreFresh(ctx, place, fresh, ideasPerKind)
        : await answersAreFresh(ctx, place, fresh);
      const state = held ? ("READY" as const) : ("FAILED" as const);
      const patch: Partial<Pick<Doc<"keywordLookups">, "overview" | "results" | "ideas" | "answers" | "countries" | "problem">> = {};
      if (job.part === "COUNTRY") {
        if (!lookup.countries?.some((country) => country.locationCode === job.locationCode && country.state === "WAITING")) continue;
        patch.countries = lookup.countries.map((country) => (country.locationCode === job.locationCode ? { ...country, state } : country));
      } else {
        const field = ({ OVERVIEW: "overview", RESULTS: "results", IDEAS: "ideas", ANSWERS: "answers" } as const)[job.part];
        if (lookup[field] !== "WAITING") continue;
        patch[field] = state;
      }
      if (held) ready += 1;
      else {
        failed += 1;
        patch.problem = problem;
      }
      await ctx.db.patch(lookup._id, patch);
    }
    return { ready, failed };
  },
});

type Buyer = {
  ctx: ActionCtx;
  runId: Id<"agentRuns">;
  companyId: Id<"companies"> | null;
  credentials: DataForSeoCredentials;
  maxCostUsd: number | null;
  /** Each place's lookups in this run: whose share of a call's cost it is. */
  lookupsByPlace: Map<string, Id<"keywordLookups">[]>;
  /** Calls sent by this run so far, across every time it carried on. */
  calls: number;
  /** When this part of the run stops starting calls, and carries on in a fresh one: well inside Convex's ten minutes. */
  deadline: number;
};

class SpendLimitReached extends Error {}
class TimeToCarryOn extends Error {}

/** How long one part of a run starts calls for; a call already sent may take up to two minutes more. */
const RUN_PART_MS = 6 * 60 * 1000;
/** Keywords bought at the same time: the same calls, a few at once, so a long Look up is not ten at a time slower. */
const AT_ONCE = 5;
/** How many times a run may carry on before it stops and says so. */
const MOST_PARTS = 6;

/**
 * One live call: refused before it is sent when the run's spend limit is
 * reached, and written down whatever DataForSEO says — at no cost when the
 * platform is on DataForSEO's sandbox, where nothing is charged. Calls sent at once each check the limit
 * before they go, so a run can pass its limit by the calls already on their
 * way: at most four more of the same kind (docs/plans/active/keyword-
 * research-plan.md, "Spend").
 */
async function buy(buyer: Buyer, call: ResearchCall, task: Record<string, unknown>, places: Place[]): Promise<unknown> {
  if (buyer.maxCostUsd !== null) {
    const spent = await buyer.ctx.runQuery(internal.roleRuns.readRunCost, { runId: buyer.runId });
    if (spent >= buyer.maxCostUsd) throw new SpendLimitReached();
  }
  buyer.calls += 1;
  const tag = `research:${buyer.runId}:${buyer.calls}`;
  const sent = { ...task, tag };
  let costUsd = 0;
  let result: unknown = null;
  let error: string | undefined;
  try {
    const outcome = readDataForSeoOutcome(await postDataForSeoTasks(call.path, [sent], buyer.credentials, { timeoutMs: LIVE_REQUEST_TIMEOUT_MS }));
    // The sandbox says what the call would cost, but charges nothing.
    costUsd = buyer.credentials.sandbox ? 0 : outcome.costUsd;
    result = outcome.result ?? null;
    error = outcome.error;
  } catch (caught) {
    error = getErrorMessage(caught);
  }
  await buyer.ctx.runMutation(internal.keywordResearchRun.recordResearchCall, {
    runId: buyer.runId,
    ...(buyer.companyId ? { companyId: buyer.companyId } : {}),
    lookupIds: [...new Set(places.flatMap((place) => buyer.lookupsByPlace.get(keyOf(place)) ?? []))],
    operationId: call.id,
    family: call.family,
    tag,
    taskArgsJson: JSON.stringify(sent).slice(0, 20_000),
    costUsd,
    sandbox: buyer.credentials.sandbox,
    ...(error ? { error } : {}),
  });
  return error ? null : result;
}

/** Every one of a few things done at once, then the first thing that went wrong, if any — so nothing is left running behind a failure. */
async function allOf<T>(work: Array<Promise<T>>): Promise<T[]> {
  const outcomes = await Promise.allSettled(work);
  const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
  if (failed) throw failed.reason;
  return outcomes.map((outcome) => (outcome as PromiseFulfilledResult<T>).value);
}

/** Two different things at once, as `allOf`. */
async function bothOf<A, B>(first: Promise<A>, second: Promise<B>): Promise<[A, B]> {
  const [one, two] = await Promise.allSettled([first, second]);
  if (one.status === "rejected") throw one.reason;
  if (two.status === "rejected") throw two.reason;
  return [one.value, two.value];
}

/** Each place bought a few at once, stopping to carry on in a fresh part of the run once this part's time is up. */
async function eachPlace(buyer: Buyer, places: Place[], buyOne: (place: Place) => Promise<void>): Promise<void> {
  for (let at = 0; at < places.length; at += AT_ONCE) {
    if (Date.now() > buyer.deadline) throw new TimeToCarryOn();
    await allOf(places.slice(at, at + AT_ONCE).map(buyOne));
  }
}

const countryName = (code: number) => findResearchCountry(code)?.label ?? `place ${code}`;

/** Overviews, many keywords a call; with each keyword's 24 months for a lookup's own country, the overview alone for another country picked. */
async function buyOverviews(buyer: Buyer, places: Place[], withHistory: boolean) {
  const { ctx, runId, companyId, credentials } = buyer;
  const byPlace = new Map<number, string[]>();
  for (const { keyword, locationCode } of places) byPlace.set(locationCode, [...(byPlace.get(locationCode) ?? []), keyword]);
  for (const [locationCode, keywords] of byPlace) {
    for (let at = 0; at < keywords.length; at += OVERVIEW_KEYWORDS_PER_CALL) {
      if (Date.now() > buyer.deadline) throw new TimeToCarryOn();
      const chunk = keywords.slice(at, at + OVERVIEW_KEYWORDS_PER_CALL);
      const chunkPlaces = chunk.map((keyword) => ({ keyword, locationCode }));
      // The 24 months are a call of their own: the overview's are only 12.
      const [overviewResult, historyResult] = await allOf([
        buy(buyer, RESEARCH_CALLS.overview, overviewTask(chunk, locationCode), chunkPlaces),
        withHistory ? buy(buyer, RESEARCH_CALLS.history, historyTask(chunk, locationCode), chunkPlaces) : Promise.resolve(null),
      ]);
      const overviews = readKeywordOverviews(overviewResult);
      const histories = withHistory ? readSearchHistories(historyResult) : new Map<string, Array<{ month: string; volume: number }>>();
      const items = chunk.flatMap((keyword) => {
        const overview: KeywordOverview | undefined = overviews.get(keyword);
        if (!overview) return [];
        const history = histories.get(keyword);
        return [{ keyword, overview: { ...overview, monthly: history && history.length > overview.monthly.length ? history : overview.monthly } }];
      });
      if (items.length > 0) await ctx.runMutation(internal.keywordResearchRun.fileOverviews, { locationCode, sandbox: credentials.sandbox, items });
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId,
        ...(companyId ? { companyId } : {}),
        heading: `Overviews, ${countryName(locationCode)}`,
        detail: `${items.length} of ${chunk.length} ${chunk.length === 1 ? "keyword" : "keywords"} answered.`,
        failed: items.length < chunk.length,
      });
    }
  }
}

/** Google's top 100 — asked from the city the keyword names, if any (`searchPlaceOf`) — then the top ten's visits and keywords in one call. */
async function buyResults(buyer: Buyer, place: Place) {
  const from = searchPlaceOf(place.keyword, place.locationCode);
  const results = readGoogleResults(await buy(buyer, RESEARCH_CALLS.serp, serpTask(place.keyword, from), [place]));
  const top = results.slice(0, TOP_PAGES);
  const traffic = top.length > 0
    ? readPageTraffic(await buy(buyer, RESEARCH_CALLS.traffic, trafficTask(top.map((result) => result.url), place.locationCode), [place]))
    : new Map();
  const pages = top.map((result) => {
    const figures = traffic.get(pageKey(result.url));
    return { url: result.url, strength: null, linkingSites: null, visits: figures?.visits ?? null, keywords: figures?.keywords ?? null, topKeyword: null };
  });
  if (results.length > 0) {
    await buyer.ctx.runMutation(internal.keywordResearchRun.fileSerp, {
      ...place,
      sandbox: buyer.credentials.sandbox,
      ...(from !== place.locationCode ? { from } : {}),
      results,
      pages,
    });
  }
}

/** Google's results opened: each top-ten page's strength and linking websites, and what it ranks for — the ten pages at once. */
async function buyDetails(buyer: Buyer, place: Place, ideasLimit: number) {
  const urls = await buyer.ctx.runQuery(internal.keywordResearchRun.readTopUrls, place);
  if (urls.length === 0) return;
  // Enough of each page's keywords that the ten together make the company's number of ideas.
  const perPage = Math.max(1, Math.ceil(ideasLimit / urls.length));
  const [strengthResult, linkingResult, ...rankedResults] = await allOf([
    buy(buyer, RESEARCH_CALLS.strength, strengthTask(urls), [place]),
    buy(buyer, RESEARCH_CALLS.linking, strengthTask(urls), [place]),
    ...urls.map((url) => buy(buyer, RESEARCH_CALLS.pageKeywords, pageKeywordsTask(url, place.locationCode, perPage), [place])),
  ]);
  const strength = readPageStrength(strengthResult);
  const linking = readPageLinking(linkingResult);
  const ideas = new Map<string, IdeaRow>();
  const pages = urls.map((url, index) => {
    const ranked = readPageKeywords(rankedResults[index]);
    for (const row of ranked) if (row.keyword !== place.keyword && !ideas.has(row.keyword)) ideas.set(row.keyword, row);
    return {
      url,
      strength: strength.get(pageKey(url)) ?? null,
      linkingSites: linking.get(pageKey(url)) ?? null,
      visits: null,
      keywords: null,
      topKeyword: ranked[0]?.keyword ?? null,
    };
  });
  const sorted = [...ideas.values()].sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1)).slice(0, ideasLimit);
  await buyer.ctx.runMutation(internal.keywordResearchRun.fileDetails, { ...place, sandbox: buyer.credentials.sandbox, pages, ideas: sorted, ideasLimit });
}

/** Ideas: terms match and questions at once, as many of each as the company's limit. */
async function buyIdeas(buyer: Buyer, place: Place, limit: number) {
  const [termsResult, questionsResult] = await allOf([
    buy(buyer, RESEARCH_CALLS.terms, ideasTask(place.keyword, place.locationCode, limit, false), [place]),
    buy(buyer, RESEARCH_CALLS.questions, ideasTask(place.keyword, place.locationCode, limit, true), [place]),
  ]);
  const terms = readIdeas(termsResult);
  const questions = readIdeas(questionsResult);
  const kinds = [
    ...(terms.rows.length > 0 || terms.total !== null ? [{ kind: "TERMS" as const, ...terms }] : []),
    ...(questions.rows.length > 0 || questions.total !== null ? [{ kind: "QUESTIONS" as const, ...questions }] : []),
  ];
  if (kinds.length > 0) await buyer.ctx.runMutation(internal.keywordResearchRun.fileIdeas, { ...place, sandbox: buyer.credentials.sandbox, limit, kinds });
}

/** The longest answer kept: enough to read in full on the screen, small enough for the row. */
const ANSWER_KEPT = 20_000;

/**
 * What the AI says: the question, then the four assistants at once — one
 * live call each — and Google's AI Overview searches, as many as the
 * company's limit (none at 0).
 */
async function buyAnswers(buyer: Buyer, place: Place, overviewSearches: number) {
  const country = findResearchCountry(place.locationCode);
  const question = buyer.credentials.sandbox
    ? `Who is the best ${place.keyword} in ${country?.label ?? "my country"}?`
    : await buyer.ctx.runAction(internal.keywordResearchQuestion.writeQuestion, {
        runId: buyer.runId,
        ...(buyer.companyId ? { companyId: buyer.companyId } : {}),
        keyword: place.keyword,
        country: country?.label ?? "",
      });
  if (!question) return;
  // Every website some company has named on Hakken, with its names: what an answer is searched for, as collections search it.
  const named: Array<{ websiteId: Id<"websites">; host: string; brandNames: BrandName[] }> =
    await buyer.ctx.runQuery(internal.holdProfiles.listNamedWebsitesInternal, { limit: 2_000 });
  const askOne = async (engine: AiEngine) => {
    const call = { id: `research_ai_${engine}`, path: `/v3/ai_optimization/${AI_ENGINE_CALLS[engine].platform}/llm_responses/live`, family: "AI Optimization", name: engine };
    const result = await buy(buyer, call, seoAiCitationParams(engine, question, country ? { countryIso: country.iso } : null), [place]);
    if (result === null) return { engine, answered: false, answer: "", named: [], cited: [] };
    const parsed = parseLlmResponse(result);
    const hits = named.flatMap((website) => {
      const found = findBrandMentions(parsed.answer, website.brandNames);
      return found ? [{ websiteId: website.websiteId, host: website.host, at: found.at }] : [];
    }).sort((left, right) => left.at - right.at);
    return {
      engine,
      answered: true,
      answer: parsed.answer.slice(0, ANSWER_KEPT),
      named: hits.map(({ websiteId, host }) => ({ websiteId, host })),
      cited: parsed.sources.map((source) => ({ url: source.url, host: hostOf(source.url) })),
    };
  };
  const askOverview = async () => overviewSearches > 0
    ? parseAiOverviewFanOuts(
        await buy(buyer, { id: "research_ai_overview_searches", path: "/v3/ai_optimization/llm_mentions/search/live", family: "AI Optimization", name: "Google's AI Overview searches" },
          aiOverviewFanOutParams(place.keyword, place.locationCode, overviewSearches), [place]),
        overviewSearches,
      ).map((row) => ({ query: row.queryText, times: row.times }))
    : [];
  // The four assistants and the AI Overview at once.
  const [engines, searches] = await bothOf(allOf(AI_ENGINES.map(askOne)), askOverview());
  if (engines.some((engine) => engine.answered)) {
    await buyer.ctx.runMutation(internal.keywordResearchRun.fileAnswers, { ...place, sandbox: buyer.credentials.sandbox, question, engines, overviewSearches: searches });
  }
}

type Carrying = { part: number; calls: number };

/**
 * One part of a run: buy what its jobs wait for, then settle them. Returns
 * the run's summary, or null when this part's time ran out and a fresh part
 * has been started to carry on where it stopped — it reads again what is
 * still missing, so nothing is bought twice.
 */
async function research(ctx: ActionCtx, runId: Id<"agentRuns">, workflowExecutionId: Id<"workflowExecutions"> | undefined, carrying: Carrying): Promise<string | null> {
  const work = await ctx.runQuery(internal.keywordResearchRun.readWork, { runId });
  const toBuy = work.overviews.length + work.countries.length + work.serps.length + work.details.length + work.ideas.length + work.answers.length;
  if (toBuy === 0) {
    const settled = await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId });
    if (carrying.part > 0) return await summaryOf(ctx, runId, settled, carrying.calls, work.sandbox, null);
    return `Nothing to buy: what the ${work.lookups.length === 1 ? "lookup" : `${work.lookups.length} lookups`} needed was already held.`;
  }

  let credentials: DataForSeoCredentials;
  try {
    credentials = readDataForSeoCredentials();
  } catch (error) {
    await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId, problem: "NOT_CONNECTED" });
    return `Nothing was bought. DataForSEO is not connected: ${getErrorMessage(error)}`;
  }
  const keywords = (count: number) => `${count} ${count === 1 ? "keyword" : "keywords"}`;
  const said = [
    work.overviews.length > 0 ? `${work.overviews.length} ${work.overviews.length === 1 ? "overview" : "overviews"}` : null,
    work.countries.length > 0 ? `${keywords(work.countries.length)} in another country` : null,
    work.serps.length > 0 ? `Google's results for ${keywords(work.serps.length)}` : null,
    work.details.length > 0 ? `the top ten in full for ${keywords(work.details.length)}` : null,
    work.ideas.length > 0 ? `ideas for ${keywords(work.ideas.length)}` : null,
    work.answers.length > 0 ? `what the AI says about ${keywords(work.answers.length)}` : null,
  ].filter(Boolean).join(", ");
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `${carrying.part > 0 ? "Carrying on. " : ""}${credentials.sandbox ? "The platform is on DataForSEO's free sandbox: sample figures." : "Buying from DataForSEO."} To buy: ${said}.`,
  });

  const lookupsByPlace = new Map<string, Id<"keywordLookups">[]>();
  for (const row of work.lookups) {
    const key = keyOf(row);
    lookupsByPlace.set(key, [...(lookupsByPlace.get(key) ?? []), row.lookupId]);
  }
  const buyer: Buyer = {
    ctx, runId, companyId: work.companyId, credentials, maxCostUsd: work.maxCostUsd, lookupsByPlace,
    calls: carrying.calls,
    deadline: Date.now() + RUN_PART_MS,
  };
  let stopped: { problem: ResearchProblem; said: string } | null = null;
  try {
    await buyOverviews(buyer, work.overviews, true);
    await buyOverviews(buyer, work.countries, false);
    await eachPlace(buyer, work.serps, (place) => buyResults(buyer, place));
    await eachPlace(buyer, work.details, (place) => buyDetails(buyer, place, work.ideasPerKind));
    await eachPlace(buyer, work.ideas, (place) => buyIdeas(buyer, place, work.ideasPerKind));
    for (const place of work.answers) {
      if (Date.now() > buyer.deadline) throw new TimeToCarryOn();
      await buyAnswers(buyer, place, work.overviewSearches);
    }
  } catch (error) {
    if (error instanceof TimeToCarryOn && carrying.part + 1 < MOST_PARTS) {
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId,
        ...(work.companyId ? { companyId: work.companyId } : {}),
        heading: "Carrying on",
        detail: "This part of the run used its time. A fresh part carries on with what is still to buy.",
        failed: false,
      });
      await ctx.scheduler.runAfter(0, internal.keywordResearchRun.runKeywordResearchNow, {
        runId,
        ...(workflowExecutionId ? { workflowExecutionId } : {}),
        part: carrying.part + 1,
        calls: buyer.calls,
      });
      return null;
    }
    if (error instanceof TimeToCarryOn) stopped = { problem: "TOO_LONG", said: "This lookup took too long to buy in one go." };
    else if (error instanceof SpendLimitReached) stopped = { problem: "SPEND_LIMIT", said: "This run reached the Keyword research agent's spend limit." };
    else throw error;
  }

  const settled = await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId, ...(stopped ? { problem: stopped.problem } : {}) });
  return await summaryOf(ctx, runId, settled, buyer.calls, credentials.sandbox, stopped?.said ?? null);
}

async function summaryOf(ctx: ActionCtx, runId: Id<"agentRuns">, settled: { ready: number; failed: number }, calls: number, sandbox: boolean, stopped: string | null): Promise<string> {
  const spent = await ctx.runQuery(internal.roleRuns.readRunCost, { runId });
  return `${sandbox ? "From DataForSEO's sandbox: " : ""}${settled.ready} ready`
    + `${settled.failed > 0 ? `, ${settled.failed} failed` : ""}, from ${calls} ${calls === 1 ? "call" : "calls"} costing $${spent.toFixed(2)}.`
    + `${stopped ? ` ${stopped}` : ""}`;
}

/**
 * Started by Look up, a part of a lookup being opened, or the agent's Run:
 * buy what its jobs wait for, once — in parts, each well inside Convex's ten
 * minutes, when there is more than one part can buy.
 */
export const runKeywordResearchNow = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    /** Which part of the run this is: 0 when it starts, one more each time it carries on. */
    part: v.optional(v.number()),
    /** Calls sent by the parts before. */
    calls: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const summary = await research(ctx, args.runId, args.workflowExecutionId, { part: args.part ?? 0, calls: args.calls ?? 0 });
      if (summary !== null) {
        await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "SUCCESS", summary });
      }
    } catch (error: unknown) {
      const summary = failureSummary(error);
      await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId: args.runId, problem: "STOPPED" });
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "FAILED", summary });
    }
    return null;
  },
});
