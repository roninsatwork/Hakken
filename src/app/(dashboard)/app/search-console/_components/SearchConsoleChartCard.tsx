"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { formatDay } from "../../sites/_components/siteFormat";

/**
 * A Search Console chart's card: its title and one line under it, any tick
 * boxes, the chart, and the chart's own download — picture, drawing or
 * spreadsheet — as every Sites chart has (D16). The Sites card reads the
 * Sites website; this one is told the host and dates.
 */
export function SearchConsoleChartCard({ title, hint, controls, exportName, csv, host, from, to, children }: {
  title: string;
  hint: string;
  controls?: ReactNode;
  exportName: string;
  csv: () => string;
  host: string;
  from: string | null;
  to: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("searchConsole.chart");
  const { platformName } = useSystemSettings();
  const caption = [host, from && to ? `${formatDay(from)} – ${formatDay(to)}` : null, platformName].filter(Boolean).join(" · ");
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
          <p className="text-[12px] text-secondary">{hint}</p>
        </div>
        {controls ? <div className="flex flex-wrap gap-x-5 gap-y-2">{controls}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </ChartExportWrapper>
  );
}
