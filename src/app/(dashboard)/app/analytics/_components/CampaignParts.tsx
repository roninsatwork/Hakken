"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { hasNoName, isCameFromCode } from "@/convex/utils/campaignNames";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { yearComparable } from "@/src/ui/components/screens/chartExplorerRule";
import { ConversionsMap, type ConversionsMapColumn, type ConversionsMapRow, type ConversionsMapWords } from "@/src/ui/components/screens/ConversionsMap";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { PageMap, arrowMove, type PageMapBox } from "@/src/ui/components/screens/PageMap";
import { Select } from "@/src/ui/components/screens/Select";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { BeforeLine } from "./AnalyticsFigures";
import type { ListPageAnswer } from "./AnalyticsListScreen";
import { formatPercent } from "./analyticsFormat";
import { shiftDays } from "./stepScale";
import { useIsShop } from "./useIsShop";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep } from "./useAnalytics";
import { useThingDone } from "./useEventName";
import { spansOfList, useSpanInWords, useSpanWords } from "./VisitsCharts";

/**
 * What Campaigns reads and says (docs/plans/active/campaigns-new-page-plan-2026-11-05.md; board "The new page so far"). Every chart
 * on the page is a shared part (`DaysChart`, `MapCard` with `PageMap`, `ConversionsMap`), as Anthony asked: "I only want reusable
 * shared components". What's here is the reading, the words and the figures each part is handed.
 */

/** Every campaign the boxes and the eye weigh, from the busiest. A website with more is cut here, and says so in the plan's limits. */
export const EYE_CAMPAIGNS = 100;
/** The map's boxes at most, as on All pages. */
const MAP_CAMPAIGNS = 40;
/** A campaign with under this share of the page's figure is too small for a box. */
const SMALLEST_BOX = 1 / 500;

const EVERYWHERE = "everywhere";
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;

type Named = { label: string; cameFrom?: string };

/** A campaign and where its link was, in the reader's words: the table's, the map's, the squares' and the eye's. */
export function useCampaignNames() {
  const t = useTranslations("googleAnalytics.campaigns");
  return useMemo(() => {
    const place = (cameFrom: string) => (isCameFromCode(cameFrom) ? t(`cameFrom.${cameFrom}`) : cameFrom);
    const name = (row: Named) => (hasNoName(row.label) ? t("noName", { place: place(row.cameFrom ?? "notKnown") }) : row.label);
    /** For a place with little room: the last part of "Performance Max > Zombies". */
    const short = (row: Named) => {
      const last = name(row).split(" > ").at(-1) ?? name(row);
      return last.length > 26 ? `${last.slice(0, 25)}…` : last;
    };
    return { place, name, short };
  }, [t]);
}

export type CameFromChoice = { value: string; set: (next: string) => void; cameFrom: string | undefined };

/** One choice, kept in the address: the boxes, charts, table and download all follow it. */
export function useCameFromChoice(): CameFromChoice {
  const [value, set] = useSiteParam<string>("cameFrom", EVERYWHERE);
  return { value, set, cameFrom: value === EVERYWHERE ? undefined : value };
}

/** The menu on the table's search row. A place that's no longer in these dates still says what it is. */
export function CameFromSelect({ choice, choices }: { choice: CameFromChoice; choices: ReadonlyArray<{ cameFrom: string }> | null | undefined }) {
  const t = useTranslations("googleAnalytics.campaigns");
  const { place } = useCampaignNames();
  const places = choices?.map((one) => one.cameFrom) ?? [];
  const all = choice.cameFrom && !places.includes(choice.cameFrom) ? [...places, choice.cameFrom] : places;
  return (
    <Select
      aria-label={t("cameFromLabel")}
      value={choice.value}
      onChange={choice.set}
      chip={{ label: t("cameFromLabel"), choice: choice.cameFrom ? place(choice.cameFrom) : t("everywhere"), changed: false }}
    >
      <option value={EVERYWHERE}>{t("everywhere")}</option>
      {all.map((one) => <option key={one} value={one}>{place(one)}</option>)}
    </Select>
  );
}

