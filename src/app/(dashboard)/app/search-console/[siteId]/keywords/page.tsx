"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleSiteFigures } from "../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { TrackedCount, figureColumns, trackColumn, useSearchConsoleList, useSearchConsoleTracking, type ChipId } from "../../_components/SearchConsoleTables";

/** Intent beside the drawn chips: Types opens Keywords narrowed to one. */
const CHIPS: readonly ChipId[] = ["tracked", "band", "intent", "country", "device"];

/**
 * Keywords (search-console-plan.md §13.2, drawn as "4 · Keywords"): every
 * keyword Google showed the website for in the dates chosen, its clicks,
 * impressions, click-through rate and position, how many of the website's
 * pages it brought people to and the top one — the website's figures above
 * it. A tick tracks a keyword; each row opens the keyword's own screen.
 */
export default function SearchConsoleKeywordsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const icon = <Search className="h-8 w-8 text-muted/30" />;

  return (
    <SearchConsoleListScreen
      icon={<Search className="h-5 w-5 text-brand" />}
      title={t("keywords.title")}
      description={t("keywords.description")}
      heroes={<SearchConsoleSiteFigures />}
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        beside: <TrackedCount tracking={tracking} kind="query" />,
        emptyIcon: icon,
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
          trackColumn(t, tracking, "query", (row) => row.key),
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          ...figureColumns(t, ["clicks", "impressions", "ctr", "position"]),
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
