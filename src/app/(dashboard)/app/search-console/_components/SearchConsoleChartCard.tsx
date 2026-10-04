"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { formatDay } from "../../sites/_components/siteFormat";

/**
 * A Search Console chart: the kit's `ChartCard`, with the caption a
 * downloaded chart carries — the website, the dates, the step when the chart
 * runs by one, and the platform's name (D16). The Sites card reads the Sites
 * website; this one is told the host, dates and step, and lays its tick
 * boxes out in a row.
 */
export function SearchConsoleChartCard({ title, hint, controls, exportName, csv, host, from, to, step, children }: {
  title: string;
  hint: string;
  controls?: ReactNode;
  exportName: string;
  csv: () => string;
  host: string;
  from: string | null;
  to: string | null;
  /** What each point or bar is, as the chart draws it. */
  step?: "day" | "week" | "month";
  children: ReactNode;
}) {
  const { platformName } = useSystemSettings();
  const tr = useTranslations("sites.range");
  const steps = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  const caption = [host, from && to ? `${formatDay(from)} – ${formatDay(to)}` : null, step ? steps[step] : null, platformName].filter(Boolean).join(" · ");
  return (
    <ChartCard
      title={title}
      hint={hint}
      controls={controls ? <div className="flex flex-wrap gap-x-5 gap-y-2">{controls}</div> : undefined}
      exportName={exportName}
      csv={csv}
      caption={caption}
    >
      {children}
    </ChartCard>
  );
}

/**
 * A chart's tick boxes, one per line or bar, as every Search Console chart
 * was drawn (search-console-plan.md §13): the series still ticked, to draw,
 * and the boxes, for the card's `controls`. Every series starts ticked but
 * those named in `hidden`. One always stays, as on the clicks and impressions
 * chart: a chart with nothing ticked says nothing.
 */
export function useSeriesTicks<Series extends { key: string; name: string }>(
  series: readonly Series[],
  hidden: readonly string[] = [],
): { shown: Series[]; controls: ReactNode } {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set(hidden));
  const shown = series.filter((entry) => !off.has(entry.key));
  const controls = series.map((entry) => (
    <Checkbox
      key={entry.key}
      label={entry.name}
      checked={!off.has(entry.key)}
      onChange={(checked) => setOff((before) => {
        const next = new Set(before);
        if (checked) next.delete(entry.key);
        else if (series.some((other) => other.key !== entry.key && !before.has(other.key))) next.add(entry.key);
        return next;
      })}
    />
  ));
  return { shown, controls };
}
