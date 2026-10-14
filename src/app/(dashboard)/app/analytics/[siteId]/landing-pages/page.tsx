"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAnalyticsSiteId } from "../../_components/useAnalytics";

/**
 * Landing pages is Funnel now (Anthony, 2026-10-14: "can we rename landing
 * pages to funnel please"), at `/funnel`: an old link or bookmark forwards
 * there, its address kept whole.
 */
export default function AnalyticsLandingPagesForward() {
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const query = useSearchParams().toString();
  useEffect(() => {
    router.replace(`/app/analytics/${siteId}/funnel${query ? `?${query}` : ""}`);
  }, [router, siteId, query]);
  return null;
}
