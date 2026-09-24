"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { useSiteRange } from "./SiteDateRange";
import { formatDay } from "./siteFormat";
import { useSite } from "./useSite";

/**
 * One chart on a Sites page: its title and what it shows, any tick boxes or
 * tabs, the chart, and a download that is always there (D16).
 *
 * The download is PNG, SVG or CSV, drawn in the theme the reader is looking at
 * — the kit's `ChartExportWrapper` with its themed options switched on. A
 * chart with too little to draw says so in words (D8), never as a flat line
 * that reads as "nothing changed".
 */
export function SiteChartCard({
  title,
  hint,
  controls,
  exportName,
  csv,
  enoughData,
  dated = true,
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
  children: ReactNode;
}) {
  const t = useTranslations("sites.chart");
  const tr = useTranslations("sites.range");
  const { platformName } = useSystemSettings();
  const site = useSite();
  const range = useSiteRange();
  const steps = { day: tr("daily"), week: tr("weekly"), month: tr("monthly") } as const;
  // Site, dates and step, and the platform's configured name: what a downloaded chart needs to explain itself (D16).
  const caption = [
    site?.host,
    dated ? `${formatDay(range.from)} – ${formatDay(range.to)}` : null,
    dated ? steps[range.step] : null,
    platformName,
  ].filter(Boolean).join(" · ");
  return (
    <ChartExportWrapper
      exportName={exportName}
      formats={["png", "svg", "csv"]}
      csv={csv}
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
          {hint ? <p className="text-[12px] text-secondary">{hint}</p> : null}
        </div>
        {controls}
      </div>
      <div className="mt-4">
        {enoughData ? children : (
          <p className="py-10 text-center text-[13px] text-secondary">{t("notEnough")}</p>
        )}
      </div>
    </ChartExportWrapper>
  );
}
