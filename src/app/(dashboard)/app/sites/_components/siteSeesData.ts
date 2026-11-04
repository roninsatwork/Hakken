import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { newestOfEach } from "../[siteId]/newestOfEach";
import { checksFor, rivalChecksFor } from "./seesChecks";
import { formatMonth, formatShortDay } from "./siteFormat";

/**
 * What Visibility's second half hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): each page's
 * own figures, built here once from the answers the page already reads, so the page and the test of its rules
 * (`convex/utils/sees/visibilityPeriods.test.ts`) build them the same way. Every name is the reader's own, handed in by
 * the page; every count is over the whole list the page shows (a long list reaches the eye cut to its first rows, so a
 * list is handed the most telling first). Never a guessed money figure (decision 4): what adverts cost and what visits
 * would be worth stay stored and unshown.
 */

type Answer<Name extends keyof typeof api> = typeof api[Name];
type Series = FunctionReturnType<(typeof api)["siteCharts"]["siteSeries"]>;
type Line = Series[number];
type Point = Line["points"][number];
export type Words = Record<string, string>;
type Span = { from: string; to: string };
const inSpan = (day: string, span: Span) => day >= span.from && day <= span.to;
const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS));

/** The middle of a list of figures. */
function middleOf(values: readonly number[]): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const at = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
}

// --- Google results ---

type AboveRow = { keyword: string; position: number | null; above: ReadonlyArray<{ domain: string; isRival: boolean }>; rivalsAbove: number; day: string | null; pageKept: boolean };

/** Who ranks above you: each website above you over every search checked, rivals and the rest apart, the most first. */
export function aboveSeen(rows: readonly AboveRow[], names: Words) {
  const checked = rows.filter((row) => row.day !== null && row.pageKept);
  const counts = new Map<string, { rival: boolean; above: number }>();
  for (const row of checked) {
    for (const result of row.above) {
      const held = counts.get(result.domain) ?? { rival: result.isRival, above: 0 };
      held.above += 1;
      counts.set(result.domain, held);
    }
  }
  const ranked = [...counts.entries()].map(([name, entry]) => ({ name, above: entry.above, rival: entry.rival ? 1 : 0 })).sort((left, right) => right.above - left.above);
  return {
    above: {
      checked: checked.length,
      first: checked.filter((row) => row.above.length === 0 && row.position !== null).length,
      notOnPage: checked.filter((row) => row.position === null).length,
      rivals: ranked.filter((row) => row.rival === 1),
      others: ranked.filter((row) => row.rival === 0),
      names,
    },
    searches: rows.map((row) => ({ keyword: row.keyword, position: row.position, above: row.above.length, rivalsAbove: row.pageKept ? row.rivalsAbove : null, day: row.day })),
  };
}

type Features = FunctionReturnType<Answer<"siteGoogleSerp">["listFeatures"]>;

/** Search features: the boxes against the check before the dates, and the chart's features by their names on screen. */
export function featuresSeen(data: Features, line: Line | undefined, label: (feature: string) => string, names: Words) {
  return {
    across: checksFor(line, { aiOverviewRefs: (point) => point.aiOverviewRefs, localPacks: (point) => point.localPacks, featuredSnippets: (point) => point.featuredSnippets }, { host: names.host ?? "" }),
    features: {
      checked: data.checked,
      totals: data.totals.map((row) => ({ name: label(row.feature), searches: row.searches, withSite: row.withSite })),
      names: { withSite: names.withSite ?? "" },
    },
  };
}

type MoveRow = { keyword: string; position: number | null; previousPosition: number | null; change: number; volume: number | null; traffic: number | null; page: string };

