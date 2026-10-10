import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../utils/hakkenSees";

/**
 * What Hakken sees on the Organic search screens (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md §6, "Organic search"): fixed rules
 * over each screen's own rows, most important first. The lists return their
 * box worked out over the whole list, whatever the filters; a page's record
 * names its problems in the reader's words, so its screen runs the rule.
 * New and lost keywords shares Wins and losses' box (`google.ts` `movesSees`).
 */

type Maybe<T> = T | null;

/** Google's first page; "just off it" is 11 to 13, as Position bands' closest searches are. */
const PAGE_ONE = 10;
const JUST_OFF = 13;

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Organic search → Keywords: the searches ranked for, those bringing most visits, and those just off page one. */
export function keywordsSees(rows: ReadonlyArray<{ keyword: string; position: number | null; volume: number | null; traffic: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const ranked = rows.filter((row) => row.position !== null);
  const visits = [...ranked].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0))[0];
  const justOff = ranked.filter((row) => row.position! > PAGE_ONE && row.position! <= JUST_OFF).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "ranking", a: ranked.length, b: ranked.filter((row) => row.position! <= PAGE_ONE).length },
    visits && (visits.traffic ?? 0) > 0 ? { code: "mostVisits", text: visits.keyword, a: visits.traffic! } : null,
    justOff[0] ? { code: "justOff", a: justOff.length, text: justOff[0].keyword } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    justOff[0] ? { code: "pushUp", text: justOff[0].keyword, link: "seeSearch", to: toRecord("keyword", justOff[0].keyword) } : null,
    visits && (visits.traffic ?? 0) > 0 ? { code: "keepTop", text: visits.keyword, link: "seeSearch", to: toRecord("keyword", visits.keyword) } : null,
  ];
  return seen(says, steps);
}

/** Organic search → Top pages: the page bringing most visits, its share, and pages ranking only past page one. */
export function pagesSees(pages: ReadonlyArray<{ path: string; keywords: number; traffic: number | null; bestPosition: number | null }>): Seen {
  if (pages.length === 0) return seen([{ code: "none" }]);
  const total = pages.reduce((sum, page) => sum + (page.traffic ?? 0), 0);
  const top = [...pages].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0) || right.keywords - left.keywords)[0];
  const pageTwo = pages.filter((page) => page.bestPosition !== null && page.bestPosition > PAGE_ONE).sort((left, right) => right.keywords - left.keywords);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "pages", a: pages.length },
    total > 0 ? { code: "topPage", text: top.path || "/", a: percent(top.traffic ?? 0, total) } : null,
    pageTwo[0] ? { code: "offPageOne", a: pageTwo.length, text: pageTwo[0].path || "/" } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    total > 0 ? { code: "seeTop", text: top.path || "/", link: "seePage", to: toRecord("page", top.path) } : null,
    pageTwo[0] ? { code: "lift", text: pageTwo[0].path || "/", link: "seePage", to: toRecord("page", pageTwo[0].path) } : null,
  ];
  return seen(says, steps);
}

type Band = "p01_03" | "p04_10" | "p11_20" | "p21_50" | "p51_up";
const ON_PAGE_ONE = new Set<string>(["p01_03", "p04_10"]);

/** Organic search → Position bands: searches on page one, those moved onto and off it, and the closest to it. */
export function bandsSees(result: {
  rankingDay: string | null;
  bands: Record<Band, number>;
  moves: ReadonlyArray<{ from: string; to: string; count: number }>;
  closest: { rows: ReadonlyArray<{ keyword: string }>; total: number };
}): Seen {
  if (result.rankingDay === null) return seen([{ code: "none" }]);
  const all = Object.values(result.bands).reduce((sum, count) => sum + count, 0);
  const onto = result.moves.filter((move) => ON_PAGE_ONE.has(move.to) && !ON_PAGE_ONE.has(move.from)).reduce((sum, move) => sum + move.count, 0);
  const off = result.moves.filter((move) => ON_PAGE_ONE.has(move.from) && !ON_PAGE_ONE.has(move.to)).reduce((sum, move) => sum + move.count, 0);
  const closest = result.closest.rows[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "pageOne", a: result.bands.p01_03 + result.bands.p04_10, b: all },
    onto > 0 || off > 0 ? { code: "movedOnOff", a: onto, b: off } : null,
    closest ? { code: "closest", a: result.closest.total, text: closest.keyword } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    closest ? { code: "pushUp", text: closest.keyword, link: "seeSearch", to: toRecord("keyword", closest.keyword) } : null,
    off > 0 ? { code: "seeOff", a: off, link: "movedSearches", to: toPage("keywords/bands/moved") } : null,
  ];
  return seen(says, steps);
}

