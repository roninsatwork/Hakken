"use client";

import { useCallback } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DemandBoxes } from "./DemandParts";
import { LiveProblem } from "./SearchConsoleNotices";
import type { useSiteFiguresFor } from "./SearchConsoleFigures";
import { shortPageName } from "./searchConsoleRecords";
import { useSearchConsoleSiteId } from "./useSearchConsole";

/**
 * Search Console's Pages, as Anthony chose it on the canvas (17 November 2026: "Way 1", then "yes please build it";
 * docs/plans/active/search-console-pages-way-1-plan-2026-11-17.md): the four boxes and the chart's short names for the
 * pages ticked. The chart itself is the part Keywords shares (`TickedDays.tsx`).
 */

/**
 * The four boxes: the website's figures for the country chosen, Performance's read, as Demand by Classification's boxes
 * show them, each against the dates before by their name ("7% fewer than September"). Since 18 November 2026 Pages
 * follows the country menu (Anthony: "the pages screen is showing numbers not consistent with the other pages"): the
 * table shares out only the clicks Google ties to a page, and no sentence on the page says how it's counted. Until then
 * the boxes added up every country's pages: 8,714 clicks for More Handles in October, where every other screen said the
 * United Kingdom's 7,124.
 */
export function PagesBoxes({ read }: { read: ReturnType<typeof useSiteFiguresFor> }) {
  if (read.problem) return <LiveProblem problem={read.problem} retry={read.retry} />;
  return <DemandBoxes figures={read.figures} />;
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
