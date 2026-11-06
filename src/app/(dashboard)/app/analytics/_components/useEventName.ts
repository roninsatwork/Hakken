"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * A conversion's own name (GA19): the everyday name Auto Setup wrote for it if it has one ("Asked for a prospectus"), in the reader's
 * language; "Contact form sent" for `generate_lead`, for the events Hakken knows; any other event's own name in words ("Brochure
 * request" for `brochure_request`).
 */
export function useEventName(): (eventName: string) => string {
  const t = useTranslations("googleAnalytics.events");
  const language = useLocale();
  const params = useParams<{ siteId?: string }>();
  const siteId = params?.siteId as Id<"companyWebsites"> | undefined;
  const plain = useQuery(api.googleAnalyticsEventNames.analyticsEventNames, siteId ? { siteId, language } : "skip");
  return (eventName) => plain?.[eventName] ?? (t.has(eventName) ? t(eventName) : wordsOf(eventName));
}

/**
 * A thing people did, as the redone pages say it: "Added to basket", "Bought", "Signed up for emails", and any other by its own name
 * (Campaigns' squares and Channels' Events menu).
 */
export function useThingDone(): (eventName: string) => string {
  const did = useTranslations("googleAnalytics.campaigns.squares.did");
  const nameOf = useEventName();
  return (eventName) => (did.has(eventName) ? did(eventName) : nameOf(eventName));
}

function wordsOf(eventName: string): string {
  const words = eventName.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : eventName;
}
