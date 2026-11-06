"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { BEST_FOR_FLOOR } from "@/convex/utils/channelPicks";
import { channelBoxes, per100Words, type ChannelBoxRow } from "@/convex/utils/channelBoxes";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import type { ExplorerControl } from "@/src/ui/components/screens/ChartExplorer";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { ConversionsMap, changeWords, type ConversionsMapColumn, type ConversionsMapRow, type ConversionsMapWords } from "@/src/ui/components/screens/ConversionsMap";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { StepFlowChart, type FlowStep, type StepFlowWords } from "@/src/ui/components/screens/StepFlowChart";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { formatDay, formatNumber, toCsv } from "../../../../sites/_components/siteFormat";
import { useSiteParam, useSiteTicks } from "../../../../sites/_components/useSiteParam";
import { CHANNEL_LINE_COLOURS } from "../../../_components/AnalyticsChart";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { stepKey } from "../../../_components/stepScale";
import { spansOfList, useSpanInWords, useSpanWords } from "../../../_components/VisitsCharts";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus, useStep } from "../../../_components/useAnalytics";
import { useThingDone } from "../../../_components/useEventName";
import { useEyeNames, useWebsiteForEye } from "../../../_components/useEyeFigures";
import { useKindName } from "./ChannelParts";

/**
 * What Channels reads and says (docs/plans/active/channels-new-page-plan-2026-11-06.md; board "The new page so far"). Every chart on the
 * page is a shared part (`Figure`, `DaysChart`, `ConversionsMap`, `MapCard` with `StepFlowChart`), as Anthony asked: "I only want
 * reusable shared components". What's here is the reading, the words and the figures each part is handed. Google's own channel names,
 * and everything around them plain. A shop keeps Bought; any other website says Events. A whole-website figure is Google's own total.
 */

/** Every channel the boxes and the eye weigh: far more than Google has. */
const EVERY_CHANNEL = 100;
/** The chart opens on the busiest few, like today. */
const FIRST_LINES = 4;
/** A square with under this many visits doesn't set how bright the others are: 1 sale from 2 visits isn't the best of anything. */
const SHADE_FLOOR = 30;
const EVERYWHERE = "everywhere";

export function useChannels() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const ready = Boolean(status?.connection?.newestDay);
  const ask = { ...args, list: "channel" as const, sort: "visits" as const, direction: "desc" as const, page: 1, rows: EVERY_CHANNEL };
  const read = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? ask : "skip");
  const everyDevice = useQuery(api.googleAnalyticsReads.analyticsListPage, read?.live ? { ...ask, device: "" } : "skip");
  const every = read?.live ? everyDevice : read;
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, ready ? args : "skip");
  // A website that has sold anything in these dates or those before. Without it the page counts its events.
  const sells = overview ? (overview.now?.purchases ?? 0) > 0 || (overview.before?.purchases ?? 0) > 0 : true;
  return { every, overview, sells };
}

export type Channels = ReturnType<typeof useChannels>;

/** The list as the boxes' rule weighs it: a channel that stopped altogether can still be the biggest change. */
function boxRowsOf({ every, sells }: Channels): ChannelBoxRow[] {
  return [
    ...(every?.rows ?? []).map((row) => ({ key: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null, done: sells ? row.purchases : row.conversions })),
    ...(every?.gone ?? []).map((one) => ({ key: one.key, visits: 0, visitsBefore: one.visitsBefore, done: 0 })),
  ];
}

