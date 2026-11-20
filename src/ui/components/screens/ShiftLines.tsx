"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { MouseReadout } from "@/src/ui/components/charts/MouseReadout";
import { ChartReveal } from "./ChartReveal";

export type ShiftRow = {
  key: string;
  label: string;
  /** Where it sat before; null with nothing before, so the row shows where it sits now alone. */
  from: number | null;
  to: number;
  /** Beside the row, as it's said: "16.3 → 13.2". */
  figures: string;
  /** Quieter words after the figures: "40,809 shown". */
  detail?: string;
  /** The hover's lines. */
  readout: ReadonlyArray<{ value: string; label: string }>;
};

/** A run of the scale with a name, from the zone before's end to `upTo`: Google's top 3, its first page. */
export type ShiftZone = { upTo: number; name: string };

const GRID = "grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(110px,220px)_minmax(0,1fr)_minmax(150px,220px)]";

/**
 * Where each thing sat before and where it sits now, on one scale (Anthony, 2026-11-19, Position bands' Way 2: "lets build
 * this as a shared component please i like this"): a row each, a hollow dot before and a filled dot now, joined by a line,
 * orange where it got better and grey where it got worse, so the dots' shapes and the figures carry it as well as the colour.
 * Zones behind the rows name runs of the scale, so a row near an edge shows it. Any figure with a before and a now: a
 * keyword's place on Google, a page's, a rate. Past `max` a dot waits at the end. It's given what to show and reads nothing.
 * The marks fade in as the redone charts come in (`ChartReveal`), and slide to new places when a menu changes them; a
 * computer set to reduce motion gets them drawn at once. On a phone the label and the figures sit above and below the scale.
 */
export function ShiftLines({ rows, min, max, zones, lowerIsBetter = false, tick = (value: number) => String(value), fromKey, toKey, replay }: {
  rows: readonly ShiftRow[];
  min: number;
  max: number;
  zones: readonly ShiftZone[];
  /** A place on Google: 1 is the top, so a smaller figure is better. */
  lowerIsBetter?: boolean;
  /** Each zone's edge under the scale, in words: "30+" for the last. */
  tick?: (value: number) => string;
  /** The key under the rows: what a hollow dot is, and what a filled one is. */
  fromKey: string;
  toKey: string;
  /** What the rows show — the dates, the choice — so new figures come in again. */
  replay?: string;
}) {
  const area = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const still = useReducedMotion();
  const hoveredRow = rows.find((row) => row.key === hovered);
  const at = (value: number) => (100 * (Math.min(max, Math.max(min, value)) - min)) / Math.max(1, max - min);
  const slide = still ? "none" : "left 500ms ease-out, width 500ms ease-out";
  let start = min;
  const spans = zones.map((zone) => { const span = { ...zone, from: start }; start = zone.upTo; return span; });
  const better = (row: ShiftRow) => row.from === null || (lowerIsBetter ? row.to < row.from : row.to > row.from);
  return (
    <div ref={area} data-part="shift-lines" className="relative flex flex-col gap-2" onMouseLeave={() => setHovered(null)}>
      <div className={GRID}>
        <span className="hidden sm:block" />
        <span className="relative block h-4 text-[12px] text-secondary">
          {spans.map((span) => (
            <span key={span.name} className="absolute truncate text-center" style={{ left: `${at(span.from)}%`, width: `${at(span.upTo) - at(span.from)}%` }}>{span.name}</span>
          ))}
        </span>
        <span className="hidden sm:block" />
      </div>
      <ChartReveal replay={replay ?? rows.map((row) => row.key).join(",")} motion="fade" figures="[data-reveal]">
        <div className="flex flex-col gap-1">
          {rows.map((row) => {
            const colour = better(row) ? CHART_SERIES_ORANGE : CHART_COMPARATOR_GREY;
            const [left, right] = row.from === null ? [at(row.to), at(row.to)] : [Math.min(at(row.from), at(row.to)), Math.max(at(row.from), at(row.to))];
            return (
              <div key={row.key} data-row={row.key} className={GRID} onMouseEnter={() => setHovered(row.key)} style={{ opacity: hovered === null || hovered === row.key ? 1 : 0.55 }}>
                <span className="truncate text-[13px] text-foreground sm:text-right" title={row.label}>{row.label}</span>
                <span className="relative block h-7">
                  {spans.map((span, index) => (
                    <span key={span.name} className={`absolute inset-y-0 block ${index % 2 === 0 ? "bg-foreground/5" : "bg-foreground/[0.02]"} ${index > 0 ? "border-l border-dashed border-border-dim" : ""}`} style={{ left: `${at(span.from)}%`, width: `${at(span.upTo) - at(span.from)}%` }} />
                  ))}
                  <span data-reveal="" className="absolute inset-0 block">
                    {row.from !== null ? <span data-line="" className="absolute top-1/2 block h-[2px] -translate-y-1/2" style={{ left: `${left}%`, width: `${right - left}%`, backgroundColor: colour, transition: slide }} /> : null}
                    {row.from !== null ? <span data-before="" className="absolute top-1/2 block h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card" style={{ left: `${at(row.from)}%`, borderColor: colour, transition: slide }} /> : null}
                    <span data-now="" className="absolute top-1/2 block h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${at(row.to)}%`, backgroundColor: colour, transition: slide }} />
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="font-mono text-secondary">{row.figures}</span>
                  {row.detail ? <span className="truncate text-secondary">{row.detail}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </ChartReveal>
      <div className={GRID}>
        <span className="hidden sm:block" />
        <span className="relative block h-4 text-[11px] text-secondary">
          {[min, ...zones.map((zone) => zone.upTo)].map((edge) => (
            <span key={edge} className="absolute -translate-x-1/2" style={{ left: `${at(edge)}%` }}>{tick(edge)}</span>
          ))}
        </span>
        <span className="hidden sm:block" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-secondary">
        <span className="inline-flex items-center gap-2"><span className="block h-[10px] w-[10px] rounded-full border-2 border-secondary" />{fromKey}</span>
        <span className="inline-flex items-center gap-2"><span className="block h-[11px] w-[11px] rounded-full bg-secondary" />{toKey}</span>
      </div>
      <MouseReadout area={area}>
        {hoveredRow ? (
          <ChartTooltipSurface heading={hoveredRow.label} wide>
            {hoveredRow.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
          </ChartTooltipSurface>
        ) : null}
      </MouseReadout>
    </div>
  );
}
