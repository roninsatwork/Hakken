import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { SEO_KEYWORD_CHECK_OPERATION, seoSiteOperations } from "./dataForSeoRegistry";
import { aiCitationOperationId, aiEngineValidator, type AiEngine } from "./seoAiEngines";
import { resolveWebsiteSchedule, type ResolvedWebsiteSchedule } from "./seoScheduleService";
import { SEO_COMPETITORS_PER_WEBSITE } from "./seoCollectionPolicy";
import { appError } from "./utils/appError";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import {
  QUESTION_ATTENTION,
  RIVAL_ATTENTION,
  SEARCH_ATTENTION,
  daysBetween,
  pullsPerMonth,
  questionVerdict,
  rivalVerdict,
  searchVerdict,
  type QuestionVerdict,
  type RivalVerdict,
  type SearchVerdict,
} from "./utils/trackingVerdicts";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * A company's view of one of its websites: what it tracks, what that is
 * producing, and what it costs.
 *
 * The screens this feeds judge every row — slipping, never landed, ahead of
 * you — and print what each one costs to keep. Both are worked out here, on
 * the server, from the summaries `websiteTrackingStats.ts` keeps as results are
 * filed; the browser gets finished rows, already sorted by what needs
 * attention and already cut to one page.
 *
 * **Every read is by index and bounded.** A search's standing is one point
 * lookup, a question's is one per engine, a list is one range read, and a
 * rival is compared on at most `COMPARED_SEARCHES` of the site's searches. The
 * header is a separate, cheaper query than any tab, because every tab draws
 * it.
 *
 * Read through the company's own hold, like every tenant read here: the lists
 * and summaries are the host's and shared by design, and which rivals it is
 * compared with is this company's own choice.
 */

/** A host's list at its ceiling, from `websiteCanonical.ts`. */
const MAX_LIST = 1_000;

/** A site's searches a rival is compared on. Enough to rank it; bounded so a big list stays one query. */
const COMPARED_SEARCHES = 100;

/** Rivals compared in full on one read. More than this against one site is a plan conversation. */
const MAX_RIVALS = 25;

/** Rivals nobody tracks, suggested from the answers. */
const MAX_UNTRACKED = 10;

// ---------------------------------------------------------------------------
// The site, and what it costs to keep
// ---------------------------------------------------------------------------

type Site = {
  hold: Doc<"companyWebsites">;
  website: Doc<"websites">;
  company: Doc<"companies"> | null;
  pair: Doc<"companyWebsites"> | null;
  pairHost: string | null;
  /** The place this site is watched from: its own, or its pair's. */
  place: number;
  schedule: ResolvedWebsiteSchedule;
  /** Collections a month at the effective cadence; zero when nothing is collected. */
  perMonth: number;
  today: string;
};

async function loadSite(ctx: QueryCtx, companyWebsiteId: Id<"companyWebsites">): Promise<Site | null> {
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold) return null;
  const [website, company, pair, schedule] = await Promise.all([
    ctx.db.get(hold.websiteId),
    ctx.db.get(hold.companyId),
    pairedOwnedHold(ctx, hold),
    ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", hold.companyId))
      .first(),
  ]);
  if (!website) return null;

  const pairSite = pair ? await ctx.db.get(pair.websiteId) : null;
  const effective = resolveWebsiteSchedule(schedule, pair ?? hold);
  return {
    hold,
    website,
    company,
    pair,
    pairHost: pairSite?.displayHost ?? null,
    place: (pair ?? hold).locationCode ?? DEFAULT_LOCATION_CODE,
    schedule: effective,
    perMonth: effective.active ? pullsPerMonth(effective.intervalStr) ?? 0 : 0,
    today: new Date().toISOString().slice(0, 10),
  };
}

async function requireSite(ctx: QueryCtx, companyWebsiteId: Id<"companyWebsites">): Promise<Site> {
  const site = await loadSite(ctx, companyWebsiteId);
  if (!site) throw appError("NOT_FOUND", "That website is no longer held by this company.");
  return site;
}

/**
 * What each operation has cost on average, as charged.
 *
 * An operation nobody has bought yet is absent, and every price built on it
 * is null — the screen says "not known until the first pull" rather than
 * inventing a number.
 */
