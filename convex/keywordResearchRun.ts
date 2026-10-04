import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
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
import { buysFromSandbox, freshnessOf, newestSerp, overviewIsFresh, researchAgent, serpIsFresh, type Freshness } from "./keywordResearchData";
import { findResearchCountry } from "./utils/researchCountries";
import { AI_ENGINES, AI_ENGINE_CALLS, type AiEngine } from "./seoAiEngines";
import { seoAiCitationParams } from "./dataForSeoRegistry";
import { parseLlmResponse } from "./dataForSeoParsers";
import { findBrandMentions, type BrandName } from "./utils/websiteBrands";
import { aiOverviewFanOutParams } from "./dataForSeoAiOverviewOperations";
import { parseAiOverviewFanOuts } from "./aiOverviewFanOuts";
import { hostOf } from "./keywordResearchCalls";
import { getErrorMessage } from "./utils/lang";

/**
 * The Keyword research agent's job (docs/plans/active/keyword-research-plan.md):
 * what an agent holding the role `KEYWORD_RESEARCH` does when Look up, or a
 * part of a lookup being opened, starts it. It buys what the run's lookups
 * wait for and nothing else, files it, and says what it did:
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
 *   by the agent's own model in Live, a plain sentence in Test — asked of
 *   four assistants at once, and Google's AI Overview searches.
 *
 * Every call is a live one, so the person waiting sees the answer in seconds;
 * each is written as a line on this run with its cost, and to the company's
 * DataForSEO spend (`seoDataPulls`), so Cost to serve counts it. Its Mode,
 * on its Settings, is Test — DataForSEO's free sandbox — until it is
 * switched to Live. It stops at its own spend limit for a run, if it has
 * one, and says which lookups it left.
 */

const placeValidator = v.object({ keyword: v.string(), locationCode: v.number() });
type Place = { keyword: string; locationCode: number };
const keyOf = (place: Place) => `${place.locationCode}\u0000${place.keyword}`;

/** Whether both kinds of idea bought by the ideas call are held, fresh, and at least as many as the company asks for. */
async function ideasAreFresh(ctx: { db: Parameters<typeof newestSerp>[0]["db"] }, place: Place, fresh: Freshness, limit: number): Promise<boolean> {
  for (const kind of ["TERMS", "QUESTIONS"] as const) {
    const row = await ctx.db
      .query("researchIdeas")
      .withIndex("by_keyword_place_kind", (q) => q.eq("keyword", place.keyword).eq("locationCode", place.locationCode).eq("kind", kind))
      .order("desc")
      .first();
    if (!row || row.boughtAt < fresh.since || (!fresh.sandbox && row.sandbox) || row.limit < limit) return false;
  }
  return true;
}

async function answersAreFresh(ctx: { db: Parameters<typeof newestSerp>[0]["db"] }, place: Place, fresh: Freshness): Promise<boolean> {
  const row = await ctx.db
    .query("researchAnswers")
    .withIndex("by_keyword_place", (q) => q.eq("keyword", place.keyword).eq("locationCode", place.locationCode))
    .order("desc")
    .first();
  return Boolean(row && row.boughtAt >= fresh.since && (fresh.sandbox || !row.sandbox));
}

async function detailsAreFresh(ctx: { db: Parameters<typeof newestSerp>[0]["db"] }, place: Place, fresh: Freshness): Promise<boolean> {
  const serp = await newestSerp(ctx, place.keyword, place.locationCode);
  return Boolean(serp?.detailsBoughtAt && serp.detailsBoughtAt >= fresh.since && (fresh.sandbox || !serp.sandbox));
}

