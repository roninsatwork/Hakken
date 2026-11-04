"use client";

import { SiteTreemap, type SiteTreemapItem } from "@/src/app/(dashboard)/app/sites/_components/SiteTreemap";
import { formatNumber } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";

/**
 * A map of pages that went up or down (Anthony, 2026-11-04, on All pages: "this control is lovely", "please make this a
 * new standard component", "remember the rollover states and hover states"): each box a page, the bigger the more it had.
 * Orange went up and grey went down, deeper for a bigger move, and the arrow says it too, as he can't tell red from green.
 * Built on the kit's `SiteTreemap`, so it has its rollover (the box lit with an outline, the rest stepping back) and its
 * figures following the mouse. Put the card round it, with `ExplorerToolbar` for its menus.
 */
export type PageMapBox = {
  /** What pressing it opens. */
  id: string;
  name: string;
  /** What sizes the box. */
  size: number;
  /** What its colour shows, now and in the dates before; with nothing before, no way to tell up from down. */
  now: number;
  before: number | null;
  /** After the arrow, where the box has room: "9,665 views". */
  figure: string;
  /** On hover, in this order. */
  readout: Array<{ value: string; label: string }>;
};

/** The default height: tall enough to name the bigger boxes among forty. */
export const PAGE_MAP_HEIGHT = 460;

/** "▲ 492", "▼ 128", or null when it didn't move or there's nothing to set it against. */
export function arrowMove(now: number, before: number | null): string | null {
  if (before === null || now === before) return null;
  return `${now > before ? "▲" : "▼"} ${formatNumber(Math.abs(now - before))}`;
}

/**
 * How deep each move is drawn, from 0 to 1. Against the second biggest, so one huge mover doesn't wash out all the rest,
 * and by its square root, so a small move can still be seen.
 */
export function moveShade(move: number, moves: readonly number[]): number {
  const sizes = moves.map(Math.abs).sort((left, right) => right - left);
  const top = sizes[1] || sizes[0] || 0;
  return top > 0 ? Math.min(1, Math.sqrt(Math.abs(move) / top)) : 0;
}

export function PageMap({ boxes, onOpen, height = PAGE_MAP_HEIGHT }: {
  boxes: readonly PageMapBox[];
  /** A box pressed: open that page's own screen. */
  onOpen?: (id: string) => void;
  height?: number;
}) {
  const moves = boxes.map((box) => (box.before === null ? 0 : box.now - box.before));
  const items: SiteTreemapItem[] = boxes.map((box, at) => {
    const arrow = arrowMove(box.now, box.before);
    return {
      id: box.id,
      name: box.name,
      value: box.size,
      shade: moveShade(moves[at], moves),
      colour: moves[at] > 0 ? CHART_SERIES_ORANGE : CHART_SERIES_SLATE,
      caption: arrow ? `${arrow} · ${box.figure}` : box.figure,
      shortCaption: arrow ?? formatNumber(box.size),
      readout: box.readout,
    };
  });
  return <div data-part="page-map"><SiteTreemap items={items} onOpen={onOpen} height={height} /></div>;
}
