"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatDay } from "../../sites/_components/siteFormat";
import { formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import type { AnalyticsStatus } from "./useAnalytics";

export type HealthCheckRow = NonNullable<NonNullable<AnalyticsStatus["connection"]>["health"]>["checks"][number];
type Check = HealthCheckRow;

/** What a check's result means for the reader: some figures are off, it found something that changes none, or all's well. */
export type HealthResult = "off" | "none" | "good";
/** The kinds of figure a check is about, one box each on Tracking health. */
export const HEALTH_AREAS = ["visits", "came", "events", "pages"] as const;
export type HealthArea = (typeof HEALTH_AREAS)[number];

/** Checks that found something real but change no figure a client reads: other websites are left out, and no page shows value. */
const NO_EFFECT = new Set(["STRANGERS", "NO_VALUE"]);
const AREAS: Record<string, HealthArea> = {
  TRACKING_STOPPED: "visits", SUDDEN_FALL: "visits", STRANGERS: "visits",
  TOO_MUCH_UNKNOWN: "came", SELF_REFERRAL: "came", PAYMENT_REFERRALS: "came",
  NOTHING_COUNTED: "events", NO_VALUE: "events", SOMETHING_ELSE: "events", COUNTED_TWICE: "events", ENQUIRY_UNCOUNTED: "events", NEVER_HAPPENS: "events", CONVERSIONS_ELSEWHERE: "events",
  COUNTED_AGAIN: "pages",
};

export function healthResult(check: Pick<Check, "check" | "passing">): HealthResult {
  if (check.passing) return "good";
  return NO_EFFECT.has(check.check) ? "none" : "off";
}

export function healthArea(check: string): HealthArea {
  return AREAS[check] ?? "events";
}

/** The checks whose names (and, for two of them, others) are events, named in the reader's words. */
const NAMES_EVENTS = new Set(["NO_VALUE", "SOMETHING_ELSE", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS", "COUNTED_TWICE"]);

/**
 * An uncounted enquiry listed on the Connection page, chosen there: every
 * event that reads as an enquiry is listed beside the key events, and counted
 * from Google's own figures (conversions-back-in-time-plan.md BT2).
 */
export function choosableHere(check: Check, status: AnalyticsStatus): boolean {
  const listed = new Set((status.connection?.events ?? []).map((event) => event.eventName));
  return check.check === "ENQUIRY_UNCOUNTED" && !check.passing && (check.names ?? []).length > 0 && (check.names ?? []).every((name) => listed.has(name));
}

/**
 * A Tracking health check in words: its name, which reads properly beside any
 * result; what it found; why it matters; how it gets fixed; what it checks; and
 * what it affects. Reading age 14, as the screens redone with Anthony read.
 */
export function useHealthWords(status: AnalyticsStatus): (check: Check) => { name: string; found: string; why: string; fix: string; about: string; affects: string } {
  const t = useTranslations("googleAnalytics.health.checks");
  const nameOf = useEventName();
  const total = (status.connection?.events ?? []).filter((event) => event.counted).length;
  return (check) => {
    const events = NAMES_EVENTS.has(check.check);
    const names = events ? (check.names ?? []).map(nameOf) : check.names ?? [];
    const others = (check.others ?? []).map(nameOf);
    const count = check.count ?? 0;
    const values = {
      host: status.host,
      names: names.join(", "),
      others: others.join(", "),
      first: names[0] ?? "",
      second: others[0] ?? "",
      total,
      kinds: names.length,
      pairs: names.length,
      // A count said in words beside the number it picks a plural by.
      count: formatNumber(count),
      visits: count,
      pages: count,
      // For Never happens: 90 days, or 365 read as 12 months.
      days: count,
      day: check.check === "TRACKING_STOPPED" && names[0] ? formatDay(names[0]) : "",
      measure: names[0] ?? "",
      share: formatPercent(check.share ?? 0),
      percent: Math.round((check.share ?? 0) * 100),
    };
    return {
      name: t(`${check.check}.name`),
      found: t(`${check.check}.${check.passing ? "passing" : "found"}`, values),
      why: t(`${check.check}.why`),
      fix: t(`${check.check}.fix`, values),
      about: t(`${check.check}.about`),
      affects: t(`${check.check}.affects`),
    };
  };
}
