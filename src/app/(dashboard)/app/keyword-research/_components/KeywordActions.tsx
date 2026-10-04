"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { cn } from "@/src/ui/lib/utils";
import { lookupHref } from "./useLookup";

/**
 * What a row of keywords offers on Keyword ideas and Start from a competitor
 * (boards 5 and 6): open a keyword, which looks it up at the usual cost, as
 * the drawings' footnotes say; and add the ticked ones to a research list.
 */

/** Where the keywords are looked up: the country, and the website measured against, or none. */
export type LookUpPlace = { locationCode: number; siteId: Id<"companyWebsites"> | null };

/** Looks a keyword up and opens its overview: one runner for a whole table, with what a lookup costs. */
export function useOpenKeyword(place: LookUpPlace) {
  const t = useTranslations("keywordResearch.lookup");
  const router = useRouter();
  const lookUp = useMutation(api.keywordResearch.lookUp);
  const setup = useQuery(api.keywordResearch.researchSetup, {});
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-open" });
  return {
    /** About what a keyword not already held costs, in cents, once the company's limits are read. */
    cents: setup?.costs.lookUp ?? null,
    busy: (keyword: string) => isBusy(keyword),
    open: async (keyword: string) => {
      const outcome = await run(
        () => lookUp({ keywords: [keyword], locationCode: place.locationCode, ...(place.siteId ? { siteId: place.siteId } : {}) }),
        { key: keyword, fallbackMessage: t("anotherFailed") },
      );
      if (outcome.ok && outcome.data.lookupIds[0]) router.push(lookupHref(outcome.data.lookupIds[0]));
    },
  };
}

/**
 * A keyword that opens its lookup when pressed — a button, since opening it
 * buys it — with the cost on hover. A read-only account reads it as words.
 */
export function KeywordOpener({ keyword, canLookUp, opener, wrap = false }: {
  keyword: string;
  canLookUp: boolean;
  opener: ReturnType<typeof useOpenKeyword>;
  /** Wrapped onto a second line rather than cut short: a table with many figure columns, as Keyword ideas is drawn. */
  wrap?: boolean;
}) {
  const t = useTranslations("keywordResearch.lookup");
  const fit = wrap ? "whitespace-normal break-words" : "truncate";
  if (!canLookUp) return <span title={keyword} className={cn("block text-[13px] text-foreground", fit)}>{keyword}</span>;
  return (
    <Button
      variant="ghost"
      title={opener.cents === null ? keyword : t("openTitle", { keyword, cents: opener.cents })}
      disabled={opener.busy(keyword)}
      onClick={() => void opener.open(keyword)}
      className={cn("block max-w-full rounded-none p-0 text-left text-[13px] font-normal text-foreground hover:bg-transparent hover:text-foreground hover:underline", fit)}
    >
      {keyword}
    </Button>
  );
}

/** "A new list…": the New list page, with the ticked keywords carried over and a way back here. */
export function newListWith(keywords: readonly string[], place: LookUpPlace, back: string): string {
  const query = new URLSearchParams();
  for (const keyword of keywords) query.append("keyword", keyword);
  query.set("country", String(place.locationCode));
  if (place.siteId) query.set("site", place.siteId);
  query.set("back", back);
  return `/app/keyword-research/lists/new?${query.toString()}`;
}

const NEW_LIST = "new";

/**
 * "Add 3 to a list" (boards 5 and 6): the ticked keywords into one of the
 * company's research lists, or a new one. Quiet until something is ticked.
 */
export function AddTickedToList({ keywords, idleLabel, place, back, onAdded }: {
  keywords: readonly string[];
  /** What it says before anything is ticked, in the page's words: "Tick ideas to add them". */
  idleLabel: string;
  place: LookUpPlace;
  /** This page's address, for the way back from New list. */
  back: string;
  onAdded: (listName: string, added: number) => void;
}) {
  const t = useTranslations("keywordResearch.add");
  const router = useRouter();
  const lists = useQuery(api.keywordResearch.researchLists, {});
  const add = useMutation(api.keywordResearch.addToResearchList);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-add" });
  const count = keywords.length;
  return (
    <Select
      chip={{ label: count > 0 ? t("ticked", { count }) : idleLabel, icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" /> }}
      aria-label={t("label")}
      value=""
      disabled={count === 0 || isBusy()}
      onChange={async (choice) => {
        if (!choice) return;
        if (choice === NEW_LIST) {
          router.push(newListWith(keywords, place, back));
          return;
        }
        const list = lists?.find((entry) => entry.listId === choice);
        const outcome = await run(
          () => add({ listId: choice as Id<"researchLists">, items: keywords.map((keyword) => ({ keyword, locationCode: place.locationCode })) }),
          { fallbackMessage: t("failed") },
        );
        if (outcome.ok) onAdded(list?.name ?? "", outcome.data.added);
      }}
    >
      <option value="">{t("choose")}</option>
      {(lists ?? []).map((list) => <option key={list.listId} value={list.listId}>{list.name}</option>)}
      <option value={NEW_LIST}>{t("newList")}</option>
    </Select>
  );
}
