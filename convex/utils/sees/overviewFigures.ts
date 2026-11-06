import { endingsOf, serviceSteps, shopSteps } from "../conversionSteps";
import { outOfTotal } from "../outOfTotal";

/**
 * Overview's figures as the eye and Ask Hakken read them (overview-new-page-plan-2026-11-06.md, steps 11 and 12), built once here so
 * the two can't disagree with the page. It takes the page's own reads: the boxes, the days, each way of splitting the visits, and
 * the top pages. Every event goes by its name, every row says its figures now and before, and every share a chart draws is given
 * as the whole numbers it draws. No money: the reads hold none of it. No database here.
 */

export const OVERVIEW_SPLIT_NAMES = ["channel", "kind", "device", "visitorType"] as const;
export type OverviewSplitName = (typeof OVERVIEW_SPLIT_NAMES)[number];

type SplitEvent = { name: string; counted: boolean };
type SplitRow = {
  key: string;
  name: string | null;
  visits: number;
  stayed: number;
  views: number;
  bought: number;
  conversions: number;
  did: readonly number[];
  times: readonly number[];
  visitsBefore: number | null;
  stayedBefore: number | null;
  viewsBefore: number | null;
  boughtBefore: number | null;
  conversionsBefore: number | null;
  didBefore: readonly number[] | null;
  timesBefore: readonly number[] | null;
};
export type OverviewSplitAnswer = { everyDevice?: boolean; hasBefore: boolean; events: readonly SplitEvent[]; rows: readonly SplitRow[] };

type DayPoint = { day: string; lastDay?: string; visits: number; engaged?: number; views?: number; conversions: number; events: readonly number[] };
type Whole = { visits: number; engaged?: number; views?: number; conversions: number; purchases?: number };
type PageRow = { key: string; label: string; visits: number; visitsBefore?: number | null; purchases?: number; conversions?: number; bounceRate?: number | null };

export type OverviewFiguresInput = {
  shop: boolean;
  /** How many squares the page's grid has: 100, or 1,000 where the thing that counts is rare. */
  cells: number;
  now: Whole | null | undefined;
  before: Whole | null | undefined;
  chart?: { events: readonly string[]; points: readonly DayPoint[] } | null;
  daysBefore?: { held: boolean; shift: number; events: readonly string[]; points: readonly DayPoint[] } | null;
  splits: Partial<Record<OverviewSplitName, OverviewSplitAnswer | null>>;
  pages?: readonly PageRow[] | null;
  /** A row's name and an event's, in the reader's words. */
  rowName: (split: OverviewSplitName, row: SplitRow) => string;
  eventName: (name: string) => string;
};

const SHOP_STAGES = ["leftStraightAway", "lookedAround", "addedToBasket", "startedCheckout", "bought"] as const;
const SERVICE_STAGES = ["leftStraightAway", "lookedAround", "clickedToGetInTouch", "sentAForm"] as const;
/** The events named on a day, at most: the page's own menu offers the same four. */
const MOST_EVENTS_A_DAY = 4;

/** A step's figures, from one row's: a shop's fixed steps, or a service website's from the events it counts. */
function stepsOf(shop: boolean, events: readonly SplitEvent[], figures: { visits: number; stayed: number; did: readonly number[] }): number[] {
  if (shop) return shopSteps(figures, events.map((event) => event.name));
  const kept = events.flatMap((event, at) => (event.counted ? [{ name: event.name, did: figures.did[at] ?? 0 }] : []));
  return serviceSteps({ ...figures, did: kept.map((one) => one.did) }, kept.map((one) => one.name));
}

/** How the visits ended, as the squares draw them: whole squares out of `cells`, by name, and the visits behind each. */
function squaresOf(shop: boolean, cells: number, steps: readonly number[]) {
  const stages = shop ? SHOP_STAGES : SERVICE_STAGES;
  const ends = endingsOf(steps);
  const squares = outOfTotal(ends, cells);
  return Object.fromEntries(stages.map((stage, at) => [stage, { squares: squares[at] ?? 0, visits: ends[at] ?? 0 }]));
}

/** What each counted event's figure was, by its name, leaving out what never happened. */
function byEvent(events: readonly SplitEvent[], values: readonly number[] | null, eventName: (name: string) => string) {
  if (!values) return null;
  return Object.fromEntries(events.flatMap((event, at) => (event.counted && (values[at] ?? 0) > 0 ? [[eventName(event.name), values[at]]] : [])));
}

/** The counted events the website does most, as the page's menus offer them. */
export function busiestEvents(split: OverviewSplitAnswer | null | undefined, most = MOST_EVENTS_A_DAY): string[] {
  if (!split) return [];
  return split.events
    .map((event, at) => ({ ...event, times: split.rows.reduce((sum, row) => sum + (row.times[at] ?? 0), 0) }))
    .filter((event) => event.counted && event.times > 0)
    .sort((left, right) => right.times - left.times)
    .slice(0, most)
    .map((event) => event.name);
}

function dayRow(point: DayPoint, events: readonly string[], named: ReadonlyArray<{ name: string; word: string }>, shift = 0) {
  const shifted = shift === 0 ? point.day : new Date(Date.parse(`${point.day}T00:00:00Z`) - shift * 86_400_000).toISOString().slice(0, 10);
  return {
    day: shifted,
    ...(point.lastDay ? { lastDay: point.lastDay } : {}),
    visits: point.visits,
    stayed: point.engaged ?? 0,
    views: point.views ?? 0,
    conversions: point.conversions,
    ...Object.fromEntries(named.flatMap(({ name, word }) => {
      const at = events.indexOf(name);
      return at < 0 ? [] : [[word, point.events[at] ?? 0]];
    })),
  };
}

