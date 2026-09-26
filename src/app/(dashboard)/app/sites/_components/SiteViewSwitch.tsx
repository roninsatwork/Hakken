"use client";

import { Button } from "@/src/ui/components/screens/Button";

/**
 * Two or three views of one card or table, side by side: the Performance
 * card's Metrics · Competitors · Years, the Competitors card's Searches ·
 * Traffic, Wins and losses' directions. The chosen view wears the brand tint;
 * the others stay quiet.
 *
 * One component because four screens had drawn the same switch by hand, and a
 * fifth was on its way (AGENTS.md: three copies are the signal to share).
 */
export function SiteViewSwitch<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the views are views of, for a screen reader. */
  label: string;
  options: ReadonlyArray<{ value: Value; label: string }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    // `w-fit`: as wide as its views wherever it sits — a card's controls stack
    // stretches what it holds, and a switch drawn full width reads as a field.
    <div role="tablist" aria-label={label} className="inline-flex w-fit overflow-hidden rounded-lg border border-border-dim">
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-none px-3 py-1.5 text-[12px] ${value === option.value ? "bg-brand/15 text-brand hover:bg-brand/15" : "text-secondary hover:text-foreground"}`}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