async function unitCosts(ctx: QueryCtx, operationIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await Promise.all([...new Set(operationIds)].map((operationId) =>
    ctx.db
      .query("seoOperationCosts")
      .withIndex("by_operation", (q) => q.eq("operationId", operationId))
      .unique()));
  const costs = new Map<string, number>();
  for (const row of rows) {
    if (row && row.charged > 0) costs.set(row.operationId, row.totalUsd / row.charged);
  }
  return costs;
}

/** A price a month, or null when any part of it has never been charged. */
function monthly(units: ReadonlyArray<number | undefined>, perMonth: number): number | null {
  if (perMonth === 0) return 0;
  let total = 0;
  for (const unit of units) {
    if (unit === undefined) return null;
    total += unit;
  }
  return total * perMonth;
}

const SITE_OPERATION_IDS = seoSiteOperations().map((operation) => operation.id);

function siteUnits(costs: Map<string, number>): Array<number | undefined> {
  return SITE_OPERATION_IDS.map((operationId) => costs.get(operationId));
}

function engineUnits(costs: Map<string, number>, engines: readonly AiEngine[]): Array<number | undefined> {
  return engines.map((engine) => costs.get(aiCitationOperationId(engine)));
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type SearchRow = {
  _id: Id<"websiteKeywords">;
  keyword: string;
  isActive: boolean;
  verdict: SearchVerdict;
  lastPosition: number | null;
  previousPosition: number | null;
  bestPosition: number | null;
  firstCheckedDay: string | null;
  lastCheckedDay: string | null;
  monthlyUsd: number | null;
};

async function loadSearchRows(ctx: QueryCtx, site: Site, costs: Map<string, number>): Promise<SearchRow[]> {
  const searches = await ctx.db
    .query("websiteKeywords")
    .withIndex("by_website", (q) => q.eq("websiteId", site.website._id))
    .take(MAX_LIST);
  const unit = costs.get(SEO_KEYWORD_CHECK_OPERATION);

  return await Promise.all(searches.map(async (search) => {
    const stats = await ctx.db
      .query("websiteSearchStats")
      .withIndex("by_key", (q) =>
        q.eq("websiteId", site.website._id).eq("keyword", search.keyword).eq("locationCode", site.place))
      .unique();
    return {
      _id: search._id,
      keyword: search.keyword,
      isActive: search.isActive,
      verdict: searchVerdict(stats, site.today),
      lastPosition: stats?.lastPosition ?? null,
      previousPosition: stats?.previousPosition ?? null,
      bestPosition: stats?.bestPosition ?? null,
      firstCheckedDay: stats?.firstCheckedDay ?? null,
      lastCheckedDay: stats?.lastCheckedDay ?? null,
      // A paused search is not asked, so it costs nothing to keep.
      monthlyUsd: search.isActive ? monthly([unit], site.perMonth) : 0,
    };
  }));
}

type QuestionRow = {
  _id: Id<"websiteQuestions">;
  prompt: string;
  isActive: boolean;
  engines: AiEngine[];
  asked: number;
  named: number;
  recommended: number;
  warnedAgainst: number;
  firstAskedDay: string | null;
  verdict: QuestionVerdict;
  monthlyUsd: number | null;
  /** Who else these answers named, merged across the engines. Not returned to screens. */
  others: Map<Id<"websites">, { times: number; lastDay: string }>;
};

async function loadQuestionRows(ctx: QueryCtx, site: Site, costs: Map<string, number>): Promise<QuestionRow[]> {
  const questions = await ctx.db
    .query("websiteQuestions")
    .withIndex("by_website", (q) => q.eq("websiteId", site.website._id))
    .take(MAX_LIST);

  return await Promise.all(questions.map(async (question) => {
    const perEngine = await Promise.all(question.engines.map((engine) =>
      ctx.db
        .query("websiteQuestionStats")
        .withIndex("by_key", (q) =>
          q.eq("websiteId", site.website._id).eq("prompt", question.prompt).eq("engine", engine).eq("locationCode", site.place))
        .unique()));

    let asked = 0;
    let named = 0;
    let recommended = 0;
    let warnedAgainst = 0;
    let firstAskedDay: string | null = null;
    const others = new Map<Id<"websites">, { times: number; lastDay: string }>();
    for (const stats of perEngine) {
      if (!stats) continue;
      asked += stats.asked;
      named += stats.named;
      recommended += stats.recommended;
      warnedAgainst += stats.warnedAgainst;
      if (!firstAskedDay || stats.firstAskedDay < firstAskedDay) firstAskedDay = stats.firstAskedDay;
      for (const other of stats.othersNamed) {
        const held = others.get(other.websiteId);
        others.set(other.websiteId, {
          times: (held?.times ?? 0) + other.times,
          lastDay: held && held.lastDay > other.lastDay ? held.lastDay : other.lastDay,
        });
      }
    }

    return {
      _id: question._id,
      prompt: question.prompt,
      isActive: question.isActive,
      engines: question.engines,
      asked,
      named,
      recommended,
      warnedAgainst,
      firstAskedDay,
      verdict: questionVerdict(
        firstAskedDay ? { asked, named, warnedAgainst, firstAskedDay } : null,
        site.today,
      ),
      monthlyUsd: question.isActive ? monthly(engineUnits(costs, question.engines), site.perMonth) : 0,
      others,
    };
  }));
}

type RivalRow = {
  companyWebsiteId: Id<"companyWebsites">;
  websiteId: Id<"websites">;
  displayHost: string;
  trackedSinceDay: string;
  beatsYouOn: number;
  youBeatOn: number;
  comparedOn: number;
  namedInAnswers: number;
  answersCounted: number;
  lastSeenDay: string | null;
  verdict: RivalVerdict;
  monthlyUsd: number | null;
};

/** The company's own tracked sites paired with this one. Never the shared graph. */
async function loadRivalHolds(ctx: QueryCtx, site: Site) {
  return (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) =>
      q.eq("companyId", site.hold.companyId).eq("againstWebsiteId", site.website._id))
    .take(SEO_COMPETITORS_PER_WEBSITE))
    .filter(isTrackedHold);
}