/**
 * The whole list's read, however the table is paged or whichever list it's showing: the boxes and the eye read it. A device's list
 * the next collection builds is every device's meanwhile, as the table does. And the whole website's own figures to set it beside.
 */
export function useCampaigns(choice: CameFromChoice) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const ready = Boolean(status?.connection?.newestDay);
  const ask = { ...args, list: "campaign" as const, sort: "visits" as const, direction: "desc" as const, page: 1, rows: EYE_CAMPAIGNS, ...(choice.cameFrom ? { cameFrom: choice.cameFrom } : {}) };
  const read = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? ask : "skip");
  const everyDevice = useQuery(api.googleAnalyticsReads.analyticsListPage, read?.live ? { ...ask, device: "" } : "skip");
  const every = read?.live ? everyDevice : read;
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, ready ? args : "skip");
  // A website that sells, by the one rule. Any other website's page speaks of events.
  const sells = useIsShop();
  return { every, overview, sells };
}

type Campaigns = ReturnType<typeof useCampaigns>;

/** The key of a word: a website that doesn't sell says Events where a shop says Conversions. */
function said(key: string, sells: boolean): string {
  return key === "conversions" && !sells ? "events" : key;
}

/** Four boxes, each set against the dates before: what campaigns brought, and their share of the whole website. */
export function CampaignBoxes({ campaigns }: { campaigns: Campaigns }) {
  const t = useTranslations("googleAnalytics.campaigns.boxes");
  const { every, overview, sells } = campaigns;
  const dates = spansOfList(every);
  const spans = useSpanWords(...dates);
  const inWords = useSpanInWords(...dates);
  const totals = every?.campaignTotals;
  const now = overview?.now;
  if (!totals || !now) return null;
  const before = overview?.before ?? null;
  const share = (part: number, whole: number) => (whole > 0 ? pct(part / whole) : "–");
  const was = (part: number | null, whole: number | null | undefined) => (part !== null && whole ? <span className="text-secondary">{t("was", { figure: pct(part / whole), before: inWords.before })}</span> : undefined);
  // None then and none now is a true thing to say, not nothing to compare with.
  const against = (figure: number, was: number | null) => (figure === 0 && was === 0 ? <span className="text-[12px] text-muted">{t("noneEither", { before: inWords.before })}</span> : <BeforeLine now={figure} before={was} named={spans.before} />);
  const [done, doneBefore, siteDone, siteDoneBefore] = sells
    ? [totals.bought, totals.boughtBefore, now.purchases, before?.purchases]
    : [totals.conversions, totals.conversionsBefore, now.conversions, before?.conversions];
  return (
    <FigureRow columns={4}>
      <Figure label={t("visits")} value={formatNumber(totals.visits)} detail={against(totals.visits, totals.visitsBefore)} />
      <Figure label={t("share")} value={share(totals.visits, now.visits)} detail={was(totals.visitsBefore, before?.visits)} />
      <Figure label={t(sells ? "bought" : "events")} value={formatNumber(done)} detail={against(done, doneBefore)} />
      <Figure label={t(sells ? "boughtShare" : "eventsShare")} value={share(done, siteDone)} detail={was(doneBefore, siteDoneBefore)} />
    </FigureRow>
  );
}

type Show = "visits" | "bought" | "conversions" | "left";
const SHOWS: readonly Show[] = ["visits", "bought", "conversions", "left"];
type DayPoint = { day: string; lastDay?: string; visits: number; engaged: number; conversions: number; bought: number };

function figureOf(point: DayPoint, show: Show): number {
  return show === "left" ? Math.max(0, point.visits - point.engaged) : point[show];
}

/**
 * Visits from campaigns each day, against the same days of the dates before where those are held day by day (weeks and months, as on
 * Visits and Funnel), with Up or down under it: in weeks on a daily chart, as a day against the day before says little.
 */
