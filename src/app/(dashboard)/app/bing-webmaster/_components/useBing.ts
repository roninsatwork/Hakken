"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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

/** The ready-made periods (§4.4): what the dates choice offers. */
export const PERIODS = ["7", "30", "90", "182", "365"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_KEY = "period";

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

/** The dates chosen: the last 90 days unless another is, as drawn. */
export function usePeriod(): [Period, (next: Period) => void] {
  return useSiteParam<Period>(PERIOD_KEY, "90", PERIODS);
}

export function useStep(): [Step, (next: Step) => void] {
  return useSiteParam<Step>(STEP_KEY, "week", STEPS);
}

/** Whether the website has figures from Bing to show. */
export function hasFigures(status: BingStatus): boolean {
  return Boolean(status.connection?.newestDay) && status.connection?.status !== "CHOOSING" && !status.connection?.clearing;
}

/** The days a period covers, for the reads that take days. */
export const DAYS_OF: Record<Period, number> = { "7": 7, "30": 30, "90": 90, "182": 182, "365": 365 };

/** Fewer impressions than this and a rate or position is greyed (BW14). */
export const FEW_IMPRESSIONS = 10;
