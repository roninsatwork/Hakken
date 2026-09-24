"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** The open site's hold id, from the address. The server checks it is the caller's company's. */
export function useSiteId(): Id<"companyWebsites"> {
  const params = useParams<{ siteId: string }>();
  return params.siteId as Id<"companyWebsites">;
}

/**
 * The open site's header: the same query the layout reads, so a page asking
 * for it shares the one subscription rather than starting another.
 */
export function useSite() {
  const siteId = useSiteId();
  return useQuery(api.sites.getMySite, { siteId });
}

/** The day chosen in "compare with", or null for the check before (the default). */
export function useCompareDay(): string | null {
  const params = useSearchParams();
  const day = params.get("compare");
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
