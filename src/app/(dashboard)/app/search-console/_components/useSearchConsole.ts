"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GOOGLE_COUNTRIES } from "@/convex/utils/countryCodes";
import { periodBounds, periodSpan, spanBefore, ukDay, type CalendarPeriod, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { useSiteRange } from "../../sites/_components/SiteDateRange";
import { SITE_SHARED_KEYS, useSiteParam } from "../../sites/_components/useSiteParam";
import { useTranslations } from "next-intl";

/**
 * The Search Console section's own address and reads
 * (docs/plans/active/search-console-plan.md §5): which website, which kind of
 * result, which dates — the Sites date control and its address keys, so a
 * range chosen in one section reads the same in the other.
 */

/** The kind of result every page of a site shows, kept in the address and carried by its menu. */
export const RESULTS_KEY = "results";
/** Image search is neither kept nor shown since 2026-10-06 (search-console-home-countries-plan.md). */
export const RESULT_KINDS = ["web", "video", "news", "discover", "googleNews"] as const;

/**
 * The country every page of a site shows, kept in the address beside the
 * dates: Google's code (`fra`) for a country kept ready beside the main one,
 * or nothing for the website's main home country — what every page opens on
 * (search-console-home-countries-plan.md).
 */
export const COUNTRY_KEY = "country";
const MAIN_COUNTRY = "main";
const COUNTRY_CHOICES = [MAIN_COUNTRY, ...GOOGLE_COUNTRIES.filter((code) => code !== "zzz")] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

/**
 * The menu's groups (search-console-plan.md §13.1): what the company tracks
 * first (Anthony, 2026-10-03), then Google's own figures, what changed, what
 * to do, and how it breaks down.
 */
export const SEARCH_CONSOLE_GROUPS = ["tracked", "figures", "changes", "opportunities", "breakdowns", "settings"] as const;
export type SearchConsoleGroup = (typeof SEARCH_CONSOLE_GROUPS)[number];

/** The section's pages, in the order its menu lists them. */
export const SEARCH_CONSOLE_PAGES = [
  { id: "trackedKeywords", segment: "tracked/keywords", group: "tracked" },
  { id: "trackedPages", segment: "tracked/pages", group: "tracked" },
  { id: "performance", segment: "", group: "figures" },
  { id: "keywords", segment: "keywords", group: "figures" },
  { id: "pages", segment: "pages", group: "figures" },
  { id: "indexing", segment: "indexing", group: "figures" },
  { id: "services", segment: "demand-by-service", group: "figures" },
  { id: "places", segment: "countries-and-devices", group: "figures" },
  { id: "bands", segment: "position-bands", group: "changes" },
  { id: "newLost", segment: "new-and-lost", group: "changes" },
  { id: "moves", segment: "wins-and-losses", group: "changes" },
  { id: "volatility", segment: "volatility", group: "changes" },
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

/**
 * The page a path under the site belongs to: the page whose address it is or
 * lies under — a keyword's own screen belongs to Keywords, a page's to Pages,
 * and `tracked/keywords` to Tracked keywords, never to Keywords.
 */
export function pageForPath(pathname: string, siteId: string): SearchConsolePageId {
  const rest = pathname.replace(`/app/search-console/${siteId}`, "").replace(/^\/|\/$/g, "");
  const under = SEARCH_CONSOLE_PAGES.filter((page) => page.segment && (rest === page.segment || rest.startsWith(`${page.segment}/`)));
  return under.sort((left, right) => right.segment.length - left.segment.length)[0]?.id ?? "performance";
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

/**
 * The country chosen — Google's code, for a country kept ready beside the
 * main one — or null for the website's main home country; and its setter
 * (null back to the main one). An address naming the main country, or one
 * not kept, reads as the main one: no other country is offered.
 */
export function useSearchConsoleCountry(): [string | null, (next: string | null) => void] {
  const siteId = useSearchConsoleSiteId();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const [value, set] = useSiteParam<string>(COUNTRY_KEY, MAIN_COUNTRY, COUNTRY_CHOICES);
  const kept = value !== MAIN_COUNTRY && (choices === undefined || choices.ready.includes(value));
  return [kept ? value : null, (next) => set(next ?? MAIN_COUNTRY)];
}

/** The country a read is asked for: Google's code, or left out for the main home country, as every read takes it. */
export function countryArg(country: string | null): { country?: string } {
  return country ? { country } : {};
}

export function useResultKind(): [ResultKind, (next: ResultKind) => void] {
  return useSiteParam<ResultKind>(RESULTS_KEY, "web", RESULT_KINDS);
}

/**
 * The dates the pages read: the date menu's calendar period, from its first
 * day to Google's newest — never past it, as Search Console's own reports
 * end — its figures run two or three days behind, and a period ending today
 * would read as a fall (calendar-periods-plan.md, phase 4). `waiting` while
 * Google has sent none of the period yet (rule 9): This week on a Monday.
 * `before` is what it is set against.
 */
export function useSearchConsoleRange(newestDay: string | null | undefined): {
  from: string;
  to: string;
  days: number;
  step: "day" | "week" | "month";
  /** The menu's period, or `custom` for a first and a last day: no ready-made list, so the lists ask Google live (`periodArg`). */
  period: MenuPeriod | "custom";
  waiting: boolean;
  before: { from: string; to: string };
  /** The newest day the periods end on: a country kept ready has its own (§16). */
  newest: string | null;
} {
  const range = useSiteRange();
  const status = useSearchConsoleStatus();
  const [country] = useSearchConsoleCountry();
  // A country kept ready may be a day behind all countries: its periods end on its own newest day, so they read its ready-made figures.
  const newest = (country ? status?.connection?.countriesNewest.find((held) => held.country === country)?.newestDay : undefined) ?? newestDay ?? null;
  const today = ukDay();
  if (range.period === "custom") {
    // Custom dates, within what Google has sent (the menu's bound): the same number of days before them (part two, rule 4).
    const to = newest && range.to > newest ? newest : range.to;
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
    return { from: range.from, to, days, step: range.step, period: "custom", waiting: false, before: range.before, newest };
  }
  const span = newest ? periodSpan(range.period, today, newest) : null;
  if (!span) {
    const first = periodBounds(range.period, today).from;
    return { from: first, to: first, days: 0, step: range.step, period: range.period, waiting: newest !== null, before: { from: first, to: first }, newest };
  }
  const days = Math.round((Date.parse(`${span.to}T00:00:00Z`) - Date.parse(`${span.from}T00:00:00Z`)) / 86_400_000) + 1;
  const before = spanBefore(range.period, span);
  return { from: span.from, to: span.to, days, step: range.step, period: range.period, waiting: false, before: { from: before.from, to: before.to }, newest };
}

/**
 * Whether the dates chosen are a ready-made period — every calendar period is,
 * to Google's newest day held — read from the server a page at a time; any
 * other dates are asked of Google. Worked out here from the dates alone, so a
 * search, an order or a filter never asks Google again.
 */
export function isReadyMade(range: { to: string; days: number; waiting?: boolean; newest?: string | null }, newestDay: string | null | undefined): boolean {
  // The range's own newest day first: a country kept ready reads its ready-made figures to its own newest day.
  const newest = range.newest ?? newestDay;
  return Boolean(newest) && !range.waiting && range.days > 0;
}

/**
 * The date menu's period in a sentence's words (calendar-periods-plan.md, phase 4): "last month" (`period`), its name
 * ("Last month", `name`), what it is set against ("the month before", `before`), and the change line's ending ("on the
 * month before", `versus`).
 */
export function useSearchConsolePeriodWords(period: CalendarPeriod | "custom"): { period: string; name: string; before: string; versus: string } {
  const tp = useTranslations("common.periods");
  return { period: tp(`inline.${period}`), name: tp(period === "custom" ? "customName" : period), before: tp(`before.${period}`), versus: tp(`versus.${period}`) };
}

/** The period a query is asked with: none for custom dates, which have no ready-made list and are asked of Google live. */
export function periodArg(range: { period: MenuPeriod | "custom" }): { period?: MenuPeriod } {
  return range.period === "custom" ? {} : { period: range.period };
}
