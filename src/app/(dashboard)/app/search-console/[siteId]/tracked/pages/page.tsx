"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { tickColumn } from "@/src/ui/components/screens/TableTicks";
import { usePageChartNames } from "../../../_components/PagesParts";
import { SearchConsoleListScreen } from "../../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../../_components/searchConsoleRecords";
import { type ChipId, figureColumns, pageColumn, trackColumn, TrackedCount, useSearchConsoleList, useSearchConsoleTracking, type ListRow } from "../../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../../_components/SearchConsoleSees";
import { MOST_TICKED, TickedDaysCard, useListOpening, useTickedDays, useTickedRows, useTickedUpdate } from "../../../_components/TickedDays";
import { TrackedBoxes, useTrackedSeesData } from "../../../_components/TrackedParts";
import { trackedSees } from "@/convex/utils/sees/searchConsoleScreens";

/** A search box only, as drawn: no filter chips. */
const CHIPS: readonly ChipId[] = [];

/**
 * Tracked pages (drawn 2026-10-03), as Anthony chose it on 18 November 2026 (the canvas's Way 1;
 * search-console-tracked-way-1-plan-2026-11-18.md): only the pages the company tracks — Search Console's own list, never
 * Visibility's — in the country chosen, as Pages counts them since the same day (`inCountry`). Four boxes for them
 * together against the dates before, Pages' own; the pages ticked in the table drawn day by day with Google's updates
 * marked, opening on the three with the most clicks; and a lean table, one line a row, with Track at the row's end so it
 * never sits beside the chart's tick box. Unticking Track stops tracking a page and it leaves the list; each row opens
 * the page's own screen, whose way back returns here as it was left. With nothing tracked, the table's line says how to
 * track one, and nothing else is drawn.
 */
export default function SearchConsoleTrackedPagesPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", view: "tracked", chips: CHIPS, inCountry: true });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const ticks = useTickedRows(t("pages.chart.tickLimit", { most: MOST_TICKED }), useListOpening(list));
  const { rows: ticked, retry } = useTickedDays("page", ticks.keys);
  const nameOf = usePageChartNames(ticks.keys, host);
  const update = useTickedUpdate(ticked, nameOf);
  const seesData = useTrackedSeesData({ list, ticked, update, nameOf, kind: "pages" });
  const none = tracking.counts?.pages.count === 0;

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="trackedPages" seen={list.summary && list.range.period !== "custom" ? trackedSees(list.summary, list.range.period, "pages") : null} data={seesData} />}
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={t("tracked.pages.title")}
      description={t("tracked.pages.description")}
      heroes={none ? null : <TrackedBoxes summary={list.summary} />}
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("tracked.pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        beside: <TrackedCount tracking={tracking} kind="page" />,
        markTracked: false,
        ticks,
        emptyIcon: <FileText className="h-8 w-8 text-muted/30" />,
        emptyLabel: none ? t("tracked.pages.empty") : undefined,
        download: [
          { header: t("table.page"), field: "key" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.change"), field: "change" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
          { header: t("table.moved"), field: "positionChange" },
          { header: t("table.keywords"), field: "count" },
          { header: t("table.topKeyword"), field: "top" },
        ],
        columns: [
          tickColumn<ListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("pages.chart.tickLabel", { name: row.title ?? pageLabel(row.key, host) }), heading: t("pages.chart.tickHeading") }),
          pageColumn<ListRow>(t("table.page"), host, recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "position"]),
          trackColumn(t, tracking, "page", (row) => pageLabel(row.key, host)),
        ],
      }}
    >
      {list.summary && !none ? (
        <TickedDaysCard
          words="searchConsole.pages.chart"
          ticked={ticked}
          host={host}
          heldFrom={list.status?.connection?.daysFrom ?? null}
          retry={retry}
          exportName={`${host}-search-console-tracked-pages`}
          nameOf={nameOf}
          compare
        />
      ) : null}
    </SearchConsoleListScreen>
  );
}
