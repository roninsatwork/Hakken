import { v, type Infer } from "convex/values";
import { GROUP_CHART_BY, GROUP_CHART_KINDS, SEARCH_GROUP_MEASURES, groupsChartValidator, type GroupsChart } from "./assistantGroupCharts";

/**
 * A chart under an Ask Hakken answer (docs/plans/active/hakken-tasks-plan.md,
 * item 2.1, as drawn and signed off 2026-10-07 — board AskChart): a website's
 * or a page's visitors or impressions each day, against the same number of
 * days before. The Assistant asks for it by naming the look-up and the
 * measure (`show_chart`); the figures are the look-up's own, never the
 * model's, and it is kept on the message like the "Looked up" line, so
 * reading the conversation back draws the same chart. Plain code, free of any
 * Convex function, so the server and the screens read the same shape.
 */

export const CHART_MEASURES = ["visitors", "impressions"] as const;
export type ChartMeasure = (typeof CHART_MEASURES)[number];
/**
 * Google Analytics' measures (sees-side-panel-plan-2026-10-31.md, phase 4; Anthony: "upgrade ask hakken to create
 * graphs and charts"): the website's visits, its conversions (every one, or one by its Google name), and the share
 * of visits that converted — each a day at a time from the days Analytics keeps, never the model's numbers.
 */
export const ANALYTICS_CHART_MEASURES = ["visits", "conversions", "conversionRate"] as const;
export type AnalyticsChartMeasure = (typeof ANALYTICS_CHART_MEASURES)[number];

/** Where in its words the answer wants the chart: on a line of its own. Drawn at the end when the answer does not say. */
export const CHART_MARK = "{{chart}}";

/** A figure a day against the days before: Search Console's or Google Analytics' line. */
export const daysChartValidator = v.object({
  look: v.union(v.literal("searchConsoleDays"), v.literal("analyticsDays")),
  measure: v.union(v.literal("visitors"), v.literal("impressions"), v.literal("visits"), v.literal("conversions"), v.literal("conversionRate")),
  /** One conversion, by its Google name, for Analytics' conversions and their rate; absent for every one. */
  event: v.optional(v.string()),
  website: v.string(),
  page: v.optional(v.string()),
  /** The days drawn, `YYYY-MM-DD`, and the same number before them. */
  from: v.string(),
  to: v.string(),
  beforeFrom: v.string(),
  beforeTo: v.string(),
  /** Each day's figure, and the figure on the day as many days before. */
  points: v.array(v.object({ day: v.string(), value: v.number(), before: v.optional(v.number()) })),
  /** The screen the figures came from. */
  link: v.string(),
});

export type DaysChart = Infer<typeof daysChartValidator>;

/**
 * Any chart under an answer: a line a day, or — since 2026-10-31 (ask-hakken-every-chart-plan) — a website's groups
 * as bars, stacked bars, a pie, a scatter or a grid (`assistantGroupCharts.ts`).
 */
export const answerChartValidator = v.union(daysChartValidator, groupsChartValidator);
export type AnswerChart = DaysChart | GroupsChart;

/** The longest chart: Search Console's longest look-up. */
export const MOST_CHART_DAYS = 90;

