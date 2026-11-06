"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useElementWidth } from "@/src/hooks/useElementWidth";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { LAYER } from "@/src/ui/lib/layers";
import { CHART_COMPARATOR_GREY, CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";

/**
 * Two rows of 100 cells, one for each figure, with a band joining each thing's share in one to its share in the other (Anthony,
 * 2026-11-06, Overview's Way 3: "absolutely lovely"). A band that gets wider going down does better in the bottom figure than the
 * top. Any figure against any other, for any split. It's handed whole numbers and words and reads nothing; `outOfTotal` makes
 * numbers that always add up. Every thing is named in the list under the chart, as a small one has no room on it. Pressing one
 * keeps it lit, and the page holds which, so it can be followed through the menus. Drawn in real pixels: it gets wider cells on
 * a wider screen, and keeps its height.
 */

export type StripSegment = {
  key: string;
  name: string;
  top: number;
  bottom: number;
  colour: string;
  /** On hover, in this order. */
  readout: ReadonlyArray<{ value: string; label: string }>;
};

const SIX_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_AMBER, CHART_SERIES_ROSE];

/** The six busiest keep a colour each, and the rest share grey, so it doesn't turn into a rainbow. The list names each one. */
export function stripColour(at: number): string {
  return SIX_COLOURS[at] ?? (at % 2 === 0 ? CHART_SERIES_SLATE : CHART_COMPARATOR_GREY);
}

const UNMEASURED = 800;
const STRIP = 30;
const BAND = 84;
const HEAD = 18;
const WORDS = 22;

export function HundredStrips({ segments, topLabel, bottomLabel, lit, onLit }: {
  segments: readonly StripSegment[];
  topLabel: string;
  bottomLabel: string;
  lit: string | null;
  onLit: (key: string | null) => void;
}) {
  const [watch, measured] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const width = measured || UNMEASURED;
  const yTop = HEAD + WORDS;
  const yBand = yTop + STRIP;
  const yBottom = yBand + BAND;
  const height = yBottom + STRIP + WORDS + HEAD;
  const cell = width / 100;
  // Each thing's place in the two rows: everything before it, added up.
  const placed = segments.map((segment, at) => ({
    segment,
    top: segments.slice(0, at).reduce((sum, one) => sum + one.top, 0),
    bottom: segments.slice(0, at).reduce((sum, one) => sum + one.bottom, 0),
  }));
  const shown = hover ?? lit;
  const hovered = hover ? segments.find((segment) => segment.key === hover) : null;
  const dimmed = (key: string) => shown !== null && shown !== key;
  const toggle = (key: string) => onLit(lit === key ? null : key);
  // The readout follows the pointer without drawing the chart again.
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    if (!tip.current) return;
    tip.current.style.left = `${x}px`;
    tip.current.style.top = `${event.clientY - box.top}px`;
    tip.current.style.transform = `translate(${x > width - 260 ? "calc(-100% - 12px)" : "12px"}, 12px)`;
  };
  const inner = Math.max(1, cell - 1).toFixed(1);
  const cells = (y: number, at: number, count: number, colour: string) => (
    <path fill={colour} d={Array.from({ length: count }, (_, index) => `M${((at + index) * cell).toFixed(1)} ${y}h${inner}v${STRIP}h-${inner}z`).join("")} />
  );
  // A number whenever it fits, and the name too where there's room: every name and number is in the list under the chart anyway.
  const word = (y: number, at: number, count: number, name: string) => {
    const room = count * cell;
    const said = room >= (name.length + 3) * 6.6 ? `${name} ${count}` : room >= 16 ? String(count) : null;
    return said ? <text x={at * cell} y={y} fill="currentColor" className="text-foreground" style={{ fontSize: 12 }}>{said}</text> : null;
  };

  return (
    // Only leaving the whole part lets go: the pointer crossing the gap between two cells must not, or the chart flickers (Anthony, 2026-11-06).
    <div ref={watch} data-part="hundred-strips" className="relative flex flex-col gap-3" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={`${topLabel}. ${bottomLabel}. ${segments.map((segment) => `${segment.name} ${segment.top} and ${segment.bottom}`).join(", ")}`}>
        <text x={0} y={12} fill="currentColor" className="text-secondary" style={{ fontSize: 12 }}>{topLabel}</text>
        <text x={0} y={height - 2} fill="currentColor" className="text-secondary" style={{ fontSize: 12 }}>{bottomLabel}</text>
        {placed.map(({ segment, top, bottom }) => (
          <g
            key={segment.key}
            data-segment={segment.key}
            className="cursor-pointer"
            opacity={dimmed(segment.key) ? 0.25 : 1}
            onMouseEnter={() => setHover(segment.key)}
            onClick={() => toggle(segment.key)}
          >
            <polygon points={`${top * cell},${yBand + 1} ${(top + segment.top) * cell - 1},${yBand + 1} ${(bottom + segment.bottom) * cell - 1},${yBottom - 1} ${bottom * cell},${yBottom - 1}`} fill={segment.colour} fillOpacity={0.24} />
            {cells(yTop, top, segment.top, segment.colour)}
            {cells(yBottom, bottom, segment.bottom, segment.colour)}
            {word(yTop - 7, top, segment.top, segment.name)}
            {word(yBottom + STRIP + 15, bottom, segment.bottom, segment.name)}
          </g>
        ))}
      </svg>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {segments.map((segment) => (
          <div
            key={segment.key}
            role="button"
            tabIndex={0}
            aria-pressed={lit === segment.key}
            data-key={segment.key}
            onClick={() => toggle(segment.key)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggle(segment.key);
            }}
            onMouseEnter={() => setHover(segment.key)}
            className="flex cursor-pointer items-center gap-2 text-[13px]"
            style={{ opacity: dimmed(segment.key) ? 0.45 : 1 }}
          >
            <span className="block h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: segment.colour }} />
            <span className="min-w-0 flex-1 truncate text-foreground">{segment.name}</span>
            <span className="whitespace-nowrap font-mono text-[12px] text-secondary">{segment.top} → {segment.bottom}</span>
          </div>
        ))}
      </div>
      <div ref={tip} className={`pointer-events-none absolute ${LAYER.RAISED}`} style={{ visibility: hovered ? "visible" : "hidden" }}>
        {hovered ? (
          <ChartTooltipSurface heading={hovered.name} wide>
            {hovered.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
          </ChartTooltipSurface>
        ) : null}
      </div>
    </div>
  );
}
