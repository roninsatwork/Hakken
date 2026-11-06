"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { bestFor, biggestChange } from "@/convex/utils/channelPicks";
import { endingsOf, isFirstStep, isShop, serviceSteps, shopSteps, squaresOutOf } from "@/convex/utils/conversionSteps";
import { outOfTotal } from "@/convex/utils/outOfTotal";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { overviewFigures } from "@/convex/utils/sees/overviewFigures";
import { CHART_COMPARATOR_GREY, CHART_ENGAGEMENT_NONE, CHART_ENGAGEMENT_RAMP, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { DaysChart, type DaysLine, type DaysPoint } from "@/src/ui/components/screens/DaysChart";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HundredGrid, type HundredGroup } from "@/src/ui/components/screens/HundredGrid";
import { HundredStrips, stripColour, type StripSegment } from "@/src/ui/components/screens/HundredStrips";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { BeforeLine } from "./AnalyticsFigures";
import { useEyeNames } from "./useEyeFigures";
import { stepKey } from "./stepScale";
import { useAnalyticsArgs, useAnalyticsHref, useStep, type AnalyticsStatus } from "./useAnalytics";
import { useEventName } from "./useEventName";
import { useVisitorName } from "./useVisitorName";
import { spansOfList, useSpanInWords, useSpanWords } from "./VisitsCharts";

/**
 * What Overview reads and says (docs/plans/active/overview-new-page-plan-2026-11-06.md; boards "The new page so far" and "For a
 * service business"). Every chart is a shared part (`DaysChart`, `HundredGrid`, `HundredStrips`, each in its card), as Anthony
 * asked: "they have to be built as multi use shared components". What's here is the reading, the words and the figures each
 * part is handed. The rules live in plain code, so the eye and Ask Hakken say the same.
 */

export const SPLITS = ["channel", "kind", "device", "visitorType"] as const;
export type Split = (typeof SPLITS)[number];
type SplitAnswer = FunctionReturnType<typeof api.googleAnalyticsOverviewSplits.analyticsOverviewSplit>;
export type SplitRow = SplitAnswer["rows"][number];
type OverviewAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsReads.analyticsOverview>>;

/** Under this many visits a share moves by chance, so the page says it's only a rough guide. */
const ROUGH_GUIDE = 100;
/** A channel needs this many visits to be offered on the squares' Came from menu. */
const CAME_FROM_FLOOR = 100;
/** The most of a website's own events on a menu. */
const BUSIEST_EVENTS = 4;

/** Everything the page's parts share: its figures, whether it's a shop, each way of splitting its visits, and its dates in words. */
export function useOverviewReads(status: AnalyticsStatus) {
  const args = useAnalyticsArgs();
  const ready = Boolean(status.connection?.newestDay);
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, args);
  // The list gives the dates set against each other, and the eye every channel as Channels' table reads it.
  const channelList = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? { ...args, list: "channel", sort: "visits", direction: "desc", page: 1, rows: 25 } : "skip");
  const channel = useQuery(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, ready ? { ...args, split: "channel" } : "skip");
  const kind = useQuery(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, ready ? { ...args, split: "kind" } : "skip");
  const device = useQuery(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, ready ? { ...args, split: "device" } : "skip");
  const visitorType = useQuery(api.googleAnalyticsOverviewSplits.analyticsOverviewSplit, ready ? { ...args, split: "visitorType" } : "skip");
  // Over 12 months, so the squares' title doesn't change with the dates.
  const year = useQuery(api.googleAnalyticsReads.analyticsOverview, ready ? { ...args, period: "last12Months", device: "" } : "skip");
  const shop = isShop(status.connection?.shop, overview?.now?.purchases, overview?.before?.purchases);
  const yearNow = year?.now ?? null;
  const cells = yearNow ? squaresOutOf(shop ? yearNow.purchases : yearNow.conversions, yearNow.visits) : 100;
  return { overview, channelList, splits: { channel, kind, device, visitorType }, shop, cells: cells as 100 | 1000 };
}
export type OverviewReads = ReturnType<typeof useOverviewReads>;

/** A row's name, in the reader's words, however the visits are split. */
export function useSplitNames() {
  const t = useTranslations("googleAnalytics.overview.names");
  const tf = useTranslations("googleAnalytics.filters.devices");
  const visitor = useVisitorName();
  return useMemo(() => (split: Split, row: Pick<SplitRow, "key" | "name">) => {
    if (split === "device") return tf.has(row.key) ? tf(row.key) : row.key;
    if (split === "visitorType") return visitor(row.key);
    if (split === "kind") return row.key === NOT_SORTED_KIND ? t("notSorted") : row.key === OTHER_KIND ? t("otherGroups") : row.name ?? row.key;
    return row.key;
  }, [t, tf, visitor]);
}

