import { isRow, type Row } from "./shared";

/** What Position bands shows of the list's figures, or its rules read (`bandsFindings`), beside its whole-list figures. */
const SUMMARY_FIELDS = ["rows", "of", "clicks", "previousClicks", "impressions", "position", "bands", "bandsBefore", "wholeList"] as const;

/** What a row of Position bands' table shows, the eye's copy of it: each keyword's band, place, move, clicks and times shown. */
const TABLE_FIELDS = ["key", "band", "position", "previousPosition", "positionChange", "clicks", "previousClicks", "change", "impressions", "brand"] as const;

/**
 * The table's rows as the eye reads them (search-console-position-bands-way-3-plan-2026-11-19.md): the fields the table
 * shows, and no more. A row of the list carries 26 fields since November (pages, estimates, intent, tracking…), and 25 of
 * them took the writer's brief past its size (`codeFirstBriefCeilings.json`) on the figures of 19 November 2026.
 */
export function bandsSeesRows<Shown>(rows: readonly Shown[] | null | undefined): Array<Partial<Record<(typeof TABLE_FIELDS)[number], unknown>>> | null {
  if (!rows) return null;
  return rows.map((row) => Object.fromEntries(TABLE_FIELDS.filter((field) => isRow(row) && field in row).map((field) => [field, (row as Row)[field]])));
}

/**
 * The list's figures as Position bands hands them its eye: only those the page shows or its rules read, never the list's
 * intent kinds, brand split, estimates or biggest movers, which took the writer's brief past its size with the rows.
 */
export function bandsSeesData<Summary>(summary: Summary): Summary {
  if (!isRow(summary)) return summary;
  const shown: Row = Object.fromEntries(SUMMARY_FIELDS.filter((field) => field in summary).map((field) => [field, summary[field]]));
  if (isRow(shown.wholeList)) {
    const { movers: _movers, ...wholeList } = shown.wholeList;
    shown.wholeList = wholeList;
  }
  return shown as Summary;
}
