"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { CalendarCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatMonth, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useFindingsTable } from "../_components/FindingsTable";
import { EnquiryCheckNotice } from "../_components/EnquiryCheckNotice";
import { QuickCheckNotice } from "../_components/QuickCheckNotice";
import { useInsightsHref, useInsightsShownSite, useInsightsSite } from "../_components/useInsights";
import { thisWeekAdvice, thisWeekNames, thisWeekSees } from "../_components/insightsSees";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";

/**
 * This week (docs/plans/active/insights-analyst-plan.md §4.1, drawn as the
 * Week board): the findings the team wrote in its newest run, most at stake
 * first — each a story none of the sources shows alone — with what is at
 * stake, how much the team checked and ruled out, and how many visitors and
 * Google clicks it now takes for one enquiry against a year before (I12).
 */
export default function InsightsThisWeekPage() {
  const t = usePlatformTranslations("insights.week");
  const href = useInsightsHref();
  const site = useInsightsSite();
  // The website the eye is pressed for: the address's, else the one Insights opened on.
  const eyeSite = useInsightsShownSite();
  const data = useQuery(api.insightsReads.insightsThisWeek, site ? { siteId: site } : {});
  const findings = data?.findings;
  const table = useFindingsTable({ rows: findings, when: "sure", opening: "rank" });
  // The eye on a page that already shows Hakken's advice (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 2):
  // findings of its own about this week's figures, and the week's advice — the strategy's verdict and each finding's
  // first step — handed with them, so the piece written builds on it and never says something different.
  const tAll = usePlatformTranslations("insights");
  const seesData = useMemo(() => thisWeekSees(data, thisWeekNames(tAll), formatMonth), [data, tAll]);
  const advice = useMemo(() => thisWeekAdvice(data), [data]);
  useSeesPart("advice", advice);
  const checked = data?.weeks.reduce((sum, week) => sum + week.checked, 0) ?? 0;
  const ruledOut = data?.weeks.reduce((sum, week) => sum + week.ruledOut, 0) ?? 0;
  const atStake = (findings ?? []).reduce((sum, finding) => sum + (finding.atStake ?? 0), 0);
  const sources = new Set(data?.weeks.flatMap((week) => week.sources.filter((source) => source.facts > 0).map((source) => source.source)) ?? []);
  // Where the piece's first steps may point: each of the week's findings, its whole case.
  const links = (findings ?? []).map((finding) => ({ label: finding.headline, href: href(`findings/${finding.findingId}`) }));

  // Visitors and Google clicks for one enquiry, the same 90 days a year apart (the week's scorecard).
  const score = data?.weeks[0]?.summary?.scorecard ?? [];
  const per = ["visitorsPerEnquiry", "googleClicksPerEnquiry"].map((measure) => score.find((row) => row.measure === measure)).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const bars = per.map((row) => ({ label: t(`per.${row.measure}`), year: row.before ?? 0, now: row.now ?? 0 }));
  const csv = () => toCsv([t("per.measure"), t("per.year"), t("per.now")], bars.map((row) => [row.label, row.year, row.now]));

  return (
    <>
      <PageHeader icon={<CalendarCheck className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {data ? <HakkenSees says={[]} steps={[]} page={{ screen: "insights.thisWeek", siteId: eyeSite, data: seesData, links }} /> : null}
      <EnquiryCheckNotice check={data?.weeks[0]?.summary?.enquiryCheck} />
      <QuickCheckNotice />
      <FigureRow>
        <Figure label={t("figures.new")} value={findings ? String(findings.length) : "…"} detail={<span className="text-secondary">{t("figures.open", { count: data?.open ?? 0 })}</span>} />
        <Figure label={t("figures.atStake")} value={atStake > 0 ? formatNumber(Math.round(atStake / 4)) : "–"} detail={<span className="text-secondary">{t("figures.atStakeDetail")}</span>} />
        <Figure label={t("figures.checked")} value={data ? formatNumber(checked) : "…"} detail={<span className="text-secondary">{t("figures.checkedDetail", { sources: sources.size })}</span>} />
        <Figure label={t("figures.ruledOut")} value={data ? String(ruledOut) : "…"} detail={<span className="text-secondary">{t("figures.ruledOutDetail")}</span>} />
      </FigureRow>
      <ChartCard title={t("per.title")} hint={t("per.hint")} exportName="insights-per-enquiry" csv={csv} enoughData={bars.length > 0} emptyText={t("per.empty")}>
        <SiteBarChart
          data={bars}
          series={[{ key: "year", name: t("per.year"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("per.now"), colour: CHART_SERIES_ORANGE }]}
          horizontal
          labels={(value) => formatNumber(value)}
        />
      </ChartCard>
      <DataTable {...table} footer={table.footer} />
    </>
  );
}
