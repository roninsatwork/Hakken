import { couldBeChance } from "./insightEditor";
import type { Fact } from "./insightFacts";

/**
 * Keeping score and the change log (docs/plans/active/insights-analyst-plan.md
 * §2.7, I25, I30): on the day a finding names, the figure it said to watch is
 * read again and set against what it was when written — proved right, didn't
 * hold, or no clear change yet — and the changes Hakken can see in the
 * website's own figures are logged with what followed, each a learning.
 */

export type Outcome = "RIGHT" | "WRONG" | "TOO_EARLY";

/** How a finding turned out: its watched figure then and now, the way it should have moved. */
export function outcomeOf(then: number, now: number, direction: "UP" | "DOWN", unit: Fact["unit"]): Outcome {
  if (unit === "count" && couldBeChance(then, now)) return "TOO_EARLY";
  const moved = then > 0 ? (now - then) / then : now > 0 ? 1 : 0;
  if (Math.abs(moved) < 0.05) return "TOO_EARLY";
  return (moved > 0) === (direction === "UP") ? "RIGHT" : "WRONG";
}

export type Change = {
  kind: "REPLACED" | "MERGED" | "REMOVED" | "ADDED";
  /** The page before, and the page after, by their paths. */
  from: string | null;
  to: string | null;
  /** Enquiries a year before the change and after it, from the pages involved. */
  before: number;
  after: number;
  result: "LOST" | "HELD" | "GREW";
};

/** A path's words by their first six letters, so "developers" and "development" are one word. */
const words = (path: string) => new Set(path.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2).map((word) => word.slice(0, 6)));

/** How alike two paths are: the share of their words in common. */
function alike(a: string, b: string): number {
  const one = words(a), two = words(b);
  const common = [...one].filter((word) => two.has(word)).length;
  const all = new Set([...one, ...two]).size;
  return all > 0 ? common / all : 0;
}

const resultOf = (before: number, after: number): Change["result"] => (after >= before * 1.2 ? "GREW" : after >= before * 0.8 ? "HELD" : "LOST");

/** A landing page's year: its visits and enquiries. */
export type PageYear = { path: string; visits: number; enquiries: number };

/**
 * The page changes Analytics shows over a year, from the whole landing page
 * lists, this year's and the year before's: a page that brought enquiries
 * the year before and had no visit this year — removed, or replaced when a
 * page new this year with words in common took its place — and what its
 * enquiries did. Only pages that brought three enquiries or more, so chance
 * isn't a change.
 */
export function pageChanges(now: readonly PageYear[], year: readonly PageYear[]): Change[] {
  const thisYear = new Map(now.filter((page) => !/not set/i.test(page.path)).map((page) => [page.path, page]));
  const lastYear = new Map(year.filter((page) => !/not set/i.test(page.path)).map((page) => [page.path, page]));
  const gone = [...lastYear.values()].filter((page) => !thisYear.has(page.path) && page.enquiries >= 3);
  // A page that took another's place: new this year, or one that grew by half or more — the other merged into it.
  const heirs = [...thisYear.values()].filter((page) => page.visits >= 20 && (!lastYear.has(page.path) || page.visits >= (lastYear.get(page.path)?.visits ?? 0) * 1.5)).map((page) => page.path);
  const changes: Change[] = [];
  for (const page of gone) {
    const path = page.path;
    const heir = heirs.map((candidate) => ({ candidate, score: alike(path, candidate) })).filter((entry) => entry.score >= 0.34).sort((a, b) => b.score - a.score)[0];
    if (heir) {
      const merged = lastYear.has(heir.candidate);
      // Merged: the two pages' enquiries together a year before, against the one page's now.
      const before = page.enquiries + (merged ? lastYear.get(heir.candidate)?.enquiries ?? 0 : 0);
      const after = thisYear.get(heir.candidate)?.enquiries ?? 0;
      changes.push({ kind: merged ? "MERGED" : "REPLACED", from: path, to: heir.candidate, before, after, result: resultOf(before, after) });
    } else {
      const before = page.enquiries;
      changes.push({ kind: "REMOVED", from: path, to: null, before, after: 0, result: "LOST" });
    }
  }
  return changes;
}
