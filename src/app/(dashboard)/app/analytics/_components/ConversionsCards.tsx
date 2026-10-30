"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { api } from "@/convex/_generated/api";
import type { ConversionColumns } from "@/convex/googleAnalyticsConversionsMap";
import { ConversionsMap, type ConversionsCount, type ConversionsMapRow } from "@/src/ui/components/screens/ConversionsMap";
import { ConversionsByKindChart } from "@/src/ui/components/screens/ConversionsByKindChart";
import { ConversionsOverTimeChart, type ConversionsOverTimeShow } from "@/src/ui/components/screens/ConversionsOverTimeChart";
import { ConversionsByHourChart } from "@/src/ui/components/screens/ConversionsByHourChart";
import { countryName } from "../../search-console/_components/countries";
import { readerLanguage } from "../../search-console/_components/searchConsoleFormat";
import { formatDay } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { useFlowKindName } from "./ConversionParts";
import { COMPARES, COUNTS, Choice, useBeforeName, useMapWords, type Compare } from "./ConversionsMapChoices";
import { useEventName } from "./useEventName";
import { periodWord, useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus, useFromHere, usePeriod, useStep } from "./useAnalytics";

/**
 * Conversions' three shared parts on the Conversions page
 * (docs/plans/active/conversion-charts-plan.md, agreed 2026-10-29): the map,
 * the lines by kind, and the line over time. Each card's choices live in the
 * address, so they travel with the menu and survive Back. The parts draw;
 * these read and choose.
 */

export const COLUMNS = ["kind", "channel", "device", "country"] as const;
// Page kind too since the landing pages by kind are kept a day at a time (DAY_ONLY_LISTS); nothing to draw until the first night after 2026-10-29.
const LINE_COLUMNS = ["kind", "channel", "device", "country"] as const;
const SHOWS = ["rate", "per"] as const;

/** A column's name on screen: a page kind's, a channel's own, a device's word, a country's name (the main one for ""). */
export function useColumnName(columns: ConversionColumns, kinds: ReadonlyArray<{ kind: string; name: string | null }>, main: string | null) {
  const tf = useTranslations("googleAnalytics.filters");
  const kindName = useFlowKindName(kinds);
  const language = readerLanguage();
  return (key: string): string => {
    if (columns === "kind") return kindName(key);
    if (columns === "device") return tf(`devices.${key}`);
    if (columns === "country") return key === "" ? (main ? countryName(main, language) ?? main.toUpperCase() : "") : countryName(key, language) ?? key.toUpperCase();
    return key;
  };
}

export function ConversionsMapCard() {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [count, setCount] = useSiteParam<ConversionsCount>("mapCount", "visits", COUNTS);
  const [columns, setColumns] = useSiteParam<ConversionColumns>("mapBy", "kind", COLUMNS);
  const [compare, setCompare] = useSiteParam<Compare>("mapCompare", "none", COMPARES);
  const map = useQuery(api.googleAnalyticsConversionsMap.analyticsConversionsMap, status?.connection?.newestDay ? { ...args, columns } : "skip");
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId: args.siteId });
  const beforeName = useBeforeName();
  const words = useMapWords(count);
  // A square opens the pages behind it, which come back here as this screen stands.
  const hrefFor = useAnalyticsHref(args.siteId);
  const from = useFromHere();
  const columnName = useColumnName(columns, (map?.columns ?? []).map((column) => ({ kind: column.key, name: column.name })), choices?.main ?? null);
  const named = (map?.columns ?? []).map((column) => ({ ...column, name: columnName(column.key) }));
  const rows: ConversionsMapRow[] = (map?.rows ?? []).map((row) => ({ ...row, name: nameOf(row.eventName) }));
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Choice label={t("count")} value={count} choices={COUNTS} word={(choice) => t(`counts.${choice}`)} onChange={setCount} />
      <Choice label={t("columns")} value={columns} choices={COLUMNS} word={(choice) => t(`columnsOf.${choice}`)} onChange={setColumns} />
      <Choice label={t("compare")} value={compare} choices={COMPARES} word={(choice) => (choice === "before" ? beforeName : t("compares.none"))} onChange={setCompare} />
    </div>
  );
  const csv = () => [
    ["event", ...named.map((column) => column.name)].join(","),
    ...rows.map((row) => [row.eventName, ...row.cells.map((cell) => (count === "events" ? cell.times : cell.visits))].join(",")),
  ].join("\n");
  return (
    <ConversionsMap
      title={t("title")}
      hint={t("hint")}
      controls={controls}
      columns={named}
      rows={rows}
      count={count}
      compare={compare === "before" && (map?.hasBefore ?? false)}
      words={words}
      hrefFor={(row, column) => hrefFor("conversions/pages", { event: row.eventName, by: columns, key: column.key, from })}
      newWord={t("new")}
      pickWord={t("conversion")}
      exportName="google-analytics-conversions-map"
      csv={csv}
      caption={status?.host}
      emptyText={map === undefined ? undefined : t("nothing")}
    />
  );
}

