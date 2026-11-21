import { channelBoxes, type ChannelBoxRow } from "../../channelBoxes";
import { NOT_SORTED_KIND } from "../../pageKinds";
import type { ChartStep } from "../../searchConsolePacks";
import { stepKey } from "../../stepScale";
import { NO_PAGE_KIND, OTHER_KIND } from "../analyticsChannel";

/**
 * What Google Analytics Channels hands its eye (`channels/page.tsx`, `ChannelsSees`) and what its panels add
 * (`ChannelsParts.tsx`: `channelsByDay`, `channelSquares`, `channelDevices`, `channelSteps`), built in one place for the
 * screen and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The reads and the words come in; the figures come out.
 */

/** Every channel the boxes and the eye weigh: far more than Google has. */
export const EVERY_CHANNEL = 100;

type ChannelRow = {
  label: string;
  visits: number;
  visitsBefore?: number | null;
  purchases: number;
  purchasesBefore?: number | null;
  conversions: number;
  conversionsBefore: number | null;
  bounceRate: number | null;
  engaged?: number | null;
  basketVisits?: number | null;
  checkoutVisits?: number | null;
};
type GoneChannel = { key: string; visitsBefore: number; purchasesBefore: number; conversionsBefore: number };
/** The list of channels, every one (`analyticsListPage`, `EVERY_CHANNEL` rows). */
export type ChannelsList = { rows: readonly ChannelRow[]; gone?: readonly GoneChannel[] | null };
type OverviewFigures = { visits: number; purchases: number; conversions: number };
export type ChannelsOverview = { now?: OverviewFigures | null; before?: OverviewFigures | null } | null | undefined;

/** A website that has sold anything in these dates or those before. Without it the page counts its events. */
export function sellsOf(overview: ChannelsOverview): boolean {
  return overview ? (overview.now?.purchases ?? 0) > 0 || (overview.before?.purchases ?? 0) > 0 : true;
}

/** The list as the boxes' rule weighs it: a channel that stopped altogether can still be the biggest change. */
export function boxRowsOf({ every, sells }: { every: ChannelsList | null | undefined; sells: boolean }): ChannelBoxRow[] {
  return [
    ...(every?.rows ?? []).map((row) => ({ key: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null, done: sells ? row.purchases : row.conversions })),
    ...(every?.gone ?? []).map((one) => ({ key: one.key, visits: 0, visitsBefore: one.visitsBefore, done: 0 })),
  ];
}

/** The four boxes' picks, for the boxes and the eye alike. */
export function channelBoxesOf(every: ChannelsList | null | undefined, overview: ChannelsOverview, sells: boolean) {
  const now = overview?.now;
  return channelBoxes(boxRowsOf({ every, sells }), { visits: now?.visits ?? null, done: now ? (sells ? now.purchases : now.conversions) : null });
}

type Website = { visits: number; visitsBefore: number | null; views: number; viewsBefore: number | null; conversions: number; conversionsBefore: number | null; engaged: number; engagedBefore: number | null };

/**
 * The page's eye: every channel with its boxes' rule's picks and the whole website's own figures, whatever the menus
 * show (channels-new-page-plan-2026-11-06.md, step 8). Undefined until the list of channels is read.
 */
export function channelsEyeData(
  reads: { every: ChannelsList | null | undefined; overview: ChannelsOverview; sells: boolean; website: Website | undefined },
  words: { names: Record<string, string> },
) {
  const { every, overview, sells, website } = reads;
  if (!every) return undefined;
  return {
    names: words.names,
    sells,
    boxes: channelBoxesOf(every, overview, sells),
    rows: every.rows.map((row) => ({
      name: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null,
      purchases: row.purchases, purchasesBefore: row.purchasesBefore ?? null,
      conversions: row.conversions, conversionsBefore: row.conversionsBefore,
      bounceRate: row.bounceRate, engaged: row.engaged ?? null,
      addedToBasket: row.basketVisits ?? null, startedCheckout: row.checkoutVisits ?? null,
    })),
    ...(every.gone && every.gone.length > 0 ? { gone: every.gone.map((one) => ({ name: one.key, visits: 0, visitsBefore: one.visitsBefore, purchases: 0, purchasesBefore: one.purchasesBefore, conversions: 0, conversionsBefore: one.conversionsBefore })) } : {}),
    ...(website ? { website: { ...website, bought: overview?.now?.purchases ?? 0, boughtBefore: overview?.before?.purchases ?? null } } : {}),
  };
}

type DayPoint = { day: string; lastDay?: string; visits: readonly number[] };
/** Visits each day, by channel (`analyticsChannelsEachDay`). */
export type ChannelsEachDay = {
  channels: readonly string[];
  events: ReadonlyArray<{ eventName: string; counted: boolean; times: number }>;
  points: readonly DayPoint[];
  before: readonly DayPoint[] | null;
};

/**
 * Each channel's figures added up for the chart's step, by its name, for the eye: the plain sum, not the average a long step draws.
 * The eye reads what the chart shows, and a year of days for every channel twice over would crowd out the rest of the page.
 */
