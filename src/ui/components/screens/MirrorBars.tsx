"use client";

import { useRef, useState } from "react";
import { useElementWidth } from "@/src/hooks/useElementWidth";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { MouseReadout } from "@/src/ui/components/charts/MouseReadout";
import { ChartReveal } from "./ChartReveal";

export type MirrorBar = {
  key: string;
  /** Under the bar, on the line: "6". */
  label: string;
  /** The hover's heading: "Place 6". */
  heading: string;
  top: number;
  bottom: number;
  /** The hover's lines. */
  readout: ReadonlyArray<{ value: string; label: string }>;
};

/** A run of steps with a name, up to and including the bar keyed `upTo`: Google's top 3, its first page. */
export type MirrorZone = { upTo: string; name: string };

/** Each half's room, the line's, and the room above a bar for its figure. */
const HALF = 120;
const LINE = 22;
const ABOVE = 16;
/** A step this wide or wider says each bar's figure. */
const ROOM_FOR_FIGURES = 26;

/**
 * Two counts on one scale of steps, one above a line and one below it (built for Position bands' Way 3 on 19 November 2026,
 * then taken off that page and kept for other screens on Anthony's word, "keep the shared component as we will use it
 * elsewhere"; no screen uses it yet): a bar a step, each half on its own size,
 * so a step that has a lot of one and little of the other shows at a glance. Zones behind name runs of steps. Any two
 * counts over the same steps: keywords and clicks at each place on Google, visits and sales each hour, people and sales
 * each day of the week. Each bar says its figure where it fits, and the hover says them all. It's given what to show and
 * reads nothing. Bars rise above the line and fall below it as the redone charts come in (`ChartReveal`), and move to new
 * sizes when a menu changes them; a computer set to reduce motion gets them drawn at once. Drawn in real pixels.
 */
export function MirrorBars({ bars, zones, topLabel, bottomLabel, replay, topColour = CHART_SERIES_ORANGE, bottomColour = CHART_COMPARATOR_GREY, format = (value: number) => value.toLocaleString("en-GB") }: {
  bars: readonly MirrorBar[];
  /** What the bars show — the dates, the country — so new figures come in again (`ChartReveal`). A menu that only changes a count moves the bars to their new sizes instead. */
  replay?: string;
  zones: readonly MirrorZone[];
  topLabel: string;
  bottomLabel: string;
  topColour?: string;
  bottomColour?: string;
  format?: (value: number) => string;
}) {
  const area = useRef<HTMLDivElement | null>(null);
  const [watch, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);
  const still = useReducedMotion();
  const hoveredBar = bars.find((bar) => bar.key === hovered);
  const [mostTop, mostBottom] = [Math.max(1, ...bars.map((bar) => bar.top)), Math.max(1, ...bars.map((bar) => bar.bottom))];
  const figures = width === 0 || width / Math.max(1, bars.length) >= ROOM_FOR_FIGURES;
  // Each zone's first and last bar, in order: a zone runs on from the one before it.
  let first = 0;
  const spans = zones.map((zone) => {
    const last = bars.findIndex((bar) => bar.key === zone.upTo);
    const span = { ...zone, from: first, to: last < 0 ? bars.length - 1 : last };
    first = span.to + 1;
    return span;
  });
  const zoneOf = (at: number) => Math.max(0, spans.findIndex((span) => at >= span.from && at <= span.to));
  const grow = still ? "none" : "height 500ms ease-out";
  const columns = { gridTemplateColumns: `repeat(${Math.max(1, bars.length)}, minmax(0, 1fr))` };
  return (
    <div ref={(node) => { area.current = node; return watch(node); }} data-part="mirror-bars" className="relative flex flex-col gap-3" onMouseLeave={() => setHovered(null)}>
      <div className="grid text-[12px] text-secondary" style={columns}>
        {spans.map((span) => (
          <span key={span.name} className="truncate px-1" style={{ gridColumn: `${span.from + 1} / ${span.to + 2}` }}>{span.name}</span>
        ))}
      </div>
      <ChartReveal replay={replay ?? `${bars.length}:${bars[0]?.key ?? ""}:${bars.at(-1)?.key ?? ""}`} motion="rise" figures="[data-reveal]">
        <div className="grid" style={columns}>
          {bars.map((bar, at) => (
            <div
              key={bar.key}
              data-bar={bar.key}
              className={`flex flex-col items-center ${zoneOf(at) % 2 === 0 ? "bg-foreground/5" : "bg-foreground/[0.02]"}`}
              onMouseEnter={() => setHovered(bar.key)}
              style={{ opacity: hovered === null || hovered === bar.key ? 1 : 0.55 }}
            >
              <div className="flex w-full flex-col items-center justify-end" style={{ height: HALF }}>
                {figures && bar.top > 0 ? <span className="font-mono text-[10px] text-secondary">{format(bar.top)}</span> : null}
                <span data-reveal="rise" data-top="" className="block w-[70%] rounded-t-[2px]" style={{ height: (bar.top / mostTop) * (HALF - ABOVE), backgroundColor: topColour, transition: grow }} />
              </div>
              <span className="flex items-center text-[11px] text-foreground" style={{ height: LINE }}>{bar.label}</span>
              <div className="flex w-full flex-col items-center justify-start" style={{ height: HALF }}>
                <span data-reveal="fall" data-bottom="" className="block w-[70%] rounded-b-[2px]" style={{ height: (bar.bottom / mostBottom) * (HALF - ABOVE), backgroundColor: bottomColour, transition: grow }} />
                {figures && bar.bottom > 0 ? <span className="font-mono text-[10px] text-secondary">{format(bar.bottom)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </ChartReveal>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-secondary">
        <span className="inline-flex items-center gap-2"><span className="block h-3 w-3 rounded-[3px]" style={{ backgroundColor: topColour }} />{topLabel}</span>
        <span className="inline-flex items-center gap-2"><span className="block h-3 w-3 rounded-[3px]" style={{ backgroundColor: bottomColour }} />{bottomLabel}</span>
      </div>
      <MouseReadout area={area}>
        {hoveredBar ? (
          <ChartTooltipSurface heading={hoveredBar.heading} wide>
            {hoveredBar.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
          </ChartTooltipSurface>
        ) : null}
      </MouseReadout>
    </div>
  );
}
