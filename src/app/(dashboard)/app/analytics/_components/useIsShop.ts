"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isShop } from "@/convex/utils/conversionSteps";
import { useAnalyticsArgs, useAnalyticsStatus } from "./useAnalytics";

/**
 * Whether this website sells, for the words a page uses (Anthony, 2026-11-06: "these are really events"). A shop speaks of what's
 * bought; any other website says Events on Overview, Funnel and Campaigns, so one figure has one name there. The rule is `isShop`.
 */
export function useIsShop(): boolean {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, status?.connection?.newestDay ? args : "skip");
  return isShop(status?.connection?.shop, overview?.now?.purchases, overview?.before?.purchases);
}
