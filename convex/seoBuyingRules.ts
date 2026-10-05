import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";

/**
 * What a collection buys for which website, and how long an answer it bought
 * is served before the same thing is bought again
 * (docs/plans/active/finish-off-plan.md, items 6, 6a, 6b and 6c, agreed with
 * Anthony on 2026-10-05).
 *
 * Pure and in one place, because four things must agree on it: the planner
 * that buys (`seoCollection.ts`, with `seoHeldAnswers.ts`), the door an agent
 * buys through by hand (`seoTools.requestSeoPull`), and the two forecasts
 * (`seoRunEstimate.ts` for Runs and cost, `creditUsage.ts` for Usage → Coming
 * up). A forecast that priced a rule the planner no longer follows would
 * overstate every company's bill.
 */

export const DAY_MS = 86_400_000;

/** The site crawl behind the Site audit (`dataForSeoCrawlOperations.ts`). */
export const CRAWL_OPERATION_ID = "site_crawl";

/** A crawl is bought once a month. */
export const CRAWL_EVERY_DAYS = 30;

/**
 * The least a crawl is held for, whatever starts the collection — Collect now
 * included (Anthony, 2026-10-05: competitors are not crawled, and a company's
 * own websites "once every 30 days whatever starts it").
 *
 * Twenty-six days, not thirty to the hour: a company collecting monthly runs
 * on the same date each month, 28 to 31 days after the crawl it bought, and
 * that crawl was answered some minutes after its run began — held a full
 * thirty days from its answer, every month of thirty days or fewer would skip
 * its crawl and buy the next one two months on (the fault fixed on
 * 2026-09-25). Twenty-six keeps one crawl a month on every schedule and never
 * two inside one.
 */
export const CRAWL_HELD_DAYS = 26;

/** Whether a kind of request is the site crawl. */
export function isCrawl(operationId: string): boolean {
  return operationId === CRAWL_OPERATION_ID;
}

/**
 * What a competitor (a tracked hold, `isTrackedHold`) is bought: only what
 * benchmarking needs (finish-off plan, item 6b, agreed with Anthony on
 * 2026-10-05). Its keyword totals and its link totals, every run — the trend
 * charts' points; its linking websites ("we don't need every backlink for a
 * competitor, just the linking domains"); and its keyword list's top 1,000
 * ("happy with 1,000"). Where it ranks for the company's tracked searches and
 * whether the AI engines name it come free, from the company's own searches
 * and questions.
 *
 * Not bought for a competitor: the crawl, which feeds only a company's own
 * websites' Site audit, page list and AI search checks (item 6 — on
 * 2026-10-05 about $5.19 of the $5.21 that day's crawls really cost was
 * competitors'); every link, one link per website, broken links, links gained
 * and lost, the words links use and the servers they come from; and who
 * competes with it.
 */
const BOUGHT_FOR_COMPETITORS = new Set([
  "domain_ranked_keywords",
  KEYWORD_LIST_OPERATION_ID,
  "backlinks_summary",
  "referring_domains_list",
]);

/** Whether a kind of request is bought for a competitor. */
export function boughtForCompetitor(operationId: string): boolean {
  return BOUGHT_FOR_COMPETITORS.has(operationId);
}

/** A competitor's keyword list: its first thousand rows, the ones bringing it most visits. */
export const COMPETITOR_KEYWORD_ROWS = 1_000;

/**
 * A competitor's keyword list is bought once a month (item 6c), not at the
 * list's own weekly cadence — the company's own website keeps that, and its
 * everyday first pages.
 */
export const COMPETITOR_KEYWORD_LIST_DAYS = 30;

/** Whether a competitor's list stops at its first page: the keyword list's top 1,000. */
export function competitorFirstPageOnly(operationId: string): boolean {
  return operationId === KEYWORD_LIST_OPERATION_ID;
}

/**
 * A request's own cadence for this website, in days: the registry's, except a
 * competitor's keyword list, bought monthly. Undefined for a request bought
 * at the company's cadence.
 */
export function ownDaysFor(operation: { id: string; refresh?: { everyDays: number } }, competitor: boolean): number | undefined {
  if (competitor && operation.id === KEYWORD_LIST_OPERATION_ID) return COMPETITOR_KEYWORD_LIST_DAYS;
  return operation.refresh?.everyDays;
}

