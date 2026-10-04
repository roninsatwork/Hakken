"use client";

import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatDay, formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";
import { useSeriesTicks } from "./SearchConsoleChartCard";

type Day = { day: string; clicks: number; impressions: number; ctr: number; position: number };
type Measure = "clicks" | "impressions" | "ctr" | "position";

const MEASURES: readonly Measure[] = ["clicks", "impressions", "ctr", "position"];
/** Drawn a tick away rather than at first: click-through rate and average position. */
const UNTICKED: readonly Measure[] = ["ctr", "position"];

/** The measure's line: the site's own orange for clicks, then violet, teal and blue — never red beside green. */
const COLOURS: Record<Measure, string> = {
  clicks: SITE_SERIES_COLOURS[0],
  impressions: SITE_SERIES_COLOURS[2],
  ctr: SITE_SERIES_COLOURS[4],
  position: SITE_SERIES_COLOURS[1],
};

/** The Monday a day's week starts on. */
function weekOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

/** All the days of a week or month, against which a part of one is told. */
function lengthOf(key: string, step: "day" | "week" | "month"): number {
  if (step === "day") return 1;
  if (step === "week") return 7;
  const next = shiftDay(`${key}-28`, 4).slice(0, 7);
  return Math.round((Date.parse(`${next}-01T00:00:00Z`) - Date.parse(`${key}-01T00:00:00Z`)) / 86_400_000);
}

/**
 * The days as the chart draws them: each day, week or month in the range
 * that Google's figures cover, a day with no row counting as nothing shown;
 * the days before the history or after the newest are left out rather than
 * drawn as nothing. A week or month cut by the dates or the history holds
 * fewer days, so it is marked as part of one (2026-10-04: its dip read as a
 * fall) and its hover names its days, through `readout`.
 */
export function chartPoints(
  days: Day[],
  range: { from: string; to: string; step: "day" | "week" | "month" },
  held: { from: string | null; to: string | null },
  readout: (first: string, last: string, days: number, part: boolean) => string,
) {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const first = held.from && held.from > range.from ? held.from : range.from;
  const last = held.to && held.to < range.to ? held.to : range.to;
  const buckets = new Map<string, { firstDay: string; lastDay: string; days: number; clicks: number; impressions: number; weighted: number }>();
  for (let day = first; day <= last; day = shiftDay(day, 1)) {
    const key = range.step === "day" ? day : range.step === "week" ? weekOf(day) : day.slice(0, 7);
    const bucket = buckets.get(key) ?? { firstDay: day, lastDay: day, days: 0, clicks: 0, impressions: 0, weighted: 0 };
    bucket.lastDay = day;
    bucket.days += 1;
    const figures = byDay.get(day);
    if (figures) {
      bucket.clicks += figures.clicks;
      bucket.impressions += figures.impressions;
      bucket.weighted += figures.position * figures.impressions;
    }
    buckets.set(key, bucket);
  }
  // Each dated by its first day, so the chart marks the Google updates inside them.
  return [...buckets].map(([key, bucket]) => {
    const part = bucket.days < lengthOf(key, range.step);
    return {
      key,
      ...datedRow(
        {
          day: range.step === "month" ? `${key}-01` : key,
          lastDay: bucket.lastDay,
          part,
          ...(range.step === "day" ? {} : { readout: readout(bucket.firstDay, bucket.lastDay, bucket.days, part) }),
        },
        {},
        range.step === "month" ? formatMonth(key) : formatShortDay(key),
      ),
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      // Percentage points, so the scale reads "2.1" rather than "0.021".
      ctr: bucket.impressions > 0 ? Math.round((bucket.clicks / bucket.impressions) * 1000) / 10 : null,
      position: bucket.impressions > 0 ? Math.round((bucket.weighted / bucket.impressions) * 10) / 10 : null,
    };
  });
}

/**
 * Clicks and impressions over the dates chosen, with click-through rate and
 * average position a tick away — each line on its own scale, position's
 * running from the top as 1 is best — and the chart's own download, as every
 * Sites chart has (D16).
 *
 * A screen drawn with fewer measures names them (`measures`) and says what
 * its chart is for (`hint`): Google updates draws clicks alone, with one tick
 * box and the hint to hover a G (search-console-plan.md §13.3).
 */
export function SearchConsoleChart({ title, hint, measures = MEASURES, days, range, held, host, exportName, height }: {
  title: string;
  /** The line under the title, when the screen's chart is drawn for something of its own. */
  hint?: string;
  /** The measures the chart offers, each with its tick box: all four unless the screen was drawn with fewer. */
  measures?: readonly Measure[];
  /** The plot's height, when a screen draws it taller than the Sites charts' own (a record's screen: 340, as drawn). */
  height?: number;
  days: Day[];
  range: { from: string; to: string; step: "day" | "week" | "month" };
  held: { from: string | null; to: string | null };
  host: string;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.chart");
  const tr = useTranslations("sites.range");
  const { platformName } = useSystemSettings();
  const data = chartPoints(days, range, held, (first, last, count, part) => {
    const dates = `${formatShortDay(first)} – ${formatShortDay(last)}`;
    return part ? t("partDays", { dates, days: count }) : dates;
  });
  const names: Record<Measure, string> = { clicks: t("clicks"), impressions: t("impressions"), ctr: `${t("ctr")} (%)`, position: t("position") };
  const { shown: series, controls } = useSeriesTicks(
    measures.map((measure) => ({ key: measure, name: names[measure], colour: COLOURS[measure], reversed: measure === "position" })),
    UNTICKED,
  );
  const steps = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  const caption = [host, `${formatDay(range.from)} – ${formatDay(range.to)}`, steps[range.step], platformName].filter(Boolean).join(" · ");
  const anything = data.some((point) => point.impressions > 0);
  return (
    <ChartCard
      title={title}
      hint={hint ?? t("hint")}
      controls={<div className="flex flex-wrap gap-x-5 gap-y-2">{controls}</div>}
      exportName={exportName}
      csv={() => toCsv(
        [t("day"), ...measures.map((measure) => names[measure])],
        data.map((point) => [point.key, ...measures.map((measure) => point[measure])]),
      )}
      caption={caption}
      enoughData={anything}
      emptyText={t("nothing")}
    >
      <SiteLineChart data={data} series={series} {...(height ? { height } : {})} />
    </ChartCard>
  );
}