/** Four boxes, each naming a channel, each saying what it's set against. A box with nothing true to say shows a dash. */
export function ChannelBoxes({ channels }: { channels: Channels }) {
  const t = useTranslations("googleAnalytics.channelsPage.boxes");
  const { every, overview, sells } = channels;
  const spans = spansOfList(every);
  const inWords = useSpanInWords(...spans);
  if (!every || !overview) return null;
  const now = overview.now;
  const boxes = channelBoxes(boxRowsOf(channels), { visits: now?.visits ?? null, done: now ? (sells ? now.purchases : now.conversions) : null });
  const quiet = (words: string, title?: string) => <span className="text-secondary" title={title}>{words}</span>;
  const { mostVisits, mostDone, bestFor, biggestChange } = boxes;
  const before = spans[1];
  const days = before ? t("days", { from: formatDay(before.from), to: formatDay(before.to) }) : undefined;
  return (
    <FigureRow columns={4}>
      <Figure
        label={t("mostVisits")}
        value={mostVisits?.key ?? "–"}
        detail={quiet(mostVisits ? t(mostVisits.sharePercent === null ? "visitsAlone" : "visitsLine", { visits: formatNumber(mostVisits.visits), share: Math.round(mostVisits.sharePercent ?? 0) }) : t("noVisits"))}
      />
      <Figure
        label={t(sells ? "mostBought" : "mostEvents")}
        value={mostDone?.key ?? "–"}
        detail={quiet(mostDone
          ? t(`${sells ? "bought" : "events"}${mostDone.sharePercent === null ? "Alone" : "Line"}`, { count: mostDone.done, figure: formatNumber(mostDone.done), share: Math.round(mostDone.sharePercent ?? 0) })
          : t(sells ? "noneBought" : "noEvents"))}
      />
      <Figure
        label={t(sells ? "sellsBest" : "bestForEvents")}
        value={bestFor?.key ?? "–"}
        detail={quiet(bestFor
          ? t(`${sells ? "sellsBest" : "bestForEvents"}${bestFor.sitePer100 === null ? "Alone" : "Line"}`, { rate: per100Words(bestFor.per100), site: per100Words(bestFor.sitePer100 ?? 0) })
          : t(sells ? "noBest" : "noBestEvents", { floor: BEST_FOR_FLOOR }))}
      />
      <Figure
        label={t("biggestChange")}
        value={biggestChange?.key ?? "–"}
        detail={biggestChange ? quiet(t(biggestChange.change > 0 ? "more" : "fewer", { count: formatNumber(Math.abs(biggestChange.change)), before: inWords.before }), days) : quiet(t("noChange"))}
      />
    </FigureRow>
  );
}

type EachDay = NonNullable<ReturnType<typeof useEachDay>>;

function useEachDay() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  return useQuery(api.googleAnalyticsChannelPageReads.analyticsChannelsEachDay, status?.connection?.newestDay ? args : "skip");
}

/** The figure a line draws for one channel at one point: its visits, or the times the ticked events happened, added up. */
export function dayFigure(point: EachDay["points"][number], channelAt: number, eventsAt: readonly number[]): number {
  if (eventsAt.length === 0) return point.visits[channelAt] ?? 0;
  return eventsAt.reduce((sum, at) => sum + (point.events[at]?.[channelAt] ?? 0), 0);
}

/**
 * Each channel's figures added up for the chart's step, by its name, for the eye: the plain sum, not the average a long step draws.
 * The eye reads what the chart shows, and a year of days for every channel twice over would crowd out the rest of the page.
 */
