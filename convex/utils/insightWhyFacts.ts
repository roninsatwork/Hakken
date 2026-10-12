import type { Fact, FactSource, FactUnit } from "./insightFacts";

/**
 * The six tests as facts (docs/plans/active/insights-intelligence-plan.md,
 * phase 8): what the Analyst and the Head of Strategy may name, each figure by
 * its key and filled in from here, so the words on the page say the figures
 * the tests worked out — and the Editor checks them like every other.
 */

type Test = { id: string; verdict: string; part: number | null; figures: Record<string, number | string | null> };
export type WhyView = {
  chosen: { id: string; months: string[]; before: string[] | null; yearAgo: string[] | null } | null;
  figures: { enquiries: { now: number; before: number | null; yearAgo: number | null } } | null;
  why: { compare: "YEAR_AGO" | "BEFORE"; lost: number; split: { counting: number; visits: number; rate: number }; tests: Test[] } | null;
};

const monthEnd = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};

/** A span's first and last day, for a fact's `from` and `to`. */
const spanOf = (months: readonly string[]) => ({ from: `${months[0]}-01`, to: monthEnd(months[months.length - 1]) });

const SOURCE_WORDS: Record<string, string> = {
  GOOGLE: "visits from Google's search",
  AI: "visits from AI assistants",
  OTHER_SEARCH: "visits from the other search engines",
  TYPED: "visits from people typing the address",
  WEBSITES: "visits from other websites",
  SOCIAL: "visits from social media",
  OTHER: "visits from other sources",
};

/** The tests' figures as facts, `why.` first in each key; none without a period and a span to set it against. */
export function whyFacts(view: WhyView): Fact[] {
  const { chosen, why, figures } = view;
  if (!chosen || !why || !figures) return [];
  const thenMonths = why.compare === "YEAR_AGO" ? chosen.yearAgo : chosen.before;
  if (!thenMonths) return [];
  const now = spanOf(chosen.months), then = spanOf(thenMonths);
  const facts: Fact[] = [];
  const add = (key: string, value: unknown, unit: FactUnit, source: FactSource, label: string, span: { from: string; to: string } | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    facts.push({ key: `why.${key}`, value, unit, source, label, ...(span ?? {}) });
  };
  const thenEnquiries = why.compare === "YEAR_AGO" ? figures.enquiries.yearAgo : figures.enquiries.before;
  add("enquiries.now", figures.enquiries.now, "count", "analytics", "enquiries", now);
  add("enquiries.then", thenEnquiries, "count", "analytics", "enquiries", then);
  add("lost", why.lost, "count", "analytics", "fewer enquiries than the period it is set against", now);
  add("split.counting", why.split.counting, "count", "analytics", "of them, enquiries from visitors Analytics no longer counts", now);
  add("split.visits", why.split.visits, "count", "analytics", "of them, enquiries lost to fewer visitors arriving", now);
  add("split.rate", why.split.rate, "count", "analytics", "of them, enquiries lost to fewer visitors enquiring", now);
  const test = (id: string) => why.tests.find((entry) => entry.id === id)?.figures ?? {};
  const counting = test("COUNTING");
  add("share.now", counting.shareNow, "count", "analytics", "people Analytics counts of each 100 Google sends", now);
  add("share.then", counting.shareThen, "count", "analytics", "people Analytics counts of each 100 Google sends", then);
  const market = test("MARKET");
  add("rivals.now", market.rivalsNow, "count", "market", "the rivals' estimated Google visitors, added up", now);
  add("rivals.then", market.rivalsThen, "count", "market", "the rivals' estimated Google visitors, added up", then);
  add("serviceShown.now", market.shownNow, "count", "searchConsole", "times Google showed the service pages", now);
  add("serviceShown.then", market.shownThen, "count", "searchConsole", "times Google showed the service pages", then);
  add("serviceClicks.now", market.clicksNow, "count", "searchConsole", "Google clicks to the service pages", now);
  add("serviceClicks.then", market.clicksThen, "count", "searchConsole", "Google clicks to the service pages", then);
  const rankings = test("RANKINGS");
  add("servicePlace.now", rankings.positionNow, "position", "searchConsole", "the service pages' average place in Google", now);
  add("servicePlace.then", rankings.positionThen, "position", "searchConsole", "the service pages' average place in Google", then);
  if (typeof rankings.bestMonth === "string") add("servicePlace.best", rankings.bestPosition, "position", "searchConsole", "the service pages' best average place", spanOf([rankings.bestMonth]));
  add("pageOne.now", rankings.pageOneNow, "count", "market", "searches on Google's page one, this week (DataForSEO)", null);
  add("pageOne.before", rankings.pageOneBefore, "count", "market", "searches on Google's page one, the week before (DataForSEO)", null);
  const shown = test("SHOWN");
  add("aiOverviews.with", shown.aiWith, "count", "market", "page-one searches showing Google's AI overview", null);
  add("aiOverviews.of", shown.aiOf, "count", "market", "searches on Google's page one", null);
  const sources = test("SOURCES");
  for (const at of [0, 1, 2]) {
    const key = sources[`source${at}`];
    if (typeof key !== "string") continue;
    add(`source.${key}.now`, sources[`source${at}Now`], "count", "analytics", SOURCE_WORDS[key] ?? "visits", now);
    add(`source.${key}.then`, sources[`source${at}Then`], "count", "analytics", SOURCE_WORDS[key] ?? "visits", then);
  }
  const conversion = test("CONVERSION");
  add("rate.now", conversion.rateNow, "percent", "analytics", "visits that enquired", now);
  add("rate.then", conversion.rateThen, "percent", "analytics", "visits that enquired", then);
  add("serviceRate.now", conversion.serviceRateNow, "percent", "analytics", "service-page visits that enquired", now);
  add("serviceRate.then", conversion.serviceRateThen, "percent", "analytics", "service-page visits that enquired", then);
  return facts;
}