/** What a run's lookups wait for, read when it starts. */
export const readWork = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.object({
    companyId: v.union(v.id("companies"), v.null()),
    sandbox: v.boolean(),
    maxCostUsd: v.union(v.number(), v.null()),
    ideasPerKind: v.number(),
    overviews: v.array(placeValidator),
    serps: v.array(placeValidator),
    details: v.array(placeValidator),
    ideas: v.array(placeValidator),
    answers: v.array(placeValidator),
    overviewSearches: v.number(),
    lookups: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    const lookups = await ctx.db.query("keywordLookups").withIndex("by_run", (q) => q.eq("runId", args.runId)).take(500);
    const companyId = run?.companyId ?? lookups[0]?.companyId ?? null;
    const sandbox = buysFromSandbox(agent ?? (await researchAgent(ctx)));
    const limits = companyId ? await readFanOutLimits(ctx, companyId) : null;
    const fresh = freshnessOf(limits?.researchReuseDays ?? 30, sandbox);

    const overviews = new Map<string, Place>();
    const serps = new Map<string, Place>();
    const details = new Map<string, Place>();
    const ideas = new Map<string, Place>();
    const answers = new Map<string, Place>();
    const ideasPerKind = limits?.researchIdeasPerKind ?? 100;
    for (const lookup of lookups) {
      const home: Place = { keyword: lookup.keyword, locationCode: lookup.locationCode };
      // Look up again buys afresh, whatever is held.
      const again = lookup.again === true;
      if (lookup.overview === "WAITING") {
        if (!overviews.has(keyOf(home)) && (again || !(await overviewIsFresh(ctx, home.keyword, home.locationCode, fresh)))) overviews.set(keyOf(home), home);
        if (!serps.has(keyOf(home)) && (again || !(await serpIsFresh(ctx, home.keyword, home.locationCode, fresh)))) serps.set(keyOf(home), home);
      }
      for (const country of lookup.countries ?? []) {
        const place: Place = { keyword: lookup.keyword, locationCode: country.locationCode };
        if (country.state === "WAITING" && !overviews.has(keyOf(place)) && !(await overviewIsFresh(ctx, place.keyword, place.locationCode, fresh))) {
          overviews.set(keyOf(place), place);
        }
      }
      if (lookup.results === "WAITING" && !details.has(keyOf(home)) && (serps.has(keyOf(home)) || !(await detailsAreFresh(ctx, home, fresh)))) {
        details.set(keyOf(home), home);
      }
      if (lookup.ideas === "WAITING" && !ideas.has(keyOf(home)) && (again || !(await ideasAreFresh(ctx, home, fresh, ideasPerKind)))) {
        ideas.set(keyOf(home), home);
      }
      if (lookup.answers === "WAITING" && !answers.has(keyOf(home)) && (lookup.answersAgain === true || !(await answersAreFresh(ctx, home, fresh)))) {
        answers.set(keyOf(home), home);
      }
    }
    return {
      companyId,
      sandbox,
      maxCostUsd: agent?.maxCostUsd ?? null,
      ideasPerKind,
      overviews: [...overviews.values()],
      serps: [...serps.values()],
      details: [...details.values()],
      ideas: [...ideas.values()],
      answers: [...answers.values()],
      overviewSearches: limits?.researchOverviewSearches ?? 25,
      lookups: lookups.length,
    };
  },
});

/** The top ten's addresses of the newest Google's results held for a keyword. */
export const readTopUrls = internalQuery({
  args: placeValidator,
  returns: v.array(v.string()),
  handler: async (ctx, args) => ((await newestSerp(ctx, args.keyword, args.locationCode))?.results ?? []).slice(0, TOP_PAGES).map((result) => result.url),
});

/** The agent's own instructions and model, for writing the question behind a keyword. */
export const readQuestionSetup = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.null(), v.object({ instructions: v.string(), requestedModelId: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    if (!agent) return null;
    return {
      instructions: agent.systemPrompt ?? "",
      ...(agent.modelSelectionMode === "inherit" ? {} : { requestedModelId: agent.modelId }),
    };
  },
});

/** One call's cost and outcome: on this run, on the company's DataForSEO spend, and in the running mean by call. */
export const recordResearchCall = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.optional(v.id("companies")),
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
    if (serp) {
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
    }
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

