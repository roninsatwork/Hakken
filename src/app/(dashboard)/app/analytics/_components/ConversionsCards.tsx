"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { ConversionColumns } from "@/convex/googleAnalyticsConversionsMap";
import { ConversionsMap, type ConversionsCount, type ConversionsMapRow } from "@/src/ui/components/screens/ConversionsMap";
import { ConversionsByKindChart } from "@/src/ui/components/screens/ConversionsByKindChart";
import { ConversionsOverTimeChart, type ConversionsOverTimeShow } from "@/src/ui/components/screens/ConversionsOverTimeChart";
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

export function ConversionsByKindCard() {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [step] = useStep();
  const events = (status?.connection?.events ?? []).filter((event) => event.counted).map((event) => event.eventName);
  const [eventName, setEventName] = useSiteParam<string>("linesEvent", events[0] ?? "", events.length > 0 ? events : [""]);
  const [count, setCount] = useSiteParam<ConversionsCount>("linesCount", "visits", COUNTS);
  const [columns, setColumns] = useSiteParam<(typeof LINE_COLUMNS)[number]>("linesBy", "channel", LINE_COLUMNS);
  const chosen = eventName || events[0] || "";
  const lines = useQuery(api.googleAnalyticsConversionsMap.analyticsConversionsByKindChart, status?.connection?.newestDay && chosen ? { ...args, columns, eventName: chosen } : "skip");
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId: args.siteId });
  const columnName = useColumnName(columns, [], choices?.main ?? null);
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Choice label={t("conversion")} value={chosen} choices={events.length > 0 ? events : [chosen]} word={nameOf} onChange={setEventName} />
      <Choice label={t("count")} value={count} choices={COUNTS} word={(choice) => t(`counts.${choice}`)} onChange={setCount} />
      <Choice label={t("columns")} value={columns} choices={LINE_COLUMNS} word={(choice) => t(`columnsOf.${choice}`)} onChange={setColumns} />
    </div>
  );
  return (
    <ConversionsByKindChart
      title={t("linesTitle")}
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

export function ConversionsOverTimeCard() {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [period] = usePeriod();
  const [step] = useStep();
  const events = (status?.connection?.events ?? []).filter((event) => event.counted).map((event) => event.eventName);
  const [eventName, setEventName] = useSiteParam<string>("timeEvent", events[0] ?? "", events.length > 0 ? events : [""]);
  const [show, setShow] = useSiteParam<ConversionsOverTimeShow>("timeShow", "rate", SHOWS);
  const [compare, setCompare] = useSiteParam<Compare>("timeCompare", "none", COMPARES);
  const chosen = eventName || events[0] || "";
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
      <Choice label={t("conversion")} value={chosen} choices={events.length > 0 ? events : [chosen]} word={nameOf} onChange={setEventName} />
      <Choice label={t("show")} value={show} choices={SHOWS} word={(choice) => t(`shows.${choice}`)} onChange={setShow} />
      <Choice label={t("compare")} value={compare} choices={COMPARES} word={(choice) => (choice === "before" ? beforeName : t("compares.none"))} onChange={setCompare} />
    </div>
  );
  const from = chart?.points[0]?.day ?? null;
  const to = chart?.points[chart.points.length - 1]?.day ?? null;
  return (
    <ConversionsOverTimeChart
      title={t("timeTitle")}
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

