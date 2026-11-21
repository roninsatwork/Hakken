"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { tickColumn } from "@/src/ui/components/screens/TableTicks";
import { PagesBoxes, usePageChartNames } from "../../_components/PagesParts";
import { useSearchConsoleSiteFigures } from "../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { type ChipId, figureColumns, pageColumn, useSearchConsoleList, type ListRow } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { MOST_TICKED, TickedDaysCard, useListOpening, useTickedDays, useTickedRows } from "../../_components/TickedDays";
import { pagesSees } from "@/convex/utils/sees/searchConsoleScreens";
import { pagesEyeData } from "@/convex/utils/sees/eyeData/searchConsoleLists";
import { wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";

/**
 * The drawing's Section chip ("Top level", "/hub/") was one website's own folders; a Page type chip from Sites stands
 * in its place for every website (noted for Anthony, 2026-10-03). Device left on 17 November 2026, as the board he chose
 * has it: a page split by device leaves out the searches Google keeps private (More Handles' home page in October: 396
 * clicks, 255 by device), and the page never said so.
 */
const CHIPS: readonly ChipId[] = ["tracked", "band", "pageType"];

/**
 * Pages (search-console-plan.md §13.2), as Anthony chose it on 17 November 2026 (the canvas's Way 1;
 * search-console-pages-way-1-plan-2026-11-17.md): four boxes for the country chosen, Performance's own, against the dates
 * before; the pages ticked in the table drawn day by day, with the span before under them, opening on the three with the
 * most clicks; and every page Google showed in the dates chosen, on one line each: its clicks, how they moved, the times
 * shown, click-through rate and position. Track, its keywords and the top one are on the page's own screen, which each
 * row opens (AGENTS.md "Tables are lean").
 *
 * Every figure follows the country menu since 18 November 2026, as Demand by Classification's do: the boxes are the
 * country's own totals, and the table, the chart and the eye share out only the clicks Google ties to a page in that
 * country (`inCountry`). No row or line stands for the difference, and no sentence says how it's counted: the eye says it once.
 */
export default function SearchConsolePagesPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", chips: CHIPS, inCountry: true });
  // The boxes: the website's figures for the dates, kind of result and country chosen, Performance's read.
  const site = useSearchConsoleSiteFigures();
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const icon = <FileText className="h-8 w-8 text-muted/30" />;
  // The three busiest pages, read once as the list first shows in its own order, on its first page.
  const opening = useListOpening(list);
  const ticks = useTickedRows(t("pages.chart.tickLimit", { most: MOST_TICKED }), opening);
  const { rows: ticked, retry } = useTickedDays("page", ticks.keys);
  const nameOf = usePageChartNames(ticks.keys, host);
  // The eye's figures: the list's, the country's clicks from the boxes (the gap Google leaves, said once), and the ticked
  // pages' clicks against the span before, by the names the chart says; and the names the page says things by, each
  // Classification's among them (pages not sorted yet are never named).
  // Built by the same function a chat app's question builds them with (chatAppEyes/searchConsole.ts), so the two can't disagree.
  const choices = list.pageKinds.choices;
  const countryClicks = site.problem ? null : (site.figures?.totals?.clicks ?? null);
  const seesData = useMemo(() => pagesEyeData({
    page: list.pageData,
    countryClicks,
    ticked: ticked.map((row) => ({ name: nameOf(row.key), clicks: row.clicks, previousClicks: row.previousClicks })),
    kinds: choices,
  }, wordsReader(t)), [list.pageData, countryClicks, ticked, nameOf, choices, t]);

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="pages" seen={list.summary ? (list.range.period === "custom" ? null : pagesSees(list.summary, list.range.period)) : null} data={seesData} />}
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={t("pages.title")}
      description={t("pages.description")}
      heroes={<PagesBoxes read={site} />}
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        emptyIcon: icon,
        ticks,
        download: [
          { header: t("table.page"), field: "key" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
          { header: t("table.keywords"), field: "count" },
          { header: t("table.topKeyword"), field: "top" },
          { header: t("track.column"), field: "tracked" },
        ],
        columns: [
          tickColumn<ListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("pages.chart.tickLabel", { name: row.title ?? row.key }), heading: t("pages.chart.tickHeading") }),
          pageColumn<ListRow>(t("table.page"), host, recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position"]),
        ],
      }}
    >
      {list.summary ? (
        <TickedDaysCard
          words="searchConsole.pages.chart"
          ticked={ticked}
          host={host}
          heldFrom={list.status?.connection?.daysFrom ?? null}
          retry={retry}
          exportName={`${host}-search-console-pages`}
          nameOf={nameOf}
          compare
        />
      ) : null}
    </SearchConsoleListScreen>
  );
}
