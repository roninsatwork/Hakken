import { websitesOf } from "../../backlinks/_components/linkSees";

/**
 * What each Keywords screen hands the eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): the figures it
 * shows, cut to the ones its rules read (`convex/utils/sees/own/visibility.ts`, Backlinks and Keywords' block), the whole
 * list summed on the server where the table shows one page of it, and the rivals beside yours where a rule sets one
 * against the other. Built here so the screen and the every-period test hand the rules the same figures. Never what a
 * click costs or what visits would be worth (Anthony, 2026-11-03: "Yes, all of it"): a row's `cpc` and `trafficValue`
 * stay behind. Names are the reader's own words, from the screen's translations.
 */

type Figures = Record<string, unknown>;
type Line = { host: string; isYou: boolean; points: readonly Figures[]; before: Figures | null };
type Bands = { p01_03: number; p04_10: number; p11_20: number; p21_50: number; p51_up: number };

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBands = (value: unknown): value is Bands => Boolean(value) && typeof value === "object" && isNumber((value as Bands).p01_03);
const pageOneOf = (bands: Bands) => bands.p01_03 + bands.p04_10;
const sumOf = (bands: Bands) => bands.p01_03 + bands.p04_10 + bands.p11_20 + bands.p21_50 + bands.p51_up;

/**
 * A chart point with the supplier's bands across every search the site ranks for (`allBands`) read as plain figures:
 * the searches on Google's first page, in its top three, on page two, and further down, and their share of every search.
 */
function withBands(point: Figures | null): Figures | null {
  if (!point || !isBands(point.allBands)) return point;
  const bands = point.allBands;
  const total = sumOf(bands);
  return {
    ...point,
    pageOneSearches: pageOneOf(bands),
    top3: bands.p01_03,
    pageTwoSearches: bands.p11_20,
    furtherSearches: bands.p21_50 + bands.p51_up,
    bandSearches: total,
    ...(total > 0 ? {
      pageOnePercent: Math.round((1000 * pageOneOf(bands)) / total) / 10,
      top3Percent: Math.round((1000 * bands.p01_03) / total) / 10,
      furtherPercent: Math.round((1000 * (bands.p21_50 + bands.p51_up)) / total) / 10,
      pageTwoPercent: Math.round((1000 * bands.p11_20) / total) / 10,
    } : {}),
  };
}
const linesWithBands = (lines: readonly Line[]): Line[] => lines.map((line) => ({ ...line, points: line.points.map((point) => withBands(point)!), before: withBands(line.before) }));

/** Each website's searches as the supplier counts them at the end of the dates: ranked for, on page one, moved at its newest check. */
const SEARCH_FIELDS = ["rankedKeywordsTotal", "estimatedTraffic", "pageOneSearches", "top3", "pageTwoSearches", "furtherSearches", "bandSearches", "pageOnePercent", "top3Percent", "furtherPercent", "pageTwoPercent", "keywordsNew", "keywordsUp", "keywordsDown", "keywordsLost"] as const;

/** A row of a keyword list, as the eye may read it: never its cost per click or the worth of its visits. */
const searchRow = (row: { keyword: string; position: number | null; change: number; volume: number | null; traffic: number | null; page: string; status?: string }) => ({
  name: row.keyword,
  ...(row.position !== null ? { position: row.position } : {}),
  change: row.change,
  ...(row.volume !== null ? { volume: row.volume } : {}),
  ...(row.traffic !== null ? { traffic: Math.round(row.traffic * 10) / 10 } : {}),
  page: row.page,
  ...(row.status ? { status: row.status } : {}),
});

type KeywordFigures = {
  day: string | null; searches: number; traffic: number; volume: number; top3: number; pageOne: number;
  statuses: Record<"NEW" | "UP" | "DOWN" | "SAME", { searches: number; traffic: number; volume: number }>;
  intoPageOne: { searches: number; traffic: number; volume: number }; outOfPageOne: { searches: number; traffic: number; volume: number };
  intents: ReadonlyArray<{ intent: string; searches: number; traffic: number }>;
  climbs: ReadonlyArray<{ keyword: string; position: number; before: number; volume: number | null; traffic: number | null }>;
  drops: ReadonlyArray<{ keyword: string; position: number; before: number; volume: number | null; traffic: number | null }>;
  topSearch?: { keyword: string; position: number; volume: number | null; traffic: number } | null;
};
type Page<Row> = { rows: readonly Row[]; total: number; page: number; pages: number };
type KeywordRow = { keyword: string; position: number | null; change: number; volume: number | null; traffic: number | null; page: string; status: string };

