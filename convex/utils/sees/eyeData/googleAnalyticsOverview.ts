import { isFirstStep } from "../../conversionSteps";
import { isUnknownValue } from "../../analyticsUnknown";
import { NOT_SORTED_KIND } from "../../pageKinds";
import { OTHER_KIND } from "../analyticsChannel";
import { overviewFigures, type OverviewFiguresInput, type OverviewSplitName } from "../overviewFigures";
import type { ServerWords } from "../serverWords";

/**
 * What Google Analytics Overview hands its eye, built in one place for the
 * screen (`useOverviewEye`) and for a chat app's question
 * (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The reads and
 * the words come in; the figures `pageFindings` reads come out.
 */

/** The names the page's own findings use ("The whole website"), as `useEyeNames` reads them. */
export const ANALYTICS_EYE_NAMES = ["website", "visits", "conversions", "events", "noPageRecorded", "otherChannels", "shareOfChannelVisits", "views", "landing", "tagged", "bought", "theirVisits", "rightNow", "usualHalfHour", "usualThisTime", "busiestMinute", "averageMinute", "peopleShare", "viewsShare", "square", "thisPage", "shopPages", "homePage", "allServices", "elsewhere", "serviceVisitsShare", "noEvents", "startedOnAService"] as const;

export type OverviewEyeWords = {
  names: Record<string, string>;
  rowName: OverviewFiguresInput["rowName"];
  eventName: (name: string) => string;
  locale: string;
};

export type OverviewEyeReads = Omit<OverviewFiguresInput, "rowName" | "eventName" | "now" | "before"> & {
  overview: { now: OverviewFiguresInput["now"]; before: OverviewFiguresInput["before"] } | null | undefined;
  health: unknown;
};

export function overviewEyeData(reads: OverviewEyeReads, words: OverviewEyeWords) {
  const { overview, splits } = reads;
  if (!overview) return overview;
  const eventCodes = Object.fromEntries((splits.channel?.events ?? []).map((event) => [words.eventName(event.name), event.name]));
  return {
    ...overviewFigures({ ...reads, now: overview.now, before: overview.before, rowName: words.rowName, eventName: words.eventName }),
    eventCodes,
    locale: words.locale,
    health: reads.health,
    names: words.names,
  };
}

/** Auto Setup's say on a first step, over the rule on its name (`isFirstStep`). */
export function firstStepOf(events: readonly { eventName: string; firstStep?: boolean }[] | null | undefined) {
  const said = new Map((events ?? []).map((event) => [event.eventName, event.firstStep]));
  return (name: string) => said.get(name) ?? isFirstStep(name);
}

/** An event's own name in words: "Brochure request" for `brochure_request`. */
export function eventWords(eventName: string): string {
  const words = eventName.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : eventName;
}

/** The same names in a set of words: the reader's on the screen, English on the server. */
export function overviewWordsFrom(t: {
  eyeNames: ServerWords;
  events: ServerWords;
  devices: ServerWords;
  visitors: ServerWords;
  overviewNames: ServerWords;
  plainEventNames: Record<string, string>;
  locale: string;
}): OverviewEyeWords {
  const eventName = (name: string) => t.plainEventNames[name] ?? (t.events.has(name) ? t.events(name) : eventWords(name));
  const visitor = (label: string) => {
    const key = label.trim().toLowerCase();
    if (isUnknownValue(label)) return t.visitors("unknown");
    return t.visitors.has(key) ? t.visitors(key) : label;
  };
  const rowName = (split: OverviewSplitName, row: { key: string; name: string | null }) => {
    if (split === "device") return t.devices.has(row.key) ? t.devices(row.key) : row.key;
    if (split === "visitorType") return visitor(row.key);
    if (split === "kind") return row.key === NOT_SORTED_KIND ? t.overviewNames("notSorted") : row.key === OTHER_KIND ? t.overviewNames("otherGroups") : row.name ?? row.key;
    return row.key;
  };
  return { names: Object.fromEntries(ANALYTICS_EYE_NAMES.map((key) => [key, t.eyeNames(key)])), rowName, eventName, locale: t.locale };
}
