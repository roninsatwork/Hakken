import { v } from "convex/values";
import { shiftDay } from "./insightFacts";
import { monthStart, stepEnd, stepStart, weekStart, type ChartStep } from "./searchConsolePacks";

/**
 * The seven periods every date menu offers (docs/plans/active/calendar-periods-plan.md; Anthony, 2026-10-20: "This
 * week, Last Week, This Month, Last Month, This Quarter, Last Quarter, This Year"), and the one rule for their days,
 * what each is set against, and the step a chart draws them in. Pure, so the screens, the collectors and their tests
 * share it.
 *
 * - Weeks run Monday to Sunday; months, quarters and years are calendar ones; "today" is the UK's date (rule 1).
 * - A period runs from its first day to the newest day its source holds, never past its own end (rules 2 and 3).
 * - A whole period is set against the whole period before; one still going — or one its source hasn't sent all of
 *   yet — against the same dates of the period before, cut at its end (rule 4: "same days").
 */

export const CALENDAR_PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear"] as const;
export type CalendarPeriod = (typeof CALENDAR_PERIODS)[number];

export const calendarPeriodValidator = v.union(
  v.literal("thisWeek"),
  v.literal("lastWeek"),
  v.literal("thisMonth"),
  v.literal("lastMonth"),
  v.literal("thisQuarter"),
  v.literal("lastQuarter"),
  v.literal("thisYear"),
);

/** What a screen opens on (rule 6): whole, final and comparable — Insights' choice too. */
export const OPENING_PERIOD: CalendarPeriod = "lastMonth";

/** The periods set against the same period a year before as well (rule 5), in figures and tables. */
export const YEAR_BEFORE_PERIODS: readonly CalendarPeriod[] = ["thisQuarter", "lastQuarter", "thisYear"];

export function isCalendarPeriod(value: unknown): value is CalendarPeriod {
  return typeof value === "string" && (CALENDAR_PERIODS as readonly string[]).includes(value);
}

export type PeriodUnit = "week" | "month" | "quarter" | "year";

export function unitOf(period: CalendarPeriod): PeriodUnit {
  if (period === "thisWeek" || period === "lastWeek") return "week";
  if (period === "thisMonth" || period === "lastMonth") return "month";
  if (period === "thisQuarter" || period === "lastQuarter") return "quarter";
  return "year";
}

/** Whether the period is the one still going: This Week, This Month, This Quarter, This Year. */
export const isRunning = (period: CalendarPeriod) => period.startsWith("this");

/** The step a chart draws a period in (rule 8): days for weeks and months, weeks for quarters, months for the year. */
export function stepOf(period: CalendarPeriod): ChartStep {
  const unit = unitOf(period);
  return unit === "quarter" ? "week" : unit === "year" ? "month" : "day";
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

const MONTHS_IN: Record<Exclude<PeriodUnit, "week">, number> = { month: 1, quarter: 3, year: 12 };

/** A day moved back or forward by whole units: seven days a week, else months with the day kept or cut. */
function shiftUnits(day: string, unit: PeriodUnit, by: number): string {
  return unit === "week" ? shiftDay(day, 7 * by) : shiftMonths(day, MONTHS_IN[unit] * by);
}

/** The first day of the unit a day falls in. */
function unitStart(day: string, unit: PeriodUnit): string {
  if (unit === "week") return weekStart(day);
  if (unit === "month") return monthStart(day);
  if (unit === "year") return `${day.slice(0, 4)}-01-01`;
  const month = Number(day.slice(5, 7));
  return `${day.slice(0, 4)}-${String(month - ((month - 1) % 3)).padStart(2, "0")}-01`;
}

/** The whole unit starting on `start`: its first and last days. */
function wholeUnit(start: string, unit: PeriodUnit): { from: string; to: string } {
  return { from: start, to: shiftDay(shiftUnits(start, unit, 1), -1) };
}

/** The period's whole days on the UK day `today`, whatever its source holds. */
export function periodBounds(period: CalendarPeriod, today: string): { from: string; to: string } {
  const unit = unitOf(period);
  const current = unitStart(today, unit);
  return wholeUnit(isRunning(period) ? current : shiftUnits(current, unit, -1), unit);
}

/**
 * What a website's screens open on: Last month, unless the website holds nothing of it yet — its first day held
 * falls after last month ended — when it opens on This month until the 1st, so a new website never opens empty
 * (agreed 2026-10-20). With nothing held at all, Last month, which says so.
 */
export function openingPeriod(heldFrom: string | null | undefined, today: string): CalendarPeriod {
  if (heldFrom && heldFrom > periodBounds(OPENING_PERIOD, today).to) return "thisMonth";
  return OPENING_PERIOD;
}

/**
 * The days of a period, or of the span before one: inclusive `from` and `to`, and whether they are the whole period
 * (false for one still going, and for one whose last days its source hasn't sent yet).
 */
export type PeriodSpan = { from: string; to: string; whole: boolean };

/**
 * The days of the period a source holds: from its first day to the source's newest day, never past its end. Null when
 * the source holds none of it yet — This Week on a Monday, when Google's newest day is the Saturday before (rule 9).
 */
export function periodSpan(period: CalendarPeriod, today: string, newest: string): PeriodSpan | null {
  const bounds = periodBounds(period, today);
  const to = newest < bounds.to ? newest : bounds.to;
  if (to < bounds.from) return null;
  return { from: bounds.from, to, whole: to === bounds.to };
}

/**
 * The span `units` whole units before (1 the period before, a year as 12 months or 4 quarters): the whole one for a
 * whole period, the same dates of it — cut at its end — for one in part (This Month on 31 October: 1–30 September).
 */
function spanBack(span: PeriodSpan, unit: PeriodUnit, units: number): PeriodSpan {
  const from = shiftUnits(span.from, unit, -units);
  if (span.whole) return { ...wholeUnit(from, unit), whole: true };
  const end = wholeUnit(from, unit).to;
  const to = shiftUnits(span.to, unit, -units);
  return { from, to: to < end ? to : end, whole: false };
}

/** What a period is set against (rule 4): the period before, whole or the same dates. */
export function spanBefore(period: CalendarPeriod, span: PeriodSpan): PeriodSpan {
  return spanBack(span, unitOf(period), 1);
}

/**
 * The same period a year before (rule 5), for the quarters and This Year: a whole quarter against the whole quarter
 * a year before, one still going against its same dates. Null for weeks and months, which have none.
 */
export function spanYearBefore(period: CalendarPeriod, span: PeriodSpan): PeriodSpan | null {
  if (!YEAR_BEFORE_PERIODS.includes(period)) return null;
  const unit = unitOf(period);
  return spanBack(span, unit, unit === "quarter" ? 4 : 1);
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
 * A day's match in the period before (rule 4): seven days back for a week, the same day of the month a month,
 * quarter or year back — or that month's last — so a chart sets each day beside its own.
 */
export function sameDayBefore(period: CalendarPeriod, day: string): string {
  return shiftUnits(day, unitOf(period), -1);
}