/** "These dates", where the words start a sentence. */
const capitalFirst = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
const per100 = (part: number, visits: number) => (visits > 0 ? (100 * part) / visits : 0);
const oneDecimal = (value: number) => value.toFixed(1);
const quiet = (words: string) => <span className="text-secondary">{words}</span>;

function useDates(reads: OverviewReads) {
  const dates = spansOfList(reads.channelList);
  return { spans: useSpanWords(...dates), inWords: useSpanInWords(...dates) };
}

/** How many came, what came of it, what moved most, and where to look. Each opens the page behind it. Nothing true to say shows a dash. */
export function OverviewBoxes({ reads }: { reads: OverviewReads }) {
  const t = useTranslations("googleAnalytics.overview.boxes");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const { spans, inWords } = useDates(reads);
  const { shop, overview, splits } = reads;
  const now = overview?.now;
  if (!now) return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const before = overview?.before ?? null;
  const rows = splits.channel?.rows ?? [];
  const wins = (row: SplitRow) => (shop ? row.bought : row.conversions);
  const figures = rows.map((row) => ({ key: row.key, visits: row.visits, visitsBefore: row.visitsBefore, wins: wins(row) }));
  const moved = biggestChange(figures);
  const best = bestFor(figures);
  const done = shop ? now.purchases : now.conversions;
  const doneBefore = before ? (shop ? before.purchases : before.conversions) : null;
  const rate = per100(done, now.visits);
  const rateWords = oneDecimal(rate);
  const doneDetail = () => {
    const first = t("rate", { rate: rateWords });
    if (doneBefore === null || !before) return first;
    const was = oneDecimal(per100(doneBefore, before.visits));
    const compare = was === rateWords ? t("rateSame", { before: inWords.before }) : t("rateWas", { was, before: inWords.before });
    const gap = done - doneBefore;
    const unit = shop ? "sales" : "events";
    const moveWords = gap === 0 ? "" : t(gap < 0 ? `fewer.${unit}` : `more.${unit}`, { count: formatNumber(Math.abs(gap)) });
    return `${first} ${compare}${moveWords}.`;
  };
  return (
    <FigureRow columns={4}>
      <Figure label={t("visits")} href={hrefFor("visits")} value={formatNumber(now.visits)} detail={<BeforeLine now={now.visits} before={before?.visits} named={spans.before} />} />
      <Figure label={t(shop ? "bought" : "events")} href={hrefFor(shop ? "products" : "conversions")} value={formatNumber(done)} detail={quiet(doneDetail())} />
      <Figure
        label={t("biggest")}
        href={moved ? hrefFor("channels/channel", { key: moved.key }) : hrefFor("channels")}
        named
        value={moved ? moved.key : "–"}
        detail={quiet(moved ? t(moved.change < 0 ? "fewerVisits" : "moreVisits", { count: formatNumber(Math.abs(moved.change)), before: inWords.before }) : t("nothingMoved"))}
      />
      <Figure
        label={t(shop ? "sellsBest" : "bestForEvents")}
        href={best ? hrefFor("channels/channel", { key: best.key }) : hrefFor("channels")}
        named
        value={best ? best.key : "–"}
        detail={quiet(best ? t(shop ? "bestRate" : "bestRateEvents", { rate: oneDecimal(best.per100), site: rateWords }) : t("tooFewToSay"))}
      />
    </FigureRow>
  );
}

type ChartAnswer = FunctionReturnType<typeof api.googleAnalyticsChartReads.analyticsChart>;
type DayRow = { day: string; lastDay?: string; visits: number; engaged: number; views: number; length: number; conversions: number; events: readonly number[] };
type Line = { id: string; name: string; plain?: (row: DayRow) => number; ratio?: { top: (row: DayRow) => number; bottom: (row: DayRow) => number; scale: number } };