function daysForEye(points: ReadonlyArray<{ day: string; lastDay?: string; visits: readonly number[] }>, channels: readonly string[], step: "day" | "week" | "month") {
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

/**
 * Visits each day, by channel (Anthony, 2026-11-06: "Can we add a drop-down here which selects the channels"; "can we add drop downs
 * for events"). Each channel ticked gets its own line and the rest share a grey one. Tick events and each line counts those instead,
 * as times. Colours stay with the channel, whatever else is ticked. Ticks live in the address, so a link opens what was showing.
 */
export function ChannelDaysCard({ channels }: { channels: Channels }) {
  const t = useTranslations("googleAnalytics.channelsPage.daily");
  const tc = useTranslations("googleAnalytics.chart");
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const eventName = useThingDone();
  const chart = useEachDay();
  const spanWords = useSpanWords(...spansOfList(channels.every));
  const every = useMemo(() => chart?.channels ?? [], [chart?.channels]);
  const events = useMemo(() => chart?.events ?? [], [chart?.events]);
  const [pickedChannels, setChannels] = useSiteTicks("lines");
  const [pickedEvents, setEvents] = useSiteTicks("events");
  const ticked = (pickedChannels ?? every.slice(0, FIRST_LINES)).filter((channel) => every.includes(channel));
  const tickedEvents = (pickedEvents ?? []).filter((event) => events.some((one) => one.eventName === event));
  const eventsAt = tickedEvents.map((event) => events.findIndex((one) => one.eventName === event));
  const points = useMemo(() => chart?.points ?? [], [chart?.points]);
  const seen = useMemo(() => (chart ? {
    days: daysForEye(points, every, step),
    ...(chart.before ? { daysBefore: daysForEye(chart.before, every, step) } : {}),
    events: events.map((one) => ({ name: eventName(one.eventName), times: one.times, countsAsConversion: one.counted })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `eventName` is new each draw; the events and the rows decide.
  } : undefined), [chart, points, every, events, step]);
  useSeesPart("channelsByDay", seen);
  const pointOf = (figure: (point: EachDay["points"][number]) => number) => points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: figure(point) }));
  const lines: DaysLine[] = ticked.length === 0 ? [] : [
    ...ticked.map((channel) => {
      const at = every.indexOf(channel);
      return { key: channel, name: channel, colour: CHANNEL_LINE_COLOURS[at % CHANNEL_LINE_COLOURS.length], points: pointOf((point) => dayFigure(point, at, eventsAt)) };
    }),
    // With every channel ticked, the grey line goes.
    ...(ticked.length < every.length ? [{
      key: "rest", name: tc("everythingElse"), colour: CHART_SERIES_SLATE,
      points: pointOf((point) => every.reduce((sum, channel, at) => (ticked.includes(channel) ? sum : sum + dayFigure(point, at, eventsAt)), 0)),
    }] : []),
  ];
  const counting = tickedEvents.length === 0 ? "visits" : "times";
  const title = tickedEvents.length === 0 ? t(`title.visits.${step}`)
    : tickedEvents.length === 1 ? t(`title.event.${step}`, { event: eventName(tickedEvents[0]) })
      : t(`title.events.${step}`);
  const controls: ExplorerControl[] = [
    { kind: "ticks", key: "channels", label: t("channels"), everyWord: t("everyChannel"), choices: every.map((channel) => ({ key: channel, label: channel })), ticked, onChange: setChannels },
    ...(events.length > 0 ? [{
      kind: "ticks" as const, key: "events", label: t("events"), everyWord: t("everyEvent"),
      choices: events.map((one) => ({ key: one.eventName, label: one.counted ? eventName(one.eventName) : t("notCounted", { event: eventName(one.eventName) }) })),
      ticked: tickedEvents, onChange: setEvents,
    }] : []),
  ];
  return (
    <DaysChart
      title={title}
      hint={(coarse) => [
        t(counting === "visits" ? "hint" : tickedEvents.length === 1 ? "hintEvent" : "hintEvents", { now: spanWords.now }),
        coarse ? tc(`coarse.${step === "month" ? "week" : step}`) : null,
      ].filter(Boolean).join(" ")}
      exportName="google-analytics-channels-each-day"
      csvDay={t("csvDay")}
      host={status?.host ?? ""}
      step={step}
      waiting={chart === undefined ? undefined : chart.live ? t("collecting") : null}
      controls={controls}
      nothingTicked={ticked.length === 0 && every.length > 0 ? t("nothingTicked") : null}
      lines={lines}
      figure={t(counting)}
      plain
      anything={(rows) => rows.some((row) => lines.some((line) => Number(row[line.key]) > 0))}
      empty={t("empty")}
      height={240}
    />
  );
}

type Split = "kind" | "device";
const SPLITS: readonly Split[] = ["kind", "device"];
type SquareCount = "visits" | "bought" | "boughtPer100" | "conversions" | "conversionsPer100";
const SQUARE_COUNTS: readonly SquareCount[] = ["visits", "bought", "boughtPer100", "conversions", "conversionsPer100"];
const SHOP_COUNTS: readonly SquareCount[] = ["visits", "bought", "boughtPer100", "conversions"];
const OTHER_COUNTS: readonly SquareCount[] = ["visits", "conversions", "conversionsPer100"];

type Squares = NonNullable<ReturnType<typeof useSquares>>;
type SquareFigures = Squares["rows"][number]["cells"][number];

function useSquares(split: Split) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  return useQuery(api.googleAnalyticsChannelPageReads.analyticsChannelSquares, status?.connection?.newestDay ? { ...args, split } : "skip");
}

