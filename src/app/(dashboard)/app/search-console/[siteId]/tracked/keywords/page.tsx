"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { TrackedFigures } from "../../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../../_components/SearchConsoleListTable";
import { useRecordHref } from "../../../_components/searchConsoleRecords";
import { TrackedCount, figureColumns, trackColumn, useSearchConsoleList, useSearchConsoleTracking, type ChipId, keywordColumn } from "../../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../../_components/SearchConsoleSees";
import { trackedSees } from "@/convex/utils/sees/searchConsoleScreens";

/** A search box only, as drawn: no filter chips. */
const CHIPS: readonly ChipId[] = [];

/**
 * Tracked keywords (drawn 2026-10-03, "Tracked keywords"): only the keywords
 * the company ticked on Keywords — Search Console's own list, never Sites' —
 * each with how it did in the dates chosen against the days before, and the
 * four figures for them together above. Unticking one stops tracking it and
 * it leaves the list; each row opens the keyword's own screen, whose way
 * back returns here as it was left.
 * The table is lean (the table rule, AGENTS.md "Tables are lean", 2026-11-17): Track stays, as unticking is what this
 * page is for; the click rate, the count and the top one are on the row's own screen.
 */
export default function SearchConsoleTrackedKeywordsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", view: "tracked", chips: CHIPS });
  const tracking = useSearchConsoleTracking(list.siteId);
  const recordHref = useRecordHref(list.siteId);

  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="trackedKeywords" seen={list.summary && list.range.period !== "custom" ? trackedSees(list.summary, list.range.period, "keywords") : null} data={list.pageData} />}
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
          keywordColumn(t("table.keyword"), recordHref),
          ...figureColumns(t, ["clicks", "change", "impressions", "position"]),
        ],
      }}
    />
  );
}
