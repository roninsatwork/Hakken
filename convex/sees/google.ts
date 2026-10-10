import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../utils/hakkenSees";

/**
 * What Hakken sees on the Google results screens (docs/plans/active/
 * discovery-detail-and-hakken-sees-plan.md §6, "Google results"): fixed rules
 * over each screen's own rows, most important first. Your searches, Tracked
 * fan-out queries, Who ranks above you and Search features read lists other
 * screens share, so they run these rules over the rows they hold; Wins and
 * losses, a feature's searches and Questions people ask return theirs.
 */

type Maybe<T> = T | null;

/** Google's first page. */
const PAGE_ONE = 10;
const PAGE_TWO = 20;

type Standing = { keyword: string; lastPosition: number | null; previousPosition: number | null; lastCheckedDay: string | null };

/** Google results → Your searches: up and down since the check before, on page one, and the biggest fall. */
export function searchesSees(rows: ReadonlyArray<Standing & { isActive: boolean }>): Seen {
  const running = rows.filter((row) => row.isActive);
  if (running.length === 0) return seen([{ code: "noSearches" }]);
  const checked = running.filter((row) => row.lastCheckedDay !== null);
  if (checked.length === 0) return seen([{ code: "notChecked" }]);
  const both = checked.filter((row) => row.previousPosition !== null);
  const up = both.filter((row) => row.lastPosition !== null && row.lastPosition < row.previousPosition!).length;
  const falls = both.filter((row) => row.lastPosition === null || row.lastPosition > row.previousPosition!)
    .sort((left, right) => (right.lastPosition ?? 101) - right.previousPosition! - ((left.lastPosition ?? 101) - left.previousPosition!));
  const fall = falls[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "moves", a: up, b: falls.length },
    fall ? (fall.lastPosition === null ? { code: "droppedOut", text: fall.keyword, a: fall.previousPosition! } : { code: "biggestFall", text: fall.keyword, a: fall.previousPosition!, b: fall.lastPosition }) : null,
    { code: "firstPage", a: checked.filter((row) => row.lastPosition !== null && row.lastPosition <= PAGE_ONE).length, b: checked.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    fall ? { code: "seeFall", text: fall.keyword, link: "seeSearch", to: toRecord("keyword", fall.keyword) } : null,
  ];
  return seen(says, steps);
}

/** Google results → Tracked fan-out queries: where you rank for them, those on page two, and those you do not rank for. */
export function fanOutTrackedSees(rows: ReadonlyArray<{ keyword: string; queryText: string; lastPosition: number | null; lastCheckedDay: string | null; timesSeen: number | null }>, own: boolean): Seen {
  if (rows.length === 0) return seen([{ code: "none" }], own ? [{ code: "pickSome", link: "fanOutQueries", to: toPage("ai/searched") }] : []);
  const checked = rows.filter((row) => row.lastCheckedDay !== null);
  if (checked.length === 0) return seen([{ code: "notChecked", a: rows.length }]);
  const pageTwo = checked.filter((row) => row.lastPosition !== null && row.lastPosition > PAGE_ONE && row.lastPosition <= PAGE_TWO)
    .sort((left, right) => (right.timesSeen ?? 0) - (left.timesSeen ?? 0));
  const notRanking = checked.filter((row) => row.lastPosition === null).length;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "tracked", a: checked.length, b: checked.filter((row) => row.lastPosition !== null && row.lastPosition <= PAGE_ONE).length },
    pageTwo[0] ? { code: "pageTwo", a: pageTwo.length, text: pageTwo[0].queryText } : null,
    notRanking > 0 ? { code: "notRanking", a: notRanking } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    pageTwo[0] ? { code: "pushUp", text: pageTwo[0].queryText, link: "seeSearch", to: toRecord("keyword", pageTwo[0].keyword) } : null,
  ];
  return seen(says, steps);
}

/** Google results → Wins and losses: searches gained against lost at the newest check, the biggest win and the biggest loss. */
export function movesSees(rows: ReadonlyArray<{ keyword: string; position: number | null; volume: number | null; status: string; day: string }>, rankingDay: string): Seen {
  const latest = rows.filter((row) => row.day === rankingDay);
  const wins = latest.filter((row) => row.status === "UP" || row.status === "NEW").sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const losses = latest.filter((row) => row.status === "DOWN" || row.status === "LOST").sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  if (wins.length === 0 && losses.length === 0) return seen([{ code: "noMoves" }]);
  const loss = losses[0] ?? null;
  const win = wins[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "winsLosses", a: wins.length, b: losses.length },
    loss ? (loss.status === "LOST" || loss.position === null ? { code: "biggestLost", text: loss.keyword, a: loss.volume ?? 0 } : { code: "biggestLoss", text: loss.keyword, a: loss.position, b: loss.volume ?? 0 }) : null,
    win && win.position !== null ? { code: "biggestWin", text: win.keyword, a: win.position, b: win.volume ?? 0 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    loss ? { code: "seeLoss", text: loss.keyword, link: "seeSearch", to: toRecord("keyword", loss.keyword) } : null,
    win ? { code: "seeWin", text: win.keyword, link: "seeSearch", to: toRecord("keyword", win.keyword) } : null,
  ];
  return seen(says, steps);
}

