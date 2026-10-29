"use client";

import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import { CALENDAR_PERIODS, OPENING_PERIOD, isCalendarPeriod, ukDay, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import type { DateChoice } from "@/src/ui/components/screens/DatesMenu";
import { useSetSiteParams, useSiteParam } from "./useSiteParam";

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

/**
 * The Dates menu's whole choice from the address — a period, or custom dates
 * (`period=custom&from=&to=`, within what the screen holds, `newest`) — and its
 * setter, for a screen that answers custom dates from its own days (the
 * Settings overview, Governance, Clarity). A layout that works the opening
 * period out itself passes it. A Sites or Search Console screen reads
 * `useSiteRange` instead, which parses the same keys.
 */
export function useDateChoice(newest: string | null = null, openingGiven?: MenuPeriod): [DateChoice, (next: DateChoice) => void] {
  const params = useSearchParams();
  const setParams = useSetSiteParams();
  const given = useOpeningPeriod();
  const opening = openingGiven ?? given;
  const raw = params.get(CALENDAR_PERIOD_KEY);
  const from = params.get("from");
  const to = params.get("to");
  const isDay = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const end = newest ?? ukDay();
  const choice: DateChoice = raw === "custom" && isDay(from) && isDay(to) && from <= to && to <= end
    ? { period: "custom", from, to }
    : { period: isCalendarPeriod(raw) ? raw : opening };
  const setChoice = (next: DateChoice) => {
    if (next.period === "custom") setParams({ [CALENDAR_PERIOD_KEY]: "custom", from: next.from, to: next.to });
    else setParams({ [CALENDAR_PERIOD_KEY]: next.period === opening ? null : next.period, from: null, to: null });
  };
  return [choice, setChoice];
}
