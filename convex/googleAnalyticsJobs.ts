import type { Doc } from "./_generated/dataModel";
import { shiftDay } from "./searchConsoleDays";
import { ANALYTICS_DAYS_KEPT as DAYS_KEPT } from "./utils/analyticsHistory";
import { VISITOR_LISTS, slotKey } from "./googleAnalyticsLists";
import { SERIES_PERIOD, type AnalyticsList, type AnalyticsPeriod, type AnalyticsWhich } from "./googleAnalyticsSchema";
import { CALENDAR_PERIODS, YEAR_BEFORE_PERIODS, isRunning, periodSpan, spanBefore, spanYearBefore, type CalendarPeriod } from "./utils/calendarPeriods";

/**
 * What a website's Google Analytics run asks, and for which dates — plain
 * workings from what is held, read by the run, its steps and the screens
 * (google-analytics-plan.md §4; moved out of `googleAnalyticsCollect.ts`,
 * which names them as before, to keep it under the module ceiling).
 */

/** The days fetched again each run while Google's figures settle (24 to 48 hours, §2.5): the newest and the two before. */
export const REFETCH_DAYS = 3;

/** The days a website's first collection fetched before 92 were kept (calendar-periods-plan.md). */
const FIRST_DAYS = 90;

/** The weekly periods are asked again once this old. */
const WEEK_MS = 6.5 * 24 * 60 * 60 * 1000;

/** A ready-made list's name, as every reader of the lists names it (`googleAnalyticsLists.ts`). */
export { slotKey };

/** The newest whole day in the property's own time zone (§2.5): yesterday there. */
export function newestWholeDayIn(now: number, timeZone: string): string {
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch {
    today = new Date(now).toISOString().slice(0, 10);
  }
  return shiftDay(today, -1);
}

/**
 * The days a run fetches: every day after the newest held, up to the newest
 * whole day, and the two before the first of them again while they settle —
 * so a day a run missed is caught by the next. With none held yet (or a first
 * collection that stopped part-way), the 92 days kept.
 */
export function analyticsWindow(newestDay: string | undefined, oldestDay: string | undefined, top: string): { from: string; top: string } {
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  // A website holding the 90 days it was first fetched counts as collected: the two more now kept fill in by themselves
  // as the days roll on, rather than every website fetching its days again the night they went from 90 to 92.
  const collected = shiftDay(top, -(FIRST_DAYS - 1));
  if (!newestDay || (oldestDay !== undefined && oldestDay > collected)) return { from: oldest, top };
  const firstNew = shiftDay(newestDay, 1) < top ? shiftDay(newestDay, 1) : top;
  const from = shiftDay(firstNew, -(REFETCH_DAYS - 1));
  return { from: from > oldest ? from : oldest, top };
}

/**
 * A ready-made list's dates (calendar-periods-plan.md, phase 6): the calendar period on the property's own day — its
 * newest whole day `top` is yesterday there — the span it is set against (`BEFORE`: the period before, or its same
 * days for one still going), or the same period a year before (`YEAR`). The 12 months a day (`SERIES_PERIOD`) end on
 * the newest day. Null while Google has sent none of the period: This week on a Monday, This month on the 1st.
 */
export function periodRange(period: AnalyticsPeriod, which: AnalyticsWhich, top: string): { from: string; to: string } | null {
  if (period === SERIES_PERIOD) {
    const to = which === "NOW" ? top : which === "BEFORE" ? shiftDay(top, -365) : shiftDay(top, -364);
    return { from: shiftDay(to, -364), to };
  }
  const span = periodSpan(period, shiftDay(top, 1), top);
  if (!span) return null;
  const range = which === "NOW" ? span : which === "BEFORE" ? spanBefore(period, span) : spanYearBefore(period, span);
  return range ? { from: range.from, to: range.to } : null;
}

/** The periods still going, asked every run (Anthony, 2026-10-14: "I want everything once a day"). */
const RUNNING: readonly CalendarPeriod[] = CALENDAR_PERIODS.filter(isRunning);
/** The finished periods: asked once they end, again once Google's figures settle, then kept. */
export const FINISHED: readonly CalendarPeriod[] = CALENDAR_PERIODS.filter((period) => !isRunning(period));
/** The spans each period is asked with: the quarters with a year before too; This Year's span before is already last year's. */
function whichOf(period: CalendarPeriod): readonly AnalyticsWhich[] {
  return YEAR_BEFORE_PERIODS.includes(period) && period !== "thisYear" ? ["NOW", "BEFORE", "YEAR"] : ["NOW", "BEFORE"];
}
/** Days Google's figures take to settle after a period ends (§2.5): it is asked again once this many have passed. */
const SETTLE_DAYS = 2;

