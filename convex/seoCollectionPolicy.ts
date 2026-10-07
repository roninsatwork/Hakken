/**
 * Every number the collection pipeline runs on, and why it is that number.
 *
 * They live together because they are a single sizing decision pulled apart:
 * the page size and the batch size and the spacing are all answers to "how
 * much work can one transaction, one request and one tenant do". Spread
 * through the code they would drift; here they can be read as one paragraph.
 *
 * None of them is a rate limiter in the usual sense. The pipeline has no
 * scheduler and no fairness algorithm — `SEO_DUE_SPACING_MS` does that work by
 * spacing rows out at the moment they are enqueued. See `seoCollection.ts`.
 */

/**
 * Company websites expanded per mutation.
 *
 * A Convex mutation is a bounded transaction, so a company with thousands of
 * websites cannot be expanded in one. Each website may fan out to its
 * competitors and several operations, so a hundred sites is already several
 * hundred writes — comfortable, and small enough that a retry is cheap.
 */
export const SEO_EXPANSION_PAGE = 100;

/**
 * How long one step of the Collector's send keeps sending before it starts the
 * next (docs/plans/active/collection-progress-plan.md, decision 1).
 *
 * A run is one continuous send, as long as the queue: it goes in steps because
 * an action stops at ten minutes. Five minutes leaves room to finish the batch
 * in hand — a live call is waited for up to 130 seconds
 * (`LIVE_REQUEST_TIMEOUT_MS`) — and start the next step. Until 2026-10-05 a run
 * stopped here and the rest waited for the next night's run.
 */
export const SEO_COLLECTOR_STEP_MS = 5 * 60 * 1000;

/**
 * When a step's watch looks to see whether the step was lost.
 *
 * Booked with each step. No action outlives ten minutes, so a step neither
 * finished nor followed by this is gone — a deploy or a restart stopped it —
 * and the watch starts the next one. Never sooner, so a step still working is
 * never doubled.
 */
export const SEO_COLLECTOR_WATCH_MS = 10.5 * 60 * 1000;

/**
 * The longest a step sleeps for the next request to come due: the gaps a
 * collection is spaced by (`SEO_DUE_SPACING_MS`). A longer wait — a supplier's
 * refusal asked again in a minute, two or three — is a step booked for then.
 */
export const SEO_COLLECTOR_SLEEP_MAX_MS = 30 * 1000;

/**
 * How far ahead a step is booked for the next request to come due, rather
 * than the run ending.
 */
export const SEO_COLLECTOR_WAIT_AHEAD_MS = 10 * 60 * 1000;

/**
 * A run moved within this is alive, and a watch that fires — a booked step the
 * platform started late — leaves it be. A step marks its run with every batch;
 * none is quiet this long: a live call is waited for 130 seconds at most.
 */
export const SEO_COLLECTOR_QUIET_MS = 3 * 60 * 1000;

/**
 * How long a request asked again after a supplier's refusal may wait for its
 * next try: the three waits (`SEO_SUPPLIER_RETRY_WAITS_MS`) and room to send.
 */
export const SEO_SUPPLIER_RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Live requests sent at once. A live endpoint takes one task per request, so
 * forty AI questions one after another took four minutes; five at a time take
 * under one (collection-progress-plan.md, decision 2).
 */
export const SEO_LIVE_AT_ONCE = 5;

/**
 * Requests due this long with no Collector sending are started by the hourly
 * check — the last net under the step's watch, never the way anything is
 * normally sent.
 */
export const SEO_WAITING_TOO_LONG_MS = 15 * 60 * 1000;

/**
 * Tasks in one `task_post` request.
 *
 * DataForSEO accepts a list of tasks per request, capped at 100 on the
 * endpoints checked on 2026-09-21. This is what keeps a hundred-thousand-task
 * cycle down to a thousand HTTP calls. Confirm the cap per endpoint before
 * raising it; a request over the cap is refused whole, which would strand a
 * batch.
 */
export const SEO_BATCH_SIZE = 100;

