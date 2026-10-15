import type { Doc } from "./_generated/dataModel";
import { shiftDay } from "./searchConsoleDays";
import { ANALYTICS_DAYS_KEPT as DAYS_KEPT } from "./utils/analyticsHistory";
import { VISITOR_LISTS, slotKey } from "./googleAnalyticsLists";
import type { AnalyticsList, AnalyticsPeriod, AnalyticsWhich } from "./googleAnalyticsSchema";

/**
 * What a website's Google Analytics run asks, and for which dates — plain
 * workings from what is held, read by the run, its steps and the screens
 * (google-analytics-plan.md §4; moved out of `googleAnalyticsCollect.ts`,
 * which names them as before, to keep it under the module ceiling).
 */

/** The days fetched again each run while Google's figures settle (24 to 48 hours, §2.5): the newest and the two before. */
export const REFETCH_DAYS = 3;

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
 * collection that stopped part-way), the 60 days kept.
 */
export function analyticsWindow(newestDay: string | undefined, oldestDay: string | undefined, top: string): { from: string; top: string } {
  const oldest = shiftDay(top, -(DAYS_KEPT - 1));
  if (!newestDay || (oldestDay !== undefined && oldestDay > oldest)) return { from: oldest, top };
  const firstNew = shiftDay(newestDay, 1) < top ? shiftDay(newestDay, 1) : top;
  const from = shiftDay(firstNew, -(REFETCH_DAYS - 1));
  return { from: from > oldest ? from : oldest, top };
}

/** A ready-made list's dates: the period ending on the newest day, the span before it, or the same span a year (52 weeks) before. */
export function periodRange(period: AnalyticsPeriod, which: AnalyticsWhich, top: string): { from: string; to: string } {
  const days = Number(period);
  const to = which === "NOW" ? top : which === "BEFORE" ? shiftDay(top, -days) : shiftDay(top, -364);
  return { from: shiftDay(to, -(days - 1)), to };
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
 * The ready-made lists a run asks for: the 7 and 30 days every run, and the
 * 90 days and 12 months once a week (§4.1). The same span a year before is
 * asked for the long periods (§10, Q2); for the short ones it waits for the
 * "Compare with" choice to be drawn (§4.1). Every chart reads what is kept a
 * day, a week and a month (ga-stored-figures-plan.md SF12), each home
 * country's; the main one's 12 months a day stays a list of its own, every
 * device, for Insights' months and profile changes.
 */
export function dueJobs(
  connection: Pick<Doc<"googleAnalyticsConnections">, "weeklyPeriodsAt" | "shop">,
  now: number,
  others: readonly string[] = [],
): PeriodJob[] {
  const jobs: PeriodJob[] = [];
  const weekly = connection.weeklyPeriodsAt === undefined || now - connection.weeklyPeriodsAt >= WEEK_MS;
  // A shop's products beside the rest (§18.6.6): never asked of a website that sells nothing.
  const lists = connection.shop ? [...PAGE_LISTS, ...SHOP_LISTS] : PAGE_LISTS;
  for (const country of [undefined, ...others]) {
    const of = country ? { country } : {};
    for (const period of ["7", "30"] as const) {
      for (const which of ["NOW", "BEFORE"] as const) for (const list of lists) jobs.push({ list, period, which, ...of });
    }
    if (weekly) {
      for (const period of ["90", "365"] as const) {
        for (const which of ["NOW", "BEFORE", "YEAR"] as const) for (const list of lists) jobs.push({ list, period, which, ...of });
      }
      if (!country) jobs.push({ list: "series", period: "365", which: "NOW" });
    }
  }
  return jobs;
}

