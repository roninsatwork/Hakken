"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { AnswerChart as Chart, DaysChart } from "@/convex/utils/assistantCharts";
import { EVERY_OTHER, GROUP_LOOKS, groupsAreShares, type GroupsChart } from "@/convex/utils/assistantGroupCharts";
import { pathOf } from "@/convex/utils/hakkenTaskRules";
import { SITE_SERIES_COLOURS, SiteBarChart, SiteLineChart, SitePieChart, SiteScatterChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { countryName } from "@/src/app/(dashboard)/app/search-console/_components/countries";
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
  return isGroupsChart(chart) ? <GroupsAnswerChart chart={chart} /> : <DaysAnswerChart chart={chart} />;
}

/** What a chart's conversion is, in words: "made a purchase", "converted", "did add to cart". */
function useGroupsDid() {
  const tg = useTranslations("ai.assistant.chart.groups");
  return (event: string | undefined) => (event === "purchase" ? tg("did.purchase") : event === "*" ? tg("did.every") : tg("did.event", { event: (event ?? "").replace(/_/g, " ") }));
}

/**
 * A chart of groups' title, as the chart and the offer to send it both say it: what it shows, by what. Shared so
 * the two never word the same chart differently.
 */
export function useGroupsChartTitle() {
  const tg = useTranslations("ai.assistant.chart.groups");
  const didOf = useGroupsDid();
  return (chart: Pick<GroupsChart, "kind" | "by" | "measure" | "event"> & { look?: GroupsChart["look"] }) => {
    const search = chart.measure === "clicks" || chart.measure === "impressions";
    const by = tg(`by.${(search || chart.look === "clarityGroups") && chart.by === "page" ? "searchPage" : chart.by}` as "by.channel");
    const did = didOf(chart.event);
    if (chart.look === "visibilityGroups") {
      if (chart.by === "position") return chart.kind === "stacked" ? tg("visibility.positionStacked") : tg("visibility.position");
      if (chart.kind === "grid") return tg("visibility.grid");
      if (chart.kind === "scatter") return tg("visibility.scatter");
      const measure = tg(`visibility.measures.${chart.measure as "searches"}`);
      return chart.kind === "stacked" ? tg("visibility.stacked", { measure: measure.charAt(0).toLowerCase() + measure.slice(1) }) : tg("visibility.bars", { measure });
    }
    if (chart.look === "clarityGroups") {
      if (chart.kind === "grid") return tg("clarity.grid", { by });
      if (chart.kind === "stacked") return tg("clarity.stacked", { by });
      if (chart.measure === "visits") return tg("clarity.visits", { by });
      const measure = tg(`clarity.measures.${chart.measure as "scroll"}`);
      return chart.kind === "scatter" ? tg("clarity.scatter", { measure: measure.charAt(0).toLowerCase() + measure.slice(1), by }) : tg("clarity.measure", { measure, by });
    }
    if (search) {
      const measure = chart.measure as "clicks" | "impressions";
      if (chart.look === "bingGroups") return chart.kind === "scatter" ? tg("bing.scatter", { by }) : tg(`bing.${chart.kind === "stacked" ? "stacked" : "bars"}.${measure}`, { by });
      return chart.kind === "scatter" ? tg("search.scatter", { by }) : tg(`search.${chart.kind === "stacked" ? "stacked" : chart.kind === "pie" ? "pie" : "bars"}.${measure}`, { by });
    }
    if (chart.by === "hour") return tg("hours", { did });
    if (chart.kind === "grid") return tg("grid", { by });
    if (chart.kind === "scatter") return tg("scatter", { did, by });
    if (chart.kind === "bars") return tg(`bars.${chart.measure as "visits"}`, { did, by });
    return tg(`${chart.kind as "pie"}.${chart.measure === "visits" ? "visits" : "conversions"}`, { did, by });
  };
}

const isGroupsChart = (chart: Chart): chart is GroupsChart => (GROUP_LOOKS as readonly string[]).includes(chart.look);

/** The screen a chart's figures came from, by its source. */
const OPEN_IN = { analyticsGroups: "openAnalytics", searchConsoleGroups: "open", bingGroups: "openBing", clarityGroups: "openClarity", visibilityGroups: "openVisibility" } as const;

