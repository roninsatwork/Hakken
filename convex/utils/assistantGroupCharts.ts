import { v, type Infer } from "convex/values";
import type { AnalyticsChartMeasure } from "./assistantCharts";

/**
 * Ask Hakken's charts of groups (ask-hakken-every-chart-plan-2026-10-31.md, phase 1; Anthony: "i want to do every
 * type of chart"): a website's channels, kinds of page, devices or countries over a calendar period, drawn as bars,
 * stacked bars, a pie, a scatter or a grid — from the Conversions map's own figures (`agentReads.readMapView`),
 * worked out here, never by the model. Plain code, free of any Convex function, so the server, the screens and the
 * email read the same shape.
 */

export const GROUP_CHART_KINDS = ["bars", "stacked", "pie", "scatter", "grid"] as const;
export type GroupChartKind = (typeof GROUP_CHART_KINDS)[number];
/**
 * The groups a chart can be of. From Google Analytics: channel, kind of page, device, country, landing page (`page`)
 * and — a grid alone — hour of each weekday (`hour`). From Search Console: the search (`query`), page, country or
 * device (the plan's gaps, built 2026-10-31).
 */
export const GROUP_CHART_BY = ["channel", "kind", "device", "country", "page", "hour", "query"] as const;
export type GroupChartBy = (typeof GROUP_CHART_BY)[number];
/** Search Console's measures for a chart of groups: clicks (visitors from Google) and impressions (times shown). */
export const SEARCH_GROUP_MEASURES = ["clicks", "impressions"] as const;
export type SearchGroupMeasure = (typeof SEARCH_GROUP_MEASURES)[number];
export type GroupMeasure = AnalyticsChartMeasure | SearchGroupMeasure;

export const groupsChartValidator = v.object({
  look: v.union(v.literal("analyticsGroups"), v.literal("searchConsoleGroups")),
  kind: v.union(...GROUP_CHART_KINDS.map((kind) => v.literal(kind))),
  by: v.union(...GROUP_CHART_BY.map((by) => v.literal(by))),
  measure: v.union(v.literal("visits"), v.literal("conversions"), v.literal("conversionRate"), v.literal("clicks"), v.literal("impressions")),
  /** The conversion a count or rate is of, by its Google name; a scatter's and a grid's main one. */
  event: v.optional(v.string()),
  website: v.string(),
  /** The calendar period the figures cover, and its dates. */
  period: v.string(),
  /** Each group, in the order drawn: its figure, the period before's, and — a scatter's other axis — its visits. */
  groups: v.array(v.object({ name: v.string(), value: v.number(), before: v.optional(v.number()), visits: v.optional(v.number()) })),
  /** A grid's rows: each conversion, its rate in each group (`null` where the group has no visits), groups in order. */
  rows: v.optional(v.array(v.object({ event: v.string(), values: v.array(v.union(v.number(), v.null())) }))),
  /** The screen the figures came from. */
  link: v.string(),
});
export type GroupsChart = Infer<typeof groupsChartValidator>;

/** What the map's view holds, as `readMapView` returns it. */
export type GroupsView = {
  visits: ReadonlyArray<{ column: string; visits: number; visitsBefore?: number }>;
  conversions: ReadonlyArray<{
    event: string;
    visitsThatDidIt: number;
    by: ReadonlyArray<{ column: string; visitsThatDidIt: number; visitsThatDidItBefore?: number; ratePercent: number | null; ratePercentBefore?: number | null }>;
  }>;
};

