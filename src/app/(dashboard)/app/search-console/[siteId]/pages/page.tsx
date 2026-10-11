"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SearchConsoleSiteFigures } from "../../_components/SearchConsoleFigures";
import { SearchConsolePageGap } from "../../_components/SearchConsolePageGap";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { pageLabel, useRecordHref } from "../../_components/searchConsoleRecords";
import { type ChipId, figureColumns, PageNameCell, trackColumn, TrackedCount, useSearchConsoleList, useSearchConsoleTracking } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { pagesSees } from "@/convex/utils/sees/searchConsoleScreens";

/**
 * The drawing's Section chip ("Top level", "/hub/") was one website's own
 * folders; a Page type chip from Sites stands in its place for every
 * website (noted for Anthony, 2026-10-03).
 */
const CHIPS: readonly ChipId[] = ["tracked", "band", "pageType", "device"];

/**
 * Pages (search-console-plan.md §13.2, drawn as "1 · Pages"): every page
 * Google showed in the dates chosen, its clicks, impressions, click-through
 * rate and position, how many keywords brought people to it and the top one
 * — the website's figures above it, after the clicks Google doesn't tie to a
 * page (insights-analyst-plan.md §7, S2). A tick tracks a page; each row
 * opens the page's own screen.
 */
export default function SearchConsolePagesPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const icon = <FileText className="h-8 w-8 text-muted/30" />;

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="pages" seen={list.summary ? pagesSees(list.summary, list.range.days) : null} />}
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={t("pages.title")}
      description={t("pages.description")}
      heroes={
        <>
          {/* The clicks Google doesn't tie to a page (S2): the pages below add up to "Tied to a page". */}
          <SearchConsolePageGap tied={list.live ? null : list.table.named} />
          <SearchConsoleSiteFigures />
        </>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        beside: <TrackedCount tracking={tracking} kind="page" />,
        emptyIcon: icon,
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
          trackColumn(t, tracking, "page", (row) => pageLabel(row.key, host)),
          {
            key: "key",
            header: t("table.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <PageNameCell title={row.title} label={pageLabel(row.key, host)} href={recordHref("pages/page", row.key)} />,
          },
          ...figureColumns(t, ["clicks", "impressions", "ctr", "position"]),
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
