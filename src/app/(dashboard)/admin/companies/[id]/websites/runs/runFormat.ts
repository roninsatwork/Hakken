"use client";

import { useLocale } from "next-intl";

import { formatDate, formatDateTime, formatTime } from "@/src/lib/dates";

/** To the minute on a 24-hour clock: seconds and AM/PM only get in the way of a list of runs. */
const MINUTES = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;

/**
 * How the Collection runs screens write times and counts. Dates the way every
 * other admin screen writes them (`src/lib/dates.ts`, the reader's own
 * format: 24/09/2026), to the minute; counts in the reader's language.
 */
export function useRunFormat() {
  const numbers = new Intl.NumberFormat(useLocale());
  return {
    count: (value: number) => numbers.format(value),
    when: (at: number) => formatDateTime(at, { options: { day: "2-digit", month: "2-digit", year: "numeric", ...MINUTES } }),
    day: (at: number) => formatDate(at, { options: { weekday: "short", day: "2-digit", month: "2-digit" } }),
    clock: (at: number) => formatTime(at, { options: MINUTES }),
  };
}

/** A share of the spend in whole percent; a small share is "<1", never a misleading 0. */
export function sharePercent(costUsd: number, totalUsd: number): string {
  if (totalUsd <= 0 || costUsd <= 0) return "0";
  const percent = Math.round((costUsd / totalUsd) * 100);
  return percent === 0 ? "<1" : String(percent);
}
