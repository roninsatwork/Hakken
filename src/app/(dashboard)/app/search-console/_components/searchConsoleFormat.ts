/**
 * How the Search Console screens write a rate and a position, beside the
 * Sites screens' numbers and days (`siteFormat.ts`): in the reader's language
 * — "2.1%" and "21.4" in English, "2,1%" and "21,4" in Italian.
 */
function readerLocale(): string {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang.toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
}

/** A click-through rate or a share, 0–1, as a percentage with one decimal: "2.1%". */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat(readerLocale(), { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/**
 * Clicks for every 100 impressions, with two decimals: "0.49", "1.86". Click rate by position's, where most of the rates are
 * under 1 and one decimal read 0.14 and 0.07 alike (search-console-breakdowns-plan-2026-11-20.md).
 */
export function formatPer100(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "–";
  return new Intl.NumberFormat(readerLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate * 100);
}

/** A click-through rate as a percentage with two decimals, for rates mostly under 1%: "0.49%". */
export function formatFineRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "–";
  return new Intl.NumberFormat(readerLocale(), { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate);
}

/** Google's average position, with one decimal: "21.4". */
export function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat(readerLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** Google's name for a kind of rich result, in words: "REVIEW_SNIPPET" reads "Review snippet". Rich results and Performance name them so. */
export function appearanceName(key: string, known: (key: string) => string | null): string {
  return known(key) ?? key.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/** The reader's language, for naming countries. */
export function readerLanguage(): string {
  return readerLocale();
}

/** Figures in a downloaded file, written as the files built on the server write them. */
export { filePercent, filePosition } from "@/convex/utils/searchConsoleExport";
