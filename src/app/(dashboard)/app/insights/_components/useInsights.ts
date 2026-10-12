"use client";

import { useQuery } from "convex/react";
import { usePathname, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LEAGUE_IDS, type LeagueId } from "@/convex/utils/insightLeagues";

/**
 * The Insights section's pages and addresses (docs/plans/active/
 * insights-analyst-plan.md §4.1): its side menu's groups in the order the
 * drawings set — Overview, Findings, Leaderboards, Growth, Setup — each page
 * with its address under /app/insights. A page not built yet is listed greyed
 * until its phase lands (§12).
 */

export const INSIGHTS_GROUPS = ["overview", "findings", "leaderboards", "growth", "setup"] as const;
export type InsightsGroup = (typeof INSIGHTS_GROUPS)[number];

export type InsightsPage = { id: string; segment: string; group: InsightsGroup; built: boolean };

export const INSIGHTS_PAGES: readonly InsightsPage[] = [
  { id: "summary", segment: "summary", group: "overview", built: true },
  { id: "week", segment: "this-week", group: "overview", built: true },
  { id: "month", segment: "your-month", group: "overview", built: true },
  { id: "strategy", segment: "strategy", group: "overview", built: true },
  { id: "reports", segment: "reports", group: "overview", built: true },
  { id: "findings", segment: "findings", group: "findings", built: true },
  { id: "cannibalisation", segment: "cannibalisation", group: "findings", built: true },
  { id: "track", segment: "track-record", group: "findings", built: true },
  { id: "leagues", segment: "leaderboards", group: "leaderboards", built: true },
  ...LEAGUE_IDS.map((league) => ({ id: league, segment: `leaderboards/${league}`, group: "leaderboards" as const, built: true })),
  { id: "enquiries", segment: "enquiries", group: "growth", built: true },
  { id: "aiSearch", segment: "ai-search", group: "growth", built: true },
  { id: "opportunities", segment: "opportunities", group: "growth", built: true },
  { id: "pagePlan", segment: "page-plan", group: "growth", built: true },
  { id: "funnel", segment: "funnel", group: "growth", built: true },
  { id: "pageReviews", segment: "page-reviews", group: "growth", built: true },
  { id: "experiments", segment: "experiments", group: "growth", built: true },
  { id: "measurement", segment: "measurement", group: "growth", built: true },
  { id: "sources", segment: "sources", group: "setup", built: true },
];

/** The page a path is: the longest segment it starts with. */
export function pageForPath(pathname: string): string | null {
  const rest = pathname.replace(/^\/app\/insights\/?/, "");
  const found = [...INSIGHTS_PAGES].sort((a, b) => b.segment.length - a.segment.length).find((page) => rest === page.segment || rest.startsWith(`${page.segment}/`));
  return found?.id ?? null;
}

export function isLeague(id: string): id is LeagueId {
  return (LEAGUE_IDS as readonly string[]).includes(id);
}

/** The website chosen (`site` in the address), or none for every website. */
export function useInsightsSite(): Id<"companyWebsites"> | undefined {
  const params = useSearchParams();
  return (params.get("site") as Id<"companyWebsites"> | null) ?? undefined;
}

/** A link to an Insights page, carrying the website and the period chosen. */
export function useInsightsHref(): (segment: string) => string {
  const params = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of ["site", "period"]) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const rest = kept.toString();
  return (segment) => `/app/insights/${segment}${rest ? `?${rest}` : ""}`;
}

/**
 * The period chosen in the section's header (`period` in the address;
 * insights-intelligence-plan.md phase 1): a month `2026-09`, a quarter
 * `2026-Q3` or the last twelve months `12M`; none for the newest whole month.
 */
export function useInsightsPeriodChoice(): string | undefined {
  return useSearchParams().get("period") ?? undefined;
}

/** The period's figures, months and why, for the website chosen: the header and the pages read one subscription. */
export function useInsightsPeriodView() {
  const site = useInsightsSite();
  const period = useInsightsPeriodChoice();
  return useQuery(api.insightsPeriod.insightsPeriodView, { ...(site ? { siteId: site } : {}), ...(period ? { period } : {}) });
}

/** The section's frame, shared by the layout and the pages: one subscription. */
export function useInsightsHome() {
  return useQuery(api.insightsReads.insightsHome, {});
}

/** The leagues for the website chosen: the leaderboards and the menu's places read the same subscription. */
export function useInsightsLeagues() {
  const site = useInsightsSite();
  return useQuery(api.insightsReads.insightsLeagues, site ? { siteId: site } : {});
}

export function useInsightsPath(): string {
  return usePathname();
}