async function loadRivalRows(
  ctx: QueryCtx,
  site: Site,
  searches: readonly SearchRow[],
  questions: readonly QuestionRow[],
  costs: Map<string, number>,
): Promise<RivalRow[]> {
  const holds = (await loadRivalHolds(ctx, site)).slice(0, MAX_RIVALS);
  // Compared on searches this site has actually been checked for, from its place.
  const compared = searches.filter((row) => row.isActive && row.lastCheckedDay).slice(0, COMPARED_SEARCHES);
  const answersCounted = questions.reduce((sum, row) => sum + (row.isActive ? row.asked : 0), 0);

  return await Promise.all(holds.map(async (hold) => {
    const website = await ctx.db.get(hold.websiteId);
    let beatsYouOn = 0;
    let youBeatOn = 0;
    let lastSeenDay: string | null = null;

    const theirs = await Promise.all(compared.map((row) =>
      ctx.db
        .query("websiteSearchStats")
        .withIndex("by_key", (q) =>
          q.eq("websiteId", hold.websiteId).eq("keyword", row.keyword).eq("locationCode", site.place))
        .unique()));
    compared.forEach((row, index) => {
      const their = theirs[index];
      const them = their?.lastPosition;
      const us = row.lastPosition ?? undefined;
      if (them !== undefined && (us === undefined || them < us)) beatsYouOn += 1;
      if (us !== undefined && (them === undefined || us < them)) youBeatOn += 1;
      if (their && them !== undefined && (!lastSeenDay || their.lastCheckedDay > lastSeenDay)) {
        lastSeenDay = their.lastCheckedDay;
      }
    });

    let namedInAnswers = 0;
    for (const question of questions) {
      const seen = question.others.get(hold.websiteId);
      if (!seen) continue;
      namedInAnswers += seen.times;
      if (!lastSeenDay || seen.lastDay > lastSeenDay) lastSeenDay = seen.lastDay;
    }

    const trackedSinceDay = new Date(hold.createdAt).toISOString().slice(0, 10);
    return {
      companyWebsiteId: hold._id,
      websiteId: hold.websiteId,
      displayHost: website?.displayHost ?? "",
      trackedSinceDay,
      beatsYouOn,
      youBeatOn,
      comparedOn: compared.length,
      namedInAnswers,
      answersCounted,
      lastSeenDay,
      verdict: rivalVerdict({ beatsYouOn, youBeatOn, lastSeenDay, trackedSinceDay }, site.today),
      monthlyUsd: monthly(siteUnits(costs), site.perMonth),
    };
  }));
}

