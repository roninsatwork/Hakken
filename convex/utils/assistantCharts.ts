import { v, type Infer } from "convex/values";

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

/** Where in its words the answer wants the chart: on a line of its own. Drawn at the end when the answer does not say. */
export const CHART_MARK = "{{chart}}";

export const answerChartValidator = v.object({
  look: v.literal("searchConsoleDays"),
  measure: v.union(v.literal("visitors"), v.literal("impressions")),
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

export type AnswerChart = Infer<typeof answerChartValidator>;

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

function isChart(value: unknown): value is AnswerChart {
  if (!value || typeof value !== "object") return false;
  const chart = value as Record<string, unknown>;
  return (
    chart.look === "searchConsoleDays"
    && (chart.measure === "visitors" || chart.measure === "impressions")
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
export function chartFromToolCalls(
  calls: Array<{ handlerMapping: string; status: string; resultJson?: string }>,
): AnswerChart | undefined {
  let found: AnswerChart | undefined;
  for (const call of calls) {
    if (call.handlerMapping !== "assistant.chart" || call.status !== "SUCCESS") continue;
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
): AnswerChart["points"] {
  const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
  const values = new Map(days.map((entry) => [entry.day, entry.value]));
  const earlier = new Map((before ?? []).map((entry) => [entry.day, entry.value]));
  const points: AnswerChart["points"] = [];
  for (let day = range.from, index = 0; day <= range.to && index < MOST_CHART_DAYS; day = shift(day, 1), index += 1) {
    const then = shift(range.beforeFrom, index);
    const held = before !== null && (!range.heldFrom || then >= range.heldFrom);
    points.push({ day, value: values.get(day) ?? 0, ...(held ? { before: earlier.get(then) ?? 0 } : {}) });
  }
  return points;
}
