"use client";

import { useRef, useState } from "react";
import { useElementWidth } from "@/src/hooks/useElementWidth";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { MouseReadout } from "@/src/ui/components/charts/MouseReadout";

export type MinuteBar = {
  /** The same for a step however far along it has moved, so its bar slides rather than being drawn again. */
  key: string | number;
  value: number;
  /** Its name under the chart and in the hover: "Now", "5 min ago". */
  label: string;
};

const GAP = 4;
const TOP = 18;
const BOTTOM = 22;
/** Room a bar needs to say its figure. Narrower, as on a phone, only the busiest and the newest say theirs. */
const ROOM_FOR_A_FIGURE = 14;
/** A label under the chart every this many steps, and always the newest; twice as far apart where they'd run into each other, as on a phone. */
const LABEL_EVERY = 5;
const LABEL_ROOM = 64;
/** Width to draw at before one can be measured. */
const UNMEASURED = 800;

/**
 * One bar for each step, the oldest first, the newest lit and pulsing, each saying its figure (docs/plans/active/
 * live-new-page-plan-2026-11-06.md; Anthony, 2026-11-06). As a new step comes in the bars slide along and only the new one
 * appears, so nothing jumps or draws again. For any short run of recent figures. Drawn in real pixels, so its words and height stay
 * the same on any screen (AGENTS.md: a chart never grows with the screen). It's given what to show and reads nothing.
 */
export function MinuteBars({ bars, name, measure, height = 170 }: {
  bars: readonly MinuteBar[];
  /** What the chart is, for a screen reader. */
  name: string;
  /** What a bar counts, as the hover says it. */
  measure: (value: number) => string;
  height?: number;
}) {
  const [watch, measured] = useElementWidth();
  const area = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | number | null>(null);
  const still = useReducedMotion();
  const width = measured > 0 ? measured : UNMEASURED;
  const each = bars.length > 0 ? (width - GAP * (bars.length - 1)) / bars.length : 0;
  const most = Math.max(1, ...bars.map((bar) => bar.value));
  const room = Math.max(0, height - TOP - BOTTOM);
  const labelEvery = (each + GAP) * LABEL_EVERY >= LABEL_ROOM ? LABEL_EVERY : LABEL_EVERY * 2;
  const hoveredBar = bars.find((bar) => bar.key === hovered);
  return (
    <div
      ref={(node) => {
        area.current = node;
        return watch(node);
      }}
      data-part="minute-bars"
      className="relative"
      onMouseLeave={() => setHovered(null)}
    >
      <svg role="img" aria-label={name} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {bars.map((bar, at) => {
          const barHeight = bar.value > 0 ? Math.max(4, (bar.value / most) * room) : 2;
          const y = TOP + room - barHeight;
          const newest = at === bars.length - 1;
          const says = bar.value > 0 && (each >= ROOM_FOR_A_FIGURE || newest || bar.value === most);
          const lit = newest || bar.key === hovered;
          return (
            <g
              key={bar.key}
              data-minute={at}
              style={{ transform: `translateX(${at * (each + GAP)}px)`, transition: still ? "none" : "transform 500ms ease-out" }}
              onMouseEnter={() => setHovered(bar.key)}
            >
              <rect x={0} y={0} width={each + GAP} height={height} fill="transparent" />
              <rect
                data-bar=""
                x={0}
                y={y}
                width={each}
                height={barHeight}
                rx={Math.min(3, each / 2)}
                fill={bar.value > 0 ? CHART_SERIES_ORANGE : CHART_COMPARATOR_GREY}
                fillOpacity={lit ? 1 : bar.value > 0 ? 0.55 : 0.35}
                style={{ transition: still ? "none" : "y 400ms ease-out, height 400ms ease-out, fill-opacity 120ms ease-out" }}
              />
              {newest ? (
                <circle
                  data-now=""
                  cx={each / 2}
                  cy={Math.max(6, y - 13)}
                  r={4}
                  fill={CHART_SERIES_ORANGE}
                  className="animate-pulse motion-reduce:animate-none"
                />
              ) : null}
              {says ? (
                <text
                  x={newest ? each / 2 - 10 : each / 2}
                  y={y - 5}
                  textAnchor={newest ? "end" : "middle"}
                  fontSize={11}
                  fill="currentColor"
                  className={newest ? "font-mono text-foreground" : "font-mono text-secondary"}
                >
                  {bar.value}
                </text>
              ) : null}
              {(bars.length - 1 - at) % labelEvery === 0 ? (
                <text x={newest ? each : each / 2} y={height - 5} textAnchor={newest ? "end" : "middle"} fontSize={11} fill="currentColor" className="text-muted">
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <MouseReadout area={area}>
        {hoveredBar ? (
          <ChartTooltipSurface heading={hoveredBar.label}>
            <ChartTooltipRow colour={CHART_SERIES_ORANGE} value={hoveredBar.value.toLocaleString()} label={measure(hoveredBar.value)} />
          </ChartTooltipSurface>
        ) : null}
      </MouseReadout>
    </div>
  );
}
