"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

export type LevelStep = {
  /** The step's small heading, numbered: "1 · Platform". */
  name: string;
  /** Where it is set: "This page", or a link to the page that sets it. */
  where: ReactNode;
  /** One short line on what this level does. */
  text: string;
  /** The page the strip is on. */
  current?: boolean;
};

/**
 * The levels a setting is read through, left to right, with the page's own lit,
 * and one line under them. Shared since 2026-11-21 (features-switches-plan):
 * Limits reads platform → company → website (`LimitLevelsStrip`), and Features
 * reads platform → company. Any setting made for everyone first, then for each
 * company, can head its page with it. Two or three steps.
 */
export function LevelsStrip({ steps, note }: { steps: readonly LevelStep[]; note: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[16px] border border-border-dim bg-card/30 p-5">
      <ol className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
        {steps.map((step, index) => (
          <li key={step.name} className="contents">
            {index > 0 ? <ArrowRight className="hidden h-[18px] w-[18px] shrink-0 text-muted sm:block" aria-hidden="true" /> : null}
            <div
              aria-current={step.current ? "step" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1 rounded-[12px] border px-4 py-3.5",
                step.current ? "border-foreground/25 bg-foreground/5" : "border-border-dim bg-black/20",
              )}
            >
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">{step.name}</span>
              <span className="text-[14px] font-semibold text-foreground">{step.where}</span>
              <span className="text-[12px] leading-relaxed text-secondary">{step.text}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[12px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}
