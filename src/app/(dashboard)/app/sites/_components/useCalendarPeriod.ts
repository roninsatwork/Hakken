"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { CALENDAR_PERIODS, OPENING_PERIOD, type CalendarPeriod } from "@/convex/utils/calendarPeriods";
import { useSiteParam } from "./useSiteParam";

/**
 * The date menu every section shares (docs/plans/active/calendar-periods-plan.md): the seven calendar periods, kept
 * in the address as `?period=`, opening on Last month (rule 6) and left out of the address while it is. A value the
 * menu does not offer — an old bookmark's "30" — reads as the opening period.
 */
export const CALENDAR_PERIOD_KEY = "period";

/**
 * The period a website's screens open on, set by its section's layout from the first day the section holds
 * (`openingPeriod`): This month for a website holding nothing of last month yet (agreed 2026-10-20), else Last
 * month. Every reader of the menu takes it from here, so the menu, the address and the figures agree.
 */
export const OpeningPeriodContext = createContext<CalendarPeriod>(OPENING_PERIOD);

/** The period this website's screens open on. */
export function useOpeningPeriod(): CalendarPeriod {
  return useContext(OpeningPeriodContext);
}

/** The period chosen, and its setter. A layout that sets the opening period reads its own menu with it (`opening`). */
export function useCalendarPeriod(opening?: CalendarPeriod): [CalendarPeriod, (next: CalendarPeriod) => void] {
  const given = useOpeningPeriod();
  return useSiteParam<CalendarPeriod>(CALENDAR_PERIOD_KEY, opening ?? given, CALENDAR_PERIODS);
}

/** The menu's choices with their words, in its order: the kit `Select` draws them. */
export function useCalendarPeriodChoices(): Array<{ value: CalendarPeriod; label: string }> {
  const t = useTranslations("common.periods");
  return CALENDAR_PERIODS.map((value) => ({ value, label: t(value) }));
}
