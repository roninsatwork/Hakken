"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { useSiteRange } from "./SiteDateRange";
import { formatDay } from "./siteFormat";
import { useSite } from "./useSite";

/**
 * One chart on a Sites page: the kit's `ChartCard`, with the caption a
 * downloaded Sites chart carries — the website, the dates and step chosen,
 * and the platform's name (D16) — read from the Sites screen it is on.
 */
export function SiteChartCard({
  title,
  hint,
  controls,
  exportName,
  csv,
  enoughData,
  dated = true,
  dates,
  children,
}: {
  title: string;
  hint?: string;
  /** Tick boxes, tabs or a picker, between the title and the chart. */
  controls?: ReactNode;
  /** File name without date or extension: site, chart and dates. */
  exportName: string;
  csv?: () => string;
  /** False draws the "fills in as more checks run" note instead of the chart. */
  enoughData: boolean;
  /** Whether the chart follows the dates chosen; a snapshot (a split of the newest check) says no. */
  dated?: boolean;
  /**
   * The caption's dates and step, when the chart draws its own rather than the
   * page's: the Overview's twelve months against the twelve before.
   */
  dates?: string;
  children: ReactNode;
}) {
  const tr = useTranslations("sites.range");
  const { platformName } = useSystemSettings();
  const site = useSite();
  const range = useSiteRange();
  const steps = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  const caption = [
    site?.host,
    dates ?? (dated ? `${formatDay(range.from)} – ${formatDay(range.to)}` : null),
    dates ? null : dated ? steps[range.step] : null,
    platformName,
  ].filter(Boolean).join(" · ");
  return (
    <ChartCard title={title} hint={hint} controls={controls} exportName={exportName} csv={csv} caption={caption} enoughData={enoughData}>
      {children}
    </ChartCard>
  );
}
