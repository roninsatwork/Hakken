"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAnalyticsSiteId } from "../../_components/useAnalytics";

/**
 * Visitors is Visits now (Anthony, 2026-11-03: "Call it Visits";
 * docs/plans/active/visits-redo-plan-2026-11-03.md), at `/visits`: an old link,
 * bookmark, Ask Hakken answer or task email forwards there, its address kept whole.
 */
export default function AnalyticsVisitorsForward() {
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const query = useSearchParams().toString();
  useEffect(() => {
    router.replace(`/app/analytics/${siteId}/visits${query ? `?${query}` : ""}`);
  }, [router, siteId, query]);
  return null;
}
