import { analyticsChartValues, type AnalyticsChartMeasure } from "./assistantCharts";
import { weekdayName } from "./hakkenReports";
import type { GroupChartBy, GroupChartKind } from "./assistantGroupCharts";

/**
 * A chart sent at a time (sees-side-panel-plan-2026-10-31.md, phase 5; Anthony: "send me a chart at 10am tomorrow
 * with my new conversion rates … this is handle tasks"): what it shows, worked out in code from Google Analytics'
 * days — each day's value for the bars, the whole period's figure for the email's headline, and the period before's
 * — and its title as the Hakken tasks page shows it. Free of any Convex function, so the proposal, the Stat Report
 * Agent and the screens agree.
 */

export type ChartReportSpec = {
  look: "analyticsChart";
  measure: AnalyticsChartMeasure;
  event?: string;
  period: string;
  every: "week" | "once";
  weekday: number;
  sendOn?: string;
  /** A chart of groups' kind and groups (ask-hakken-every-chart-plan-2026-10-31.md); absent for a line a day. */
  kind?: GroupChartKind;
  by?: GroupChartBy;
};

type Day = { day: string; visits: number; conversions: number; events: readonly number[]; eventVisits?: readonly number[]; eventTimes?: readonly number[] };

/** What one period says: its days' values, and its whole figure — a total, or for the rate the visits that converted over all its visits. */
function whole(points: readonly Day[], measure: AnalyticsChartMeasure, eventAt: number | null) {
  const values = analyticsChartValues(points, measure, eventAt);
  if (measure !== "conversionRate") return { values, figure: values.reduce((sum, day) => sum + day.value, 0) };
  const visits = points.reduce((sum, day) => sum + day.visits, 0);
  const did = points.reduce((sum, day) => sum + (eventAt === null ? day.conversions : day.eventVisits?.[eventAt] ?? day.events[eventAt] ?? 0), 0);
  return { values, figure: visits > 0 ? Math.round((did / visits) * 1000) / 10 : 0 };
}

/** The chart's figures: each day's value, the period's figure, and the period before's when it is held. */
export function chartReportFigures(points: readonly Day[], before: readonly Day[] | null, measure: AnalyticsChartMeasure, eventAt: number | null) {
  const now = whole(points, measure, eventAt);
  const then = before && before.length > 0 ? whole(before, measure, eventAt) : null;
  return {
    from: points[0]?.day ?? "",
    to: points[points.length - 1]?.day ?? "",
    values: now.values.map((day) => day.value),
    figure: now.figure,
    ...(then ? { figureBefore: then.figure } : {}),
  };
}

const BY_WORDS: Record<GroupChartBy, string> = { channel: "channel", kind: "kind of page", device: "device", country: "country" };

/** A chart of groups in plain English words, as the tasks page lists it: "a pie of visits by device". */
function groupsWhat(report: Pick<ChartReportSpec, "measure" | "event"> & { kind: GroupChartKind; by: GroupChartBy }): string {
  const of = BY_WORDS[report.by];
  const did = report.event === "purchase" ? "made a purchase" : `did ${(report.event ?? "").replace(/_/g, " ")}`;
  if (report.kind === "grid") return `a grid of the share of visits that did each step, by ${of}`;
  if (report.kind === "scatter") return `a scatter of visits against the share that ${did}, by ${of}`;
  if (report.kind === "stacked") return `stacked bars of each ${of}'s share of visits${report.measure === "visits" ? "" : ` that ${did}`}`;
  if (report.kind === "pie") return `a pie of visits${report.measure === "visits" ? "" : ` that ${did}`} by ${of}`;
  return `bars of ${report.measure === "visits" ? "visits" : report.measure === "conversions" ? `visits that ${did}` : `the share of visits that ${did}`} by ${of}`;
}

/** What the chart shows, in plain English words: "visits", "conversions", "purchase", "the share of visits that did add to cart". */
export function chartWhat(report: Pick<ChartReportSpec, "measure" | "event">): string {
  const event = report.event ? report.event.replace(/_/g, " ") : null;
  if (report.measure === "visits") return "visits";
  if (report.measure === "conversions") return event ? `${event} each day` : "conversions";
  if (report.event === "purchase") return "the share of visits that made a purchase";
  return event ? `the share of visits that did ${event}` : "the share of visits that converted";
}

/** The chart in plain words, as the Hakken tasks page lists it: "Every Monday, send me a chart of visits". */
export function chartReportTitle(report: ChartReportSpec): string {
  const lead = report.every === "once"
    ? `On ${report.sendOn ? new Date(`${report.sendOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "its day"}`
    : `Every ${weekdayName(report.weekday)}`;
  return report.kind && report.by ? `${lead}, send me ${groupsWhat({ ...report, kind: report.kind, by: report.by })}` : `${lead}, send me a chart of ${chartWhat(report)}`;
}