/** A figure that's a share of another, worked out for each step from its own sums. Adding up each day's share would mean nothing. */
function ratioPoints(rows: readonly DayRow[], step: "day" | "week" | "month", ratio: NonNullable<Line["ratio"]>): DaysPoint[] {
  const buckets = new Map<string, { first: string; top: number; bottom: number }>();
  for (const row of rows) {
    const key = stepKey(step, row.day, row.lastDay);
    const held = buckets.get(key) ?? { first: row.day, top: 0, bottom: 0 };
    if (row.day < held.first) held.first = row.day;
    held.top += ratio.top(row);
    held.bottom += ratio.bottom(row);
    buckets.set(key, held);
  }
  return [...buckets.values()].map((bucket) => ({ day: bucket.first, value: bucket.bottom > 0 ? (ratio.scale * bucket.top) / bucket.bottom : 0 }));
}

/** The website's figures over the dates, against the same days of the dates before where those are held day by day. */
export function OverviewDaysCard({ reads, status, onDays }: { reads: OverviewReads; status: AnalyticsStatus; onDays?: (days: ChartAnswer | undefined) => void }) {
  const t = useTranslations("googleAnalytics.overview.days");
  const args = useAnalyticsArgs();
  const [step] = useStep();
  const eventName = useEventName();
  const { spans, inWords } = useDates(reads);
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, args);
  const before = useQuery(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, args);
  const { shop } = reads;
  const events = chart?.events ?? [];
  const timesOf = (name: string) => {
    const at = events.indexOf(name);
    return (row: DayRow) => (at < 0 ? 0 : row.events[at] ?? 0);
  };
  const lines: Line[] = [
    { id: "visits", name: t("show.visits"), plain: (row) => row.visits },
    { id: "views", name: t("show.views"), plain: (row) => row.views },
    { id: "pages", name: t("show.pages"), ratio: { top: (row) => row.views, bottom: (row) => row.visits, scale: 1 } },
    { id: "length", name: t("show.length"), ratio: { top: (row) => row.length, bottom: (row) => row.visits, scale: 1 } },
    { id: "stayed", name: t("show.stayed"), plain: (row) => row.engaged },
    { id: "left", name: t("show.left"), ratio: { top: (row) => Math.max(0, row.visits - row.engaged), bottom: (row) => row.visits, scale: 100 } },
    ...(shop ? [
      ...(events.includes("add_to_cart") ? [{ id: "added", name: t("show.added"), plain: timesOf("add_to_cart") }] : []),
      ...(events.includes("begin_checkout") ? [{ id: "checkout", name: t("show.checkout"), plain: timesOf("begin_checkout") }] : []),
      ...(events.includes("purchase") ? [
        { id: "bought", name: t("show.bought"), plain: timesOf("purchase") },
        { id: "boughtRate", name: t("show.boughtRate"), ratio: { top: timesOf("purchase"), bottom: (row: DayRow) => row.visits, scale: 100 } },
      ] : []),
      { id: "conversions", name: t("show.conversions"), plain: (row: DayRow) => row.conversions },
    ] : [
      { id: "conversions", name: t("show.events"), plain: (row: DayRow) => row.conversions },
      { id: "conversionsRate", name: t("show.eventsRate"), ratio: { top: (row: DayRow) => row.conversions, bottom: (row: DayRow) => row.visits, scale: 100 } },
      ...busiestOf(reads.splits.channel).map((name) => ({ id: `event:${name}`, name: eventName(name), plain: timesOf(name) })),
    ]),
  ];
  const ids = lines.map((line) => line.id);
  const [chosen, setShow] = useSiteParam<string>("show", "visits");
  const id = ids.includes(chosen) ? chosen : "visits";
  const line = lines.find((one) => one.id === id) ?? lines[0];
  const [against, setAgainst] = useSiteParam<"before" | "none">("against", "before", ["before", "none"]);
  const held = Boolean(before?.held) && (before?.points.length ?? 0) > 0;
  const comparing = against === "before" && held;
  const pointsOf = (rows: readonly DayRow[]): DaysPoint[] => (line.ratio
    ? ratioPoints(rows, step, line.ratio)
    : rows.map((row) => ({ day: row.day, ...(row.lastDay ? { lastDay: row.lastDay } : {}), value: line.plain!(row) })));
  // The before read lays each day over the same place in the dates chosen, so a day September didn't have has no figure.
  const drawn: DaysLine[] = [
    { key: "now", name: inWords.now, colour: CHART_SERIES_ORANGE, points: pointsOf(chart?.points ?? []) },
    ...(comparing && before ? [{ key: "before", name: inWords.before, colour: CHART_COMPARATOR_GREY, dashed: true, gaps: true, points: pointsOf(before.points as unknown as DayRow[]) }] : []),
  ];
  onDays?.(chart);
  return (
    <DaysChart
      title={t("title", { name: line.name, step })}
      hint={<span title={t("listsDiffer")}>{comparing ? t("hintAgainst", { now: capitalFirst(inWords.now), before: inWords.before }) : held ? t("hint", { now: capitalFirst(inWords.now) }) : t("hintNotHeld", { now: capitalFirst(inWords.now) })}</span>}
      exportName="google-analytics-overview"
      csvDay={t("csvDay")}
      host={status.host}
      step={step}
      waiting={chart === undefined ? undefined : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: id, options: lines.map((one) => ({ value: one.id, label: one.name })), onChange: setShow },
        ...(held ? [{
          kind: "select" as const, key: "against", label: t("compareWith"), value: against,
          options: [{ value: "before", label: spans.beforeNamed ?? spans.before }, { value: "none", label: t("nothing") }],
          onChange: (next: string) => setAgainst(next as "before" | "none"),
        }] : []),
      ]}
      lines={drawn}
      figure={line.name}
      anything={(rows) => rows.some((row) => Number(row.now) > 0)}
      empty={t("empty")}
      height={280}
    />
  );
}

