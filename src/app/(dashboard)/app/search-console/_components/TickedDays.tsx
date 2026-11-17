"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { Button } from "@/src/ui/components/screens/Button";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import type { TableTicks } from "@/src/ui/components/screens/TableTicks";
import { PLOTTED_COLOURS } from "../../analytics/_components/AllPagesParts";
import { formatNumber } from "../../sites/_components/siteFormat";
import { TABLE_PAGE_KEY, useSetSiteParams, useSiteParam } from "../../sites/_components/useSiteParam";
import { everyDay, lineOf, usePerformanceDates } from "./PerformanceParts";
import type { SiteFigures } from "./SearchConsoleFigures";
import { formatPosition } from "./searchConsoleFormat";
import { useLiveAsks } from "./searchConsoleRecords";
import { countryArg, periodArg, useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

/**
 * Rows ticked in a Search Console table, drawn day by day: Keywords' keywords (search-console-keywords-way-2-plan-
 * 2026-11-17.md) and Pages' pages (search-console-pages-way-1-plan-2026-11-17.md), as All pages draws ticked pages. One
 * part for both, from the shared `DaysChart` and `TableTicks`: Keywords lays the whole website beside its keywords,
 * Pages lays each page's span before under it.
 */

/** Rows on the chart at once, as All pages' pages. */
export const MOST_TICKED = 5;
/** The ticked rows, in the address, so Back from a row's own screen draws them again. */
const PLOT_KEY = "plot";
/** Held in the address when every tick was cleared on a page that opens with some ticked, so it stays cleared. */
const NONE_TICKED = "\n";

/**
 * The rows ticked to draw, in the order ticked, and the tick that changes them; the table stays on its page. A page
 * that opens with rows ticked (`opening`, Pages' three busiest) writes them into the address once, so sorting the table
 * afterwards never changes what the chart draws.
 */
export function useTickedRows(limit: string, opening?: readonly string[] | null): TableTicks {
  const params = useSearchParams();
  const set = useSetSiteParams();
  const held = params.get(PLOT_KEY);
  const keys = (held ?? "").split("\n").filter(Boolean).slice(0, MOST_TICKED);
  const page = params.get(TABLE_PAGE_KEY);
  const first = opening && opening.length > 0 ? opening.slice(0, MOST_TICKED).join("\n") : null;
  useEffect(() => {
    if (held === null && first) set({ [PLOT_KEY]: first, [TABLE_PAGE_KEY]: page });
  }, [held, first, page, set]);
  return {
    keys: held === null && first ? first.split("\n") : keys,
    // A keyword or an address can hold a comma, so they're kept a line each.
    set: (now) => set({ [PLOT_KEY]: now.length > 0 ? now.slice(0, MOST_TICKED).join("\n") : (opening ? NONE_TICKED : null), [TABLE_PAGE_KEY]: page }),
    most: MOST_TICKED,
    limit,
  };
}

type Day = SiteFigures["days"][number];
/** A ticked row's days and its span before's, and its clicks against the span before where Google keeps it; null while on its way. */
export type TickedRow = { key: string; days: Day[] | null; daysBefore: Day[]; clicks: number | null; previousClicks: number | null; failed: boolean };

/**
 * Each ticked row's days, asked of Google once while the page is open (`searchConsoleKeySeries`, the read a row's own
 * screen makes), for the dates and kind of result chosen: a keyword's in the country chosen, a page's in every country,
 * as the page list counts them.
 */
export function useTickedDays(dimension: "query" | "page", keys: readonly string[]): { rows: TickedRow[]; retry: () => void } {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const held = Boolean(status?.connection?.newestDay) && !range.waiting && range.days > 0;
  const asks = held
    ? keys.map((key) => ({ siteId, searchType: kind, dimension, key, from: range.from, to: range.to, ...periodArg(range), ...(dimension === "query" ? countryArg(country) : {}) }))
    : [];
  const { answers, retry } = useLiveAsks(api.searchConsoleLists.searchConsoleKeySeries, asks);
  // The same rows and answers keep the same list: the eye reads it.
  const ticked = keys.join("\n");
  const rows = useMemo(() => (ticked ? ticked.split("\n") : []).map((key, at): TickedRow => {
    const answer = answers[at];
    if (!answer) return { key, days: null, daysBefore: [], clicks: null, previousClicks: null, failed: false };
    if (!answer.ok) return { key, days: [], daysBefore: [], clicks: null, previousClicks: null, failed: true };
    return {
      key,
      days: answer.days,
      daysBefore: answer.daysBefore ?? [],
      clicks: answer.totals?.clicks ?? 0,
      previousClicks: answer.previousHeld ? (answer.previous?.clicks ?? 0) : null,
      failed: false,
    };
  }), [ticked, answers]);
  return { rows, retry };
}

const SHOWN = ["clicks", "impressions", "position"] as const;
type Shown = (typeof SHOWN)[number];
const WHOLE = ["on", "off"] as const;
const AGAINST = ["before", "none"] as const;

/**
 * Clicks, impressions or average position day by day (week by week, month by month on longer dates): a line for each row
 * ticked in the table. Keywords also lays the whole website beside them, dashed (`website`), as All pages does; Pages
 * lays each page's span before under it in its own colour, dashed (`compare`), as Performance lays the website's.
 */
export function TickedDaysCard({ words, ticked, host, heldFrom, retry, exportName, nameOf = (key) => key, website, compare = false }: {
  /** The page's words for its chart: `searchConsole.keywords.chart` or `searchConsole.pages.chart`. */
  words: "searchConsole.keywords.chart" | "searchConsole.pages.chart";
  ticked: readonly TickedRow[];
  host: string;
  heldFrom: string | null;
  retry: () => void;
  exportName: string;
  /** A row's name on the chart: a page's is short (Anthony, 17 November 2026: "i dont like long axis lables"). */
  nameOf?: (key: string) => string;
  /** The whole website's days, for Keywords' "Your whole website" line. */
  website?: SiteFigures;
  /** Each row's span before, dashed under it, with a Compare with menu. */
  compare?: boolean;
}) {
  const t = useTranslations(words);
  const tk = useTranslations("searchConsole.keywords.chart");
  const tp = useTranslations("searchConsole.performance.days");
  const tc = useTranslations("searchConsole.chart");
  const tr = useTranslations("searchConsole");
  const dates = usePerformanceDates();
  const { range } = dates;
  const [shown, setShown] = useSiteParam<Shown>("show", "clicks", SHOWN);
  const [whole, setWhole] = useSiteParam<(typeof WHOLE)[number]>("whole", "on", WHOLE);
  const [against, setAgainst] = useSiteParam<(typeof AGAINST)[number]>("against", "none", AGAINST);
  const newest = (days: readonly Day[]) => days.reduce((last, day) => (day.day > last ? day.day : last), range.from);
  const last = website ? newest(website.days) : ticked.reduce((latest, row) => { const day = newest(row.days ?? []); return day > latest ? day : latest; }, range.from);
  const first = heldFrom && heldFrom > range.from ? heldFrom : range.from;
  const to = last < range.to ? last : range.to;
  const names: Record<Shown, string> = { clicks: tc("clicks"), impressions: tc("impressions"), position: tc("position") };
  const drawn = ticked.flatMap((row, at) => (row.days && !row.failed ? [{ row, colour: PLOTTED_COLOURS[at] ?? CHART_SERIES_SLATE }] : []));
  // The span before is drawn only where Google keeps it for every row drawn.
  const beforeHeld = compare && drawn.length > 0 && drawn.every(({ row }) => row.previousClicks !== null);
  const comparing = beforeHeld && against === "before";
  const lines: DaysLine[] = [
    ...drawn.map(({ row, colour }, at) => ({ key: `row${at}`, name: nameOf(row.key), colour, ...lineOf(everyDay(row.days ?? [], first, to), shown) })),
    ...(comparing ? drawn.map(({ row, colour }, at) => ({
      key: `before${at}`, name: `${nameOf(row.key)}, ${dates.before}`, colour, dashed: true, under: true, gaps: true,
      ...lineOf(everyDay(row.daysBefore, range.before.from, range.before.to), shown),
    })) : []),
    ...(website && whole === "on" ? [{ key: "website", name: tk("website"), colour: CHART_SERIES_SLATE, dashed: true, ...lineOf(everyDay(website.days, first, to), shown) }] : []),
  ];
  const waitingFor = ticked.filter((row) => row.days === null).length;
  const failed = ticked.filter((row) => row.failed).map((row) => nameOf(row.key));
  const hint = [
    t("hint", { count: ticked.length, when: dates.inNow }),
    ...(comparing ? [tr("pages.chart.dashed", { before: dates.inBefore })] : []),
    ...(shown === "position" ? [tp("lowerBetter")] : []),
    ...(failed.length > 0 ? [t("failed", { names: failed.join(", ") })] : []),
  ].join(" ");
  const counted = shown !== "position";
  return (
    <div className="flex flex-col gap-2">
      <DaysChart
        title={tp("title", { name: names[shown], step: range.step })}
        hint={hint}
        exportName={exportName}
        csvDay={tc("day")}
        host={host}
        step={range.step}
        // Nothing to draw until a ticked row's days are in, with no other line drawn.
        waiting={lines.length === 0 && waitingFor > 0 ? t("waiting") : null}
        controls={[
          { kind: "select", key: "show", label: tp("showLabel"), value: shown, options: SHOWN.map((value) => ({ value, label: names[value] })), onChange: (next) => setShown(next as Shown) },
          ...(website ? [{
            kind: "select" as const, key: "whole", label: tk("website"), value: whole,
            options: WHOLE.map((value) => ({ value, label: tk(`switch.${value}`) })), onChange: (next: string) => setWhole(next as (typeof WHOLE)[number]),
          }] : []),
          ...(beforeHeld ? [{
            kind: "select" as const, key: "against", label: tp("compareWith"), value: against,
            options: [{ value: "none", label: tp("nothing") }, { value: "before", label: dates.before }], onChange: (next: string) => setAgainst(next as (typeof AGAINST)[number]),
          }] : []),
        ]}
        nothingTicked={ticked.length === 0 && !(website && whole === "on") ? t("nothingTicked", { most: MOST_TICKED }) : null}
        lines={lines}
        figure={names[shown]}
        format={counted ? formatNumber : (value) => formatPosition(Math.round(value * 10) / 10)}
        plain={counted}
        empty={tp("empty")}
        height={300}
      />
      {failed.length > 0 ? (
        <div>
          <Button variant="quiet" onClick={retry}>{tr("record.tryAgain")}</Button>
        </div>
      ) : null}
    </div>
  );
}