/** A count's figure in a square, or a row's: what was bought or the events, for what it's a rate of too. */
function figureOf(figures: SquareFigures, count: SquareCount): { now: number; before: number | null } {
  if (count === "bought" || count === "boughtPer100") return { now: figures.bought, before: figures.boughtBefore };
  if (count === "conversions" || count === "conversionsPer100") return { now: figures.conversions, before: figures.conversionsBefore };
  return { now: figures.visits, before: figures.visitsBefore };
}

/** For every 100 visits. What was bought can't read over 100 by accident; events can, as one visit can count many times, and the key says so. */
export function squareRate(figures: SquareFigures, count: SquareCount, which: "now" | "before" = "now"): number | null {
  const visits = which === "now" ? figures.visits : figures.visitsBefore;
  const part = figureOf(figures, count)[which];
  if (visits === null || part === null || visits <= 0) return which === "now" ? 0 : null;
  const rate = (100 * part) / visits;
  return count === "boughtPer100" ? Math.min(100, rate) : rate;
}

const isRate = (count: SquareCount) => count === "boughtPer100" || count === "conversionsPer100";

/** A row or column's figures for the eye, in the names its rules read. */
const figuresForEye = (figures: SquareFigures) => ({
  visits: figures.visits, visitsBefore: figures.visitsBefore,
  purchases: figures.bought, purchasesBefore: figures.boughtBefore,
  conversions: figures.conversions, conversionsBefore: figures.conversionsBefore,
});

/**
 * Where each channel's visits started (Anthony, 2026-11-06: "What drop downs can we add here to make this more interactive"): the same
 * part as on Conversions and Campaigns, with five menus. Brighter means a bigger share of that channel, or on a rate, more than other
 * channels. Pressing a row's name opens that channel's page.
 */
