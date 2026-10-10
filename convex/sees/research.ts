import { seen, type Seen, type SeenPhrase, type SeenStep, type SeenTarget } from "../utils/hakkenSees";

/**
 * What Hakken sees on Keyword research's screens (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md §6, "Detail screens, the Websites
 * list and Keyword research"): fixed rules over the rows each screen already
 * holds, run on the screen. Never a step that buys: a step opens a lookup, a
 * screen of one, or the website's own record of a search.
 */

type Maybe<T> = T | null;

/** Keyword research's own addresses (`keyword-research/_components/useLookup.ts`), and a website's record of a search. */
const lookupAt = (lookupId: string, segment = ""): SeenTarget => ({ url: `/app/keyword-research/${lookupId}${segment}` });
const searchOn = (siteId: string, keyword: string): SeenTarget => ({ url: `/app/sites/${siteId}/keywords/keyword?keyword=${encodeURIComponent(keyword)}` });

/** Google's first page. */
const PAGE_ONE = 10;

/** A search's chance: how often it is searched, weighed by how easy the top ten is to join. */
const chance = (row: { volume: number | null; difficulty: number | null }) => (row.volume ?? 0) * (100 - (row.difficulty ?? 100));

const offPageOne = (position: number | null) => position === null || position > PAGE_ONE;

/** Keyword research: the searches looked up and listed, and the best chance among those the website is not on page one for. */
export function researchStartSees(
  lookups: ReadonlyArray<{ lookupId: string; keyword: string; host: string | null; volume: number | null; difficulty: number | null; position: number | null; notInTop100: boolean }>,
  lists: readonly unknown[],
): Seen {
  if (lookups.length === 0) return seen([{ code: "start" }]);
  const best = lookups.filter((row) => row.host !== null && (row.notInTop100 || offPageOne(row.position)) && row.volume !== null && row.difficulty !== null)
    .sort((left, right) => chance(right) - chance(left))[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "lookups", a: lookups.length, b: lists.length },
    best ? { code: "bestChance", text: best.keyword, a: best.volume!, b: best.difficulty! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [best ? { code: "openLookup", text: best.keyword, link: "openLookup", to: lookupAt(best.lookupId) } : null];
  return seen(says, steps);
}

/** Keyword research → a lookup's Overview: how often it is searched and how hard, where the website stands, and the verdict. */
export function lookupSees(lookup: {
  lookupId: string;
  state: string;
  overview: { volume: number | null; difficulty: number | null } | null;
  topResult: { domain: string; visits: number | null } | null;
  forWebsite: { host: string; position: number | null; notInTop100: boolean; verdict: string | null } | null;
}): Seen {
  if (!lookup.overview) return seen([{ code: lookup.state === "WAITING" ? "waiting" : "none" }]);
  const site = lookup.forWebsite;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "volume", a: lookup.overview.volume ?? 0, b: lookup.overview.difficulty ?? 0 },
    !site ? null
    : site.notInTop100 || site.position === null ? { code: "youDont", text: site.host }
    : { code: site.position <= PAGE_ONE ? "youRank" : "youRankLow", text: site.host, a: site.position },
    site?.verdict ? { code: `verdict.${site.verdict}` } : lookup.topResult ? { code: "top", text: lookup.topResult.domain, a: lookup.topResult.visits ?? 0 } : null,
  ];
  const steps: SeenStep[] = [
    { code: "seeIdeas", link: "keywordIdeas", to: lookupAt(lookup.lookupId, "/ideas?kind=terms") },
    { code: "seeResults", link: "googleResults", to: lookupAt(lookup.lookupId, "/results") },
  ];
  return seen(says, steps);
}

