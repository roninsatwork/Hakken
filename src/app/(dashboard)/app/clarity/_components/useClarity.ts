"use client";

import { useQuery } from "convex/react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Microsoft Clarity's section (docs/plans/active/insights-analyst-plan.md
 * I27, phase 15, drawn as the Clarity boards): its pages, the website chosen,
 * and the days every page reads — 7, 30 or 90, kept in the address.
 */

export const CLARITY_PAGES = [
  { id: "overview", segment: "" },
  { id: "pages", segment: "pages" },
  { id: "devices", segment: "devices" },
  { id: "frustration", segment: "frustration" },
  { id: "connection", segment: "connection" },
] as const;
export type ClarityPageId = (typeof CLARITY_PAGES)[number]["id"];

export const CLARITY_DAYS = [7, 30, 90] as const;

export function useClaritySiteId(): Id<"companyWebsites"> {
  return useParams<{ siteId: string }>().siteId as Id<"companyWebsites">;
}

export function useClarityStatus() {
  const siteId = useClaritySiteId();
  return useQuery(api.clarity.clarityStatus, { siteId });
}

/** The days chosen: 30 unless the address says 7 or 90. */
export function useClarityDays(): number {
  const asked = Number(useSearchParams().get("days"));
  return (CLARITY_DAYS as readonly number[]).includes(asked) ? asked : 30;
}

export function clarityPageForPath(pathname: string, siteId: string): ClarityPageId {
  const rest = pathname.replace(`/app/clarity/${siteId}`, "").replace(/^\/|\/$/g, "");
  return CLARITY_PAGES.find((page) => page.segment === rest)?.id ?? "overview";
}

export function useClarityPath(): string {
  return usePathname();
}
