"use client";

import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";

/**
 * Two or three views of one card or table, side by side: the Performance
 * card's Metrics · Competitors · Years, the Competitors card's Searches ·
 * Traffic, Wins and losses' directions. The kit's `SegmentedChoice` at its
 * compact size — as wide as its views wherever it sits, since a card's
 * controls stack stretches what it holds and a switch drawn full width reads
 * as a field. Drawn by hand here until the 2026-10-03 clean-up.
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
  return <SegmentedChoice size="compact" label={label} options={options} value={value} onChange={onChange} />;
}
