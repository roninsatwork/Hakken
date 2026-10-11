"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { PLAN_ACTIONS, type PlanPage } from "@/convex/utils/insightPlan";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { formatPosition } from "../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsSite } from "../_components/useInsights";

/**
 * The page plan (docs/plans/active/insights-analyst-plan.md §4.1, phase 9,
 * drawn as the Page plan board): which page should win which search, and the
 * one thing to do with each — rebuild, restore, strengthen, refresh, retire,
 * add a route or keep — enquiries lost first. What each page should do, never
 * its words (I22). Each step goes to Hakken tasks from here.
 */
export default function InsightsPagePlanPage() {
  const t = useTranslations("insights.pagePlan");
  const tPlace = useTranslations("insights.place");
  const site = useInsightsSite();
  const data = useQuery(api.insightsReads.insightsPlan, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const [action, setAction] = useSiteParam<string>("action", "");
  const rows = data?.plan?.pages;
  // Rates keep their decimal (5.1%); counts are whole.
  const rated = (row: PlanPage) => row.why === "bestRate" || row.why === "rateFell";
  const figure = (row: PlanPage, value: number | null) => (value === null ? "" : rated(row) ? formatPosition(value) : formatNumber(value));
  const why = (row: PlanPage) => t(`why.${row.why}`, { a: figure(row, row.a), b: row.why === "bestRate" ? "" : figure(row, row.b), count: row.b ?? 0, place: row.b === null ? "" : tPlace("ordinal", { place: row.b }) });
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!action || row.action === action) && (!matches || matches(`${row.page} ${row.shouldWin.join(" ")}`)));
  const pages = useSitePager(data ? shown : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<ListChecks className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data?.plan || !rows || rows.length === 0) return <>{header}<HakkenEmptyState icon={ListChecks} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const lost = rows.filter((row) => row.action === "REBUILD" || row.action === "RESTORE");
  const reach = rows.filter((row) => row.action === "STRENGTHEN");
  const says = [
    lost.length > 0 ? t("sees.lost", { count: lost.length, page: lost[0].page, a: formatNumber(lost[0].a ?? 0), b: formatNumber(lost[0].b ?? 0) }) : t("sees.noneLost"),
    ...(reach.length > 0 ? [t("sees.reach", { count: reach.length, pages: reach.map((row) => row.page).join(", ") })] : []),
  ];
  const stepWords = (row: PlanPage) => t(`do.${row.action}`, { page: row.page, search: row.shouldWin[0] ?? "" });
  const steps: HakkenSeesStep[] = rows.slice(0, 3).map((row) => ({ words: stepWords(row), link: t("addTask"), href: `/app/assistant?ask=${encodeURIComponent(stepWords(row))}` }));
  const bars = rows.filter((row) => row.enquiriesBefore !== null).slice(0, 8).map((row) => ({ label: row.page, before: row.enquiriesBefore ?? 0, now: row.enquiries }));
  const csv = () => toCsv([t("columns.page"), t("chart.before"), t("chart.now")], bars.map((row) => [row.label, row.before, row.now]));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${data.host}-page-plan`} csv={csv} enoughData={bars.length > 0}>
        <SiteBarChart data={bars} series={[{ key: "before", name: t("chart.before"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.page}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("action"), choice: action ? t(`actions.${action}`) : null }} value={action} onChange={setAction} aria-label={t("action")}>
            <option value="">{t("everyAction")}</option>
            {PLAN_ACTIONS.map((value) => <option key={value} value={value}>{t(`actions.${value}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: shown?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${data.host}-page-plan`} rows={shown} columns={[{ header: t("columns.page"), value: (row) => row.page }, { header: t("columns.shouldWin"), value: (row) => row.shouldWin.join(", ") }, { header: t("columns.action"), value: (row) => t(`actions.${row.action}`) }, { header: t("columns.why"), value: why }]} />} />}
        empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "page", header: t("columns.page"), cell: (row) => <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] text-foreground">{row.page}</span>{row.title ? <span className="truncate text-[12px] text-secondary">{row.title}</span> : null}</span> },
          { key: "shouldWin", header: t("columns.shouldWin"), cell: (row) => <span className="text-[12px] text-secondary">{row.shouldWin.length > 0 ? row.shouldWin.join(", ") : "–"}</span> },
          { key: "action", header: t("columns.action"), cell: (row) => <TagLabel className="text-foreground">{t(`actions.${row.action}`)}</TagLabel> },
          { key: "why", header: t("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{why(row)}</span> },
        ]}
      />
    </>
  );
}
