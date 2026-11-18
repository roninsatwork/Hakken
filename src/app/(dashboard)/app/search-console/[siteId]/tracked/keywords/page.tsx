"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { tickColumn } from "@/src/ui/components/screens/TableTicks";
import { SearchConsoleListScreen } from "../../../_components/SearchConsoleListTable";
import { useRecordHref } from "../../../_components/searchConsoleRecords";
import { TrackedCount, figureColumns, trackColumn, useSearchConsoleList, useSearchConsoleTracking, type ChipId, keywordColumn, type ListRow } from "../../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../../_components/SearchConsoleSees";
import { MOST_TICKED, TickedDaysCard, useListOpening, useTickedDays, useTickedRows, useTickedUpdate } from "../../../_components/TickedDays";
import { TrackedBoxes, useTrackedSeesData } from "../../../_components/TrackedParts";
import { trackedSees } from "@/convex/utils/sees/searchConsoleScreens";

/** A search box only, as drawn: no filter chips. */
const CHIPS: readonly ChipId[] = [];
/** A keyword is named on the chart as it is in the table. */
const asItIs = (key: string) => key;

/**
 * Tracked keywords (drawn 2026-10-03), as Anthony chose it on 18 November 2026 (the canvas's Way 1;
 * search-console-tracked-way-1-plan-2026-11-18.md): only the keywords the company tracks — Search Console's own list,
 * never Visibility's — in the country chosen. Four boxes for them together against the dates before, Pages' own; the
 * keywords ticked in the table drawn day by day with Google's updates marked, opening on the three with the most clicks;
 * and a lean table, one line a row, with Track at the row's end so it never sits beside the chart's tick box. Unticking
 * Track stops tracking a keyword and it leaves the list; each row opens the keyword's own screen, whose way back returns
 * here as it was left. With nothing tracked, the table's line says how to track one, and nothing else is drawn.
 */
export default function SearchConsoleTrackedKeywordsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "tracked", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const ticks = useTickedRows(t("keywords.chart.tickLimit", { most: MOST_TICKED }), useListOpening(list));
  const { rows: ticked, retry } = useTickedDays("query", ticks.keys);
  const update = useTickedUpdate(ticked, asItIs);
  const seesData = useTrackedSeesData({ list, ticked, update, nameOf: asItIs, kind: "keywords" });
  const none = tracking.counts?.keywords.count === 0;

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="trackedKeywords" seen={list.summary && list.range.period !== "custom" ? trackedSees(list.summary, list.range.period, "keywords") : null} data={seesData} />}
      icon={<Search className="h-5 w-5 text-brand" />}
      title={t("tracked.keywords.title")}
      description={t("tracked.keywords.description")}
      heroes={none ? null : <TrackedBoxes summary={list.summary} />}
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("tracked.keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        beside: <TrackedCount tracking={tracking} kind="query" />,
        markTracked: false,
        ticks,
        emptyIcon: <Search className="h-8 w-8 text-muted/30" />,
        emptyLabel: none ? t("tracked.keywords.empty") : undefined,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.change"), field: "change" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
          { header: t("table.moved"), field: "positionChange" },
          { header: t("table.pages"), field: "count" },
          { header: t("table.topPage"), field: "top" },
        ],
        columns: [
          tickColumn<ListRow>(ticks, { rowKey: (row) => row.key, label: (row) => t("keywords.chart.tickLabel", { name: row.key }), heading: t("keywords.chart.tickHeading") }),
          keywordColumn(t("table.keyword"), recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "position"]),
          trackColumn(t, tracking, "query", (row) => row.key),
        ],
      }}
    >
      {list.summary && !none ? (
        <TickedDaysCard
          words="searchConsole.keywords.chart"
          ticked={ticked}
          host={host}
          heldFrom={list.status?.connection?.daysFrom ?? null}
          retry={retry}
          exportName={`${host}-search-console-tracked-keywords`}
          compare
        />
      ) : null}
    </SearchConsoleListScreen>
  );
}
