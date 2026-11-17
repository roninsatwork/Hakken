"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarPeriod } from "@/convex/utils/calendarPeriods";
import { useLiveAsk } from "./searchConsoleRecords";
import type { ResultKind } from "./useSearchConsole";

/**
 * A short list for the dates chosen — countries, devices or how Google showed the website — the ready-made
 * period's, or, for other dates or a country the website does not keep ready, asked of Google
 * (search-console-plan.md §14.3, item 4; §16). Countries and devices, and Performance's squares and bands
 * (search-console-performance-way-3-plan-2026-11-17.md), read it.
 */
export function useSearchConsoleSplit(ask: {
  siteId: Id<"companyWebsites">;
  searchType: ResultKind;
  from: string;
  to: string;
  period?: CalendarPeriod;
  dimension: "country" | "device" | "appearance";
  country?: string;
} | null) {
  const server = useQuery(api.searchConsoleLists.searchConsoleSplitList, ask ?? "skip");
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, server?.live && ask ? ask : null);
  if (!server?.live) return server;
  if (live.answer === undefined) return undefined;
  return { rows: live.answer.ok ? live.answer.rows.flat() : [], preparing: false };
}
