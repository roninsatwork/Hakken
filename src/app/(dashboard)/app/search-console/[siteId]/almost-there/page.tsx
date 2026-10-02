"use client";

import { Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SiteFigure } from "../../../sites/_components/SiteFigure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import {
  CountChange,
  TrackedCount,
  figureColumns,
  trackColumn,
  useSearchConsoleList,
  useSearchConsoleTracking,
  type ChipId,
} from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["tracked", "almostBand", "intent", "country"];

/**
 * Almost there (search-console-plan.md §13.3, drawn as "9 · Almost there"):
 * keywords Google already shows the website for at positions 4 to 20, with
 * the searches a month behind each from Sites — the ones closest to the top
 * three, the most searched first.
 */
export default function SearchConsoleAlmostPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "almost", opening: "volume", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  const days = list.range.days;
  const keywords = tracking.counts?.keywords ?? null;
  return (
    <SearchConsoleListScreen
      icon={<Target className="h-5 w-5 text-brand" />}
      title={t("almost.title")}
      description={t("almost.description")}
      heroes={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SiteFigure
            label={t("almost.at4to10")}
            value={summary ? formatNumber(summary.bands["4-10"]) : "…"}
            detail={<CountChange now={summary?.bands["4-10"] ?? null} before={summary?.bandsBefore?.["4-10"] ?? null} days={days} />}
          />
          <SiteFigure
            label={t("almost.at11to20")}
            value={summary ? formatNumber(summary.bands["11-20"]) : "…"}
            detail={<CountChange now={summary?.bands["11-20"] ?? null} before={summary?.bandsBefore?.["11-20"] ?? null} days={days} />}
          />
          <SiteFigure label={t("almost.searches")} value={summary ? formatNumber(summary.volume) : "…"} detail={<span className="text-secondary">{t("almost.sitesFigures")}</span>} />
          <SiteFigure
            label={t("almost.tracked")}
            value={keywords ? t("track.of", { count: formatNumber(keywords.count), limit: formatNumber(keywords.limit) }) : "…"}
            detail={<span className="text-secondary">{t("almost.youTrack")}</span>}
          />
        </div>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        beside: <TrackedCount tracking={tracking} kind="query" />,
        emptyIcon: <Target className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.position"), field: "position" },
          { header: t("table.impressions"), field: "impressions" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.volume"), field: "volume" },
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
          ...figureColumns(t, ["position", "impressions", "clicks"]),
          { key: "volume", header: t("table.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.volume === null ? "–" : formatNumber(row.volume)}</span> },
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
