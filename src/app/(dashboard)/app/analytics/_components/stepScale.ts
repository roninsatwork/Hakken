import type { Step } from "./useAnalytics";

/**
 * A chart point held coarser than its step (docs/plans/active/ga-stored-figures-plan.md
 * SF2b): past 90 days the channels are held by week, past a year by month, so
 * a daily chart over 12 months meets weeks, and a weekly one meets months.
 * Such a point is drawn as its average for the step — a week's daily
 * average, a month's weekly average — so it sits on the same scale as the
 * points beside it, never as a spike seven times as tall.
 */

const DAY_MS = 86_400_000;

/** The days from `first` to `last`, both counted. */
export function daysSpanned(first: string, last: string): number {
  return Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS) + 1;
}

/** `day` moved by a number of days: the span before laid over the dates chosen. */
export function shiftDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a bucket from `first` to `last` stands for more than the step it is drawn at. */
export function coarserThanStep(first: string, last: string, step: Step): boolean {
  if (step === "month") return false;
  return daysSpanned(first, last) > (step === "day" ? 1 : 7);
}

/** A bucket's figure as its step draws it: its average a day, or a week, where it stands for more. */
export function perStep(value: number, first: string, last: string, step: Step): number {
  if (!coarserThanStep(first, last, step)) return value;
  return (value * (step === "day" ? 1 : 7)) / daysSpanned(first, last);
}
