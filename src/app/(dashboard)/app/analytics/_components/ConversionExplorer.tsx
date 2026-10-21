"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ChartExplorer } from "@/src/ui/components/screens/ChartExplorer";
import { whole, yearComparable } from "@/src/ui/components/screens/chartExplorerRule";
import { CHART_SERIES_AMBER, CHART_SERIES_ROSE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import type { SiteSeries } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatDay, formatMonth, formatNumber, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { formatPerConversion } from "./analyticsFormat";
import { CHANNEL_COLOURS } from "./AnalyticsChart";
import { daysSpanned } from "./stepScale";
import { useEventName } from "./useEventName";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep } from "./useAnalytics";
import { bucketsOf, fewerIsBetter, linesOf, rowsOf, scoresOf, sumsOf, type Against, type Bucket, type Line, type LinesBy, type Measure } from "./explorerRule";
import { useExplorerReadout } from "./ExplorerReadout";
import { eventList } from "./AnalyticsSees";

/** Channels drawn at first: the busiest four, the rest a tick away. */
const FIRST_CHANNELS = 4;
const MEASURES: readonly Measure[] = ["perOne", "conversions", "visits", "rate"];
const LINES: readonly LinesBy[] = ["channel", "kind", "one"];
const AGAINST: readonly Against[] = ["none", "before", "year"];
/**
 * Each line's colour, kept with its channel or kind whatever else is ticked: Channels' colours by how busy the
 * channel is, then more for a line past the fourth (Anthony, 2026-10-20: colours jumped as boxes were ticked).
 */
const LINE_COLOURS = [...CHANNEL_COLOURS, CHART_SERIES_SLATE, CHART_SERIES_ROSE, CHART_SERIES_AMBER];

type Sums = { visits: number; conversions: number };

/**
 * A page's "Visits needed for one conversion, by channel" (docs/plans/active/page-conversion-explorer-plan.md; drawn
 * and approved 2026-10-20, Anthony: "go with channels, I want it as per the design"), drawn by the kit's
 * `ChartExplorer` — the configurable chart's style, locked in from this one ("let's lock this in as a component
 * style"). Its Google Analytics figures — the visits that started on the page and the conversions they went on to
 * make — by channel (AI assistants by their source) and by kind of conversion: Show picks the measure, Conversions
 * and Channels what counts, Lines what each line is, Against what to set it beside. Its title says what Show and
 * Lines set ("is the component name correct"; "fix it").
 */
