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

/** Google's average position, with one decimal: "21.4". */
export function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat(readerLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** The reader's language, for naming countries. */
export function readerLanguage(): string {
  return readerLocale();
}

/** Figures in a downloaded file, written as the files built on the server write them. */
export { filePercent, filePosition } from "@/convex/utils/searchConsoleExport";