/**
 * `event`: on a conversion's own screen (board "Conversion", 2026-10-30) the
 * card is that conversion's and offers no Conversion menu; its title names
 * it and the lines: "Purchase a day, a line per channel".
 */
export function ConversionsByKindCard({ event, name, hint }: { event?: string; /** How the title names the conversion, when not its own name ("Purchases"). */ name?: string; /** The line under the title, when the screen has its own words for it. */ hint?: string } = {}) {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [step] = useStep();
  const events = (status?.connection?.events ?? []).filter((event) => event.counted).map((event) => event.eventName);
  const [eventName, setEventName] = useSiteParam<string>("linesEvent", events[0] ?? "", events.length > 0 ? events : [""]);
  const [count, setCount] = useSiteParam<ConversionsCount>("linesCount", "visits", COUNTS);
  const [columns, setColumns] = useSiteParam<(typeof LINE_COLUMNS)[number]>("linesBy", "channel", LINE_COLUMNS);
  const chosen = event ?? (eventName || events[0] || "");
  const lines = useQuery(api.googleAnalyticsConversionsMap.analyticsConversionsByKindChart, status?.connection?.newestDay && chosen ? { ...args, columns, eventName: chosen } : "skip");
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId: args.siteId });
  const columnName = useColumnName(columns, [], choices?.main ?? null);
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {event ? null : <Choice label={t("conversion")} value={chosen} choices={events.length > 0 ? events : [chosen]} word={nameOf} onChange={setEventName} />}
      <Choice label={t("count")} value={count} choices={COUNTS} word={(choice) => t(`counts.${choice}`)} onChange={setCount} />
      <Choice label={t("columns")} value={columns} choices={LINE_COLUMNS} word={(choice) => t(`columnsOf.${choice}`)} onChange={setColumns} />
    </div>
  );
  return (
    <ConversionsByKindChart
      title={event ? t("linesTitleFor", { event: name ?? nameOf(event), column: t(`columnsLower.${columns}`) }) : t("linesTitle")}
      hint={event ? hint ?? t("linesHintDid", { column: t(`columnsLower.${columns}`) }) : undefined}
      controls={controls}
      columns={(lines?.columns ?? []).map((column) => ({ key: column.key, name: columnName(column.key) }))}
      points={lines?.points ?? []}
      count={count}
      step={step}
      words={{
        detail: (visits, did, times) => t("detail", { visits, did: count === "events" ? times : did, event: nameOf(chosen) }),
        csvHead: { day: t("csv.day"), visits: t("csv.visits"), did: t("csv.did"), times: t("csv.times"), rate: t("csv.rate") },
      }}
      exportName="google-analytics-conversions-by-kind"
      caption={status?.host}
      emptyText={lines === undefined ? undefined : t("noDays")}
    />
  );
}

/**
 * `opening`: what the card shows before anyone touches its menus. The
 * Conversions page (board "Main", 2026-10-30) opens on the visits it took for
 * one purchase — the shop's purchase, or the first conversion — so the
 * title names the conversion and the figure: "Visits it took for one
 * purchase, day by day".
 */
