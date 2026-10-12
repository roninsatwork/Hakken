import { v } from "convex/values";
import { couldBeChance } from "./insightEditor";
import { shiftDay, type Fact } from "./insightFacts";
import { missingStructuredData, type PageFacts } from "./moneyPageChecks";

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

/** What the weekly check of a money page saw change since the week before (I25): one kind a part of the page. */
export const PAGE_CHANGE_KINDS = [
  "TOP_REWRITTEN", "PRICE_ADDED", "PRICE_REMOVED", "PROOF_ADDED", "PROOF_REMOVED", "FORM_ADDED", "FORM_REMOVED", "ASK_MOVED_UP", "STRUCTURED_DATA_ADDED",
] as const;
export type PageChangeKind = (typeof PAGE_CHANGE_KINDS)[number];

/** A change to the company's own Google profile (I25), as each reading of it saw: `listingActivityParts`' kinds. */
export const PROFILE_CHANGE_KINDS = {
  CATEGORY_ADDED: "PROFILE_CATEGORY_ADDED",
  CATEGORY_REMOVED: "PROFILE_CATEGORY_REMOVED",
  HOURS_CHANGED: "PROFILE_HOURS_CHANGED",
  NAME_CHANGED: "PROFILE_NAME_CHANGED",
  WEBSITE_CHANGED: "PROFILE_WEBSITE_CHANGED",
} as const;
export type ProfileChangeKind = (typeof PROFILE_CHANGE_KINDS)[keyof typeof PROFILE_CHANGE_KINDS];

/** Every kind of change the log holds. */
export const changeKindValidator = v.union(
  v.literal("REPLACED"), v.literal("MERGED"), v.literal("REMOVED"), v.literal("ADDED"),
  v.literal("TOP_REWRITTEN"), v.literal("PRICE_ADDED"), v.literal("PRICE_REMOVED"), v.literal("PROOF_ADDED"), v.literal("PROOF_REMOVED"),
  v.literal("FORM_ADDED"), v.literal("FORM_REMOVED"), v.literal("ASK_MOVED_UP"), v.literal("STRUCTURED_DATA_ADDED"),
  v.literal("PROFILE_CATEGORY_ADDED"), v.literal("PROFILE_CATEGORY_REMOVED"), v.literal("PROFILE_HOURS_CHANGED"), v.literal("PROFILE_NAME_CHANGED"), v.literal("PROFILE_WEBSITE_CHANGED"),
);
/** What followed a change; too early until the days after it are in. */
export const changeResultValidator = v.union(v.literal("LOST"), v.literal("HELD"), v.literal("GREW"), v.literal("TOO_EARLY"));

export type Change = {
  kind: typeof changeKindValidator.type;
  /** The page before, and the page after, by their paths; for a profile change, what changed to ("E-commerce service"). */
  from: string | null;
  to: string | null;
  /** The day it happened, for a page or profile change; a page replaced is known only by its year. */
  day?: string;
  /** Enquiries before the change and after it: a year each for a page replaced, 30 days each for a page or profile change. */
  before: number;
  after: number;
  result: typeof changeResultValidator.type;
};

/** A page or profile change is judged on this many days each side of it. */
export const CHANGE_DAYS = 30;

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

/** A money page as one week's check saw it: what its words show, and its structured data. */
export type PageFingerprint = { kind: string | null; facts: PageFacts | null; structured: string[] | null };

/** How far up the first way to enquire must come, as a share of the page's words, to count as moved. */
const ASK_MOVED = 0.15;

const plainWords = (text: string | null) => (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * What changed on a money page between two weeks' checks (I25): its top
 * rewritten, a price, proof or form put on or taken off, the first way to
 * enquire brought up, or structured data it lacked added. Nothing when
 * either week's read failed: a page that could not be read did not change.
 */
export function fingerprintChanges(before: PageFingerprint, after: PageFingerprint): PageChangeKind[] {
  const out: PageChangeKind[] = [];
  const was = before.facts, now = after.facts;
  if (was && now && was.words > 0 && now.words > 0) {
    if (plainWords(was.headline) && plainWords(now.headline) && plainWords(was.headline) !== plainWords(now.headline)) out.push("TOP_REWRITTEN");
    const turned = (then: boolean, then2: boolean, added: PageChangeKind, removed: PageChangeKind) => {
      if (!then && then2) out.push(added);
      if (then && !then2) out.push(removed);
    };
    turned(was.price, now.price, "PRICE_ADDED", "PRICE_REMOVED");
    turned(was.proof, now.proof, "PROOF_ADDED", "PROOF_REMOVED");
    turned(was.form, now.form, "FORM_ADDED", "FORM_REMOVED");
    if (now.firstAsk !== null && (was.firstAsk === null || was.firstAsk - now.firstAsk >= ASK_MOVED)) out.push("ASK_MOVED_UP");
  }
  if (before.structured && after.structured && missingStructuredData(after.kind, after.structured).length < missingStructuredData(before.kind, before.structured).length) {
    out.push("STRUCTURED_DATA_ADDED");
  }
  return out;
}

/**
 * Enquiries in the days each side of a change, from the website's days:
 * too early until all the days after it are in, and null when the days
 * before it are not all held — a change is never judged on half a month.
 */
export function measuredAround(days: ReadonlyArray<{ day: string; enquiries: number }>, day: string, newestDay: string | null): Pick<Change, "before" | "after" | "result"> | null {
  const from = shiftDay(day, -CHANGE_DAYS), to = shiftDay(day, CHANGE_DAYS);
  const oldest = days.reduce<string | null>((first, entry) => (first === null || entry.day < first ? entry.day : first), null);
  if (oldest === null || oldest > from) return null;
  const sum = (start: string, end: string) => days.filter((entry) => entry.day >= start && entry.day <= end).reduce((total, entry) => total + entry.enquiries, 0);
  if (!newestDay || newestDay < to) return { before: sum(from, shiftDay(day, -1)), after: newestDay ? sum(shiftDay(day, 1), newestDay) : 0, result: "TOO_EARLY" };
  const before = sum(from, shiftDay(day, -1)), after = sum(shiftDay(day, 1), to);
  return { before, after, result: resultOf(before, after) };
}

/**
 * The changes to the company's own Google profile over the last year (I25),
 * each with the website's enquiries the 30 days either side. Opening hours
 * are logged without their detail, which the screen cannot word.
 */
export function profileChangesOf(
  lines: ReadonlyArray<{ kind: string; day: string; text: string }>,
  days: ReadonlyArray<{ day: string; enquiries: number }>,
  newestDay: string | null,
  since: string,
): Change[] {
  const changes: Change[] = [];
  for (const line of lines) {
    const kind = PROFILE_CHANGE_KINDS[line.kind as keyof typeof PROFILE_CHANGE_KINDS];
    if (!kind || line.day < since) continue;
    const measured = measuredAround(days, line.day, newestDay);
    if (!measured) continue;
    changes.push({ kind, from: kind === "PROFILE_HOURS_CHANGED" ? null : line.text, to: null, day: line.day, ...measured });
  }
  return changes;
}

/** A page change, judged on the page's own 30 days: before as it stood when seen, after once 30 days have passed. */
export function pageChangeResult(before: number, after: number | null): Pick<Change, "after" | "result"> {
  return after === null ? { after: 0, result: "TOO_EARLY" } : { after, result: resultOf(before, after) };
}