/**
 * How far apart consecutive sends in one cycle are placed.
 *
 * This single number is the rate limiting, the tenant fairness and the
 * thundering-herd protection. A twenty-task tenant clears in five seconds; a
 * five-thousand-task tenant spreads over twenty minutes; and a small tenant
 * enqueued behind a large one is never stuck behind it, because its rows come
 * due sooner than the tail of the large one.
 */
export const SEO_DUE_SPACING_MS = 250;

/**
 * When a claim is assumed dead.
 *
 * A worker claims a batch and then sends it; if the action dies in between,
 * those rows would sit `CLAIMED` forever. Ten minutes is far longer than a
 * send takes and far shorter than a cycle, so the sweep can return them
 * without ever racing a live worker.
 */
export const SEO_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * When a submitted task is given up on.
 *
 * DataForSEO's queued results normally arrive in minutes. Twelve hours means
 * the pingback was lost *and* the task never appeared in `tasks_ready`, which
 * is not a wait any more. The row is marked failed; it is never re-posted,
 * because it was already paid for. A day until 2026-09-25, when Anthony set
 * twelve hours: one site crawl answered late kept Korda's collection open.
 */
export const SEO_RESULT_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Sends tried before a row is failed. The knowledge queue uses three. */
export const SEO_MAX_ATTEMPTS = 3;

/**
 * How long DataForSEO's raw answer is kept (`seoPullAnswers`, apart from the
 * request; never in file storage, which is swept of anything without an
 * upload reservation), then cleared by the hourly sweep.
 *
 * A week, not a month since 2026-10-05 (docs/plans/active/dataforseo-cost-plan.md,
 * A6): what reads it later works well inside it — the hourly re-file of an
 * answer never filed takes it within hours — and a parser bug is caught in
 * days. Filing an answer again, the credit recount
 * (`creditCorrections.recountCollectionCredits`) and reading stored answers
 * again (`siteBackfillRaw`) reach a week back and no further
 * (docs/operator/dataforseo-data-kept.md). The pull row and its cost outlive
 * the answer, because the cost record has to be checkable against an invoice
 * long after the payload is useless.
 */
export const SEO_RAW_RETENTION_DAYS = 7;

/** How long cycles and their lines are kept. One quarter of history. */
export const SEO_CYCLE_RETENTION_DAYS = 90;

/**
 * How long an AI answer's full wording is kept (`aiAnswerTexts`, with the
 * light row that lists it, `aiAnswerIndex`), then cleared by the hourly
 * sweep (docs/plans/active/dataforseo-cost-plan.md, B2): an answer runs to
 * tens of kilobytes. Who it named and cited (`aiAnswers`, `aiCitations`) is
 * kept for ever, and an older answer's screen shows that instead of its words.
 */
export const AI_ANSWER_WORDING_RETENTION_DAYS = 90;

/**
 * How long Google's full results page for a search is kept (`siteSerpPages`),
 * then cleared by the hourly sweep (docs/plans/active/dataforseo-cost-plan.md,
 * B3): a page names up to a hundred websites and addresses. Where the website
 * stood on it (its search's line, `keywordPositionMonths`; `siteKeywordRanks`;
 * and the summary `websiteSearchStats`) is kept, and an older check shows that.
 */
export const SERP_PAGE_RETENTION_DAYS = 90;

/**
 * How long a search's position is kept day by day (its line,
 * `keywordPositionMonths`); a month wholly before it keeps each week's last
 * of each kind, past a year each month's last, and nothing past two years —
 * coarsened by the hourly sweep (`positionHistory.ts`;
 * keep-less-history-plan.md, part 1, Decision 1; dataforseo-cost-plan.md, B1
 * before it). The same point a week's step of a position chart already shows,
 * so only a day's step shows fewer points before it.
 */
export const DAILY_POSITIONS_RETENTION_DAYS = 90;

/**
 * How long the searches an AI answer ran are kept by day (`promptFanOutDays`),
 * then cleared by the hourly sweep: twelve months for the date-based fan-out
 * report when it is built (keep-less-history-plan.md, part 2, Decision 5).
 * The searches themselves (`promptFanOutQueries`) are kept.
 */
export const FAN_OUT_DAYS_RETENTION_DAYS = 365;

