"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";

/** How far the hover sits from the mouse, and how much room it wants before it turns back on itself. */
const READOUT_GAP = 14;
const READOUT_ROOM = { width: 270, height: 170 };

/**
 * A chart's hover panel beside the mouse, turned back at the chart's edges (Anthony, 2026-11-04, on the map of pages; used
 * by `SiteTreemap` and `PageFlowChart`). It keeps the mouse to itself, so the chart isn't drawn again each time it moves.
 * Put `area` on a `relative` box round the chart.
 */
export function MouseReadout({ area, children }: { area: RefObject<HTMLElement | null>; children: ReactNode }) {
  const [mouse, setMouse] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const moved = (event: MouseEvent) => {
      const box = element.getBoundingClientRect();
      setMouse({ x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height });
    };
    element.addEventListener("mousemove", moved);
    return () => element.removeEventListener("mousemove", moved);
  }, [area]);
  if (!children || !mouse) return null;
  const left = mouse.x + READOUT_GAP + READOUT_ROOM.width > mouse.width;
  const above = mouse.y + READOUT_GAP + READOUT_ROOM.height > mouse.height;
  return (
    <div
      data-part="mouse-readout"
      className={cn("pointer-events-none absolute", LAYER.RAISED)}
      style={{
        left: mouse.x + (left ? -READOUT_GAP : READOUT_GAP),
        top: mouse.y + (above ? -READOUT_GAP : READOUT_GAP),
        transform: `translate(${left ? "-100%" : "0"}, ${above ? "-100%" : "0"})`,
      }}
    >
      {children}
    </div>
  );
}