function parse(json: string | undefined): unknown {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

/** The most groups a chart of groups carries: a scatter's twenty. */
const MOST_GROUPS = 20;

function isGroupsChart(chart: Record<string, unknown>): boolean {
  return (chart.look === "analyticsGroups" || chart.look === "searchConsoleGroups")
    && (GROUP_CHART_KINDS as readonly unknown[]).includes(chart.kind)
    && (GROUP_CHART_BY as readonly unknown[]).includes(chart.by)
    && ([...ANALYTICS_CHART_MEASURES, ...SEARCH_GROUP_MEASURES] as readonly unknown[]).includes(chart.measure)
    && typeof chart.website === "string"
    && typeof chart.period === "string"
    && typeof chart.link === "string"
    && Array.isArray(chart.groups)
    && chart.groups.length > 0
    && chart.groups.length <= MOST_GROUPS;
}

function isChart(value: unknown): value is AnswerChart {
  if (!value || typeof value !== "object") return false;
  const chart = value as Record<string, unknown>;
  if (chart.look === "analyticsGroups" || chart.look === "searchConsoleGroups") return isGroupsChart(chart);
  return (
    ((chart.look === "searchConsoleDays" && (chart.measure === "visitors" || chart.measure === "impressions"))
      || (chart.look === "analyticsDays" && (ANALYTICS_CHART_MEASURES as readonly unknown[]).includes(chart.measure)))
    && typeof chart.website === "string"
    && typeof chart.from === "string"
    && typeof chart.to === "string"
    && typeof chart.beforeFrom === "string"
    && typeof chart.beforeTo === "string"
    && typeof chart.link === "string"
    && Array.isArray(chart.points)
    && chart.points.length > 0
    && chart.points.length <= MOST_CHART_DAYS
  );
}

/** The chart a run asked for: the last `show_chart` that drew one. One chart to an answer. */
const CHARTING = new Set(["assistant.chart", "assistant.tasks.proposeChartReport"]);

export function chartFromToolCalls(
  calls: Array<{ handlerMapping: string; status: string; resultJson?: string }>,
): AnswerChart | undefined {
  let found: AnswerChart | undefined;
  for (const call of calls) {
    // A chart sent at a time shows what it would hold today, under its offer (sees-side-panel-plan, phase 5).
    if (!CHARTING.has(call.handlerMapping) || call.status !== "SUCCESS") continue;
    // The runtime wraps a handler's answer as { status, data }.
    const data = (parse(call.resultJson) as { data?: { ok?: boolean; chart?: unknown } } | undefined)?.data;
    if (data?.ok !== false && isChart(data?.chart)) found = data.chart;
  }
  return found;
}

/**
 * An answer's words either side of where its chart goes: the words before
 * the mark, and after it. With no mark, every word comes first and the chart
 * after them. The mark itself is never shown, even while the answer is still
 * being written and only its first letters have arrived.
 */
export function splitAtChart(text: string): { before: string; after: string } {
  const at = text.indexOf(CHART_MARK);
  if (at < 0) {
    for (let length = CHART_MARK.length - 1; length >= 2; length -= 1) {
      if (text.endsWith(CHART_MARK.slice(0, length))) return { before: text.slice(0, -length).trimEnd(), after: "" };
    }
    return { before: text, after: "" };
  }
  return { before: text.slice(0, at).trimEnd(), after: text.slice(at + CHART_MARK.length).replaceAll(CHART_MARK, "").trimStart() };
}

/**
 * The days from `from` to `to` lined up with the same number before them, a
 * day with no figures counting as none. With no days before (`null`), or for
 * a day whose day before is older than Search Console's history
 * (`heldFrom`), there is no figure before it, rather than a false nothing.
 */
export function chartPoints(
  days: Array<{ day: string; value: number }>,
  before: Array<{ day: string; value: number }> | null,
  range: { from: string; to: string; beforeFrom: string; heldFrom?: string },
): DaysChart["points"] {
  const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
  const values = new Map(days.map((entry) => [entry.day, entry.value]));
  const earlier = new Map((before ?? []).map((entry) => [entry.day, entry.value]));
  const points: DaysChart["points"] = [];
  for (let day = range.from, index = 0; day <= range.to && index < MOST_CHART_DAYS; day = shift(day, 1), index += 1) {
    const then = shift(range.beforeFrom, index);
    const held = before !== null && (!range.heldFrom || then >= range.heldFrom);
    points.push({ day, value: values.get(day) ?? 0, ...(held ? { before: earlier.get(then) ?? 0 } : {}) });
  }
  return points;
}

/**
 * The conversion a rate is of when none is named, as Conversions' own "Conversion rate" box picks it: a shop's
 * purchase, else the conversion done most over the days. Never every conversion over the visits, which counts a
 * basket, a checkout and a purchase three times (Anthony's page: 3.4%, where every conversion gave about 80).
 */
export function mainConversionAt(
  events: readonly string[],
  points: ReadonlyArray<{ events: readonly number[]; eventVisits?: readonly number[] }>,
): number | null {
  const totals = events.map((_, at) => points.reduce((sum, point) => sum + (point.eventVisits?.[at] ?? point.events[at] ?? 0), 0));
  const purchase = events.indexOf("purchase");
  if (purchase >= 0 && totals[purchase] > 0) return purchase;
  let best: number | null = null;
  totals.forEach((total, at) => {
    if (total > 0 && (best === null || total > totals[best])) best = at;
  });
  return best;
}

/**
 * Analytics' days as one measure's values: visits; conversions — every counted one, or one event's, in times — or
 * the share of the day's visits that converted, in percent (the event's visits, else every conversion). Worked
 * out here, never by the model.
 */
export function analyticsChartValues(
  points: ReadonlyArray<{ day: string; visits: number; conversions: number; events: readonly number[]; eventVisits?: readonly number[]; eventTimes?: readonly number[] }>,
  measure: AnalyticsChartMeasure,
  eventAt: number | null,
): Array<{ day: string; value: number }> {
  return points.map((point) => {
    const times = eventAt === null ? point.conversions : point.eventTimes?.[eventAt] ?? point.events[eventAt] ?? 0;
    const did = eventAt === null ? point.conversions : point.eventVisits?.[eventAt] ?? point.events[eventAt] ?? 0;
    const value = measure === "visits" ? point.visits : measure === "conversions" ? times : point.visits > 0 ? Math.round((did / point.visits) * 1000) / 10 : 0;
    return { day: point.day, value };
  });
}
