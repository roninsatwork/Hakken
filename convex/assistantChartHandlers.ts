import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { shiftDay } from "./searchConsoleDays";
import { ANALYTICS_CHART_MEASURES, CHART_MARK, analyticsChartValues, mainConversionAt, chartPoints, type AnalyticsChartMeasure, type AnswerChart, type ChartMeasure } from "./utils/assistantCharts";
import { isCalendarPeriod, type CalendarPeriod } from "./utils/calendarPeriods";
import { CLARITY_GROUP_MEASURES, GROUP_CHART_BY, GROUP_CHART_KINDS, SEARCH_GROUP_MEASURES, VISIBILITY_GROUP_MEASURES, groupsChartLines, type GroupChartBy, type GroupChartKind, type GroupMeasure, type GroupSource, type GroupsChart } from "./utils/assistantGroupCharts";

/**
 * The Assistant's chart (docs/plans/active/hakken-tasks-plan.md, item 2.1),
 * registered with the rest in `aiToolExecutionService.ts`: `show_chart` names
 * the look-up and the measure, and gets back the chart drawn under its answer
 * — a website's or a page's visitors or impressions each day, against as
 * many days before — from the figures the look-up reads, never from the
 * model. A read: it changes nothing, and any member may ask for one.
 */

const NO_COMPANY = { ok: false, problem: "This conversation belongs to no company, so there are no figures to chart here." };

/**
 * The look-ups a chart can draw from: Search Console's days, and Google Analytics' (2026-10-31); Bing's, Clarity's
 * and Visibility's saved figures as charts of groups (ask-hakken-every-chart-plan-2026-10-31.md, the last sources).
 */