const moveRow = (row: KeywordFigures["climbs"][number]) => ({ name: row.keyword, position: row.position, positionBefore: row.before, ...(row.volume !== null ? { volume: row.volume } : {}), ...(row.traffic !== null ? { traffic: row.traffic } : {}) });

/**
 * Keywords: the page of searches on screen; the whole list summed on the server (`keywordFigures`): the searches that
 * rose and fell at the newest check with the visitors they bring, those onto and off Google's first page, the biggest
 * climbs and drops; each website's searches as the supplier counts them (the chart's bands); and the chart's points.
 */
export function keywordsSees(
  page: Page<KeywordRow> | undefined,
  figures: KeywordFigures | null | undefined,
  lines: readonly Line[] | undefined,
  names: { rivals: string; rose: string; fell: string },
) {
  if (!page || !lines) return undefined;
  const banded = linesWithBands(lines);
  const you = banded.find((line) => line.isYou);
  return {
    keywords: { rows: page.rows.map(searchRow), total: page.total, page: page.page, pages: page.pages },
    ...(figures ? {
      whole: {
        day: figures.day, searches: figures.searches, traffic: figures.traffic, top3: figures.top3, pageOneSearches: figures.pageOne,
        rose: figures.statuses.UP, fell: figures.statuses.DOWN, fresh: figures.statuses.NEW, same: figures.statuses.SAME,
        intoPageOne: figures.intoPageOne, outOfPageOne: figures.outOfPageOne,
        climbs: figures.climbs.map(moveRow), drops: figures.drops.map(moveRow),
        ...(figures.topSearch ? { topSearch: { name: figures.topSearch.keyword, position: figures.topSearch.position, traffic: figures.topSearch.traffic, ...(figures.topSearch.volume !== null ? { volume: figures.topSearch.volume } : {}) } } : {}),
      },
    } : {}),
    websites: websitesOf(banded, SEARCH_FIELDS),
    chart: (you?.points ?? []).filter((point) => isNumber(point.pageOneSearches)).map((point) => ({ day: point.day, pageOneSearches: point.pageOneSearches, top3: point.top3, pageTwoSearches: point.pageTwoSearches, furtherSearches: point.furtherSearches })),
    names,
  };
}

type BandMoves = {
  rankingDay: string | null; previousDay: string | null; start: string | null; bands: Bands;
  moves: ReadonlyArray<{ from: string; to: string; count: number }>;
  closest: { rows: ReadonlyArray<{ keyword: string; position: number; volume: number | null; traffic: number | null; page: string }>; total: number };
};
const ON_PAGE_ONE = new Set(["p01_03", "p04_10"]);

/**
 * Position bands: each website's searches on Google's first page, in its top three and further down, at the end of the
 * dates (the chart, as the supplier counts every search ranked for); the moves between bands at the newest check, added
 * up onto page one and off it; the searches just off page one; and the list's searches on page one, for what a typical
 * one is searched.
 */
