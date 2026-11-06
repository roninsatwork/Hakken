"use client";

import { useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { MouseReadout } from "@/src/ui/components/charts/MouseReadout";

export type AgainstRow = {
  key: string;
  label: string;
  /** The bar. */
  now: number;
  /** The mark; null with nothing to set it against yet, so the row shows its bar alone. */
  usual: number | null;
  /** The bar's figure as it's said, and what the mark means, in words beside the bar. */
  nowWord: string;
  usualWord: string;
  /** How far apart they are: a `Change`. The arrow carries the meaning, never the colour alone. */
  moved?: ReactNode;
  /** The hover's lines. */
  readout: ReadonlyArray<{ value: string; label: string }>;
  /** A sentence under the hover's lines: what to bear in mind about the mark. */
  note?: string;
};

/** Room left past the bigger of the two, so a mark at the very end still shows. */
const ROOM_PAST = 1.15;

/**
 * A bar for now and a mark for what's usual, each row on its own scale, so very different figures can sit together
 * (docs/plans/active/live-new-page-plan-2026-11-06.md; Anthony, 2026-11-06, from Way 3). For any figure against a usual or a target.
 * On a phone the label and the words sit above and below the bar, so the bar keeps its room. It's given what to show and reads nothing.
 */
export function AgainstBars({ rows, nowKey, usualKey }: {
  rows: readonly AgainstRow[];
  /** The key under the rows: what a bar is, and what a mark is. */
  nowKey: string;
  usualKey: string;
}) {
  const area = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const still = useReducedMotion();
  const hoveredRow = rows.find((row) => row.key === hovered);
  return (
    <div ref={area} data-part="against-bars" className="relative flex flex-col gap-5" onMouseLeave={() => setHovered(null)}>
      {rows.map((row) => {
        const most = Math.max(row.now, row.usual ?? 0, 1) * ROOM_PAST;
        return (
          <div
            key={row.key}
            data-row={row.key}
            className="grid grid-cols-1 items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(110px,170px)_minmax(0,1fr)_minmax(190px,230px)]"
            onMouseEnter={() => setHovered(row.key)}
          >
            <span className="text-[13px] text-foreground sm:text-right">{row.label}</span>
            <span className="relative block h-7 rounded-[3px] bg-foreground/10">
              <span
                data-bar=""
                className="absolute inset-y-0 left-0 block rounded-[3px]"
                style={{ width: `${(100 * row.now) / most}%`, backgroundColor: CHART_SERIES_ORANGE, transition: still ? "none" : "width 500ms ease-out" }}
              />
              {row.usual !== null ? (
                <span
                  data-mark=""
                  className="absolute block rounded-full text-foreground"
                  style={{ left: `${(100 * row.usual) / most}%`, top: -5, bottom: -5, width: 3, backgroundColor: "currentColor", transition: still ? "none" : "left 500ms ease-out" }}
                />
              ) : null}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[13px] text-foreground"><span className="font-mono">{row.nowWord}</span> {row.moved}</span>
              <span className="text-[12px] text-secondary">{row.usualWord}</span>
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-center gap-5 text-[12px] text-secondary">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: CHART_SERIES_ORANGE }} />{nowKey}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block rounded-full text-foreground" style={{ width: 3, height: 14, backgroundColor: "currentColor" }} />{usualKey}</span>
      </div>
      <MouseReadout area={area}>
        {hoveredRow ? (
          <ChartTooltipSurface heading={hoveredRow.label} wide>
            {hoveredRow.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
            {hoveredRow.note ? <p className="mt-1 whitespace-normal text-[12px] text-secondary">{hoveredRow.note}</p> : null}
          </ChartTooltipSurface>
        ) : null}
      </MouseReadout>
    </div>
  );
}
