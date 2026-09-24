import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { answerPlace, type AiEngine } from "./seoAiEngines";
import { bandCountsValidator, engineDayValidator, type EngineDay } from "./utils/siteShapes";

/**
 * Reading a site's day summaries (`siteDaySummaries`): its newest figures, and
 * its figures over a stretch of time in days, weeks or months.
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

/** Questions read when working out a watched site's AI figures. */
export const QUESTIONS_FOR_FIGURES = 25;

/** Questions read for a site's cited pages: the page and its download read further than a figure does. */
export const QUESTIONS_FOR_CITED_PAGES = 100;

/** Pages of one site cited in the answers to one question, read at most. */
const CITED_PAGES_PER_QUESTION = 200;

/** A watched site's days of mentions read for one chart: as many as the day rows. */
const RIVAL_DAYS_READ = SERIES_DAYS;

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
  const answers = recent.find((row) => (row.ai?.length ?? 0) > 0) ?? null;
  return { ranking, metrics, links, answers, lastDay: recent[0]?.day ?? null };
}

/** Everything the engines said about the site on one day, added up. */
export function aiTotals(row: Pick<Summary, "ai"> | null): { named: number; asked: number; recommended: number } {
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
  // Flows: added up over the step.
  rankedUp: v.number(),
  rankedDown: v.number(),
  rankedNew: v.number(),
  rankedLost: v.number(),
  ai: v.array(engineDayValidator),
});
export type Point = Infer<typeof pointValidator>;

/** A site's figures on the last day before `day`, as a point, or null. */
export async function dayBefore(
  ctx: Reader,
  websiteId: Id<"websites">,
  locationCode: number,
  day: string,
): Promise<Point | null> {
  const row = await ctx.db
    .query("siteDaySummaries")
    .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", locationCode).lt("day", day))
    .order("desc")
    .first();
  return row ? pointFrom(row, row.day) : null;
}

const LEVELS = [
  "keywords", "bands", "pages", "estimatedTraffic", "rankedKeywordsTotal",
  "backlinks", "referringDomains", "domainRank", "brokenBacklinks",
  "allBands", "trafficValue", "keywordsNew", "keywordsUp", "keywordsDown", "keywordsLost",
  "spamScore", "brokenPages", "referringMainDomains",
  "paidKeywords", "paidTraffic", "paidTrafficCost", "featuredSnippets", "localPacks", "aiOverviewRefs",
  "crawledPages", "onPageScore",
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
    points.set(key, held ? addInto(held, row) : pointFrom(row, key));
  }
  return [...points.values()].sort((left, right) => left.day.localeCompare(right.day));
}

/** A day row as a point of its own. */
function pointFrom(row: Summary, day: string): Point {
  return addInto({ day, lastDay: row.day, rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [] }, row);
}

/** Fold a later day into a point: its levels replace, its flows add. */
function addInto(point: Point, row: Summary): Point {
  if (row.day > point.lastDay) point.lastDay = row.day;
  for (const level of LEVELS) {
    const value = row[level];
    if (value !== undefined) (point as Record<string, unknown>)[level] = value;
  }
  point.rankedUp += row.rankedUp ?? 0;
  point.rankedDown += row.rankedDown ?? 0;
  point.rankedNew += row.rankedNew ?? 0;
  point.rankedLost += row.rankedLost ?? 0;
  for (const engine of row.ai ?? []) {
    const held = point.ai.find((entry) => entry.engine === engine.engine);
    if (held) {
      held.asked += engine.asked;
      held.named += engine.named;
      held.recommended += engine.recommended;
    } else {
      point.ai.push({ ...engine });
    }
  }
  return point;
}

/**
 * A watched site's AI figures, from the answers to the questions it is
 * measured on.
 *
 * A competitor asks nothing, so the day summaries hold no answers for it. Its
 * figures are read from the answers to the owned site's questions — **this
 * company's questions only**: a mention in an answer to another client's
 * question never reaches this company's screen.
 */
export async function newestAnswerEngines(
  ctx: Reader,
  askerId: Id<"websites">,
  websiteId: Id<"websites">,
  place: number,
): Promise<{ named: number; asked: number } | null> {
  return enginesNamedIn(await newestAnswers(ctx, askerId, place), websiteId);
}