/** Wins and losses: moves up against down over the dates and the span before, the chart's steps, the table's moves. */
export function winsLossesSeen(line: Line | undefined, before: Line | undefined, rows: readonly MoveRow[] | undefined, step: "day" | "week" | "month", names: Words) {
  const points = line?.points ?? [];
  const sum = (list: readonly Point[], field: "rankedUp" | "rankedDown") => list.reduce((total, point) => total + point[field], 0);
  const was = before?.points;
  // Moves come at checks: each span's checks that counted any, so the rules compare spans of as many checks.
  const checks = (list: readonly Point[]) => list.filter((point) => point.rankedUp + point.rankedDown > 0).length;
  return {
    winsLosses: {
      up: sum(points, "rankedUp"), down: sum(points, "rankedDown"), checks: checks(points),
      ...(was && was.length > 0 ? { upBefore: sum(was, "rankedUp"), downBefore: sum(was, "rankedDown"), checksBefore: checks(was) } : {}),
      names,
    },
    steps: points.map((point) => ({ day: point.day, label: step === "month" ? formatMonth(point.day.slice(0, 7)) : formatShortDay(point.day), up: point.rankedUp, down: point.rankedDown })),
    ...(rows ? { moves: rows.map((row) => ({ keyword: row.keyword, position: row.position, previousPosition: row.previousPosition, change: row.change, volume: row.volume, traffic: row.traffic, page: row.page })) } : {}),
  };
}

type Tracked = { keyword: string; verdict: string; lastPosition: number | null; previousPosition: number | null; bestPosition: number | null; lastCheckedDay: string | null };

/** How far a search moved at its last check, or sits below its best: the eye's list keeps the biggest first. */
function movedBy(row: Tracked): number {
  if (row.lastPosition === null) return 0;
  return Math.max(row.previousPosition === null ? 0 : Math.abs(row.previousPosition - row.lastPosition), row.bestPosition === null ? 0 : row.lastPosition - row.bestPosition);
}

/** Your searches: page one now and at the check before over every search, the most moved first, and the chart's lines. */
export function searchesSeen(rows: readonly Tracked[], positions: unknown, names: Words) {
  return {
    standing: {
      total: rows.length,
      pageOne: rows.filter((row) => row.lastPosition !== null && row.lastPosition <= 10).length,
      pageOneBefore: rows.filter((row) => row.previousPosition !== null && row.previousPosition <= 10).length,
      slipping: rows.filter((row) => row.verdict === "SLIPPING").length,
      searches: [...rows].sort((left, right) => movedBy(right) - movedBy(left))
        .map((row) => ({ keyword: row.keyword, position: row.lastPosition, previousPosition: row.previousPosition, best: row.bestPosition, verdict: row.verdict, day: row.lastCheckedDay })),
      names,
    },
    ...(positions ? { positions } : {}),
  };
}

// --- Competitors ---

type GroupFigures = FunctionReturnType<Answer<"siteCharts">["siteAndRivals"]>;
type Rivals = FunctionReturnType<Answer<"siteCompetitors">["listRivals"]>;
type RivalMoves = FunctionReturnType<Answer<"siteRivalMoves">["rivalMoves"]>;
const traffic = { estimatedTraffic: (point: Point) => point.estimatedTraffic };

/** Side by side: each website's newest check, the chart's lines against the check before, the searches compared, the moves. */
export function sideBySideSeen(figures: GroupFigures, rivals: Rivals, series: Series | undefined, moves: RivalMoves | undefined, names: Words) {
  const pick = (row: GroupFigures[number]) => ({ estimatedTraffic: row.estimatedTraffic, keywords: row.keywords, top3: row.top3, referringDomains: row.referringDomains });
  const own = figures.find((row) => row.isYou);
  return {
    group: {
      ...(own ? { you: { name: own.host, now: pick(own) } } : {}),
      rivals: figures.filter((row) => !row.isYou).map((row) => ({ name: row.host, now: pick(row) })),
      ...(series ? { lines: { you: checksFor(series.find((line) => line.isYou), traffic), rivals: rivalChecksFor(series, traffic) } } : {}),
      compared: rivals.map((row) => ({ name: row.host, beatsYouOn: row.beatsYouOn, youBeatOn: row.youBeatOn, comparedOn: row.comparedOn, verdict: row.verdict })),
      ...(moves ? { lately: moves.map((row) => ({ name: row.host, newSearches: row.newSearches, climbed: row.climbed, fell: row.fell, visits: row.visits, visitsBefore: row.visitsBefore })) } : {}),
      names,
    },
  };
}