/** The website's busiest counted events, for a service website's menus: the rule says up to four. */
function busiestOf(split: SplitAnswer | undefined): string[] {
  if (!split) return [];
  const timesOf = (at: number) => split.rows.reduce((sum, row) => sum + (row.times[at] ?? 0), 0);
  return split.events
    .map((event, at) => ({ name: event.name, counted: event.counted, times: timesOf(at) }))
    .filter((event) => event.counted && event.times > 0)
    .sort((left, right) => right.times - left.times)
    .slice(0, BUSIEST_EVENTS)
    .map((event) => event.name);
}

/** Auto Setup's say on a first step, over the rule on its name, where it has one. */
function firstStepOf(status: AnalyticsStatus) {
  const said = new Map((status.connection?.events ?? []).map((event) => [event.eventName, event.firstStep]));
  return (name: string) => said.get(name) ?? isFirstStep(name);
}

const SHOP_STAGES = [
  { key: "left", colour: CHART_ENGAGEMENT_NONE },
  { key: "looked", colour: CHART_ENGAGEMENT_RAMP[0] },
  { key: "added", colour: CHART_ENGAGEMENT_RAMP[2] },
  { key: "checkout", colour: CHART_ENGAGEMENT_RAMP[4] },
  { key: "bought", colour: CHART_SERIES_ORANGE },
] as const;
const SERVICE_STAGES = [
  { key: "left", colour: CHART_ENGAGEMENT_NONE },
  { key: "looked", colour: CHART_ENGAGEMENT_RAMP[0] },
  { key: "clicked", colour: CHART_ENGAGEMENT_RAMP[3] },
  { key: "form", colour: CHART_SERIES_ORANGE },
] as const;
const KIND_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_SLATE, CHART_COMPARATOR_GREY];

/** Each event's visits or times added up across a split's rows, for the whole website. */
function wholeOf(split: SplitAnswer | undefined, figures: OverviewAnswer["now"], figuresBefore: OverviewAnswer["before"]) {
  const count = split?.events.length ?? 0;
  const sum = (pick: (row: SplitRow) => readonly number[] | null) => Array.from({ length: count }, (_, at) => (split?.rows ?? []).reduce((total, row) => total + (pick(row)?.[at] ?? 0), 0));
  return {
    now: { visits: figures?.visits ?? 0, stayed: figures?.engaged ?? 0, did: sum((row) => row.did), times: sum((row) => row.times) },
    before: figuresBefore ? { visits: figuresBefore.visits, stayed: figuresBefore.engaged, did: sum((row) => row.didBefore), times: sum((row) => row.timesBefore) } : null,
  };
}

type Figures = { visits: number; stayed: number; did: readonly number[]; times: readonly number[] };

