"use client";

import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import {
  TrackedCount,
  figureColumns,
  trackColumn,
  useSearchConsoleList,
  useSearchConsoleSummary,
  useSearchConsoleTracking,
  type ChipId,
} from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["missed", "tracked", "intent"];

/**
 * Missed demand (search-console-plan.md §13.3, drawn as "11 · Missed
 * demand"): keywords many people search for, from Sites' monthly searches,
 * that Google barely shows the website for — fewer than 50 impressions in
 * the dates chosen — and, on the other list, every keyword Google shows it
 * for that is not tracked yet: a tick tracks one.
 */
export default function SearchConsoleDemandPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "missed", opening: "volume", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  // Both lists' counts, whichever is shown.
  const searched = useSearchConsoleSummary({ dimension: "query", view: "missed", missed: "searched" });
  const untracked = useSearchConsoleSummary({ dimension: "query", view: "missed", missed: "untracked" });
  const keywords = tracking.counts?.keywords ?? null;
  return (
    <SearchConsoleListScreen
      icon={<SearchX className="h-5 w-5 text-brand" />}
      title={t("demand.title")}
      description={t("demand.description")}
      heroes={
        <FigureRow>
          <Figure label={t("filters.missedSearched")} value={searched ? formatNumber(searched.rows) : "…"} detail={<span className="text-secondary">{t("demand.fewer")}</span>} />
          <Figure label={t("almost.searches")} value={searched ? formatNumber(searched.volume) : "…"} detail={<span className="text-secondary">{t("almost.sitesFigures")}</span>} />
          <Figure
            label={t("filters.missedUntracked")}
            value={untracked ? formatNumber(untracked.rows) : "…"}
            detail={<span className="text-secondary">{t("demand.ofShown", { count: formatNumber(untracked?.of ?? 0) })}</span>}
          />
          <Figure
            label={t("almost.tracked")}
            value={keywords ? t("track.of", { count: formatNumber(keywords.count), limit: formatNumber(keywords.limit) }) : "…"}
            detail={<span className="text-secondary">{t("almost.youTrack")}</span>}
          />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        beside: <TrackedCount tracking={tracking} kind="query" />,
        emptyIcon: <SearchX className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.volume"), field: "volume" },
          { header: t("table.impressions"), field: "impressions" },
          { header: t("table.position"), field: "position" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.page"), field: "top" },
          { header: t("track.column"), field: "tracked" },
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
          { key: "volume", header: t("table.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.volume === null ? "–" : formatNumber(row.volume)}</span> },
          ...figureColumns(t, ["impressions", "position", "clicks"]),
          {
            key: "top",
            header: t("table.page"),
            sortable: true,
            className: CUT_COLUMN.second,
            cell: (row) => <span className="block truncate text-[12px] text-secondary">{row.top ? pageLabel(row.top, host) : "–"}</span>,
          },
        ],
      }}
    />
  );
}