type MarketRow = { host: string; role: string; keywords: number | null; traffic: number | null; sharedKeywords: number | null };

/** The market map, worked out over every website the chart draws: who shares most with you, and the market's middle. */
export function marketSeen(rows: readonly MarketRow[], names: Words) {
  const you = rows.find((row) => row.role === "YOU");
  const others = rows.filter((row) => row.role !== "YOU");
  const most = (role: string) => others.filter((row) => row.role === role && (row.sharedKeywords ?? 0) > 0).sort((left, right) => (right.sharedKeywords ?? 0) - (left.sharedKeywords ?? 0))[0];
  const measured = others.filter((row) => (row.keywords ?? 0) > 0 && row.traffic !== null);
  const row = (entry: MarketRow | undefined) => (entry ? { name: entry.host, role: entry.role, keywords: entry.keywords, traffic: entry.traffic, sharedKeywords: entry.sharedKeywords } : null);
  const yours = you?.traffic ?? null;
  return {
    market: {
      you: row(you),
      outsider: row(most("FOUND")),
      rival: row(most("RIVAL")),
      middle: {
        websites: measured.length,
        traffic: middleOf(measured.map((entry) => entry.traffic!)),
        perSearch: middleOf(measured.map((entry) => entry.traffic! / entry.keywords!)),
        more: yours === null ? null : measured.filter((entry) => entry.traffic! > yours).length,
      },
      websites: [...rows].sort((left, right) => (right.sharedKeywords ?? -1) - (left.sharedKeywords ?? -1)).map(row),
      names,
    },
  };
}

type Shared = { total: number; rows: ReadonlyArray<{ keyword: string; theirPosition: number; yourPosition: number; volume: number | null; theirTraffic: number | null }> };
type Cited = ReadonlyArray<{ times: number }>;

/** A rival's own screen: the four boxes, each line from the check before the dates, the searches it leads, the table. */
export function rivalSeen(rival: string, figures: GroupFigures, verdict: string | null, sharedAll: number | null | undefined, lead: string, shared: Shared, series: Series | undefined, cited: Cited | undefined, names: Words) {
  const mine = figures.find((row) => row.isYou);
  const their = figures.find((row) => !row.isYou && row.host === rival);
  if (!mine || !their) return undefined;
  const pick = (row: GroupFigures[number]) => ({ estimatedTraffic: row.estimatedTraffic, keywords: row.keywords, referringDomains: row.referringDomains, domainRank: row.domainRank });
  const line = (entry: Line | undefined) => [...(entry?.before ? [entry.before] : []), ...(entry?.points ?? [])].map((point) => ({ day: point.lastDay, estimatedTraffic: point.estimatedTraffic ?? null }));
  return {
    rival: {
      name: rival, yours: pick(mine), theirs: pick(their), verdict,
      ...(sharedAll !== undefined && sharedAll !== null ? { sharedAll } : {}),
      ...(lead === "THEM" ? { theyLead: shared.total } : {}),
      shared: shared.rows.map((row) => ({ keyword: row.keyword, theirPosition: row.theirPosition, yourPosition: row.yourPosition, volume: row.volume, theirTraffic: row.theirTraffic })),
      yourLine: line(series?.find((entry) => entry.isYou)), theirLine: line(series?.find((entry) => !entry.isYou && entry.host === rival)),
      ...(cited ? { citedPages: cited.length, cited: cited.reduce((sum, row) => sum + row.times, 0) } : {}),
      names,
    },
  };
}

