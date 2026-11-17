"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { tickColumn } from "@/src/ui/components/screens/TableTicks";
import { KeywordsDaysCard, KeywordsNamedLine, useTickedKeywordDays, useTickedKeywords } from "../../_components/KeywordsParts";
import { SiteFiguresBoxes, useSearchConsoleSiteFigures } from "../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, keywordColumn, useSearchConsoleList, type ChipId, type ListRow } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { useSearchConsoleCountry } from "../../_components/useSearchConsole";
import { keywordsSees } from "@/convex/utils/sees/searchConsoleScreens";

/** Intent beside the drawn chips: Types opens Keywords narrowed to one. */
const CHIPS: readonly ChipId[] = ["tracked", "band", "intent", "device"];

/**
 * Keywords (search-console-plan.md §13.2), as Anthony chose it on 17 November 2026 (the canvas's Way 2;
 * search-console-keywords-way-2-plan-2026-11-17.md): the website's four boxes, a line saying how many of its clicks came
 * from keywords Google names, a chart of the keywords ticked in the table beside the whole website, and every keyword
 * Google showed the website for in the dates chosen. The table is the lean one Anthony settled the same day (the table
 * rule, AGENTS.md "Tables are lean"; search-console-keywords-lean-table-2026-11-17.md): the tick box, the keyword on one
 * line, Clicks, Up or down, Shown, CTR and Position. Track, Pages, Top page and the move in position are on the
 * keyword's own screen, which each row opens.
 */
export default function SearchConsoleKeywordsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const icon = <Search className="h-8 w-8 text-muted/30" />;
  const site = useSearchConsoleSiteFigures();
  const figures = site.figures && !site.problem ? site.figures : undefined;
  const ticks = useTickedKeywords();
  const { keywords: ticked, retry } = useTickedKeywordDays(ticks.keys);
  // Where the country's or the website's days start, so the chart never draws days not held as noughts.
  const [country] = useSearchConsoleCountry();
  const connection = list.status?.connection;
  const kept = country ? connection?.countriesNewest.find((held) => held.country === country) : undefined;
  const heldFrom = country ? (kept?.daysFrom ?? null) : (connection?.daysFrom ?? null);
  // The eye's figures: the list's, every click the website had, the ticked keywords' clicks against the span before, and the
  // names the page says things by (as Position bands and Brand and non-brand name them), in the reader's words.
  const names = useMemo(() => ({
    "1-3": t("bands.top3"), "4-10": t("filters.bands.4-10"), "11-20": t("filters.bands.11-20"), "21-50": t("filters.bands.21-50"), "51+": t("filters.bands.51+"),
    brand: t("filters.brandYes"), other: t("filters.brandNo"), hidden: t("performance.squares.groups.hidden"),
  }), [t]);
  const totalClicks = figures?.totals?.clicks ?? null;
  const seesData = useMemo(() => (list.pageData ? {
    ...list.pageData,
    ...(totalClicks !== null ? { website: { clicks: totalClicks } } : {}),
    ticked: ticked.filter((keyword) => keyword.clicks !== null).map((keyword) => ({ name: keyword.key, clicks: keyword.clicks, previousClicks: keyword.previousClicks })),
    names,
  } : undefined), [list.pageData, totalClicks, ticked, names]);

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="keywords" seen={list.summary ? (list.range.period === "custom" ? null : keywordsSees(list.summary, list.range.period)) : null} data={seesData} />}
      icon={<Search className="h-5 w-5 text-brand" />}
      title={t("keywords.title")}
      description={t("keywords.description")}
      heroes={(
        <>
          <SiteFiguresBoxes read={site} />
          <KeywordsNamedLine total={totalClicks} named={list.summary?.clicks} />
        </>
      )}
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: icon,
        ticks,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
          { header: t("table.pages"), field: "count" },
          { header: t("table.topPage"), field: "top" },
          { header: t("track.column"), field: "tracked" },
        ],
        columns: [
          tickColumn<ListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("keywords.chart.tickLabel", { name: row.key }), heading: t("keywords.chart.tickHeading") }),
          keywordColumn(t("table.keyword"), recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position"]),
        ],
      }}
    >
      {figures?.totals ? <KeywordsDaysCard figures={figures} ticked={ticked} host={host} heldFrom={heldFrom} retry={retry} /> : null}
    </SearchConsoleListScreen>
  );
}
