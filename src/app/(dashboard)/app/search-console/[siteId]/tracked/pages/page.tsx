"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { TrackedFigures } from "../../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../../_components/SearchConsoleListTable";
import { SearchConsoleEveryCountry } from "../../../_components/SearchConsoleEveryCountry";
import { pageLabel, useRecordHref } from "../../../_components/searchConsoleRecords";
import { type ChipId, figureColumns, pageColumn, trackColumn, TrackedCount, useSearchConsoleList, useSearchConsoleTracking, type ListRow } from "../../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../../_components/SearchConsoleSees";
import { trackedSees } from "@/convex/utils/sees/searchConsoleScreens";

/** A search box only, as drawn: no filter chips. */
const CHIPS: readonly ChipId[] = [];

/**
 * Tracked pages (drawn 2026-10-03, "Tracked pages"): only the pages the
 * company ticked on Pages — Search Console's own list, never Sites' — each
 * with how it did in the dates chosen against the days before, and the four
 * figures for them together above. Unticking one stops tracking it and it
 * leaves the list; each row opens the page's own screen, whose way back
 * returns here as it was left.
 * The table is lean (the table rule, AGENTS.md "Tables are lean", 2026-11-17): Track stays, as unticking is what this
 * page is for; the click rate, the count and the top one are on the row's own screen.
 */
export default function SearchConsoleTrackedPagesPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", view: "tracked", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="trackedPages" seen={list.summary && list.range.period !== "custom" ? trackedSees(list.summary, list.range.period, "pages") : null} data={list.pageData} />}
      icon={<FileText className="h-5 w-5 text-brand" />}
      title={t("tracked.pages.title")}
      description={t("tracked.pages.description")}
      heroes={
        <>
          <SearchConsoleEveryCountry />
          <TrackedFigures summary={list.summary} days={list.range.days} />
        </>
      }
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
          pageColumn<ListRow>(t("table.page"), host, recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "position"]),
        ],
      }}
    />
  );
}
