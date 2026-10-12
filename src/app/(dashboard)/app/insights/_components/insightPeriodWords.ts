import { formatMonth } from "../../sites/_components/siteFormat";

/**
 * A period as the screens name it (insights-intelligence-plan.md phase 1):
 * "September 2026", "Q3 2026", "the last 12 months" — a span of months as
 * its period would be, or its first and last months.
 */
export function periodWords(id: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (id === "12M") return t("twelveMonths");
  const quarter = /^(\d{4})-Q([1-4])$/.exec(id);
  if (quarter) return t("quarter", { quarter: Number(quarter[2]), year: quarter[1] });
  return formatMonth(id);
}

/** A span of months as words: one month by name, three as their quarter, otherwise first to last. */
export function monthsWords(months: readonly string[], t: (key: string, values?: Record<string, string | number>) => string): string {
  if (months.length === 1) return formatMonth(months[0]);
  const first = months[0], last = months[months.length - 1];
  const number = Number(first.slice(5, 7));
  if (months.length === 3 && (number - 1) % 3 === 0 && first.slice(0, 4) === last.slice(0, 4)) return t("quarter", { quarter: (number - 1) / 3 + 1, year: first.slice(0, 4) });
  return t("span", { from: formatMonth(first), to: formatMonth(last) });
}

/**
 * A source's name as a person reads it: Google Analytics' "(direct)" is
 * visits typed in or bookmarked, and "(not set)" a source it never recorded.
 */
export function sourceWords(name: string, group: string, words: { typed: string; unknown: string }): string {
  if (group === "TYPED") return words.typed;
  if (!name || name === "(not set)") return words.unknown;
  return name;
}
