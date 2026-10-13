"use client";

import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import type { AnalyticsStatus } from "./useAnalytics";

type Check = NonNullable<NonNullable<AnalyticsStatus["connection"]>["health"]>["checks"][number];

/** The checks whose names (and, for "really something else", others) are events, named in the reader's words. */
const NAMES_EVENTS = new Set(["NO_VALUE", "SOMETHING_ELSE", "ENQUIRY_UNCOUNTED", "NEVER_HAPPENS"]);

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
 * A tracking health check in words (§6): its title, what is wrong, why it
 * matters and how to fix it, and the one short line Overview shows.
 */
export function useHealthWords(status: AnalyticsStatus): (check: Check) => { title: string; wrong: string; why: string; fix: string; short: string } {
  const t = useTranslations("googleAnalytics.health.checks");
  const nameOf = useEventName();
  const { platformName } = useSystemSettings();
  return (check) => {
    const events = NAMES_EVENTS.has(check.check);
    const names = events ? (check.names ?? []).map(nameOf) : check.names ?? [];
    const values = {
      host: status.host,
      names: names.join(", "),
      others: (check.others ?? []).map(nameOf).join(", "),
      count: formatNumber(check.count ?? 0),
      share: formatPercent(check.share ?? 0),
      measure: names[0] ?? "",
      platformName,
      // For plurals: how many it names, and the days a conversion has been silent (90, or 365 read as 12 months).
      kinds: names.length,
      days: check.count ?? 0,
    };
    const state = check.passing ? "passing" : "failing";
    return {
      title: t(`${check.check}.title`),
      wrong: t(`${check.check}.${state}`, values),
      why: t(`${check.check}.why`),
      fix: t(`${check.check}.fix`, values),
      short: t(`${check.check}.short`, values),
    };
  };
}
