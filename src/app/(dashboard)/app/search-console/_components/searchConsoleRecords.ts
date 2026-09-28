"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSearchConsoleHref, type ResultKind } from "./useSearchConsole";

/**
 * What a search's and a page's own screens share: the way back to the list
 * they were opened from — its search, order and page kept, as the Sites
 * record screens return to theirs — how a page's address is written, and the
 * pairing asked of Google when the screen opens.
 */

/** The address key a record's screen carries its list's own address in. */
export const BACK_KEY = "back";

/** A link to a record's screen from the list on screen, carrying that list's address for the way back. */
export function useRecordHref(siteId: string): (segment: "searches/search" | "pages/page", key: string) => string {
  const hrefFor = useSearchConsoleHref(siteId);
  const pathname = usePathname();
  const params = useSearchParams();
  const here = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  return (segment, key) => hrefFor(segment, { key, [BACK_KEY]: here });
}

/** The way back from a record's screen: the list it came from, or the list itself for a link opened cold. */
export function useRecordBack(siteId: string, list: "searches" | "pages"): { label: string; href: string } {
  const t = useTranslations("searchConsole.record");
  const params = useSearchParams();
  const hrefFor = useSearchConsoleHref(siteId);
  const back = params.get(BACK_KEY);
  const fromList = back && back.startsWith(`/app/search-console/${siteId}/`) ? back : null;
  return {
    label: t(list === "searches" ? "backToSearches" : "backToPages"),
    href: fromList ?? hrefFor(list),
  };
}

/** A page's address as the tables write it: its path on the site's own host, the host too on any other. */
export function pageLabel(url: string, host: string): string {
  try {
    const parsed = new URL(url);
    const bare = (text: string) => text.toLowerCase().replace(/^www\./, "");
    const path = `${parsed.pathname}${parsed.search}`;
    return bare(parsed.hostname) === bare(host) ? path : `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

type Pairing = FunctionReturnType<typeof api.searchConsoleReads.searchConsolePairing>;

/**
 * Which pages Google showed for a search, or which searches it showed a page
 * for — asked of Google when the screen opens, and again when the dates or
 * kind of result change. `retry` asks again after Google was busy.
 */
export function usePairing(ask: {
  siteId: Id<"companyWebsites">;
  searchType: ResultKind;
  dimension: "query" | "page";
  key: string;
  from: string;
  to: string;
} | null): { answer: Pairing | undefined; retry: () => void } {
  const pair = useAction(api.searchConsoleReads.searchConsolePairing);
  const askKey = ask ? JSON.stringify(ask) : null;
  const [attempt, setAttempt] = useState(0);
  const [answered, setAnswered] = useState<{ key: string; answer: Pairing } | null>(null);
  useEffect(() => {
    if (!askKey) return;
    let live = true;
    // Google out of reach reads as busy: the screen says so and offers to ask again.
    void pair(JSON.parse(askKey) as NonNullable<typeof ask>)
      .catch((): Pairing => ({ ok: false, problem: "GOOGLE_BUSY" }))
      .then((answer) => {
        if (live) setAnswered({ key: `${askKey}#${attempt}`, answer });
      });
    return () => {
      live = false;
    };
  }, [askKey, attempt, pair]);
  return {
    answer: answered?.key === `${askKey}#${attempt}` ? answered.answer : undefined,
    retry: () => setAttempt((count) => count + 1),
  };
}
