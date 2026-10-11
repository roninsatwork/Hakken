"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { api } from "@/convex/_generated/api";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { useInsightsSite } from "./useInsights";

/**
 * Today's quick check, said where Insights opens (insights-analyst-plan.md §2,
 * phase 2): when the daily rules-only check finds a money page that stopped
 * answering, or Google's clicks falling away, the page says so the same day,
 * before the week's findings come.
 */
export function QuickCheckNotice() {
  const t = usePlatformTranslations("insights.quick");
  const site = useInsightsSite();
  const quick = useQuery(api.insightsQuick.insightsQuickCheck, site ? { siteId: site } : {});
  if (!quick || quick.alerts.length === 0) return null;
  const said = quick.alerts.map((alert) => t(alert.code === "PAGE_DOWN" ? "PAGE_DOWN" : "CLICKS_FELL", {
    page: alert.page ?? "",
    status: alert.a ? String(alert.a) : t("noAnswer"),
    clicks: formatNumber(alert.a ?? 0),
    usual: formatNumber(alert.b ?? 0),
    day: alert.on ? formatDay(alert.on) : "",
  }));
  return <Notice tone="warning">{t("intro", { day: formatDay(quick.day), found: said.join(" ") })}</Notice>;
}
