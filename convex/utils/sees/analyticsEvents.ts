import { seen, toPage, type Seen } from "../hakkenSees";
import type { EventDetail } from "../analyticsEvents";

/**
 * What Hakken sees on Events and an event's own screen
 * (docs/plans/active/google-analytics-plan.md §18.7, GA30): fixed rules over
 * the figures each screen's query already reads, as `analytics.ts` holds the
 * other Google Analytics screens' — apart to keep each module inside its size.
 * Words under `googleAnalytics.seen.events` and `googleAnalytics.seen.event`;
 * an event goes by Google's own name in `text`, for the screen to name in the
 * reader's words (`{event}`), several joined by commas.
 */

/** Clicks taking people off the website read as worth a sentence in this share of visits or more. */
export const CLICKS_AWAY_SHARE = 0.05;

/** One event of Events' list, as its rules read it. */
export type EventFacts = { eventName: string; times: number; visits: number; counted: boolean };

const timesOf = (rows: readonly EventFacts[], eventName: string) => rows.find((row) => row.eventName === eventName)?.times ?? 0;

/**
 * Events: the conversions that never happened, the share of page views that
 * reached the bottom of the page, clicks taking people off the website (5% of
 * visits or more), and site searches; then try the conversions that never
 * fire, see which links take people away, and what people searched for.
 */
export function eventsSees(rows: readonly EventFacts[], visits: number): Seen {
  if (rows.every((row) => row.times === 0)) return seen([{ code: "none" }]);
  const never = rows.filter((row) => row.counted && row.times === 0).map((row) => row.eventName);
  const scrolls = timesOf(rows, "scroll");
  const views = timesOf(rows, "page_view");
  const click = rows.find((row) => row.eventName === "click" && row.times > 0) ?? null;
  const clicksAway = click && visits > 0 && click.visits / visits >= CLICKS_AWAY_SHARE ? click : null;
  const searches = timesOf(rows, "view_search_results");
  return seen([
    never.length > 0 && { code: "neverFired", text: never.join(","), a: never.length },
    scrolls > 0 && views > 0 && { code: "reachedBottom", a: Math.min(1, scrolls / views), b: scrolls },
    clicksAway && { code: "clicksAway", a: clicksAway.times, b: clicksAway.visits / visits },
    searches > 0 && { code: "searched", a: searches },
  ], [
    never.length > 0 && { code: "tryConversions", text: never.join(","), a: never.length, link: "trackingHealth", to: toPage("tracking-health") },
    clicksAway && { code: "seeLinks", link: "linksClicked", to: toPage("events/event", { key: "click" }) },
    searches > 0 && { code: "seeSearches", link: "wordsSearched", to: toPage("events/event", { key: "view_search_results" }) },
  ]);
}

/** An event's own screen, as its rules read it: its figures, and what it was about by its kind. */
export type EventScreenFacts = {
  eventName: string;
  detail: EventDetail | null;
  times: number;
  timesBefore: number | null;
  people: number;
  /** What it was about, the most first: the links, files, words, depths or videos. */
  about: ReadonlyArray<{ label: string; times: number }>;
  /** The website's page views in the same dates: how far people scrolled is weighed against them. */
  pageViews: number;
};

/** The sentence naming what an event was about most, by its kind. */
const TOP_CODE: Partial<Record<EventDetail, string>> = { linkUrl: "topLink", searchTerm: "topSearch", fileName: "topFile", videoTitle: "topVideo" };

/**
 * An event's own screen (§18.7): how many times, by how many people, and the
 * change; then by its kind — the link clicked most and its share, the words
 * searched most, the share of views reaching the bottom, the file or video
 * most — and, for clicks, open links to other websites in a new tab; for site
 * searches, make sure a page answers the top search.
 */
export function eventSees(facts: EventScreenFacts): Seen {
  const { eventName, detail, times, timesBefore, people, about, pageViews } = facts;
  if (times === 0) return seen([{ code: "neverHappened", text: eventName }]);
  const way = timesBefore === null || timesBefore === 0 ? "new" : times > timesBefore ? "up" : times < timesBefore ? "down" : "same";
  const top = about[0] ?? null;
  const topCode = detail ? TOP_CODE[detail] : undefined;
  return seen([
    way === "new" ? { code: "timesNew", text: eventName, a: times, b: people } : { code: `times.${way}`, text: eventName, a: times, b: people, c: timesBefore ?? 0 },
    detail === "percentScrolled" && pageViews > 0 && { code: "reached", a: Math.min(1, times / pageViews), b: pageViews },
    top && topCode !== undefined && { code: topCode, text: top.label, a: top.times, b: top.times / times },
  ], [
    eventName === "click" && { code: "newTab", link: "allPages", to: toPage("all-pages") },
    detail === "searchTerm" && top && { code: "answerSearch", text: top.label, link: "allPages", to: toPage("all-pages") },
  ]);
}
