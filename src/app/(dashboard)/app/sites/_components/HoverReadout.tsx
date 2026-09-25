"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { LAYER } from "@/src/ui/lib/layers";

/** How close to the right edge the pointer may come before the readout opens to its left. */
const FLIP_WITHIN = 260;

type Hover<Key> = { key: Key; x: number; y: number; flip: boolean };

/**
 * A hover readout for bars drawn by hand rather than by the chart library —
 * the Overview's pages by kind and its branded searches — following the
 * pointer as a chart's does, so every bar shows its numbers where the eye
 * already is (Anthony, 2026-09-25: "we need hover states on the graphs and
 * bars as you cant make out the numbers").
 *
 * Spread `bind(key)` on each bar, put them all inside `HoverArea`, and give it
 * the readout for a key — drawn on `ChartTooltipSurface`, the panel every
 * chart's hover uses.
 */
export function useHoverReadout<Key extends string>() {
  const [hover, setHover] = useState<Hover<Key> | null>(null);
  const bind = (key: Key) => ({
    onMouseMove: (event: MouseEvent<HTMLElement>) => {
      const area = event.currentTarget.closest("[data-hover-area]")?.getBoundingClientRect();
      if (!area) return;
      const x = event.clientX - area.left;
      setHover({ key, x, y: event.clientY - area.top, flip: x > area.width - FLIP_WITHIN });
    },
    onMouseLeave: () => setHover(null),
  });
  return { hover, bind };
}

export function HoverArea<Key extends string>({ hover, readout, children, className = "" }: {
  hover: Hover<Key> | null;
  readout: (key: Key) => ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-hover-area className={`relative ${className}`}>
      {children}
      {hover ? (
        <div
          className={`pointer-events-none absolute ${LAYER.RAISED}`}
          style={{
            left: hover.x,
            top: hover.y,
            transform: hover.flip ? "translate(calc(-100% - 14px), 14px)" : "translate(14px, 14px)",
          }}
        >
          {readout(hover.key)}
        </div>
      ) : null}
    </div>
  );
}