function sumMonthly(values: ReadonlyArray<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

function allOperationIds(questions: ReadonlyArray<{ engines: readonly AiEngine[] }>): string[] {
  return [
    SEO_KEYWORD_CHECK_OPERATION,
    ...SITE_OPERATION_IDS,
    ...questions.flatMap((question) => question.engines.map(aiCitationOperationId)),
  ];
}

// ---------------------------------------------------------------------------
// The header every tab draws
// ---------------------------------------------------------------------------

const moneyOrNull = v.union(v.number(), v.null());

const headerShape = v.union(v.null(), v.object({
  companyWebsiteId: v.id("companyWebsites"),
  companyId: v.id("companies"),
  companyName: v.union(v.string(), v.null()),
  websiteId: v.id("websites"),
  displayHost: v.string(),
  relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
  pairedWith: v.union(v.null(), v.object({ companyWebsiteId: v.id("companyWebsites"), displayHost: v.string() })),
  placeLabel: v.string(),
  schedule: v.object({
    active: v.boolean(),
    intervalStr: v.union(v.string(), v.null()),
    nextRunAt: v.union(v.number(), v.null()),
    source: v.union(v.literal("WEBSITE"), v.literal("COMPANY"), v.literal("NONE"), v.literal("PAIR")),
  }),
  counts: v.object({ searches: v.number(), questions: v.number(), rivals: v.number(), brandNames: v.number() }),
  monthly: v.object({
    site: moneyOrNull,
    searches: moneyOrNull,
    questions: moneyOrNull,
    rivals: moneyOrNull,
    total: moneyOrNull,
  }),
  lastCollectedAt: v.union(v.number(), v.null()),
}));

/**
 * Everything the site's header says, and nothing it does not.
 *
 * Cheaper than any tab on purpose — every tab draws it: the lists are read for
 * their lengths and their engines, the costs table for prices, and no summary
 * is touched. A price is null while any operation in it has never been
 * charged.
 */
export const getSiteHeader = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: headerShape,
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.companyWebsiteId);
    if (!site) return null;
    const tracked = isTrackedHold(site.hold);

    const [searches, questions, rivals, lastLine] = await Promise.all([
      ctx.db.query("websiteKeywords").withIndex("by_website", (q) => q.eq("websiteId", site.website._id)).take(MAX_LIST),
      ctx.db.query("websiteQuestions").withIndex("by_website", (q) => q.eq("websiteId", site.website._id)).take(MAX_LIST),
      tracked ? Promise.resolve([]) : loadRivalHolds(ctx, site),
      ctx.db
        .query("seoCycleLines")
        .withIndex("by_company_website", (q) =>
          q.eq("companyId", site.hold.companyId).eq("websiteId", site.website._id))
        .order("desc")
        .first(),
    ]);
    const liveSearches = searches.filter((row) => row.isActive);
    const liveQuestions = questions.filter((row) => row.isActive);
    const costs = await unitCosts(ctx, allOperationIds(liveQuestions));

    const siteMonthly = monthly(siteUnits(costs), site.perMonth);
    const perSearch = monthly([costs.get(SEO_KEYWORD_CHECK_OPERATION)], site.perMonth);
    const searchesMonthly = liveSearches.length === 0 ? 0 : perSearch === null ? null : perSearch * liveSearches.length;
    const questionsMonthly = sumMonthly(liveQuestions.map((row) =>
      monthly(engineUnits(costs, row.engines), site.perMonth)));
    const perRival = monthly(siteUnits(costs), site.perMonth);
    const rivalsMonthly = rivals.length === 0 ? 0 : perRival === null ? null : perRival * rivals.length;

    const place = findSeoLocation(site.place);
    return {
      companyWebsiteId: site.hold._id,
      companyId: site.hold.companyId,
      companyName: site.company?.name ?? null,
      websiteId: site.website._id,
      displayHost: site.website.displayHost,
      relationship: tracked ? ("TRACKED" as const) : ("OWNED" as const),
      pairedWith: site.pair && site.pairHost
        ? { companyWebsiteId: site.pair._id, displayHost: site.pairHost }
        : null,
      placeLabel: place?.label ?? "United Kingdom",
      schedule: {
        active: site.schedule.active,
        intervalStr: site.schedule.intervalStr,
        nextRunAt: site.schedule.nextRunAt,
        source: site.pair ? ("PAIR" as const) : site.schedule.source,
      },
      counts: {
        searches: liveSearches.length,
        questions: liveQuestions.length,
        rivals: rivals.length,
        brandNames: site.website.brandNames?.length ?? 0,
      },
      monthly: {
        site: siteMonthly,
        searches: searchesMonthly,
        questions: questionsMonthly,
        rivals: rivalsMonthly,
        // A tracked site is collected as a rival would be: its own pulls only.
        total: tracked
          ? siteMonthly
          : sumMonthly([siteMonthly, searchesMonthly, questionsMonthly, rivalsMonthly]),
      },
      lastCollectedAt: lastLine?.createdAt ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// The Brief's portfolio cards
// ---------------------------------------------------------------------------

/**
 * How each list is doing, counted by verdict.
 *
 * The portfolio summary under the Brief. It needs every row's verdict, so it
 * reads the summaries — which is why it is its own query rather than part of
 * the header every tab draws.
 */
export const getSitePortfolio = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    searches: v.record(v.string(), v.number()),
    questions: v.record(v.string(), v.number()),
    rivals: v.record(v.string(), v.number()),
    untrackedNamed: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    const noCosts = new Map<string, number>();
    const searches = (await loadSearchRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const questions = (await loadQuestionRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const rivals = isTrackedHold(site.hold) ? [] : await loadRivalRows(ctx, site, searches, questions, noCosts);

    const tally = <T extends string>(verdicts: readonly T[]) => {
      const counts: Record<string, number> = {};
      for (const verdict of verdicts) counts[verdict] = (counts[verdict] ?? 0) + 1;
      return counts;
    };
    const untracked = await untrackedNamed(ctx, site, questions);

    return {
      searches: tally(searches.map((row) => row.verdict)),
      questions: tally(questions.map((row) => row.verdict)),
      rivals: tally(rivals.map((row) => row.verdict)),
      untrackedNamed: untracked.length,
    };
  },
});

