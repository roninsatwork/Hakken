"use client";

import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { monthRow } from "../../sites/_components/datedRows";
import type { ReportView } from "./ReportPdf";
import { useInsightsHref } from "./useInsights";

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
 * Your month): its summary in the What Hakken sees box with what to do next,
 * its figures against the period before, and its enquiries a month — all as
 * they were the day it was written.
 */
export function ReportTop({ report }: { report: ReportView }) {
  const t = usePlatformTranslations("insights.reports");
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
  const steps = body.next.slice(0, 3).map((words) => ({ words, link: t("seeThisWeek"), href: href("this-week") }));
  return (
    <>
      <HakkenSees says={[body.headline, body.summary].filter((line, index, all) => line && all.indexOf(line) === index)} steps={steps} />
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
