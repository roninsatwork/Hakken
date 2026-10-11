import { fillFacts, namedFacts, spanDays, type Fact } from "./insightFacts";

/**
 * The Editor's checks (docs/plans/active/insights-analyst-plan.md I21, I29):
 * every figure a finding names is one Hakken holds, filled in from it; no
 * number is typed; every comparison is like with like — the same kind of
 * figure, span and country, never a rival's estimate against the website's
 * own counts — and a change small enough to be chance is not called a
 * change. What fails is sent back with the reason, never published.
 */

export type DraftFinding = {
  headline: string;
  story: string;
  action: string;
  howWeKnow: string;
  ruledOut: string[];
  comparisons: string[][];
};

export type EditorVerdict =
  | { ok: true; filled: Pick<DraftFinding, "headline" | "story" | "action" | "howWeKnow" | "ruledOut">; used: Fact[] }
  | { ok: false; note: string };

/** Words a client never reads (I13, and no supplier is named on a screen). */
const BANNED = /\b(push|pushing|pushed|DataForSEO|Firecrawl)\b/i;

/**
 * A number typed in words of a finding, its named facts taken out: years,
 * and spans of days, weeks, months or years ("the last 12 months"), are the
 * only numbers a specialist may type.
 */
export function typedNumbers(text: string): string[] {
  const bare = text.replace(/\[\[[^\]]+\]\]/g, " ");
  const found: string[] = [];
  for (const match of bare.matchAll(/\d(?:[\d,.]*\d)?%?/g)) {
    const value = match[0];
    const after = bare.slice((match.index ?? 0) + value.length, (match.index ?? 0) + value.length + 12).toLowerCase();
    if (/^(19|20)\d\d$/.test(value)) continue;
    if (/^\s*(day|days|week|weeks|month|months|year|years)\b/.test(after)) continue;
    found.push(value);
  }
  return found;
}

/** Two facts' families: a rival's estimate is never set against the website's own counts (I3). */
function family(fact: Fact): "own" | "estimate" | "ai" | "local" | "crawl" {
  if (fact.source === "analytics" || fact.source === "searchConsole") return "own";
  if (fact.source === "market") return "estimate";
  return fact.source;
}

/** Why two facts can't be compared, or null when they are like with like. */
export function unlike(a: Fact, b: Fact): string | null {
  if (a.unit !== b.unit) return `${a.label} and ${b.label} are different kinds of figure`;
  if (family(a) !== family(b)) return `${a.label} is ${family(a) === "estimate" ? "an estimate" : "a count"} and ${b.label} ${family(b) === "estimate" ? "an estimate" : "a count"}`;
  if ((a.country ?? null) !== (b.country ?? null) && a.country !== undefined && b.country !== undefined) {
    return `${a.label} and ${b.label} count different countries`;
  }
  if (a.from && a.to && b.from && b.to) {
    const one = spanDays(a.from, a.to), two = spanDays(b.from, b.to);
    if (Math.abs(one - two) > Math.max(one, two) * 0.1) return `${a.label} covers ${one} days and ${b.label} ${two}`;
  }
  return null;
}

/**
 * Whether a move between two counts could be chance (I29): counts move by
 * about their square root on their own, so a change smaller than twice that
 * is too small to call. Only a comparison that claims a change is tested — a
 * tenth or more either way; two counts within a tenth of each other are said
 * to have held, which is what chance looks like and needs no test.
 */
export function couldBeChance(a: number, b: number): boolean {
  if (a < 0 || b < 0) return false;
  const total = a + b;
  if (total === 0) return true;
  return Math.abs(a - b) / Math.sqrt(total) < 2;
}

const SAYS_TOO_EARLY = /too early|too few|too small to (say|tell)|chance/i;

export function editFinding(draft: DraftFinding, facts: ReadonlyMap<string, Fact>): EditorVerdict {
  const words = [draft.headline, draft.story, draft.action, draft.howWeKnow];
  const all = words.join(" ");
  if (BANNED.test(all) || draft.ruledOut.some((line) => BANNED.test(line))) return { ok: false, note: `Uses a word a client never reads ("${BANNED.exec(all)?.[0] ?? "push"}").` };
  const typed = words.flatMap(typedNumbers);
  if (typed.length > 0) return { ok: false, note: `Types numbers instead of naming their facts: ${typed.slice(0, 3).join(", ")}.` };
  const named = new Set(words.flatMap(namedFacts));
  if (named.size === 0) return { ok: false, note: "Names no figure: a finding needs its evidence." };
  for (const pair of draft.comparisons) {
    if (pair.length !== 2) continue;
    const [a, b] = [facts.get(pair[0]), facts.get(pair[1])];
    if (!a || !b) return { ok: false, note: `Compares a figure Hakken doesn't hold: ${!a ? pair[0] : pair[1]}.` };
    const reason = unlike(a, b);
    if (reason) return { ok: false, note: `Not like with like: ${reason}.` };
    const claimsChange = Math.abs(a.value - b.value) >= Math.max(a.value, b.value) * 0.1;
    if (a.unit === "count" && a.from && b.from && claimsChange && couldBeChance(a.value, b.value) && !SAYS_TOO_EARLY.test(all)) {
      return { ok: false, note: `${a.label} against ${b.label} (${a.value} and ${b.value}) could be chance, and the finding doesn't say it is too early to tell.` };
    }
  }
  const filled = words.map((text) => fillFacts(text, facts));
  const missing = [...new Set(filled.flatMap((answer) => answer.missing))];
  if (missing.length > 0) return { ok: false, note: `Names figures Hakken doesn't hold: ${missing.slice(0, 3).join(", ")}.` };
  const ruledOut = draft.ruledOut.map((line) => fillFacts(line, facts));
  const used = [...new Set([...named, ...draft.comparisons.flat(), ...draft.ruledOut.flatMap(namedFacts)])]
    .map((key) => facts.get(key))
    .filter((fact): fact is Fact => Boolean(fact));
  return {
    ok: true,
    filled: {
      headline: filled[0].text,
      story: filled[1].text,
      action: filled[2].text,
      howWeKnow: filled[3].text,
      ruledOut: ruledOut.filter((line) => line.missing.length === 0).map((line) => line.text),
    },
    used,
  };
}
