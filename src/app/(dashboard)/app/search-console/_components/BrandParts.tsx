"use client";

import { useTranslations } from "next-intl";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DaysChart, type DaysLine, type DaysPoint } from "@/src/ui/components/screens/DaysChart";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { formatNumber } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import type { SiteFigures } from "./SearchConsoleFigures";
import type { ListSummary } from "./SearchConsoleTables";
import { MoveLine } from "./PlacesParts";
import { oneDecimal } from "./PerformanceParts";
import type { ChartPeriod } from "./useChartPeriods";

/**
 * Brand and non-brand, as Anthony chose it on the canvas (20 November 2026: "for brand lets go with way 1";
 * search-console-breakdowns-plan-2026-11-20.md): four boxes against the period before, and the clicks each day, week or
 * month from brand searches and from the other searches Google names. Every part is shared: `Figure` boxes with
 * `MoveLine`, as Countries and devices', and `DaysChart`, as Performance's.
 */

type Split = NonNullable<ListSummary["brand"]>;

/** Brand searches out of every 100 clicks, every click counted, the hidden ones too: to one place, as the box says it. */
export function brandOutOf100(brandClicks: number, allClicks: number): number | null {
  return allClicks > 0 ? Math.round((1000 * brandClicks) / allClicks) / 10 : null;
}

/** The clicks Google names no search for: every click less the brand and other searches it names. Never below none. */
export function hiddenClicksOf(split: Split["now"], allClicks: number): number {
  return Math.max(0, allClicks - split.brandClicks - split.nonBrandClicks);
}

export function BrandBoxes({ split, figures, against }: { split: Split | null; figures: SiteFigures | undefined; against: string }) {
  const t = useTranslations("searchConsole.brand.boxes");
  const tp = useTranslations("searchConsole.places.boxes");
  if (!split || !figures?.totals) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const all = figures.totals.clicks;
  const allBefore = figures.previous?.clicks ?? null;
  const before = split.before ?? null;
  const share = brandOutOf100(split.now.brandClicks, all);
  const shareBefore = before && allBefore !== null ? brandOutOf100(before.brandClicks, allBefore) : null;
  const shareBy = share !== null && shareBefore !== null ? Math.round((share - shareBefore) * 10) / 10 : null;
  const hidden = hiddenClicksOf(split.now, all);
  return (
    <FigureRow>
      <Figure label={t("brand")} value={formatNumber(split.now.brandClicks)} detail={<MoveLine now={split.now.brandClicks} before={before?.brandClicks ?? null} against={against} />} />
      <Figure label={t("other")} value={formatNumber(split.now.nonBrandClicks)} detail={<MoveLine now={split.now.nonBrandClicks} before={before?.nonBrandClicks ?? null} against={against} />} />
      <Figure
        label={t("outOf100")}
        value={share === null ? "–" : oneDecimal(share)}
        detail={(
          <>
            <span className="block text-secondary">{t("fromBrand")}</span>
            {shareBy === null ? (
              <ChangeLine by={null}>{tp("nothingBefore", { before: against })}</ChangeLine>
            ) : shareBy === 0 ? (
              <ChangeLine by={0}>{tp("same", { before: against })}</ChangeLine>
            ) : (
              <ChangeLine by={shareBy}>{tp(shareBy > 0 ? "more" : "fewer", { change: oneDecimal(Math.abs(shareBy)), before: against })}</ChangeLine>
            )}
          </>
        )}
      />
      <Figure
        label={t("hidden")}
        value={formatNumber(hidden)}
        detail={<span className="text-secondary">{t("hiddenShare", { count: all > 0 ? Math.round((100 * hidden) / all) : 0 })}</span>}
      />
    </FigureRow>
  );
}

const SHOWS = ["clicks", "share"] as const;
type Show = (typeof SHOWS)[number];

/**
 * Clicks each day, week or month from brand searches and from the other searches Google names, in the step the page's menu
 * chose. Show: Clicks, or Out of every 100 clicks (every click counted, the hidden ones too, as the third box).
 */
export function BrandDaysCard({ periods, step, figures, host, inNow, note, exportName }: {
  periods: readonly ChartPeriod[];
  step: "day" | "week" | "month";
  figures: SiteFigures | undefined;
  host: string;
  /** For the middle of a sentence: "in October", "in these dates". */
  inNow: string;
  /** The chart's own line: drawn by week, starting later than the dates. */
  note: string | null;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.brand.chart");
  const tp = useTranslations("searchConsole.performance");
  const [show, setShow] = useSiteParam<Show>("show", "clicks", SHOWS);
  const sharing = show === "share";
  const point = (period: ChartPeriod, value: number): DaysPoint => ({ day: period.start, lastDay: period.lastDay, value });
  // Every click each day, for Out of every 100: the same days as the periods, added up by the chart's own step.
  const per: DaysPoint[] = (figures?.days ?? []).map((day) => ({ day: day.day, value: day.clicks }));
  const lines: DaysLine[] = [
    { key: "brand", name: tp("squares.groups.brand"), colour: CHART_SERIES_ORANGE, points: periods.map((period) => point(period, period.brandClicks)), ...(sharing ? { per } : {}) },
    { key: "other", name: tp("squares.groups.named"), colour: CHART_SERIES_BLUE, points: periods.map((period) => point(period, period.otherClicks)), ...(sharing ? { per } : {}) },
  ];
  const names: Record<Show, string> = { clicks: t("clicks"), share: t("share") };
  return (
    <DaysChart
      title={tp("days.title", { name: names[show], step })}
      hint={[t("hint", { when: inNow }), ...(note ? [note] : [])].join(" ")}
      exportName={exportName}
      csvDay={t("day")}
      host={host}
      step={step}
      waiting={sharing && figures === undefined ? undefined : null}
      controls={[{ kind: "select", key: "show", label: tp("days.showLabel"), value: show, options: SHOWS.map((value) => ({ value, label: names[value] })), onChange: (next) => setShow(next as Show) }]}
      lines={lines}
      figure={names[show]}
      format={sharing ? oneDecimal : formatNumber}
      plain={!sharing}
      anything={(rows) => rows.some((row) => Number(row.brand) > 0 || Number(row.other) > 0)}
      empty={tp("days.empty")}
      height={300}
    />
  );
}