/** A line a day against the days before: the chart as it was first drawn. */
function DaysAnswerChart({ chart }: { chart: DaysChart }) {
  const t = useTranslations("ai.assistant.chart");
  const locale = useLocale();
  const page = chart.page ? pathOf(chart.page) : null;
  // An Analytics chart of one conversion names it as Google does, in plain words; Search Console's names its page.
  const event = chart.event ? chart.event.replace(/_/g, " ") : null;
  const title = chart.event === "purchase" && chart.measure === "conversionRate" ? t("titlePurchase")
    : event && (chart.measure === "conversions" || chart.measure === "conversionRate")
    ? t(`titleEvent.${chart.measure}`, { event: chart.measure === "conversions" ? event.charAt(0).toUpperCase() + event.slice(1) : event })
    : page ? t(`titlePage.${chart.measure}` as "titlePage.visitors", { page }) : t(`title.${chart.measure}`);
  const named = (from: string, to: string) => wholeMonth(from, to, locale) ?? t("span", { from: formatShortDay(from), to: formatShortDay(to) });
  const hasBefore = chart.points.some((point) => point.before !== undefined);

  const rows = chart.points.map((point) => datedRow({ day: point.day }, { now: point.value, ...(point.before !== undefined ? { before: point.before } : {}) }));
  const series: SiteSeries[] = [
    { key: "now", name: named(chart.from, chart.to), colour: SITE_SERIES_COLOURS[0] },
    ...(hasBefore ? [{ key: "before", name: named(chart.beforeFrom, chart.beforeTo), colour: CHART_COMPARATOR_GREY, dashed: true }] : []),
  ];

  return (
    <figure data-part="answer-chart" className="mt-2 mb-1 flex flex-col gap-2" aria-label={title}>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption data-part-title className="text-[13px] font-medium text-foreground">{title}</figcaption>
        <Link href={chart.link} className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
          {chart.look === "analyticsDays" ? t("openAnalytics") : t("open")}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {/* One measure on both lines, so one scale. */}
      <SiteLineChart data={rows} series={series} sharedScale height={210} />
    </figure>
  );
}

/**
 * A website's groups over a period (ask-hakken-every-chart-plan-2026-10-31.md, as drawn and signed off 2026-10-31 —
 * canvas "Ask Hakken, every kind of chart", board 1): bars to rank them, stacked bars for their shares against the
 * period before, a pie for shares, a scatter of visits against a rate, or a grid of each group's rate for each
 * conversion — each drawn by the part the app's own screens use, from the figures kept on the message.
 */
