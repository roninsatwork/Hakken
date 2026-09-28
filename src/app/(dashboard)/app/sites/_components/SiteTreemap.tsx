"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_SERIES_BLUE } from "@/src/ui/components/charts/chartPalette";

/**
 * Parts of a whole as boxes sized by their share — Site structure's folders,
 * sized by visits, searches or pages (the design agreed with Anthony on
 * 2026-09-27, "B + A together"). One colour throughout, stronger where a box
 * does better by the page's own measure, so no box leans on red against
 * green. A box opens its own screen on a click; the table under the map
 * lists every box, the ones too small to name among them.
 */

export type SiteTreemapItem = {
  /** What a click opens: the box's own. Not `key`, which React would take for itself. */
  id: string;
  name: string;
  /** What sizes the box. */
  value: number;
  /** How dark it is drawn, from 0 to 1. */
  shade: number;
  /** Under the name, when the box is big enough: its figure and share. */
  caption: string;
  /** On hover: the box's figures. */
  readout: Array<{ value: string; label: string }>;
};

/** Too small a box for words: it is read on hover, and in the table. */
const LABEL_MIN_WIDTH = 70;
const LABEL_MIN_HEIGHT = 34;
/** Roughly how wide one character of a 12px name is — enough to cut it short, not to typeset it. */
const CHAR_WIDTH = 7;

/** From faint to strong, so the palest box still reads against the card. */
const SHADE_FLOOR = 0.22;
const SHADE_SPAN = 0.68;

type Node = SiteTreemapItem & { x: number; y: number; width: number; height: number; depth: number };

function cut(name: string, width: number): string {
  const room = Math.max(3, Math.floor((width - 16) / CHAR_WIDTH));
  return name.length > room ? `${name.slice(0, room)}…` : name;
}

function Box(props: Partial<Node>) {
  const { x = 0, y = 0, width = 0, height = 0, depth, name = "", caption = "", shade = 0 } = props;
  // The whole map is a box of its own, underneath the rest: only the parts are drawn.
  if (depth !== 1) return null;
  const labelled = width > LABEL_MIN_WIDTH && height > LABEL_MIN_HEIGHT;
  return (
    <g className="cursor-pointer">
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={6}
        fill={CHART_SERIES_BLUE}
        fillOpacity={SHADE_FLOOR + SHADE_SPAN * Math.min(1, Math.max(0, shade))}
      />
      {labelled ? (
        <g className="text-foreground" pointerEvents="none">
          <text x={x + 10} y={y + 20} fontSize={12} fill="currentColor">{cut(name, width)}</text>
          <text x={x + 10} y={y + 36} fontSize={11} fill="currentColor" fillOpacity={0.8}>{cut(caption, width)}</text>
        </g>
      ) : null}
    </g>
  );
}

function BoxReadout({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Partial<SiteTreemapItem> }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item?.readout) return null;
  return (
    <ChartTooltipSurface heading={item.name}>
      {item.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
    </ChartTooltipSurface>
  );
}

export function SiteTreemap({ items, onOpen, height = 320 }: {
  items: SiteTreemapItem[];
  /** A box clicked: open its screen. */
  onOpen: (id: string) => void;
  height?: number;
}) {
  // A box with nothing to size it by still gets a sliver, so every part can be found.
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const floor = total > 0 ? total / 5_000 : 1;
  const data = items.map((item) => ({ ...item, size: Math.max(item.value, floor) }));
  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        aspectRatio={4 / 3}
        isAnimationActive={false}
        content={<Box />}
        onClick={(node) => {
          if (typeof node.id === "string") onOpen(node.id);
        }}
      >
        <Tooltip content={<BoxReadout />} />
      </Treemap>
    </ResponsiveContainer>
  );
}
