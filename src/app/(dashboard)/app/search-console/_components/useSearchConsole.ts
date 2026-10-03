"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GOOGLE_COUNTRIES } from "@/convex/utils/countryCodes";
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

/**
 * The country every page of a site shows, kept in the address beside the
 * dates (search-console-plan.md §16): Google's code (`gbr`), or nothing for
 * All countries — what every page opens on.
 */
export const COUNTRY_KEY = "country";
const ALL_COUNTRIES = "all";
const COUNTRY_CHOICES = [ALL_COUNTRIES, ...GOOGLE_COUNTRIES.filter((code) => code !== "zzz")] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

/** The menu's groups (search-console-plan.md §13.1): Google's own figures first, then what changed, what to do, and how it breaks down. */
export const SEARCH_CONSOLE_GROUPS = ["figures", "changes", "opportunities", "breakdowns", "settings"] as const;
export type SearchConsoleGroup = (typeof SEARCH_CONSOLE_GROUPS)[number];

/** The section's pages, in the order its menu lists them. */
export const SEARCH_CONSOLE_PAGES = [
  { id: "performance", segment: "", group: "figures" },
  { id: "keywords", segment: "keywords", group: "figures" },
  { id: "pages", segment: "pages", group: "figures" },
  { id: "places", segment: "countries-and-devices", group: "figures" },
  { id: "bands", segment: "position-bands", group: "changes" },
  { id: "newLost", segment: "new-and-lost", group: "changes" },
  { id: "moves", segment: "wins-and-losses", group: "changes" },
  { id: "updates", segment: "google-updates", group: "changes" },
  { id: "almost", segment: "almost-there", group: "opportunities" },
  { id: "lowCtr", segment: "shown-but-not-clicked", group: "opportunities" },
  { id: "demand", segment: "missed-demand", group: "opportunities" },
  { id: "competing", segment: "pages-competing", group: "opportunities" },
  { id: "types", segment: "types", group: "breakdowns" },
  { id: "brand", segment: "brand-and-non-brand", group: "breakdowns" },
  { id: "ctrCurve", segment: "click-rate-by-position", group: "breakdowns" },
  { id: "appearance", segment: "rich-results", group: "breakdowns" },
  { id: "estimates", segment: "real-against-estimated", group: "breakdowns" },
  { id: "connection", segment: "connection", group: "settings" },
] as const satisfies readonly { id: string; segment: string; group: SearchConsoleGroup }[];
export type SearchConsolePageId = (typeof SEARCH_CONSOLE_PAGES)[number]["id"];

/** The page a path under the site belongs to: a keyword's own screen belongs to Keywords, a page's to Pages. */
export function pageForPath(pathname: string, siteId: string): SearchConsolePageId {
  const rest = pathname.replace(`/app/search-console/${siteId}`, "").replace(/^\/|\/$/g, "");
  const segment = rest.split("/")[0] ?? "";
  return SEARCH_CONSOLE_PAGES.find((page) => page.segment === segment)?.id ?? "performance";
}

/** What travels between the section's pages: the dates, the kind of result and the country. */
export function searchConsoleQuery(params: URLSearchParams): string {
  const shared = new URLSearchParams();
  for (const key of [...SITE_SHARED_KEYS, RESULTS_KEY, COUNTRY_KEY]) {
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

/** The country chosen — Google's code — or null for All countries; and its setter (null back to All countries). */
export function useSearchConsoleCountry(): [string | null, (next: string | null) => void] {
  const [value, set] = useSiteParam<string>(COUNTRY_KEY, ALL_COUNTRIES, COUNTRY_CHOICES);
  return [value === ALL_COUNTRIES ? null : value, (next) => set(next ?? ALL_COUNTRIES)];
}

/** The country a read is asked for: Google's code, or left out for All countries, as every read takes it. */
export function countryArg(country: string | null): { country?: string } {
  return country ? { country } : {};
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

/** The ready-made periods' lengths in days (search-console-plan.md §14.3, item 4), as the server's `periodOf` reads them. */
const READY_MADE_DAYS: readonly number[] = [7, 30, 90, 365];

/**
 * Whether the dates chosen are a ready-made period — ending on Google's
 * newest day held, 7, 30 or 90 days or 12 months long — read from the server
 * a page at a time; any other dates are asked of Google. Worked out here from
 * the dates alone, so a search, an order or a filter never asks Google again.
 */
export function isReadyMade(range: { to: string; days: number }, newestDay: string | null | undefined): boolean {
  return Boolean(newestDay) && range.to === newestDay && READY_MADE_DAYS.includes(range.days);
}
