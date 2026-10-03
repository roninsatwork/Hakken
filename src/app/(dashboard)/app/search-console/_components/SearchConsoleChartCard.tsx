"use client";

import type { ReactNode } from "react";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { formatDay } from "../../sites/_components/siteFormat";

/**
 * A Search Console chart: the kit's `ChartCard`, with the caption a
 * downloaded chart carries — the website, the dates and the platform's name
 * (D16). The Sites card reads the Sites website; this one is told the host
 * and dates, and lays its tick boxes out in a row.
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
  const { platformName } = useSystemSettings();
  const caption = [host, from && to ? `${formatDay(from)} – ${formatDay(to)}` : null, platformName].filter(Boolean).join(" · ");
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
