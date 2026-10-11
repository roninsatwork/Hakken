import { v, type Infer } from "convex/values";

/**
 * Insights' facts (docs/plans/active/insights-analyst-plan.md §2, §8, I21,
 * I45): every figure a specialist may use, read from where its source keeps
 * it, named by a key and labelled in plain words. A finding never types a
 * number: it names facts as `[[key]]` and the figure is filled in from the
 * reading, so a number in a finding is the number held — and the Editor can
 * check each comparison like with like from the facts' own spans, country
 * and source. Nothing here is stored; a finding keeps the few facts it used.
 */

export const FACT_UNITS = ["count", "money", "percent", "position", "seconds", "score"] as const;
export type FactUnit = (typeof FACT_UNITS)[number];

export const FACT_SOURCES = ["searchConsole", "analytics", "market", "ai", "local", "crawl"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const factValidator = v.object({
  key: v.string(),
  value: v.number(),
  unit: v.union(...FACT_UNITS.map((unit) => v.literal(unit))),
  source: v.union(...FACT_SOURCES.map((source) => v.literal(source))),
  /** Plain words: "Google clicks in the United Kingdom". The span is said by `from` and `to`. */
  label: v.string(),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  /** The home country it counts (`gbr`), "world" for every country; absent where the source has no country. */
  country: v.optional(v.string()),
  /** A money fact's currency (`GBP`). */
  currency: v.optional(v.string()),
});
export type Fact = Infer<typeof factValidator>;

/** A period kept ready-made, and the spans compared with it. */
export type FactWhich = "now" | "before" | "year";

/** A fact's key: its parts joined by dots, each part's own dots and spaces kept as written (pages, searches, rivals). */
export function factKey(...parts: Array<string | number>): string {
  return parts.map((part) => String(part)).join(".");
}

/** The facts by key. */
export function factsByKey(facts: readonly Fact[]): Map<string, Fact> {
  return new Map(facts.map((fact) => [fact.key, fact]));
}

/** A day shifted by whole days, as `YYYY-MM-DD`. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** How many days a span holds, both ends counted. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * The three spans of a period ending on `newest`: the period, the same number
 * of days just before, and the same days a year before — 52 weeks back, so
 * each day falls on the same weekday, as Google Analytics' own are.
 */
export function spansOf(newest: string, days: number): Record<FactWhich, { from: string; to: string }> {
  const from = shiftDay(newest, -(days - 1));
  return {
    now: { from, to: newest },
    before: { from: shiftDay(from, -days), to: shiftDay(from, -1) },
    year: { from: shiftDay(from, -364), to: shiftDay(newest, -364) },
  };
}

const COUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const ONE = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** A fact as a reader sees it: "1,070", "£520", "7.3%", "13.8", "1m 12s". */
export function formatFact(fact: Pick<Fact, "value" | "unit" | "currency">): string {
  if (fact.unit === "money") {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: fact.currency ?? "GBP", maximumFractionDigits: 0 }).format(fact.value);
    } catch {
      return COUNT.format(fact.value);
    }
  }
  if (fact.unit === "percent") return `${ONE.format(fact.value)}%`;
  if (fact.unit === "position" || fact.unit === "score") return ONE.format(fact.value);
  if (fact.unit === "seconds") {
    const seconds = Math.round(fact.value);
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }
  return COUNT.format(fact.value);
}

/** `[[key]]` in a finding's words. */
const NAMED = /\[\[([^\]]+)\]\]/g;

/** The facts a text names. */
export function namedFacts(text: string): string[] {
  return [...text.matchAll(NAMED)].map((match) => match[1].trim());
}

/**
 * A finding's words with each named fact filled in, and the names no fact
 * answers — a finding naming a fact that isn't held is sent back, never
 * published with a gap (I21).
 */
export function fillFacts(text: string, facts: ReadonlyMap<string, Fact>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const filled = text.replace(NAMED, (whole, name: string) => {
    const fact = facts.get(name.trim());
    if (!fact) {
      missing.push(name.trim());
      return whole;
    }
    return formatFact(fact);
  });
  return { text: filled, missing };
}

/** A share as a percent fact's value: 0.073 → 7.3. Null when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** How much a figure moved, as a percent of where it was; null from nothing. */
export function changeOf(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;
}