function daysForEye(points: readonly DayPoint[], channels: readonly string[], step: ChartStep) {
  const steps = new Map<string, { day: string; lastDay: string; sums: number[] }>();
  for (const point of points) {
    const key = stepKey(step, point.day, point.lastDay);
    const held = steps.get(key) ?? { day: point.day, lastDay: point.lastDay ?? point.day, sums: channels.map(() => 0) };
    if ((point.lastDay ?? point.day) > held.lastDay) held.lastDay = point.lastDay ?? point.day;
    point.visits.forEach((visits, at) => (held.sums[at] += visits));
    steps.set(key, held);
  }
  return [...steps.values()].map(({ day, lastDay, sums }) => ({ day, ...(lastDay !== day ? { lastDay } : {}), ...Object.fromEntries(channels.map((channel, at) => [channel, sums[at]])) }));
}

/** Visits each day, by channel, at the chart's step, and the key events by their names, as the eye reads them (`channelsByDay`). */
export function channelsByDayForEye(chart: ChannelsEachDay | null | undefined, step: ChartStep, eventName: (eventName: string) => string) {
  if (!chart) return undefined;
  return {
    days: daysForEye(chart.points, chart.channels, step),
    ...(chart.before ? { daysBefore: daysForEye(chart.before, chart.channels, step) } : {}),
    events: chart.events.map((one) => ({ name: eventName(one.eventName), times: one.times, countsAsConversion: one.counted })),
  };
}

type SquareFigures = { visits: number; visitsBefore: number | null; bought: number; boughtBefore: number | null; conversions: number; conversionsBefore: number | null };
/** Each channel by Classification or device (`analyticsChannelSquares`). */
export type ChannelSquares = {
  everyDevice: boolean;
  columns: ReadonlyArray<{ key: string; name: string | null; holds?: ReadonlyArray<{ kind: string; name: string | null }>; visits: number }>;
  rows: ReadonlyArray<SquareFigures & { channel: string; cells: readonly SquareFigures[] }>;
};

/** A row or column's figures for the eye, in the names its rules read. */
const figuresForEye = (figures: SquareFigures) => ({
  visits: figures.visits, visitsBefore: figures.visitsBefore,
  purchases: figures.bought, purchasesBefore: figures.boughtBefore,
  conversions: figures.conversions, conversionsBefore: figures.conversionsBefore,
});

/** A read of the squares as the eye reads it, each column in the page's words (`channelSquares`, `channelDevices`). */
export function channelSquaresForEye(read: ChannelSquares | null | undefined, name: (key: string, own: string | null) => string) {
  if (!read) return undefined;
  return {
    ...(read.everyDevice ? { everyDevice: true } : {}),
    columns: read.columns.map((column) => ({ key: column.key, name: name(column.key, column.name), visits: column.visits })),
    rows: read.rows.map((row) => ({
      name: row.channel, ...figuresForEye(row),
      cells: row.cells.flatMap((cell, at) => (cell.visits > 0 || (cell.visitsBefore ?? 0) > 0 ? [{ key: read.columns[at]?.key, column: name(read.columns[at]?.key ?? "", read.columns[at]?.name ?? null), ...figuresForEye(cell) }] : [])),
    })),
  };
}

/** A Classification column's name as the squares say it: Other groups, Not sorted yet, No page recorded, else its own or its group's words. */
export function squareKindName(words: { otherGroups: string; notSorted: string; noPage: string }, kindName: (kind: string) => string) {
  return (key: string, own: string | null) => (key === OTHER_KIND ? words.otherGroups : key === NOT_SORTED_KIND ? words.notSorted : key === NO_PAGE_KIND ? words.noPage : own ?? kindName(key));
}

/**
 * A page group's words (`useKindName`): a Classification's own name, "No page recorded" for the visits Google put to no
 * page, "Other" for the groups past Channels' map's columns, else Hakken's page type in words (`label`).
 */
export function kindNameFrom(kinds: ReadonlyArray<{ kind: string; name: string | null }>, words: { noPage: string; other: string }, label: (kind: string) => string) {
  return (kind: string) => {
    const own = kinds.find((one) => one.kind === kind)?.name;
    if (own) return own;
    if (kind === NO_PAGE_KIND) return words.noPage;
    if (kind === OTHER_KIND) return words.other;
    return label(kind);
  };
}

/** The squares' columns and what Other groups holds: every group the squares may name (`ChannelSquaresCard`). */
export function squareKinds(read: ChannelSquares | null | undefined): Array<{ kind: string; name: string | null }> {
  return [...(read?.columns ?? []).map((one) => ({ kind: one.key, name: one.name })), ...(read?.columns ?? []).flatMap((one) => one.holds ?? [])];
}

type Steps = { arrived: number; stayed: number; basket: number; checkout: number; bought: number };
/** How far people got (`analyticsChannelSteps`). */
export type ChannelSteps = {
  collecting: boolean;
  tracks: { basket: boolean; checkout: boolean };
  everywhere: Steps | null;
  channels: ReadonlyArray<Steps & { channel: string }>;
};

/** How far each channel's visits got, as the eye reads it (`channelSteps`); nothing while the lists are collected. */
export function channelStepsForEye(answer: ChannelSteps | null | undefined, stepNames: Record<keyof Steps, string>) {
  if (!answer || answer.collecting) return undefined;
  return { steps: stepNames, tracks: answer.tracks, ...(answer.everywhere ? { everywhere: answer.everywhere } : {}), channels: answer.channels.map(({ channel, ...steps }) => ({ name: channel, ...steps })) };
}
