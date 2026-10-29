import { v } from "convex/values";
import { shiftDay } from "./insightFacts";
import { monthStart, stepEnd, stepStart, weekStart, type ChartStep } from "./searchConsolePacks";

/**
 * The periods every date menu offers (docs/plans/active/sees-header-and-rolling-dates-plan.md, part two; Anthony,
 * 2026-10-29: "I genuinely want to see the last 3 months … the last 6 months of data in a graph … the last year"),
 * the one rule for their days, what each is set against, and the step a chart draws them in. Pure, so the screens,
 * the collectors and their tests share it.
 *
 * - Weeks run Monday to Sunday; months are calendar ones; "today" is the UK's date (calendar-periods-plan.md, rule 1).
 * - A week or month runs from its first day to the newest day its source holds, never past its own end (rules 2 and 3).
 * - **A rolling period** — Last 3, 6 or 12 months — runs back from the newest day its source holds, the same number of
 *   whole months: with 28 October held, Last 3 months is 29 July to 28 October. It is always whole.
 * - A whole period is set against the whole period before; one still going — or one its source hasn't sent all of
 *   yet — against the same dates of the period before, cut at its end (rule 4: "same days").
 *
 * The quarters and This year left the menu on 2026-10-29 (Anthony: "what was built was the financial quarter. Which
 * is what I never asked for"); the rows prepared for them were deleted the same day on his word, and the names went
 * from the type and the validator with them.
 */

/** The menu's periods, in its order. */
export const CALENDAR_PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"] as const;
export type MenuPeriod = (typeof CALENDAR_PERIODS)[number];
/** The same list by its older name, which most of the code reads. */
export type CalendarPeriod = MenuPeriod;

export const calendarPeriodValidator = v.union(
  v.literal("thisWeek"),
  v.literal("lastWeek"),
  v.literal("thisMonth"),
  v.literal("lastMonth"),
  v.literal("last3Months"),
  v.literal("last6Months"),
  v.literal("last12Months"),
);

/** What a screen opens on (rule 6): whole, final and comparable — Insights' choice too. */
export const OPENING_PERIOD: MenuPeriod = "lastMonth";

/** The periods set against the same period a year before as well (rule 5, narrowed 2026-10-29): Last 12 months, whose year before is the 12 months before it. */
export const YEAR_BEFORE_PERIODS: readonly CalendarPeriod[] = ["last12Months"];

/** A value the menu offers today. */
export function isCalendarPeriod(value: unknown): value is MenuPeriod {
  return typeof value === "string" && (CALENDAR_PERIODS as readonly string[]).includes(value);
}

/** A rolling period: the last so many whole months, back from the newest day held. */
export const isRolling = (period: CalendarPeriod) => period.startsWith("last") && period.endsWith("Months");

/** How many months a rolling period reaches back: 3, 6 or 12; 0 for any other period, which callers rule out first (`unitOf`). */
export function monthsOf(period: CalendarPeriod): number {
  if (period === "last3Months") return 3;
  if (period === "last6Months") return 6;
  if (period === "last12Months") return 12;
  return 0;
}

export type PeriodUnit = "week" | "month" | "months";

export function unitOf(period: CalendarPeriod): PeriodUnit {
  if (period === "thisWeek" || period === "lastWeek") return "week";
  if (period === "thisMonth" || period === "lastMonth") return "month";
  return "months";
}

/**
 * Whether the period moves with the days: This Week, This Month and the rolling periods, which run to the newest
 * day held and so change every day (asked every run); a Last week or Last month is fixed once it ends.
 */
export const isRunning = (period: CalendarPeriod) => period.startsWith("this") || isRolling(period);

/** The step a chart draws a period in (rule 8): days for weeks and months, weeks for 3 and 6 months, months for 12 months. */
export function stepOf(period: CalendarPeriod): ChartStep {
  const unit = unitOf(period);
  if (unit === "months") return monthsOf(period) >= 12 ? "month" : "week";
  return "day";
}

/**
 * The step a span of so many days is drawn in, for custom dates by the same rule: up to six weeks by the day, up to
 * about seven months by the week, longer by the month.
 */
export function stepForDays(days: number): ChartStep {
  return days <= 45 ? "day" : days <= 215 ? "week" : "month";
}

const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** A moment's date in the UK, `YYYY-MM-DD` (rule 1: weeks and months turn at UK midnight). */
export function ukDay(at: number = Date.now()): string {
  return ukDate.format(at);
}

/** A day moved by whole months, its day of the month kept, or the month's last day where the month is shorter. */
export function shiftMonths(day: string, months: number): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 + months;
  const first = new Date(Date.UTC(year, month, 1));
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(Number(day.slice(8, 10)), length));
  return first.toISOString().slice(0, 10);
}

const MONTHS_IN: Record<Exclude<PeriodUnit, "week" | "months">, number> = { month: 1 };

/** A day moved back or forward by whole units: seven days a week, else months with the day kept or cut. */
function shiftUnits(day: string, unit: Exclude<PeriodUnit, "months">, by: number): string {
  return unit === "week" ? shiftDay(day, 7 * by) : shiftMonths(day, MONTHS_IN[unit] * by);
}

/** The first day of the unit a day falls in. */
function unitStart(day: string, unit: Exclude<PeriodUnit, "months">): string {
  return unit === "week" ? weekStart(day) : monthStart(day);
}

