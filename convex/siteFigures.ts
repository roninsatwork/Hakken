import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { answerPlace, type AiEngine } from "./seoAiEngines";
import { holdQuestions } from "./holdLists";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { bandCountsValidator, engineDayValidator, type EngineDay, intentSplitValidator } from "./utils/siteShapes";

/**
 * Reading a site's day summaries (`siteDaySummaries`): its newest figures, and
 * its figures over a stretch of time in days, weeks or months — and, apart,
 * what the answers to a company's own questions said (`siteListAiDays`), which
 * are that company's alone (docs/plans/active/private-tracking-lists-plan.md).
 *
 * Shared by the Sites queries so "the latest backlinks" or "traffic by week"
 * mean the same thing on every screen.
 */

type Reader = { db: QueryCtx["db"] };
type Summary = Doc<"siteDaySummaries">;

/** Day rows read to find the newest of each kind of figure. */
const RECENT_DAYS = 21;

/** Day rows read for one chart: two years and change. */
const SERIES_DAYS = 800;

/** Questions read for a site's cited pages: the page and its download read further than a figure does. */
export const QUESTIONS_FOR_CITED_PAGES = 100;

/** Pages of one site cited in the answers to one question, read at most. */
const CITED_PAGES_PER_QUESTION = 200;

/** A list's days of one website's AI line read for one chart: as many as the day rows. */
const LIST_AI_DAYS_READ = SERIES_DAYS;

/** Day rows read from the day a website was first seen to find its first ranking check. */
const FIRST_CHECK_READ = 60;

/**
 * The day of a site's first ranking check from this place, or null before
 * one. Nothing moved that day: every search it ranked for was "new" only
 * because no check came before it, so the screens call it the first check
 * rather than counting it as moves (docs/plans/active/sites-audit-fixes-plan.md,
 * 1.3).
 *
 * Read from the day the website was first seen: the rows before it are the
 * history filled in from the archive, a row a month for years — one owned
 * site's go back to 2019 — and never a check of ours. Read from the site's
 * beginning, the first check lay past the rows read and was counted as moves.
 */
export async function firstCheckDay(ctx: Reader, websiteId: Id<"websites">, locationCode: number): Promise<string | null> {
  const website = await ctx.db.get(websiteId);
  const seen = website ? new Date(website.firstSeenAt).toISOString().slice(0, 10) : "";
  const earliest = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode).gte("day", seen))
    .take(FIRST_CHECK_READ);
  return earliest.find((row) => row.keywords !== undefined)?.day ?? null;
}

/** A site's first keyword list pages read to find the first from this place. */
const FIRST_LIST_READ = 60;

/**
 * The days a site's checks had nothing to compare with: its first check, and
 * the first day its whole keyword list was held — when that came after, as
 * one agency site's did, three days behind checks of its first hundred searches.
 * That day's hundreds of "new" searches were only new to the list, not new
 * rankings, so the screens count it as a start, not as moves (Anthony,
 * 2026-09-27, the New and lost keywords design agreed).
 */
export type CheckStarts = { firstCheck: string | null; firstList: string | null };
export const NO_STARTS: CheckStarts = { firstCheck: null, firstList: null };

export async function checkStarts(ctx: Reader, websiteId: Id<"websites">, locationCode: number): Promise<CheckStarts> {
  const [firstCheck, lists] = await Promise.all([
    firstCheckDay(ctx, websiteId, locationCode),
    ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_operation_day", (q) => q.eq("websiteId", websiteId).eq("operationId", KEYWORD_LIST_OPERATION_ID))
      .take(FIRST_LIST_READ),
  ]);
  const firstList = lists.find((row) => row.locationCode === undefined || row.locationCode === locationCode)?.day ?? null;
  // A site whose first check was its whole list has one start, not two.
  return { firstCheck, firstList: firstList !== null && firstList !== firstCheck ? firstList : null };
}

/** The newest day row carrying each kind of figure, from the last few weeks. */
export async function latestFigures(ctx: Reader, websiteId: Id<"websites">, locationCode: number) {
  const recent = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode))
    .order("desc")
    .take(RECENT_DAYS);
  const ranking = recent.find((row) => row.keywords !== undefined) ?? null;
  const metrics = recent.find((row) => row.estimatedTraffic !== undefined) ?? null;
  const links = recent.find((row) => row.referringDomains !== undefined || row.backlinks !== undefined) ?? null;
  return { ranking, metrics, links, lastDay: recent[0]?.day ?? null };
}

const heldOf = v.union(v.number(), v.null());

