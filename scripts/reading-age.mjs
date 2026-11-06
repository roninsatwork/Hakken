/**
 * How hard a line of words is to read (Anthony, 2026-11-03: "we need to
 * remember the reading age for whenever you write text, here or on the pages";
 * 2026-11-06: "i asked for a reading age of 14 - these look terrible").
 *
 * The reading age is the Flesch-Kincaid grade plus five, which is how a school
 * grade becomes an age. It only measures long words and long sentences: a line
 * can pass and still read badly, so it's a floor, never proof that the words are
 * right. The screens redone with Anthony average about 8.
 */

/** The hardest a line may be. */
export const MOST_READING_AGE = 14;
/** Under this many words one long word swings the sum, so a shorter line isn't judged. */
export const FEWEST_WORDS = 8;

/** Names a reader knows as one thing. "Google Analytics" shouldn't count as a hard word six syllables long. */
const KNOWN_NAMES = /\b(?:Google Analytics|Search Console|Microsoft Clarity|Bing Webmaster(?: Tools)?)\b/g;
/** Addresses, email addresses and code names: read as a whole, or not read at all. */
const NOT_WORDS = /\S*[./@_]\S*[a-z0-9/]\S*/g;

function syllables(word) {
  let letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length <= 3) return 1;
  letters = letters.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (letters.match(/[aeiouy]{1,2}/g) ?? []).length);
}

function wordsOf(text) {
  return text.replace(KNOWN_NAMES, "Google").replace(NOT_WORDS, "").match(/[A-Za-z0-9'’-]+/g) ?? [];
}

/** The reading age of some words, or null when there are none to read. */
export function readingAge(text) {
  const words = wordsOf(text);
  const plain = text.replace(KNOWN_NAMES, "Google").replace(NOT_WORDS, "");
  const sentences = plain.split(/[.!?]+(?:\s|$)/).filter((part) => /[A-Za-z]/.test(part));
  if (words.length === 0 || sentences.length === 0) return null;
  const sounds = words.reduce((sum, word) => sum + syllables(word), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (sounds / words.length) - 15.59 + 5;
}

/** Whether a line is too hard: long enough to judge, and over the age. */
export function tooHard(text) {
  if (wordsOf(text).length < FEWEST_WORDS) return false;
  const age = readingAge(text);
  return age !== null && age > MOST_READING_AGE;
}

/** A message as a person reads it: the `other` of a plural or a choice, a word for a placeholder, no tags. */
export function readOut(message) {
  let out = "";
  for (let at = 0; at < message.length; at += 1) {
    if (message[at] !== "{") {
      out += message[at];
      continue;
    }
    let depth = 1;
    let end = at + 1;
    for (; end < message.length && depth > 0; end += 1) {
      if (message[end] === "{") depth += 1;
      else if (message[end] === "}") depth -= 1;
    }
    const inner = message.slice(at + 1, end - 1);
    const choice = inner.match(/^\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,/);
    if (choice) {
      const other = inner.search(/\bother\s*\{/);
      if (other >= 0) {
        const open = inner.indexOf("{", other);
        let inside = 1;
        let close = open + 1;
        for (; close < inner.length && inside > 0; close += 1) {
          if (inner[close] === "{") inside += 1;
          else if (inner[close] === "}") inside -= 1;
        }
        out += readOut(inner.slice(open + 1, close - 1));
      }
    } else {
      out += "it";
    }
    at = end - 1;
  }
  return out.replace(/#/g, "5").replace(/<\/?[A-Za-z0-9]+>/g, "");
}

/** The lines of words a drawing shows: not its styles, scripts, pictures or the options inside a closed menu. */
export function drawingLines(html) {
  return html
    .replace(/<(head|helmet|style|script|svg|select)\b[\s\S]*?<\/\1>/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .split(/<[^>]+>/)
    .map((piece) => piece.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
