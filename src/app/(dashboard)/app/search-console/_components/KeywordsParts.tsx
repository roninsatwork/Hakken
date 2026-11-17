"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "../../sites/_components/siteFormat";
import type { SiteFigures } from "./SearchConsoleFigures";
import { MOST_TICKED, TickedDaysCard, useTickedDays, useTickedRows, type TickedRow } from "./TickedDays";

/**
 * Search Console's Keywords, as Anthony chose it on the canvas (17 November 2026: "way 2 i think", then "Yes, build it";
 * docs/plans/active/search-console-keywords-way-2-plan-2026-11-17.md): the keywords ticked in the table drawn day by day
 * beside the whole website, as All pages draws ticked pages. The chart and its ticks are the part Pages shares
 * (`TickedDays.tsx`, search-console-pages-way-1-plan-2026-11-17.md); these are Keywords' own words for them.
 */

export { MOST_TICKED };

/** The keywords ticked to draw, in the order ticked, and the tick that changes them; the table stays on its page. */
export function useTickedKeywords() {
  const t = useTranslations("searchConsole.keywords.chart");
  return useTickedRows(t("tickLimit", { most: MOST_TICKED }));
}

/** A ticked keyword's days, and its clicks against the span before where Google still keeps it; null while on its way. */
export type TickedKeyword = TickedRow;

/** Each ticked keyword's days, asked of Google once while the page is open, in the country chosen. */
export function useTickedKeywordDays(keys: readonly string[]): { keywords: TickedKeyword[]; retry: () => void } {
  const { rows, retry } = useTickedDays("query", keys);
  return { keywords: rows, retry };
}

/**
 * How many of the website's clicks came from keywords Google names, and how many from searches it keeps private: the boxes
 * count every click and the table only the named ones (More Handles, October 2026: 7,124 against 1,946), and the page never
 * said why until Anthony chose this line on the canvas.
 */
export function KeywordsNamedLine({ total, named }: { total: number | null | undefined; named: number | null | undefined }) {
  const t = useTranslations("searchConsole.keywords");
  if (total === null || total === undefined || named === null || named === undefined || total <= 0) return null;
  const shown = Math.min(named, total);
  return (
    <p className="text-[12px] leading-relaxed text-secondary">
      {t("named", { named: formatNumber(shown), total: formatNumber(total), hidden: formatNumber(total - shown) })}
    </p>
  );
}

/**
 * Clicks, impressions or average position day by day: a line for each keyword ticked in the table, and the whole website,
 * dashed, as All pages draws it. It opens on the whole website with nothing ticked (Anthony, 4 November, on All pages: "make
 * this the default view"); turning the website off lets a keyword's few clicks be told apart from its hundreds.
 */
export function KeywordsDaysCard({ figures, ticked, host, heldFrom, retry }: {
  figures: SiteFigures;
  ticked: readonly TickedKeyword[];
  host: string;
  heldFrom: string | null;
  retry: () => void;
}) {
  return (
    <TickedDaysCard
      words="searchConsole.keywords.chart"
      ticked={ticked}
      host={host}
      heldFrom={heldFrom}
      retry={retry}
      exportName={`${host}-search-console-keywords`}
      website={figures}
    />
  );
}
