"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CALENDAR_PERIODS, customSpans, stepOf, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { customPeriodKey, customRangeOf, type CustomPeriod } from "@/convex/utils/analyticsCustomPeriod";
import type { DateChoice } from "@/src/ui/components/screens/DatesMenu";
import { CALENDAR_PERIOD_KEY, useDateChoice } from "../../sites/_components/useCalendarPeriod";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { GOOGLE_COUNTRIES } from "@/convex/utils/countryCodes";

/**
 * The Google Analytics section's own address and reads
 * (docs/plans/active/google-analytics-plan.md §5): which website, which
 * dates, which device and how the charts step — kept in the address, so a
 * page's filters travel with its menu and survive Back.
 */

export type AnalyticsStatus = NonNullable<FunctionReturnType<typeof api.googleAnalyticsConnect.googleAnalyticsStatus>>;

/** The menu's groups, as drawn (§11): the figures, then the settings. */
export const ANALYTICS_GROUPS = ["figures", "settings"] as const;
export type AnalyticsGroup = (typeof ANALYTICS_GROUPS)[number];

/** The section's pages, in the order its menu lists them. */
export const ANALYTICS_PAGES = [
  { id: "overview", segment: "", group: "figures" },
  // Who is on the website now (GA34).
  { id: "live", segment: "live", group: "figures" },
  { id: "channels", segment: "channels", group: "figures" },
  // Visits from tagged links (GA28).
  { id: "campaigns", segment: "campaigns", group: "figures" },
  { id: "landingPages", segment: "funnel", group: "figures" },
  { id: "allPages", segment: "all-pages", group: "figures" },
  // Every event the website recorded (GA30) is part of Conversions (ga-conversions-visitors-plan.md CV1).
  { id: "conversions", segment: "conversions", group: "figures" },
  // A shop's products (GA34): listed only for a website that is a shop.
  { id: "products", segment: "products", group: "figures", shopOnly: true },
  // Who visited (GA24).
  { id: "visitors", segment: "visitors", group: "figures" },
  { id: "trackingHealth", segment: "tracking-health", group: "settings" },
  { id: "connection", segment: "connection", group: "settings" },
] as const satisfies readonly { id: string; segment: string; group: AnalyticsGroup; shopOnly?: boolean }[];
export type AnalyticsPageId = (typeof ANALYTICS_PAGES)[number]["id"];

/** The page a path under the website belongs to: a landing page's own screen keeps Landing pages lit, an event's Conversions. */
export function pageForPath(pathname: string, siteId: string): AnalyticsPageId {
  const own = pathname.replace(`/app/analytics/${siteId}`, "").replace(/^\/|\/$/g, "");
  const rest = own === "events" || own.startsWith("events/") ? "conversions" : own;
  const under = ANALYTICS_PAGES.filter((page) => page.segment && (rest === page.segment || rest.startsWith(`${page.segment}/`)));
  return under.sort((left, right) => right.segment.length - left.segment.length)[0]?.id ?? "overview";
}

/** The ready-made periods: the date menu's seven calendar periods every section shares (calendar-periods-plan.md, phase 6). */
export const PERIODS = CALENDAR_PERIODS;
/** What a page reads by: a menu period, or custom dates' key (`custom_from_to`), whose lists are asked of Google when first asked for. */
export type Period = MenuPeriod | CustomPeriod;
export const PERIOD_KEY = CALENDAR_PERIOD_KEY;

/** The word a period is named by in the section's words: custom dates share one, `custom` ("these dates"). */
export function periodWord(period: Period): MenuPeriod | "custom" {
  return customRangeOf(period) ? "custom" : (period as MenuPeriod);
}

/** The step a period's charts open on (rule 8): custom dates step by their length, as every section's do. */
export function stepOfPeriod(period: Period): Step {
  const range = customRangeOf(period);
  return range ? customSpans(range.from, range.to).step : stepOf(period as MenuPeriod);
}

/** Every device, or one (GA13). */
export const DEVICES = ["all", "desktop", "mobile", "tablet"] as const;
export type Device = (typeof DEVICES)[number];
export const DEVICE_KEY = "device";

/**
 * The home country (google-analytics-plan.md §18.6.1): the main one unless
 * another of the website's home countries is chosen. The same key and codes as
 * Search Console's, so a link keeps its country between the two sections.
 */
export const COUNTRY_KEY = "country";
const MAIN_COUNTRY = "main";
const COUNTRY_CHOICES = [MAIN_COUNTRY, ...GOOGLE_COUNTRIES.filter((code) => code !== "zzz")] as const;

