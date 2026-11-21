"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DemandBoxes } from "./DemandParts";
import type { SiteFigures } from "./SearchConsoleFigures";
import type { useSearchConsoleList } from "./SearchConsoleTables";
import { useSearchConsoleSiteFigures } from "./SearchConsoleFigures";
import type { TickedRow } from "./TickedDays";
import type { TickedUpdate } from "./trackedSees";
import { trackedEyeData } from "@/convex/utils/sees/eyeData/searchConsoleLists";
import { wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";

/**
 * Tracked keywords and Tracked pages, as Anthony chose them on 18 November 2026 (the canvas's Way 1 for both;
 * search-console-tracked-way-1-plan-2026-11-18.md): the parts both screens share. The rows they track are Search
 * Console's own list, never Visibility's.
 */

type Summary = ReturnType<typeof useSearchConsoleList>["summary"];

/**
 * Everything tracked together, now and in the span before, as the four boxes read it: the span before's from each
 * tracked row's own figures then (`Summary.trackedList`), so an untick moves the boxes at once. Undefined while the list
 * is on its way; no span before when it isn't held, or when Google showed none of the rows in it (the black door handles
 * page on More Handles' Last 3 months: a place of 0 before read as "35.5 places worse", 18 November 2026).
 */
export function trackedFigures(summary: Summary): Pick<SiteFigures, "totals" | "previous"> | undefined {
  if (!summary) return undefined;
  const totals = {
    clicks: summary.clicks,
    impressions: summary.impressions,
    ctr: summary.impressions > 0 ? summary.clicks / summary.impressions : 0,
    position: summary.position ?? 0,
  };
  // Google showed none of them in the span before: no place or click rate then to set against, so each box says so.
  const before = summary.trackedList?.before && summary.trackedList.before.impressions > 0 ? summary.trackedList.before : null;
  const previous = before
    ? { clicks: before.clicks, impressions: before.impressions, ctr: before.impressions > 0 ? before.clicks / before.impressions : 0, position: before.position ?? 0 }
    : null;
  return { totals, previous };
}

/** The four boxes Pages and Demand by Classification show, for the tracked rows together. */
export function TrackedBoxes({ summary }: { summary: Summary }) {
  return <DemandBoxes figures={trackedFigures(summary)} />;
}

/** What a tracked screen hands its eye (`trackedPageData`), with the names the page says things by in the reader's words. */
export function useTrackedSeesData({ list, ticked, update, nameOf, kind }: {
  list: ReturnType<typeof useSearchConsoleList>;
  ticked: readonly TickedRow[];
  update: TickedUpdate | null;
  nameOf: (key: string) => string;
  kind: "keywords" | "pages";
}) {
  const t = useTranslations("searchConsole");
  const site = useSearchConsoleSiteFigures();
  const countryClicks = site.problem ? null : (site.figures?.totals?.clicks ?? null);
  // Built by the same function a chat app's question builds them with (chatAppEyes/searchConsole.ts), so the two can't disagree.
  return useMemo(() => trackedEyeData({
    page: list.pageData,
    countryClicks,
    ticked: ticked.map((row) => ({ name: nameOf(row.key), clicks: row.clicks, previousClicks: row.previousClicks })),
    update,
    kind,
  }, wordsReader(t)), [list.pageData, countryClicks, ticked, nameOf, update, kind, t]);
}