const LOOKUPS = new Set(["search_console", "google_analytics", "bing", "clarity", "visibility"]);
/** Look-ups drawn only as charts of groups: they keep no line a day for a chart. */
const GROUPS_ONLY: Record<string, GroupSource> = { bing: "bing", clarity: "clarity", visibility: "visibility" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function text(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Search Console's own periods: the nearest of 7, 30 and 90 days. */
function period(value: unknown): 7 | 30 | 90 {
  const days = typeof value === "number" && Number.isFinite(value) ? value : 30;
  return days <= 14 ? 7 : days <= 60 ? 30 : 90;
}

type Range = { from: string; to: string; beforeFrom: string; beforeTo: string };

/** The days drawn: a calendar month and the month before it, or the newest 7, 30 or 90 days and as many before. */
function rangeOf(args: Record<string, unknown>, newestDay: string): Range | { problem: string } {
  const month = text(args, "month");
  if (month) {
    if (!MONTH.test(month)) return { problem: "Say the month as YYYY-MM, for example 2026-09." };
    const from = `${month}-01`;
    if (from > newestDay) return { problem: `Search Console has no figures for ${month} yet: its newest day is ${newestDay}.` };
    const lastOfMonth = shiftDay(`${shiftDay(`${month}-28`, 4).slice(0, 7)}-01`, -1);
    const beforeTo = shiftDay(from, -1);
    return { from, to: lastOfMonth < newestDay ? lastOfMonth : newestDay, beforeFrom: `${beforeTo.slice(0, 7)}-01`, beforeTo };
  }
  const days = period(args.days);
  const from = shiftDay(newestDay, -(days - 1));
  return { from, to: newestDay, beforeFrom: shiftDay(from, -days), beforeTo: shiftDay(from, -1) };
}

const valueOf = (measure: ChartMeasure) => (day: { day: string; clicks: number; impressions: number }) => ({
  day: day.day,
  value: measure === "visitors" ? day.clicks : day.impressions,
});

const sum = (days: Array<{ value: number }>) => days.reduce((total, day) => total + day.value, 0);

export const ASSISTANT_CHART_HANDLERS: Record<string, (input: ToolHandlerExecutionInput) => Promise<unknown>> = {
  "assistant.chart": async (input) => {
    if (!input.companyId) return NO_COMPANY;
    const lookup = text(input.args, "lookup") ?? "search_console";
    if (!LOOKUPS.has(lookup)) {
      return { ok: false, problem: "Charts draw from search_console (visitors, impressions), google_analytics (visits, conversions, conversionRate), bing (clicks, impressions), clarity (visits, scroll, quickBacks, rageClicks, deadClicks, errors) or visibility (estimatedVisitors, searches, topThree, linkingWebsites)." };
    }
    if (lookup === "google_analytics") return await analyticsChart(input);
    if (GROUPS_ONLY[lookup]) {
      const groups = await analyticsGroupsChartFor(input);
      return groups.ok ? groups.answer : groups;
    }
    // Search Console's groups as a chart of their own kind (the plan's gaps): searches, pages, countries, devices.
    const kind = text(input.args, "kind");
    if (kind && kind !== "line") {
      const groups = await analyticsGroupsChartFor(input);
      return groups.ok ? groups.answer : groups;
    }
    const website = text(input.args, "website");
    if (!website) return { ok: false, problem: "Say which of the company's websites to chart." };
    const measure = (text(input.args, "measure") ?? "visitors") as ChartMeasure;
    if (measure !== "visitors" && measure !== "impressions") {
      return { ok: false, problem: "A chart shows visitors from Google, or how often it showed up in Google (impressions)." };
    }
    const page = text(input.args, "page");

    const resolved = await input.ctx.runQuery(internal.hakkenTaskFigures.resolveTargetInternal, {
      companyId: input.companyId, website, ...(page ? { page } : {}),
    });
    if (!resolved.ok) return { ok: false, problem: resolved.problem };
    const range = rangeOf(input.args, resolved.newestDay);
    if ("problem" in range) return { ok: false, problem: range.problem };

    // The days before are drawn only where Search Console's history reaches.
    const heldFrom = resolved.oldestDay;
    const beforeHeld = !heldFrom || range.beforeTo >= heldFrom;
    const [now, before] = await Promise.all([
      input.ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, { companyId: input.companyId, target: resolved.target, from: range.from, to: range.to }),
      beforeHeld
        ? input.ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, {
            companyId: input.companyId, target: resolved.target, from: heldFrom && range.beforeFrom < heldFrom ? heldFrom : range.beforeFrom, to: range.beforeTo,
          })
        : Promise.resolve({ ok: true as const, days: [] }),
    ]);
    if (!now.ok) return { ok: false, problem: now.problem };
    const days = now.days.map(valueOf(measure));
    const earlier = beforeHeld && before.ok ? before.days.map(valueOf(measure)) : null;
    const link = `/app/search-console/${resolved.target.companyWebsiteId}${resolved.target.page ? "/pages" : ""}`;

    const chart: AnswerChart = {
      look: "searchConsoleDays",
      measure,
      website: resolved.target.website,
      ...(resolved.target.page ? { page: resolved.target.page } : {}),
      ...range,
      points: chartPoints(days, earlier, { ...range, ...(heldFrom ? { heldFrom } : {}) }),
      link,
    };
    return {
      ok: true,
      website: resolved.target.website,
      ...(resolved.target.page ? { page: resolved.target.page } : {}),
      measure: measure === "visitors" ? "visitors from Google (Search Console clicks)" : "times shown in Google (impressions)",
      from: range.from,
      to: range.to,
      total: sum(days),
      ...(earlier ? { theDaysBefore: { from: range.beforeFrom, to: range.beforeTo, total: sum(earlier) } } : {}),
      link,
      note: `The chart is drawn under your answer from these figures, with a link to the screen. Write ${CHART_MARK} on a line of its own where it belongs, after the sentences it illustrates; don't list the days or describe the chart.`,
      chart,
    };
  },
};

/**
 * The chart from Google Analytics' days (sees-side-panel-plan-2026-10-31.md, phase 4): visits, conversions (every
 * one, or one event's) or the share of visits that converted, each day of a calendar period, against the period
 * before where Analytics keeps it as days. The figures are the reads' own, worked out in code.
 */
