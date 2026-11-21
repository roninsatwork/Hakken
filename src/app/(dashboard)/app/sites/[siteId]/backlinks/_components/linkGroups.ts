"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { linkGroupNameFrom } from "@/convex/utils/sees/eyeData/visibilityBacklinks";

/** Where links come from's breakdowns, as its picker and All backlinks' group filter name them. */
export const LINK_BREAKDOWNS = ["countries", "tlds", "platforms", "linkTypes", "attributes"] as const;
export type LinkBreakdown = (typeof LINK_BREAKDOWNS)[number];

/**
 * A group of links in words: a country's name ("Worldwide" for links Google
 * places nowhere), a domain ending with its dot, a kind of site or link as a
 * word. Where links come from's rows and All backlinks' group filter say them
 * alike (discovery-detail-and-hakken-sees-plan.md §5).
 */
export function useLinkGroupName(): (breakdown: LinkBreakdown, key: string) => string {
  const t = useTranslations("sites.linkSources");
  const locale = useLocale();
  const regions = useMemo(() => (typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames([locale], { type: "region" }) : null), [locale]);
  // The words are shared with a chat app's question, which names the groups in English (`linkGroupNameFrom`).
  return useMemo(() => linkGroupNameFrom(t, regions), [regions, t]);
}

/** A group as All backlinks' address carries it, `<breakdown>:<key>`, read back; null when it is not one. */
export function readLinkGroup(group: string): { breakdown: LinkBreakdown; key: string } | null {
  const at = group.indexOf(":");
  const breakdown = group.slice(0, at) as LinkBreakdown;
  return at > 0 && LINK_BREAKDOWNS.includes(breakdown) ? { breakdown, key: group.slice(at + 1) } : null;
}
