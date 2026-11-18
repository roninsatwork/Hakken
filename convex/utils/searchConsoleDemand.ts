import { pageWithoutSection } from "./searchConsoleViews";

/**
 * Demand by Classification's figures (search-console-demand-by-classification-way-2-plan-2026-11-18.md): one country's
 * pages for the dates chosen and the dates before, each page added into its Classification. Plain code, so the kept
 * list's read, the live ask and the tests add them up the same way.
 */

/** One of Google's pages in the country: its address, figures and, kept with it, Hakken's page type. */
export type DemandPage = { key: string; clicks: number; impressions: number; kind?: string };

/** One Classification's figures: its clicks and impressions, the same the dates before (null when not held), and its pages. */
export type DemandRow = {
  /** A Classification's id, Unclassified (`NOT_SORTED_KIND`), or Hakken's page type while the website has no Classifications. */
  kind: string;
  clicks: number;
  impressions: number;
  clicksBefore: number | null;
  impressionsBefore: number | null;
  /** The pages Google showed in the dates chosen, each once, a link to one of its sections part of it. */
  pages: number;
};

/** Each Classification's figures, the most impressions first. A page Google showed only the dates before still counts then. */
export function demandOf(now: readonly DemandPage[], before: readonly DemandPage[] | null, kindOf: (page: DemandPage) => string): DemandRow[] {
  const rows = new Map<string, DemandRow & { shown: Set<string> }>();
  const rowOf = (kind: string) => {
    const held = rows.get(kind);
    if (held) return held;
    const made = { kind, clicks: 0, impressions: 0, clicksBefore: before ? 0 : null, impressionsBefore: before ? 0 : null, pages: 0, shown: new Set<string>() };
    rows.set(kind, made);
    return made;
  };
  for (const page of now) {
    const row = rowOf(kindOf(page));
    row.clicks += page.clicks;
    row.impressions += page.impressions;
    row.shown.add(pageWithoutSection(page.key));
  }
  for (const page of before ?? []) {
    const row = rowOf(kindOf(page));
    row.clicksBefore = (row.clicksBefore ?? 0) + page.clicks;
    row.impressionsBefore = (row.impressionsBefore ?? 0) + page.impressions;
  }
  return [...rows.values()]
    .map(({ shown, ...row }) => ({ ...row, pages: shown.size }))
    .sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks || left.kind.localeCompare(right.kind));
}