async function analyticsChart(input: ToolHandlerExecutionInput): Promise<unknown> {
  // A chart of groups — bars, stacked bars, a pie, a scatter or a grid (ask-hakken-every-chart-plan-2026-10-31.md).
  const kind = text(input.args, "kind");
  if (kind && kind !== "line") {
    const groups = await analyticsGroupsChartFor(input);
    return groups.ok ? groups.answer : groups;
  }
  const found = await analyticsChartFor(input);
  return found.ok ? found.answer : found;
}

/** What a chart of groups shows, in words for the model: "visits", "purchase, as visits that did it". */
/** Google counts Sunday as 0. */
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Clarity's measures in words for the model. */
const CLARITY_MEASURE_WORDS: Record<string, string> = {
  visits: "visits Clarity recorded", scroll: "the average share of the page scrolled, in percent", quickBacks: "the share of visits that went straight back, in percent",
  rageClicks: "the share of visits with an angry (rage) click, in percent", deadClicks: "the share of visits with a dead click, in percent", errors: "the share of visits that hit an error, in percent",
};
/** Visibility's measures in words for the model: the supplier's estimates, never named to the client. */
const VISIBILITY_MEASURE_WORDS: Record<string, string> = {
  estimatedVisitors: "estimated visitors a month from Google", searches: "searches it ranks for on Google", topThree: "searches it is in Google's top 3 for", linkingWebsites: "websites linking to it",
};

function groupsMeasureWords(chart: GroupsChart): string {
  const event = chart.event === "*" ? "any conversion" : chart.event ? chart.event.replace(/_/g, " ") : null;
  if (chart.look === "searchConsoleGroups" || chart.look === "bingGroups") {
    const engine = chart.look === "bingGroups" ? "Bing" : "Google";
    if (chart.kind === "scatter") return `each group's times shown in ${engine}, and the share of them clicked, in percent`;
    const what = chart.measure === "impressions" ? `times shown in ${engine}` : `clicks from ${engine}`;
    return chart.kind === "stacked" || chart.kind === "pie" ? `each group's share of ${what}, in percent` : what;
  }
  if (chart.look === "clarityGroups") {
    if (chart.kind === "grid") return "for each group (across), each measure (down) in percent: scroll is the average share of the page scrolled; quickBacks, rageClicks, deadClicks and errors are shares of its visits";
    if (chart.kind === "scatter") return `each group's visits, and ${CLARITY_MEASURE_WORDS[chart.measure]}`;
    if (chart.kind === "stacked" || chart.kind === "pie") return "each group's share of the visits Clarity recorded, in percent";
    return CLARITY_MEASURE_WORDS[chart.measure] ?? chart.measure;
  }
  if (chart.look === "visibilityGroups") {
    if (chart.by === "position") return chart.kind === "bars" ? "the website's searches in each band of Google positions" : "each band's share of the searches the website ranks for, in percent";
    if (chart.kind === "grid") return "each website's (down) searches in each band of Google positions (across)";
    if (chart.kind === "scatter") return "each website's searches ranked for (as visits), and its estimated visitors a month from Google (as value)";
    const what = VISIBILITY_MEASURE_WORDS[chart.measure] ?? chart.measure;
    return chart.kind === "stacked" || chart.kind === "pie" ? `each website's share of the group's ${what}, in percent` : what;
  }
  if (chart.by === "hour") return `the times ${event} happened in each four hours of each weekday, added up over the period`;
  if (chart.kind === "stacked" || chart.kind === "pie") return chart.measure === "visits" ? "each group's share of visits, in percent" : `each group's share of the visits that did ${event}, in percent`;
  if (chart.kind === "grid") return "the share of each group's visits that did each conversion, in percent";
  if (chart.kind === "scatter") return `each group's visits, and the share of them that did ${event}, in percent`;
  return chart.measure === "visits" ? "visits" : chart.measure === "conversions" ? `visits that did ${event}` : `the share of visits that did ${event}, in percent`;
}

