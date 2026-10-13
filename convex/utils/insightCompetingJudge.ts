import { settleGroup, type CompetingGroup, type KeptGroup } from "./insightCompeting";

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
    if (page !== (search.owner ?? search.top)) changed += 1;
    Object.assign(search, { owner: page, why: ["JEV"], reason: "" });
    picked += 1;
  }
  if (picked > 0) settleGroup(group, websiteRate);
  return { chosen: picked, changed };
}
