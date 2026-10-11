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
  { id: "summary", segment: "summary", group: "overview", built: false },
  { id: "week", segment: "this-week", group: "overview", built: false },
  { id: "month", segment: "your-month", group: "overview", built: false },
  { id: "strategy", segment: "strategy", group: "overview", built: false },
  { id: "reports", segment: "reports", group: "overview", built: false },
  { id: "findings", segment: "findings", group: "findings", built: false },
  { id: "track", segment: "track-record", group: "findings", built: false },
  { id: "leagues", segment: "leaderboards", group: "leaderboards", built: true },
  ...LEAGUE_IDS.map((league) => ({ id: league, segment: `leaderboards/${league}`, group: "leaderboards" as const, built: true })),
  { id: "opportunities", segment: "opportunities", group: "growth", built: false },
  { id: "pagePlan", segment: "page-plan", group: "growth", built: false },
  { id: "funnel", segment: "funnel", group: "growth", built: false },
  { id: "pageReviews", segment: "page-reviews", group: "growth", built: false },
  { id: "experiments", segment: "experiments", group: "growth", built: false },
  { id: "measurement", segment: "measurement", group: "growth", built: false },
  { id: "sources", segment: "sources", group: "setup", built: false },
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

/** A link to an Insights page, carrying the website chosen. */
export function useInsightsHref(): (segment: string) => string {
  const params = useSearchParams();
  const site = params.get("site");
  return (segment) => `/app/insights/${segment}${site ? `?site=${site}` : ""}`;
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
