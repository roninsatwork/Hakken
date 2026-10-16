import { shiftDay } from "../searchConsoleDays";
import { monthStart, stepEnd, weekStart, type ChartStep } from "./searchConsolePacks";
import type { Volatility } from "./searchConsoleVolatility";

/**
 * Search Console's chart periods — each day, week and month the charts reach —
 * and the days a build reads them from, shared by the build that adds them up
 * from the days held whole (`searchConsolePeriods.chartFigures`) and the one
 * that adds them up a day at a time as it reads (`searchConsoleKeptSums.ts`;
 * search-console-streamed-lists-plan.md, SL1).
 */

const DAY_MS = 86_400_000;

/** Days from one to the other, both counted. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/**
 * Days of lines read for a build: the 60 kept, and a first collection's 90
 * until its settle clears the rest — from which its charts take their weeks.
 */
export const LINES_READ_DAYS = 90;

export type ChartGrain = "DAY" | "WEEK" | "MONTH";
const STEP_OF: Record<ChartGrain, ChartStep> = { DAY: "day", WEEK: "week", MONTH: "month" };

/** One day's, week's or month's figures for the charts: `week` is its first day, as the table names it. */
export type ChartPeriod = {
  grain: ChartGrain;
  week: string;
  days: number;
  top3: number;
  top10: number;
  top20: number;
  rest: number;
  brandClicks: number;
  otherClicks: number;
} & Partial<Volatility>;

/** A day's, week's or month's last day. */
export const lastDayOf = (grain: ChartGrain, start: string): string => stepEnd(start, STEP_OF[grain]);

/** The Monday the charts reach back to: as many weeks as they show (`consoleChartWeeks`), the newest among them. */
export const chartReach = (newest: string, chartWeeks: number) => weekStart(shiftDay(newest, -7 * (chartWeeks - 1)));

/**
 * The days, weeks and months the charts reach that the lines read cover:
 * each day of the 60 kept, and each week and month whose days held fall
 * inside the 90 read — whole on a first collection, which brings 90 days
 * and clears none until it is built. A week or month starting before the 60
 * days is written only by a first build: one was worked out while its days
 * were kept, and stays as it was (`writeWeeks`; keep-less-history-plan.md,
 * part 3). The week or month at either edge may hold only some of its days.
 */
export function chartPeriods(newest: string, oldest: string, chartWeeks: number, dayLine: string): Array<{ grain: ChartGrain; start: string }> {
  const reach = chartReach(newest, chartWeeks);
  const from = reach > oldest ? reach : oldest;
  const readFrom = shiftDay(newest, 1 - LINES_READ_DAYS);
  const held = (start: string) => (start > oldest ? start : oldest) >= readFrom;
  const periods: Array<{ grain: ChartGrain; start: string }> = [];
  for (let day = from > dayLine ? from : dayLine; day <= newest; day = shiftDay(day, 1)) periods.push({ grain: "DAY", start: day });
  for (let week = weekStart(from); week <= newest; week = shiftDay(week, 7)) if (held(week)) periods.push({ grain: "WEEK", start: week });
  for (let month = monthStart(from); month <= newest; month = monthStart(shiftDay(month, 31))) if (held(month)) periods.push({ grain: "MONTH", start: month });
  return periods;
}

/** Every day from one to the other, oldest first. */
export function daysFrom(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day);
  return days;
}