/**
 * What the keyword list holds of a site, against the supplier's own count of
 * everything it ranks for (sites-data-completeness-plan.md, rule 3): searches
 * and the visits they bring, total and held; whether the list is the whole
 * site; and the supplier's bands and moves across every search, which a list
 * held in part cannot give. A total the supplier has not given in the last
 * few weeks is null — "not known yet" — never the held count passed off as it.
 */
export const coverageValidator = v.object({
  searches: v.object({ held: heldOf, total: heldOf }),
  visits: v.object({ held: heldOf, total: heldOf }),
  /** Every search the supplier counts is held: moves, "lost" and shares are the whole site's. */
  whole: v.boolean(),
  bands: v.union(bandCountsValidator, v.null()),
  moves: v.union(v.null(), v.object({ fresh: heldOf, up: heldOf, down: heldOf, lost: heldOf })),
  /** Searches showing the site in each results-page feature, across everything it ranks for. */
  features: v.object({ ai_overview_reference: heldOf, featured_snippet: heldOf, local_pack: heldOf }),
});
export type Coverage = Infer<typeof coverageValidator>;

export function coverageOf(latest: { ranking: Summary | null; metrics: Summary | null }): Coverage {
  const held = latest.ranking?.keywords ?? null;
  const total = latest.metrics?.rankedKeywordsTotal ?? null;
  const split = latest.ranking?.intentSplit;
  const metrics = latest.metrics;
  return {
    searches: { held, total },
    visits: {
      held: split ? split.branded.visits + split.buying.visits + split.researching.visits + split.other.visits : null,
      total: metrics?.estimatedTraffic ?? null,
    },
    whole: held !== null && total !== null && held >= total,
    bands: metrics?.allBands ?? null,
    moves: metrics && [metrics.keywordsNew, metrics.keywordsUp, metrics.keywordsDown, metrics.keywordsLost].some((count) => count !== undefined)
      ? { fresh: metrics.keywordsNew ?? null, up: metrics.keywordsUp ?? null, down: metrics.keywordsDown ?? null, lost: metrics.keywordsLost ?? null }
      : null,
    features: {
      ai_overview_reference: metrics?.aiOverviewRefs ?? null,
      featured_snippet: metrics?.featuredSnippets ?? null,
      local_pack: metrics?.localPacks ?? null,
    },
  };
}

/**
 * A site's bands at its newest check: DataForSEO's over everything it ranks
 * for — the one rule the Sites list, a site's header and Side by side count
 * "Top 3" by (docs/plans/active/sites-audit-fixes-plan.md, 4.11). The keyword
 * list's own bands stand in only when the list is the whole site: a list held
 * in part, or one whose total is not known, would set a part of one site
 * beside the whole of another (sites-data-completeness-plan.md, §8.7).
 */
export function latestBands(latest: { ranking: Summary | null; metrics: Summary | null }) {
  if (latest.metrics?.allBands) return latest.metrics.allBands;
  return coverageOf(latest).whole ? latest.ranking?.bands : undefined;
}

/**
 * How many searches a site ranks for, as the supplier counts them — never the
 * searches the list holds passed off as the total: a site held in part would
 * read as a fraction of its size beside the others. Null while not known.
 */
export function searchTotalOf(latest: { metrics: Summary | null }): number | null {
  return latest.metrics?.rankedKeywordsTotal ?? null;
}

/**
 * A list's newest AI line about one website: the answers to the company's own
 * questions on the newest day they came back, per engine. Null for no list or
 * no answers yet.
 */
export async function latestListAi(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  place: number,
  websiteId: Id<"websites">,
): Promise<Doc<"siteListAiDays"> | null> {
  if (!holdId) return null;
  return await ctx.db
    .query("siteListAiDays")
    .withIndex("by_hold_site_day", (q) =>
      q.eq("companyWebsiteId", holdId).eq("locationCode", place).eq("websiteId", websiteId))
    .order("desc")
    .first();
}

/** Everything the engines said about the site on one day, added up. */
export function aiTotals(row: { ai?: EngineDay[] } | null): { named: number; asked: number; recommended: number } {
  let named = 0;
  let asked = 0;
  let recommended = 0;
  for (const engine of row?.ai ?? []) {
    named += engine.named;
    asked += engine.asked;
    recommended += engine.recommended;
  }
  return { named, asked, recommended };
}

export const STEPS = ["day", "week", "month"] as const;
export type Step = (typeof STEPS)[number];
export const stepValidator = v.union(v.literal("day"), v.literal("week"), v.literal("month"));

