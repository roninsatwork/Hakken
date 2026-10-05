"use client";

import { cn } from "@/src/ui/lib/utils";

/**
 * A share drawn as a thin bar: how much of the whole a row is, beside its
 * number — never instead of it (the number carries the meaning). One part
 * where Sites, Search Console and the websites admin drew six (2026-10-03
 * clean-up). `colour` is a chart palette colour (`chartPalette.ts`), the one
 * sanctioned source of chart colours; the track is the theme's own.
 */
export function Meter({ value, then, colour, size = "sm", className }: {
  /** 0 to 1. */
  value: number | null;
  /**
   * A second, lighter band after the first, 0 to 1: work under way but not yet
   * done — a collection's requests sent and waiting for their answers, beside
   * those back (Collection pipeline, docs/plans/active/collection-progress-plan.md).
   */
  then?: number | null;
  colour?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const share = value === null ? 0 : Math.min(1, Math.max(0, value));
  const after = then === undefined || then === null ? 0 : Math.min(1 - share, Math.max(0, then));
  const fill = { className: cn("block h-full", colour ? "" : "bg-brand"), style: colour ? { background: colour } : {} };
  return (
    <span aria-hidden="true" className={cn("flex overflow-hidden rounded-full bg-hover", size === "sm" ? "h-1.5 w-40" : "h-2.5 w-full", className)}>
      {value !== null ? <span className={fill.className} style={{ width: `${share * 100}%`, ...fill.style }} /> : null}
      {after > 0 ? <span className={cn(fill.className, "opacity-40")} style={{ width: `${after * 100}%`, ...fill.style }} /> : null}
    </span>
  );
}