export function bandsSees(lines: readonly Line[] | undefined, moves: BandMoves | undefined, moved: { rows: ReadonlyArray<{ keyword: string; was: number | null; now: number; volume: number | null }> } | undefined, names: { rivals: string; pageOne: string; pageTwo: string; closestOthers: string }) {
  if (!lines || !moves) return undefined;
  const banded = linesWithBands(lines);
  const you = banded.find((line) => line.isYou);
  const into = moves.moves.filter((move) => ON_PAGE_ONE.has(move.to) && !ON_PAGE_ONE.has(move.from)).reduce((sum, move) => sum + move.count, 0);
  const outOf = moves.moves.filter((move) => ON_PAGE_ONE.has(move.from) && !ON_PAGE_ONE.has(move.to)).reduce((sum, move) => sum + move.count, 0);
  return {
    websites: websitesOf(banded, SEARCH_FIELDS),
    ...(moves.start === null && moves.previousDay ? { moved: { intoPageOne: into, outOfPageOne: outOf, day: moves.rankingDay, dayBefore: moves.previousDay } } : {}),
    closest: { rows: moves.closest.rows.map((row) => ({ name: row.keyword, position: row.position, ...(row.volume !== null ? { volume: row.volume } : {}), ...(row.traffic !== null ? { traffic: Math.round(row.traffic) } : {}) })), total: moves.closest.total },
    ...(moved ? { bandMoves: moved.rows.map((row) => ({ name: row.keyword, position: row.now, ...(row.was !== null ? { positionBefore: row.was } : {}), ...(row.volume !== null ? { volume: row.volume } : {}) })) } : {}),
    listBands: moves.bands,
    chart: (you?.points ?? []).filter((point) => isNumber(point.pageOneSearches)).map((point) => ({ day: point.day, pageOneSearches: point.pageOneSearches, top3: point.top3, pageTwoSearches: point.pageTwoSearches, furtherSearches: point.furtherSearches })),
    names,
  };
}

type KeywordRecord = {
  keyword: string;
  rank: { position: number | null; status: string; page: string; volume: number | null; traffic: number | null; previousPosition: number | null; day: string } | null;
  search: { volume: number | null; difficulty: number | null; intent: string } | null;
  rivals: ReadonlyArray<{ host: string; position: number | null; page: string | null }>;
  checkedOnce: { position: number | null; day: string } | null;
  tracked: { lastPosition: number | null } | null;
};
type Positions = ReadonlyArray<{ keyword: string; points: ReadonlyArray<{ day: string; position: number | null }> }>;

/**
 * A search's own screen: where you rank for it now and over the dates (its chart), with each rival you watch on the same
 * search, best placed first; its monthly searches and the visitors it brings you. Never what a click costs nor what the
 * page's visits would be worth (Anthony, 2026-11-03: "Yes, all of it").
 */
export function searchSees(
  record: KeywordRecord | null | undefined,
  positions: Positions | undefined,
  fromAi: { questions: readonly string[]; engines: readonly string[]; timesSeen: number; answers: ReadonlyArray<{ stance: string }> } | null | undefined,
  host: string,
  names: { rivals: string; rivalsAbove: string; rivalsMissing: string },
) {
  if (!record) return undefined;
  const points = (positions?.[0]?.points ?? []).filter((point) => isNumber(point.position));
  const rank = record.rank && record.rank.status !== "LOST" ? record.rank : null;
  const position = rank?.position ?? record.tracked?.lastPosition ?? record.checkedOnce?.position ?? null;
  const first = points[0]?.position ?? null;
  const last = points.at(-1)?.position ?? null;
  return {
    search: {
      name: record.keyword,
      ...(position !== null ? { position } : {}),
      // Where it stood at the start of the dates: the chart's first point, where the dates hold two or more.
      ...(points.length >= 2 && first !== null && last !== null ? { positionBefore: first, positionAtEnd: last } : {}),
      ...(record.search?.volume ?? rank?.volume ? { volume: (record.search?.volume ?? rank?.volume)! } : {}),
      ...(rank?.traffic !== null && rank?.traffic !== undefined ? { traffic: Math.round(rank.traffic) } : {}),
      ...(record.search?.difficulty !== null && record.search?.difficulty !== undefined ? { difficulty: record.search.difficulty } : {}),
      ...(rank?.page ? { page: rank.page } : {}),
    },
    websites: [
      { name: host, you: true, ...(position !== null ? { placeOnGoogle: position } : {}) },
      ...record.rivals.map((rival) => ({ name: rival.host, you: false, ...(rival.position !== null ? { placeOnGoogle: rival.position } : {}), ...(rival.page ? { page: rival.page } : {}) })),
    ],
    chart: points.map((point) => ({ day: point.day, position: point.position })),
    // The search as AI answers run it, as its box counts: the questions, the assistants, and the answers naming you.
    ...(fromAi ? { fromAi: { questions: fromAi.questions.length, engines: fromAi.engines.length, timesSeen: fromAi.timesSeen, answers: fromAi.answers.length, named: fromAi.answers.filter((answer) => answer.stance !== "NOT_NAMED").length } } : {}),
    names,
  };
}

