"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { SiteGainLossChart, type GainLossSeries, type GainLossStep } from "@/src/app/(dashboard)/app/sites/_components/SiteGainLossChart";
import { ChartCard } from "./ChartCard";
import { Checkbox } from "./Checkbox";

/** The step a chart runs by, as the caption says it. */
export type GainLossCardStep = "day" | "week" | "month";

/**
 * What was gained and what was lost, step by step, either side of a line, in its card (Anthony, 2026-11-19, on Search
 * Console's New and lost: "we need to ensure the component is built as a shared component"). The chart was already one
 * (`SiteGainLossChart`), but each page drew its card for itself: Search Console's New and lost with its tick boxes, its
 * waiting and empty states and its caption, and Visibility's New and lost with its own. Here once, for any page counting
 * things that came and went: searches, pages, links, products.
 *
 * It's given plain steps and reads nothing but Google's updates, which the chart marks itself. Its caption is the one every
 * downloaded chart carries: the website, the dates, the step and the platform's name. With `ticks`, each series has a tick
 * box, every one ticked as it opens, and one always stays. `loading` holds a waiting shape while the figures are on their
 * way; `empty` is words in place of the chart when there's nothing to draw. `filling` is the Visibility checks' "fills in
 * as more checks run", the kit card's own note.
 */
export function GainLossCard({
  title,
  hint,
  exportName,
  csv,
  host,
  from,
  to,
  step,
  steps,
  series,
  netLabel,
  startLegend,
  ticks = false,
  loading = false,
  empty = null,
  filling = false,
  height,
}: {
  title: string;
  hint?: string;
  exportName: string;
  csv: () => string;
  /** The caption's website, dates and step: the dates the chart draws, and what each bar is. */
  host: string | null | undefined;
  from: string | null;
  to: string | null;
  step: GainLossCardStep | null;
  steps: GainLossStep[];
  /** New, up, down and lost: their names and colours. */
  series: GainLossSeries[];
  netLabel: string;
  startLegend: string;
  ticks?: boolean;
  loading?: boolean;
  empty?: string | null;
  filling?: boolean;
  height?: number;
}) {
  const tr = useTranslations("sites.range");
  const { platformName } = useSystemSettings();
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const shown = ticks ? series.filter((entry) => !off.has(entry.key)) : series;
  const stepWords = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  const caption = [host, from && to ? `${formatDay(from)} – ${formatDay(to)}` : null, step ? stepWords[step] : null, platformName].filter(Boolean).join(" · ");
  const controls = ticks ? (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {series.map((entry) => (
        <Checkbox
          key={entry.key}
          label={entry.name}
          checked={!off.has(entry.key)}
          onChange={(checked) => setOff((before) => {
            const next = new Set(before);
            if (checked) next.delete(entry.key);
            // One always stays ticked, so the card never draws an empty chart.
            else if (series.some((other) => other.key !== entry.key && !before.has(other.key))) next.add(entry.key);
            return next;
          })}
        />
      ))}
    </div>
  ) : undefined;
  return (
    <ChartCard title={title} hint={hint} controls={controls} exportName={exportName} csv={csv} caption={caption} enoughData={!filling}>
      {loading ? (
        <div data-part="gain-loss-waiting" className="animate-pulse rounded-xl bg-sidebar/30" style={{ height: height ?? 280 }} aria-busy="true" />
      ) : empty ? (
        <p className="py-10 text-center text-[13px] text-secondary">{empty}</p>
      ) : (
        <SiteGainLossChart steps={steps} series={shown} netLabel={netLabel} startLegend={startLegend} {...(height ? { height } : {})} />
      )}
    </ChartCard>
  );
}
