"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import type { ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { ChartExplorer } from "@/src/ui/components/screens/ChartExplorer";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import type { SiteSeries } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { TABLE_PAGE_KEY, useSetSiteParams } from "../../sites/_components/useSiteParam";
import type { TableTicks } from "@/src/ui/components/screens/TableTicks";
import type { ListPageAnswer } from "./AnalyticsListScreen";
import { BeforeLine } from "./AnalyticsFigures";
import { formatPerVisit } from "./analyticsFormat";
import { linesByStep, type ClassificationChoice } from "./AllPagesParts";
import { stepKey } from "./stepScale";
import type { FlowAnswer } from "./funnelRoutes";
import { useAnalyticsArgs, useAnalyticsStatus, useStep } from "./useAnalytics";
import { useWebsiteForEye } from "./useEyeFigures";
import { spansOfList, useSpanInWords, useSpanWords } from "./VisitsCharts";

/**
 * Funnel's own parts (docs/plans/active/funnel-way-1-plan-2026-11-05.md; board Way 1): its four boxes, People who left straight
 * away each day, and the ticks that choose which pages the route chart shows. The parts themselves are the kit's.
 */

/** The pages the route chart can show at once. */
export const MOST_TICKED = 10;
const PLOT_KEY = "plot";
/** The address's word for nothing ticked, as no word at all means the pages it opens with. */
const NONE_TICKED = "none";

/**
 * The route chart's read and the table's ticks. It opens with the ten busiest pages the menu leaves in. Ticks stay in the
 * address, so they survive a refresh, a new page of the table or a shared link. The last answer stays on screen while a new
 * tick is read, so the chart doesn't blink.
 */
export function useFunnelFlow(choice: ClassificationChoice): { flow: FlowAnswer | undefined; ticks: TableTicks } {
  const t = useTranslations("googleAnalytics.landing");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const params = useSearchParams();
  const set = useSetSiteParams();
  const raw = params.get(PLOT_KEY);
  const chosen = raw === null ? undefined : raw === NONE_TICKED ? [] : raw.split(",").filter(Boolean).slice(0, MOST_TICKED);
  const answer = useQuery(api.googleAnalyticsFlowReads.analyticsLandingFlow, status?.connection?.newestDay ? {
    ...args,
    ...(chosen ? { pages: chosen } : {}),
    ...(choice.leaveOut ? { leaveOut: true } : {}),
    ...(choice.group !== undefined ? { group: choice.group } : {}),
  } : "skip");
  const [held, setHeld] = useState<FlowAnswer | undefined>(undefined);
  // Adjusted during render, as React recommends, so the kept answer never trails by a frame.
  if (answer !== undefined && answer !== held) setHeld(answer);
  const flow = answer ?? held;
  const keys = chosen ?? flow?.starts ?? [];
  const ticks: TableTicks = {
    keys,
    most: MOST_TICKED,
    limit: t("tickLimit", { most: MOST_TICKED }),
    set: (now) => set({ [PLOT_KEY]: now.length > 0 ? now.join(",") : NONE_TICKED, [TABLE_PAGE_KEY]: params.get(TABLE_PAGE_KEY) }),
  };
  return { flow, ticks };
}

/** Four boxes, each set against the dates before: the whole website's. */
export function FunnelBoxes({ answer }: { answer: ListPageAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.landing.boxes");
  const website = useWebsiteForEye();
  const dates = spansOfList(answer);
  const spans = useSpanWords(...dates);
  const inWords = useSpanInWords(...dates);
  if (!website) return null;
  const share = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "–");
  const leftNow = share(website.visits - website.engaged, website.visits);
  const leftBefore = website.visitsBefore && website.engagedBefore !== null ? share(website.visitsBefore - website.engagedBefore, website.visitsBefore) : null;
  const pagesNow = website.visits > 0 ? website.views / website.visits : null;
  const pagesBefore = website.visitsBefore && website.viewsBefore !== null ? website.viewsBefore / website.visitsBefore : null;
  const quiet = (words: string) => <span className="text-secondary">{words}</span>;
  return (
    <FigureRow columns={4}>
      <Figure label={t("visits")} value={formatNumber(website.visits)} detail={<BeforeLine now={website.visits} before={website.visitsBefore} named={spans.before} />} />
      <Figure label={t("leftAtOnce")} value={leftNow} detail={leftBefore ? quiet(t("was", { figure: leftBefore, before: inWords.before })) : undefined} />
      <Figure label={t("pagesAVisit")} value={formatPerVisit(pagesNow)} detail={pagesBefore !== null ? quiet(t("pagesBefore", { figure: formatPerVisit(pagesBefore), before: inWords.before })) : undefined} />
      <Figure label={t("conversions")} value={formatNumber(website.conversions)} detail={<BeforeLine now={website.conversions} before={website.conversionsBefore} named={spans.before} />} />
    </FigureRow>
  );
}

