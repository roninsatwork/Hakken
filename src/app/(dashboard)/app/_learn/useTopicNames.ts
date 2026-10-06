"use client";

import { useQuery } from "convex/react";
import { useLocale } from "next-intl";
import { api } from "@/convex/_generated/api";

/**
 * The shared topic list's names in the reader's language, by key (`convex/
 * topics.ts`, insights-helpful-content-plan.md, IH20): what an article's topic
 * label says. A key with no name yet reads as nothing rather than as its key.
 */
export function useTopicNames(): (key: string | null | undefined) => string | null {
  const language = useLocale();
  const topics = useQuery(api.topics.listTopics, { language });
  return (key) => (key ? topics?.find((topic) => topic.key === key)?.name ?? null : null);
}
