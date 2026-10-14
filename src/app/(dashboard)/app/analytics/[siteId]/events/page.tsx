"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAnalyticsSiteId } from "../../_components/useAnalytics";

/**
 * Events is part of Conversions now (docs/plans/active/ga-conversions-visitors-plan.md
 * CV1; Anthony, 2026-10-14: "should we merge events and conversions into one
 * page"): an old link or bookmark forwards there, its address kept whole. An
 * event's own screen stays, opened from Conversions' table.
 */
export default function AnalyticsEventsForward() {
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const query = useSearchParams().toString();
  useEffect(() => {
    router.replace(`/app/analytics/${siteId}/conversions${query ? `?${query}` : ""}`);
  }, [router, siteId, query]);
  return null;
}
