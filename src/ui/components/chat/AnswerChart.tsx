"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { AnswerChart as Chart } from "@/convex/utils/assistantCharts";
import { pathOf } from "@/convex/utils/hakkenTaskRules";
import { SITE_SERIES_COLOURS, SiteLineChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { datedRow } from "@/src/app/(dashboard)/app/sites/_components/datedRows";
import { formatShortDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { CHART_COMPARATOR_GREY } from "@/src/ui/components/charts/chartPalette";

/**
 * The chart under an Ask Hakken answer (docs/plans/active/hakken-tasks-plan.md,
 * item 2.1, as drawn and signed off 2026-10-07 — board AskChart): what it
 * shows, a link to the screen its figures came from, and the days drawn
 * against as many days before, dashed and grey. The Sites line chart draws
 * it, with the Google updates inside its dates, so it reads as every chart
 * in the app does; its figures are the look-up's own, kept on the message.
 */
export function AnswerChart({ chart }: { chart: Chart }) {
  const t = useTranslations("ai.assistant.chart");
  const locale = useLocale();
  const page = chart.page ? pathOf(chart.page) : null;
  const title = page ? t(`titlePage.${chart.measure}`, { page }) : t(`title.${chart.measure}`);
  const named = (from: string, to: string) => wholeMonth(from, to, locale) ?? t("span", { from: formatShortDay(from), to: formatShortDay(to) });
  const hasBefore = chart.points.some((point) => point.before !== undefined);

  const rows = chart.points.map((point) => datedRow({ day: point.day }, { now: point.value, ...(point.before !== undefined ? { before: point.before } : {}) }));
  const series: SiteSeries[] = [
    { key: "now", name: named(chart.from, chart.to), colour: SITE_SERIES_COLOURS[0] },
    ...(hasBefore ? [{ key: "before", name: named(chart.beforeFrom, chart.beforeTo), colour: CHART_COMPARATOR_GREY, dashed: true }] : []),
  ];

  return (
    <figure className="mt-2 mb-1 flex flex-col gap-2" aria-label={title}>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption className="text-[13px] font-medium text-foreground">{title}</figcaption>
        <Link href={chart.link} className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
          {t("open")}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {/* One measure on both lines, so one scale. */}
      <SiteLineChart data={rows} series={series} sharedScale height={210} />
    </figure>
  );
}

/** "September" when the days are a whole calendar month; otherwise nothing, and the dates are said. */
function wholeMonth(from: string, to: string, locale: string): string | null {
  const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000);
  if (!from.endsWith("-01") || from.slice(0, 7) !== to.slice(0, 7) || next.getUTCDate() !== 1) return null;
  return new Date(`${from}T00:00:00Z`).toLocaleDateString(locale.startsWith("it") ? "it-IT" : "en-GB", { month: "long", timeZone: "UTC" });
}
