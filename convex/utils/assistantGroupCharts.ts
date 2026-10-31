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
 * device (the plan's gaps, built 2026-10-31). From Bing: the search or page. From Clarity: device, page, kind of
 * page, the source a visit came by (`source`) or its browser. From Visibility: each website of the group
 * (`website`) or the website's searches by its place on Google (`position`).
 */
export const GROUP_CHART_BY = ["channel", "kind", "device", "country", "page", "hour", "query", "source", "browser", "website", "position"] as const;
export type GroupChartBy = (typeof GROUP_CHART_BY)[number];
/** Search Console's and Bing's measures for a chart of groups: clicks (visitors from the engine) and impressions (times shown). */
export const SEARCH_GROUP_MEASURES = ["clicks", "impressions"] as const;
export type SearchGroupMeasure = (typeof SEARCH_GROUP_MEASURES)[number];
/**
 * Clarity's measures beside its visits: the average share of a page scrolled, and the shares of visits with a quick
 * back, an angry (rage) click, a dead click or an error — each in percent, as Clarity's screens say them.
 */
export const CLARITY_GROUP_MEASURES = ["scroll", "quickBacks", "rageClicks", "deadClicks", "errors"] as const;
export type ClarityGroupMeasure = (typeof CLARITY_GROUP_MEASURES)[number];
/** Visibility's measures for each website: estimated visitors from Google, searches ranked for, in Google's top 3, linking websites. */
export const VISIBILITY_GROUP_MEASURES = ["estimatedVisitors", "searches", "topThree", "linkingWebsites"] as const;
export type VisibilityGroupMeasure = (typeof VISIBILITY_GROUP_MEASURES)[number];
export type GroupMeasure = AnalyticsChartMeasure | SearchGroupMeasure | ClarityGroupMeasure | VisibilityGroupMeasure;
export const GROUP_MEASURES = ["visits", "conversions", "conversionRate", ...SEARCH_GROUP_MEASURES, ...CLARITY_GROUP_MEASURES, ...VISIBILITY_GROUP_MEASURES] as const;
export const groupMeasureValidator = v.union(...GROUP_MEASURES.map((measure) => v.literal(measure)));

/** Where a chart of groups' figures come from, each section's saved data (Anthony, 2026-10-29: Insights' five sections). */
export const GROUP_SOURCES = ["analytics", "searchConsole", "bing", "clarity", "visibility"] as const;
export type GroupSource = (typeof GROUP_SOURCES)[number];
export const groupSourceValidator = v.union(...GROUP_SOURCES.map((source) => v.literal(source)));
const LOOKS = { analytics: "analyticsGroups", searchConsole: "searchConsoleGroups", bing: "bingGroups", clarity: "clarityGroups", visibility: "visibilityGroups" } as const;
export type GroupLook = (typeof LOOKS)[GroupSource];
export const lookOfSource = (source: GroupSource): GroupLook => LOOKS[source];
export const sourceOfLook = (look: GroupLook): GroupSource => (Object.keys(LOOKS) as GroupSource[]).find((source) => LOOKS[source] === look) ?? "analytics";
export const GROUP_LOOKS = Object.values(LOOKS);

export const groupsChartValidator = v.object({
  look: v.union(...GROUP_LOOKS.map((look) => v.literal(look))),
  kind: v.union(...GROUP_CHART_KINDS.map((kind) => v.literal(kind))),
  by: v.union(...GROUP_CHART_BY.map((by) => v.literal(by))),
  measure: groupMeasureValidator,
  /** The conversion a count or rate is of, by its Google name; a scatter's and a grid's main one. */
  event: v.optional(v.string()),
  website: v.string(),
  /** The calendar period the figures cover; Visibility's newest check (`latest`), its day in `asOf`. */
  period: v.string(),
  asOf: v.optional(v.string()),
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

/**
 * Whether a chart's figures are percents — shares, rates, Clarity's measures — or counts: one rule for the chart, the
 * bell and the email. A grid of the week's hours and Visibility's grid count searches; a Visibility scatter's figure
 * is its estimated visitors.
 */
export function groupsAreShares(chart: Pick<GroupsChart, "look" | "kind" | "by" | "measure">): boolean {
  if (chart.kind === "pie" || chart.kind === "stacked") return true;
  if (chart.look === "visibilityGroups" || chart.by === "hour") return false;
  if (chart.kind === "scatter" || chart.kind === "grid") return true;
  if (chart.look === "clarityGroups") return chart.measure !== "visits";
  return chart.measure === "conversionRate";
}

/** A chart's source as a saved chart or an email names it: the source named, else Search Console for its measures. */
export function lookOfSaved(saved: { source?: string; measure?: string }): GroupLook {
  if (saved.source && (GROUP_SOURCES as readonly string[]).includes(saved.source)) return lookOfSource(saved.source as GroupSource);
  return saved.measure === "clicks" || saved.measure === "impressions" ? "searchConsoleGroups" : "analyticsGroups";
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
 * scatter of times shown against the share clicked. Search Console counts no conversions, so it draws no grid. Bing's
 * searches and pages are drawn the same way, from Bing's own lists (`look` "bingGroups"). A row with no `key` is
 * counted in the whole and never drawn: a big list names only the rows a chart can show.
 */
export function searchGroupsChartFrom(
  rows: readonly SearchGroupRow[],
  ask: { kind: GroupChartKind; by: GroupChartBy; measure: SearchGroupMeasure; website: string; period: string; link: string; look?: "searchConsoleGroups" | "bingGroups" },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  const engine = ask.look === "bingGroups" ? "Bing" : "Search Console";
  if (ask.kind === "grid") return { ok: false, problem: `${engine} counts no conversions, so it has no grid. Ask for bars, stacked, pie or scatter.` };
  const named = rows.filter((row) => row.key && !NOT_A_GROUP.has(row.key.toLowerCase()));
  const whole = rows.reduce((sum, row) => sum + row[ask.measure], 0);
  if (whole <= 0) return { ok: false, problem: `${engine} has nothing for those dates.` };
  const base = { look: ask.look ?? ("searchConsoleGroups" as const), kind: ask.kind, by: ask.by, measure: ask.measure, website: ask.website, period: ask.period, link: ask.link };
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

/** A Clarity group's figures, as its screens work them out (`measuresOf`): visits, and the measures in percent. */
export type ClarityGroupLine = { name: string; visits: number } & Record<ClarityGroupMeasure, number | null>;

/**
 * A chart of Clarity's groups (the plan's last sources, 2026-10-31): devices, pages, kinds of page, sources or
 * browsers over the period — visits, or a measure in percent, as bars against the period before; shares of visits
 * as a pie or stacked bars; each group's visits against a measure as a scatter; or a grid of every measure for each
 * group, each square a percent. A group's measure is drawn only with visits enough to trust (`trusted`), as Clarity's
 * screens judge a page.
 */
export function clarityGroupsChartFrom(
  lines: readonly ClarityGroupLine[],
  before: ReadonlyMap<string, ClarityGroupLine> | null,
  ask: { kind: GroupChartKind; by: GroupChartBy; measure: "visits" | ClarityGroupMeasure; website: string; period: string; link: string; trusted: number },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  const groups = lines.filter((line) => line.name && line.visits > 0 && !NOT_A_GROUP.has(line.name.toLowerCase()));
  const whole = lines.reduce((sum, line) => sum + line.visits, 0);
  if (whole <= 0) return { ok: false, problem: "Clarity recorded no visits in those dates." };
  // Shares are of visits; a scatter and a grid are of the measures, scroll where none is named.
  const measure = ask.kind === "pie" || ask.kind === "stacked" ? "visits" : (ask.kind === "scatter" || ask.kind === "grid") && ask.measure === "visits" ? "scroll" : ask.measure;
  const base = { look: "clarityGroups" as const, kind: ask.kind, by: ask.by, measure, website: ask.website, period: ask.period, link: ask.link };
  const share = (part: number, all: number) => (all > 0 ? round1((part / all) * 100) : 0);
  const trusted = groups.filter((line) => line.visits >= ask.trusted);

  if (ask.kind === "pie" || ask.kind === "stacked") {
    const wholeBefore = before ? [...before.values()].reduce((sum, line) => sum + line.visits, 0) : 0;
    const top = [...groups].sort((a, b) => b.visits - a.visits).slice(0, MOST[ask.kind]);
    const shown = top.map((line) => ({ name: line.name, value: share(line.visits, whole), ...(wholeBefore > 0 ? { before: share(before?.get(line.name)?.visits ?? 0, wholeBefore) } : {}) }));
    const rest = whole - top.reduce((sum, line) => sum + line.visits, 0);
    const restBefore = wholeBefore - top.reduce((sum, line) => sum + (before?.get(line.name)?.visits ?? 0), 0);
    return { ok: true, chart: { ...base, groups: [...shown, ...(rest > 0 ? [{ name: EVERY_OTHER, value: share(rest, whole), ...(wholeBefore > 0 ? { before: share(Math.max(0, restBefore), wholeBefore) } : {}) }] : [])] } };
  }

  if (ask.kind === "grid") {
    // Groups across, by visits; each measure down; each square the measure's percent for the group.
    const columns = [...trusted].sort((a, b) => b.visits - a.visits).slice(0, MOST.grid);
    if (columns.length === 0) return { ok: false, problem: "No group had visits enough to lay out in those dates." };
    return {
      ok: true,
      chart: {
        ...base,
        groups: columns.map((line) => ({ name: line.name, value: line.visits })),
        rows: CLARITY_GROUP_MEASURES.map((one) => ({ event: one, values: columns.map((line) => line[one]) })),
      },
    };
  }

  if (ask.kind === "scatter") {
    const one = measure as ClarityGroupMeasure;
    const points = [...trusted].filter((line) => line[one] !== null).sort((a, b) => b.visits - a.visits).slice(0, MOST.scatter)
      .map((line) => ({ name: line.name, value: line[one]!, visits: line.visits }));
    if (points.length < 2) return { ok: false, problem: "Too few groups have visits enough to set side by side." };
    return { ok: true, chart: { ...base, groups: points } };
  }

  // Bars: visits, or a measure where the visits can be trusted, the period before's beside each.
  const valueOf = (line: ClarityGroupLine | undefined) => (line ? (measure === "visits" ? line.visits : line[measure as ClarityGroupMeasure]) : null);
  const bars = (measure === "visits" ? groups : trusted)
    .map((line) => ({ line, value: valueOf(line) }))
    .filter((one): one is { line: ClarityGroupLine; value: number } => one.value !== null && one.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MOST.bars)
    .map(({ line, value }) => {
      const then = valueOf(before?.get(line.name));
      return { name: line.name, value, ...(then !== null ? { before: then } : {}) };
    });
  if (bars.length === 0) return { ok: false, problem: "Nothing to draw in those dates." };
  return { ok: true, chart: { ...base, groups: bars } };
}

/** Google's positions, in the bands every Visibility screen counts them in. */
export const POSITION_BANDS = [["p01_03", "1–3"], ["p04_10", "4–10"], ["p11_20", "11–20"], ["p21_50", "21–50"], ["p51_up", "51+"]] as const;
export type PositionBandKey = (typeof POSITION_BANDS)[number][0];

/** A website of the group at its newest check, as Visibility's screens count it; null where not known yet. */
export type VisibilityWebsite = { host: string } & Record<VisibilityGroupMeasure, number | null> & { bands: Record<PositionBandKey, number> | null };

/**
 * A chart of Visibility's figures (the plan's last sources): each website of the group — the company's own and the
 * competitors it watches — at its newest check, as bars, a pie or stacked bars of shares, searches ranked for against
 * estimated visitors as a scatter, or a grid of each website's searches in each band of Google's positions; or one
 * website's searches by position band. The supplier's own counts, as the Sites screens show them.
 */
export function visibilityGroupsChartFrom(
  websites: readonly VisibilityWebsite[],
  ask: { kind: GroupChartKind; by: "website" | "position"; measure: VisibilityGroupMeasure; website: string; asOf: string | null; link: string },
): { ok: true; chart: GroupsChart } | { ok: false; problem: string } {
  const base = { look: "visibilityGroups" as const, kind: ask.kind, by: ask.by, website: ask.website, period: "latest", ...(ask.asOf ? { asOf: ask.asOf } : {}), link: ask.link };
  const share = (part: number, all: number) => (all > 0 ? round1((part / all) * 100) : 0);

  if (ask.by === "position") {
    if (ask.kind === "scatter" || ask.kind === "grid") return { ok: false, problem: "One website's positions are drawn as bars, stacked or a pie; for a grid or a scatter, ask by website." };
    const own = websites.find((one) => one.host === ask.website) ?? websites[0];
    const bands = own?.bands;
    const whole = bands ? POSITION_BANDS.reduce((sum, [key]) => sum + bands[key], 0) : 0;
    if (!bands || whole <= 0) return { ok: false, problem: `${ask.website}'s searches by position aren't known yet: they come with its next check.` };
    const counts = POSITION_BANDS.map(([key, name]) => ({ name, value: bands[key] }));
    return { ok: true, chart: { ...base, measure: "searches", groups: ask.kind === "bars" ? counts : counts.map((one) => ({ name: one.name, value: share(one.value, whole) })) } };
  }

  if (ask.kind === "grid") {
    const known = websites.filter((one) => one.bands !== null);
    if (known.length === 0) return { ok: false, problem: "No website of the group has its searches by position yet." };
    return {
      ok: true,
      chart: {
        ...base,
        measure: "searches",
        groups: POSITION_BANDS.map(([key, name]) => ({ name, value: known.reduce((sum, one) => sum + one.bands![key], 0) })),
        rows: known.map((one) => ({ event: one.host, values: POSITION_BANDS.map(([key]) => one.bands![key]) })),
      },
    };
  }

  if (ask.kind === "scatter") {
    // Searches ranked for across, estimated visitors up: who turns rankings into visitors.
    const points = websites.filter((one) => one.searches !== null && one.estimatedVisitors !== null)
      .map((one) => ({ name: one.host, value: Math.round(one.estimatedVisitors!), visits: one.searches! }));
    if (points.length < 2) return { ok: false, problem: "Too few websites of the group have their figures yet to set side by side." };
    return { ok: true, chart: { ...base, measure: "estimatedVisitors", groups: points } };
  }

  const known = websites.filter((one) => one[ask.measure] !== null).map((one) => ({ name: one.host, value: Math.round(one[ask.measure]!) }));
  const whole = known.reduce((sum, one) => sum + one.value, 0);
  if (known.length === 0 || whole <= 0) return { ok: false, problem: "No website of the group has that figure yet: it comes with the next check." };
  const sorted = [...known].sort((a, b) => b.value - a.value);
  if (ask.kind === "bars") return { ok: true, chart: { ...base, measure: ask.measure, groups: sorted.slice(0, MOST.bars) } };
  const top = sorted.slice(0, MOST[ask.kind]);
  const rest = whole - top.reduce((sum, one) => sum + one.value, 0);
  return { ok: true, chart: { ...base, measure: ask.measure, groups: [...top.map((one) => ({ name: one.name, value: share(one.value, whole) })), ...(rest > 0 ? [{ name: EVERY_OTHER, value: share(rest, whole) }] : [])] } };
}
