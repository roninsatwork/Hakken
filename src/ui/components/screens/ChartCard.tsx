"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { cn } from "@/src/ui/lib/utils";

const FRAME = "rounded-2xl border border-border-dim bg-card/40 p-5";

/**
 * One chart in its card: its title and what it shows, any tick boxes or tabs,
 * the chart, and a download that is always there — picture, sharp picture or
 * numbers, drawn in the theme the reader is looking at (Sites D16). A chart
 * with too little to draw says so in words (Sites D8), never as a flat line
 * that reads as "nothing changed".
 *
 * `caption` is what a downloaded chart needs to explain itself — website,
 * dates, step, the platform's name — and is the caller's to write, since
 * Sites and Search Console know their dates differently. Without `exportName`
 * the card has no download: a panel of figures in the same frame as the
 * charts beside it. One part where Sites, Search Console and the Overview's
 * panels drew three (2026-10-03 clean-up).
 */
export function ChartCard({
  title,
  hint,
  controls,
  exportName,
  csv,
  caption,
  enoughData = true,
  emptyText,
  className,
  children,
}: {
  title: string;
  hint?: ReactNode;
  /** Tick boxes, tabs or a picker, between the title and the chart. */
  controls?: ReactNode;
  /** File name without date or extension; leave out for a card with no download. */
  exportName?: string;
  csv?: () => string;
  caption?: string;
  /** False draws the "fills in as more checks run" note instead of the chart. */
  enoughData?: boolean;
  /** What the card says instead of a chart with nothing to draw, when the screen has its own words for it. */
  emptyText?: string;
  /** Layout only — a height, a scroll, a place in a grid. Never a colour, a frame or a font. */
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("ui.chart");
  const head = (
    <div className={exportName ? "flex flex-col gap-3 pr-28" : "flex flex-col gap-3"}>
      <div>
        <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
        {hint ? <p className="text-[12px] text-secondary">{hint}</p> : null}
      </div>
      {controls}
    </div>
  );
  const body = (
    <div className="mt-4">
      {enoughData ? children : <p className="py-10 text-center text-[13px] text-secondary">{emptyText ?? t("notEnough")}</p>}
    </div>
  );
  if (!exportName) {
    return (
      <section className={cn(FRAME, className)}>
        {head}
        {body}
      </section>
    );
  }
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
      className={cn(FRAME, className)}
    >
      {head}
      {body}
    </ChartExportWrapper>
  );
}