/** Columns that are no group a person can act on: drawn in shares as part of "every other", never on their own. */
const NOT_A_GROUP = new Set(["no page recorded", "other kinds of page", "unclassified", "(not set)", "(other)"]);
/** Groups a chart draws at most, by kind; a share's smaller groups go together as one. */
const MOST: Record<GroupChartKind, number> = { bars: 10, stacked: 5, pie: 5, scatter: 20, grid: 12 };
/** Conversions a grid's rows hold at most: the main one first. */
const MOST_ROWS = 6;
/** A group's rate is drawn only with visits enough to trust: this share of the website's, or this many (as the findings weigh it). */
const TRUSTED_SHARE = 0.02;
const TRUSTED_VISITS = 100;
/** The name a share's smaller groups take together. */
export const EVERY_OTHER = "*";

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The chart of groups asked for, or why there is none: the measure each kind can draw, the conversion it is of (the
 * one named, else a shop's purchase, else the busiest), and its groups as the kind draws them.
 */
export function groupsChartFrom(
  view: GroupsView,
  ask: { kind: GroupChartKind; by: GroupChartBy; measure: AnalyticsChartMeasure; event?: string; website: string; period: string; link: string },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  const siteVisits = view.visits.reduce((sum, one) => sum + one.visits, 0);
  if (siteVisits <= 0) return { ok: false, problem: "That website has no visits in those dates." };
  const events = view.conversions.map((one) => one.event);
  // The conversion a chart is of when none is named, as Conversions' box picks it (`mainConversionAt`): a shop's
  // purchase, else the one done most.
  const busiest = [...view.conversions].filter((one) => one.visitsThatDidIt > 0).sort((a, b) => b.visitsThatDidIt - a.visitsThatDidIt)[0];
  const purchase = view.conversions.find((one) => one.event === "purchase" && one.visitsThatDidIt > 0);
  const main = purchase ? events.indexOf(purchase.event) : busiest ? events.indexOf(busiest.event) : null;
  const named = ask.event;
  if (named && !events.includes(named)) return { ok: false, problem: `${named} is not one of the conversions this website counts: ${events.join(", ")}.` };
  // Shares are of visits or of conversions; a scatter and a grid are always rates.
  const measure: AnalyticsChartMeasure = ask.kind === "scatter" || ask.kind === "grid" ? "conversionRate"
    : (ask.kind === "stacked" || ask.kind === "pie") && ask.measure === "conversionRate" ? "visits" : ask.measure;
  const event = measure === "visits" && ask.kind !== "grid" ? undefined : named ?? (main !== null ? events[main] : undefined);
  if (measure !== "visits" && !event) return { ok: false, problem: "That website counts no conversions in those dates." };
  const row = event ? view.conversions.find((one) => one.event === event) : undefined;
  const cellOf = (column: string) => row?.by.find((cell) => cell.column === column);
  const trusted = Math.max(TRUSTED_VISITS, Math.round(siteVisits * TRUSTED_SHARE));
  const hasBefore = view.visits.some((one) => one.visitsBefore !== undefined);
  const base = { look: "analyticsGroups" as const, kind: ask.kind, by: ask.by, measure, ...(event ? { event } : {}), website: ask.website, period: ask.period, link: ask.link };
  const groups = view.visits.filter((one) => !NOT_A_GROUP.has(one.column.toLowerCase()));

  if (ask.kind === "stacked" || ask.kind === "pie") {
    // Each group's share of the whole, the period before's beside it; the smaller ones and those no one can act on together.
    const of = (one: (typeof view.visits)[number], before: boolean) => measure === "visits"
      ? (before ? one.visitsBefore ?? 0 : one.visits)
      : (before ? cellOf(one.column)?.visitsThatDidItBefore ?? 0 : cellOf(one.column)?.visitsThatDidIt ?? 0);
    const whole = view.visits.reduce((sum, one) => sum + of(one, false), 0);
    const wholeBefore = hasBefore ? view.visits.reduce((sum, one) => sum + of(one, true), 0) : 0;
    if (whole <= 0) return { ok: false, problem: "Nothing to share out in those dates." };
    const top = [...groups].sort((a, b) => of(b, false) - of(a, false)).slice(0, MOST[ask.kind]).filter((one) => of(one, false) > 0);
    const share = (part: number, all: number) => (all > 0 ? round1((part / all) * 100) : 0);
    const shown = top.map((one) => ({ name: one.column, value: share(of(one, false), whole), ...(wholeBefore > 0 ? { before: share(of(one, true), wholeBefore) } : {}) }));
    const restNow = whole - top.reduce((sum, one) => sum + of(one, false), 0);
    const restBefore = wholeBefore - top.reduce((sum, one) => sum + of(one, true), 0);
    const rest = restNow > 0 ? [{ name: EVERY_OTHER, value: share(restNow, whole), ...(wholeBefore > 0 ? { before: share(Math.max(0, restBefore), wholeBefore) } : {}) }] : [];
    return { ok: true, chart: { ...base, groups: [...shown, ...rest] } };
  }

  if (ask.kind === "grid") {
    // Groups across, by visits; conversions down, the main one first then the busiest; each square a rate.
    const columns = [...groups].sort((a, b) => b.visits - a.visits).slice(0, MOST.grid);
    const order = [...view.conversions].sort((a, b) => (a.event === event ? -1 : b.event === event ? 1 : b.visitsThatDidIt - a.visitsThatDidIt)).filter((one) => one.visitsThatDidIt > 0).slice(0, MOST_ROWS);
    if (columns.length === 0 || order.length === 0) return { ok: false, problem: "Nothing to lay out in those dates." };
    return {
      ok: true,
      chart: {
        ...base,
        groups: columns.map((one) => ({ name: one.column, value: one.visits, ...(one.visitsBefore !== undefined ? { before: one.visitsBefore } : {}) })),
        rows: order.map((one) => ({ event: one.event, values: columns.map((column) => (column.visits > 0 ? one.by.find((cell) => cell.column === column.column)?.ratePercent ?? 0 : null)) })),
      },
    };
  }

  if (ask.kind === "scatter") {
    // Each group trusted with a rate: its visits across, the share that did the conversion up.
    const points = groups
      .filter((one) => one.visits >= trusted && (cellOf(one.column)?.ratePercent ?? null) !== null)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, MOST.scatter)
      .map((one) => ({ name: one.column, value: cellOf(one.column)!.ratePercent!, visits: one.visits }));
    if (points.length < 2) return { ok: false, problem: "Too few groups have visits enough to set side by side." };
    return { ok: true, chart: { ...base, groups: points } };
  }

  // Bars: each group's figure, the period before's beside it, the biggest first; a rate only where visits can be trusted.
  const valueOf = (one: (typeof view.visits)[number]) => {
    if (measure === "visits") return { value: one.visits, ...(one.visitsBefore !== undefined ? { before: one.visitsBefore } : {}) };
    const cell = cellOf(one.column);
    if (measure === "conversions") return { value: cell?.visitsThatDidIt ?? 0, ...(cell?.visitsThatDidItBefore !== undefined ? { before: cell.visitsThatDidItBefore } : {}) };
    return { value: cell?.ratePercent ?? 0, ...(cell?.ratePercentBefore !== undefined && cell.ratePercentBefore !== null ? { before: cell.ratePercentBefore } : {}) };
  };
  const bars = groups
    .filter((one) => measure !== "conversionRate" || one.visits >= trusted)
    .map((one) => ({ name: one.column, ...valueOf(one) }))
    .filter((one) => one.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MOST.bars);
  if (bars.length === 0) return { ok: false, problem: "Nothing to draw in those dates." };
  return { ok: true, chart: { ...base, groups: bars } };
}