export function CampaignDaysCard({ choice, campaigns }: { choice: CameFromChoice; campaigns: Campaigns }) {
  const t = useTranslations("googleAnalytics.campaigns.daily");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const [step] = useStep();
  const { sells, every } = campaigns;
  const [chosen, setShow] = useSiteParam<Show>("show", "visits", SHOWS);
  const show: Show = chosen === "bought" && !sells ? "visits" : chosen;
  const [against, setAgainst] = useState<"before" | "none">("before");
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsCampaignChart, status?.connection?.newestDay ? { ...args, ...(choice.cameFrom ? { cameFrom: choice.cameFrom } : {}) } : "skip");
  const dates = spansOfList(every);
  const spans = useSpanWords(...dates);
  const inWords = useSpanInWords(...dates);
  const before = chart?.before ?? null;
  const drawn = Boolean(before?.drawn) && (before?.points.length ?? 0) > 0;
  const comparing = against === "before" && drawn;
  const seen = useMemo(() => (chart ? {
    days: chart.points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), visits: point.visits, bought: point.bought, conversions: point.conversions, leftStraightAway: figureOf(point, "left") })),
    ...(before ? { daysBefore: before.points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), visits: point.visits, bought: point.bought, conversions: point.conversions, leftStraightAway: figureOf(point, "left") })) } : {}),
  } : undefined), [chart, before]);
  useSeesPart("campaignsByDay", seen);
  const valued = (points: readonly DayPoint[], which: Show) => points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: figureOf(point, which) }));
  // A day September didn't have, like 31 October's, has no figure rather than none.
  const lines: DaysLine[] = [
    { key: "now", name: inWords.now, colour: CHART_SERIES_ORANGE, points: valued(chart?.points ?? [], show) },
    ...(comparing && before ? [{
      key: "before", name: inWords.before, colour: CHART_COMPARATOR_GREY, dashed: true, gaps: true,
      points: valued(before.points, show).map((point) => ({ ...point, day: shiftDays(point.day, before.shift) })),
    }] : []),
  ];
  const withYear = yearComparable(period);
  const scoreLine = (which: "visits" | "bought" | "conversions") => {
    const earlier = before ? valued(before.points, which) : [];
    return { key: which, name: t(`score.${said(which, sells)}`), now: valued(chart?.points ?? [], which), before: earlier, ...(withYear ? { year: earlier } : {}) };
  };
  return (
    <DaysChart
      title={t(`title.${said(show, sells)}.${step}`)}
      hint={comparing ? t("hintAgainst", { now: inWords.now, before: inWords.before }) : t("hint", { now: inWords.now })}
      exportName="google-analytics-campaigns-each-day"
      csvDay={t("csvDay")}
      host={status?.host ?? ""}
      step={step}
      waiting={chart === undefined ? undefined : chart.live ? t("collecting") : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: show, options: SHOWS.filter((one) => one !== "bought" || sells).map((one) => ({ value: one, label: t(`show.${said(one, sells)}`) })), onChange: (next) => setShow(next as Show) },
        ...(drawn ? [{
          kind: "select" as const, key: "against", label: t("compareWith"), value: against,
          options: [{ value: "before", label: spans.beforeNamed ?? spans.before }, { value: "none", label: t("nothing") }],
          onChange: (next: string) => setAgainst(next as "before" | "none"),
        }] : []),
      ]}
      lines={lines}
      figure={t(`show.${said(show, sells)}`)}
      anything={(rows) => rows.some((row) => Number(row.now) > 0)}
      empty={t("empty")}
      height={240}
      scored={{ step: step === "day" ? "week" : step, lines: [scoreLine("visits"), scoreLine(sells ? "bought" : "conversions")], withYear }}
    />
  );
}

type Count = "visits" | "bought" | "conversions";
const COUNTS: readonly Count[] = ["visits", "bought", "conversions"];
type Row = ListPageAnswer["rows"][number];

function campaignFigures(row: Row, count: Count): { now: number; before: number | null } {
  if (count === "bought") return { now: row.purchases, before: row.purchasesBefore ?? null };
  if (count === "conversions") return { now: row.conversions, before: row.conversionsBefore };
  return { now: row.visits, before: row.visitsBefore ?? null };
}

