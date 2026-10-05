import { formatDate } from "@/src/lib/dates";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

/**
 * How Keyword research says its figures in words, one way on every screen
 * (docs/plans/active/keyword-research-plan.md): a difficulty's word, a
 * verdict's tone and order, and the intents DataForSEO judges a search by.
 */

/** "For acme-agency.test": one of four answers, worked out on the server (`verdictOf`). */
export type Verdict = "WINNING" | "IMPROVE" | "NEW_PAGE" | "TOO_HARD";

/** Each answer's tone, as drawn: Already winning, Improve your page, Worth a new page, Too hard for now. */
export const VERDICT_TONES: Record<Verdict, StatusTone> = {
  WINNING: "success",
  IMPROVE: "warning",
  NEW_PAGE: "info",
  TOO_HARD: "neutral",
};

/** The answers best first: the order Worth it sorts by, and its filter lists. */
export const VERDICTS: readonly Verdict[] = ["WINNING", "IMPROVE", "NEW_PAGE", "TOO_HARD"];

export const verdictRank = (verdict: Verdict | null): number | null => (verdict ? VERDICTS.indexOf(verdict) + 1 : null);

export type DifficultyWord = "veryEasy" | "easy" | "medium" | "hard" | "veryHard";

/** A difficulty of 0 to 100 as a word, by the drawings' bands: under 15, 30, 50 and 70. */
export function difficultyWord(value: number): DifficultyWord {
  if (value < 15) return "veryEasy";
  if (value < 30) return "easy";
  if (value < 50) return "medium";
  if (value < 70) return "hard";
  return "veryHard";
}

/** What searchers want, as DataForSEO judges it. */
export const INTENTS = ["commercial", "informational", "navigational", "transactional"] as const;
export type Intent = (typeof INTENTS)[number];

export const isIntent = (value: string | null | undefined): value is Intent => (INTENTS as readonly string[]).includes(value ?? "");

/** A keyword as the server keeps it — trimmed, one space, lower case — so a list row finds the lookup it came from. */
export const keywordKey = (keyword: string, locationCode: number) => `${locationCode}|${keyword.trim().replace(/\s+/g, " ").toLowerCase()}`;

/** A page's address without its scheme: what a person reads. */
export function readableAddress(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

/** An address without the tracking an assistant adds to the pages it links (`?utm_source=openai`). */
export function withoutTracking(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/** A page's path on its own website, "/" for the home page. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/** A day, `2026-09-29`, as the drawings write a date: "29/09/2026" in the reader's own order. */
export function dayDate(day: string): string {
  // Noon, so no time zone moves it to the day before or after.
  return formatDate(new Date(`${day}T12:00:00Z`));
}

/** The last day of a month, `2026-09` as `2026-09-30`: a dated chart row's newest day. */
export function lastDayOfMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

/**
 * Each country Keyword research looks up in (`convex/utils/researchCountries.ts`),
 * by DataForSEO's location code, as the key its name is kept under in the
 * catalogue — so a reader in Italian reads "Regno Unito".
 */
export const COUNTRY_KEYS: Readonly<Record<number, string>> = { 2826: "gb", 2372: "ie", 2840: "us", 2036: "au", 2124: "ca" };

/**
 * The three kinds of keyword idea (board 5), as the server names them and as
 * the address names them: `?kind=terms`.
 */
export const IDEA_KINDS = [
  { kind: "TERMS", key: "terms" },
  { kind: "QUESTIONS", key: "questions" },
  { kind: "ALSO_RANK", key: "also" },
] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number]["kind"];
export type IdeaKey = (typeof IDEA_KINDS)[number]["key"];
export const IDEA_KEYS: readonly IdeaKey[] = IDEA_KINDS.map((entry) => entry.key);
export const ideaKindOf = (key: IdeaKey): IdeaKind => IDEA_KINDS.find((entry) => entry.key === key)!.kind;

/** Difficulty bands the Ideas filter offers, as drawn: easy under 30, medium 30 to 49, hard 50 and over. */
export const DIFFICULTY_BANDS = { easy: [0, 29], medium: [30, 49], hard: [50, 100] } as const;
export type DifficultyBand = keyof typeof DIFFICULTY_BANDS;