// --- AI answers ---

type DemandRow = { keyword: string; ai: number | null; aiMonths: number[]; google: number | null; googleMonths: number[] };
/** A year's change only over the searches with a whole year of figures, as the page's boxes count it. */
const YEAR = 11;
const fromEnd = (series: readonly number[], back: number) => series[series.length - 1 - back] ?? 0;
const sumBack = (rows: readonly DemandRow[], pick: (row: DemandRow) => number[], back: number) => rows.reduce((sum, row) => sum + fromEnd(pick(row), back), 0);

/** AI demand: the boxes against 11 months before, and the searches the most moved first, in AI and on Google. */
export function aiDemandSeen(data: { month: string | null; rows: readonly DemandRow[] }, names: Words) {
  const rows = data.rows;
  const growth = (series: readonly number[], back: number) => (series.length > back && series[series.length - 1 - back] > 0 ? Math.abs(series[series.length - 1] / series[series.length - 1 - back] - 1) : 0);
  const brief = (row: DemandRow) => ({ keyword: row.keyword, ai: row.ai, google: row.google, aiMonths: row.aiMonths, googleMonths: row.googleMonths });
  const aiYear = rows.filter((row) => row.aiMonths.length > YEAR);
  const googleYear = rows.filter((row) => row.googleMonths.length > YEAR);
  return {
    demand: {
      ai: data.month ? sumBack(rows, (row) => row.aiMonths, 0) : null,
      ...(data.month && aiYear.length > 0 ? { aiYear: sumBack(aiYear, (row) => row.aiMonths, 0), aiYearBefore: sumBack(aiYear, (row) => row.aiMonths, YEAR) } : {}),
      googleAll: sumBack(rows, (row) => row.googleMonths, 0),
      ...(googleYear.length > 0 ? { google: sumBack(googleYear, (row) => row.googleMonths, 0), googleYearBefore: sumBack(googleYear, (row) => row.googleMonths, YEAR) } : {}),
      rising: rows.filter((row) => row.aiMonths.length >= 4).sort((left, right) => growth(right.aiMonths, 3) - growth(left.aiMonths, 3)).map(brief),
      movers: [...googleYear].sort((left, right) => Math.abs(fromEnd(right.googleMonths, 0) - fromEnd(right.googleMonths, YEAR)) - Math.abs(fromEnd(left.googleMonths, 0) - fromEnd(left.googleMonths, YEAR))).map(brief),
      searches: [...rows].sort((left, right) => (right.ai ?? 0) - (left.ai ?? 0)).map(brief),
      names,
    },
  };
}

type Mention = { prompt: string; engine: string; asked: number; named: number; recommended: number; warnedAgainst: number; lastStance: string | null };

/** Mentions: each assistant over every question, each on the chart against the check before, the questions never named. */
export function aiMentionsSeen(rows: readonly Mention[], line: Line | undefined, engineLabel: (engine: string) => string, names: Words) {
  const engines = [...new Set(rows.map((row) => row.engine))].map((name) => {
    const of = rows.filter((row) => row.engine === name);
    return { name: engineLabel(name), asked: of.reduce((sum, row) => sum + row.asked, 0), named: of.reduce((sum, row) => sum + row.named, 0), recommended: of.reduce((sum, row) => sum + row.recommended, 0) };
  });
  const dated = (line?.points ?? []).filter((point) => point.ai.length > 0);
  const newest = dated.at(-1);
  const first = line?.before && line.before.ai.length > 0 ? line.before : dated.length > 1 ? dated[0] : null;
  const prompts = [...new Set(rows.map((row) => row.prompt))];
  return {
    mentions: {
      engines,
      moved: newest ? newest.ai.map((entry) => {
        const before = first?.ai.find((one) => one.engine === entry.engine);
        return { name: engineLabel(entry.engine), named: entry.named, asked: entry.asked, ...(before ? { namedBefore: before.named, askedBefore: before.asked } : {}) };
      }) : [],
      questions: prompts.length,
      neverNamed: prompts.filter((prompt) => rows.some((row) => row.prompt === prompt && row.asked > 0) && rows.every((row) => row.prompt !== prompt || row.named === 0)).length,
      warned: rows.reduce((sum, row) => sum + row.warnedAgainst, 0),
      names,
    },
    answers: rows.map((row) => ({ question: row.prompt, engine: engineLabel(row.engine), asked: row.asked, named: row.named, recommended: row.recommended, lastStance: row.lastStance })),
  };
}