/** The first day of the step a day falls in: the day itself, its Monday, or the 1st. */
export function bucketOf(day: string, step: Step): string {
  if (step === "day") return day;
  if (step === "month") return `${day.slice(0, 7)}-01`;
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

const optionalNumber = v.optional(v.number());

/** One point on a chart: a day, week or month of a site's figures. */
export const pointValidator = v.object({
  day: v.string(),
  /** The newest day folded into this point: a month's point is dated by its first day, but "as of" means this. */
  lastDay: v.string(),
  // Levels: the last value in the step.
  keywords: optionalNumber,
  bands: v.optional(bandCountsValidator),
  pages: optionalNumber,
  estimatedTraffic: optionalNumber,
  rankedKeywordsTotal: optionalNumber,
  backlinks: optionalNumber,
  referringDomains: optionalNumber,
  domainRank: optionalNumber,
  brokenBacklinks: optionalNumber,
  // Phase 2 levels: DataForSEO's bands and new / up / down / lost counts over
  // everything the site ranks for, the traffic's value, and link quality.
  // The counts are DataForSEO's own "since its last update", so a step takes
  // the last of them, like any level, rather than adding them up.
  allBands: v.optional(bandCountsValidator),
  trafficValue: optionalNumber,
  keywordsNew: optionalNumber,
  keywordsUp: optionalNumber,
  keywordsDown: optionalNumber,
  keywordsLost: optionalNumber,
  spamScore: optionalNumber,
  brokenPages: optionalNumber,
  referringMainDomains: optionalNumber,
  /** Linking domains, each subdomain apart; `referringDomains` is main websites where known (§4.D2). */
  linkingDomains: optionalNumber,
  // Phase 5 levels: paid search, presence in features across every keyword,
  // and the site crawl.
  paidKeywords: optionalNumber,
  paidTraffic: optionalNumber,
  paidTrafficCost: optionalNumber,
  featuredSnippets: optionalNumber,
  localPacks: optionalNumber,
  aiOverviewRefs: optionalNumber,
  crawledPages: optionalNumber,
  onPageScore: optionalNumber,
  // The searches by what they are for, with their visits (`intentSplit`).
  intentSplit: v.optional(intentSplitValidator),
  // Flows: added up over the step.
  rankedUp: v.number(),
  rankedDown: v.number(),
  rankedNew: v.number(),
  rankedLost: v.number(),
  /** The step holds the site's first ranking check, whose searches are not counted as moves (`firstCheckDay`). */
  firstCheck: v.optional(v.boolean()),
  /** The step holds the first day the site's whole keyword list was held, not counted as moves either (`checkStarts`). */
  firstList: v.optional(v.boolean()),
  ai: v.array(engineDayValidator),
});
export type Point = Infer<typeof pointValidator>;

/**
 * A site's figures before `day`, as a point: each figure from the newest
 * earlier day that has it, read over the same few weeks as `latestFigures`.
 * The last day before the dates may hold only a crawl or a link count, and
 * "change since" used to vanish for every other figure when it did
 * (docs/plans/active/sites-audit-fixes-plan.md, 4.5). Flows are that last
 * day's own. Null when nothing came before.
 */
export async function dayBefore(
  ctx: Reader,
  websiteId: Id<"websites">,
  locationCode: number,
  day: string,
): Promise<Point | null> {
  const rows = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode).lt("day", day))
    .order("desc")
    .take(RECENT_DAYS);
  if (rows.length === 0) return null;
  const point = pointFrom(rows[0], rows[0].day);
  const levels = point as Record<string, unknown>;
  for (const row of rows.slice(1)) {
    for (const level of LEVELS) {
      if (levels[level] === undefined && row[level] !== undefined) levels[level] = row[level];
    }
  }
  return asLinkingWebsites(point);
}

/**
 * Linking websites as the lists count them: main websites, a site's
 * subdomains one website with it — thatscarpyrigs.co.uk has 740 linking
 * domains and 93 main websites, and its list holds the 93
 * (sites-data-completeness-plan.md, §4.D2). The subdomain count where a row
 * has no other.
 */
export function linkingWebsitesOf(row: { referringDomains?: number; referringMainDomains?: number } | null): number | null {
  return row?.referringMainDomains ?? row?.referringDomains ?? null;
}

/** A point whose linking websites are main websites, the count with each subdomain apart kept beside them. */
function asLinkingWebsites(point: Point): Point {
  if (point.referringMainDomains === undefined) return point;
  return { ...point, referringDomains: point.referringMainDomains, ...(point.referringDomains !== undefined ? { linkingDomains: point.referringDomains } : {}) };
}

