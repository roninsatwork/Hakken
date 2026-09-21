"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";
import { StatusPill } from "./StatusPill";
import type { StatusTone } from "./statusTone";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";

export type DecisionCertainty = "SURE" | "FAIRLY_SURE" | "NOT_SURE";

/**
 * The one marker for a Decision, wherever its result shows.
 *
 * A name and a certainty word: "Is this email from a customer? · Sure". Blue
 * for handled, amber for worth a look, always with the word — never a colour
 * carrying the meaning alone, and never a number. A run the simple rule
 * answered has no certainty and shows the neutral tone with "Rule".
 *
 * Click it and the spread opens: one short bar per answer, brand for the
 * chosen one, muted for the rest, each labelled. That is the whole of what
 * "why did it decide that" means for a Decision, so no screen draws its own.
 *
 * docs/plans/active/decisions-typesafe-plan.md, commitment 8.
 */
export function DecisionPill({
  name,
  certainty,
  probabilities,
  chosen,
  answerLabels,
  className,
}: {
  name: string;
  certainty: DecisionCertainty | null;
  /** Answer key → probability, when TypeSafe answered. */
  probabilities?: Record<string, number>;
  /** The answer key that was chosen, to mark its bar. */
  chosen?: string;
  /** Answer key → words, so bars read "Newsletter" rather than "newsletter". */
  answerLabels?: Record<string, string>;
  className?: string;
}) {
  const t = useTranslations("decisions");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const hasSpread = Boolean(probabilities && Object.keys(probabilities).length > 0);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const tone: StatusTone = certainty === null ? "neutral" : certainty === "NOT_SURE" ? "warning" : "info";
  const word = certainty === null ? t("pill.rule") : t(`certainty.${certainty}`);
  const label = `${name} · ${word}`;

  const pill = (
    <StatusPill tone={tone} className={cn("max-w-full", className)}>
      <span className="truncate">{label}</span>
    </StatusPill>
  );

  if (!hasSpread) return pill;

  const entries = Object.entries(probabilities ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <span ref={rootRef} className="relative inline-flex max-w-full">
      <Button
        variant="ghost"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={t("pill.showSpread", { name })}
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-auto max-w-full rounded-full p-0"
      >
        {pill}
      </Button>
      {isOpen && (
        <span
          role="dialog"
          aria-label={t("pill.spreadTitle", { name })}
          className={cn("absolute left-0 top-full mt-2 flex w-[260px] flex-col gap-2 rounded-[10px] border border-border-dim bg-card p-3 shadow-2xl", LAYER.PAGE_MENU)}
        >
          <span className="text-[11px] uppercase tracking-widest text-muted">{t("pill.spreadTitle", { name })}</span>
          {entries.map(([answer, probability]) => {
            const width = Math.max(2, Math.round(probability * 100));
            const isChosen = answer === chosen;
            return (
              <span key={answer} className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-[12px]">
                  <span className={cn("truncate", isChosen ? "font-semibold text-foreground" : "text-secondary")}>
                    {answerLabels?.[answer] ?? answer}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">{width}%</span>
                </span>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className={cn("block h-full rounded-full", isChosen ? "bg-brand" : "bg-muted/60")}
                    style={{ width: `${width}%` }}
                  />
                </span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
