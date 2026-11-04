"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAnalyticsArgs, useAnalyticsStatus } from "./useAnalytics";

/**
 * What a Google Analytics page hands its eye beside its own figures (ask-hakken-every-chart-page-plan-2026-11-03.md,
 * section 5; `convex/utils/sees/own/googleAnalytics.ts`): the names its findings use, in the reader's words, and the
 * whole website's figures a list's rows are set beside. Read once, the same objects while they stand.
 */

const EYE_NAMES = ["website", "visits", "conversions", "views", "landing", "tagged", "rightNow", "usualHalfHour", "viewsShare", "square", "thisPage", "shopPages", "homePage"] as const;

/** The names a page's own findings use ("The whole website", "All landing pages"), in the reader's language. */
export function useEyeNames(): Record<string, string> {
  const t = useTranslations("googleAnalytics.eyeNames");
  return useMemo(() => Object.fromEntries(EYE_NAMES.map((key) => [key, t(key)])), [t]);
}

/**
 * The whole website's visits, views, conversions and engaged visits, now and the span before, from Overview's own read
 * (the same figures as its boxes), for a list page's rows to be set beside. Never money. Undefined while it loads.
 */
export function useWebsiteForEye() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, status?.connection?.newestDay ? args : "skip");
  return useMemo(() => {
    const now = overview?.now;
    if (!now) return undefined;
    const before = overview?.before ?? null;
    return {
      visits: now.visits, visitsBefore: before?.visits ?? null,
      views: now.views, viewsBefore: before?.views ?? null,
      conversions: now.conversions, conversionsBefore: before?.conversions ?? null,
      engaged: now.engaged, engagedBefore: before?.engaged ?? null,
    };
  }, [overview]);
}

/**
 * Money a Google Analytics read still carries for others (Ask Hakken's overview, Insights' reads), taken off before the
 * eye reads a page (decision 1, Anthony, 2026-11-03: "Take money off"): no finding, writer or chat on these screens ever
 * sees a value, a revenue or what anything was worth.
 */
const MONEY = new Set(["value", "valueBefore", "revenue", "revenueBefore", "worth", "worthBefore", "each", "averageOrder", "valuePerVisit", "unvalued", "currency"]);

export function withoutMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutMoney);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !MONEY.has(key)).map(([key, inner]) => [key, withoutMoney(inner)]));
}
