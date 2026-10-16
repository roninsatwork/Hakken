import { v, type Infer } from "convex/values";
import { CLARITY_FIGURES, emptyTotals, type ClarityFigure, type ClarityTotals, type ClarityTotalsRow } from "./clarityRows";
import { bookPages, packNumbers, unpackNumbers } from "./searchConsolePacks";
import { packDays, unpackDays } from "./packedColumns";

/**
 * Clarity's kept figures, packed (docs/plans/active/agents-and-clarity-plan.md,
 * Part 0), the way Search Console's ready-made parts are (keep-less-history 8.2,
 * core-data-normalisation §6.3): each record carries its own book of the page
 * addresses and devices it holds, each row its places in those books, and
 * every figure a column of whole numbers packed as text a few characters each.
 * A morehandles-sized day measured 104 KB as rows of objects and 38 KB packed,
 * holding all of Clarity's rows rather than the 300 most visited.
 */

const figureColumns = Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, v.string()])) as Record<ClarityFigure, ReturnType<typeof v.string>>;

/** Rows packed: the pages' and devices' books, each row's places in them, and a packed column a figure. */
export const clarityPackValidator = v.object({
  /** Page addresses, each once; absent for rows across the website. */
  pageBook: v.optional(v.array(v.string())),
  pages: v.optional(v.string()),
  deviceBook: v.array(v.string()),
  devices: v.string(),
  figures: v.object(figureColumns),
});
export type ClarityPack = Infer<typeof clarityPackValidator>;

/** The website's totals a day, across every device, for a period's charts: the days and a packed column a figure. */
export const clarityDailyValidator = v.object({
  days: v.string(),
  figures: v.object(figureColumns),
});
export type ClarityDaily = Infer<typeof clarityDailyValidator>;

export function packTotals(rows: readonly ClarityTotalsRow[]): ClarityPack {
  const withPages = rows.some((row) => row.page !== null);
  const devices = bookPages(rows.map((row) => row.device));
  const pages = withPages ? bookPages(rows.map((row) => row.page ?? "")) : null;
  return {
    ...(pages ? { pageBook: pages.book, pages: pages.places } : {}),
    deviceBook: devices.book,
    devices: devices.places,
    figures: Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, packNumbers(rows.map((row) => row[figure]))])) as Record<ClarityFigure, string>,
  };
}

export function unpackTotals(pack: ClarityPack): ClarityTotalsRow[] {
  const devices = unpackNumbers(pack.devices);
  const pages = pack.pages !== undefined ? unpackNumbers(pack.pages) : null;
  const columns = CLARITY_FIGURES.map((figure) => [figure, unpackNumbers(pack.figures[figure])] as const);
  return devices.map((place, at) => {
    const row = { page: pages && pack.pageBook ? pack.pageBook[pages[at]] ?? "" : null, device: pack.deviceBook[place] ?? "Other" } as ClarityTotalsRow;
    for (const [figure, column] of columns) row[figure] = column[at] ?? 0;
    return row;
  });
}

export function packDaily(days: ReadonlyArray<{ day: string; totals: ClarityTotals }>): ClarityDaily {
  return {
    days: packDays(days.map((entry) => entry.day)) as string,
    figures: Object.fromEntries(CLARITY_FIGURES.map((figure) => [figure, packNumbers(days.map((entry) => entry.totals[figure]))])) as Record<ClarityFigure, string>,
  };
}

export function unpackDaily(daily: ClarityDaily): Array<{ day: string; totals: ClarityTotals }> {
  const days = unpackDays(daily.days);
  const columns = CLARITY_FIGURES.map((figure) => [figure, unpackNumbers(daily.figures[figure])] as const);
  return days.map((day, at) => {
    const totals = emptyTotals();
    for (const [figure, column] of columns) totals[figure] = column[at] ?? 0;
    return { day: day ?? "", totals };
  });
}

/** Rows added up by a key of each — a page across its devices, a page on a device, a device. */
export function addUpBy(rows: Iterable<ClarityTotalsRow>, keyOf: (row: ClarityTotalsRow) => string): Map<string, ClarityTotals> {
  const sums = new Map<string, ClarityTotals>();
  for (const row of rows) {
    const key = keyOf(row);
    const held = sums.get(key) ?? emptyTotals();
    for (const figure of CLARITY_FIGURES) held[figure] += row[figure];
    sums.set(key, held);
  }
  return sums;
}