/**
 * A chart of a website's groups over a calendar period (phase 1): its channels, kinds of page, devices or countries,
 * from the Conversions map's figures, as the kind asked draws them. Exported for a chart sent at a time.
 */
export async function analyticsGroupsChartFor(input: ToolHandlerExecutionInput): Promise<
  | { ok: false; problem: string }
  | { ok: true; siteId: Id<"companyWebsites">; host: string; period: CalendarPeriod; chart: GroupsChart; answer: Record<string, unknown> }
> {
  const website = text(input.args, "website");
  if (!website) return { ok: false, problem: "Say which of the company's websites to chart." };
  // Bing, Clarity and Visibility keep no line a day for a chart: bars, unless another kind is asked for.
  const saidKind = text(input.args, "kind");
  const kind = (GROUPS_ONLY[text(input.args, "lookup") ?? ""] && (!saidKind || saidKind === "line") ? "bars" : saidKind) as GroupChartKind | undefined;
  if (!kind || !(GROUP_CHART_KINDS as readonly string[]).includes(kind)) return { ok: false, problem: `kind is one of line, ${GROUP_CHART_KINDS.join(", ")}.` };
  // Searches are Search Console's unless Bing is named; so is any chart its look-up names.
  const lookup = text(input.args, "lookup");
  const source: GroupSource = GROUPS_ONLY[lookup ?? ""] ?? (lookup === "search_console" || text(input.args, "by") === "query" ? "searchConsole" : "analytics");
  const firstBy: Record<GroupSource, GroupChartBy> = { analytics: "channel", searchConsole: "query", bing: "query", clarity: "device", visibility: "website" };
  const by = (text(input.args, "by") ?? firstBy[source]) as GroupChartBy;
  if (!(GROUP_CHART_BY as readonly string[]).includes(by)) return { ok: false, problem: `by is one of ${GROUP_CHART_BY.join(", ")}.` };
  const said = text(input.args, "measure");
  const firstMeasure: Record<GroupSource, GroupMeasure> = { analytics: "visits", searchConsole: "clicks", bing: "clicks", clarity: "visits", visibility: "estimatedVisitors" };
  const measure = (said === "visitors" ? (source === "visibility" ? "estimatedVisitors" : "clicks") : said ?? firstMeasure[source]) as GroupMeasure;
  const measures: Record<GroupSource, readonly string[]> = {
    analytics: ANALYTICS_CHART_MEASURES, searchConsole: SEARCH_GROUP_MEASURES, bing: SEARCH_GROUP_MEASURES, clarity: ["visits", ...CLARITY_GROUP_MEASURES], visibility: VISIBILITY_GROUP_MEASURES,
  };
  if (!measures[source].includes(measure)) return { ok: false, problem: `From ${lookup ?? source} a chart of groups shows ${measures[source].join(", ")}.` };
  const period = text(input.args, "period") ?? "lastMonth";
  if (!isCalendarPeriod(period)) return { ok: false, problem: "period is one of thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months, last12Months." };
  const event = text(input.args, "event");
  const read = await input.ctx.runQuery(internal.assistantGroupChartReads.groupsChartInternal, { companyId: input.companyId!, website, period, kind, by, measure, ...(event ? { event } : {}), source });
  if (!read.ok) return { ok: false, problem: read.problem ?? "That website has no figures for that chart yet." };
  const chart = read.chart;
  const answer = {
    ok: true,
    website: read.host,
    period,
    shows: groupsMeasureWords(chart),
    by,
    groups: groupsChartLines(chart),
    ...(chart.asOf ? { checkedOn: chart.asOf } : {}),
    ...(chart.rows ? { rows: chart.rows.map((row) => (chart.by === "hour" ? { weekday: WEEKDAY_NAMES[Number(row.event)], times: row.values }
      : chart.look === "clarityGroups" ? { measure: row.event, percents: row.values }
        : chart.look === "visibilityGroups" ? { website: row.event, searchesByPosition: row.values }
          : { conversion: row.event, rates: row.values })) } : {}),
    link: chart.link,
    note: `The chart is drawn under your answer from these figures, with a link to the screen. Write ${CHART_MARK} on a line of its own where it belongs, after the sentences it illustrates; don't list every group or describe the chart.`,
    chart,
  };
  return { ok: true, siteId: read.siteId, host: read.host, period, chart, answer };
}

