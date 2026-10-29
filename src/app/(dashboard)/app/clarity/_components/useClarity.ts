"use client";

import { useQuery } from "convex/react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ClarityPeriodArg } from "@/convex/clarity";
import type { MenuPeriod } from "@/convex/utils/calendarPeriods";
import { CALENDAR_PERIOD_KEY, useDateChoice } from "../../sites/_components/useCalendarPeriod";

/**
 * Microsoft Clarity's section (docs/plans/active/agents-and-clarity-plan.md,
 * Part 4, CS2): its pages — Overview, Pages, Recordings and Errors, then its
 * Connection — the website chosen, and the device and calendar period every
 * page reads (calendar-periods-plan.md, phase 3), kept in the address so they
 * travel with the menu.
 */

export const CLARITY_PAGES = [
  { id: "overview", segment: "" },
  { id: "pages", segment: "pages" },
  { id: "recordings", segment: "recordings" },
  { id: "errors", segment: "errors" },
  { id: "connection", segment: "connection" },
] as const;
export type ClarityPageId = (typeof CLARITY_PAGES)[number]["id"];

/** Clarity's own names for its devices, as its answers give them: "Every device" is none. */
export const CLARITY_DEVICES = ["PC", "Mobile", "Tablet"] as const;
export type ClarityDevice = (typeof CLARITY_DEVICES)[number];

export function useClaritySiteId(): Id<"companyWebsites"> {
  return useParams<{ siteId: string }>().siteId as Id<"companyWebsites">;
}

export function useClarityStatus() {
  const siteId = useClaritySiteId();
  return useQuery(api.clarity.clarityStatus, { siteId });
}

/** What the screens say their dates are: the menu's period, or `custom` (sees-header-and-rolling-dates-plan.md, part two). */
export type ClarityChosen = MenuPeriod | "custom";

/** The Dates menu's choice: Last month unless the address says another, or custom dates within Clarity's newest day. */
export function useClarityPeriod(): ClarityPeriodArg {
  const status = useClarityStatus();
  const [choice] = useDateChoice(status?.connection?.newestDay ?? null);
  return choice.period === "custom" ? { from: choice.from, to: choice.to } : choice.period;
}

/** The choice as the screens word it. */
export function useClarityChosen(): ClarityChosen {
  const period = useClarityPeriod();
  return typeof period === "string" ? period : "custom";
}

/** The device chosen, or none for every device. */
export function useClarityDevice(): ClarityDevice | undefined {
  const asked = useSearchParams().get("device");
  return (CLARITY_DEVICES as readonly string[]).includes(asked ?? "") ? (asked as ClarityDevice) : undefined;
}

/** What every figure on the section's pages is read for: the website, the period and the device. */
export function useClarityArgs() {
  const siteId = useClaritySiteId();
  const period = useClarityPeriod();
  const device = useClarityDevice();
  return { siteId, period, ...(device ? { device } : {}) };
}

/** The address's own period and device, to carry onto a link within the section. */
export function useClarityQuery(): string {
  const params = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of [CALENDAR_PERIOD_KEY, "from", "to", "device"]) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}

/** A page's own screen (CS5): its path in the address, with the period and device kept. */
export function useClarityPageHref(): (page: string) => string {
  const siteId = useClaritySiteId();
  const params = useSearchParams();
  return (page) => {
    const next = new URLSearchParams();
    for (const key of [CALENDAR_PERIOD_KEY, "from", "to", "device"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    next.set("path", page);
    return `/app/clarity/${siteId}/pages/page?${next.toString()}`;
  };
}

export function clarityPageForPath(pathname: string, siteId: string): ClarityPageId {
  const rest = pathname.replace(`/app/clarity/${siteId}`, "").replace(/^\/|\/$/g, "");
  // A page's own screen sits under Pages, and lights Pages in the menu.
  const first = rest.split("/")[0] ?? "";
  return CLARITY_PAGES.find((page) => page.segment === first)?.id ?? "overview";
}

export function useClarityPath(): string {
  return usePathname();
}
