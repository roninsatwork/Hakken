import { OPENING_PERIOD, customSpans, isCalendarPeriod, periodSpan, spanBefore, stepOf, ukDay, type MenuPeriod } from "@/convex/utils/calendarPeriods";

/**
 * The date menu's period and the step every Sites and Search Console page
 * shares, kept in the URL (`?period=…&step=…`) so a link, a refresh and the
 * side menu all keep them (docs/plans/active/user-sites-plan.md, "Where it
 * lives"; calendar-periods-plan.md: the seven calendar periods, no dates of
 * its own).
 */

export type SiteStep = "day" | "week" | "month";

/** A calendar period's days on a Sites page, and the step its charts are drawn in. */
export type SitePeriodRange = {
  /** The menu's period, or `custom` for a first and a last day of the reader's own (sees-header-and-rolling-dates-plan.md, part two, rule 4). */
  period: MenuPeriod | "custom";
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  to: string;
  step: SiteStep;
  /** Whether the period is over: false for one still going. */
  whole: boolean;
  /** What it is set against (rule 4): the period before, or its same days while this one is still going. */
  before: { from: string; to: string };
};

/**
 * The calendar period in the address, or the one the website opens on — Last
 * month (rule 6), This month while it holds nothing of last month — and its
 * days. A website's figures are filed the day it is checked, so a period still
 * going runs to today, in the UK (rule 1). The step is the period's own (rule
 * 8) unless one was chosen.
 */
export function parseSitePeriod(params: URLSearchParams, now: Date = new Date(), opening: MenuPeriod = OPENING_PERIOD): SitePeriodRange {
  const raw = params.get("period");
  const today = ukDay(now.getTime());
  const stepParam = params.get("step");
  // Custom dates: a first and a last day, within what is held (to today here), set against the same number of days before.
  const from = params.get("from");
  const to = params.get("to");
  if (raw === "custom" && isDay(from) && isDay(to) && from <= to && to <= today) {
    const custom = customSpans(from, to);
    return { period: "custom", from, to, step: isStep(stepParam) ? stepParam : custom.step, whole: true, before: { from: custom.before.from, to: custom.before.to } };
  }
  const period = isCalendarPeriod(raw) ? raw : opening;
  // Today falls in or after every period, so a period always has its days here.
  const span = periodSpan(period, today, today) ?? { from: today, to: today, whole: false };
  const before = spanBefore(period, span);
  return { period, from: span.from, to: span.to, step: isStep(stepParam) ? stepParam : stepOf(period), whole: span.whole, before: { from: before.from, to: before.to } };
}

export function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dayString(date);
}

/** A `YYYY-MM` month moved by whole months, across years. */
export function shiftMonth(month: string, by: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

const isDay = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The menu's period a screen reads when the address holds custom dates it cannot answer: the one the website opens on. */
export function periodOrOpening(range: Pick<SitePeriodRange, "period">, opening: MenuPeriod): MenuPeriod {
  return range.period === "custom" ? opening : range.period;
}

function isStep(value: string | null): value is SiteStep {
  return value === "day" || value === "week" || value === "month";
}