export function ConversionsOverTimeCard({ opening }: { opening?: { event?: string | null; show?: ConversionsOverTimeShow; /** The screen's own title and hint, when it has them (a conversion's own screen). */ title?: string; hint?: string; /** On a conversion's own screen the card is that conversion's: no Conversion menu (board "Conversion"). */ pinned?: boolean } } = {}) {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [period] = usePeriod();
  const [step] = useStep();
  const events = (status?.connection?.events ?? []).filter((event) => event.counted).map((event) => event.eventName);
  const first = opening?.event && events.includes(opening.event) ? opening.event : events[0] ?? "";
  const [eventName, setEventName] = useSiteParam<string>("timeEvent", first, events.length > 0 ? events : [""]);
  const [show, setShow] = useSiteParam<ConversionsOverTimeShow>("timeShow", opening?.show ?? "rate", SHOWS);
  const [compare, setCompare] = useSiteParam<Compare>("timeCompare", "none", COMPARES);
  const chosen = eventName || first;
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, status?.connection?.newestDay ? args : "skip");
  const before = useQuery(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, status?.connection?.newestDay && compare === "before" ? args : "skip");
  const beforeName = useBeforeName();
  const at = (chart?.events ?? []).indexOf(chosen);
  const atBefore = (before?.events ?? []).indexOf(chosen);
  const points = (chart?.points ?? []).map((point) => ({ day: point.day, lastDay: point.lastDay, visits: point.visits, did: at >= 0 ? (point.eventVisits ?? point.events)[at] ?? 0 : 0 }));
  const beforePoints = compare === "before" && before?.held
    ? before.points.map((point) => ({ day: point.day, visits: point.visits, did: atBefore >= 0 ? (point.eventVisits ?? point.events)[atBefore] ?? 0 : 0 }))
    : null;
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {opening?.pinned ? null : <Choice label={t("conversion")} value={chosen} choices={events.length > 0 ? events : [chosen]} word={nameOf} onChange={setEventName} />}
      <Choice label={t("show")} value={show} choices={SHOWS} word={(choice) => t(`shows.${choice}`)} onChange={setShow} />
      <Choice label={t("compare")} value={compare} choices={COMPARES} word={(choice) => (choice === "before" ? beforeName : t("compares.none"))} onChange={setCompare} />
    </div>
  );
  const from = chart?.points[0]?.day ?? null;
  const to = chart?.points[chart.points.length - 1]?.day ?? null;
  // The conversion's name in the middle of a sentence: "one purchase", "one contact form sent".
  const name = nameOf(chosen);
  const inSentence = name.charAt(0).toLocaleLowerCase() + name.slice(1);
  return (
    <ConversionsOverTimeChart
      title={opening?.title ?? (chosen ? (show === "per" ? t("timeTitlePer", { event: inSentence }) : t("timeTitleRate", { event: name })) : t("timeTitle"))}
      hint={opening?.hint ?? (chosen ? (show === "per" ? t("timeHintPer", { event: inSentence }) : t("timeHintRate", { before: beforeName })) : undefined)}
      controls={controls}
      points={points}
      before={beforePoints}
      show={show}
      step={step}
      words={{
        now: tf(`periods.${periodWord(period)}`),
        beforeName,
        detail: (visits, did) => t("detail", { visits, did, event: nameOf(chosen) }),
        csvHead: { day: t("csv.day"), visits: t("csv.visits"), did: t("csv.did"), figure: t(`shows.${show}`) },
      }}
      exportName="google-analytics-conversions-over-time"
      caption={[status?.host, from && to ? `${formatDay(from)} – ${formatDay(to)}` : null].filter(Boolean).join(" · ")}
      emptyText={chart === undefined ? undefined : t("noDays")}
    />
  );
}


/** Google counts Sunday as 0; a British week reads Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const HOUR_COUNTS = ["conversions", "visits"] as const;

/**
 * When people convert, on a conversion's own screen (board "Conversion",
 * 2026-10-30): the conversion's times — or the visits that did it, the
 * Count menu — at each hour of each day of the week over the dates shown,
 * from the `eventHour` list each collection keeps; the Compare menu sets
 * the span before beside each hour in the readout. Until the first
 * collection since the list was added, the card says so.
 */
export function ConversionsByHourCard({ event }: { event: string }) {
  const t = useTranslations("googleAnalytics.eventScreen.when");
  const te = useTranslations("googleAnalytics.eventScreen");
  const { platformName } = useSystemSettings();
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [count, setCount] = useSiteParam<(typeof HOUR_COUNTS)[number]>("hourCount", "conversions", HOUR_COUNTS);
  const [compare, setCompare] = useSiteParam<Compare>("hourCompare", "none", COMPARES);
  const grid = useQuery(api.googleAnalyticsEventReads.analyticsEventHours, status?.connection?.newestDay && event ? { ...args, event } : "skip");
  const beforeName = useBeforeName();
  const cells = count === "visits" ? grid?.visitCells : grid?.cells;
  const cellsBefore = count === "visits" ? grid?.visitsBefore : grid?.before;
  const comparing = compare === "before" && (cellsBefore ?? null) !== null;
  const days = WEEK.map((day) => ({
    key: String(day),
    name: t(`days.${day}`),
    hours: cells?.[day] ?? [],
    before: comparing ? cellsBefore?.[day] ?? null : null,
  }));
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Choice label={t("count")} value={count} choices={HOUR_COUNTS} word={(choice) => t(`counts.${choice}`)} onChange={setCount} />
      <Choice label={t("compare")} value={compare} choices={COMPARES} word={(choice) => (choice === "before" ? beforeName : t("nothing"))} onChange={setCompare} />
    </div>
  );
  return (
    <ConversionsByHourChart
      title={t("title")}
      hint={t("hint")}
      controls={controls}
      days={days}
      compare={comparing}
      words={{ hours: (from, to) => t("hours", { from, to }), conversions: t(`counts.${count}`), csvHour: t("csvHour") }}
      exportName={`google-analytics-${event}-by-hour`}
      caption={status?.host}
      emptyText={grid === undefined ? undefined : grid === null || !grid.held || grid.live ? t("collecting", { platformName }) : te("empty")}
    />
  );
}