export function ConversionExplorerCard({ page }: { page: string }) {
  const t = useTranslations("googleAnalytics.conversionExplorer");
  const tf = useTranslations("googleAnalytics.filters");
  const tp = useTranslations("searchConsole.chart");
  const locale = useLocale();
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const nameOf = useEventName();
  const tableOf = useExplorerReadout();
  const answer = useQuery(api.googleAnalyticsPageChannels.analyticsPageChannelExplorer, status?.connection?.newestDay && page ? { ...args, page } : "skip");
  // Conversions first, so the chart opens on a whole line: visits for one has no figure on a day with no conversion
  // (Anthony, 2026-10-20: "can we default this to conversions so we always show a full graph").
  const [measure, setMeasure] = useState<Measure>("conversions");
  const [kinds, setKinds] = useState<string[] | null>(null);
  const [channels, setChannels] = useState<string[] | null>(null);
  const [lines, setLines] = useState<LinesBy>("channel");
  const [chosenAgainst, setAgainst] = useState<Against>("none");

  const events = answer?.events ?? [];
  const every = answer?.channels ?? [];
  // Until a box is ticked: every kind of conversion, and the busiest channels.
  const pickedKinds = (kinds ?? events).filter((kind) => events.includes(kind));
  const pickedChannels = (channels ?? every.slice(0, FIRST_CHANNELS)).filter((channel) => every.includes(channel));
  // The page's step: the period's own unless the step menu changed it, which the explorer follows too (calendar-periods-plan.md).
  const [step] = useStep();
  // A year before only for This Year; a choice made there falls back to nothing on the other periods.
  const withYear = yearComparable(period);
  const against: Against = chosenAgainst === "year" && !withYear ? "none" : chosenAgainst;
  const now = bucketsOf(answer?.now ?? [], step, events.length);
  const before = bucketsOf(answer?.before ?? [], step, events.length);
  const year = bucketsOf(answer?.year ?? [], step, events.length);
  const drawn = linesOf({ measure, kinds: pickedKinds, channels: pickedChannels, lines });
  const compared = against === "before" ? before : against === "year" ? year : null;
  const rows = rowsOf(now, compared, drawn, measure, events);

  const lineName = (line: Line) => (line.key === "all" ? t("lineAll") : line.key.startsWith("k:") ? nameOf(line.kinds[0]) : line.channels[0]);
  const colourOf = (line: Line) => {
    const at = line.key.startsWith("c:") ? every.indexOf(line.channels[0]) : line.key.startsWith("k:") ? events.indexOf(line.kinds[0]) : 0;
    return LINE_COLOURS[Math.max(0, at) % LINE_COLOURS.length];
  };
  const named = drawn.map((line) => ({ ...line, name: lineName(line) }));
  const scores = scoresOf(before, now, year, named, measure, step, events);
  const series: SiteSeries[] = drawn.flatMap((line) => {
    const colour = colourOf(line);
    return [
      { key: line.key, name: lineName(line), colour },
      ...(compared ? [{ key: `${line.key}~`, name: t(against === "before" ? "comparedBefore" : "comparedYear", { name: lineName(line) }), colour, dashed: true }] : []),
    ];
  });
  // A step's dates as the readout heads them: a day, a week's first and last days, a month.
  const datesOf = (bucket: Bucket) => (step === "month" && whole(bucket, step) ? formatMonth(bucket.key)
    : bucket.first === bucket.last ? formatShortDay(bucket.first) : `${formatShortDay(bucket.first)} – ${formatShortDay(bucket.last)}`);
  const everything: Line = { key: "all", channels: pickedChannels, kinds: pickedKinds };
  // A week or month the dates cut is marked as part of one, its hover naming its days, as Search Console's chart; a
  // week's hover names its days.
  const data = rows.map((row) => {
    const part = step !== "day" && !whole(row.bucket, step);
    return datedRow(
      {
        day: step === "month" ? `${row.bucket.key}-01` : row.bucket.key,
        lastDay: row.bucket.last,
        ...(part ? { part, readout: tp("partDays", { dates: datesOf(row.bucket), days: daysSpanned(row.bucket.first, row.bucket.last) }) }
          : step === "week" ? { readout: datesOf(row.bucket) } : {}),
      },
      {
        ...row.values,
        // For the readout: each line's figures, everything ticked together, and the step set against — under names
        // no line's key can take ("all" is the one line's own, and drew nothing when these were named after it).
        readoutSums: row.sums,
        readoutAll: sumsOf(everything, [row.bucket], events),
        readoutAllThen: row.twin ? sumsOf(everything, [row.twin], events) : null,
        readoutAgainst: row.twin ? datesOf(row.twin) : null,
      },
      step === "month" ? formatMonth(row.bucket.key) : formatShortDay(row.bucket.key),
    );
  });
  const narrowed = pickedKinds.length < events.length;
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }) => {
    const sums = (row.readoutSums ?? {}) as Record<string, Sums | null>;
    const all = row.readoutAll as Sums;
    const allThen = (row.readoutAllThen as Sums | null) ?? null;
    const figure = (chunks: ReactNode) => <span className="font-mono text-foreground">{chunks}</span>;
    const note = lines === "kind"
      ? t.rich("readoutVisitsNote", { visits: formatNumber(Math.round(all.visits)), figure })
      : lines === "one" ? t("readoutOneNote", { channels: pickedChannels.length, kinds: pickedKinds.length })
        : narrowed ? t("readoutCounting", { kinds: eventList(pickedKinds.join(","), nameOf, locale) }) : null;
    return tableOf({
      heading,
      against: compared ? (row.readoutAgainst as string | null) ?? null : null,
      measure,
      linesBy: lines,
      lines: drawn.map((line) => ({
        key: line.key,
        name: line.key === "all" ? t("readoutEverything") : lineName(line),
        colour: colourOf(line),
        now: sums[line.key] ?? { visits: 0, conversions: 0 },
        then: compared ? sums[`${line.key}~`] ?? null : null,
      })),
      total: { now: all, then: compared ? allThen : null },
      note,
    });
  };
  const figure = (value: number | null) => (value === null ? "–" : measure === "perOne" ? formatPerConversion(value) : measure === "rate" ? t("rateValue", { value }) : formatNumber(value));
  const unticked = pickedChannels.length === 0 ? "channel" : pickedKinds.length === 0 ? "kind" : null;

  const heldLate = answer?.heldFrom && answer.from && answer.heldFrom > answer.from;
  const hint = [
    t("hint", { period: tf(`periods.${period}`), step }),
    measure === "perOne" ? t("fewerBetter") : null,
    answer?.everyDevice ? t("everyDevice") : null,
    heldLate ? t("heldFrom", { date: formatDay(answer.heldFrom) }) : null,
  ].filter(Boolean).join(" ");
  const csv = () => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number | null)]));

  return (
    <ChartExplorer
      title={t("title", { measure, lines })}
      hint={hint}
      exportName="google-analytics-page-conversion-explorer"
      csv={csv}
      host={status?.host ?? ""}
      from={answer?.from ?? null}
      to={answer?.to ?? null}
      step={step}
      waiting={answer === undefined ? undefined : answer.heldFrom === null ? t("collecting") : null}
      controls={[
        { kind: "select", key: "show", label: t("show"), value: measure, options: MEASURES.map((one) => ({ value: one, label: t(`measures.${one}`) })), onChange: (value) => setMeasure(value as Measure) },
        { kind: "ticks", key: "conversions", label: t("conversions"), everyWord: t("everyConversion"), choices: events.map((kind) => ({ key: kind, label: nameOf(kind) })), ticked: pickedKinds, onChange: setKinds },
        { kind: "ticks", key: "channels", label: t("channels"), everyWord: t("everyChannel"), choices: every.map((channel) => ({ key: channel, label: channel })), ticked: pickedChannels, onChange: setChannels },
        { kind: "select", key: "lines", label: t("lines"), value: lines, options: LINES.map((one) => ({ value: one, label: t(`linesBy.${one}`) })), onChange: (value) => setLines(value as LinesBy) },
        { kind: "select", key: "against", label: t("against"), value: against, options: AGAINST.filter((one) => one !== "year" || withYear).map((one) => ({ value: one, label: t(`againstChoice.${one}`) })), onChange: (value) => setAgainst(value as Against) },
      ]}
      nothingTicked={unticked ? t("nothingTicked", { what: unticked }) : null}
      data={data}
      series={series}
      readout={readout}
      anything={rows.some((row) => Object.values(row.values).some((value) => value !== null && value !== 0))}
      empty={t("none")}
      scores={{ rows: scores, figure, fewerIsBetter: fewerIsBetter(measure), withYear }}
    />
  );
}
