"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ListChecks } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { FINDING_SECTIONS, sectionOf } from "@/convex/utils/insightSections";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { datedRow, monthRow } from "../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useFindingsTable } from "../_components/FindingsTable";
import { useInsightsHref, useInsightsShownSite, useInsightsSite } from "../_components/useInsights";
import { findingsNames, findingsSees } from "../_components/insightsSees";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";

/** Each section's colour on the charts: cannibalisation in orange, the rest away from it. */
const SECTION_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_ROSE, CHART_SERIES_SLATE];
/** Weeks drawn on the findings chart. */
const WEEKS_SHOWN = 12;

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Findings, the overview (docs/plans/active/insights-analyst-plan.md §4.1;
 * insights-intelligence-plan.md phase 7: Findings in sections, "the overview
 * is short"): the findings each week by section, when Hakken checks them, and
 * each section's biggest finding in one line — then every finding Hakken has
 * written for the company, newest first, each opening its whole case. Kept
 * two years (I7).
 */
export default function InsightsAllFindingsPage() {
  const t = usePlatformTranslations("insights.findings");
  const href = useInsightsHref();
  const site = useInsightsSite();
  // The website the eye is pressed for: the address's, else the one Insights opened on.
  const eyeSite = useInsightsShownSite();
  const rows = useQuery(api.insightsReads.insightsAllFindings, site ? { siteId: site } : {});
  const table = useFindingsTable({ rows, when: "found", opening: "week" });
  // The eye on a page that already shows Hakken's advice (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 2;
  // Anthony: "replace whatever has gone before as it's clearly broken"): findings of its own about this page, and the
  // advice it shows — each section's biggest finding and its first step — handed with the figures, so the piece written
  // builds on it and never says something different. Its sentences and steps are no longer the eye's words.
  const tAll = usePlatformTranslations("insights");
  const seesData = useMemo(() => findingsSees(rows, findingsNames(tAll)), [rows, tAll]);
  const advice = useMemo(() => (rows ? FINDING_SECTIONS.flatMap((section) => {
    const top = rows.filter((row) => sectionOf(row) === section).sort((a, b) => (b.atStake ?? 0) - (a.atStake ?? 0) || b.week.localeCompare(a.week) || a.rank - b.rank)[0];
    return top ? [{ section: tAll(`findings.sections.${section}.title`), headline: top.headline, firstStep: top.action }] : [];
  }) : undefined), [rows, tAll]);
  useSeesPart("advice", advice);
  const all = rows ?? [];
  const sectionName = (section: string) => t(`sections.${section}.title`);
  const series = FINDING_SECTIONS.map((section, at) => ({ key: section, name: sectionName(section), colour: SECTION_COLOURS[at] }));

  // The findings each week, by section.
  const weeks = [...new Set(all.map((row) => row.week))].sort().slice(-WEEKS_SHOWN);
  const weekRows = weeks.map((week) => datedRow({ day: week, lastDay: addDays(week, 6) }, Object.fromEntries(FINDING_SECTIONS.map((section) => [section, all.filter((row) => row.week === week && sectionOf(row) === section).length]))));
  // When Hakken checks them: the checks still to come, a month at a time.
  const today = new Date().toISOString().slice(0, 10);
  const due = all.filter((row) => row.checkOn && !row.outcome && row.checkOn >= today);
  const dueMonths = [...new Set(due.map((row) => row.checkOn!.slice(0, 7)))].sort();
  const dueRows = dueMonths.map((month) => monthRow(month, Object.fromEntries(FINDING_SECTIONS.map((section) => [section, due.filter((row) => row.checkOn!.startsWith(month) && sectionOf(row) === section).length]))));
  // Each section's biggest finding: the most at stake, then the newest.
  const biggest = FINDING_SECTIONS.flatMap((section) => {
    const top = all.filter((row) => sectionOf(row) === section).sort((a, b) => (b.atStake ?? 0) - (a.atStake ?? 0) || b.week.localeCompare(a.week) || a.rank - b.rank)[0];
    return top ? [{ section, top }] : [];
  });
  // Where the piece's first steps may point: each section's own findings, and its biggest finding's whole case.
  const links = biggest.flatMap(({ section, top }) => [
    { label: sectionName(section), href: href(`findings/sections/${section}`) },
    { label: top.headline, href: href(`findings/${top.findingId}`) },
  ]);

  return (
    <>
      <PageHeader icon={<ListChecks className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {all.length > 0 ? (
        <>
          <HakkenSees says={[]} steps={[]} page={{ screen: "insights.findings", siteId: eyeSite, data: seesData, links }} />
          <ChartCard title={t("overview.weekly")} hint={t("overview.weeklyHint")} exportName="insights-findings-by-week" csv={() => toCsv([t("overview.week"), ...series.map((entry) => entry.name)], weekRows.map((row) => [row.day, ...series.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={weekRows.length > 0}>
            <SiteBarChart data={weekRows} series={series} stacked labels={(value) => (value > 0 ? formatNumber(value) : null)} />
          </ChartCard>
          <ChartCard title={t("overview.due")} hint={t("overview.dueHint")} exportName="insights-findings-checks" csv={() => toCsv([t("overview.month"), ...series.map((entry) => entry.name)], dueRows.map((row) => [String(row.month), ...series.map((entry) => Number(row[entry.key] ?? 0))]))} enoughData={dueRows.length > 0} emptyText={t("overview.dueEmpty")}>
            <SiteBarChart data={dueRows} series={series} stacked labels={(value) => (value > 0 ? formatNumber(value) : null)} />
          </ChartCard>
        </>
      ) : null}
      <DataTable {...table} footer={table.footer} />
    </>
  );
}
