"use client";

import { useMemo } from "react";
import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { LowCtrBoxes, LowCtrPositionsCard, type LowCtrCount } from "../../_components/LowCtrParts";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { shortPageName, useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, pageColumn, useSearchConsoleList, type ChipId, type ListRow } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { useSearchConsoleCountry } from "../../_components/useSearchConsole";
import { lowCtrSees } from "@/convex/utils/sees/searchConsoleScreens";
import { lowCtrSeesData } from "@/convex/utils/sees/own/searchConsoleLowCtr";

/**
 * No Device menu since 20 November 2026, as Pages left it on 17 November: a page split by device leaves out the searches
 * Google keeps private, and the page never said so.
 */
const CHIPS: readonly ChipId[] = ["pageType", "band"];

/**
 * Low click rate, called Shown but not clicked until Anthony renamed it on 20 November 2026 ("ok call it low click rate"; the
 * address stays). Search-console-plan.md §13.3, as Anthony chose it on the canvas on 20 November 2026 (Way 2: "ok i
 * think we build way 2 and also wire it up to what hakken sees"; search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md):
 * pages Google shows a lot that people rarely click, each set against what the website usually gets at the same position on
 * Google (Click rate by position). Four boxes, each position's clicks above the clicks the pages there would usually get
 * (the shared `MirrorBars`), and the lean table: the pages short by most clicks first, their clicks beside the clicks they'd
 * usually get. Every figure is the country chosen in the menu's, as Pages' are (`inCountry`).
 */
export default function SearchConsoleLowCtrPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "page", view: "lowCtr", opening: "gap", chips: CHIPS, inCountry: true });
  const dates = usePerformanceDates();
  const [country] = useSearchConsoleCountry();
  const [count, setCount] = useSiteParam<LowCtrCount>("count", "clicks", ["clicks", "pages"]);
  const recordHref = useRecordHref(list.siteId);
  const host = list.status?.host ?? "";
  const summary = list.summary;
  // The eye's figures: the list's own the page shows, never the whole summary, and the table's columns (`lowCtrSeesData`), with
  // the names the page says things by, each Classification's among them (pages not sorted yet are never named).
  const choices = list.pageKinds.choices;
  const names = useMemo(() => ({
    these: t("lowCtr.eye.these"), usually: t("lowCtr.eye.usually"), position: t("lowCtr.eye.position"), firstPage: t("lowCtr.eye.firstPage"),
    home: t("pages.chart.homePage"),
    kinds: Object.fromEntries((choices ?? []).map((choice) => [choice.id, choice.name])),
  }), [t, choices]);
  const seesData = useMemo(() => (summary ? { ...lowCtrSeesData(summary, list.table.pageRows ?? null), names } : undefined), [summary, list.table.pageRows, names]);
  // "Do first" may open the pages the eye names, each on its own screen: the first press linked the page short of most clicks
  // to Pages (20 November 2026).
  const homePage = t("pages.chart.homePage");
  const seesLinks = useMemo(() => (summary?.lowCtr?.top ?? []).map((page) => ({ label: shortPageName(page.title, page.key, host, homePage), href: recordHref("pages/page", page.key) })), [summary, host, homePage, recordHref]);
  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="lowCtr" seen={summary ? lowCtrSees(summary) : null} data={seesData} links={seesLinks} />}
      icon={<MousePointerClick className="h-5 w-5 text-brand" />}
      title={t("lowCtr.title")}
      description={t("lowCtr.description")}
      heroes={<LowCtrBoxes summary={summary} when={dates.now} />}
      table={{
        list,
        chips: CHIPS,
        noun: "pages",
        searchPlaceholder: t("pages.searchPlaceholder"),
        rowHref: (row) => recordHref("pages/page", row.key),
        emptyIcon: <MousePointerClick className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.page"), field: "key" },
          { header: t("table.impressions"), field: "impressions" },
          { header: t("table.position"), field: "position" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("lowCtr.table.usuallyFile"), field: "expected" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: `${t("lowCtr.table.usualRateFile")} (%)`, field: "usualCtr" },
        ],
        columns: [
          // The lean table (AGENTS.md "Tables are lean"): two plain numbers side by side, the clicks it got and the clicks it
          // would usually get, in place of today's rates and the clicks short (Anthony on the canvas: "this is confusing").
          pageColumn<ListRow>(t("table.page"), host, recordHref),
          ...figureColumns(t, ["impressions", "position", "clicks"]),
          {
            key: "expected",
            header: <span title={t("lowCtr.table.usuallyTitle")}>{t("lowCtr.table.usually")}</span>,
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.expected === null ? "–" : formatNumber(row.expected)}</span>,
          },
        ],
      }}
    >
      <LowCtrPositionsCard
        summary={summary}
        count={count}
        onCount={setCount}
        host={host}
        exportName={`${host}-search-console-shown-but-not-clicked-positions`}
        replay={`${list.range.from}:${list.range.to}:${country ?? ""}:${list.kind}`}
        loading={!summary}
      />
    </SearchConsoleListScreen>
  );
}
