import type { ListRow } from "./SearchConsoleTables";

/**
 * A keyword's own screen, Way 2 (search-console-keyword-screen-way-2-plan-2026-11-17.md): which of the website's pages
 * Google showed for the keyword, and which got the clicks. Six pages are named and the rest are "The other N". Pure, so
 * the eye's tests build the bands as the screen does (`convex/utils/sees/searchConsolePeriods.test.ts`).
 */
const NAMED = 6;

export type KeywordBandPart = { key: string; name: string; clicks: number; impressions: number };

/** The bands' figures, which the eye reads too: how many pages Google showed, how many got a click, and the parts. */
export type KeywordBands = { shown: number; clicked: number; clicks: number; impressions: number; parts: KeywordBandPart[] };

const total = (rows: readonly { clicks: number; impressions: number }[], read: "clicks" | "impressions") => rows.reduce((sum, row) => sum + row[read], 0);

/** Every page Google answered for the keyword, before the table's search and chips: the six it showed most, then the rest. */
export function keywordBands(rows: readonly ListRow[], nameOf: (key: string) => string, others: (count: number) => string): KeywordBands {
  const ranked = [...rows].sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks);
  const named = ranked.length <= NAMED + 1 ? ranked : ranked.slice(0, NAMED);
  const rest = ranked.slice(named.length);
  return {
    shown: rows.length,
    clicked: rows.filter((row) => row.clicks > 0).length,
    clicks: total(rows, "clicks"),
    impressions: total(rows, "impressions"),
    parts: [
      ...named.map((row) => ({ key: row.key, name: nameOf(row.key), clicks: row.clicks, impressions: row.impressions })),
      ...(rest.length > 0 ? [{ key: "rest", name: others(rest.length), clicks: total(rest, "clicks"), impressions: total(rest, "impressions") }] : []),
    ],
  };
}