export function overviewFigures(input: OverviewFiguresInput) {
  const { shop, cells, now, before, chart, daysBefore, splits, pages, rowName, eventName } = input;
  const channel = splits.channel ?? null;
  const dayEvents = shop ? ["add_to_cart", "begin_checkout", "purchase"] : busiestEvents(channel);
  const namedEvents = dayEvents.map((name) => ({ name, word: eventName(name) }));
  const rowsOf = (split: OverviewSplitName) => {
    const answer = splits[split];
    if (!answer) return null;
    const topRow = outOfTotal(answer.rows.map((row) => row.visits));
    const bottomRow = outOfTotal(answer.rows.map((row) => (shop ? row.bought : row.conversions)));
    return {
      everyDevice: answer.everyDevice === true,
      rows: answer.rows.map((row, at) => ({
        key: row.key,
        name: rowName(split, row),
        visits: row.visits,
        visitsBefore: row.visitsBefore,
        stayed: row.stayed,
        views: row.views,
        ...(shop ? { bought: row.bought, boughtBefore: row.boughtBefore } : { conversions: row.conversions, conversionsBefore: row.conversionsBefore }),
        // The two rows of the page's bands: this row's whole numbers out of every 100.
        ofEvery100Visits: topRow[at] ?? 0,
        ofEvery100Done: bottomRow[at] ?? 0,
      })),
    };
  };
  // What each row's visits did, apart from its main figures, as there are many: the rules read them, and the writer if it can.
  const didOf = (split: OverviewSplitName) => (splits[split]?.rows ?? []).map((row) => {
    const answer = splits[split]!;
    return {
      key: row.key,
      name: rowName(split, row),
      visitsThatDid: byEvent(answer.events, row.did, eventName),
      timesDone: byEvent(answer.events, row.times, eventName),
      timesDoneBefore: byEvent(answer.events, row.timesBefore, eventName),
    };
  });
  // The page's squares for each row, as whole squares out of every 100.
  const squaresBy = (split: OverviewSplitName) => (splits[split]?.rows ?? []).map((row) => {
    const answer = splits[split]!;
    const squares = squaresOf(shop, 100, stepsOf(shop, answer.events, row));
    return { key: row.key, name: rowName(split, row), ...Object.fromEntries(Object.entries(squares).map(([stage, value]) => [stage, value.squares])) };
  });
  const sum = (values: (row: SplitRow) => readonly number[] | null) => Array.from({ length: channel?.events.length ?? 0 }, (_, at) => (channel?.rows ?? []).reduce((total, row) => total + (values(row)?.[at] ?? 0), 0));
  const didNow = sum((row) => row.did);
  const didBefore = sum((row) => row.didBefore);
  const whole = now && channel ? stepsOf(shop, channel.events, { visits: now.visits, stayed: now.engaged ?? 0, did: didNow }) : null;
  const wholeBefore = before && channel ? stepsOf(shop, channel.events, { visits: before.visits, stayed: before.engaged ?? 0, did: didBefore }) : null;
  return {
    kind: shop ? "shop" as const : "service" as const,
    website: now ? {
      visits: now.visits,
      visitsBefore: before?.visits ?? null,
      stayed: now.engaged ?? 0,
      stayedBefore: before?.engaged ?? null,
      views: now.views ?? 0,
      viewsBefore: before?.views ?? null,
      ...(shop ? { bought: now.purchases ?? 0, boughtBefore: before?.purchases ?? null } : {}),
      conversions: now.conversions,
      conversionsBefore: before?.conversions ?? null,
    } : null,
    squares: whole ? { outOf: cells, now: squaresOf(shop, cells, whole), before: wholeBefore ? squaresOf(shop, cells, wholeBefore) : null } : null,
    // What each counted event did on the whole website, the busiest first: times against the visits that did it.
    events: channel ? channel.events.flatMap((event, at) => {
      const times = channel.rows.reduce((total, row) => total + (row.times[at] ?? 0), 0);
      const timesBefore = channel.rows.reduce((total, row) => total + (row.timesBefore?.[at] ?? 0), 0);
      return event.counted && (times > 0 || timesBefore > 0) ? [{ name: eventName(event.name), times, timesBefore: channel.hasBefore ? timesBefore : null, visitsThatDid: didNow[at] ?? 0 }] : [];
    }).sort((left, right) => right.times - left.times) : [],
    days: chart ? chart.points.map((point) => dayRow(point, chart.events, namedEvents)) : [],
    daysBefore: daysBefore?.held ? daysBefore.points.map((point) => dayRow(point, daysBefore.events, namedEvents, daysBefore.shift)) : [],
    channels: rowsOf("channel"),
    classifications: rowsOf("kind"),
    devices: rowsOf("device"),
    visitors: rowsOf("visitorType"),
    whatEachDid: { channels: didOf("channel"), classifications: didOf("kind"), devices: didOf("device"), visitors: didOf("visitorType") },
    squaresBy: { channels: squaresBy("channel"), classifications: squaresBy("kind"), devices: squaresBy("device") },
    topPages: (pages ?? []).map((row) => ({
      key: row.key,
      address: row.label,
      visits: row.visits,
      visitsBefore: row.visitsBefore ?? null,
      ...(shop ? { bought: row.purchases ?? 0 } : { conversions: row.conversions ?? 0 }),
      ...(row.bounceRate === null || row.bounceRate === undefined ? {} : { leftStraightAwayPercent: Math.round(row.bounceRate * 1000) / 10 }),
    })),
  };
}