/** How a chart steps: the Sites charts' own key, so a choice reads the same in every section. */
export const STEPS = ["day", "week", "month"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_KEY = "step";

/** What travels between the section's pages: the dates, the device, the step and the home country. */
export function analyticsQuery(params: URLSearchParams): string {
  const shared = new URLSearchParams();
  for (const key of [PERIOD_KEY, "from", "to", DEVICE_KEY, STEP_KEY, COUNTRY_KEY]) {
    const value = params.get(key);
    if (value) shared.set(key, value);
  }
  const text = shared.toString();
  return text ? `?${text}` : "";
}

/**
 * Where this screen is, within the website's section, with everything its
 * address holds: what a page's own screen goes back to (`from`,
 * landing-pages-flow-plan.md LF9).
 */
export function useFromHere(): string {
  const siteId = useAnalyticsSiteId();
  const pathname = usePathname();
  const params = useSearchParams();
  const base = `/app/analytics/${siteId}`;
  const segment = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const query = params.toString();
  return query ? `${segment}?${query}` : segment;
}

/**
 * A page's own screen, the one every page in the section opens (LF8; Anthony,
 * 2026-10-14: "this should be the default to all page level click throughs
 * in this section"), knowing the screen it was opened from.
 */
export function usePageHref(): (key: string) => string {
  const hrefFor = useAnalyticsHref(useAnalyticsSiteId());
  const from = useFromHere();
  return (key) => hrefFor("all-pages/page", { key, from });
}

/** A page of the website's section, with the dates, device and step. */
export function useAnalyticsHref(siteId: string): (segment: string, extra?: Record<string, string>) => string {
  const params = useSearchParams();
  return (segment, extra) => {
    const query = new URLSearchParams(analyticsQuery(params).replace(/^\?/, ""));
    for (const [key, value] of Object.entries(extra ?? {})) query.set(key, value);
    const text = query.toString();
    return `/app/analytics/${siteId}${segment ? `/${segment}` : ""}${text ? `?${text}` : ""}`;
  };
}

export function useAnalyticsSiteId(): Id<"companyWebsites"> {
  const params = useParams<{ siteId: string }>();
  return params.siteId as Id<"companyWebsites">;
}

/** The website's connection as its pages show it: the same subscription the layout reads. */
export function useAnalyticsStatus() {
  const siteId = useAnalyticsSiteId();
  return useQuery(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId });
}

/**
 * The Dates menu's choice (sees-header-and-rolling-dates-plan.md, part two): a period, the one the website opens on
 * (rule 6) unless another is, or custom dates no later than the website's newest whole day.
 */
export function useAnalyticsDates(opening?: MenuPeriod): [DateChoice, (next: DateChoice) => void] {
  const status = useAnalyticsStatus();
  return useDateChoice(status?.connection?.newestDay ?? null, opening);
}

/** The period chosen, as a read takes it: the menu's, or custom dates' key. */
export function usePeriod(opening?: MenuPeriod): [Period, (next: Period) => void] {
  const [choice, setChoice] = useAnalyticsDates(opening);
  const period: Period = choice.period === "custom" ? customPeriodKey(choice) : choice.period;
  return [period, (next) => {
    const range = customRangeOf(next);
    setChoice(range ? { period: "custom", ...range } : { period: next as MenuPeriod });
  }];
}

export function useDevice(): [Device, (next: Device) => void] {
  return useSiteParam<Device>(DEVICE_KEY, "all", DEVICES);
}

/** How the charts step: the period's own (rule 8) unless another was chosen. */
export function useStep(): [Step, (next: Step) => void] {
  const [period] = usePeriod();
  return useSiteParam<Step>(STEP_KEY, stepOfPeriod(period), STEPS);
}

/**
 * The home country chosen, as Google writes it (`fra`), or null for the main
 * one — and for a country the website does not keep, which reads as the main
 * one, as Search Console's do.
 */
export function useAnalyticsCountry(): [string | null, (next: string | null) => void] {
  const siteId = useAnalyticsSiteId();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const [value, set] = useSiteParam<string>(COUNTRY_KEY, MAIN_COUNTRY, COUNTRY_CHOICES);
  const kept = value !== MAIN_COUNTRY && (choices === undefined || choices.ready.includes(value));
  return [kept ? value : null, (next) => set(next ?? MAIN_COUNTRY)];
}

/** The device as a read takes it: empty for every device. */
export function deviceArg(device: Device): string {
  return device === "all" ? "" : device;
}

/** The dates, device, home country and website every read of a page takes: the main country left out, as reads take it. */
export function useAnalyticsArgs() {
  const siteId = useAnalyticsSiteId();
  const [period] = usePeriod();
  const [device] = useDevice();
  const [country] = useAnalyticsCountry();
  return { siteId, period, device: deviceArg(device), ...(country ? { country } : {}) };
}

/** Whether the website has figures to show: collected once, whatever it is now. */
export function hasFigures(status: AnalyticsStatus): boolean {
  const connection = status.connection;
  return Boolean(connection?.newestDay) && connection?.status !== "CHOOSING" && connection?.status !== "COUNTING";
}
