import { seen, toPage, type Seen } from "../hakkenSees";

/**
 * What Hakken sees on Live (docs/plans/active/google-analytics-plan.md §18.7,
 * GA34): fixed rules over the live figures the page has just been given,
 * worked out with them each minute and never kept. Words under
 * `googleAnalytics.seen.live`.
 */

export type LiveFacts = {
  /** People on the website in the last 5 minutes, and in the last 30. */
  now: number;
  people: number;
  /** The page most of them are on, by its title, and how many; null without one. */
  topPage: { title: string; people: number } | null;
  /** The newest conversion in the last 30 minutes, and how many minutes ago; null without one. */
  conversion: { eventName: string; minutesAgo: number } | null;
};

/**
 * Live: how many are on the website now, and the page most of them are on; a
 * conversion in the last 30 minutes, and how long ago; "Nobody is on the
 * website right now" when none. Then see today's conversions, when one
 * happened.
 */
export function liveSees(facts: LiveFacts): Seen {
  const { now, people, topPage, conversion } = facts;
  return seen([
    now === 0 && people === 0 ? { code: "nobody" }
      : now === 0 ? { code: "quietNow", a: people }
        : topPage && topPage.people > 0 ? { code: "onNow", a: now, b: topPage.people, text: topPage.title } : { code: "onNowOnly", a: now },
    conversion && { code: "converted", text: conversion.eventName, a: conversion.minutesAgo },
  ], [
    conversion && { code: "seeConversions", link: "conversions", to: toPage("conversions") },
  ]);
}