function GroupsAnswerChart({ chart }: { chart: GroupsChart }) {
  const t = useTranslations("ai.assistant.chart");
  const tg = useTranslations("ai.assistant.chart.groups");
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const tw = useTranslations("googleAnalytics.eventScreen.when");
  const title = useGroupsChartTitle()(chart);
  const search = chart.look === "searchConsoleGroups" || chart.look === "bingGroups";
  const clarity = chart.look === "clarityGroups";
  const visibility = chart.look === "visibilityGroups";
  const hours = chart.by === "hour";
  const did = useGroupsDid()(chart.event);
  // Search Console names a country by its three letters ("gbr"): said in the reader's language.
  const name = (group: string) => (group === EVERY_OTHER ? tg("everyOther")
    : chart.by === "device" && ["desktop", "mobile", "tablet"].includes(group) ? tg(`devices.${group}` as "devices.mobile")
      : chart.look === "searchConsoleGroups" && chart.by === "country" ? countryName(group, locale) ?? group.toUpperCase() : group);
  // Visibility's figures are its newest check's, by their day; the rest a calendar period's against the one before.
  const period = visibility
    ? (chart.asOf ? tg("visibility.asOf", { date: formatShortDay(chart.asOf) }) : tg("visibility.latest"))
    : tf(`periods.${chart.period}` as "periods.lastMonth");
  const before = visibility ? "" : tf(`before.${chart.period}` as "before.lastMonth");
  const beforeName = before.charAt(0).toUpperCase() + before.slice(1);
  const hasBefore = chart.groups.some((group) => group.before !== undefined);
  const rate = groupsAreShares(chart);
  const number = (value: number) => (rate ? `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%` : value.toLocaleString(locale));
  const share = (value: number) => `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const clarityMeasure = clarity && chart.measure !== "visits" ? tg(`clarity.measures.${chart.measure as "scroll"}`) : "";
  const scatterAxes = search ? { x: tg("search.scatterX"), y: tg("search.scatterY"), readout: tg("search.readoutY") }
    : visibility ? { x: tg("visibility.scatterX"), y: tg("visibility.scatterY"), readout: tg("visibility.scatterY") }
      : clarity ? { x: tg("visits"), y: `${clarityMeasure} (%)`, readout: clarityMeasure }
        : { x: tg("visits"), y: tg("scatterY", { did }), readout: tg("rate") };

  const drawn = (() => {
    if (chart.kind === "pie") {
      return <SitePieChart slices={chart.groups.map((group, at) => ({ key: group.name, name: name(group.name), value: group.value, colour: group.name === EVERY_OTHER ? CHART_COMPARATOR_GREY : SITE_SERIES_COLOURS[at % SITE_SERIES_COLOURS.length] }))} formatValue={share} />;
    }
    if (chart.kind === "stacked") {
      // Two bars, the period before and the period: each group's share stacked to the whole.
      const rows = [
        ...(hasBefore ? [{ label: beforeName, ...Object.fromEntries(chart.groups.map((group, at) => [`g${at}`, group.before ?? 0])) }] : []),
        { label: period, ...Object.fromEntries(chart.groups.map((group, at) => [`g${at}`, group.value])) },
      ];
      const series = chart.groups.map((group, at) => ({ key: `g${at}`, name: name(group.name), colour: group.name === EVERY_OTHER ? CHART_COMPARATOR_GREY : SITE_SERIES_COLOURS[at % SITE_SERIES_COLOURS.length] }));
      return <SiteBarChart data={rows} series={series} stacked height={220} updateKey={false} formatValue={(value) => share(value)} formatScale={(value) => `${value}%`} />;
    }
    if (chart.kind === "scatter") {
      return (
        <SiteScatterChart
          groups={[{ key: "groups", name: title, colour: SITE_SERIES_COLOURS[0], labelled: true, points: chart.groups.map((group) => ({ x: group.visits ?? 0, y: group.value, label: name(group.name) })) }]}
          xLabel={scatterAxes.x}
          yLabel={scatterAxes.y}
          readout={{ x: scatterAxes.x, y: scatterAxes.readout }}
          height={300}
        />
      );
    }
    if (chart.kind === "grid") {
      const columns = chart.groups.map((group) => name(group.name));
      // A grid of the week names each row by its day (Google counts Sunday as 0) and says times, not shares; Clarity's
      // rows are its measures; Visibility's are its websites, by their addresses, each counting searches.
      const figure = (value: number) => (rate ? share(value) : value.toLocaleString(locale));
      const rows: ChannelMapRow[] = (chart.rows ?? []).map((row) => {
        const highest = Math.max(0, ...row.values.map((value) => value ?? 0));
        const label = hours ? tw(`days.${row.event}` as "days.1") : clarity ? tg(`clarity.rows.${row.event as "scroll"}`) : visibility ? row.event : row.event.replace(/_/g, " ");
        return {
          key: row.event,
          label: visibility ? label : label.charAt(0).toUpperCase() + label.slice(1),
          total: "",
          cells: row.values.map((value, at) => ({
            visits: value ?? 0,
            conversions: 0,
            hover: value === null ? `${columns[at]}: ${tg("none")}` : `${columns[at]}: ${figure(value)}`,
            ...(value !== null ? { text: figure(value), share: highest > 0 ? value / highest : 0 } : {}),
          })),
        };
      });
      return <ChannelMap columns={columns} rows={rows} rowVisits={() => 1} conversionsWord={() => ""} legend={{ shades: hours ? tg("hoursShades") : clarity ? tg("clarity.shades") : visibility ? tg("visibility.shades") : tg("shades"), empty: tg("none") }} headingTooltips cellTooltips />;
    }
    // Bars along, the biggest first: the period in orange, the period before in grey beside it.
    const rows = chart.groups.map((group) => ({ label: name(group.name), now: group.value, ...(group.before !== undefined ? { before: group.before } : {}) }));
    const series: SiteSeries[] = [
      { key: "now", name: period, colour: SITE_SERIES_COLOURS[0] },
      ...(hasBefore ? [{ key: "before", name: beforeName, colour: CHART_COMPARATOR_GREY }] : []),
    ];
    return <SiteBarChart data={rows} series={series} horizontal updateKey={false} formatValue={(value) => number(value)} {...(rate ? { formatScale: (value: number) => `${value}%` } : {})} />;
  })();

  return (
    <figure data-part="answer-chart" className="mt-2 mb-1 flex flex-col gap-2" aria-label={title}>
      <div className="flex items-baseline justify-between gap-4">
        <figcaption data-part-title className="text-[13px] font-medium text-foreground">{title}</figcaption>
        <Link href={chart.link} className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
          {t(OPEN_IN[chart.look])}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {drawn}
    </figure>
  );
}

/** "September" when the days are a whole calendar month; otherwise nothing, and the dates are said. */
function wholeMonth(from: string, to: string, locale: string): string | null {
  const next = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000);
  if (!from.endsWith("-01") || from.slice(0, 7) !== to.slice(0, 7) || next.getUTCDate() !== 1) return null;
  return new Date(`${from}T00:00:00Z`).toLocaleDateString(locale.startsWith("it") ? "it-IT" : "en-GB", { month: "long", timeZone: "UTC" });
}