export function ChannelSquaresCard({ channels }: { channels: Channels }) {
  const t = useTranslations("googleAnalytics.channelsPage.squares");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const hrefFor = useAnalyticsHref(args.siteId);
  const { sells, every } = channels;
  const spans = spansOfList(every);
  const words = useSpanWords(...spans);
  const inWords = useSpanInWords(...spans);
  const [split, setSplit] = useSiteParam<Split>("split", "kind", SPLITS);
  const [chosenCount, setCount] = useSiteParam<SquareCount>("count", "visits", SQUARE_COUNTS);
  const [compareTo, setCompare] = useSiteParam<"none" | "before">("compare-squares", "none", ["none", "before"]);
  const [pickedChannels, setChannels] = useSiteTicks("square-channels");
  const [pickedKinds, setKinds] = useSiteTicks("square-kinds");
  const byKind = useSquares("kind");
  const byDevice = useSquares("device");
  const answer = split === "device" ? byDevice : byKind;
  const kindName = useKindName(useMemo(() => [...(byKind?.columns ?? []).map((one) => ({ kind: one.key, name: one.name })), ...(byKind?.columns ?? []).flatMap((one) => one.holds ?? [])], [byKind?.columns]));
  const counts = sells ? SHOP_COUNTS : OTHER_COUNTS;
  const count: SquareCount = counts.includes(chosenCount) ? chosenCount : "visits";
  const compare = compareTo === "before" && Boolean(answer?.hasBefore);
  const columnName = (key: string, name: string | null) => (split === "device" ? tf(`devices.${key}`)
    : key === OTHER_KIND ? t("otherGroups") : key === NOT_SORTED_KIND ? t("notSorted") : key === NO_PAGE_KIND ? t("noPage") : name ?? kindName(key));
  const seenKinds = useMemo(() => seenPart(byKind, (key, own) => (key === OTHER_KIND ? t("otherGroups") : key === NOT_SORTED_KIND ? t("notSorted") : key === NO_PAGE_KIND ? t("noPage") : own ?? kindName(key))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `kindName` is new each draw; the read decides.
    [byKind, t]);
  const seenDevices = useMemo(() => seenPart(byDevice, (key) => tf(`devices.${key}`)), [byDevice, tf]);
  useSeesPart("channelSquares", seenKinds);
  useSeesPart("channelDevices", seenDevices);
  const allRows = answer?.rows ?? [];
  const allColumns = answer?.columns ?? [];
  const everyChannel = allRows.map((row) => row.channel);
  const shownChannels = (pickedChannels ?? everyChannel).filter((channel) => everyChannel.includes(channel));
  const kindKeys = allColumns.map((column) => column.key);
  const shownKinds = split === "device" ? kindKeys : (pickedKinds ?? kindKeys).filter((key) => kindKeys.includes(key));
  const shownColumns = allColumns.map((column, at) => ({ column, at })).filter((one) => shownKinds.includes(one.column.key));
  const rows = allRows.filter((row) => shownChannels.includes(row.channel));
  const columns: ConversionsMapColumn[] = shownColumns.map(({ column }) => ({
    key: column.key, name: columnName(column.key, column.name), visits: column.visits, visitsBefore: null,
    ...(column.holds ? { hover: t("otherHolds", { names: column.holds.map((one) => one.name ?? kindName(one.kind)).join(", ") }) } : {}),
  }));
  const rawOf = new Map(rows.map((row) => [row.channel, row]));
  const mapRows: ConversionsMapRow[] = rows.map((row) => ({
    eventName: row.channel, name: row.channel, counted: true,
    cells: shownColumns.map(({ at }) => {
      const part = figureOf(row.cells[at], count);
      return { visits: part.now, times: part.now, visitsBefore: part.before, timesBefore: part.before };
    }),
  }));
  // A rate's brightest, column by column, from squares with enough visits to trust.
  const tops = shownColumns.map(({ at }) => Math.max(0, ...allRows.filter((row) => row.cells[at].visits >= SHADE_FLOOR).map((row) => squareRate(row.cells[at], count) ?? 0)));
  const hover = (row: ConversionsMapRow, column: ConversionsMapColumn) => {
    const raw = rawOf.get(row.eventName);
    const at = shownColumns.find((one) => one.column.key === column.key)?.at;
    const cell = at === undefined ? undefined : raw?.cells[at];
    if (!raw || !cell) return "";
    const line = (word: string, now: number, before: number | null) => [
      t(`hover.${word}`, { when: inWords.now, figure: formatNumber(now) }),
      ...(before !== null ? [t(`hover.${word}`, { when: inWords.before, figure: formatNumber(before) })] : []),
    ];
    return [
      t("hover.head", { channel: row.name, column: column.name }),
      ...line("visits", cell.visits, cell.visitsBefore),
      t("hover.ofChannel", { share: raw.visits > 0 ? Math.round((100 * cell.visits) / raw.visits) : 0 }),
      ...(sells ? line("bought", cell.bought, cell.boughtBefore) : []),
      ...line(sells ? "conversions" : "events", cell.conversions, cell.conversionsBefore),
    ].join("\n");
  };
  const mapWords: ConversionsMapWords = {
    rowTotal: (row) => t("rowTotal", { visits: formatNumber(rawOf.get(row.eventName)?.visits ?? 0) }),
    hover,
    hoverBefore: () => "",
    figures: compare ? t("keyCompare", { before: inWords.before }) : t(`key.${!sells && count === "conversions" ? "events" : count}`),
    shades: t(isRate(count) ? "shadesRate" : "shadesShare"),
    empty: t("nobody"),
  };
  const countName = (one: SquareCount) => t(!sells && one === "conversions" ? "counts.events" : `counts.${one}`);
  const toolbar: ExplorerControl[] = [
    { kind: "ticks", key: "channels", label: t("channels"), everyWord: t("everyChannel"), choices: everyChannel.map((channel) => ({ key: channel, label: channel })), ticked: shownChannels, onChange: setChannels },
    ...(split === "kind" ? [{
      kind: "ticks" as const, key: "classifications", label: t("classifications"), everyWord: t("everyClassification"),
      choices: allColumns.map((column) => ({ key: column.key, label: columnName(column.key, column.name) })), ticked: shownKinds, onChange: setKinds,
    }] : []),
    { kind: "select", key: "split", label: t("splitBy"), value: split, options: SPLITS.map((one) => ({ value: one, label: t(`splits.${one}`) })), onChange: (next) => setSplit(next as Split) },
    { kind: "select", key: "count", label: t("count"), value: count, options: counts.map((one) => ({ value: one, label: countName(one) })), onChange: (next) => setCount(next as SquareCount) },
    ...(answer?.hasBefore ? [{
      kind: "select" as const, key: "compare", label: t("compareWith"), value: compare ? "before" : "none",
      options: [{ value: "none", label: t("noComparison") }, { value: "before", label: words.beforeNamed ?? words.before }],
      onChange: (next: string) => setCompare(next as "none" | "before"),
    }] : []),
  ];
  const nothingTicked = rows.length === 0 || columns.length === 0;
  const hint = [t(count === "visits" ? `hint.${split}` : `hintOther.${split}`), answer?.everyDevice ? t("everyDevice") : null].filter(Boolean).join(" ");
  return (
    <ConversionsMap
      title={t("title")}
      hint={hint}
      controls={<ExplorerToolbar controls={toolbar} />}
      columns={columns}
      rows={mapRows}
      count="events"
      compare={false}
      words={mapWords}
      newWord=""
      rowHref={(row) => hrefFor("channels/channel", { key: row.eventName })}
      squareOf={(row, column, cell, at) => {
        const raw = rawOf.get(row.eventName);
        const figures = raw?.cells[shownColumns[at]?.at ?? 0];
        const whole = raw ? figureOf(raw, count).now : 0;
        const part = figures ? figureOf(figures, count) : { now: 0, before: null };
        if (isRate(count) && figures) {
          const rate = squareRate(figures, count) ?? 0;
          const was = squareRate(figures, count, "before");
          const note = compare ? changeWords(rate, was, t("new")) ?? undefined : t(count === "boughtPer100" ? "boughtNote" : "eventsNote", { figure: formatNumber(part.now) });
          return { text: per100Words(rate), note, share: tops[at] > 0 ? Math.min(1, rate / tops[at]) * 0.9 : 0 };
        }
        const note = compare ? changeWords(part.now, part.before, t("new")) ?? undefined : whole > 0 ? `${Math.round((100 * part.now) / whole)}%` : undefined;
        return { text: formatNumber(cell.times), note, share: whole > 0 ? part.now / whole : 0 };
      }}
      pickWord={t("pick")}
      exportName="google-analytics-channel-squares"
      csv={() => toCsv(
        [t("csvChannel"), ...columns.map((column) => column.name)],
        rows.map((row) => [row.channel, ...shownColumns.map(({ at }) => (isRate(count) ? Math.round((squareRate(row.cells[at], count) ?? 0) * 10) / 10 : figureOf(row.cells[at], count).now))]),
      )}
      caption={status?.host}
      emptyText={answer === undefined ? undefined : answer.collecting ? t("collecting") : nothingTicked && allRows.length > 0 ? t("nothingTicked") : t("none")}
    />
  );
}

/** A read of the squares as the eye reads it, each column in the page's words. */
function seenPart(read: Squares | undefined, name: (key: string, own: string | null) => string) {
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

type StepsAnswer = NonNullable<ReturnType<typeof useSteps>>;
type StepFigures = StepsAnswer["channels"][number];

function useSteps(on: boolean) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  return useQuery(api.googleAnalyticsChannelPageReads.analyticsChannelSteps, on && status?.connection?.newestDay ? args : "skip");
}

/**
 * How far people got (Anthony, 2026-11-06: "can we add this to the page"): the steps a visit goes through, for everywhere or one
 * channel. They count visits, so no step can pass 100%. A step the website doesn't send is left off, rather than drawn as nobody.
 * A website with nothing bought leaves this chart off, as its other figures aren't steps a visit goes through in order.
 */
export function ChannelStepsCard({ channels }: { channels: Channels }) {
  const t = useTranslations("googleAnalytics.channelsPage.steps");
  const status = useAnalyticsStatus();
  const answer = useSteps(channels.sells);
  const [chosen, setChosen] = useSiteParam<string>("steps", EVERYWHERE);
  const offered = useMemo(() => (answer?.channels ?? []).filter((row) => row.arrived >= BEST_FOR_FLOOR), [answer?.channels]);
  const row = offered.find((one) => one.channel === chosen) ?? null;
  const stepNames = useMemo(() => ({ arrived: t("arrived"), stayed: t("stayed"), basket: t("basket"), checkout: t("checkout"), bought: t("bought") }), [t]);
  const seen = useMemo(() => (answer && !answer.collecting ? { steps: stepNames, tracks: answer.tracks, ...(answer.everywhere ? { everywhere: answer.everywhere } : {}), channels: answer.channels.map(({ channel, ...steps }) => ({ name: channel, ...steps })) } : undefined), [answer, stepNames]);
  useSeesPart("channelSteps", seen);
  if (!channels.sells) return null;
  const flowOf = (figures: Omit<StepFigures, "channel">): FlowStep[] => [
    { id: "arrived", name: t("arrived"), visits: figures.arrived },
    { id: "stayed", name: t("stayed"), visits: figures.stayed },
    ...(answer?.tracks.basket ? [{ id: "basket", name: t("basket"), visits: figures.basket }] : []),
    ...(answer?.tracks.checkout ? [{ id: "checkout", name: t("checkout"), visits: figures.checkout }] : []),
    { id: "bought", name: t("bought"), visits: figures.bought },
  ];
  const figures = row ?? answer?.everywhere ?? null;
  const flowWords: StepFlowWords = {
    everyVisit: t("everyVisit"),
    ofAll: (percent) => t("ofAll", { percent }),
    stopped: (visits) => t("stopped", { visits }),
    visits: (visits) => t("visits", { visits }),
    visitsLabel: t("visitsLabel"),
    ofAllLabel: t("ofAllLabel"),
    stoppedLabel: t("stoppedLabel"),
    ofStepLabel: (name) => t("ofStep", { name }),
    route: (from, to) => t("route", { from, to }),
    stoppedKey: t("stoppedKey"),
  };
  const everyRow = [...(answer?.everywhere ? [{ name: t("everywhere"), figures: answer.everywhere }] : []), ...(answer?.channels ?? []).map((one) => ({ name: one.channel, figures: one }))];
  return (
    <MapCard
      title={t("title")}
      hint={[t("hint"), answer?.everyDevice ? t("everyDevice") : null].filter(Boolean).join(" ")}
      exportName="google-analytics-channel-steps"
      csv={() => toCsv(
        [t("csvChannel"), ...flowOf({ arrived: 0, stayed: 0, basket: 0, checkout: 0, bought: 0 }).map((step) => step.name)],
        everyRow.map((one) => [one.name, ...flowOf(one.figures).map((step) => step.visits)]),
      )}
      host={status?.host ?? ""}
      controls={[{
        kind: "select", key: "steps", label: t("cameFrom"), value: row ? row.channel : EVERYWHERE,
        options: [{ value: EVERYWHERE, label: t("everywhere") }, ...offered.map((one) => ({ value: one.channel, label: one.channel }))],
        onChange: setChosen,
      }]}
      loading={answer === undefined}
      message={answer?.collecting ? t("collecting") : figures ? null : t("empty")}
    >
      {figures ? <StepFlowChart steps={flowOf(figures)} words={flowWords} format={formatNumber} /> : null}
    </MapCard>
  );
}

/**
 * The page's eye: every channel with its boxes' rule's picks, the whole website's own figures and each part's own (`useSeesPart`), whatever
 * the menus show (channels-new-page-plan-2026-11-06.md, step 8). "Do first" may send the reader to where these figures are looked into.
 */
export function ChannelsSees({ channels }: { channels: Channels }) {
  const tm = useTranslations("googleAnalytics.menu");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const hrefFor = useAnalyticsHref(args.siteId);
  const eyeNames = useEyeNames();
  const website = useWebsiteForEye();
  const { every, overview, sells } = channels;
  const data = useMemo(() => {
    if (!every) return undefined;
    const now = overview?.now;
    const boxes = channelBoxes(boxRowsOf(channels), { visits: now?.visits ?? null, done: now ? (sells ? now.purchases : now.conversions) : null });
    return {
      names: eyeNames,
      sells,
      boxes,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `channels` is new each draw; these decide.
  }, [every, overview, sells, eyeNames, website]);
  const links = useMemo(() => [
    { label: tm("campaigns"), href: hrefFor("campaigns") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor is new each draw; the dates, device and country decide.
  ], [tm, args.period, args.device, args.country]);
  // No visits in these dates: nothing to write about, and a press would only say so, minutes later.
  return <AnalyticsSees screen="channelsPage" seen={null} keep={false} currency={status?.connection?.currency ?? null} data={data} links={links} writes={every?.total !== 0} />;
}