type Voice = ReadonlyArray<{ engine: string; asked: number; lastDay: string | null; sites: ReadonlyArray<{ host: string; isYou: boolean; named: number }> }>;

/** Share of voice: each assistant by its name on screen, with every website's answers naming it, yours marked. */
export function shareSeen(engines: Voice, engineLabel: (engine: string) => string) {
  return { voice: { engines: engines.map((engine) => ({ name: engineLabel(engine.engine), asked: engine.asked, websites: engine.sites.map((entry) => ({ name: entry.host, named: entry.named, you: entry.isYou ? 1 : 0 })) })) } };
}

type Radar = { months: string[]; businesses: ReadonlyArray<{ host: string; you: boolean; mentions: number | null; before: number | null; asks: number | null; pagesCited: number; series: Array<number | null> }>; questions: ReadonlyArray<{ question: string; volume: number; you: number | null; rivals: readonly string[] }> };

/** Brand radar: each business against the month before, its pages cited and its line, and the questions naming rivals only. */
export function radarSeen(data: Radar, names: Words) {
  return {
    radar: {
      businesses: data.businesses.map((row) => ({ name: row.host, you: row.you ? 1 : 0, mentions: row.mentions, before: row.before, asks: row.asks, pagesCited: row.pagesCited, months: row.series })),
      months: data.months,
      questionsAll: data.questions.length,
      rivalsNotYou: data.questions.filter((row) => row.you === null && row.rivals.length > 0).length,
      questions: [...data.questions].sort((left, right) => right.volume - left.volume).map((row) => ({ question: row.question, volume: row.volume, you: row.you, rivals: row.rivals.length })),
      names,
    },
  };
}

// --- Web mentions ---

type MentionRow = { url: string; host: string; title: string | null; day: string; kind: number; tone: number; strength: number; linked: number };
/** As `webMentions.ts` keeps them. */
const KINDS = ["OTHER", "NEWS", "BLOG", "FORUM", "SHOP", "ORGANISATION"] as const;
const TONES = ["NEUTRAL", "WELL", "BADLY"] as const;

/** All mentions: the boxes for the dates and the span before, the kinds of website, and every page by its day. */
export function webMentionsSeen(rows: readonly MentionRow[], range: Span & { before: Span }, words: { kinds: (kind: string) => string; kind: (kind: string) => string; tone: (tone: string) => string }, names: Words) {
  const now = rows.filter((row) => inSpan(row.day, range));
  const was = rows.filter((row) => inSpan(row.day, range.before));
  return {
    period: {
      new: now.length, newBefore: was.length,
      noLink: now.filter((row) => row.linked === 0).length, noLinkBefore: was.filter((row) => row.linked === 0).length,
      well: now.filter((row) => row.tone === 1).length,
      badly: now.filter((row) => row.tone === 2).length, badlyBefore: was.filter((row) => row.tone === 2).length,
      kinds: KINDS.map((one, at) => ({ name: words.kinds(one), mentions: now.filter((row) => row.kind === at).length })).filter((one) => one.mentions > 0),
      names,
    },
    mentions: rows.map((row) => ({ day: row.day, host: row.host, title: row.title, kind: words.kind(KINDS[row.kind] ?? "OTHER"), tone: words.tone(TONES[row.tone] ?? "NEUTRAL"), linked: row.linked, strength: row.strength })),
  };
}

