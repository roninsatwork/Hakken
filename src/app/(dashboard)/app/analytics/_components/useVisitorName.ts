"use client";

import { useTranslations } from "next-intl";
import { isUnknownValue } from "@/convex/utils/analyticsUnknown";

/**
 * A group's name in the reader's words: "New", "Female", "Unknown"; a browser
 * or a system as Google names it. Visitors' lists and Overview's Who visited
 * (ga-overview-plan.md OV6) read it.
 */
export function useVisitorName(): (label: string) => string {
  const t = useTranslations("googleAnalytics.visitors.names");
  return (label) => {
    const key = label.trim().toLowerCase();
    // Google's words for not knowing, as the reader's "Unknown".
    if (isUnknownValue(label)) return t("unknown");
    return t.has(key) ? t(key) : label;
  };
}