/** Sites the answers keep naming that this company does not hold, most-named first. */
async function untrackedNamed(ctx: QueryCtx, site: Site, questions: readonly QuestionRow[]) {
  const tally = new Map<Id<"websites">, { times: number; lastDay: string }>();
  for (const question of questions) {
    for (const [websiteId, seen] of question.others) {
      const held = tally.get(websiteId);
      tally.set(websiteId, {
        times: (held?.times ?? 0) + seen.times,
        lastDay: held && held.lastDay > seen.lastDay ? held.lastDay : seen.lastDay,
      });
    }
  }
  const ranked = [...tally.entries()].sort((left, right) => right[1].times - left[1].times);

  const found: Array<{ websiteId: Id<"websites">; displayHost: string; times: number; lastDay: string }> = [];
  for (const [websiteId, seen] of ranked) {
    if (found.length >= MAX_UNTRACKED) break;
    const held = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) => q.eq("companyId", site.hold.companyId).eq("websiteId", websiteId))
      .first();
    if (held) continue;
    const website = await ctx.db.get(websiteId);
    if (website) found.push({ websiteId, displayHost: website.displayHost, times: seen.times, lastDay: seen.lastDay });
  }
  return found;
}

// ---------------------------------------------------------------------------
// The Tracking lists
// ---------------------------------------------------------------------------

const listArgs = {
  companyWebsiteId: v.id("companyWebsites"),
  searchTerm: v.optional(v.string()),
  page: v.number(),
  pageSize: v.number(),
};

const searchVerdictValidator = v.union(
  v.literal("NOT_CHECKED"), v.literal("TOO_NEW"), v.literal("TOP_THREE"), v.literal("PAGE_ONE"),
  v.literal("SLIPPING"), v.literal("RANKING"), v.literal("NOT_FOUND"), v.literal("NEVER_RANKED"),
);

/**
 * The searches on this site's record, judged from this company's place.
 *
 * Sorted by what needs attention — slipping first — then paged, all here; the
 * browser gets fifteen finished rows. The intent beside each is the platform's
 * one judgment per phrase, looked up for the rows on this page only.
 */
export const listTrackedSearches = superAdminQuery({
  args: listArgs,
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteKeywords"),
      keyword: v.string(),
      isActive: v.boolean(),
      verdict: searchVerdictValidator,
      lastPosition: v.union(v.number(), v.null()),
      previousPosition: v.union(v.number(), v.null()),
      bestPosition: v.union(v.number(), v.null()),
      firstCheckedDay: v.union(v.string(), v.null()),
      lastCheckedDay: v.union(v.string(), v.null()),
      weeksRunning: v.union(v.number(), v.null()),
      intent: v.union(v.string(), v.null()),
      monthlyUsd: moneyOrNull,
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    const costs = await unitCosts(ctx, [SEO_KEYWORD_CHECK_OPERATION]);
    const rows = await loadSearchRows(ctx, site, costs);

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = (term ? rows.filter((row) => includesSearchTerm(row.keyword, term)) : rows)
      .sort((left, right) =>
        Number(right.isActive) - Number(left.isActive)
        || SEARCH_ATTENTION[left.verdict] - SEARCH_ATTENTION[right.verdict]
        || left.keyword.localeCompare(right.keyword));

    const paged = paginateItems(matching, args.page, args.pageSize);
    const data = await Promise.all(paged.data.map(async (row) => {
      const intent = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
        .unique();
      return {
        ...row,
        weeksRunning: row.firstCheckedDay ? Math.floor(daysBetween(row.firstCheckedDay, site.today) / 7) : null,
        intent: intent?.intent ?? null,
      };
    }));
    return { ...paged, data };
  },
});