/** Google results → Who ranks above you: the website above you on most searches, rivals above, and searches you top. */
export function aboveSees(rows: ReadonlyArray<{ isActive: boolean; day: string | null; position: number | null; above: ReadonlyArray<{ domain: string; isRival: boolean }> }>): Seen {
  const checked = rows.filter((row) => row.isActive && row.day !== null);
  if (checked.length === 0) return seen([{ code: "notChecked" }]);
  const counts = new Map<string, number>();
  for (const row of checked) for (const domain of new Set(row.above.map((result) => result.domain))) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? null;
  const rivalsAbove = checked.filter((row) => row.above.some((result) => result.isRival)).length;
  const first = checked.filter((row) => row.position === 1).length;
  const says: Array<Maybe<SeenPhrase>> = [
    top ? { code: "aboveMost", text: top[0], a: top[1], b: checked.length } : { code: "nobodyAbove" },
    rivalsAbove > 0 ? { code: "rivalsAbove", a: rivalsAbove } : null,
    first > 0 ? { code: "youFirst", a: first } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    top ? { code: "seeWebsite", text: top[0], link: "seeWebsite", to: toRecord("website", top[0]) } : null,
  ];
  return seen(says, steps);
}

/** Google results → Search features: the features on your searches you are left out of, the most missed first. */
export function featuresSees(result: { totals: ReadonlyArray<{ feature: string; searches: number; withSite: number | null }>; checked: number }, nameOf: (feature: string) => string): Seen {
  if (result.checked === 0) return seen([{ code: "notChecked" }]);
  const missed = result.totals
    .filter((row) => row.withSite !== null && row.searches > row.withSite)
    .sort((left, right) => right.searches - right.withSite! - (left.searches - left.withSite!));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "checked", a: result.checked, b: result.totals.length },
    missed[0] ? { code: "missed", text: nameOf(missed[0].feature), a: missed[0].searches - missed[0].withSite!, b: missed[0].searches } : { code: "inAll" },
    missed[1] ? { code: "missedToo", text: nameOf(missed[1].feature), a: missed[1].searches - missed[1].withSite! } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    missed[0] ? { code: "seeFeature", text: nameOf(missed[0].feature), link: "seeFeature", to: toRecord("feature", missed[0].feature) } : null,
  ];
  return seen(says, steps);
}

/** Google results → one search feature: the searches showing it, those you are in it on, and the biggest you are not. */
export function featureRecordSees(rows: ReadonlyArray<{ keyword: string; position: number | null; volume: number | null }>): Seen {
  if (rows.length === 0) return seen([{ code: "none" }]);
  const out = rows.filter((row) => row.position === null).sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0));
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "inIt", a: rows.length - out.length, b: rows.length },
    out[0] ? { code: "biggestOut", text: out[0].keyword, a: out[0].volume ?? 0 } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    out[0] ? { code: "seeSearch", text: out[0].keyword, link: "seeSearch", to: toRecord("keyword", out[0].keyword) } : null,
  ];
  return seen(says, steps);
}

/** Google results → Questions people ask: the questions on your searches, and the one on most of them. */
export function questionsSees(rows: ReadonlyArray<{ text: string; kind: "QUESTION" | "RELATED"; searches: readonly string[] }>): Seen {
  const questions = rows.filter((row) => row.kind === "QUESTION").sort((left, right) => right.searches.length - left.searches.length);
  if (questions.length === 0) return seen([{ code: "none" }]);
  const searches = new Set(questions.flatMap((row) => row.searches)).size;
  const top = questions[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "questions", a: questions.length, b: searches },
    { code: "mostCommon", text: top.text, a: top.searches.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    { code: "answer", text: top.text, more: top.searches[0], link: "seeSearch", to: toRecord("keyword", top.searches[0]) },
    { code: "checkPages", link: "yourPages", to: toPage("your-pages") },
  ];
  return seen(says, steps);
}
