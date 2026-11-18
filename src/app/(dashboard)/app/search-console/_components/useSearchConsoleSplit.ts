"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarPeriod } from "@/convex/utils/calendarPeriods";
import type { LiveProblemKind } from "./SearchConsoleNotices";
import { useLiveAsk } from "./searchConsoleRecords";
import type { ResultKind } from "./useSearchConsole";

type SplitAnswer = FunctionReturnType<typeof api.searchConsoleLists.searchConsoleSplitList>;
/**
 * A short list's rows, its summary — the span before's totals among it — and whether the span before is held; asked of
 * Google, why it didn't answer (`problem`) and the way to ask again.
 */
export type SplitList = {
  rows: SplitAnswer["rows"];
  preparing: boolean;
  summary: SplitAnswer["summary"];
  comparable: boolean;
  problem: LiveProblemKind | null;
  /** Asked of Google, the list stopped at Google's most an ask (`GOOGLE_MOST_ROWS`): the table says so. */
  cut: number | null;
  retry: () => void;
};

/**
 * A short list for the dates chosen — countries, devices or how Google showed the website — the ready-made
 * period's, or, for other dates or a country the website does not keep ready, asked of Google
 * (search-console-plan.md §14.3, item 4; §16). Countries and devices, and Performance's squares and bands
 * (search-console-performance-way-3-plan-2026-11-17.md), read it. Countries and devices' boxes read its summary too
 * (search-console-countries-and-devices-way-1-plan-2026-11-18.md): the span before's totals and the rows clicked.
 */
export function useSearchConsoleSplit(ask: {
  siteId: Id<"companyWebsites">;
  searchType: ResultKind;
  from: string;
  to: string;
  period?: CalendarPeriod;
  dimension: "country" | "device" | "appearance";
  country?: string;
} | null): SplitList | undefined {
  const server = useQuery(api.searchConsoleLists.searchConsoleSplitList, ask ?? "skip");
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, server?.live && ask ? ask : null);
  // The same answer keeps the same rows: the eye works a page's figures out again only when they change.
  const answer = useMemo((): Omit<SplitList, "retry"> | undefined => {
    if (!server) return undefined;
    if (!server.live) return { rows: server.rows, preparing: server.preparing, summary: server.summary ?? null, comparable: server.comparable, problem: null, cut: null };
    if (live.answer === undefined) return undefined;
    if (!live.answer.ok) return { rows: [], preparing: false, summary: null, comparable: false, problem: live.answer.problem, cut: null };
    return { rows: live.answer.rows.flat(), preparing: false, summary: live.answer.summary, comparable: live.answer.comparable, problem: null, cut: live.answer.listCut ?? null };
  }, [server, live.answer]);
  return answer ? { ...answer, retry: live.retry } : undefined;
}