// `steps` and `lines` as a read answers them; a screen's test may hand an older shape without them.
type MentionBusinesses = { steps?: readonly string[]; businesses: ReadonlyArray<{ host: string; you: boolean; mentions: number; before: number; well: number; badly: number; noLink: number; series: readonly number[] }> };

/** Against rivals: each business's mentions in the dates and before, how they speak, and the chart's steps by date. */
export function mentionsRivalsSeen(data: MentionBusinesses, names: Words) {
  return {
    group: {
      businesses: data.businesses.map((row) => ({ name: row.host, you: row.you ? 1 : 0, mentions: row.mentions, before: row.before, well: row.well, badly: row.badly, noLink: row.noLink })),
      middleName: names.middle ?? "",
    },
    steps: (data.steps ?? []).map((day, at) => ({ day, ...Object.fromEntries(data.businesses.map((row) => [row.host, row.series[at] ?? 0])) })),
  };
}

// --- Reviews ---

type ReviewRow = { day: string; stars: number; replyDay: string | null; replyRough: boolean };
type Reviews = { figures: { googleRating: number | null; newIn: number; newBefore: number; waiting: number; oldestWaitingDays: number | null; daysToAnswer: number | null }; points: unknown[]; rows: readonly ReviewRow[] };

/** Your reviews: the boxes, and from the reviews held their stars, the low ones and the days a reply took, now and before. */
export function reviewsSeen(data: Reviews, range: Span & { before: Span }, names: Words) {
  const now = data.rows.filter((row) => inSpan(row.day, range));
  const was = data.rows.filter((row) => inSpan(row.day, range.before));
  const stars = (rows: readonly ReviewRow[]) => (rows.length > 0 ? Math.round((rows.reduce((sum, row) => sum + row.stars, 0) / rows.length) * 10) / 10 : null);
  const replied = (rows: readonly ReviewRow[]) => {
    const answered = rows.filter((row) => row.replyDay && !row.replyRough);
    return answered.length > 0 ? Math.round(answered.reduce((sum, row) => sum + daysBetween(row.day, row.replyDay!), 0) / answered.length) : null;
  };
  return {
    period: {
      new: data.figures.newIn, newBefore: data.figures.newBefore,
      stars: stars(now), starsBefore: stars(was),
      // Low, as the page's own filter has it: one to three stars.
      low: now.filter((row) => row.stars <= 3).length, lowBefore: was.filter((row) => row.stars <= 3).length,
      waiting: data.figures.waiting, held: data.rows.length, oldestWaitingDays: data.figures.oldestWaitingDays,
      daysToAnswer: data.figures.daysToAnswer, daysToAnswerBefore: replied(was),
      rating: data.figures.googleRating,
      names,
    },
    points: data.points,
  };
}

type ReviewBusinesses = { steps?: readonly string[]; rows: ReadonlyArray<{ name: string; source: string; you: boolean; rating: number | null; reviews: number | null; newIn: number | null; answered: number | null; daysToAnswer: number | null }>; lines?: ReadonlyArray<{ name: string; counts: ReadonlyArray<number | null> }> };

/** Reviews against rivals: each business's profile, and the chart's counts by step. */
export function reviewsRivalsSeen(data: ReviewBusinesses, sourceName: (source: string) => string, names: Words) {
  return {
    group: {
      businesses: data.rows.map((row) => ({ name: row.name, source: sourceName(row.source), google: row.source === "GOOGLE" ? 1 : 0, you: row.you ? 1 : 0, rating: row.rating, reviews: row.reviews, newIn: row.newIn, answered: row.answered, daysToAnswer: row.daysToAnswer })),
      bestName: names.answering ?? "",
    },
    steps: (data.steps ?? []).map((day, at) => ({ day, ...Object.fromEntries((data.lines ?? []).map((line) => [line.name, line.counts[at] ?? null])) })),
  };
}