/** A finished period's record on the connection: the main home country's bare, another's `lastMonth|fra`. */
export function fetchedKey(period: CalendarPeriod, country?: string): string {
  return country ? `${period}|${country}` : period;
}

/**
 * The finished periods a run asks (calendar-periods-plan.md, phase 6), each home country's, as `fetchedKey`s: one not
 * fetched since it ended, or fetched before Google's figures settled once they have. Worked out as the run's days
 * finish, and carried through its steps so every step asks the same lists.
 */
export function finishedDue(fetched: ReadonlyArray<{ key: string; from: string; settled: boolean }>, top: string, others: readonly string[] = []): string[] {
  const due: string[] = [];
  for (const country of [undefined, ...others]) {
    for (const period of FINISHED) {
      const range = periodRange(period, "NOW", top);
      if (!range) continue;
      const held = fetched.find((entry) => entry.key === fetchedKey(period, country));
      const settled = top >= shiftDay(range.to, SETTLE_DAYS);
      if (!held || held.from !== range.from || (!held.settled && settled)) due.push(fetchedKey(period, country));
    }
  }
  return due;
}

/** The finished periods' records once a whole run fetched those due: each marked settled when Google's figures were. */
export function fetchedAfter(fetched: ReadonlyArray<{ key: string; from: string; settled: boolean }>, due: readonly string[], top: string): Array<{ key: string; from: string; settled: boolean }> {
  const out = fetched.filter((entry) => !due.includes(entry.key));
  for (const key of due) {
    const period = key.split("|")[0] as CalendarPeriod;
    const range = periodRange(period, "NOW", top);
    if (range) out.push({ key, from: range.from, settled: top >= shiftDay(range.to, SETTLE_DAYS) });
  }
  return out;
}

/** A ready-made list to ask: for the main home country, or — `country`, its code — for another home country (§18.6.1). */
export type PeriodJob = { list: AnalyticsList; period: AnalyticsPeriod; which: AnalyticsWhich; country?: string };

/**
 * All pages before landing pages: a landing page finds its address, slash and
 * all, already numbered (`numberPages`). Every event beside them (§18.6.5),
 * the campaigns and the words their links carry, and Visitors' lists (§18.6.6).
 */
const PAGE_LISTS: readonly AnalyticsList[] = [
  "total", "channel", "page", "landing", "event", "campaign", "adKeyword", ...VISITOR_LISTS,
  // Insights' two (insights-analyst-plan.md I35, §8): the channel that first brought each person, and each landing page by channel.
  "firstChannel", "landingChannel",
  // AI assistants' landing pages, whichever channel Google filed them under (ga-channel-pages-plan.md CH13).
  "landingAssistant",
];

/** A shop's own list (§18.6.6): each product, with the span before. */
const SHOP_LISTS: readonly AnalyticsList[] = ["product"];

/**
 * The ready-made lists a run asks for (calendar-periods-plan.md, phase 6): each period still going, with its span
 * before and, for This Quarter, a year before — This Week and This Month every run, This Quarter and This Year with
 * the weekly lists (every run since 2026-10-14); and each finished period due (`finishedDue`). A period Google has
 * sent none of yet is not asked. Every chart reads what is kept a day, a week and a month (ga-stored-figures-plan.md
 * SF12), each home country's; the main one's 12 months a day stays a list of its own, every device, for Insights'
 * months and profile changes.
 */
export function dueJobs(
  connection: Pick<Doc<"googleAnalyticsConnections">, "weeklyPeriodsAt" | "shop">,
  now: number,
  others: readonly string[] = [],
  top?: string,
  finished: readonly string[] = [],
): PeriodJob[] {
  const jobs: PeriodJob[] = [];
  const weekly = connection.weeklyPeriodsAt === undefined || now - connection.weeklyPeriodsAt >= WEEK_MS;
  // A shop's products beside the rest (§18.6.6): never asked of a website that sells nothing.
  const lists = connection.shop ? [...PAGE_LISTS, ...SHOP_LISTS] : PAGE_LISTS;
  for (const country of [undefined, ...others]) {
    const of = country ? { country } : {};
    const periods = [
      ...RUNNING.filter((period) => weekly || period === "thisWeek" || period === "thisMonth"),
      ...FINISHED.filter((period) => finished.includes(fetchedKey(period, country))),
    ];
    for (const period of periods) {
      // Google has sent none of it yet: nothing to ask.
      if (top !== undefined && !periodRange(period, "NOW", top)) continue;
      for (const which of whichOf(period)) {
        if (top !== undefined && !periodRange(period, which, top)) continue;
        for (const list of lists) jobs.push({ list, period, which, ...of });
      }
    }
    if (weekly && !country) jobs.push({ list: "series", period: SERIES_PERIOD, which: "NOW" });
  }
  return jobs;
}
