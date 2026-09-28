import { wordsOf } from "./wordStarts";

/**
 * One angle, several wordings (docs/plans/active/fan-out-angles-plan.md, FA5).
 *
 * The AI assistants search the same thing in other words — "best carp fishing
 * bait" and "best bait for carp fishing" — and those count once. Two wordings
 * are one angle when they are the same words in another order, or differ only
 * by small words ("for", "the", "of"); a plural is the same word as its
 * singular ("system", "systems"). Anything else keeps them apart — a year,
 * "reviews", "fishing" — on purpose: the rule stays plain enough that it never
 * merges two searches a reader would keep apart.
 *
 * Shared by the list the angles are built into and every screen that finds a
 * search's angle again, so both group the same way.
 */

/** Words that never make a different angle on their own. */
const SMALL_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "for", "of", "to", "in", "on", "at", "by", "with", "and", "or", "vs", "versus", "from", "into", "per",
]);

/** A plural's singular: "rigs" is "rig"; "glass", "bus" and "is" stay as they are. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/**
 * A text's words that matter, singular: what two wordings of one angle share,
 * and what a search shares with a page's address.
 */
export function wordsThatMatter(text: string): string[] {
  // An apostrophe joins a word rather than splitting it: "angler's" is "anglers".
  return wordsOf(text.replace(/['’]/g, "")).filter((word) => !SMALL_WORDS.has(word)).map(singular);
}

/**
 * The angle a wording belongs to: its words that matter, singular and in
 * alphabetical order. A wording made only of small words is its own angle.
 */
export function angleOf(query: string): string {
  const kept = wordsThatMatter(query).sort();
  return kept.length > 0 ? kept.join(" ") : wordsOf(query.replace(/['’]/g, "")).join(" ");
}
