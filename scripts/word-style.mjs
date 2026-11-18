/**
 * The style faults a machine can catch in a line of words a client reads
 * (docs/developer/writing-guide.md; Anthony, 2026-11-18, after asking for the
 * same style again: "how do we stop that for other agents").
 *
 * Reading age (scripts/reading-age.mjs) only measures long words and long
 * sentences. These catch the faults that came back day after day: a month
 * left unnamed, two ideas joined by a colon or a dash, and a screen talking
 * about Hakken. Whether a line sounds like a person talking is still for
 * whoever writes it to read aloud: passing here is a floor, never proof.
 */

/** A line this short is a label, a heading or a name, and isn't judged for Hakken. */
export const FEWEST_WORDS_FOR_HAKKEN = 6;
/** A colon or a dash joins two ideas when it has at least this many words after it. */
export const WORDS_EACH_SIDE = 3;
/** And this many before a colon: "The chart: Show and Compare with." joined two (Anthony, 2026-11-17). "Dates: Last month" is a label. */
export const WORDS_BEFORE_COLON = 2;
/** A sentence said twice on one board is judged from this many words. */
export const FEWEST_WORDS_FOR_REPEAT = 6;

/** "The month before" and its kind: a period with a name that the line doesn't say. "The 30 days before" names it. */
const UNNAMED_PERIOD = /\bthe\s+(?:month|week|year|days|span|period)\s+before\b|\bthe\s+last\s+days\b/i;
/** Product names that aren't Hakken talking about itself. */
const HAKKEN_NAMES = /\bAsk Hakken\b|\bHakken tasks\b/gi;
/** Words in quote marks are someone else's, quoted to point at them ("the key says “The days before”"). */
const QUOTED = /"[^"]*"|“[^”]*”|‘[^’]*’/g;
/** Addresses, email addresses and code names: a colon or dash inside them isn't joining ideas. */
const NOT_WORDS = /\S*(?::\/\/|[./@_])\S*/g;

const wordsOf = (text) => text.match(/[A-Za-z0-9'’]+/g) ?? [];
const letterWordsOf = (text) => text.match(/[A-Za-z][A-Za-z'’]+/g) ?? [];
/** The sentences of a line, each with its end mark. A full stop inside a number, as in 0.8, doesn't end one. */
export const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);

/** Whether a colon in this sentence joins two ideas: words on both sides, and not a time like 12:30 or a date after a label. */
function colonJoins(sentence) {
  const plain = sentence.replace(NOT_WORDS, " ").replace(/\d:\d/g, " ");
  const at = plain.indexOf(":");
  if (at < 0) return false;
  return wordsOf(plain.slice(0, at)).length >= WORDS_BEFORE_COLON && letterWordsOf(plain.slice(at + 1)).length >= WORDS_EACH_SIDE;
}

/** Whether a spaced dash in this sentence joins two ideas: words of letters on both sides, not a date range. */
function dashJoins(sentence) {
  const plain = sentence.replace(NOT_WORDS, " ");
  return [...plain.matchAll(/\s[-–—]\s/g)].some((dash) => {
    // A range: "1 Oct – 31 Oct", "9am - 5pm".
    if (/^\d/.test(plain.slice(dash.index + dash[0].length))) return false;
    const before = letterWordsOf(plain.slice(0, dash.index));
    const after = letterWordsOf(plain.slice(dash.index + dash[0].length));
    return before.length >= WORDS_EACH_SIDE && after.length >= WORDS_EACH_SIDE;
  });
}

/**
 * The style faults in a line a client reads, each `{ rule, fix }`: `rule` names
 * it for a frozen list, `fix` says what to do in plain words.
 */
export function styleFaults(text) {
  const line = text.replace(QUOTED, "“…”");
  const faults = [];
  const unnamed = UNNAMED_PERIOD.exec(line);
  if (unnamed) faults.push({ rule: "named-month", fix: `"${unnamed[0]}" leaves the period unnamed. Name the month or day, as "fewer than September" or "since Sunday 5 October" do.` });
  const sentences = sentencesOf(line);
  if (sentences.some(colonJoins)) faults.push({ rule: "colon", fix: "A colon joins two ideas here. Write two sentences." });
  if (sentences.some(dashJoins)) faults.push({ rule: "dash", fix: "A dash joins two ideas here. Write two sentences." });
  if (wordsOf(line).length >= FEWEST_WORDS_FOR_HAKKEN && /\bHakken\b/.test(line.replace(HAKKEN_NAMES, ""))) {
    faults.push({ rule: "hakken", fix: "Screens talk about people and Google, never Hakken. Say what happened, not who did it." });
  }
  return faults;
}

/** The sentences said more than once across some lines: full sentences of six words or more. */
export function saidTwice(lines) {
  const counted = new Map();
  for (const line of lines) {
    for (const sentence of sentencesOf(line)) {
      if (!/\.$/.test(sentence) || wordsOf(sentence).length < FEWEST_WORDS_FOR_REPEAT) continue;
      counted.set(sentence, (counted.get(sentence) ?? 0) + 1);
    }
  }
  return [...counted].filter(([, times]) => times > 1).map(([sentence]) => sentence);
}

const MONTHS = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/;

/** Whether a "Compare with" choice is a period: a month, a year, the same days, the days before, or no comparison. */
export function isPeriodChoice(option) {
  return MONTHS.test(option) || /\b(?:19|20)\d\d\b/.test(option) || /no comparison|the same days|before|last (?:week|month|year)|previous/i.test(option);
}
