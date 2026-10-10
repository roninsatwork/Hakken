"use client";

import { useTranslations } from "next-intl";

/**
 * A conversion's own name (GA19): "Contact form sent" for `generate_lead`,
 * in the reader's language, for the events Hakken knows; any other event's
 * own name in words ("Brochure request" for `brochure_request`).
 */
export function useEventName(): (eventName: string) => string {
  const t = useTranslations("googleAnalytics.events");
  return (eventName) => (t.has(eventName) ? t(eventName) : wordsOf(eventName));
}

function wordsOf(eventName: string): string {
  const words = eventName.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : eventName;
}
