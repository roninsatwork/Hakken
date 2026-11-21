"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";

/**
 * How far a piece of background work has got, as a row of segments with words
 * above it: the step it's on on the left, and what it has done so far on the
 * right. Brought over from Sonae on 2026-11-21 for the wiki's check-up
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S8), as a shared part on Anthony's
 * word, so any run that moves in steps can show it.
 *
 * Segments rather than a smooth bar, because the work moves in whole steps and
 * a smooth bar invents progress between them. The step under way is drawn
 * lighter, and pulses for anyone who hasn't asked for less motion, so step 1
 * of 7 doesn't look stuck with nothing lit. Theme colours only: orange is kept
 * for the page's one action.
 */
export function StepProgress({ done, total, label, detail }: {
  /** Whole steps finished. Never drawn past `total`. */
  done: number;
  total: number;
  /** The step it's on, in words. Shown, and read out as the bar's name. */
  label: string;
  /** What it has done so far, on the right. */
  detail?: ReactNode;
}) {
  const segments = Math.max(total, 1);
  const finished = Math.min(Math.max(done, 0), segments);
  return (
    <div data-part="step-progress" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        {detail ? <span className="text-[13px] text-secondary">{detail}</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={segments}
        aria-valuenow={finished}
        className="flex gap-1"
      >
        {Array.from({ length: segments }, (_, index) => (
          <div
            key={index}
            data-segment={index < finished ? "done" : index === finished ? "now" : "to-do"}
            className={cn(
              "h-1 flex-1",
              index < finished
                ? "bg-foreground"
                : index === finished
                  ? "bg-foreground/40 motion-safe:animate-pulse"
                  : "bg-foreground/10",
            )}
          />
        ))}
      </div>
    </div>
  );
}