const LEVELS = [
  "keywords", "bands", "pages", "estimatedTraffic", "rankedKeywordsTotal",
  "backlinks", "referringDomains", "domainRank", "brokenBacklinks",
  "allBands", "trafficValue", "keywordsNew", "keywordsUp", "keywordsDown", "keywordsLost",
  "spamScore", "brokenPages", "referringMainDomains",
  "paidKeywords", "paidTraffic", "paidTrafficCost", "featuredSnippets", "localPacks", "aiOverviewRefs",
  "crawledPages", "onPageScore", "intentSplit",
] as const;

/**
 * A site's figures between two days, in steps.
 *
 * Levels (keywords, traffic, backlinks) take the step's last value, which is
 * what a line of "where it stood" means; flows (moves, answers) are added up,
 * which is what a bar of "how many that week" means.
 */
export async function seriesFor(
  ctx: Reader,
  websiteId: Id<"websites">,
  locationCode: number,
  from: string,
  to: string,
  step: Step,
  /** The days with nothing to compare with (`checkStarts`), whose searches are not moves. */
  starts: CheckStarts = NO_STARTS,
): Promise<Point[]> {
  const rows = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) =>
      q.eq("websiteId", websiteId).eq("locationCode", locationCode).gte("day", from).lte("day", to))
    .take(SERIES_DAYS);

  const points = new Map<string, Point>();
  for (const row of rows) {
    const key = bucketOf(row.day, step);
    const held = points.get(key);
    points.set(key, held ? addInto(held, row, starts) : pointFrom(row, key, starts));
  }
  return [...points.values()].map(asLinkingWebsites).sort((left, right) => left.day.localeCompare(right.day));
}

/** A day row as a point of its own. */
function pointFrom(row: Summary, day: string, starts: CheckStarts = NO_STARTS): Point {
  return addInto({ day, lastDay: row.day, rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [] }, row, starts);
}

/** Fold a later day into a point: its levels replace, its flows add — but a start's, which are not moves. */
function addInto(point: Point, row: Summary, starts: CheckStarts = NO_STARTS): Point {
  if (row.day > point.lastDay) point.lastDay = row.day;
  for (const level of LEVELS) {
    const value = row[level];
    if (value !== undefined) (point as Record<string, unknown>)[level] = value;
  }
  if (row.day === starts.firstCheck) {
    point.firstCheck = true;
    return point;
  }
  if (row.day === starts.firstList) {
    point.firstList = true;
    return point;
  }
  point.rankedUp += row.rankedUp ?? 0;
  point.rankedDown += row.rankedDown ?? 0;
  point.rankedNew += row.rankedNew ?? 0;
  point.rankedLost += row.rankedLost ?? 0;
  // A day row carries no answers: they are a company's own, and are laid on
  // from its list (`overlayListAi`).
  return point;
}

/**
 * How many engines' newest answers to a company's questions named a website,
 * of the engines that have answered them: a competitor's AI figure on the
 * Sites list and in its header. A competitor asks nothing, so it is measured
 * on the owned site's questions — **this company's questions only**, added up
 * in its list's summary (`siteListAi.ts`): a mention in an answer to another
 * company's question never reaches this company's screen. Null before any
 * engine has answered.
 */
export function enginesNamingIn(
  summary: Pick<Doc<"siteListAiSummary">, "engines"> | null,
  websiteId: Id<"websites">,
): { named: number; asked: number } | null {
  const engines = summary?.engines ?? [];
  if (engines.length === 0) return null;
  return { named: engines.filter((engine) => engine.newestNamed.includes(websiteId)).length, asked: engines.length };
}

/**
 * How many of a website's pages the answers to a company's questions link
 * to, in all and per engine, from its list's summary: the count the Sources
 * cited list reads out in full (`citedPagesOf`).
 */
export function citedPagesIn(
  summary: Pick<Doc<"siteListAiSummary">, "cited"> | null,
  websiteId: Id<"websites">,
): { pages: number; engines: Map<AiEngine, number> } {
  const cited = summary?.cited.find((entry) => entry.websiteId === websiteId);
  return { pages: cited?.pages ?? 0, engines: new Map(cited?.engines.map((entry) => [entry.engine, entry.pages])) };
}

/** A page of a site the engines linked to, added up over the questions the site is measured on. */
export type CitedPage = {
  url: string;
  page: string;
  engines: AiEngine[];
  times: number;
  firstDay: string;
  lastDay: string;
};

/**
 * The questions a site is measured on — the company's own list — as the
 * cited-page rows are keyed: each question, per engine, at the place that
 * engine answers from for this site. Bounded by `cap`, like every read of a
 * list.
 */
