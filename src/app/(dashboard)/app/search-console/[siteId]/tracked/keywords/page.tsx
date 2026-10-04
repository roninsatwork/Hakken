"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../../sites/_components/SiteCells";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { TrackedFigures } from "../../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../../_components/searchConsoleRecords";
import { TrackedCount, figureColumns, trackColumn, useSearchConsoleList, useSearchConsoleTracking, type ChipId } from "../../../_components/SearchConsoleTables";

/** A search box only, as drawn: no filter chips. */
const CHIPS: readonly ChipId[] = [];

/**
 * Tracked keywords (drawn 2026-10-03, "Tracked keywords"): only the keywords
 * the company ticked on Keywords — Search Console's own list, never Sites' —
 * each with how it did in the dates chosen against the days before, and the
 * four figures for them together above. Unticking one stops tracking it and
 * it leaves the list; each row opens the keyword's own screen, whose way
 * back returns here as it was left.
 */
export default function SearchConsoleTrackedKeywordsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "tracked", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";

  return (
    <SearchConsoleListScreen
      icon={<Search className="h-5 w-5 text-brand" />}
      title={t("tracked.keywords.title")}
      description={t("tracked.keywords.description")}
      heroes={<TrackedFigures summary={list.summary} days={list.range.days} />}
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("tracked.keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        beside: <TrackedCount tracking={tracking} kind="query" />,
        markTracked: false,
        emptyIcon: <Search className="h-8 w-8 text-muted/30" />,
        emptyLabel: tracking.counts?.keywords.count === 0 ? t("tracked.keywords.empty") : undefined,
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
          trackColumn(t, tracking, "query", (row) => row.key),
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          ...figureColumns(t, ["clicksAndChange", "impressions", "ctr", "positionAndMove"]),
          { key: "count", header: t("table.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.count === null ? "–" : formatNumber(row.count)}</span> },
          {
            key: "top",
            header: t("table.topPage"),
            sortable: true,
            className: CUT_COLUMN.second,
            cell: (row) => <span className="block truncate text-[12px] text-secondary">{row.top ? pageLabel(row.top, host) : "–"}</span>,
          },
        ],
      }}
    />
  );
}
