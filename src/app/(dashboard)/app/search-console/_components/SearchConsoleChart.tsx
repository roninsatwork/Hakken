"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatDay, formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";

type Day = { day: string; clicks: number; impressions: number; ctr: number; position: number };
type Measure = "clicks" | "impressions" | "ctr" | "position";

const MEASURES: Measure[] = ["clicks", "impressions", "ctr", "position"];

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

/**
 * The days as the chart draws them: each day, week or month in the range
 * that Google's figures cover, a day with no row counting as nothing shown;
 * the days before the history or after the newest are left out rather than
 * drawn as nothing.
 */
function points(days: Day[], range: { from: string; to: string; step: "day" | "week" | "month" }, held: { from: string | null; to: string | null }) {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const first = held.from && held.from > range.from ? held.from : range.from;
  const last = held.to && held.to < range.to ? held.to : range.to;
  const buckets = new Map<string, { lastDay: string; clicks: number; impressions: number; weighted: number }>();
  for (let day = first; day <= last; day = shiftDay(day, 1)) {
    const key = range.step === "day" ? day : range.step === "week" ? weekOf(day) : day.slice(0, 7);
    const bucket = buckets.get(key) ?? { lastDay: day, clicks: 0, impressions: 0, weighted: 0 };
    bucket.lastDay = day;
    const figures = byDay.get(day);
    if (figures) {
      bucket.clicks += figures.clicks;
      bucket.impressions += figures.impressions;
      bucket.weighted += figures.position * figures.impressions;
    }
    buckets.set(key, bucket);
  }
  // Each dated by its first day, so the chart marks the Google updates inside them.
  return [...buckets].map(([key, bucket]) => ({
    key,
    ...datedRow({ day: range.step === "month" ? `${key}-01` : key, lastDay: bucket.lastDay }, {}, range.step === "month" ? formatMonth(key) : formatShortDay(key)),
    clicks: bucket.clicks,
    impressions: bucket.impressions,
    // Percentage points, so the scale reads "2.1" rather than "0.021".
    ctr: bucket.impressions > 0 ? Math.round((bucket.clicks / bucket.impressions) * 1000) / 10 : null,
    position: bucket.impressions > 0 ? Math.round((bucket.weighted / bucket.impressions) * 10) / 10 : null,
  }));
}

/**
 * Clicks and impressions over the dates chosen, with click-through rate and
 * average position a tick away — each line on its own scale, position's
 * running from the top as 1 is best — and the chart's own download, as every
 * Sites chart has (D16).
 */
export function SearchConsoleChart({ title, days, range, held, host, exportName }: {
  title: string;
  days: Day[];
  range: { from: string; to: string; step: "day" | "week" | "month" };
  held: { from: string | null; to: string | null };
  host: string;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.chart");
  const tr = useTranslations("sites.range");
  const { platformName } = useSystemSettings();
  const [shown, setShown] = useState<Record<Measure, boolean>>({ clicks: true, impressions: true, ctr: false, position: false });
  const data = points(days, range, held);
  const names: Record<Measure, string> = { clicks: t("clicks"), impressions: t("impressions"), ctr: `${t("ctr")} (%)`, position: t("position") };
  const series = MEASURES.filter((measure) => shown[measure]).map((measure) => ({
    key: measure,
    name: names[measure],
    colour: COLOURS[measure],
    reversed: measure === "position",
  }));
  const steps = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  const caption = [host, `${formatDay(range.from)} – ${formatDay(range.to)}`, steps[range.step], platformName].filter(Boolean).join(" · ");
  const anything = data.some((point) => point.impressions > 0);
  return (
    <ChartExportWrapper
      exportName={exportName}
      formats={["png", "svg", "csv"]}
      csv={() => toCsv(
        [t("day"), t("clicks"), t("impressions"), `${t("ctr")} (%)`, t("position")],
        data.map((point) => [point.key, point.clicks, point.impressions, point.ctr, point.position]),
      )}
      svgTitle={title}
      caption={caption}
      themedBackground
      alwaysVisible
      downloadLabel={t("download")}
      formatLabels={{ png: t("png"), svg: t("svg"), csv: t("csv") }}
      className="rounded-2xl border border-border-dim bg-card/40 p-5"
    >
      <div className="flex flex-col gap-3 pr-28">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
          <p className="text-[12px] text-secondary">{t("hint")}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {MEASURES.map((measure) => (
            <Checkbox
              key={measure}
              label={names[measure]}
              checked={shown[measure]}
              // One line always stays: a chart with none says nothing.
              onChange={(checked) => setShown((before) => (!checked && MEASURES.filter((entry) => before[entry]).length === 1 ? before : { ...before, [measure]: checked }))}
            />
          ))}
        </div>
      </div>
      <div className="mt-4">
        {anything ? (
          <SiteLineChart data={data} series={series} />
        ) : (
          <p className="py-10 text-center text-[13px] text-secondary">{t("nothing")}</p>
        )}
      </div>
    </ChartExportWrapper>
  );
}
