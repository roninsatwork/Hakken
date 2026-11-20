import { isNumber, isRow, partOf, round1, type OwnFound, type Row } from "./shared";
import { against, namesOf, text } from "./searchConsoleShared";

/** What Keyword cannibalisation shows of the list's figures, or its rules read: never the brand split, estimates or movers. */
const SUMMARY_FIELDS = ["rows", "of", "clicks", "impressions", "pagesInvolved", "pagesShown", "cannibalisation"] as const;

/** What a row of its table shows, the eye's copy of it: each keyword's pages, swaps, impressions, clicks and position. */
const TABLE_FIELDS = ["key", "count", "swaps", "impressions", "clicks", "position"] as const;

/**
 * The list's figures as Keyword cannibalisation hands them its eye (search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md),
 * with the table's rows: only what the page shows or its rules read, as Low click rate's (`lowCtrSeesData`).
 */
export function cannibalisationSeesData<Summary, Shown>(summary: Summary, rows: readonly Shown[] | null): { summary: Partial<Summary>; rows: Array<Partial<Record<(typeof TABLE_FIELDS)[number], unknown>>> | null; picked: true } {
  const shown = isRow(summary) ? Object.fromEntries(SUMMARY_FIELDS.filter((field) => field in summary).map((field) => [field, summary[field]])) : {};
  const table = rows ? rows.map((row) => Object.fromEntries(TABLE_FIELDS.filter((field) => isRow(row) && field in row).map((field) => [field, (row as Row)[field]]))) : null;
  return { summary: shown as Partial<Summary>, rows: table, picked: true };
}

/** A keyword two pages share, as the summary carries it: its top two pages' shares in per cent, as the eye's data says them (`pageData`). */
type Shared = { key: string; count: number; topShare: number; nextShare: number; swaps: number | null };
const percentOf = (row: Row, field: string): number | null => (isNumber(row[`${field}Percent`]) ? (row[`${field}Percent`] as number) : isNumber(row[field]) ? round1((row[field] as number) * 100) : null);
function sharedOf(value: unknown): Shared | null {
  if (!isRow(value) || typeof value.key !== "string" || !isNumber(value.count)) return null;
  const [topShare, nextShare] = [percentOf(value, "topShare"), percentOf(value, "nextShare")];
  if (topShare === null || nextShare === null) return null;
  return { key: value.key, count: value.count, topShare, nextShare, swaps: isNumber(value.swaps) ? value.swaps : null };
}

/**
 * Keyword cannibalisation (Way 3, 20 November 2026), on Insights' rule: keywords two or more of the website's pages each took
 * at least 1 in 10 of the impressions of, the home page and searches for its name left out. How many keywords that is, of
 * every keyword Google showed; how many pages compete, of every page it showed; the busiest keyword's top two pages' shares;
 * among the busiest, the closest split and the one with most pages; and where Swaps were counted, the keyword Google
 * swapped pages for most and how many it swapped at all. Every figure is the list's own, over every keyword it lists.
 */
export function cannibalisationFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const summary = isRow(data.summary) ? data.summary : {};
  const listed = isNumber(summary.rows) ? summary.rows : 0;
  if (listed === 0) return found;
  const these = text(names, "these", "Keywords two pages share");
  // The headline: the keywords two pages share, of every keyword Google showed.
  if (isNumber(summary.of) && summary.of > 0) found.push(partOf("keywords", these, "keywordsShown", listed, summary.of, 1.5 + Math.min(0.3, listed / summary.of)));
  // The pages competing, of every page Google showed.
  if (isNumber(summary.pagesInvolved) && isNumber(summary.pagesShown) && summary.pagesShown > 0 && summary.pagesInvolved > 0) {
    found.push(partOf("pages", text(names, "competing", "Pages competing"), "pages", summary.pagesInvolved, summary.pagesShown, 1.2 + Math.min(0.3, summary.pagesInvolved / summary.pagesShown)));
  }
  const figures = isRow(summary.cannibalisation) ? summary.cannibalisation : {};
  const nextPage = text(names, "nextPage", "its next page");
  const average = text(names, "average", "the average keyword two pages share");
  // The busiest keyword: its top page's share of its impressions against its next page's.
  const busiest = sharedOf(figures.busiest);
  if (busiest) found.push({ ...against("busiest", busiest.key, "impressionSharePercent", busiest.topShare, busiest.nextShare, 0, nextPage), score: 1.3 });
  // Among the busiest, the closest split: the two pages nearest half each.
  const closest = sharedOf(figures.closest);
  if (closest && closest.key !== busiest?.key) {
    found.push({ ...against("closest", closest.key, "impressionSharePercent", closest.topShare, closest.nextShare, 0, nextPage), score: 1.15 + Math.min(0.2, closest.nextShare / Math.max(0.01, closest.topShare) / 5) });
  }
  // Among the busiest, the one most pages compete for, against the pages a keyword has on average.
  const crowded = sharedOf(figures.crowded);
  if (crowded && isNumber(figures.averagePages) && crowded.count > figures.averagePages && crowded.key !== busiest?.key && crowded.key !== closest?.key) {
    found.push({ ...against("crowded", crowded.key, "pages", crowded.count, figures.averagePages, 0, average), score: 0.85 + Math.min(0.1, crowded.count / 50) });
  }
  // Where Swaps were counted: the keyword Google swapped pages for most, against the average, and how many it swapped at all.
  const swapped = sharedOf(figures.mostSwapped);
  if (swapped && swapped.swaps !== null && isNumber(figures.averageSwaps)) {
    found.push({ ...against("swapped", swapped.key, "swaps", swapped.swaps, figures.averageSwaps, 0, average), score: 1.25 + Math.min(0.2, swapped.swaps / 100) });
  }
  if (isNumber(figures.swapped) && figures.swapped > 0) {
    found.push(partOf("swappedKeywords", text(names, "swapped", "Keywords Google swapped pages for"), "cannibalisedKeywords", figures.swapped, listed, 0.95 + Math.min(0.3, figures.swapped / listed)));
  }
  return found;
}