/** The operation as bought for this website: with a competitor's own cadence where it differs. */
export function asBoughtFor<Operation extends { id: string; refresh?: { everyDays: number } }>(operation: Operation, competitor: boolean): Operation {
  const everyDays = ownDaysFor(operation, competitor);
  return everyDays === operation.refresh?.everyDays ? operation : { ...operation, refresh: everyDays === undefined ? undefined : { everyDays } };
}

/**
 * Whether a company whose runs come every `runDays` buys a call with its own
 * cadence of `ownDays` on every run: it collects about as seldom as the call,
 * or more seldom — a monthly company and a monthly list, a weekly one and a
 * weekly list — so every run is due one, however the months fall.
 */
export function collectsEveryRun(ownDays: number, runDays: number): boolean {
  return runDays >= ownDays * 0.9;
}

/** How a run asks: how far apart its website's runs come, and whether a person started it. */
export type Asker = {
  /** Days between the website's runs, from its schedule's cadence. */
  runDays: number;
  /** Collect now: a run started by hand, outside the schedule. */
  manual?: boolean;
  /**
   * A page of the keyword list bought on every run as the website's everyday
   * check (`sitePagedLists.ts`, `everyRun`): bought at the run's cadence,
   * whatever the list's own.
   */
  everyRunPage?: boolean;
};

/** The least a Collect now holds anything for: pressed twice in a day, it buys once. */
export const MANUAL_HELD_DAYS = 1;

/**
 * How many days an answer this website already has is served instead of the
 * same request being bought again. `ownDays` is the request's own cadence
 * (`refresh.everyDays`) when it has one.
 *
 * **Nothing is bought again while it is fresh** (finish-off plan, item 6a,
 * agreed with Anthony on 2026-10-05): an answer is served while it is younger
 * than half the cadence it is bought at — its own cadence, or the company's
 * when that is slower, or the company's alone for a request with none. So a
 * Monthly company's run reuses anything under about 15 days old, a Weekly
 * one anything under 3½ days, a Daily one under 12 hours; and Collect now
 * holds anything for at least a day, so pressed twice in a day it buys once.
 * Before it, a Monthly company's run bought everything again — 5 October's
 * Collect now would have been bought again on 15 October — and a second
 * Collect now the same day bought everything twice (about $31 on 2026-10-05).
 *
 * On top of that, as before:
 * - **The crawl**: at least `CRAWL_HELD_DAYS`, whatever starts the run, and on
 *   a faster schedule until the run nearest thirty days.
 * - **A request with its own cadence**: until it is within half a run of due,
 *   so it is bought on the run nearest its cadence (`repeatDays` in
 *   `seoRunEstimate.ts`).
 *
 * Google's results for the tracked searches and the AI engines' answers are
 * not held here: they are bought on every scheduled run, keyed by the day
 * (`seoIdempotency.ts`), so only a run the same day — Collect now pressed
 * again — is served the day's answer.
 *
 * With no asker — the ad hoc door, which has no runs — its whole cadence.
 */
export function heldForDays(operationId: string, ownDays: number | undefined, asker?: Asker): number {
  if (!asker) return ownDays ?? 0;
  if (isCrawl(operationId)) return Math.max(CRAWL_HELD_DAYS, (ownDays ?? CRAWL_EVERY_DAYS) - asker.runDays / 2);
  const own = asker.everyRunPage ? undefined : ownDays;
  const byOwnCadence = own !== undefined && !collectsEveryRun(own, asker.runDays) ? own - asker.runDays / 2 : 0;
  const fresh = Math.max(own ?? 0, asker.runDays) / 2;
  return Math.max(byOwnCadence, fresh, asker.manual ? MANUAL_HELD_DAYS : 0);
}

/**
 * Whether a request with its own cadence is bought on every run of this
 * asker, so one still on its way is shared whatever its age: the company
 * collects as seldom as the request, or it is an everyday page. Never the
 * crawl, which is held a month.
 */
export function boughtEveryRun(operationId: string, ownDays: number, asker: Asker): boolean {
  return !isCrawl(operationId) && (asker.everyRunPage === true || collectsEveryRun(ownDays, asker.runDays));
}
