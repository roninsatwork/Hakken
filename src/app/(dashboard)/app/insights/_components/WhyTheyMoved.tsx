"use client";

import type { FunctionReturnType } from "convex/server";
import { useLocale } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { monthRow } from "../../sites/_components/datedRows";
import { formatMonth, formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { monthsWords, periodWords } from "./insightPeriodWords";
import { LABEL } from "./StrategyNote";

type PeriodView = NonNullable<FunctionReturnType<typeof api.insightsPeriod.insightsPeriodView>>;
type Test = NonNullable<PeriodView["why"]>["tests"][number];

/** A verdict's tone: a cause found warns, the biggest part is the danger, a ruled-out cause is quiet. The icon and words carry it, never the colour alone. */
const TONE: Record<string, StatusTone> = { BIGGEST: "danger", LIKELY: "warning", PART: "warning", WATCH: "info", NOT: "neutral", RULED_OUT: "neutral", NO_DATA: "neutral" };

/** Each source group's colour on the chart of visits by source: Google orange, the rest away from it. */
const GROUP_COLOURS: Record<string, string> = {
  GOOGLE: CHART_SERIES_ORANGE, AI: CHART_SERIES_VIOLET, OTHER_SEARCH: CHART_SERIES_TEAL, TYPED: CHART_SERIES_BLUE, WEBSITES: CHART_SERIES_SLATE, SOCIAL: CHART_SERIES_ROSE, OTHER: CHART_SERIES_SLATE,
};

const TESTS = ["COUNTING", "MARKET", "RANKINGS", "SHOWN", "SOURCES", "CONVERSION"] as const;

/**
 * Why your enquiries fell (docs/plans/active/insights-intelligence-plan.md
 * phase 8, drawn and approved 12 Oct 2026): the move split into what each
 * cause cost — Analytics counting fewer, fewer visitors, fewer enquiring —
 * then the six tests, the service pages first, each with its verdict, the
 * sources it rests on, one plain finding and its chart over the months
 * held, Google's updates on each. The Analyst's words lead when the week
 * wrote them for the period chosen.
 */
export function WhyTheyMoved({ view }: { view: PeriodView }) {
  const t = usePlatformTranslations("insights.why");
  const tPeriod = usePlatformTranslations("insights.period");
  const locale = useLocale();
  const { chosen, why, figures } = view;
  if (!chosen || !why || !figures) return null;
  const thenMonths = (why.compare === "YEAR_AGO" ? chosen.yearAgo : chosen.before) ?? [];
  const nowWords = periodWords(chosen.id, tPeriod);
  const thenWords = monthsWords(thenMonths, tPeriod);
  const enquiriesThen = (why.compare === "YEAR_AGO" ? figures.enquiries.yearAgo : figures.enquiries.before) ?? 0;
  const direction = why.lost > 0 ? "fell" : why.lost < 0 ? "rose" : "held";
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(items);

  // The parts that go the way the whole went, biggest first.
  const parts = (["counting", "visits", "rate"] as const)
    .map((part) => ({ part, count: why.split[part] * (direction === "rose" ? -1 : 1) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const lead = why.paragraph
    ?? (direction === "held"
      ? t("lead.held", { now: figures.enquiries.now, then: thenWords })
      : t(`lead.${direction}`, { count: Math.abs(why.lost), then: thenWords, parts: list(parts.map((entry) => t(`clause.${direction}.${entry.part}`, { count: entry.count }))) }));

  // Where the enquiries went: the year before, each cause's part, and now — each bar with its figure.
  const steps = [
    { label: thenWords, value: enquiriesThen, cause: false },
    ...parts.map((entry) => ({ label: t(`part.${direction}.${entry.part}`), value: entry.count, cause: true })),
    { label: nowWords, value: figures.enquiries.now, cause: false },
  ];

  const months = view.months.filter((month) => month.whole);
  const test = (id: string): Test | undefined => why.tests.find((entry) => entry.id === id);
  const sources = (names: string[]) => list(names.map((name) => t(`sources.${name}`)));
  const fig = (value: unknown) => (typeof value === "number" ? formatNumber(value) : "–");
  // A place or a rate, to one decimal: 20.7, 4.3.
  const place = (value: unknown) => (typeof value === "number" ? value.toFixed(1) : "–");
  const sentence = (entry: Test): string => {
    const f = entry.figures;
    const lines: string[] = [];
    switch (entry.id) {
      case "COUNTING":
        lines.push(t("tests.COUNTING.said", { now: fig(f.shareNow), then: fig(f.shareThen), period: thenWords }));
        if (entry.part && entry.part > 0) lines.push(t("tests.COUNTING.part", { count: entry.part }));
        break;
      case "MARKET":
        if (f.rivalsNow !== null) lines.push(t("tests.MARKET.rivals", { now: fig(f.rivalsNow), then: fig(f.rivalsThen), nowPeriod: nowWords, thenPeriod: thenWords }));
        if (f.shownNow !== null && f.shownThen !== null) lines.push(t("tests.MARKET.shown", { now: fig(f.shownNow), then: fig(f.shownThen) }));
        lines.push(t("tests.MARKET.clicks", { now: fig(f.clicksNow), then: fig(f.clicksThen) }));
        break;
      case "RANKINGS":
        lines.push(f.positionThen !== null
          ? t("tests.RANKINGS.place", { now: place(f.positionNow), then: place(f.positionThen), period: thenWords })
          : t("tests.RANKINGS.placeOnly", { now: place(f.positionNow), since: view.breakMonth ? formatMonth(view.breakMonth) : "" }));
        if (typeof f.bestMonth === "string") lines.push(t("tests.RANKINGS.best", { best: place(f.bestPosition), month: formatMonth(f.bestMonth) }));
        if (f.pageOneNow !== null) lines.push(t("tests.RANKINGS.week", { now: fig(f.pageOneNow), before: fig(f.pageOneBefore) }));
        break;
      case "SHOWN":
        lines.push(f.shownThen !== null
          ? t("tests.SHOWN.shown", { now: fig(f.shownNow), then: fig(f.shownThen), period: thenWords })
          : t("tests.SHOWN.notCompared", { since: view.breakMonth ? formatMonth(view.breakMonth) : "" }));
        if (f.aiWith !== null) lines.push(t("tests.SHOWN.ai", { with: fig(f.aiWith), of: fig(f.aiOf) }));
        break;
      case "SOURCES": {
        const named = [0, 1, 2].flatMap((at) => (typeof f[`source${at}`] === "string"
          ? [t("tests.SOURCES.one", { source: t(`groups.${String(f[`source${at}`])}`), now: fig(f[`source${at}Now`]), then: fig(f[`source${at}Then`]) })]
          : []));
        lines.push(named.length > 0 ? t("tests.SOURCES.said", { sources: list(named), period: thenWords }) : t("tests.SOURCES.none"));
        break;
      }
      case "CONVERSION":
        lines.push(t("tests.CONVERSION.said", { serviceNow: place(f.serviceRateNow), serviceThen: place(f.serviceRateThen), now: place(f.rateNow), then: place(f.rateThen), period: thenWords }));
        if (entry.part && entry.part > 0 && direction === "fell") lines.push(t("tests.CONVERSION.part", { count: entry.part, of: why.lost }));
        break;
    }
    return lines.join(" ");
  };

  // Each test's chart: the months held, Google's updates on them the standard way (a dated chart draws them itself).
  const rows = (values: (month: (typeof months)[number]) => Record<string, number | null>) => months.map((month) => monthRow(month.month, values(month)));
  const charts: Record<string, { title: string; hint: string; data: Array<Record<string, unknown>>; series: Array<{ key: string; name: string; colour: string }>; stacked?: boolean; label: (value: number, key: string) => string | null }> = {
    COUNTING: { title: t("tests.COUNTING.chart"), hint: t("tests.COUNTING.chartHint"), data: rows((month) => ({ share: month.share })), series: [{ key: "share", name: t("tests.COUNTING.series"), colour: CHART_SERIES_BLUE }], label: (value) => formatNumber(value) },
    MARKET: { title: t("tests.MARKET.chart"), hint: t("tests.MARKET.chartHint"), data: rows((month) => ({ rivals: month.rivals })), series: [{ key: "rivals", name: t("tests.MARKET.series"), colour: CHART_SERIES_SLATE }], label: (value) => formatNumber(value) },
    RANKINGS: { title: t("tests.RANKINGS.chart"), hint: t("tests.RANKINGS.chartHint"), data: rows((month) => ({ place: month.service.position })), series: [{ key: "place", name: t("tests.RANKINGS.series"), colour: CHART_SERIES_ORANGE }], label: (value) => value.toFixed(1) },
    SHOWN: { title: t("tests.SHOWN.chart"), hint: t("tests.SHOWN.chartHint"), data: rows((month) => ({ shown: month.service.shown })), series: [{ key: "shown", name: t("tests.SHOWN.series"), colour: CHART_SERIES_ORANGE }], label: (value) => formatNumber(value) },
    SOURCES: {
      title: t("tests.SOURCES.chart"), hint: t("tests.SOURCES.chartHint"), stacked: true,
      data: rows((month) => Object.fromEntries(month.groups.map((group) => [group.group, group.visits]))),
      series: (months[0]?.groups ?? []).map((group) => ({ key: group.group, name: t(`groups.${group.group}`), colour: GROUP_COLOURS[group.group] ?? CHART_SERIES_SLATE })),
      label: (value, key) => (key === "GOOGLE" ? formatNumber(value) : null),
    },
    CONVERSION: {
      title: t("tests.CONVERSION.chart"), hint: t("tests.CONVERSION.chartHint"),
      data: rows((month) => ({ service: month.service.visits > 0 ? Math.round((month.service.enquiries * 1000) / month.service.visits) / 10 : null, all: month.visits > 0 ? Math.round((month.enquiries * 1000) / month.visits) / 10 : null })),
      series: [{ key: "service", name: t("tests.CONVERSION.service"), colour: CHART_SERIES_ORANGE }, { key: "all", name: t("tests.CONVERSION.all"), colour: CHART_SERIES_BLUE }],
      label: (value) => `${value}%`,
    },
  };

  return (
    <section data-part="why-moved" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 data-part-title="true" className={LABEL}>{t(`title.${direction}`, { now: nowWords, then: thenWords })}</h2>
        <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{t("hint")}</p>
      </div>
      <p className="max-w-[75ch] text-lg font-semibold leading-snug text-foreground">{lead}</p>
      {direction !== "held" ? (
        <ChartCard
          title={t("split.title", { count: Math.abs(why.lost) })}
          hint={t("split.hint", { then: thenWords, now: nowWords })}
          exportName="insights-why-split"
          csv={() => toCsv([t("split.step"), t("split.enquiries")], steps.map((step) => [step.label, step.value]))}
        >
          <SiteBarChart
            horizontal
            data={steps.map((step) => ({ label: step.label, value: step.value, cause: step.cause }))}
            series={[{ key: "value", name: t("split.enquiries"), colour: CHART_SERIES_SLATE }]}
            highlight={{ colour: CHART_SERIES_ORANGE, rows: (row) => row.cause === true }}
            labels={(value) => formatNumber(value)}
          />
        </ChartCard>
      ) : null}
      {TESTS.map((id, index) => {
        const entry = test(id);
        if (!entry) return null;
        const chart = charts[id];
        return (
          <div key={id} data-part="why-test" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[14px] font-medium text-foreground">{t("numbered", { number: index + 1, question: t(`tests.${id}.question`) })}</span>
              <StatusLabel tone={TONE[entry.verdict] ?? "neutral"}>{t(`verdict.${entry.verdict}`)}</StatusLabel>
              <span className="text-[12px] text-muted">{t("from", { sources: sources(entry.sources) })}</span>
            </div>
            <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{sentence(entry)}</p>
            <ChartCard
              title={chart.title}
              hint={chart.hint}
              exportName={`insights-why-${id.toLowerCase()}`}
              csv={() => toCsv([t("month"), ...chart.series.map((entry) => entry.name)], chart.data.map((row) => [String(row.month), ...chart.series.map((entry) => (row[entry.key] as number | null) ?? null)]))}
              enoughData={chart.data.some((row) => chart.series.some((entry) => typeof row[entry.key] === "number"))}
              emptyText={t("noChart")}
            >
              <SiteBarChart data={chart.data} series={chart.series} stacked={chart.stacked} labels={(value, key) => chart.label(value, key)} />
            </ChartCard>
          </div>
        );
      })}
    </section>
  );
}