/** Each of the run's lookups, settled: ready where what it waited for is now held, failed — saying why — where it is not. */
export const settleLookups = internalMutation({
  args: { runId: v.id("agentRuns"), problem: v.optional(v.string()) },
  returns: v.object({ ready: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const lookups = await ctx.db.query("keywordLookups").withIndex("by_run", (q) => q.eq("runId", args.runId)).take(500);
    let ready = 0;
    let failed = 0;
    const hasOverview = async (keyword: string, locationCode: number) =>
      Boolean(await ctx.db.query("researchKeywords").withIndex("by_keyword_place", (q) => q.eq("keyword", keyword).eq("locationCode", locationCode)).first());
    const problem = args.problem ?? "DataForSEO did not answer for this keyword. Look it up again.";
    for (const lookup of lookups) {
      const patch: Partial<Pick<Doc<"keywordLookups">, "overview" | "results" | "ideas" | "answers" | "countries" | "problem" | "again" | "answersAgain">> = {};
      if (lookup.again) patch.again = undefined;
      if (lookup.answersAgain) patch.answersAgain = undefined;
      const serp = await newestSerp(ctx, lookup.keyword, lookup.locationCode);
      const settle = (ok: boolean) => {
        if (ok) ready += 1;
        else {
          failed += 1;
          patch.problem = problem;
        }
        return ok ? ("READY" as const) : ("FAILED" as const);
      };
      if (lookup.overview === "WAITING") patch.overview = settle((await hasOverview(lookup.keyword, lookup.locationCode)) && Boolean(serp));
      if (lookup.results === "WAITING") patch.results = settle(Boolean(serp?.detailsBoughtAt));
      if (lookup.answers === "WAITING") {
        patch.answers = settle(Boolean(await ctx.db.query("researchAnswers").withIndex("by_keyword_place", (q) => q.eq("keyword", lookup.keyword).eq("locationCode", lookup.locationCode)).first()));
      }
      if (lookup.ideas === "WAITING") {
        const kinds = await Promise.all((["TERMS", "QUESTIONS"] as const).map(async (kind) => await ctx.db
          .query("researchIdeas")
          .withIndex("by_keyword_place_kind", (q) => q.eq("keyword", lookup.keyword).eq("locationCode", lookup.locationCode).eq("kind", kind))
          .first()));
        patch.ideas = settle(kinds.every(Boolean));
      }
      if (lookup.countries?.some((country) => country.state === "WAITING")) {
        patch.countries = await Promise.all(lookup.countries.map(async (country) =>
          country.state !== "WAITING" ? country : { ...country, state: settle(await hasOverview(lookup.keyword, country.locationCode)) }));
      }
      if (Object.keys(patch).length > 0) await ctx.db.patch(lookup._id, patch);
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
  calls: number;
};

class SpendLimitReached extends Error {}

/** One live call: refused before it is sent when the run's spend limit is reached, and written down whatever DataForSEO says. */
async function buy(buyer: Buyer, call: ResearchCall, task: Record<string, unknown>): Promise<unknown> {
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
    costUsd = outcome.costUsd;
    result = outcome.result ?? null;
    error = outcome.error;
  } catch (caught) {
    error = getErrorMessage(caught);
  }
  await buyer.ctx.runMutation(internal.keywordResearchRun.recordResearchCall, {
    runId: buyer.runId,
    ...(buyer.companyId ? { companyId: buyer.companyId } : {}),
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

/**
 * The sandbox answers every question with the same sample, about a keyword of
 * its own: in Test mode that sample stands in for each keyword asked, so the
 * screens can be tried end to end. Never in Live, where a keyword with no
 * answer has none.
 */
function sampleFor<T>(credentials: DataForSeoCredentials, answers: Map<string, T>): T | undefined {
  return credentials.sandbox ? answers.values().next().value : undefined;
}

const countryName = (code: number) => findResearchCountry(code)?.label ?? `place ${code}`;

async function buyOverviews(buyer: Buyer, places: Place[]) {
  const { ctx, runId, companyId, credentials } = buyer;
  const byPlace = new Map<number, string[]>();
  for (const { keyword, locationCode } of places) byPlace.set(locationCode, [...(byPlace.get(locationCode) ?? []), keyword]);
  for (const [locationCode, keywords] of byPlace) {
    for (let at = 0; at < keywords.length; at += OVERVIEW_KEYWORDS_PER_CALL) {
      const chunk = keywords.slice(at, at + OVERVIEW_KEYWORDS_PER_CALL);
      const overviews = readKeywordOverviews(await buy(buyer, RESEARCH_CALLS.overview, overviewTask(chunk, locationCode)));
      // The 24 months are a call of their own: the overview's are only 12.
      const histories = readSearchHistories(await buy(buyer, RESEARCH_CALLS.history, historyTask(chunk, locationCode)));
      const items = chunk.flatMap((keyword) => {
        const overview: KeywordOverview | undefined = overviews.get(keyword) ?? sampleFor(credentials, overviews);
        if (!overview) return [];
        const history = histories.get(keyword) ?? sampleFor(credentials, histories);
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

/** Google's top 100, then the top ten's visits and keywords in one call. */
async function buyResults(buyer: Buyer, place: Place) {
  const results = readGoogleResults(await buy(buyer, RESEARCH_CALLS.serp, serpTask(place.keyword, place.locationCode)));
  const top = results.slice(0, TOP_PAGES);
  const traffic = top.length > 0 ? readPageTraffic(await buy(buyer, RESEARCH_CALLS.traffic, trafficTask(top.map((result) => result.url), place.locationCode))) : new Map();
  const pages = top.map((result) => {
    const figures = traffic.get(pageKey(result.url));
    return { url: result.url, strength: null, linkingSites: null, visits: figures?.visits ?? null, keywords: figures?.keywords ?? null, topKeyword: null };
  });
  if (results.length > 0) {
    await buyer.ctx.runMutation(internal.keywordResearchRun.fileSerp, { ...place, sandbox: buyer.credentials.sandbox, results, pages });
  }
}

/** Google's results opened: each top-ten page's strength and linking websites, and what it ranks for. */
async function buyDetails(buyer: Buyer, place: Place, ideasLimit: number) {
  const urls = await buyer.ctx.runQuery(internal.keywordResearchRun.readTopUrls, place);
  if (urls.length === 0) return;
  const strength = readPageStrength(await buy(buyer, RESEARCH_CALLS.strength, strengthTask(urls)));
  const linking = readPageLinking(await buy(buyer, RESEARCH_CALLS.linking, strengthTask(urls)));
  // Enough of each page's keywords that the ten together make the company's number of ideas.
  const perPage = Math.max(1, Math.ceil(ideasLimit / urls.length));
  const ideas = new Map<string, IdeaRow>();
  const pages = [];
  for (const url of urls) {
    const ranked = readPageKeywords(await buy(buyer, RESEARCH_CALLS.pageKeywords, pageKeywordsTask(url, place.locationCode, perPage)));
    for (const row of ranked) if (row.keyword !== place.keyword && !ideas.has(row.keyword)) ideas.set(row.keyword, row);
    pages.push({
      url,
      strength: strength.get(pageKey(url)) ?? null,
      linkingSites: linking.get(pageKey(url)) ?? null,
      visits: null,
      keywords: null,
      topKeyword: ranked[0]?.keyword ?? null,
    });
  }
  const sorted = [...ideas.values()].sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1)).slice(0, ideasLimit);
  await buyer.ctx.runMutation(internal.keywordResearchRun.fileDetails, { ...place, sandbox: buyer.credentials.sandbox, pages, ideas: sorted, ideasLimit });
}

/** Ideas: terms match, then questions, as many of each as the company's limit. */
async function buyIdeas(buyer: Buyer, place: Place, limit: number) {
  const terms = readIdeas(await buy(buyer, RESEARCH_CALLS.terms, ideasTask(place.keyword, place.locationCode, limit, false)));
  const questions = readIdeas(await buy(buyer, RESEARCH_CALLS.questions, ideasTask(place.keyword, place.locationCode, limit, true)));
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
  const engines = await Promise.all(AI_ENGINES.map(async (engine: AiEngine) => {
    const call = { id: `research_ai_${engine}`, path: `/v3/ai_optimization/${AI_ENGINE_CALLS[engine].platform}/llm_responses/live`, family: "AI Optimization", name: engine };
    const result = await buy(buyer, call, seoAiCitationParams(engine, question, country ? { countryIso: country.iso } : null));
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
  }));
  const searches = overviewSearches > 0
    ? parseAiOverviewFanOuts(
        await buy(buyer, { id: "research_ai_overview_searches", path: "/v3/ai_optimization/llm_mentions/search/live", family: "AI Optimization", name: "Google's AI Overview searches" },
          aiOverviewFanOutParams(place.keyword, place.locationCode, overviewSearches)),
        overviewSearches,
      ).map((row) => ({ query: row.queryText, times: row.times }))
    : [];
  if (engines.some((engine) => engine.answered)) {
    await buyer.ctx.runMutation(internal.keywordResearchRun.fileAnswers, { ...place, sandbox: buyer.credentials.sandbox, question, engines, overviewSearches: searches });
  }
}

async function research(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const work = await ctx.runQuery(internal.keywordResearchRun.readWork, { runId });
  if (work.overviews.length === 0 && work.serps.length === 0 && work.details.length === 0 && work.ideas.length === 0 && work.answers.length === 0) {
    await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId });
    return `Nothing to buy: what the ${work.lookups === 1 ? "lookup" : `${work.lookups} lookups`} needed was already held.`;
  }

  let credentials: DataForSeoCredentials;
  try {
    credentials = { ...readDataForSeoCredentials(), ...(work.sandbox ? { sandbox: true } : {}) };
  } catch (error) {
    const problem = `DataForSEO is not connected: ${getErrorMessage(error)}`;
    await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId, problem });
    return `Nothing was bought. ${problem}`;
  }
  const said = [
    work.overviews.length > 0 ? `${work.overviews.length} ${work.overviews.length === 1 ? "overview" : "overviews"}` : null,
    work.serps.length > 0 ? `Google's results for ${work.serps.length} ${work.serps.length === 1 ? "keyword" : "keywords"}` : null,
    work.details.length > 0 ? `the top ten in full for ${work.details.length} ${work.details.length === 1 ? "keyword" : "keywords"}` : null,
    work.ideas.length > 0 ? `ideas for ${work.ideas.length} ${work.ideas.length === 1 ? "keyword" : "keywords"}` : null,
    work.answers.length > 0 ? `what the AI says about ${work.answers.length} ${work.answers.length === 1 ? "keyword" : "keywords"}` : null,
  ].filter(Boolean).join(", ");
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `${credentials.sandbox ? "Test mode: asking DataForSEO's free sandbox, sample figures." : "Live: buying from DataForSEO."} To buy: ${said}.`,
  });

  const buyer: Buyer = { ctx, runId, companyId: work.companyId, credentials, maxCostUsd: work.maxCostUsd, calls: 0 };
  let stopped: string | null = null;
  try {
    await buyOverviews(buyer, work.overviews);
    for (const place of work.serps) await buyResults(buyer, place);
    for (const place of work.details) await buyDetails(buyer, place, work.ideasPerKind);
    for (const place of work.ideas) await buyIdeas(buyer, place, work.ideasPerKind);
    for (const place of work.answers) await buyAnswers(buyer, place, work.overviewSearches);
  } catch (error) {
    if (!(error instanceof SpendLimitReached)) throw error;
    stopped = "This run reached the Keyword research agent's spend limit. Look it up again to buy the rest.";
  }

  const settled = await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId, ...(stopped ? { problem: stopped } : {}) });
  const spent = await ctx.runQuery(internal.roleRuns.readRunCost, { runId });
  return `${credentials.sandbox ? "Test mode, from DataForSEO's sandbox: " : ""}${settled.ready} ready`
    + `${settled.failed > 0 ? `, ${settled.failed} failed` : ""}, from ${buyer.calls} ${buyer.calls === 1 ? "call" : "calls"} costing $${spent.toFixed(2)}.`
    + `${stopped ? ` ${stopped}` : ""}`;
}

/** Started by Look up, a part of a lookup being opened, or the agent's Run: buy what its lookups wait for, once. */
export const runKeywordResearchNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const summary = await research(ctx, args.runId);
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "SUCCESS", summary });
    } catch (error: unknown) {
      const summary = failureSummary(error);
      await ctx.runMutation(internal.keywordResearchRun.settleLookups, { runId: args.runId, problem: `The lookup stopped: ${summary}` });
      await ctx.runMutation(internal.roleRuns.finishRoleRun, { runId: args.runId, workflowExecutionId: args.workflowExecutionId, status: "FAILED", summary });
    }
    return null;
  },
});
