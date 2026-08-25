"use client";

import type { ReactNode } from "react";

/**
 * One hover readout for every chart in the platform.
 *
 * Before this, each chart answered the hover question on its own: several
 * pinned a panel in place with hardcoded blacks that turn illegible in light
 * mode, and one shipped nothing at all and got Recharts' factory default — a
 * white box printing the raw column name, "companies : 6". A reader hovering
 * two charts on one screen was reading two different components.
 *
 * The shape follows how a hover is actually read. The pointer already says
 * which bar it is on, so the number leads and what it counts follows in
 * quieter ink. Series are keyed by a short stroke of their own colour rather
 * than a filled chip, because at this size a solid block is data-weight ink
 * doing a label's job.
 */

export type ChartTooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

type ChartTooltipProps = {
  /** Injected by Recharts. */
  active?: boolean;
  /** Injected by Recharts. */
  payload?: ChartTooltipEntry[];
  /** Injected by Recharts. */
  label?: string | number;
  /** Heading above the rows. Defaults to whatever the axis calls this point. */
  title?: (label: string, entries: ChartTooltipEntry[]) => ReactNode;
  /** What a row is called. Defaults to the series name — never the raw column key. */
  seriesLabel?: (entry: ChartTooltipEntry) => ReactNode;
  /** How a row's number reads. Defaults to a grouped whole number. */
  formatValue?: (value: number, entry: ChartTooltipEntry) => ReactNode;
  /** Drop rows sitting at nought, so a stacked column lists only what it holds. */
  hideEmptyRows?: boolean;
};

/** The band that follows the pointer across bars. Reads in both themes. */
export const CHART_CURSOR = { fill: "var(--color-hover)" } as const;

/** The hairline that finds the date on a line or area chart. */
export const CHART_CROSSHAIR = {
  stroke: "var(--color-secondary)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
  strokeOpacity: 0.5,
} as const;

/** The lift a hovered bar gets, so the mark visibly answers the pointer. */
export const CHART_ACTIVE_BAR = {
  stroke: "var(--color-foreground)",
  strokeOpacity: 0.35,
  strokeWidth: 1,
} as const;

/**
 * The panel every hover readout is drawn on. Charts with a bespoke row layout
 * render into this rather than restating the border, surface and shadow, so
 * one change moves every tooltip in the platform at once.
 */
export function ChartTooltipSurface({ heading, children }: { heading?: ReactNode; children: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-[8rem] max-w-[16rem] rounded-[10px] border border-border-dim bg-card px-3 py-2 shadow-lg">
      {heading ? <div className="text-[11px] font-medium text-secondary">{heading}</div> : null}
      <div className={`flex flex-col gap-1 ${heading ? "mt-1.5" : ""}`}>{children}</div>
    </div>
  );
}

function defaultLabel(entry: ChartTooltipEntry): string {
  return String(entry.name ?? entry.dataKey ?? "");
}

export function ChartTooltip({
  active,
  payload,
  label,
  title,
  seriesLabel,
  formatValue,
  hideEmptyRows = false,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const rows = hideEmptyRows ? payload.filter((entry) => Number(entry.value ?? 0) !== 0) : payload;
  if (rows.length === 0) return null;

  const rawLabel = label === undefined || label === null ? "" : String(label);
  const heading = title ? title(rawLabel, payload) : rawLabel;

  return (
    <ChartTooltipSurface heading={heading}>
      {rows.map((entry, index) => {
        const swatch =
          entry.color ?? (typeof entry.payload?.fill === "string" ? entry.payload.fill : undefined);
        const value = Number(entry.value ?? 0);

        return (
          <div key={String(entry.dataKey ?? entry.name ?? index)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[2px] w-3 shrink-0 rounded-full"
              style={{ backgroundColor: swatch ?? "var(--color-muted)" }}
            />
            <span className="text-[13px] font-semibold tabular-nums text-foreground">
              {formatValue ? formatValue(value, entry) : value.toLocaleString()}
            </span>
            <span className="truncate text-[12px] text-secondary">
              {seriesLabel ? seriesLabel(entry) : defaultLabel(entry)}
            </span>
          </div>
        );
      })}
    </ChartTooltipSurface>
  );
}