/** The most boxes a map can hold, and the smallest it has room to show, as the screen says it. Plain code, for its tests. */
export function boxedCampaigns<R>(rows: readonly R[], figure: (row: R) => number, whole: number, most = MAP_CAMPAIGNS): R[] {
  return rows.filter((row) => figure(row) > 0 && figure(row) >= whole * SMALLEST_BOX).slice(0, most);
}

/**
 * All your campaigns (Anthony, 2026-11-05: "let keep this control on our new page design"): each a box, the bigger the more it had,
 * orange if it went up and grey if it went down. A campaign with next to nothing is left out, and the line under the map says so.
 * Pressing a box does nothing, as a campaign has no page of its own.
 */
export function CampaignMapCard({ choice, campaigns }: { choice: CameFromChoice; campaigns: Campaigns }) {
  const t = useTranslations("googleAnalytics.campaigns.map");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const { sells, every } = campaigns;
  const { name, place } = useCampaignNames();
  const [chosen, setCount] = useSiteParam<Count>("count", "visits", COUNTS);
  const count: Count = chosen === "bought" && !sells ? "visits" : chosen;
  const inWords = useSpanInWords(...spansOfList(every));
  const ready = Boolean(status?.connection?.newestDay);
  const ask = { ...args, list: "campaign" as const, sort: count, direction: "desc" as const, page: 1, rows: MAP_CAMPAIGNS, ...(choice.cameFrom ? { cameFrom: choice.cameFrom } : {}) };
  const read = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? ask : "skip");
  const everyDevice = useQuery(api.googleAnalyticsReads.analyticsListPage, read?.live ? { ...ask, device: "" } : "skip");
  const list = read?.live ? everyDevice : read;
  const totals = list?.campaignTotals;
  const whole = totals ? (count === "bought" ? totals.bought : count === "conversions" ? totals.conversions : totals.visits) : 0;
  const rows = useMemo(() => boxedCampaigns(list?.rows ?? [], (row) => campaignFigures(row, count).now, whole), [list?.rows, count, whole]);
  const boxes: PageMapBox[] = rows.map((row) => {
    const shown = campaignFigures(row, count);
    const others = COUNTS.filter((one) => one !== count && (one !== "bought" || sells));
    return {
      id: row.key,
      name: name(row),
      size: shown.now,
      now: shown.now,
      before: shown.before,
      figure: t(`figure.${said(count, sells)}`, { count: shown.now }),
      readout: [
        { value: formatNumber(shown.now), label: t(`in.${said(count, sells)}`, { when: inWords.now }) },
        ...(shown.before !== null ? [
          { value: formatNumber(shown.before), label: t(`in.${said(count, sells)}`, { when: inWords.before }) },
          { value: arrowMove(shown.now, shown.before) ?? t("same"), label: t("upOrDown") },
        ] : []),
        ...others.map((one) => ({ value: formatNumber(campaignFigures(row, one).now), label: t(`measure.${said(one, sells)}`) })),
        { value: row.bounceRate === null ? "–" : formatPercent(row.bounceRate), label: t("left") },
      ],
    };
  });
  const seen = useMemo(() => (list ? { count, campaigns: rows.map((row) => ({ name: name(row), cameFrom: place(row.cameFrom ?? "notKnown"), visits: row.visits, visitsBefore: row.visitsBefore ?? null, bought: row.purchases, boughtBefore: row.purchasesBefore ?? null, conversions: row.conversions, conversionsBefore: row.conversionsBefore })) } : undefined), [list, count, rows, name, place]);
  useSeesPart("campaignMap", seen);
  const left = (list?.total ?? 0) - rows.length;
  const allRead = (list?.total ?? 0) <= (list?.rows.length ?? 0);
  const most = Math.max(0, ...(list?.rows ?? []).filter((row) => !rows.includes(row)).map((row) => row.visits));
  const under = left <= 0 ? null : count === "visits" && allRead ? t("leftOutVisits", { count: left, most }) : t("leftOut", { count: left });
  return (
    <MapCard
      title={t("title")}
      hint={`${t(`hint.${said(count, sells)}`)} ${t("colourHint", { before: inWords.before })}`}
      exportName="google-analytics-campaign-map"
      csv={() => toCsv(
        [t("csv.campaign"), t("csv.cameFrom"), t("csv.visits"), t("csv.visitsBefore"), ...(sells ? [t("csv.bought"), t("csv.boughtBefore")] : []), t(`csv.${said("conversions", sells)}`), t(`csv.${said("conversions", sells)}Before`)],
        rows.map((row) => [name(row), place(row.cameFrom ?? "notKnown"), row.visits, row.visitsBefore ?? null, ...(sells ? [row.purchases, row.purchasesBefore ?? null] : []), row.conversions, row.conversionsBefore]),
      )}
      host={status?.host ?? ""}
      controls={[{ kind: "select", key: "count", label: t("count"), value: count, options: COUNTS.filter((one) => one !== "bought" || sells).map((one) => ({ value: one, label: t(`measure.${said(one, sells)}`) })), onChange: (next) => setCount(next as Count) }]}
      loading={list === undefined}
      message={boxes.length === 0 ? t("empty") : null}
      under={under ? <p className="text-[12px] text-muted">{under}</p> : null}
    >
      <PageMap boxes={boxes} height={380} />
    </MapCard>
  );
}

