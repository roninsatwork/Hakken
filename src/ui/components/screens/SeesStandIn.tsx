"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import type { SeesSection } from "@/convex/utils/sees/screens";
import { publishSeesStandIn } from "./hakkenSeesStore";

/**
 * The eye on every page of a section, even one that put none up itself (sees-every-page-plan-2026-10-31.md: "No
 * vanishing eyes"): a page with nothing collected yet, no days of its period yet, or nothing to list still shows the
 * eye, with the chat. Drawn by the section's layout around its pages; a page's own eye replaces it. Never on a
 * connection page (Anthony, 2026-10-31: no eye on connection pages), nor on a website not connected, whose pages are
 * the way to connect it — `off` says so.
 */
export function SeesStandIn({ section, siteId, off = false }: { section: SeesSection; siteId?: Id<"companyWebsites">; off?: boolean }) {
  const path = usePathname() ?? "";
  const shown = !off && !path.split("/").includes("connection");
  useEffect(() => {
    if (!shown) return;
    publishSeesStandIn({ screen: path, says: [], steps: [], advice: "", page: { screen: standInScreen(section, path, siteId), ...(siteId ? { siteId } : {}), data: undefined } });
    return () => publishSeesStandIn(null, path);
  }, [shown, path, section, siteId]);
  return null;
}

/**
 * The page's key by its address, for what the chat is told the page is: "/app/search-console/s1/almost-there" is
 * "searchConsole.almostThere"; a website's first page its "overview".
 */
export function standInScreen(section: SeesSection, path: string, siteId?: string): string {
  const parts = path.split("/").filter(Boolean).slice(2).filter((part) => part !== siteId);
  const words = parts.join("-").split("-").filter(Boolean);
  const name = words.map((word, at) => (at === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("");
  return `${section}.${name || "overview"}`;
}