/** A chart of groups' figures as words, for the model to write from and the email to list: "Organic Search: 12,809". */
export function groupsChartLines(chart: GroupsChart): Array<{ name: string; value: number; before?: number; visits?: number }> {
  return chart.groups.map((group) => ({ name: group.name === EVERY_OTHER ? "every other" : group.name, value: group.value, ...(group.before !== undefined ? { before: group.before } : {}), ...(group.visits !== undefined ? { visits: group.visits } : {}) }));
}

/** Search Console's list rows, as `searchConsoleLists.readList` keeps them. */
export type SearchGroupRow = { key: string; clicks: number; impressions: number; ctr: number; previousClicks: number | null };

/**
 * A chart of Search Console's groups (the plan's gaps): searches, pages, countries or devices over the period, from
 * the list Search Console's screens read — clicks or impressions as bars, a pie or stacked bars of shares, or a
 * scatter of times shown against the share clicked. Search Console counts no conversions, so it draws no grid.
 */
export function searchGroupsChartFrom(
  rows: readonly SearchGroupRow[],
  ask: { kind: GroupChartKind; by: GroupChartBy; measure: SearchGroupMeasure; website: string; period: string; link: string },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  if (ask.kind === "grid") return { ok: false, problem: "Search Console counts no conversions, so it has no grid. Ask for bars, stacked, pie or scatter." };
  const named = rows.filter((row) => row.key && !NOT_A_GROUP.has(row.key.toLowerCase()));
  const whole = rows.reduce((sum, row) => sum + row[ask.measure], 0);
  if (whole <= 0) return { ok: false, problem: "Search Console has nothing for those dates." };
  const base = { look: "searchConsoleGroups" as const, kind: ask.kind, by: ask.by, measure: ask.measure, website: ask.website, period: ask.period, link: ask.link };
  const share = (part: number, all: number) => (all > 0 ? round1((part / all) * 100) : 0);
  // Clicks the period before are kept; impressions before are not, so a share before is of clicks only.
  const hasBefore = ask.measure === "clicks" && rows.some((row) => row.previousClicks !== null);
  if (ask.kind === "pie" || ask.kind === "stacked") {
    const top = [...named].sort((a, b) => b[ask.measure] - a[ask.measure]).slice(0, MOST[ask.kind]).filter((row) => row[ask.measure] > 0);
    const wholeBefore = hasBefore ? rows.reduce((sum, row) => sum + (row.previousClicks ?? 0), 0) : 0;
    const shown = top.map((row) => ({ name: row.key, value: share(row[ask.measure], whole), ...(wholeBefore > 0 ? { before: share(row.previousClicks ?? 0, wholeBefore) } : {}) }));
    const rest = whole - top.reduce((sum, row) => sum + row[ask.measure], 0);
    const restBefore = wholeBefore - top.reduce((sum, row) => sum + (row.previousClicks ?? 0), 0);
    return { ok: true, chart: { ...base, groups: [...shown, ...(rest > 0 ? [{ name: EVERY_OTHER, value: share(rest, whole), ...(wholeBefore > 0 ? { before: share(Math.max(0, restBefore), wholeBefore) } : {}) }] : [])] } };
  }
  if (ask.kind === "scatter") {
    // Times shown across, the share clicked up: where a group is seen but passed over.
    const points = [...named].filter((row) => row.impressions >= TRUSTED_VISITS).sort((a, b) => b.impressions - a.impressions).slice(0, MOST.scatter)
      .map((row) => ({ name: row.key, value: round1(row.ctr * 100), visits: row.impressions }));
    if (points.length < 2) return { ok: false, problem: "Too few groups were shown often enough to set side by side." };
    return { ok: true, chart: { ...base, measure: "impressions", groups: points } };
  }
  const bars = [...named].sort((a, b) => b[ask.measure] - a[ask.measure]).slice(0, MOST.bars).filter((row) => row[ask.measure] > 0)
    .map((row) => ({ name: row.key, value: row[ask.measure], ...(ask.measure === "clicks" && row.previousClicks !== null ? { before: row.previousClicks } : {}) }));
  if (bars.length === 0) return { ok: false, problem: "Nothing to draw in those dates." };
  return { ok: true, chart: { ...base, groups: bars } };
}

