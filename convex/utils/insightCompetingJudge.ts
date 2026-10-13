import { settleGroup, type CompetingGroup, type KeptGroup } from "./insightCompeting";
import { readingOf } from "./insightDecided";

/**
 * Jev picks each search's page (Anthony, 13 October 2026, "Go" on "Jev picks
 * each search's page … through the existing 'Which page answers this
 * search?' Decision, so the Fan-out screen and cannibalisation agree. It
 * ships switched off"): what the `seo.angle-page` Decision is asked of each
 * search of a group, and how its answers are put on the group. The pages
 * offered are those Google showed for the search, the most shown first;
 * where it isn't sure, or picks none, the rule's page stands. The run's side
 * is `insightCompetingJudge.ownerJudge`.
 */

export type OwnerQuestion = {
  search: string;
  volume: number | null;
  /** The pages Google showed for it, the most shown first: the Decision's page-a onwards. */
  offered: Array<{ path: string; shown: number }>;
  /** Where the rule's page is among them, its answer when the Decision isn't reached; -1 when it isn't offered. */
  rule: number;
};

/** The searches of a group the Decision is asked about: each Google showed two or more of its pages for, with at most `most` pages offered. */
export function ownerQuestions(group: CompetingGroup | KeptGroup, most: number): OwnerQuestion[] {
  return group.searches.flatMap((search) => {
    const offered = [...search.pages].sort((a, b) => b.shown - a.shown || a.path.localeCompare(b.path)).slice(0, most).map((page) => ({ path: page.path, shown: page.shown }));
    if (offered.length < 2) return [];
    return [{ search: search.search, volume: search.volume, offered, rule: offered.findIndex((page) => page.path === (search.owner ?? search.top)) }];
  });
}

/**
 * Its sure answers put on the group — each a page Google showed for the
 * search, said to be the decision model's — and the group settled again from
 * them (`settleGroup`). Returns how many it chose, and how many of those
 * differ from the rule's.
 */
export function applyChosen(group: CompetingGroup | KeptGroup, chosen: ReadonlyMap<string, string>, websiteRate: number | null) {
  let picked = 0, changed = 0;
  for (const search of group.searches) {
    const page = chosen.get(search.search);
    if (!page || !search.pages.some((shown) => shown.path === page)) continue;
    const rule = search.owner ?? search.top;
    if (page !== rule) changed += 1;
    Object.assign(search, { owner: page, why: ["JEV"], reason: "", ...(page !== rule ? { rulePage: rule } : {}) });
    picked += 1;
  }
  if (picked > 0) settleGroup(group, websiteRate);
  return { chosen: picked, changed };
}

/** A pick as kept: the pages it was asked between, and the page it was sure of, or none. */
export type HeldPick = { search: string; offered: string; page: string | null; pickedAt: number };

/** A pick is asked again after this long, though its pages are the same. */
export const PICK_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** The pages a search is asked between, as a reading: its pick holds while they're the same. */
export function offeredReading(question: Pick<OwnerQuestion, "offered">): string {
  return readingOf(question.offered.map((page) => page.path));
}

/** The searches to ask: those with no pick, a pick made between other pages, or one older than `PICK_MAX_AGE_MS`. */
export function picksDue(questions: readonly OwnerQuestion[], held: ReadonlyMap<string, HeldPick>, now: number): OwnerQuestion[] {
  return questions.filter((question) => {
    const pick = held.get(question.search);
    return !pick || pick.offered !== offeredReading(question) || now - pick.pickedAt > PICK_MAX_AGE_MS;
  });
}

/** Each search's kept page, where the pick was made between the pages Google shows for it now and was sure; with how many had none. */
export function pickedPages(questions: readonly OwnerQuestion[], held: ReadonlyMap<string, HeldPick>) {
  const chosen = new Map<string, string>();
  let unsure = 0;
  for (const question of questions) {
    const pick = held.get(question.search);
    if (pick?.page && pick.offered === offeredReading(question)) chosen.set(question.search, pick.page);
    else unsure += 1;
  }
  return { chosen, unsure };
}
