import { SEO_KEYWORD_CHECK_OPERATION, seoSiteOperations } from "./dataForSeoRegistry";
import { aiCitationOperationId, answerPlace, type AiEngine } from "./seoAiEngines";
import { resolveWebsiteSchedule, type ResolvedWebsiteSchedule } from "./seoScheduleService";
import { SEO_COMPETITORS_PER_WEBSITE } from "./seoCollectionPolicy";
import { appError } from "./utils/appError";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import {
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
 * One of a company's websites, as rows: its searches, its questions and its
 * rivals, each judged, and what each costs to keep.
 *
 * Shared by the screens that show them (`websiteClientView.ts`) and the moves
 * that are drawn from them (`websiteMoves.ts`), so a move says exactly what the
 * row it points at says — a "never landed" move and a "never landed" row cannot
 * disagree about what never landing means.
 *
 * **Every read is by index and bounded.** A search's standing is one point
 * lookup, a question's is one per engine, a list is one range read, and a
 * rival is compared on at most `COMPARED_SEARCHES` of the site's searches.
 * The reads take a query context, so a mutation deriving moves can use them
 * as they are.
 */

/** A host's list at its ceiling, from `websiteCanonical.ts`. */
export const MAX_LIST = 1_000;

/** A site's searches a rival is compared on. Enough to rank it; bounded so a big list stays one query. */
const COMPARED_SEARCHES = 100;

/** Rivals compared in full on one read. More than this against one site is a plan conversation. */
const MAX_RIVALS = 25;

/** Rivals nobody tracks, suggested from the answers. */
const MAX_UNTRACKED = 10;

type Reader = { db: QueryCtx["db"] };

// ---------------------------------------------------------------------------
// The site, and what it costs to keep
// ---------------------------------------------------------------------------

export type Site = {
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

export async function loadSite(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<Site | null> {
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

export async function requireSite(ctx: Reader, companyWebsiteId: Id<"companyWebsites">): Promise<Site> {
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
export async function unitCosts(ctx: Reader, operationIds: readonly string[]): Promise<Map<string, number>> {
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
export function monthly(units: ReadonlyArray<number | undefined>, perMonth: number): number | null {
  if (perMonth === 0) return 0;
  let total = 0;
  for (const unit of units) {
    if (unit === undefined) return null;
    total += unit;
  }
  return total * perMonth;
}

export const SITE_OPERATION_IDS = seoSiteOperations().map((operation) => operation.id);

/**
 * Each whole-site call's price, as a share of one collection: a call bought
 * every collection counts whole, and a weekly or monthly list only as often
 * as it is bought in a month of this cadence (docs/plans/active/
 * user-sites-plan.md, "Collecting more").
 */
export function siteUnits(costs: Map<string, number>, perMonth: number): Array<number | undefined> {
  return seoSiteOperations().map((operation) => {
    const unit = costs.get(operation.id);
    if (unit === undefined || !operation.refresh || perMonth <= 0) return unit;
    return unit * Math.min(1, 30 / operation.refresh.everyDays / perMonth);
  });
}

export function engineUnits(costs: Map<string, number>, engines: readonly AiEngine[]): Array<number | undefined> {
  return engines.map((engine) => costs.get(aiCitationOperationId(engine)));
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type SearchRow = {
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

export async function loadSearchRows(ctx: Reader, site: Site, costs: Map<string, number>): Promise<SearchRow[]> {
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

export type QuestionRow = {
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

export async function loadQuestionRows(ctx: Reader, site: Site, costs: Map<string, number>): Promise<QuestionRow[]> {
  const questions = await ctx.db
    .query("websiteQuestions")
    .withIndex("by_website", (q) => q.eq("websiteId", site.website._id))
    .take(MAX_LIST);

  return await Promise.all(questions.map(async (question) => {
    // Each engine's answers from where they are filed: an engine that takes no
    // location answers once for every place, under the default.
    const perEngine = await Promise.all(question.engines.map((engine) =>
      ctx.db
        .query("websiteQuestionStats")
        .withIndex("by_key", (q) =>
          q.eq("websiteId", site.website._id).eq("prompt", question.prompt).eq("engine", engine)
            .eq("locationCode", answerPlace(engine, site.place)))
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

export type RivalRow = {
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
export async function loadRivalHolds(ctx: Reader, site: Site) {
  return (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) =>
      q.eq("companyId", site.hold.companyId).eq("againstWebsiteId", site.website._id))
    .take(SEO_COMPETITORS_PER_WEBSITE))
    .filter(isTrackedHold);
}

export async function loadRivalRows(
  ctx: Reader,
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
      monthlyUsd: monthly(siteUnits(costs, site.perMonth), site.perMonth),
    };
  }));
}

export function sumMonthly(values: ReadonlyArray<number | null>): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

export function allOperationIds(questions: ReadonlyArray<{ engines: readonly AiEngine[] }>): string[] {
  return [
    SEO_KEYWORD_CHECK_OPERATION,
    ...SITE_OPERATION_IDS,
    ...questions.flatMap((question) => question.engines.map(aiCitationOperationId)),
  ];
}

/** Sites the answers keep naming that this company does not hold, most-named first. */
export async function untrackedNamed(ctx: Reader, site: Site, questions: readonly QuestionRow[]) {
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
