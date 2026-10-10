"use client";

import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import type { AnalyticsStatus } from "./useAnalytics";

type Check = NonNullable<NonNullable<AnalyticsStatus["connection"]>["health"]>["checks"][number];

/**
 * A tracking health check in words (§6): its title, what is wrong, why it
 * matters and how to fix it, and the one short line Overview shows.
 */
export function useHealthWords(status: AnalyticsStatus): (check: Check) => { title: string; wrong: string; why: string; fix: string; short: string } {
  const t = useTranslations("googleAnalytics.health.checks");
  const nameOf = useEventName();
  const { platformName } = useSystemSettings();
  return (check) => {
    const names = check.check === "NO_VALUE" ? (check.names ?? []).map(nameOf) : check.names ?? [];
    const values = {
      host: status.host,
      names: names.join(", "),
      count: formatNumber(check.count ?? 0),
      share: formatPercent(check.share ?? 0),
      measure: names[0] ?? "",
      platformName,
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
