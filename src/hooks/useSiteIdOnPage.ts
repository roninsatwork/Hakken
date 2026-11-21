"use client";

import { createContext, useContext } from "react";
import { useParams } from "next/navigation";

/**
 * The website a page hands its sections when its address names none (dashboard-way-1-plan-2026-11-21.md). Each section's
 * screens read their website from the address, `/app/<section>/[siteId]`. The client Dashboard, at `/app`, shows the real
 * cards of several sections for the website its Website menu picks, so it hands that website down with this provider and
 * every card works there unchanged, rather than being drawn a second time.
 */
export const SiteOnPageContext = createContext<string | null>(null);

/** The website a screen is about: the address's `[siteId]`, else the one the page handed down. */
export function useSiteIdOnPage(): string | undefined {
  const params = useParams<{ siteId?: string }>();
  const handed = useContext(SiteOnPageContext);
  return params?.siteId ?? handed ?? undefined;
}
