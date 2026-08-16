/**
 * The couldn't-answer list's mechanical half (closing-the-loop-plan.md,
 * phase 1): what counts as a real question, and how two askings of the
 * same thing recognise each other. Pure functions, no model anywhere —
 * the dismiss button and the repeat counter are the correctives for the
 * cases a word-filter gets wrong.
 */

const GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "ok",
  "okay",
  "yes",
  "no",
  "bye",
  "goodbye",
  "good morning",
  "good afternoon",
  "good evening",
  "cheers",
  "ciao",
  "grazie",
  "buongiorno",
]);

/** Lowercased, punctuation stripped, whitespace collapsed. */
export function normaliseQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The dedupe key two askings of the same thing share. */
export function questionKey(text: string): string {
  return normaliseQuestion(text).slice(0, 120);
}

/**
 * A question worth logging: long enough to mean something, not a
 * greeting, and carrying at least a few real words. Terse-but-real
 * questions occasionally slip through the other way; the repeat counter
 * surfaces them when they matter.
 */
export function isSubstantiveQuestion(text: string): boolean {
  const normalised = normaliseQuestion(text);
  if (normalised.length < 12) return false;
  if (GREETINGS.has(normalised)) return false;
  const words = normalised.split(" ").filter((word) => word.length > 1);
  return words.length >= 3;
}

/** What the panel shows: the first asking's own words, bounded. */
export function displayQuestion(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 300);
}
