"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatNumber } from "../../sites/_components/siteFormat";
import { SearchConsoleFigures, useSearchConsoleSiteFigures } from "./SearchConsoleFigures";
import type { ListSummary } from "./SearchConsoleTables";
import { shortPageName } from "./searchConsoleRecords";
import { useSearchConsoleCountry, useSearchConsoleSiteId } from "./useSearchConsole";

/**
 * Search Console's Pages, as Anthony chose it on the canvas (17 November 2026: "Way 1", then "yes please build it";
 * docs/plans/active/search-console-pages-way-1-plan-2026-11-17.md): the four boxes counting every country, as the table
 * does, the line saying what the country chosen had alone, and the chart's short names for the pages ticked. The chart
 * itself is the part Keywords shares (`TickedDays.tsx`).
 */

const rate = (clicks: number, impressions: number) => (impressions > 0 ? clicks / impressions : 0);

/**
 * The four boxes from the page list's own figures, every country's, against every page the span before held
 * (`beforeTotals`). Until 17 November 2026 they were the home country's: 7,124 clicks for More Handles in October, beside
 * a table whose pages added up to 8,714.
 */
export function PagesBoxes({ summary, days, preparing }: { summary: ListSummary | null; days: number; preparing: boolean }) {
  if (preparing) return null;
  if (!summary) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const totals = { clicks: summary.clicks, impressions: summary.impressions, ctr: rate(summary.clicks, summary.impressions), position: summary.position ?? 0 };
  const before = summary.beforeTotals ?? null;
  const previous = before ? { clicks: before.clicks, impressions: before.impressions, ctr: rate(before.clicks, before.impressions), position: before.position ?? 0 } : null;
  return <SearchConsoleFigures totals={totals} previous={previous} days={days} />;
}

/**
 * One line under the boxes: they count every country, as the pages do, and what the country chosen had alone — the
 * website's own figures, the read the boxes made until 17 November 2026. It takes the place of the note about every
 * country (`SearchConsoleEveryCountry`), which Shown but not clicked still carries.
 */
export function PagesCountryLine() {
  const t = useTranslations("searchConsole.pages");
  const siteId = useSearchConsoleSiteId();
  const [country] = useSearchConsoleCountry();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const read = useSearchConsoleSiteFigures();
  const code = country ?? choices?.main;
  const clicks = read.figures && !read.problem ? read.figures.totals?.clicks : undefined;
  if (!code || clicks === undefined || clicks === null) return null;
  // The country is the one the menu beside the dates shows, so the line needn't name it (Anthony, 17 November 2026: "the
  // words are not good"; "United Kingdom alone had 7,124 clicks" read badly).
  return <p className="text-[12px] leading-relaxed text-secondary">{t("everyCountry", { clicks: formatNumber(clicks) })}</p>;
}

/** Each ticked page's short name on the chart (`shortPageName`), from its title where the website has one. */
export function usePageChartNames(keys: readonly string[], host: string): (key: string) => string {
  const t = useTranslations("searchConsole.pages.chart");
  const siteId = useSearchConsoleSiteId();
  const titles = useQuery(api.pageTitles.pageTitlesFor, keys.length > 0 ? { siteId, pages: [...keys] } : "skip");
  const home = t("homePage");
  // The same titles keep the same names: the eye reads them.
  return useCallback((key: string) => shortPageName(titles?.find((one) => one.page === key)?.title, key, host, home), [titles, host, home]);
}
