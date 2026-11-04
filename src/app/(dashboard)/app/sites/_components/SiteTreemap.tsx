"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { ChartReveal, revealKey } from "@/src/ui/components/screens/ChartReveal";
import { CHART_SERIES_BLUE } from "@/src/ui/components/charts/chartPalette";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";

/**
 * Parts of a whole as boxes sized by their share — Site structure's folders,
 * sized by visits, searches or pages (the design agreed with Anthony on
 * 2026-09-27, "B + A together"). One colour throughout, stronger where a box
 * does better by the page's own measure, so no box leans on red against
 * green. A box opens its own screen on a click, where its page gives it one;
 * the table under the map lists every box, the ones too small to name among
 * them. The box under the mouse lights up with an outline and the rest step
 * back, and its figures follow the mouse (Anthony, 2026-11-04: "a bit more
 * interactive with rollover states"). `PageMap` is this map for a list of pages
 * that went up or down, each box with a colour of its own.
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
  /** Said instead, on a box too narrow for the whole caption: its move alone, without its views. */
  shortCaption?: string;
  /** The box's own colour; the map's blue without one. */
  colour?: string;
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
/** The box under the mouse, this much stronger; the others this share of their own strength. */
const LIT_LIFT = 0.12;
const DIMMED = 0.55;

type Node = SiteTreemapItem & { x: number; y: number; width: number; height: number; depth: number };

function cut(name: string, width: number): string {
  const room = Math.max(3, Math.floor((width - 16) / CHAR_WIDTH));
  return name.length > room ? `${name.slice(0, room)}…` : name;
}

/** How strong a box is drawn: by its shade, lit under the mouse, stepped back while another is. */
export function boxOpacity(shade: number, hovered: string | null | undefined, id: string | undefined): number {
  const own = SHADE_FLOOR + SHADE_SPAN * Math.min(1, Math.max(0, shade));
  if (!hovered) return own;
  return hovered === id ? Math.min(1, own + LIT_LIFT) : own * DIMMED;
}

/** The caption that fits a box: the whole of it, or its short form, or the whole of it cut. */
export function captionFor(caption: string, shortCaption: string | undefined, width: number): string {
  const room = Math.max(3, Math.floor((width - 16) / CHAR_WIDTH));
  return caption.length > room && shortCaption ? shortCaption : cut(caption, width);
}

function Box(props: Partial<Node> & { hovered?: string | null; onHover?: (id: string | null) => void; opens?: boolean }) {
  const { x = 0, y = 0, width = 0, height = 0, depth, id, name = "", caption = "", shortCaption, colour, shade = 0, hovered, onHover, opens = false } = props;
  // The whole map is a box of its own, underneath the rest: only the parts are drawn.
  if (depth !== 1) return null;
  const labelled = width > LABEL_MIN_WIDTH && height > LABEL_MIN_HEIGHT;
  return (
    <g className={opens ? "cursor-pointer" : undefined} onMouseEnter={() => onHover?.(id ?? null)} onMouseLeave={() => onHover?.(null)}>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={6}
        fill={colour ?? CHART_SERIES_BLUE}
        fillOpacity={boxOpacity(shade, hovered, id)}
        className="text-foreground"
        stroke="currentColor"
        strokeOpacity={hovered && hovered === id ? 0.9 : 0}
        strokeWidth={1.5}
        style={{ transition: "fill-opacity 120ms ease-out, stroke-opacity 120ms ease-out" }}
      />
      {labelled ? (
        <g className="text-foreground" pointerEvents="none">
          <text x={x + 10} y={y + 20} fontSize={12} fill="currentColor">{cut(name, width)}</text>
          <text x={x + 10} y={y + 36} fontSize={11} fill="currentColor" fillOpacity={0.8}>{captionFor(caption, shortCaption, width)}</text>
        </g>
      ) : null}
    </g>
  );
}

/** How far the hover sits from the mouse, and how much room it wants before it turns back on itself. */
const READOUT_GAP = 14;
const READOUT_ROOM = { width: 270, height: 170 };

/** The hovered box's figures, beside the mouse and turned back at the map's edges. Keeps the mouse to itself, so the map isn't drawn again each time it moves. */
function BoxReadout({ item, map }: { item: SiteTreemapItem | undefined; map: RefObject<HTMLDivElement | null> }) {
  const [mouse, setMouse] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const element = map.current;
    if (!element) return;
    const moved = (event: MouseEvent) => {
      const box = element.getBoundingClientRect();
      setMouse({ x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height });
    };
    element.addEventListener("mousemove", moved);
    return () => element.removeEventListener("mousemove", moved);
  }, [map]);
  if (!item?.readout || !mouse) return null;
  const left = mouse.x + READOUT_GAP + READOUT_ROOM.width > mouse.width;
  const above = mouse.y + READOUT_GAP + READOUT_ROOM.height > mouse.height;
  return (
    <div
      className={cn("pointer-events-none absolute", LAYER.RAISED)}
      style={{
        left: mouse.x + (left ? -READOUT_GAP : READOUT_GAP),
        top: mouse.y + (above ? -READOUT_GAP : READOUT_GAP),
        transform: `translate(${left ? "-100%" : "0"}, ${above ? "-100%" : "0"})`,
      }}
    >
      <ChartTooltipSurface heading={item.name}>
        {item.readout.map((line) => <ChartTooltipRow key={line.label} value={line.value} label={line.label} />)}
      </ChartTooltipSurface>
    </div>
  );
}

export function SiteTreemap({ items, onOpen, height = 320 }: {
  items: SiteTreemapItem[];
  /** A box clicked: open its screen. Left out, a box is read on hover and shows no pointer, as a click does nothing. */
  onOpen?: (id: string) => void;
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const map = useRef<HTMLDivElement>(null);
  // A box with nothing to size it by still gets a sliver, so every part can be found.
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const floor = total > 0 ? total / 5_000 : 1;
  const data = items.map((item) => ({ ...item, size: Math.max(item.value, floor) }));
  return (
    <div ref={map} className="relative" onMouseLeave={() => setHovered(null)}>
      {/* The boxes run along nothing, so they fade in. */}
      <ChartReveal replay={revealKey(data, "name")} motion="fade">
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<Box hovered={hovered} onHover={setHovered} opens={Boolean(onOpen)} />}
            onClick={(node) => {
              if (typeof node.id === "string") onOpen?.(node.id);
            }}
          />
        </ResponsiveContainer>
      </ChartReveal>
      <BoxReadout item={items.find((item) => item.id === hovered)} map={map} />
    </div>
  );
}
