"use client";

import { useTranslations } from "next-intl";
import type { Service } from "@/convex/utils/insightStrategy";
import { useInsightsHref } from "./useInsights";

/** A service's name: the guides, the home page, or its page's title (before any "|") or path. */
export function useServiceName() {
  const t = useTranslations("insights.strategy");
  return (service: Pick<Service, "kind" | "title" | "page">) => (service.kind === "GUIDES" ? t("guides") : service.kind === "HOME" ? t("home") : service.title?.split("|")[0].trim() || service.page);
}

/** A service's own page, carrying the website chosen. */
export function useServiceHref() {
  const href = useInsightsHref();
  return (service: Pick<Service, "page">) => {
    const base = href("strategy/service");
    return `${base}${base.includes("?") ? "&" : "?"}page=${encodeURIComponent(service.page)}`;
  };
}

/** A move as a percent, or null when there is nothing to move from. */
export function percentMoved(now: number, before: number | null): number | null {
  return before && before > 0 ? Math.round(((now - before) / before) * 100) : null;
}