/** The first day whose positions are still kept day by day, `YYYY-MM-DD`. */
export function dailyPositionsKeptFrom(today: string): string {
  return keptFrom(today, DAILY_POSITIONS_RETENTION_DAYS);
}

/** The first day still kept, `YYYY-MM-DD`, of what is kept `days` days. */
function keptFrom(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The first day whose answers are still kept word for word, `YYYY-MM-DD`:
 * an answer asked before it shows who it named and cited, not its wording.
 */
export function wordingKeptFrom(today: string): string {
  return keptFrom(today, AI_ANSWER_WORDING_RETENTION_DAYS);
}

/**
 * The first day whose results pages are still kept, `YYYY-MM-DD`: a search
 * last checked before it shows where the website stood, not the page.
 */
export function serpPagesKeptFrom(today: string): string {
  return keptFrom(today, SERP_PAGE_RETENTION_DAYS);
}

/**
 * The backoff a worker waits after DataForSEO pushes back, by attempt.
 *
 * A 429 is not a failure, it is "later" — the rows go back to `PENDING` with a
 * later `dueAt` rather than counting against their attempts as an error would.
 */
export const SEO_BACKOFF_MS = [10_000, 60_000, 300_000] as const;

/**
 * The waits before asking again when DataForSEO's own supplier refused and
 * charged nothing — Google over its limit for DataForSEO, all ten of Ronins'
 * questions to its engine on 2026-09-29 (Anthony: "don't we retry but slower"). A
 * minute, two, then three, inside the Collector's run while the rest of the
 * queue carries on; refused after the last, the request is failed and the next
 * night's run asks again.
 */
export const SEO_SUPPLIER_RETRY_WAITS_MS = [60_000, 120_000, 180_000] as const;

export function seoBackoffMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), SEO_BACKOFF_MS.length - 1);
  return SEO_BACKOFF_MS[index];
}

/**
 * The most sends one cycle may plan.
 *
 * A placeholder for the per-plan keyword allowance, and deliberately a real
 * limit rather than a TODO: a customer adding ten thousand keywords must not
 * be able to set our throughput, and an enforcement point that does not exist
 * yet enforces nothing. When the plan allowance is decided this becomes the
 * fallback for a company with no plan, not a second rule beside it.
 *
 * Hitting it is `CAPPED_PLAN`, which is the customer's own limit and separate
 * from `CAPPED_SPEND`, which is ours. Telling someone to buy more of something
 * that was never the problem is the failure those two statuses avoid.
 */
export const SEO_MAX_SENDS_PER_CYCLE = 25_000;

/**
 * The most competitors a run collects for one website: the top choice of
 * "Competitors collected per website" (`competitorsPerSite` in
 * `fanOutLimits.ts`), which each company and website sets below it.
 *
 * Every one of them is a paid pull at the parent website's own rate, so this
 * is a cost ceiling as much as a transaction one. A hundred rivals against a
 * single site is a plan conversation, not something a cycle should discover
 * halfway through writing itself.
 */
export const SEO_COMPETITORS_PER_WEBSITE = 100;

/**
 * Searches checked for one website in a cycle: every one it may track
 * (`MAX_CANONICAL_ROWS` in `websiteCanonical.ts`) — the two must move
 * together. It was 200 while a website could track 1,000, and the rest were
 * never checked, with nothing to say so (reliability plan 3.6).
 *
 * Each is one paid Google results page per place — but one page serves every
 * host and every company that tracks the same phrase from the same place, and
 * files a position for every known site that appears on it. A page of the
 * work list stops between two searches when it has read its fill, so a
 * thousand is no strain on a transaction.
 */
export const SEO_KEYWORD_CHECKS_PER_WEBSITE = 1_000;

/**
 * How long after a cycle closes its moves are drawn.
 *
 * A cycle closes when its last pull settles, but each answer is parsed after
 * that, in its own action. Drawing the moves the same instant would draw them
 * from the cycle before. Five minutes is long past a parse and short enough
 * that the Brief is current by the time anyone opens it.
 */
export const SEO_MOVES_DELAY_MS = 5 * 60 * 1000;
