"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BingPeriodArg } from "@/convex/bingWebmasterSchema";
import { customSpans, stepOf, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import type { DateChoice } from "@/src/ui/components/screens/DatesMenu";
import { CALENDAR_PERIOD_KEY, useCalendarPeriod, useDateChoice } from "../../sites/_components/useCalendarPeriod";
import { useSiteParam } from "../../sites/_components/useSiteParam";

/**
 * The Bing Webmaster section's own address and reads
 * (docs/plans/active/bing-webmaster-plan.md §5): which website, which dates
 * and how the chart steps — kept in the address, so a page's choices travel
 * with its menu and survive Back.
 */

export type BingStatus = NonNullable<FunctionReturnType<typeof api.bingWebmasterConnect.bingStatus>>;

/** The menu's groups, as drawn: Bing's figures, then against Google, then the settings. */
export const BING_GROUPS = ["figures", "google", "settings"] as const;
export type BingGroup = (typeof BING_GROUPS)[number];

/** The section's pages, in the order its menu lists them. */
export const BING_PAGES = [
  { id: "performance", segment: "", group: "figures" },
  { id: "keywords", segment: "keywords", group: "figures" },
  { id: "pages", segment: "pages", group: "figures" },
  { id: "crawling", segment: "crawling", group: "figures" },
  { id: "versus", segment: "against-google", group: "google" },
  { id: "connection", segment: "connection", group: "settings" },
] as const satisfies readonly { id: string; segment: string; group: BingGroup }[];
export type BingPageId = (typeof BING_PAGES)[number]["id"];

/** The page a path under the website belongs to: a keyword's own screen keeps Keywords lit, a page's Pages. */
export function pageForPath(pathname: string, siteId: string): BingPageId {
  const rest = pathname.replace(`/app/bing-webmaster/${siteId}`, "").replace(/^\/|\/$/g, "");
  const under = BING_PAGES.filter((page) => page.segment && (rest === page.segment || rest.startsWith(`${page.segment}/`)));
  return under.sort((left, right) => right.segment.length - left.segment.length)[0]?.id ?? "performance";
}

/** The date menu's period in the address: the seven calendar periods every section shares (calendar-periods-plan.md, phase 5). */
export const PERIOD_KEY = CALENDAR_PERIOD_KEY;

/** How the clicks and impressions chart steps. */
export const STEPS = ["day", "week", "month"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_KEY = "step";

/** What travels between the section's pages: the dates and the step. */
export function bingQuery(params: URLSearchParams): string {
  const shared = new URLSearchParams();
  for (const key of [PERIOD_KEY, STEP_KEY]) {
    const value = params.get(key);
    if (value) shared.set(key, value);
  }
  const text = shared.toString();
  return text ? `?${text}` : "";
}

/** A page of the website's section, with the dates and step. */
export function useBingHref(siteId: string): (segment: string, extra?: Record<string, string>) => string {
  const params = useSearchParams();
  return (segment, extra) => {
    const query = new URLSearchParams(bingQuery(params).replace(/^\?/, ""));
    for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
    const text = query.toString();
    return `/app/bing-webmaster/${siteId}${segment ? `/${segment}` : ""}${text ? `?${text}` : ""}`;
  };
}

export function useBingSiteId(): Id<"companyWebsites"> {
  const params = useParams<{ siteId: string }>();
  return params.siteId as Id<"companyWebsites">;
}

/** The website's connection as its pages show it: the same subscription the layout reads. */
export function useBingStatus() {
  const siteId = useBingSiteId();
  return useQuery(api.bingWebmasterConnect.bingStatus, { siteId });
}

/** The calendar period chosen: the one the website opens on (rule 6) unless another is. */
export function usePeriod(opening?: MenuPeriod): [MenuPeriod, (next: MenuPeriod) => void] {
  return useCalendarPeriod(opening);
}

/** What the screens say their dates are: the menu's period, or `custom`. */
export type BingChosen = MenuPeriod | "custom";

/**
 * The Dates menu's whole choice (sees-header-and-rolling-dates-plan.md, part two): the period, or custom dates within
 * Bing's newest day — as the queries take it, and as the screens word it.
 */
export function useBingDates(opening?: MenuPeriod): { period: BingPeriodArg; chosen: BingChosen; choice: DateChoice; setChoice: (next: DateChoice) => void } {
  const status = useBingStatus();
  const [choice, setChoice] = useDateChoice(status?.connection?.newestDay ?? null, opening);
  const period: BingPeriodArg = choice.period === "custom" ? { from: choice.from, to: choice.to } : choice.period;
  return { period, chosen: choice.period, choice, setChoice };
}

/** The chart's step: the period's own (rule 8; custom dates' by their length) unless another was chosen. */
export function useStep(period: BingPeriodArg): [Step, (next: Step) => void] {
  return useSiteParam<Step>(STEP_KEY, typeof period === "string" ? stepOf(period) : customSpans(period.from, period.to).step, STEPS);
}

/** Whether the website has figures from Bing to show. */
export function hasFigures(status: BingStatus): boolean {
  return Boolean(status.connection?.newestDay) && status.connection?.status !== "CHOOSING" && !status.connection?.clearing;
}

/** Fewer impressions than this and a rate or position is greyed (BW14). */
export const FEW_IMPRESSIONS = 10;