/**
 * The same chart, and the website it is of, for a chart sent at a time (phase 5): the proposal shows what it would
 * hold today, and keeps the website for the task.
 */
export async function analyticsChartFor(input: ToolHandlerExecutionInput): Promise<
  | { ok: false; problem: string }
  | { ok: true; siteId: Id<"companyWebsites">; host: string; period: CalendarPeriod; measure: AnalyticsChartMeasure; event?: string; chart: AnswerChart; answer: Record<string, unknown> }
> {
  const website = text(input.args, "website");
  if (!website) return { ok: false, problem: "Say which of the company's websites to chart." };
  const measure = (text(input.args, "measure") ?? "visits") as AnalyticsChartMeasure;
  if (!(ANALYTICS_CHART_MEASURES as readonly string[]).includes(measure)) return { ok: false, problem: "From Google Analytics a chart shows visits, conversions or conversionRate." };
  const period = text(input.args, "period") ?? "lastMonth";
  if (!isCalendarPeriod(period)) return { ok: false, problem: "period is one of thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months, last12Months." };
  const read = await input.ctx.runQuery(internal.assistantAnalyticsCharts.analyticsChartInternal, { companyId: input.companyId!, website, period });
  if (!read.ok) return { ok: false, problem: read.problem ?? "That website has no Google Analytics days yet." };
  // A rate is always of one conversion: the one named, else the page's own (a shop's purchase, else the biggest).
  const named = measure === "visits" ? undefined : text(input.args, "event");
  const main = measure === "conversionRate" && !named ? mainConversionAt(read.events, read.points) : null;
  const event = named ?? (main !== null ? read.events[main] : undefined);
  const eventAt = event ? read.events.indexOf(event) : null;
  if (event && eventAt === -1) return { ok: false, problem: `${event} is not one of the conversions this website counts: ${read.events.join(", ")}.` };
  const days = analyticsChartValues(read.points, measure, eventAt);
  // The period before is laid over the period's days by its read (`shift`): its own dates are moved back, so the
  // chart's second line says when it was.
  const earlier = read.before.held && read.before.points.length > 0
    ? analyticsChartValues(read.before.points, measure, eventAt).map((point) => ({ ...point, day: shiftDay(point.day, -read.before.shift) }))
    : null;
  const range = {
    from: days[0].day,
    to: days[days.length - 1].day,
    beforeFrom: earlier ? earlier[0].day : days[0].day,
    beforeTo: earlier ? earlier[earlier.length - 1].day : days[0].day,
  };
  const link = `/app/analytics/${read.siteId}/conversions?period=${period}`;
  const chart: AnswerChart = {
    look: "analyticsDays",
    measure,
    ...(event ? { event } : {}),
    website: read.host,
    ...range,
    points: chartPoints(days, earlier, range),
    link,
  };
  const total = measure === "conversionRate" ? undefined : sum(days);
  const answer = {
    ok: true,
    website: read.host,
    measure: measure === "visits" ? "visits" : measure === "conversions" ? `conversions${event ? ` (${event})` : ""}` : `share of visits that converted${event ? ` (${event})` : ""}, in percent`,
    from: range.from,
    to: range.to,
    ...(total !== undefined ? { total } : {}),
    ...(earlier && total !== undefined ? { theDaysBefore: { from: range.beforeFrom, to: range.beforeTo, total: sum(earlier) } } : {}),
    link,
    note: `The chart is drawn under your answer from these figures, with a link to the screen. Write ${CHART_MARK} on a line of its own where it belongs, after the sentences it illustrates; don't list the days or describe the chart.`,
    chart,
  };
  return { ok: true, siteId: read.siteId, host: read.host, period, measure, ...(event ? { event } : {}), chart, answer };
}