/**
 * The newest answer to each of a site's questions, per engine, from where
 * that engine answers for this place — read once and shared by every watched
 * site measured on those questions (the Sites list reads it once per owned
 * site, not once per competitor).
 */
export async function newestAnswers(
  ctx: Reader,
  askerId: Id<"websites">,
  place: number,
): Promise<Array<{ engine: AiEngine; named: Id<"websites">[] }>> {
  const questions = await ctx.db
    .query("websiteQuestions")
    .withIndex("by_website", (q) => q.eq("websiteId", askerId))
    .take(QUESTIONS_FOR_FIGURES);
  const answers: Array<{ engine: AiEngine; named: Id<"websites">[] }> = [];
  for (const question of questions) {
    for (const engine of question.engines) {
      const newest = await ctx.db
        .query("aiAnswers")
        .withIndex("by_question", (q) =>
          q.eq("prompt", question.prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, place)))
        .order("desc")
        .first();
      if (newest) answers.push({ engine, named: newest.named });
    }
  }
  return answers;
}

/** How many engines' newest answers named a website, of those that answered. Null when none has. */
export function enginesNamedIn(
  answers: ReadonlyArray<{ engine: AiEngine; named: ReadonlyArray<Id<"websites">> }>,
  websiteId: Id<"websites">,
): { named: number; asked: number } | null {
  const engines = new Map<AiEngine, boolean>();
  for (const answer of answers) engines.set(answer.engine, Boolean(engines.get(answer.engine)) || answer.named.includes(websiteId));
  if (engines.size === 0) return null;
  return { named: [...engines.values()].filter(Boolean).length, asked: engines.size };
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
 * The questions a site is measured on, as the cited-page rows are keyed: each
 * question, per engine, at the place that engine answers from for this site.
 * Bounded by `cap`, like every read of a site's questions.
 */
export async function askedQuestions(
  ctx: Reader,
  askerId: Id<"websites">,
  place: number,
  cap: number,
): Promise<Array<{ prompt: string; engine: AiEngine; locationCode: number }>> {
  const questions = await ctx.db
    .query("websiteQuestions")
    .withIndex("by_website", (q) => q.eq("websiteId", askerId))
    .take(cap);
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
  askerId: Id<"websites">,
  place: number,
  questionCap: number,
): Promise<CitedPage[]> {
  const byPage = new Map<string, CitedPage>();
  for (const asked of await askedQuestions(ctx, askerId, place, questionCap)) {
    const rows = await ctx.db
      .query("siteCitedPages")
      .withIndex("by_site_question", (q) =>
        q.eq("websiteId", websiteId).eq("prompt", asked.prompt).eq("engine", asked.engine).eq("locationCode", asked.locationCode))
      .take(CITED_PAGES_PER_QUESTION);
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
 * A watched site's mentions per engine per step, from the answers to this
 * company's own questions asked from this place — worked out with the asking
 * site's day summaries (`siteRivalAiDays`) — laid onto its points. "Asked" is
 * left at nought: the questions were the owned site's, and what a chart of a
 * competitor shows is how often it was named.
 */
export async function overlayMentions(
  ctx: Reader,
  points: Point[],
  askerId: Id<"websites">,
  websiteId: Id<"websites">,
  place: number,
  from: string,
  to: string,
  step: Step,
): Promise<Point[]> {
  const days = await ctx.db
    .query("siteRivalAiDays")
    .withIndex("by_asker_site_day", (q) =>
      q.eq("askerWebsiteId", askerId).eq("locationCode", place).eq("websiteId", websiteId)
        .gte("day", from).lte("day", to))
    .take(RIVAL_DAYS_READ);
  const byStep = new Map<string, Map<AiEngine, EngineDay>>();
  for (const row of days) {
    const key = bucketOf(row.day, step);
    const engines = byStep.get(key) ?? new Map<AiEngine, EngineDay>();
    byStep.set(key, engines);
    for (const entry of row.ai) {
      const held = engines.get(entry.engine) ?? { engine: entry.engine, asked: 0, named: 0, recommended: 0 };
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
