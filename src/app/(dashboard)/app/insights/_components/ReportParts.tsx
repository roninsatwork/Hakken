"use client";

import { useMemo } from "react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees, type SeesPage } from "@/src/ui/components/screens/HakkenSees";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatMonth, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { monthRow } from "../../sites/_components/datedRows";
import type { ReportView } from "./ReportPdf";
import { useInsightsHref } from "./useInsights";
import { reportAdvice, reportNames, reportSees } from "./insightsSees";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";

/** A report's rows of words, section by section: what the report's table lists. */
export function reportLines(report: ReportView, t: (key: string) => string): Array<{ key: string; section: string; words: string }> {
  const body = report.body;
  const first = report.kind === "BOARD" ? t("sections.inOneMinute") : report.kind === "MONTHLY" ? t("sections.happened") : t("sections.findings");
  return [
    ...body.points.map((words, index) => ({ key: `p${index}`, section: first, words })),
    ...body.risks.map((words, index) => ({ key: `r${index}`, section: t("sections.risk"), words })),
    ...body.opportunities.map((words, index) => ({ key: `o${index}`, section: t("sections.opportunity"), words })),
    ...body.next.map((words, index) => ({ key: `n${index}`, section: t("sections.next"), words })),
    ...(body.decision ? [{ key: "d", section: t("sections.decision"), words: body.decision }] : []),
  ];
}

/**
 * The top of a report as written (insights-analyst-plan.md §4.1, Reports and
 * Your month): its figures against the period before and its enquiries a
 * month — all as they were the day it was written. The eye (decision 2 of
 * ask-hakken-every-chart-page-plan-2026-11-03.md; Anthony: "replace whatever
 * has gone before as it's clearly broken") no longer repeats the report's
 * headline and summary: it finds its own in the report's figures, and the
 * report's words go to it as advice, so its piece builds on them and never
 * says something different.
 */
export function ReportTop({ report, page }: { report: ReportView; page?: Omit<SeesPage, "data"> }) {
  const t = usePlatformTranslations("insights.reports");
  const tAll = usePlatformTranslations("insights");
  const seesData = useMemo(() => reportSees(report, reportNames(tAll), formatMonth), [report, tAll]);
  const advice = useMemo(() => reportAdvice(report), [report]);
  useSeesPart("advice", advice);
  const tm = usePlatformTranslations("insights.summary.measures");
  const href = useInsightsHref();
  const body = report.body;
  const fact = (key: string) => body.facts.find((entry) => entry.key === key)?.value ?? null;
  const monthly = report.kind === "MONTHLY";
  const figures = monthly
    ? [
      { label: t("figures.enquiries"), now: fact("month.enquiries.now"), before: fact("month.enquiries.before") },
      { label: t("figures.visits"), now: fact("month.visits.now"), before: fact("month.visits.before") },
      { label: t("figures.googleClicks"), now: fact("month.googleClicks.now"), before: fact("month.googleClicks.before") },
    ]
    : body.scorecard.slice(0, 4).map((score) => ({ label: tm(score.measure), now: score.now, before: score.before }));
  const months = body.enquiriesByMonth;
  // Where the piece's first steps may point: the week's findings, every report.
  const links = [{ label: t("seeThisWeek"), href: href("this-week") }, { label: t("back"), href: href("reports") }];
  return (
    <>
      {page ? <HakkenSees says={[]} steps={[]} page={{ ...page, data: seesData, links }} /> : null}
      {figures.length > 0 ? (
        <FigureRow columns={figures.length === 3 ? 3 : 4}>
          {figures.map((figure) => (
            <Figure
              key={figure.label}
              label={figure.label}
              value={figure.now === null ? "–" : formatNumber(figure.now)}
              detail={figure.now !== null && figure.before !== null
                ? <ChangeLine by={figure.now - figure.before}>{t(monthly ? "figures.onMonth" : "figures.onYear", { before: formatNumber(figure.before) })}</ChangeLine>
                : <span className="text-secondary">{t("figures.noBefore")}</span>}
            />
          ))}
        </FigureRow>
      ) : null}
      <ChartCard
        title={t("chart.title")}
        hint={t("chart.hint")}
        exportName={`${report.host}-enquiries-a-month`}
        csv={() => toCsv([t("chart.month"), t("chart.enquiries")], months.map((month) => [month.month, month.conversions]))}
        enoughData={months.length > 1}
        emptyText={t("chart.empty")}
      >
        <SiteBarChart data={months.map((month) => monthRow(month.month, { enquiries: month.conversions }))} series={[{ key: "enquiries", name: t("chart.enquiries"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </ChartCard>
    </>
  );
}
