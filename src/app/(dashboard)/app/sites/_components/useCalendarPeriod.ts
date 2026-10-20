"use client";

import { useTranslations } from "next-intl";
import { CALENDAR_PERIODS, OPENING_PERIOD, type CalendarPeriod } from "@/convex/utils/calendarPeriods";
import { useSiteParam } from "./useSiteParam";

/**
 * The date menu every section shares (docs/plans/active/calendar-periods-plan.md): the seven calendar periods, kept
 * in the address as `?period=`, opening on Last month (rule 6) and left out of the address while it is. A value the
 * menu does not offer — an old bookmark's "30" — reads as Last month.
 */
export const CALENDAR_PERIOD_KEY = "period";

export function useCalendarPeriod(): [CalendarPeriod, (next: CalendarPeriod) => void] {
  return useSiteParam<CalendarPeriod>(CALENDAR_PERIOD_KEY, OPENING_PERIOD, CALENDAR_PERIODS);
}

/** The menu's choices with their words, in its order: the kit `Select` draws them. */
export function useCalendarPeriodChoices(): Array<{ value: CalendarPeriod; label: string }> {
  const t = useTranslations("common.periods");
  return CALENDAR_PERIODS.map((value) => ({ value, label: t(value) }));
}
