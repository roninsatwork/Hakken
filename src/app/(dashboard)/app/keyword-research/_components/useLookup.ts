"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** A lookup's overview, as `lookupOverview` answers it for the company's own lookup. */
export type LookupOverview = NonNullable<FunctionReturnType<typeof api.keywordResearch.lookupOverview>>;

/** The open lookup's id, from the address. The server checks it is the caller's company's. */
export function useLookupId(): Id<"keywordLookups"> {
  const params = useParams<{ lookupId: string }>();
  return params.lookupId as Id<"keywordLookups">;
}

/**
 * The open lookup: the same query the lookup's layout reads for its header
 * and menu, so a page asking for it shares the one subscription. It updates
 * by itself while the Keyword research agent buys.
 */
export function useLookupOverview() {
  const lookupId = useLookupId();
  return useQuery(api.keywordResearch.lookupOverview, { lookupId });
}

/** Where a lookup's screens are. */
export const lookupHref = (lookupId: string, segment = "") => `/app/keyword-research/${lookupId}${segment ? `/${segment}` : ""}`;
export const listHref = (listId: string) => `/app/keyword-research/lists/${listId}`;
export const KEYWORD_RESEARCH_HREF = "/app/keyword-research";

/** One kind of the open lookup's keyword ideas, and how many of each kind there are (`lookupIdeas`). */
export function useLookupIdeas(kind: "TERMS" | "QUESTIONS" | "ALSO_RANK") {
  const lookupId = useLookupId();
  return useQuery(api.keywordResearchIdeas.lookupIdeas, { lookupId, kind });
}

/** What the AI says about the open lookup (`lookupAnswers`): nothing is asked by reading it. */
export function useLookupAnswers() {
  const lookupId = useLookupId();
  return useQuery(api.keywordResearchAnswers.lookupAnswers, { lookupId });
}

export type LookupIdeas = NonNullable<FunctionReturnType<typeof api.keywordResearchIdeas.lookupIdeas>>;
export type LookupAnswers = NonNullable<FunctionReturnType<typeof api.keywordResearchAnswers.lookupAnswers>>;

/** A lookup's Keyword ideas of one kind: `?kind=terms`. */
export const ideasHref = (lookupId: string, key: string) => `${lookupHref(lookupId, "ideas")}?kind=${key}`;
