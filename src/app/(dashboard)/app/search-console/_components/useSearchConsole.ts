"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSiteRange } from "../../sites/_components/SiteDateRange";
import { shiftDay } from "../../sites/_components/siteRange";
import { SITE_SHARED_KEYS, useSiteParam } from "../../sites/_components/useSiteParam";

/**
 * The Search Console section's own address and reads
 * (docs/plans/active/search-console-plan.md §5): which website, which kind of
 * result, which dates — the Sites date control and its address keys, so a
 * range chosen in one section reads the same in the other.
 */

/** The kind of result every page of a site shows, kept in the address and carried by its menu. */
export const RESULTS_KEY = "results";
export const RESULT_KINDS = ["web", "image", "video", "news", "discover", "googleNews"] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

/** The section's pages, in the order its menu lists them. */
export const SEARCH_CONSOLE_PAGES = [
  { id: "performance", segment: "" },
  { id: "searches", segment: "searches" },
  { id: "pages", segment: "pages" },
  { id: "places", segment: "countries-and-devices" },
  { id: "connection", segment: "connection" },
] as const;
export type SearchConsolePageId = (typeof SEARCH_CONSOLE_PAGES)[number]["id"];

/** The page a path under the site belongs to: a search's own screen belongs to Searches, a page's to Pages. */
export function pageForPath(pathname: string, siteId: string): SearchConsolePageId {
  const rest = pathname.replace(`/app/search-console/${siteId}`, "").replace(/^\/|\/$/g, "");
  const segment = rest.split("/")[0] ?? "";
  return SEARCH_CONSOLE_PAGES.find((page) => page.segment === segment)?.id ?? "performance";
}

/** What travels between the section's pages: the dates, and the kind of result. */
export function searchConsoleQuery(params: URLSearchParams): string {
  const shared = new URLSearchParams();
  for (const key of [...SITE_SHARED_KEYS, RESULTS_KEY]) {
    const value = params.get(key);
    if (value) shared.set(key, value);
  }
  const text = shared.toString();
  return text ? `?${text}` : "";
}

/** A page of the site's section, with the dates and kind of result. */
export function useSearchConsoleHref(siteId: string): (segment: string, extra?: Record<string, string>) => string {
  const params = useSearchParams();
  return (segment, extra) => {
    const query = new URLSearchParams(searchConsoleQuery(params).replace(/^\?/, ""));
    for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
    const text = query.toString();
    return `/app/search-console/${siteId}${segment ? `/${segment}` : ""}${text ? `?${text}` : ""}`;
  };
}

export function useSearchConsoleSiteId(): Id<"companyWebsites"> {
  const params = useParams<{ siteId: string }>();
  return params.siteId as Id<"companyWebsites">;
}

/** The site's connection as its pages show it: the same subscription the layout reads. */
export function useSearchConsoleStatus() {
  const siteId = useSearchConsoleSiteId();
  return useQuery(api.searchConsoleConnect.searchConsoleStatus, { siteId });
}

export function useResultKind(): [ResultKind, (next: ResultKind) => void] {
  return useSiteParam<ResultKind>(RESULTS_KEY, "web", RESULT_KINDS);
}

/**
 * The dates the pages read. A quick pick ("Last 30 days") ends on Google's
 * newest day rather than today, as Search Console's own reports do — its
 * figures run two or three days behind, and a range ending today would read
 * as a fall; dates chosen by hand are read as chosen.
 */
export function useSearchConsoleRange(newestDay: string | null | undefined): { from: string; to: string; days: number; step: "day" | "week" | "month"; chosen: boolean } {
  const range = useSiteRange();
  if (range.preset === "custom" || !newestDay) {
    const days = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
    return { from: range.from, to: range.to, days, step: range.step, chosen: range.preset === "custom" };
  }
  const days = Number(range.preset);
  return { from: shiftDay(newestDay, -(days - 1)), to: newestDay, days, step: range.step, chosen: false };
}