/** The hours a grid of the week lays across: six blocks of four, midnight first. */
export const HOUR_BLOCKS = [0, 4, 8, 12, 16, 20] as const;
/** Google counts Sunday as 0; a British week reads Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * When people convert, as a grid (the plan's gaps): each weekday down, each four hours across, each square the times
 * the conversion happened over the period — from the `eventHour` list Conversions' "When people convert" reads. A
 * row's `event` is its weekday as Google counts it ("0" Sunday), for the screens to name in the reader's language.
 */
export function hoursGridFrom(
  cells: readonly (readonly number[])[],
  ask: { event: string; website: string; period: string; link: string },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  const total = cells.reduce((sum, day) => sum + day.reduce((one, hour) => one + hour, 0), 0);
  if (total <= 0) return { ok: false, problem: "No times by hour are kept for that conversion in those dates yet: they come with the next collection." };
  const block = (day: readonly number[], from: number) => day.slice(from, from + 4).reduce((sum, hour) => sum + hour, 0);
  const label = (from: number) => `${String(from).padStart(2, "0")}:00–${String(from + 4 === 24 ? 0 : from + 4).padStart(2, "0")}:00`;
  return {
    ok: true,
    chart: {
      look: "analyticsGroups", kind: "grid", by: "hour", measure: "conversions", event: ask.event, website: ask.website, period: ask.period, link: ask.link,
      groups: HOUR_BLOCKS.map((from) => ({ name: label(from), value: WEEK.reduce((sum: number, day) => sum + block(cells[day] ?? [], from), 0) })),
      rows: WEEK.map((day) => ({ event: String(day), values: HOUR_BLOCKS.map((from) => block(cells[day] ?? [], from)) })),
    },
  };
}