// --- The Overview, Paid search and Site audit ---

type Extras = FunctionReturnType<Answer<"siteOverview">["overviewExtras"]>;

/** The Overview: the panels' figures against the check before the dates, the assistants, and the website beside its rivals. */
export function overviewSeen(line: Line | undefined, extras: Extras | undefined, engineLabel: (engine: string) => string, names: Words) {
  if (!line) return undefined;
  const newest = newestOfEach(line.points);
  const named = (point: Point | null | undefined, engine: string) => point?.ai.find((entry) => entry.engine === engine);
  return {
    headline: checksFor(line, {
      estimatedTraffic: (point) => point.estimatedTraffic,
      keywords: (point) => point.rankedKeywordsTotal ?? point.keywords,
      top3: (point) => (point.allBands ?? point.bands)?.p01_03,
      referringDomains: (point) => point.referringDomains,
      aiOverviewRefs: (point) => point.aiOverviewRefs,
      paidKeywords: (point) => point.paidKeywords,
      paidTraffic: (point) => point.paidTraffic,
    }, { host: line.host }),
    assistants: { engines: (newest?.ai ?? []).map((entry) => ({ name: engineLabel(entry.engine), named: entry.named, asked: entry.asked, ...(named(line.before, entry.engine) ? { namedBefore: named(line.before, entry.engine)!.named } : {}) })) },
    ...(newest?.allBands ? { bands: newest.allBands } : {}),
    ...(extras ? {
      rivals: {
        youName: line.host, you: { visits: extras.competitors.you.visits, keywords: extras.competitors.you.keywords },
        rivals: extras.competitors.rivals.map((row) => ({ name: row.host, visits: row.visits, keywords: row.keywords, shared: row.shared, sharedVisits: row.sharedVisits })),
        middleName: names.middle ?? "", sharedName: names.shared ?? "",
      },
    } : {}),
  };
}

/** Paid search: the boxes against the check before the dates (or the first in them), and every check by its day. */
export function paidSeen(line: Line, names: Words) {
  const points = line.points.filter((point) => point.paidKeywords !== undefined);
  const newest = points.at(-1) ?? null;
  const before = line.before?.paidKeywords !== undefined ? line.before : points.length > 1 ? points[0] : null;
  return {
    paid: newest ? {
      ...names,
      paidKeywords: newest.paidKeywords ?? null, paidKeywordsBefore: before?.paidKeywords ?? null,
      paidTraffic: newest.paidTraffic ?? null, paidTrafficBefore: before?.paidTraffic ?? null,
      day: newest.lastDay, ...(before ? { dayBefore: before.lastDay } : {}),
    } : null,
    checks: points.map((point) => ({ day: point.lastDay, paidKeywords: point.paidKeywords ?? null, paidTraffic: point.paidTraffic ?? null })),
  };
}

type Audit = NonNullable<FunctionReturnType<Answer<"siteCrawl">["siteAudit"]>>;

/** Site audit: the newest crawl's boxes and problems by their names on screen, the crawls against the one before, the money pages. */
export function auditSeen(audit: Audit, line: Line | undefined, moneyPages: unknown, label: (check: string) => string, names: Words) {
  return {
    crawl: {
      day: audit.day, pagesCrawled: audit.pagesCrawled, pagesFound: audit.pagesFound, onPageScore: audit.onPageScore, turnedAway: audit.turnedAway ? 1 : 0,
      issues: audit.issues.map((issue) => ({ name: label(issue.check), severity: issue.severity, pages: issue.pages })),
      names: { errors: names.errors ?? "" },
    },
    crawls: checksFor(line, { brokenPages: (point) => point.brokenPages, onPageScore: (point) => point.onPageScore, crawledPages: (point) => point.crawledPages }, { host: names.host ?? "" }),
    ...(moneyPages ? { moneyPages } : {}),
  };
}