/** Organic search → the searches that changed band: up against down, and the biggest drop. */
export function bandMovesSees(rows: ReadonlyArray<{ keyword: string; was: number | null; now: number; volume: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const up = rows.filter((row) => row.was === null || row.now < row.was).length;
  const drops = rows.filter((row) => row.was !== null && row.now > row.was).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "moved", a: up, b: drops.length },
    drops[0] ? { code: "biggestDrop", text: drops[0].keyword, a: drops[0].was!, b: drops[0].now } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    drops[0] ? { code: "seeDrop", text: drops[0].keyword, link: "seeSearch", to: toRecord("keyword", drops[0].keyword) } : null,
  ];
  return seen(says, steps);
}

/** Organic search → Site structure: the folder bringing most visits, and the one with most searches but fewest in the top three. */
export function sectionsSees(rows: ReadonlyArray<{ section: string; keywords: number; top3: number; traffic: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const total = rows.reduce((sum, row) => sum + (row.traffic ?? 0), 0);
  const top = [...rows].sort((left, right) => (right.traffic ?? 0) - (left.traffic ?? 0) || right.keywords - left.keywords)[0];
  // Of the folders ranking for more than a handful, the one turning the fewest into a top-three place.
  const weak = rows.filter((row) => row.keywords >= 10 && row !== top).sort((left, right) => left.top3 / left.keywords - right.top3 / right.keywords || right.keywords - left.keywords)[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "folders", a: rows.length },
    total > 0 ? { code: "topFolder", text: top.section, a: percent(top.traffic ?? 0, total) } : null,
    weak ? { code: "weakFolder", text: weak.section, a: weak.keywords, b: weak.top3 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    weak ? { code: "seeFolder", text: weak.section, link: "folderPages", to: toPage("keywords/pages", { section: weak.section }) } : null,
    total > 0 ? { code: "seeFolder", text: top.section, link: "folderPages", to: toPage("keywords/pages", { section: top.section }) } : null,
  ];
  return seen(says, steps);
}

/** Organic search → one search: where you stand and moved from, who is above you, and whether Google changed your page. */
export function keywordRecordSees(record: {
  keyword: string;
  rank: { position: number | null; previousPosition: number | null; page: string; previousPage: string | null } | null;
  tracked: { lastPosition: number | null } | null;
  serp: { results: ReadonlyArray<{ position: number; domain: string; isYou: boolean }> } | null;
}): Seen {
  const position = record.rank?.position ?? record.tracked?.lastPosition ?? null;
  const results = record.serp?.results ?? [];
  const mine = results.find((result) => result.isYou)?.position ?? position;
  const above = results.filter((result) => !result.isYou && (mine === null ? result.position <= PAGE_ONE : result.position < mine));
  const first = above[0] ?? null;
  const page = record.rank?.page ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    position === null ? { code: "notRanking", text: record.keyword }
    : record.rank?.previousPosition != null && record.rank.previousPosition !== position ? { code: "moved", a: position, b: record.rank.previousPosition }
    : { code: "position", a: position },
    first ? { code: "above", text: first.domain, a: above.length } : null,
    record.rank?.previousPage && page && record.rank.previousPage !== page ? { code: "pageChanged", text: page || "/", more: record.rank.previousPage || "/" } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    page !== null ? { code: "seePage", text: page || "/", link: "seePage", to: toRecord("page", page) } : null,
    first ? { code: "seeAbove", text: first.domain, link: "seeWebsite", to: toRecord("website", first.domain) } : null,
  ];
  return seen(says, steps);
}

/** Organic search → one page: the searches it ranks for, the problems found on it, the links to it, and AI answers citing it. */
export function pageRecordSees(record: {
  page: string;
  rank: { keywords: number; top3: number; topKeyword: string } | null;
  crawl: { problems: readonly string[] } | null;
  cited: { times: number };
  links: ReadonlyArray<{ status: string }>;
}, problemName: (check: string) => string): Seen {
  if (!record.rank && !record.crawl) return seen([{ code: "notHeld" }]);
  const problems = record.crawl?.problems ?? [];
  const live = record.links.filter((link) => link.status !== "LOST").length;
  const says: Array<Maybe<SeenPhrase>> = [
    record.rank ? { code: "searches", a: record.rank.keywords, b: record.rank.top3, text: record.rank.topKeyword } : { code: "notRanking" },
    problems[0] ? { code: "problems", a: problems.length, text: problemName(problems[0]) } : record.crawl ? { code: "noProblems" } : null,
    { code: "links", a: live },
    record.cited.times > 0 ? { code: "cited", a: record.cited.times } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    problems[0] ? { code: "fixProblem", text: problemName(problems[0]), link: "seeProblem", to: toRecord("problem", problems[0]) } : null,
    record.rank ? { code: "seeTopSearch", text: record.rank.topKeyword, link: "seeSearch", to: toRecord("keyword", record.rank.topKeyword) } : null,
  ];
  return seen(says, steps);
}