const questionVerdictValidator = v.union(
  v.literal("NOT_ASKED"), v.literal("TOO_NEW"), v.literal("WARNED"),
  v.literal("NEVER_LANDED"), v.literal("THIN"), v.literal("EARNING"),
);

/** The questions on this site's record, judged across the engines each is put to. */
export const listTrackedQuestions = superAdminQuery({
  args: listArgs,
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteQuestions"),
      prompt: v.string(),
      isActive: v.boolean(),
      engines: v.array(aiEngineValidator),
      asked: v.number(),
      named: v.number(),
      recommended: v.number(),
      warnedAgainst: v.number(),
      weeksRunning: v.union(v.number(), v.null()),
      verdict: questionVerdictValidator,
      monthlyUsd: moneyOrNull,
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    const questionsForCost = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", site.website._id))
      .take(MAX_LIST);
    const costs = await unitCosts(ctx, allOperationIds(questionsForCost));
    const rows = await loadQuestionRows(ctx, site, costs);

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = (term ? rows.filter((row) => includesSearchTerm(row.prompt, term)) : rows)
      .sort((left, right) =>
        Number(right.isActive) - Number(left.isActive)
        || QUESTION_ATTENTION[left.verdict] - QUESTION_ATTENTION[right.verdict]
        || left.prompt.localeCompare(right.prompt));

    const paged = paginateItems(matching, args.page, args.pageSize);
    return {
      ...paged,
      data: paged.data.map(({ others: _others, firstAskedDay, ...row }) => ({
        ...row,
        weeksRunning: firstAskedDay ? Math.floor(daysBetween(firstAskedDay, site.today) / 7) : null,
      })),
    };
  },
});

const rivalVerdictValidator = v.union(
  v.literal("TOO_NEW"), v.literal("AHEAD"), v.literal("LEVEL"),
  v.literal("BEHIND"), v.literal("GONE_QUIET"), v.literal("NOT_CHECKED"),
);

/**
 * The rivals this company watches against this site, and the ones the answers
 * keep naming that it does not.
 *
 * "Beats you on" compares the two on this site's own searches, on the same
 * page from the same place — the only comparison that means anything, and
 * why a rival is collected on its pair's day.
 */
export const listTrackedCompetitors = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    rivals: v.array(v.object({
      companyWebsiteId: v.id("companyWebsites"),
      websiteId: v.id("websites"),
      displayHost: v.string(),
      trackedSinceDay: v.string(),
      beatsYouOn: v.number(),
      youBeatOn: v.number(),
      comparedOn: v.number(),
      namedInAnswers: v.number(),
      answersCounted: v.number(),
      lastSeenDay: v.union(v.string(), v.null()),
      verdict: rivalVerdictValidator,
      monthlyUsd: moneyOrNull,
    })),
    untrackedNamed: v.array(v.object({
      websiteId: v.id("websites"),
      displayHost: v.string(),
      times: v.number(),
      lastDay: v.string(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    if (isTrackedHold(site.hold)) return { rivals: [], untrackedNamed: [] };

    const costs = await unitCosts(ctx, SITE_OPERATION_IDS);
    const noCosts = new Map<string, number>();
    const searches = await loadSearchRows(ctx, site, noCosts);
    const questions = (await loadQuestionRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const rivals = (await loadRivalRows(ctx, site, searches, questions, costs))
      .sort((left, right) =>
        RIVAL_ATTENTION[left.verdict] - RIVAL_ATTENTION[right.verdict]
        || right.beatsYouOn - left.beatsYouOn
        || left.displayHost.localeCompare(right.displayHost));

    return { rivals, untrackedNamed: await untrackedNamed(ctx, site, questions) };
  },
});
