"use client";

import { useLocale, useTranslations } from "next-intl";
import { Select } from "@/src/ui/components/screens/Select";
import type { ConversionsCount, ConversionsMapWords } from "@/src/ui/components/screens/ConversionsMap";
import { periodWord, usePeriod } from "./useAnalytics";

/**
 * What every Conversions map on a screen shares (conversion-charts-plan.md,
 * 2026-10-29): the Count and Compare choices, the span before's name, and
 * the words a square says. Conversions' own map and a page's conversions by
 * channel both take them from here, so the two maps read the same.
 */

export const COUNTS = ["visits", "rate", "events"] as const;
export const COMPARES = ["none", "before"] as const;
export type Compare = (typeof COMPARES)[number];

/** The dropdowns a card wears: a label, its choices, and the words for each. */
export function Choice<T extends string>({ label, value, choices, word, onChange }: { label: string; value: T; choices: readonly T[]; word: (choice: T) => string; onChange: (next: T) => void }) {
  return (
    <Select chip={{ label, choice: word(value), changed: false }} value={value} onChange={(next) => onChange(next as T)} aria-label={label}>
      {choices.map((choice) => <option key={choice} value={choice}>{word(choice)}</option>)}
    </Select>
  );
}

/** The span before, named as the period's figures name it, at a sentence's start. */
export function useBeforeName(): string {
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const [period] = usePeriod();
  const before = tf(`before.${periodWord(period)}`);
  return before.charAt(0).toLocaleUpperCase(locale) + before.slice(1);
}

/** The words a Conversions map says, for the unit shown: a row's total, a square's hover and the key. */
export function useMapWords(count: ConversionsCount): ConversionsMapWords {
  const t = useTranslations("googleAnalytics.conversionsMap");
  const beforeName = useBeforeName();
  return {
    rowTotal: (row, total) => `${count === "rate" ? t("rowRate", { rate: `${(100 * total.rate).toFixed(1)}%` }) : count === "events" ? t("rowTimes", { count: total.times }) : t("rowVisits", { count: total.visits })}${row.counted ? "" : t("notCounted")}`,
    hover: (row, column, value, cell) => count === "rate"
      ? t("hoverRate", { event: row.name, kind: column.name, value, did: cell.visits, visits: column.visits })
      : t("hover", { event: row.name, kind: column.name, value }),
    hoverBefore: (before, change) => t("hoverBefore", { before: beforeName.toLowerCase(), value: before, change: change ?? "–" }),
    shades: count === "rate" ? t("shadesRate") : t("shadesCount"),
    empty: t("empty"),
  };
}
