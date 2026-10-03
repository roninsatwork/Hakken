"use client";

import { FileText } from "lucide-react";
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
 * Tracked pages (drawn 2026-10-03, "Tracked pages"): only the pages the
 * company ticked on Pages — Search Console's own list, never Sites' — each
 * with how it did in the dates chosen against the days before, and the four
 * figures for them together above. Unticking one stops tracking it and it
 * leaves the list; each row opens the page's own screen, whose way back
 * returns here as it was left.
 */
export default function SearchConsoleTrackedPagesPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", view: "tracked", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";

  return (
    <SearchConsoleListScreen
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={t("tracked.pages.title")}
      description={t("tracked.pages.description")}
      heroes={<TrackedFigures summary={list.summary} days={list.range.days} />}
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("tracked.pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        beside: <TrackedCount tracking={tracking} kind="page" />,
        markTracked: false,
        emptyIcon: <FileText className="h-8 w-8 text-muted/30" />,
        emptyLabel: tracking.counts?.pages.count === 0 ? t("tracked.pages.empty") : undefined,
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
          trackColumn(t, tracking, "page", (row) => pageLabel(row.key, host)),
          {
            key: "key",
            header: t("table.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("pages/page", row.key)}>{pageLabel(row.key, host)}</RecordLinkCell>,
          },
          ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position", "moved"]),
          { key: "count", header: t("table.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.count === null ? "–" : formatNumber(row.count)}</span> },
          {
            key: "top",
            header: t("table.topKeyword"),
            sortable: true,
            className: CUT_COLUMN.second,
            cell: (row) => <span className="block truncate text-[12px] text-secondary">{row.top || "–"}</span>,
          },
        ],
      }}
    />
  );
}