/** The whole unit starting on `start`: its first and last days. */
function wholeUnit(start: string, unit: Exclude<PeriodUnit, "months">): { from: string; to: string } {
  return { from: start, to: shiftDay(shiftUnits(start, unit, 1), -1) };
}

/** The so many whole months ending on `to`: from the day after the same day of the month so many months back. */
function rollingTo(to: string, months: number): { from: string; to: string } {
  return { from: shiftDay(shiftMonths(to, -months), 1), to };
}

/** The period's whole days on the UK day `today`, whatever its source holds; a rolling period's end on today itself. */
export function periodBounds(period: CalendarPeriod, today: string): { from: string; to: string } {
  const unit = unitOf(period);
  if (unit === "months") return rollingTo(today, monthsOf(period));
  const current = unitStart(today, unit);
  return wholeUnit(isRunning(period) ? current : shiftUnits(current, unit, -1), unit);
}

/**
 * What a website's screens open on: Last month, unless the website holds nothing of it yet — its first day held
 * falls after last month ended — when it opens on This month until the 1st, so a new website never opens empty
 * (agreed 2026-10-20). With nothing held at all, Last month, which says so.
 */
export function openingPeriod(heldFrom: string | null | undefined, today: string): MenuPeriod {
  if (heldFrom && heldFrom > periodBounds(OPENING_PERIOD, today).to) return "thisMonth";
  return OPENING_PERIOD;
}

/**
 * The days of a period, or of the span before one: inclusive `from` and `to`, and whether they are the whole period
 * (false for one still going, and for one whose last days its source hasn't sent yet; always true for a rolling one).
 */
export type PeriodSpan = { from: string; to: string; whole: boolean };

/**
 * The days of the period a source holds: from its first day to the source's newest day, never past its end. A
 * rolling period runs back from the newest day itself (or today, where the source is ahead of it). Null when the
 * source holds none of it yet — This Week on a Monday, when Google's newest day is the Saturday before (rule 9).
 */
export function periodSpan(period: CalendarPeriod, today: string, newest: string): PeriodSpan | null {
  if (isRolling(period)) return { ...rollingTo(newest < today ? newest : today, monthsOf(period)), whole: true };
  const bounds = periodBounds(period, today);
  const to = newest < bounds.to ? newest : bounds.to;
  if (to < bounds.from) return null;
  return { from: bounds.from, to, whole: to === bounds.to };
}

/**
 * The span `units` whole units before (1 the period before): the whole one for a whole period, the same dates of it
 * — cut at its end — for one in part (This Month on 31 October: 1–30 September).
 */
function spanBack(span: PeriodSpan, unit: Exclude<PeriodUnit, "months">, units: number): PeriodSpan {
  const from = shiftUnits(span.from, unit, -units);
  if (span.whole) return { ...wholeUnit(from, unit), whole: true };
  const end = wholeUnit(from, unit).to;
  const to = shiftUnits(span.to, unit, -units);
  return { from, to: to < end ? to : end, whole: false };
}

/** The same number of months straight before a rolling span: the 3 months before 29 July to 28 October are 29 April to 28 July. */
function rollingBefore(span: PeriodSpan, months: number): PeriodSpan {
  return { from: shiftMonths(span.from, -months), to: shiftDay(span.from, -1), whole: true };
}

/** What a period is set against (rule 4): the period before, whole or the same dates; a rolling period, the same months before. */
export function spanBefore(period: CalendarPeriod, span: PeriodSpan): PeriodSpan {
  const unit = unitOf(period);
  if (unit === "months") return rollingBefore(span, monthsOf(period));
  return spanBack(span, unit, 1);
}

/**
 * The same period a year before (rule 5): Last 12 months against the 12 months before it (the same as its span
 * before). Null for weeks, months, and 3 or 6 months, which have none.
 */
export function spanYearBefore(period: CalendarPeriod, span: PeriodSpan): PeriodSpan | null {
  return YEAR_BEFORE_PERIODS.includes(period) ? rollingBefore(span, 12) : null;
}

/** The days of custom dates, and the same number of days straight before them (part two, rule 4). */
export function customSpans(from: string, to: string): { span: PeriodSpan; before: PeriodSpan; step: ChartStep } {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return {
    span: { from, to, whole: true },
    before: { from: shiftDay(from, -days), to: shiftDay(from, -1), whole: true },
    step: stepForDays(days),
  };
}

/**
 * The steps a span is drawn in: each step's first day (`key`: the day, its week's Monday, or the 1st) and the span's
 * days within it, so a week or month the span cuts — the newest, still going — says it is a part of one.
 */
export function stepsOf(span: { from: string; to: string }, step: ChartStep): Array<{ key: string; from: string; to: string }> {
  const out: Array<{ key: string; from: string; to: string }> = [];
  for (let key = stepStart(span.from, step); key <= span.to; key = shiftDay(stepEnd(key, step), 1)) {
    const end = stepEnd(key, step);
    out.push({ key, from: key < span.from ? span.from : key, to: end > span.to ? span.to : end });
  }
  return out;
}

/**
 * A day's match in the period before (rule 4): seven days back for a week, the same day of the month a month back —
 * or that month's last — and so many months back for a rolling period, so a chart sets each day beside its own.
 */
export function sameDayBefore(period: CalendarPeriod, day: string): string {
  const unit = unitOf(period);
  if (unit === "months") return shiftMonths(day, -monthsOf(period));
  return shiftUnits(day, unit, -1);
}