/** What happens to every 100 visits, or every 1,000 where the thing that counts is rare, with menus for whose visits they are. */
export function OverviewSquaresCard({ reads, status }: { reads: OverviewReads; status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview.squares");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useSplitNames();
  const eventName = useEventName();
  const { spans, inWords } = useDates(reads);
  const { shop, splits, overview, cells: cellsFor } = reads;
  const [came, setCame] = useSiteParam<string>("came", "all");
  const [started, setStarted] = useSiteParam<string>("started", "all");
  const [deviceChoice, setDeviceChoice] = useSiteParam<string>("squaresDevice", "all");
  const [startChoice, setStart] = useSiteParam<string>("start", "0");
  const [mode, setMode] = useSiteParam<"visits" | "kinds">("squares", "visits", ["visits", "kinds"]);
  const [compare, setCompare] = useSiteParam<"before" | "website" | "none">("squaresAgainst", "before", ["before", "website", "none"]);
  const channelRows = (splits.channel?.rows ?? []).filter((row) => row.visits >= CAME_FROM_FLOOR);
  const kindRows = splits.kind?.rows ?? [];
  const deviceRows = splits.device?.rows ?? [];
  // The page's own Device menu narrows everything: the squares' menu then shows that device and can't be changed.
  const pageDevice = args.device;
  // Hakken doesn't hold those figures combined, so choosing one of the three sets the others back.
  const chooseCame = (next: string) => { setCame(next); if (next !== "all") { setStarted("all"); setDeviceChoice("all"); } };
  const chooseStarted = (next: string) => { setStarted(next); if (next !== "all") { setCame("all"); setDeviceChoice("all"); } };
  const chooseDevice = (next: string) => { setDeviceChoice(next); if (next !== "all") { setCame("all"); setStarted("all"); } };
  const whole = wholeOf(splits.channel, overview?.now ?? null, overview?.before ?? null);
  const toFigures = (row: SplitRow): { now: Figures; before: Figures | null } => ({
    now: { visits: row.visits, stayed: row.stayed, did: row.did, times: row.times },
    before: row.visitsBefore === null ? null : { visits: row.visitsBefore, stayed: row.stayedBefore ?? 0, did: row.didBefore ?? [], times: row.timesBefore ?? [] },
  });
  const pick = () => {
    if (came !== "all") { const row = channelRows.find((one) => one.key === came); if (row) return { ...toFigures(row), name: nameOf("channel", row), events: splits.channel?.events ?? [] }; }
    if (started !== "all") { const row = kindRows.find((one) => one.key === started); if (row) return { ...toFigures(row), name: nameOf("kind", row), events: splits.kind?.events ?? [] }; }
    if (deviceChoice !== "all" && !pageDevice) { const row = deviceRows.find((one) => one.key === deviceChoice); if (row) return { ...toFigures(row), name: nameOf("device", row), events: splits.device?.events ?? [] }; }
    return { ...whole, name: null as string | null, events: splits.channel?.events ?? [] };
  };
  const subject = pick();
  const subjectEvents = subject.events.map((event) => event.name);
  // A service website's steps are the events it counts, never what it merely records, like a scroll.
  const stepsOf = (figures: Figures, list: SplitAnswer["events"]) => {
    if (shop) return shopSteps(figures, list.map((event) => event.name));
    const kept = list.flatMap((event, at) => (event.counted ? [{ name: event.name, did: figures.did[at] ?? 0 }] : []));
    return serviceSteps({ ...figures, did: kept.map((one) => one.did) }, kept.map((one) => one.name), firstStepOf(status));
  };
  const stages = shop ? SHOP_STAGES : SERVICE_STAGES;
  const start = shop ? Math.min(Number(startChoice) || 0, stages.length - 2) : 0;
  const cells = start === 0 ? cellsFor : 100;
  const stepsNow = stepsOf(subject.now, subject.events).slice(start);
  const stepsBefore = subject.before ? stepsOf(subject.before, subject.events).slice(start) : null;
  const stepsWebsite = stepsOf(whole.now, splits.channel?.events ?? []).slice(start);
  const shownStages = stages.slice(start);
  const endsNow = endingsOf(stepsNow);
  const countsNow = outOfTotal(endsNow, cells);
  const rowsAgainst = compare === "before" ? stepsBefore : compare === "website" ? stepsWebsite : null;
  const endsAgainst = rowsAgainst ? endingsOf(rowsAgainst) : null;
  const countsAgainst = endsAgainst ? outOfTotal(endsAgainst, cells) : null;
  const totalNow = stepsNow[0] ?? 0;
  const againstWord = compare === "before" ? inWords.before : t("yourWebsite");
  const wasLabel = compare === "none" ? "" : compare === "before" ? (stepsBefore ? spans.beforeNamed ?? spans.before : "") : t("yourWebsite");
  const startWord = t(`startWord.${String(start) as "0" | "1" | "2" | "3"}`);
  // A service website whose events are all the real thing has no clicks to show (Korda), so no such row.
  const stageGroups: HundredGroup[] = shownStages.map((stage, at) => ({
    key: stage.key,
    name: t(`stages.${stage.key}`),
    colour: stage.colour,
    count: countsNow[at] ?? 0,
    was: countsAgainst ? String(countsAgainst[at] ?? 0) : undefined,
    readout: [
      { value: formatNumber(endsNow[at] ?? 0), label: t("readout.visits", { when: inWords.now }) },
      { value: t("readout.inEvery", { share: oneDecimal(per100(endsNow[at] ?? 0, totalNow)) }), label: startWord },
      ...(endsAgainst && rowsAgainst ? [{ value: t("readout.inEvery", { share: oneDecimal(per100(endsAgainst[at] ?? 0, rowsAgainst[0] ?? 0)) }), label: againstWord }] : []),
    ],
  })).filter((group, at) => group.key !== "clicked" || (endsNow[at] ?? 0) > 0 || (endsAgainst?.[at] ?? 0) > 0);

  // A service website's other view: how people got in touch, out of every 100 of its events.
  const busiest = busiestOf(splits.channel);
  const countedNames = subject.events.filter((event) => event.counted).map((event) => event.name);
  const rest = countedNames.filter((name) => !busiest.includes(name));
  const timesOfEvents = (figures: Figures) => {
    const of = (name: string) => figures.times[subjectEvents.indexOf(name)] ?? 0;
    return [...busiest.map(of), ...(rest.length > 0 ? [rest.reduce((sum, name) => sum + of(name), 0)] : [])];
  };
  const timesNow = timesOfEvents(subject.now);
  const timesBefore = subject.before ? timesOfEvents(subject.before) : null;
  const kindCounts = outOfTotal(timesNow);
  const kindWas = timesBefore ? outOfTotal(timesBefore) : null;
  const kindGroups: HundredGroup[] = [...busiest, ...(rest.length > 0 ? ["other"] : [])].map((name, at) => ({
    key: name,
    name: name === "other" && rest.length > 0 && at === busiest.length ? t("otherEvents") : eventName(name),
    colour: KIND_COLOURS[at] ?? CHART_COMPARATOR_GREY,
    count: kindCounts[at] ?? 0,
    was: compare !== "none" && kindWas ? String(kindWas[at] ?? 0) : undefined,
    readout: [
      { value: formatNumber(timesNow[at] ?? 0), label: t("readout.times", { when: inWords.now }) },
      ...(timesBefore ? [{ value: formatNumber(timesBefore[at] ?? 0), label: t("readout.times", { when: inWords.before }) }] : []),
    ],
  }));
  const showingKinds = !shop && mode === "kinds";
  const groups = showingKinds ? kindGroups : stageGroups;
  const shownCells = showingKinds ? 100 : cells;
  const options = (rows: readonly SplitRow[], split: Split, first: string) => [{ value: "all", label: first }, ...rows.map((row) => ({ value: row.key, label: nameOf(split, row) }))];
  const loading = !splits.channel || !overview?.now;
  const everyDevice = Boolean(pageDevice) && ((came !== "all" && splits.channel?.everyDevice) || (started !== "all" && splits.kind?.everyDevice));
  const hintParts = [
    showingKinds ? t("hintKinds", { when: inWords.now }) : t("hint", { who: subject.name ?? t("all"), when: inWords.now, count: formatNumber(totalNow), cells: shownCells }),
    ...(totalNow > 0 && totalNow < ROUGH_GUIDE ? [t("rough")] : []),
    ...(everyDevice ? [t("everyDevice")] : []),
  ];
  return (
    <MapCard
      title={showingKinds ? t("titleKinds") : t("title", { cells: shownCells, start })}
      hint={hintParts.join(" ")}
      exportName="google-analytics-overview-squares"
      csv={() => toCsv([t("csvRow"), t("csvCount"), wasLabel || t("csvAgainst")], groups.map((group) => [group.name, group.count, group.was === undefined ? null : Number(group.was)]))}
      host={status.host}
      loading={loading}
      message={totalNow === 0 && !loading ? t("empty") : null}
      controls={[
        { kind: "select", key: "came", label: t("came"), value: came, options: options(channelRows, "channel", t("everywhere")), onChange: chooseCame },
        { kind: "select", key: "started", label: t("started"), value: started, options: options(kindRows, "kind", t("everyClassification")), onChange: chooseStarted },
        pageDevice
          ? { kind: "select", key: "device", label: t("device"), value: pageDevice, options: [{ value: pageDevice, label: nameOf("device", { key: pageDevice, name: null }) }], onChange: () => undefined }
          : { kind: "select", key: "device", label: t("device"), value: deviceChoice, options: options(deviceRows, "device", t("everyDevice_")), onChange: chooseDevice },
        ...(shop
          ? [{ kind: "select" as const, key: "start", label: t("outOf"), value: String(start), options: (["0", "1", "2", "3"] as const).map((value) => ({ value, label: t(`startWord.${value}`) })), onChange: setStart }]
          : [{ kind: "select" as const, key: "mode", label: t("show"), value: mode, options: [{ value: "visits", label: t("showVisits") }, { value: "kinds", label: t("showKinds") }], onChange: (next: string) => setMode(next as "visits" | "kinds") }]),
        { kind: "select", key: "compare", label: t("compareWith"), value: compare, options: [...(stepsBefore ? [{ value: "before", label: spans.beforeNamed ?? spans.before }] : []), { value: "website", label: t("yourWebsite") }, { value: "none", label: t("nothing") }], onChange: (next) => setCompare(next as "before" | "website" | "none") },
      ]}
      under={<MoreLink href={hrefFor(showingKinds || !shop ? "conversions" : "funnel")} words={showingKinds || !shop ? t("moreConversions") : t("moreFunnel")} />}
    >
      <HundredGrid groups={groups} cells={shownCells} nowLabel={inWords.now} wasLabel={wasLabel} label={showingKinds ? t("titleKinds") : t("title", { cells: shownCells, start })} />
    </MapCard>
  );
}

function MoreLink({ href, words }: { href: string; words: string }) {
  return <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] text-secondary hover:text-info">{words}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>;
}