type SquareCount = "times" | "per100" | "rate";
const SQUARE_COUNTS: readonly SquareCount[] = ["times", "per100", "rate"];

const per100 = (times: number, visits: number) => (visits > 0 ? (100 * times) / visits : 0);
const rateWords = (rate: number) => (rate >= 10 ? formatNumber(Math.round(rate)) : rate.toFixed(1));

/**
 * What people did after they arrived (Anthony, 2026-11-05: "lets keep this chart on our new design"): the busiest campaigns down the
 * side and the website's most counted things across, the same part as on Conversions. Count chooses what each square leads with: the
 * times it happened, those for every 100 visits, or the conversion rate (Anthony, 2026-11-05: "we need conversion rate % too"), the
 * share of a campaign's visits that did it at least once, so it can't pass 100%. It's brighter the more it has against the other campaigns.
 */
export function CampaignSquaresCard({ choice }: { choice: CameFromChoice }) {
  const t = useTranslations("googleAnalytics.campaigns.squares");
  const shop = useIsShop();
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const thing = useThingDone();
  const { name, short } = useCampaignNames();
  const [chosen, setCount] = useSiteParam<SquareCount>("squares", "times", SQUARE_COUNTS);
  const answer = useQuery(api.googleAnalyticsCampaignReads.analyticsCampaignActions, status?.connection?.newestDay ? { ...args, ...(choice.cameFrom ? { cameFrom: choice.cameFrom } : {}) } : "skip");
  const events = useMemo(() => answer?.events ?? [], [answer?.events]);
  // Saved lists from before both units were kept hold only the times, so there's no rate to offer.
  const hasRates = (answer?.rows ?? []).some((row) => row.visitsDid.some((did) => did !== null));
  const count: SquareCount = chosen === "rate" && !hasRates ? "times" : chosen;
  const seen = useMemo(() => (answer ? {
    things: events.map(thing),
    unit: hasRates ? "visits" : "times",
    campaigns: answer.rows.map((row) => ({ name: name(row), visits: row.visits, ...Object.fromEntries(events.map((event, at) => [thing(event), (hasRates ? row.visitsDid[at] : row.times[at]) ?? 0])) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `thing` is new each draw; the events and the rows decide.
  } : undefined), [answer, events, name, hasRates]);
  useSeesPart("whatPeopleDid", seen);
  const visitsOf = new Map((answer?.rows ?? []).map((row) => [row.key, row.visits]));
  const didOf = new Map((answer?.rows ?? []).map((row) => [row.key, row.visitsDid]));
  const conversionRate = (key: string, at: number) => per100(didOf.get(key)?.[at] ?? 0, visitsOf.get(key) ?? 0);
  const shadeOf = (row: { key: string; visits: number; times: number[] }, at: number) => (count === "rate" ? conversionRate(row.key, at) : per100(row.times[at] ?? 0, row.visits));
  const tops = events.map((_, at) => Math.max(0, ...(answer?.rows ?? []).map((row) => shadeOf(row, at))));
  const columns: ConversionsMapColumn[] = events.map((event) => ({ key: event, name: thing(event), visits: 0, visitsBefore: null }));
  const rows: ConversionsMapRow[] = (answer?.rows ?? []).map((row) => ({
    eventName: row.key,
    name: short(row),
    counted: true,
    cells: row.times.map((times) => ({ visits: times, times, visitsBefore: null, timesBefore: null })),
  }));
  const fullNames = new Map((answer?.rows ?? []).map((row) => [row.key, name(row)]));
  const words: ConversionsMapWords = {
    rowTotal: (row) => t("rowTotal", { visits: formatNumber(visitsOf.get(row.eventName) ?? 0) }),
    hover: (row, column, _, cell) => {
      const at = columns.indexOf(column);
      const did = didOf.get(row.eventName)?.[at];
      return `${t("hover", { campaign: fullNames.get(row.eventName) ?? row.name, thing: column.name, times: formatNumber(cell.times), rate: rateWords(per100(cell.times, visitsOf.get(row.eventName) ?? 0)) })}${hasRates ? ` ${t("hoverVisits", { did: formatNumber(did ?? 0), visits: formatNumber(visitsOf.get(row.eventName) ?? 0), rate: pct(conversionRate(row.eventName, at) / 100) })}` : ""}`;
    },
    hoverBefore: () => "",
    figures: t(count === "rate" ? "keyRate" : "key"),
    shades: t(count === "rate" ? "shadesRate" : "shades"),
    empty: t("nobody"),
  };
  return (
    <ConversionsMap
      title={t("title")}
      hint={t("hint", { count: rows.length })}
      controls={<ExplorerToolbar controls={[{ kind: "select", key: "squares", label: t("count"), value: count, options: SQUARE_COUNTS.filter((one) => one !== "rate" || hasRates).map((one) => ({ value: one, label: t(`counts.${one === "rate" && !shop ? "rateEvents" : one}`) })), onChange: (next) => setCount(next as SquareCount) }]} />}
      columns={columns}
      rows={rows}
      count="events"
      compare={false}
      words={words}
      newWord=""
      squareOf={(row, _, cell, at) => {
        const rate = per100(cell.times, visitsOf.get(row.eventName) ?? 0);
        const did = didOf.get(row.eventName)?.[at] ?? 0;
        const shade = count === "rate" ? conversionRate(row.eventName, at) : rate;
        const square = count === "rate"
          ? { text: pct(conversionRate(row.eventName, at) / 100), note: t("visitsNote", { visits: formatNumber(did) }) }
          : count === "per100"
            ? { text: rateWords(rate), note: t("timesNote", { times: formatNumber(cell.times) }) }
            : { text: formatNumber(cell.times), note: t("per100", { rate: rateWords(rate) }) };
        // The ramp's brightest for the campaign that does it most for its visits, column by column.
        return { ...square, share: tops[at] > 0 ? (shade / tops[at]) * 0.9 : 0 };
      }}
      pickWord={t("pick")}
      exportName="google-analytics-campaign-squares"
      csv={() => toCsv(
        [t("csvCampaign"), t("csvVisits"), ...columns.flatMap((column) => [t("csvTimes", { thing: column.name }), ...(hasRates ? [t("csvVisitsDid", { thing: column.name })] : [])])],
        (answer?.rows ?? []).map((row) => [name(row), row.visits, ...events.flatMap((_, at) => [row.times[at] ?? 0, ...(hasRates ? [row.visitsDid[at] ?? 0] : [])])]),
      )}
      caption={status?.host}
      emptyText={answer === undefined ? undefined : t("none")}
    />
  );
}
