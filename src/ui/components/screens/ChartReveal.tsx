"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** What a chart draws its figures with — lines, bands, bars, dots, slices, boxes — never its axes, grid, legend or Google updates. */
const FIGURES = ["line", "area", "bar", "scatter", "pie", "treemap-depth-0"].map((kind) => `.recharts-${kind}`).join(", ");
/** Recharts 3 draws each kind of figure into a layer of its own. */
const KIND_LAYER = '[class*="recharts-zIndex-layer"]';

/**
 * How the figures come in: `wipe`, uncovered from the left, for lines, bands
 * and anything else along dates; `rise`, upright bars growing up from their
 * line; `along`, bars lying along growing out from the left; `fade`, for
 * slices, boxes and dots that run along nothing.
 */
export type RevealMotion = "wipe" | "rise" | "along" | "fade";

/** A layer grows from its own edge, not the chart's corner. */
const grow = (from: string, origin: string): Keyframe[] => [
  { transform: from, transformOrigin: origin, transformBox: "fill-box" },
  { transform: "none", transformOrigin: origin, transformBox: "fill-box" },
];

const MOTIONS: Record<RevealMotion, Keyframe[]> = {
  wipe: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
  // Each bar its own share of the way, so halfway reads as half of every bar — not a flat line cutting the tall ones.
  rise: grow("scaleY(0)", "50% 100%"),
  along: grow("scaleX(0)", "0% 50%"),
  fade: [{ opacity: 0 }, { opacity: 1 }],
};

/** About half a second, easing to a stop. */
const TIMING: KeyframeAnimationOptions = { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

/**
 * The layers to move: each kind's own, so a chart's lines wipe in as one and
 * a stack of bars rises as one block rather than each band in its own box.
 */
function layersOf(frame: HTMLElement): Element[] {
  const layers = new Set<Element>();
  for (const figure of frame.querySelectorAll(FIGURES)) {
    const layer = figure.parentElement;
    layers.add(layer?.matches(KIND_LAYER) ? layer : figure);
  }
  return [...layers];
}

/**
 * What a chart's rows show, for `replay`: new when their first, last or
 * number changes — new dates, another set of names — and the same when the
 * same rows come again.
 */
export function revealKey(rows: ReadonlyArray<Record<string, unknown>>, xKey = "label"): string {
  const name = (row: Record<string, unknown> | undefined) => String(row?.day ?? row?.[xKey] ?? "");
  return `${rows.length}:${name(rows[0])}:${name(rows[rows.length - 1])}`;
}

/**
 * A chart's entrance (Anthony, 2026-10-03: "the charts in the app are static
 * and load flat"): its figures come in when it first appears and again
 * whenever `replay` changes — new dates — but not when a tick box turns a
 * line on or off.
 *
 * The chart is drawn whole, as before, and the browser plays the entrance
 * over it. Recharts' own entrance animation stays off on every series: on
 * React 19 it wedged and left charts with axes and no bars
 * (GovernanceRunsChart.tsx, 2026-08-18). An entrance that cannot play leaves
 * the finished chart, never a blank one, and a computer set to reduce motion
 * gets the chart drawn at once.
 */
export function ChartReveal({ replay, motion = "wipe", children }: {
  /** What the chart shows — `revealKey` of its rows — so new figures play it again. */
  replay: string;
  motion?: RevealMotion;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = box.current;
    if (!frame || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const play = () => {
      const layers = layersOf(frame);
      if (layers.length === 0) return false;
      for (const layer of layers) layer.animate?.(MOTIONS[motion], TIMING);
      return true;
    };
    if (play()) return;
    // The chart measures its width before it draws, so its figures come a moment after the card.
    const watch = new MutationObserver(() => {
      if (play()) watch.disconnect();
    });
    watch.observe(frame, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [replay, motion]);

  return <div ref={box} className="w-full">{children}</div>;
}
