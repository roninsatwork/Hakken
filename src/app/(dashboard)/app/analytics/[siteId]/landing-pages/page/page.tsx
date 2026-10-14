"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAnalyticsSiteId } from "../../../_components/useAnalytics";

/**
 * A landing page's own screen retired (docs/plans/active/landing-pages-flow-plan.md
 * LF8; Anthony, 2026-10-14: "the click through on the table [should] go [to]
 * the same detail page as the all pages detail … that details page on all
 * pages is really strong"): every page in the section opens the page's own
 * screen. An old link forwards there, its address kept whole.
 */
export default function AnalyticsLandingPageForward() {
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const query = useSearchParams().toString();
  useEffect(() => {
    router.replace(`/app/analytics/${siteId}/all-pages/page${query ? `?${query}` : ""}`);
  }, [router, siteId, query]);
  return null;
}