type Step = { day: string; lastDay: string; kind: string; rankedNew: number | null; rankedUp: number | null; rankedDown: number | null; rankedLost: number | null; rankedLeft: number | null };
type Checks = { newest: (Omit<Step, "lastDay"> & { kind: string }) | null; steps: readonly Step[] };

/**
 * Keywords › New and lost: each check in the dates with its new, up, down and lost searches, added up, beside the same
 * span before; the newest check's moves, as listed (the page of them on screen); and, where a check had nothing before
 * it, the supplier's own moves across every search ranked for (`coverage.moves`), with each website's beside them.
 */
export function newLostSees(
  checks: Checks | undefined,
  checksBefore: Checks | undefined,
  moves: Page<{ keyword: string; position: number | null; previousPosition: number | null; change: number; volume: number | null }> | undefined,
  every: { fresh: number | null; up: number | null; down: number | null; lost: number | null } | null | undefined,
  lines: readonly Line[] | undefined,
  names: { rivals: string; rose: string; fell: string },
) {
  if (!checks) return undefined;
  const counted = (steps: readonly Step[]) => steps.filter((step) => step.rankedNew !== null);
  const add = (steps: readonly Step[]) => ({
    searchesNew: steps.reduce((sum, step) => sum + (step.rankedNew ?? 0), 0),
    searchesUp: steps.reduce((sum, step) => sum + (step.rankedUp ?? 0), 0),
    searchesDown: steps.reduce((sum, step) => sum + (step.rankedDown ?? 0), 0),
    searchesLost: steps.reduce((sum, step) => sum + (step.rankedLost ?? 0) + (step.rankedLeft ?? 0), 0),
    checks: steps.length,
  });
  const mine = counted(checks.steps);
  const theirs = counted(checksBefore?.steps ?? []);
  return {
    steps: checks.steps.map((step) => ({ day: step.lastDay, ...(step.rankedNew !== null ? { searchesNew: step.rankedNew, searchesUp: step.rankedUp ?? 0, searchesDown: step.rankedDown ?? 0, searchesLost: (step.rankedLost ?? 0) + (step.rankedLeft ?? 0) } : { start: true }) })),
    ...(mine.length > 0 ? { totals: add(mine) } : {}),
    ...(theirs.length > 0 ? { before: add(theirs) } : {}),
    ...(checks.newest ? { newest: { day: checks.newest.day, start: checks.newest.rankedNew === null } } : {}),
    ...(moves ? { moves: { rows: moves.rows.map((row) => ({ name: row.keyword, ...(row.position !== null ? { position: row.position } : {}), ...(row.previousPosition !== null ? { positionBefore: row.previousPosition } : {}), ...(row.volume !== null ? { volume: row.volume } : {}) })), total: moves.total, page: moves.page, pages: moves.pages } } : {}),
    ...(every && every.fresh !== null ? { everySearch: { searchesNew: every.fresh, searchesUp: every.up ?? 0, searchesDown: every.down ?? 0, searchesLost: every.lost ?? 0 } } : {}),
    ...(lines ? { websites: websitesOf(linesWithBands(lines), SEARCH_FIELDS) } : {}),
    names,
  };
}

type PageFigures = {
  pages: number; searches: number; traffic: number; quietPages: number; top: { page: string; traffic: number; searches: number } | null;
  topFiveTraffic?: number; oneSearchPages?: number;
  kinds: ReadonlyArray<{ kind: string; classified: boolean; sorted: boolean; pages: number; searches: number; traffic: number }>;
};

/**
 * Top pages: the page of pages on screen (never the worth of their visits); every page summed on the server
 * (`pageFigures`): the page bringing most visitors, each kind of page with its share of the searches and of the
 * visitors, in the reader's words for each kind (`kindName`); and the chart's ranking pages and visitors over the dates.
 */
