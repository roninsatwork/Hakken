"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ANALYTICS_EYE_NAMES } from "@/convex/utils/sees/eyeData/googleAnalyticsOverview";
import { websiteForEye } from "@/convex/utils/sees/eyeData/googleAnalyticsShared";
import { useAnalyticsArgs, useAnalyticsStatus } from "./useAnalytics";

/**
 * What a Google Analytics page hands its eye beside its own figures (ask-hakken-every-chart-page-plan-2026-11-03.md,
 * section 5; `convex/utils/sees/own/googleAnalytics.ts`): the names its findings use, in the reader's words, and the
 * whole website's figures a list's rows are set beside. Read once, the same objects while they stand. Built by the same
 * functions a chat app's question builds them with (`convex/utils/sees/eyeData/`), so the two can't disagree.
 */

/** Money taken off before the eye reads a page: shared with the server (`convex/utils/sees/eyeData/googleAnalyticsShared.ts`). */
export { withoutMoney } from "@/convex/utils/sees/eyeData/googleAnalyticsShared";

/** The names a page's own findings use ("The whole website", "All landing pages"), in the reader's language. */
export function useEyeNames(): Record<string, string> {
  const t = useTranslations("googleAnalytics.eyeNames");
  return useMemo(() => Object.fromEntries(ANALYTICS_EYE_NAMES.map((key) => [key, t(key)])), [t]);
}

/**
 * The whole website's visits, views, conversions and engaged visits, now and the span before, from Overview's own read
 * (the same figures as its boxes), for a list page's rows to be set beside. Never money. Undefined while it loads.
 */
export function useWebsiteForEye() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, status?.connection?.newestDay ? args : "skip");
  return useMemo(() => websiteForEye(overview), [overview]);
}