export async function askedQuestions(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  place: number,
  cap: number,
): Promise<Array<{ prompt: string; engine: AiEngine; locationCode: number }>> {
  const questions = await holdQuestions(ctx, holdId, cap);
  return questions.flatMap((question) =>
    question.engines.map((engine) => ({ prompt: question.prompt, engine, locationCode: answerPlace(engine, place) })));
}

/**
 * A site's pages the engines link to in their answers, most cited first —
 * from the answers to the questions it is measured on, asked from its place,
 * and no others (D17). The answers are shared, so a page cited in an answer
 * to another company's question is not this company's to count. Read one
 * question at a time from its own rows, then added up by page, so every form
 * of an address is one page.
 */
export async function citedPagesOf(
  ctx: Reader,
  websiteId: Id<"websites">,
  /** The list the site is measured on (`listHold` in `siteAccess.ts`). */
  holdId: Id<"companyWebsites"> | null,
  place: number,
  questionCap: number,
  /**
   * Set when a read stopped short — more questions than `questionCap`, or a
   * question citing more of the site's pages than are read for one — so a
   * screen listing the pages can say the list is longer (docs/plans/active/
   * sites-table-pages-plan.md, T11). Figures that only count do not ask.
   */
  coverage?: { cut: boolean },
): Promise<CitedPage[]> {
  const byPage = new Map<string, CitedPage>();
  if (coverage) {
    const questions = await holdQuestions(ctx, holdId, questionCap + 1);
    if (questions.length > questionCap) coverage.cut = true;
  }
  for (const asked of await askedQuestions(ctx, holdId, place, questionCap)) {
    const read = await ctx.db
      .query("siteCitedPages")
      .withIndex("by_site_question", (q) =>
        q.eq("websiteId", websiteId).eq("prompt", asked.prompt).eq("engine", asked.engine).eq("locationCode", asked.locationCode))
      .take(CITED_PAGES_PER_QUESTION + 1);
    if (read.length > CITED_PAGES_PER_QUESTION && coverage) coverage.cut = true;
    const rows = read.slice(0, CITED_PAGES_PER_QUESTION);
    for (const row of rows) {
      const held = byPage.get(row.page);
      if (!held) {
        byPage.set(row.page, { url: row.url, page: row.page, engines: [asked.engine], times: row.times, firstDay: row.firstDay, lastDay: row.lastDay });
        continue;
      }
      held.times += row.times;
      if (!held.engines.includes(asked.engine)) held.engines.push(asked.engine);
      if (row.firstDay < held.firstDay) held.firstDay = row.firstDay;
      if (row.lastDay > held.lastDay) held.lastDay = row.lastDay;
    }
  }
  return [...byPage.values()]
    .map((entry) => ({ ...entry, engines: [...entry.engines].sort() }))
    .sort((left, right) => right.times - left.times || left.page.localeCompare(right.page));
}

/**
 * One website's AI line per engine per step, from the answers to this
 * company's own questions asked from this place (`siteListAiDays`), laid onto
 * its points: the owned site's own line — asked, named, recommended — or how
 * often a competitor was named, where "asked" stays at nought because the
 * questions were the owned site's. Nothing but the company's own list is
 * read, so another company's questions never reach the chart.
 */
export async function overlayListAi(
  ctx: Reader,
  points: Point[],
  holdId: Id<"companyWebsites"> | null,
  websiteId: Id<"websites">,
  place: number,
  from: string,
  to: string,
  step: Step,
): Promise<Point[]> {
  const days = holdId
    ? await ctx.db
      .query("siteListAiDays")
      .withIndex("by_hold_site_day", (q) =>
        q.eq("companyWebsiteId", holdId).eq("locationCode", place).eq("websiteId", websiteId)
          .gte("day", from).lte("day", to))
      .take(LIST_AI_DAYS_READ)
    : [];
  const byStep = new Map<string, Map<AiEngine, EngineDay>>();
  for (const row of days) {
    const key = bucketOf(row.day, step);
    const engines = byStep.get(key) ?? new Map<AiEngine, EngineDay>();
    byStep.set(key, engines);
    for (const entry of row.ai) {
      const held = engines.get(entry.engine) ?? { engine: entry.engine, asked: 0, named: 0, recommended: 0 };
      held.asked += entry.asked;
      held.named += entry.named;
      held.recommended += entry.recommended;
      engines.set(entry.engine, held);
    }
  }

  const out = new Map(points.map((point) => [point.day, { ...point, ai: [] as EngineDay[] }]));
  for (const [day, engines] of byStep) {
    const point = out.get(day) ?? { day, lastDay: day, rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [] as EngineDay[] };
    point.ai = [...engines.values()];
    out.set(day, point);
  }
  return [...out.values()].sort((left, right) => left.day.localeCompare(right.day));
}