/** Keyword research → Keyword ideas: the ideas, those the website ranks for, and the best chance it is not on page one for. */
export function ideasSees(ideas: { siteId: string | null; rows: ReadonlyArray<{ keyword: string; volume: number | null; difficulty: number | null; position: number | null }> }): Seen {
  if (ideas.rows.length === 0) return seen([{ code: "none" }]);
  const ranking = ideas.rows.filter((row) => row.position !== null).length;
  const best = ideas.rows.filter((row) => offPageOne(row.position) && row.volume !== null && row.difficulty !== null).sort((left, right) => chance(right) - chance(left))[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    ideas.siteId ? { code: "ideasRanking", a: ideas.rows.length, b: ranking } : { code: "ideas", a: ideas.rows.length },
    best ? { code: "best", text: best.keyword, a: best.volume!, b: best.difficulty! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [best && ideas.siteId ? { code: "seeSearch", text: best.keyword, link: "seeSearch", to: searchOn(ideas.siteId, best.keyword) } : null];
  return seen(says, steps);
}

/** Keyword research → Google's results: who is first, where the website is, and how many rivals are on the page. */
export function resultsSees(results: { rows: ReadonlyArray<{ position: number; url: string; domain: string; who: "YOU" | "RIVAL" | null; visits: number | null }> }): Seen {
  const rows = [...results.rows].sort((left, right) => left.position - right.position);
  if (rows.length === 0) return seen([{ code: "none" }]);
  const you = rows.find((row) => row.who === "YOU") ?? null;
  const rivals = rows.filter((row) => row.who === "RIVAL").length;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "top", text: rows[0].domain, a: rows[0].visits ?? 0 },
    you ? { code: "youAt", a: you.position } : null,
    rivals > 0 ? { code: "rivals", a: rivals } : null,
  ];
  return seen(says, [{ code: "seeTop", text: rows[0].domain, link: "visitPage", to: { url: rows[0].url } }]);
}

/** Keyword research → What the AI says: answers naming the website, the rival named most, and its pages cited. */
export function answersSees(answers: { figures: { answered: number; nameYou: number; nameARival: number; rivalMost: string | null; pagesCited: number; pagesCitedYours: number } | null; host: string | null }): Seen {
  const figures = answers.figures;
  if (!figures || figures.answered === 0) return seen([{ code: "none" }]);
  const says: Array<Maybe<SeenPhrase>> = [
    answers.host ? { code: "named", a: figures.nameYou, b: figures.answered } : { code: "answered", a: figures.answered },
    figures.rivalMost ? { code: "rivalMost", text: figures.rivalMost, a: figures.nameARival } : null,
    answers.host ? { code: "cited", a: figures.pagesCitedYours, b: figures.pagesCited } : null,
  ];
  return seen(says);
}

/** Keyword research → a list: its searches, those tracked, and the biggest the website does not rank for. */
export function researchListSees(list: { siteId: string | null; rows: ReadonlyArray<{ keyword: string; volume: number | null; position: number | null; tracked: boolean }> }): Seen {
  if (list.rows.length === 0) return seen([{ code: "empty" }]);
  const notRanked = list.rows.filter((row) => row.position === null).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "tracked", a: list.rows.filter((row) => row.tracked).length, b: list.rows.length },
    notRanked[0] ? { code: "notRanked", a: notRanked.length, text: notRanked[0].keyword } : { code: "allRanked" },
  ];
  const steps: Array<Maybe<SeenStep>> = [notRanked[0] && list.siteId ? { code: "seeSearch", text: notRanked[0].keyword, link: "seeSearch", to: searchOn(list.siteId, notRanked[0].keyword) } : null];
  return seen(says, steps);
}

/** Keyword research → Start from a competitor: the searches it has and the website does not, and the biggest. */
export function competitorStartSees(gap: { rivalHost: string; preparing: boolean; rows: ReadonlyArray<{ keyword: string; position: number; volume: number | null }> }, siteId: string | null): Seen {
  if (gap.preparing) return seen([{ code: "preparing", text: gap.rivalHost }]);
  if (gap.rows.length === 0) return seen([{ code: "none", text: gap.rivalHost }]);
  const biggest = [...gap.rows].sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))[0];
  const says: SeenPhrase[] = [
    { code: "gap", text: gap.rivalHost, a: gap.rows.length },
    { code: "biggest", text: biggest.keyword, a: biggest.volume ?? 0, b: biggest.position },
  ];
  const steps: Array<Maybe<SeenStep>> = [siteId ? { code: "seeSearch", text: biggest.keyword, link: "seeSearch", to: searchOn(siteId, biggest.keyword) } : null];
  return seen(says, steps);
}