export function pagesSees(
  page: Page<{ page: string; keywords: number; traffic: number | null; bestPosition: number | null; referringDomains: number | null }> | undefined,
  figures: PageFigures | null | undefined,
  lines: readonly Line[] | undefined,
  kindName: (kind: string) => string,
  names: { website: string; itsSearches: string; quietPages: string; topFive: string; oneSearch: string },
) {
  if (!page || !lines) return undefined;
  const you = lines.find((line) => line.isYou);
  return {
    pages: { rows: page.rows.map((row) => ({ name: row.page || "/", keywords: row.keywords, ...(row.traffic !== null ? { traffic: Math.round(row.traffic) } : {}), ...(row.bestPosition !== null ? { bestPosition: row.bestPosition } : {}), ...(row.referringDomains !== null ? { referringDomains: row.referringDomains } : {}) })), total: page.total, page: page.page, pages: page.pages },
    ...(figures ? {
      whole: {
        pages: figures.pages, keywords: figures.searches, traffic: figures.traffic, quietPages: figures.quietPages,
        ...(figures.topFiveTraffic !== undefined ? { topFiveTraffic: figures.topFiveTraffic } : {}),
        ...(figures.oneSearchPages !== undefined ? { oneSearchPages: figures.oneSearchPages } : {}),
        ...(figures.top ? { top: { name: figures.top.page || "/", traffic: figures.top.traffic, keywords: figures.top.searches } } : {}),
      },
      kinds: figures.kinds.map((kind) => ({
        name: kindName(kind.kind), sorted: kind.sorted, pages: kind.pages, keywords: kind.searches, traffic: kind.traffic,
        ...(figures.searches > 0 ? { searchesPercent: Math.round((1000 * kind.searches) / figures.searches) / 10 } : {}),
        ...(figures.traffic > 0 ? { trafficPercent: Math.round((1000 * kind.traffic) / figures.traffic) / 10 } : {}),
      })),
    } : {}),
    chart: (you?.points ?? []).filter((point) => isNumber(point.pages) || isNumber(point.estimatedTraffic)).map((point) => ({ day: point.day, ...(isNumber(point.pages) ? { pages: point.pages } : {}), ...(isNumber(point.estimatedTraffic) ? { estimatedTraffic: point.estimatedTraffic } : {}) })),
    names,
  };
}

/**
 * Site structure: every section the website's pages sit in, with its pages, searches and visitors, and each one's share
 * of the website's searches and visitors and of its searches in Google's top three, worked out over the whole list here,
 * before the eye keeps its first rows.
 */
export function structureSees(answer: { rows: ReadonlyArray<{ section: string; pages: number; keywords: number; top3: number; traffic: number | null; volumeSum: number | null }> } | undefined, names: { itsSearches: string; wholeWebsite: string }) {
  if (!answer) return undefined;
  const keywords = answer.rows.reduce((sum, row) => sum + row.keywords, 0);
  const traffic = answer.rows.reduce((sum, row) => sum + (row.traffic ?? 0), 0);
  const top3 = answer.rows.reduce((sum, row) => sum + row.top3, 0);
  return {
    sections: [...answer.rows].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0)).map((row) => ({
      name: row.section, pages: row.pages, keywords: row.keywords, top3: row.top3, ...(row.traffic !== null ? { traffic: Math.round(row.traffic) } : {}),
      ...(keywords > 0 ? { searchesPercent: Math.round((1000 * row.keywords) / keywords) / 10 } : {}),
      ...(traffic > 0 ? { trafficPercent: Math.round((1000 * (row.traffic ?? 0)) / traffic) / 10 } : {}),
      ...(row.keywords > 0 ? { top3Percent: Math.round((1000 * row.top3) / row.keywords) / 10 } : {}),
    })),
    whole: { sections: answer.rows.length, keywords, traffic: Math.round(traffic), top3, ...(keywords > 0 ? { top3Percent: Math.round((1000 * top3) / keywords) / 10 } : {}) },
    names,
  };
}

/** The guessed money a Visibility answer carries: what a click costs advertisers, and what visits would be worth as ads. */
const GUESSED_MONEY = new Set(["cpc", "trafficValue", "trafficCost", "paidTrafficCost"]);

/**
 * An answer handed to the eye without the guessed money it carries (Anthony, 2026-11-03: "Yes, all of it"): the figures
 * stay stored, but no screen shows them, so neither the eye's writer nor its chat reads them. For a page whose answer is
 * handed whole, as a page's own screen hands its record and its searches.
 */
export function withoutGuessedMoney<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutGuessedMoney(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([field]) => !GUESSED_MONEY.has(field)).map(([field, inner]) => [field, withoutGuessedMoney(inner)])) as T;
}