type Show = "left" | "stayed" | "conversions";
const SHOWS: readonly Show[] = ["left", "stayed", "conversions"];
type DayPoint = { day: string; lastDay?: string; visits: number; engaged?: number; conversions: number };

/** The figure a day's point gives for what the chart shows. */
function figureOf(point: DayPoint, show: Show): number {
  if (show === "conversions") return point.conversions;
  const engaged = point.engaged ?? 0;
  return show === "left" ? Math.max(0, point.visits - engaged) : engaged;
}

/**
 * People who left straight away each day, or those who stayed, or conversions: the kit's chart with menus, set against the
 * same days of the dates before where those are held day by day (weeks and months, as on Visits).
 */
export function LeftEachDayCard({ answer }: { answer: ListPageAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.landing.daily");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [show, setShow] = useState<Show>("left");
  const [against, setAgainst] = useState<"before" | "none">("before");
  const ready = Boolean(status?.connection?.newestDay);
  const now = useQuery(api.googleAnalyticsChartReads.analyticsChart, ready ? args : "skip");
  const before = useQuery(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, ready ? args : "skip");
  const dates = spansOfList(answer);
  const spans = useSpanWords(...dates);
  const inWords = useSpanInWords(...dates);
  const comparing = against === "before" && Boolean(before?.held) && (before?.points.length ?? 0) > 0;
  const series: SiteSeries[] = [
    { key: "now", name: inWords.now, colour: CHART_SERIES_ORANGE },
    ...(comparing ? [{ key: "before", name: inWords.before, colour: CHART_COMPARATOR_GREY, dashed: true }] : []),
  ];
  const toPoints = (points: readonly DayPoint[]) => points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), views: 0, visits: figureOf(point, show), conversions: 0 }));
  const lines = [toPoints(now?.points ?? []), ...(comparing ? [toPoints(before?.points ?? [])] : [])];
  // A day September didn't have, like 31 October's, has no figure rather than none.
  const beforeSteps = new Set((before?.points ?? []).map((point) => stepKey(step, point.day)));
  const data = linesByStep(step, "visits", series, lines).map((row) => (comparing && !beforeSteps.has(stepKey(step, String(row.day))) ? { ...row, before: null } : row));
  const seen = useMemo(() => (now ? {
    show,
    days: (now.points as readonly DayPoint[]).map((point) => ({ day: point.day, leftStraightAway: figureOf(point, "left"), stayed: figureOf(point, "stayed"), conversions: point.conversions })),
    ...(before?.held ? { daysBefore: (before.points as readonly DayPoint[]).map((point) => ({ day: point.day, leftStraightAway: figureOf(point, "left"), stayed: figureOf(point, "stayed"), conversions: point.conversions })) } : {}),
  } : undefined), [now, before, show]);
  useSeesPart("leftEachDay", seen);
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }): ChartReadoutTableProps => ({
    heading,
    columns: [{ key: "figure", label: t(`show.${show}`), tone: "band", drawn: true }],
    rows: series.map((entry) => {
      const value = row[entry.key];
      return { key: entry.key, name: entry.name, colour: entry.colour, cells: { figure: typeof value === "number" ? { text: formatNumber(value) } : { text: "–", quiet: true } } };
    }),
  });
  return (
    <ChartExplorer
      title={t(`title.${show}.${step}`)}
      hint={comparing ? t("hintAgainst", { now: inWords.now, before: inWords.before }) : t("hint", { now: inWords.now })}
      exportName="google-analytics-left-straight-away"
      csv={() => toCsv([t("csvDay"), ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number | null ?? null)]))}
      host={status?.host ?? ""}
      from={null}
      to={null}
      step={step}
      waiting={now === undefined ? undefined : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: show, options: SHOWS.map((one) => ({ value: one, label: t(`show.${one}`) })), onChange: (next) => setShow(next as Show) },
        ...(before?.held ? [{
          kind: "select" as const, key: "against", label: t("compareWith"), value: against,
          options: [{ value: "before", label: spans.beforeNamed ?? spans.before }, { value: "none", label: t("nothing") }],
          onChange: (next: string) => setAgainst(next as "before" | "none"),
        }] : []),
      ]}
      nothingTicked={null}
      data={data}
      series={series}
      readout={readout}
      anything={data.length > 0}
      empty={t("empty")}
      height={200}
    />
  );
}
