"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Split } from "lucide-react";
import { useTranslations } from "next-intl";

import { tickColumn, type TableTicks } from "@/src/ui/components/screens/TableTicks";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CannibalisationBoxes, CannibalisationDaysCard, useKeywordPages } from "../../_components/CannibalisationParts";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId, type ListRow, keywordColumn } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { competingSees } from "@/convex/utils/sees/searchConsoleScreens";
import { cannibalisationSeesData } from "@/convex/utils/sees/own/searchConsoleCannibalisation";

const CHIPS: readonly ChipId[] = ["intent", "band"];
/** In the address for a keyword unticked: the chart waits for one rather than drawing the table's first. */
const NONE_TICKED = "-";

/**
 * Keyword cannibalisation (Pages competing until 20 November 2026, renamed on Anthony's word; the address stays;
 * search-console-plan.md §13.3). Way 3 on the canvas, built on "lets build it as i dont understand and need to see it
 * working": the keywords on Insights' rule (`cannibalisationRule.ts`), the home page and searches for the website's name
 * left out, a keyword listed when two or more of its pages each took at least 1 in 10 of its impressions. One keyword
 * ticked in the table at a time draws its pages each day, asked of Google (`searchConsoleKeywordPagesByDay`), with a
 * menu of the pages it competed with. The table's first keyword is drawn until another is ticked, and the tick is kept
 * in the address.
 */
export default function SearchConsoleCompetingPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "competing", opening: "impressions", chips: CHIPS });
  const dates = usePerformanceDates();
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  const [picked, setPicked] = useSiteParam<string>("keyword", "");
  const first = list.table.pageRows?.[0]?.key ?? null;
  const keyword = picked === NONE_TICKED ? null : picked || first;
  const { answer } = useKeywordPages(keyword);
  // The eye's figures: the list's own the page shows, never the whole summary, and the table's columns
  // (`cannibalisationSeesData`), with the names the page says things by.
  const names = useMemo(() => ({
    these: t("competing.eye.these"), competing: t("competing.eye.competing"), nextPage: t("competing.eye.nextPage"),
    average: t("competing.eye.average"), swapped: t("competing.eye.swapped"),
  }), [t]);
  const seesData = useMemo(() => (summary ? { ...cannibalisationSeesData(summary, list.table.pageRows ?? null), names } : undefined), [summary, list.table.pageRows, names]);
  // "Do first" may open the keywords the eye names, each ticked on this page, where its pages are drawn day by day: the first
  // press linked them to a keyword's own screen, which shows no swaps (20 November 2026).
  const pathname = usePathname();
  const params = useSearchParams();
  const seesLinks = useMemo(() => {
    const figures = summary?.cannibalisation;
    const keys = [...new Set([figures?.busiest?.key, figures?.closest?.key, figures?.mostSwapped?.key, figures?.crowded?.key].filter((key): key is string => Boolean(key)))];
    return keys.map((key) => {
      const next = new URLSearchParams(params.toString());
      next.set("keyword", key);
      return { label: key, href: `${pathname}?${next.toString()}` };
    });
  }, [summary, pathname, params]);
  // One keyword at a time: ticking another takes its place.
  const ticks: TableTicks = {
    keys: keyword ? [keyword] : [],
    set: (next) => setPicked(next.length > 0 ? next[next.length - 1] : NONE_TICKED),
    most: Number.POSITIVE_INFINITY,
    limit: "",
  };
  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="competing" seen={summary ? competingSees(summary) : null} data={seesData} links={seesLinks} />}
      icon={<Split className="h-5 w-5 text-brand" />}
      title={t("competing.title")}
      description={t("competing.description")}
      heroes={<CannibalisationBoxes summary={summary} />}
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <Split className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.pages"), field: "count" },
          { header: t("competing.table.swapsTitle"), field: "swaps" },
          { header: t("table.impressions"), field: "impressions" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.position"), field: "position" },
          { header: t("table.topPage"), field: "top" },
          { header: `${t("competing.table.topShareFile")} (%)`, field: "topShare" },
          { header: t("table.nextPage"), field: "next" },
          { header: `${t("competing.table.nextShareFile")} (%)`, field: "nextShare" },
        ],
        columns: [
          tickColumn<ListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("competing.table.tickLabel", { name: row.key }), heading: t("competing.table.tickHeading") }),
          keywordColumn(t("table.keyword"), recordHref),
          {
            key: "count",
            header: <span title={t("competing.table.pagesTitle")}>{t("table.pages")}</span>,
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.count === null ? "–" : formatNumber(row.count)}</span>,
          },
          {
            // Counted where every day of the dates is kept day by day: a month or less (`swapSpans`, 20 November 2026).
            key: "swaps",
            header: <span title={t("competing.table.swapsTitle")}>{t("competing.table.swaps")}</span>,
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.swaps === null || row.swaps === undefined ? "–" : formatNumber(row.swaps)}</span>,
          },
          ...figureColumns(t, ["impressions", "clicks", "position"]),
        ],
      }}
    >
      <CannibalisationDaysCard key={keyword ?? NONE_TICKED} keyword={keyword} answer={answer} host={host} when={dates.now} exportName={`${host}-search-console-keyword-cannibalisation-days`} />
    </SearchConsoleListScreen>
  );
}
