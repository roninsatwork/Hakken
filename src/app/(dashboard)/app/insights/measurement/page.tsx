"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { MEASUREMENT_STATUSES, type MeasurementCheck, type MeasurementStatus } from "@/convex/utils/insightMeasurement";
import { SiteLineChart } from "../../sites/_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsSite } from "../_components/useInsights";

const TONE: Record<MeasurementStatus, "warning" | "info" | "neutral" | "success"> = { LOOK: "warning", LIMIT: "info", UNKNOWN: "neutral", PASSING: "success" };

/** Where each check is put right: Analytics' own Tracking health, or its section. */
const FIX_AT: Partial<Record<MeasurementCheck["check"], "trackingHealth" | "analytics" | "searchConsole">> = {
  enquiryCounted: "trackingHealth", everyWayCounted: "trackingHealth", enquiriesValued: "trackingHealth", visitsHavePage: "trackingHealth",
  analyticsSteady: "trackingHealth", referralsReal: "trackingHealth", onlyThisWebsite: "trackingHealth", googleAgrees: "analytics",
};

/**
 * The Measurement check (docs/plans/active/insights-analyst-plan.md §4.1,
 * phase 13, drawn as the Measurement board): before Hakken advises on
 * conversion, whether the figures can be trusted — each real enquiry counted
 * once (I42), every way to enquire counted, enquiries valued, every visit on a
 * page, Google and Analytics agreeing home country with home country (I33),
 * and how much Google ties to pages (S2). As the newest week's run found it,
 * so the page and the findings agree; each check says where it is put right.
 */
export default function InsightsMeasurementPage() {
  const t = usePlatformTranslations("insights.measurement");
  const site = useInsightsSite();
  const data = useQuery(api.insightsReads.insightsMeasurement, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const [status, setStatus] = useSiteParam<string>("status", "");
  const checks = data?.measurement?.checks;
  // A long list of addresses names the first few and counts the rest.
  const listOf = (names: readonly string[]) => (names.length > 3 ? t("andMore", { names: names.slice(0, 3).join(", "), count: names.length - 3 }) : names.join(", "));
  const words = (row: MeasurementCheck) => t(`found.${row.check}.${row.found}`, {
    names: listOf(row.names),
    count: row.names.length,
    a: row.a === null ? "" : formatNumber(row.a),
    b: row.b === null ? "" : formatNumber(row.b),
    share: row.a !== null && row.b ? Math.round((row.a / row.b) * 100) : 0,
  });
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = checks?.filter((row) => (!status || row.status === status) && (!matches || matches(`${t(`checks.${row.check}`)} ${words(row)}`)));
  const pages = useSitePager(data ? shown : undefined, { isLoading: data === undefined });
  const header = <PageHeader icon={<Gauge className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (data === null || !data.measurement || !checks) return <>{header}<HakkenEmptyState icon={Gauge} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const look = checks.filter((row) => row.status === "LOOK");
  const says = look.length > 0
    ? [t("sees.look", { count: look.length, first: words(look[0]) })]
    : [t("sees.allGood", { count: checks.filter((row) => row.status === "PASSING").length })];
  const fixHref = (row: MeasurementCheck) => {
    const at = FIX_AT[row.check];
    if (at === "trackingHealth") return `/app/analytics/${data.siteId}/tracking-health`;
    if (at === "analytics") return `/app/analytics/${data.siteId}`;
    return `/app/search-console`;
  };
  const steps: HakkenSeesStep[] = look.slice(0, 3).map((row) => ({ words: t(`fix.${row.check}`), link: t(`fixAt.${FIX_AT[row.check] ?? "searchConsole"}`), href: fixHref(row) }));
  const days = data.measurement.byDay.map((day) => ({ label: formatDay(day.day), clicks: day.clicks, visits: day.visits }));
  const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
  const visits = days.reduce((sum, day) => sum + day.visits, 0);
  const csv = () => toCsv([t("chart.day"), t("chart.clicks"), t("chart.visits")], data.measurement!.byDay.map((day) => [day.day, day.clicks, day.visits]));

  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <ChartCard
        title={t("chart.title")}
        hint={days.length > 0 ? t("chart.hint", { from: days[0].label, to: days.at(-1)!.label, share: clicks > 0 ? Math.round((visits / clicks) * 100) : 0 }) : t("chart.none")}
        exportName={`${data.host}-google-against-analytics`}
        csv={csv}
        enoughData={days.length > 1}
      >
        <SiteLineChart data={days} sharedScale series={[{ key: "clicks", name: t("chart.clicks"), colour: CHART_SERIES_SLATE }, { key: "visits", name: t("chart.visits"), colour: CHART_SERIES_ORANGE }]} />
      </ChartCard>
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.check}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("status"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={setStatus} aria-label={t("status")}>
            <option value="">{t("everyStatus")}</option>
            {MEASUREMENT_STATUSES.map((value) => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: checks.length, look: look.length })} actions={<ListDownload label={t("download")} fileName={`${data.host}-measurement-check`} rows={shown} columns={[{ header: t("columns.check"), value: (row) => t(`checks.${row.check}`) }, { header: t("columns.found"), value: words }, { header: t("columns.status"), value: (row) => t(`statuses.${row.status}`) }]} />} />}
        empty={{ icon: <Gauge className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        footer={pages.footer}
        columns={[
          { key: "check", header: t("columns.check"), cell: (row) => <span className="text-[13px] text-foreground">{t(`checks.${row.check}`)}</span> },
          { key: "found", header: t("columns.found"), cell: (row) => <span className="text-[12px] text-secondary">{words(row)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone={TONE[row.status]}>{t(`statuses.${row.status}`)}</StatusLabel> },
        ]}
      />
    </>
  );
}