/**
 * What the eye reads of the page: its boxes, its days and the same days before, every way of splitting its visits and the top
 * pages, as `overviewFigures` builds them for Ask Hakken too, with the names its findings use. Never money.
 */
export function useOverviewEye(reads: OverviewReads, status: AnalyticsStatus) {
  const args = useAnalyticsArgs();
  const names = useEyeNames();
  const locale = useLocale();
  const nameOf = useSplitNames();
  const eventName = useEventName();
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, args);
  const daysBefore = useQuery(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, args);
  const ready = Boolean(status.connection?.newestDay);
  const pages = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? { ...args, list: "landing", sort: "visits", direction: "desc", page: 1, rows: 25, leaveOut: true } : "skip");
  const health = status.connection?.health;
  const { overview, splits, shop, cells } = reads;
  return useMemo(() => {
    if (!overview) return overview;
    const eventCodes = Object.fromEntries((splits.channel?.events ?? []).map((event) => [eventName(event.name), event.name]));
    return {
      ...overviewFigures({
        shop, cells, now: overview.now, before: overview.before, chart, daysBefore, splits,
        pages: pages?.rows, rowName: (split, row) => nameOf(split, row), eventName, firstStep: firstStepOf(status),
      }),
      eventCodes,
      locale,
      health,
      names,
    };
    // The words change only with the language, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, chart, daysBefore, splits, pages, health, names, shop, cells, locale]);
}

const SPLIT_PAGE: Record<Split, string> = { channel: "channels", kind: "all-pages", device: "visits", visitorType: "visits" };

/** Who visits, and who buys or gets in touch: two rows of 100 joined by bands. A band that gets wider going down does better in the bottom row. */
export function OverviewBandsCard({ reads, status }: { reads: OverviewReads; status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview.bands");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useSplitNames();
  const eventName = useEventName();
  const { inWords } = useDates(reads);
  const { shop, splits } = reads;
  const [split, setSplit] = useSiteParam<Split>("split", "channel", SPLITS);
  const answer = splits[split];
  const rows = answer?.rows ?? [];
  const events = (answer?.events ?? []).map((event) => event.name);
  const didAt = (row: SplitRow, name: string) => row.did[events.indexOf(name)] ?? 0;
  const timesAt = (row: SplitRow, name: string) => row.times[events.indexOf(name)] ?? 0;
  const busiest = busiestOf(splits.channel);
  type Choice = { value: string; menu: string; title: string; noun: string; figure: (row: SplitRow) => number };
  const september: Choice = { value: "before", menu: t("against.before", { when: inWords.before }), title: t("titleBefore", { when: inWords.before }), noun: t("noun.before", { when: inWords.before }), figure: (row) => row.visitsBefore ?? 0 };
  const views: Choice = { value: "views", menu: t("against.views"), title: t("titleViews"), noun: t("noun.views"), figure: (row) => row.views };
  const choices: Choice[] = [
    ...(shop ? [
      { value: "bought", menu: t("against.bought"), title: t("titleBought"), noun: t("noun.bought"), figure: (row: SplitRow) => row.bought },
      { value: "added", menu: t("against.added"), title: t("titleAdded"), noun: t("noun.added"), figure: (row: SplitRow) => didAt(row, "add_to_cart") },
      { value: "checkout", menu: t("against.checkout"), title: t("titleCheckout"), noun: t("noun.checkout"), figure: (row: SplitRow) => didAt(row, "begin_checkout") },
      { value: "conversions", menu: t("against.conversions"), title: t("titleConversions"), noun: t("noun.conversions"), figure: (row: SplitRow) => row.conversions },
    ] : [
      { value: "conversions", menu: t("against.events"), title: t("titleEvents"), noun: t("noun.events"), figure: (row: SplitRow) => row.conversions },
      ...busiest.map((name) => ({ value: `event:${name}`, menu: eventName(name), title: t("titleEvents"), noun: t("noun.event", { name: eventName(name) }), figure: (row: SplitRow) => timesAt(row, name) })),
    ]),
    views,
    ...(answer?.hasBefore ? [september] : []),
  ];
  const fallback = shop ? "bought" : "conversions";
  const [againstChoice, setAgainst] = useSiteParam<string>("bands", fallback);
  const against = choices.find((choice) => choice.value === againstChoice) ?? choices.find((choice) => choice.value === fallback) ?? choices[0];
  // Pressing one keeps it lit while the menus change, so it can be followed through them all.
  const [lit, setLit] = useState<string | null>(null);
  const visitsAll = rows.reduce((sum, row) => sum + row.visits, 0);
  const bottoms = rows.map((row) => against.figure(row));
  const bottomAll = bottoms.reduce((sum, value) => sum + value, 0);
  const top = outOfTotal(rows.map((row) => row.visits));
  const bottom = outOfTotal(bottoms);
  const segments: StripSegment[] = rows.map((row, at) => ({
    key: row.key,
    name: nameOf(split, row),
    top: top[at] ?? 0,
    bottom: bottom[at] ?? 0,
    colour: stripColour(at),
    readout: [
      { value: formatNumber(row.visits), label: t("readout.visits") },
      { value: t("readout.inEvery", { share: oneDecimal(per100(row.visits, visitsAll)) }), label: t("readout.ofVisits") },
      { value: formatNumber(bottoms[at] ?? 0), label: against.menu },
      { value: t("readout.inEvery", { share: oneDecimal(per100(bottoms[at] ?? 0, bottomAll)) }), label: t("readout.ofThose") },
      ...(against.value === fallback ? [{ value: row.visits >= ROUGH_GUIDE ? oneDecimal(per100(bottoms[at] ?? 0, row.visits)) : t("readout.tooFew"), label: t(shop ? "readout.boughtRate" : "readout.eventsRate") }] : []),
    ],
  }));
  const hintParts = [
    t(`topRow.${split}`, { noun: against.noun }),
    ...(bottomAll > 0 && bottomAll < ROUGH_GUIDE ? [t("rough", { count: formatNumber(bottomAll) })] : []),
    t("press"),
    ...(answer?.everyDevice ? [t("everyDevice")] : []),
  ];
  return (
    <MapCard
      title={against.title}
      hint={<span title={t("listsDiffer")}>{hintParts.join(" ")}</span>}
      exportName="google-analytics-overview-bands"
      csv={() => toCsv([t("csvName"), t("readout.visits"), against.menu], rows.map((row, at) => [nameOf(split, row), row.visits, bottoms[at] ?? 0]))}
      host={status.host}
      loading={answer === undefined}
      message={answer !== undefined && visitsAll === 0 ? t("empty") : null}
      controls={[
        { kind: "select", key: "split", label: t("splitLabel"), value: split, options: SPLITS.map((value) => ({ value, label: t(`split.${value}`) })), onChange: (next) => setSplit(next as Split) },
        { kind: "select", key: "against", label: t("compareWith"), value: against.value, options: choices.map((choice) => ({ value: choice.value, label: choice.menu })), onChange: setAgainst },
      ]}
      under={<MoreLink href={hrefFor(SPLIT_PAGE[split])} words={t(`more.${split}`)} />}
    >
      <HundredStrips segments={segments} topLabel={t("topLabel")} bottomLabel={t("bottomLabel", { noun: against.noun })} lit={lit} onLit={setLit} />
    </MapCard>
  );
}
