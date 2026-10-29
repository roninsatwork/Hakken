import { addInto, blank } from "./googleAnalyticsRows";
import { pageAddress, type ListRow } from "./googleAnalyticsLists";
import type { AnalyticsList, DayFactList } from "./googleAnalyticsSchema";
import { NOT_SORTED_KIND, type PageKinds } from "./utils/pageKinds";
import { NO_PAGE_KIND } from "./utils/sees/analyticsChannel";

/**
 * The landing pages by kind of page, a day list kept as days only
 * (conversion-charts-plan.md, 2026-10-29; `DAY_ONLY_LISTS`): each day's
 * landing pages asked of Google as pages and added up by the website's own
 * classification as they arrive, so Conversions' lines by page kind can draw a
 * day at a time without a row a page being kept.
 */

/** A day list asked of Google as another list: the landing pages by kind are the landing pages, folded as they arrive. */
const ASKED_AS: Partial<Record<DayFactList, AnalyticsList>> = { landingKind: "landing" };
export const askedAs = (list: DayFactList): AnalyticsList => ASKED_AS[list] ?? list;

/**
 * A day's landing pages added up by kind of page: the website's own
 * classification, Unclassified where none fits, and "no page recorded" for
 * Google's "(not set)". A row a kind, so a 10,000-page website's day is a
 * dozen rows, not ten thousand.
 */
export function foldByKind(rows: readonly ListRow[], kinds: PageKinds | null, origin: string): ListRow[] {
  const by = new Map<string, ListRow>();
  for (const row of rows) {
    const address = pageAddress(origin, row.key);
    const kind = address === "(not set)" ? NO_PAGE_KIND : kinds ? kinds.kindOf(address) : NOT_SORTED_KIND;
    addInto(by.get(kind) ?? by.set(kind, blank(kind)).get(kind)!, row);
  }
  return [...by.values()];
}
