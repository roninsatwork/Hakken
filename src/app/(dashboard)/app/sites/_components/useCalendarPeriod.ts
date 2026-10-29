"use client";

import { createContext, useContext } from "react";
import { CALENDAR_PERIODS, OPENING_PERIOD, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { useSiteParam } from "./useSiteParam";

/**
 * The date menu every section shares (docs/plans/active/sees-header-and-rolling-dates-plan.md, part two; the kit's
 * `DatesMenu`): the seven periods, kept in the address as `?period=`, opening on Last month (calendar-periods-plan.md
 * rule 6) and left out of the address while it is. A value the menu does not offer — an old bookmark's "30" or
 * "lastQuarter" — reads as the opening period.
 */
export const CALENDAR_PERIOD_KEY = "period";

/**
 * The period a website's screens open on, set by its section's layout from the first day the section holds
 * (`openingPeriod`): This month for a website holding nothing of last month yet (agreed 2026-10-20), else Last
 * month. Every reader of the menu takes it from here, so the menu, the address and the figures agree.
 */
export const OpeningPeriodContext = createContext<MenuPeriod>(OPENING_PERIOD);

/** The period this website's screens open on. */
export function useOpeningPeriod(): MenuPeriod {
  return useContext(OpeningPeriodContext);
}

/** The period chosen, and its setter. A layout that sets the opening period reads its own menu with it (`opening`). */
export function useCalendarPeriod(opening?: MenuPeriod): [MenuPeriod, (next: MenuPeriod) => void] {
  const given = useOpeningPeriod();
  return useSiteParam<MenuPeriod>(CALENDAR_PERIOD_KEY, opening ?? given, CALENDAR_PERIODS);
}
