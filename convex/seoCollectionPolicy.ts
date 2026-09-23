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
 * How long one Collector run keeps sending before it hands back.
 *
 * Under Convex's ten-minute ceiling for an action, with room to finish the
 * batch in hand and record the run. Whatever is left waits in the queue for
 * the Collector's next run.
 */
export const SEO_COLLECTOR_RUN_MS = 8 * 60 * 1000;

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
 * DataForSEO's queued results normally arrive in minutes. A day means the
 * pingback was lost *and* the task never appeared in `tasks_ready`, which is
 * not a wait any more. The row is marked failed; it is never re-posted,
 * because it was already paid for.
 */
export const SEO_RESULT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Sends tried before a row is failed. The knowledge queue uses three. */
export const SEO_MAX_ATTEMPTS = 3;

/**
 * How long a raw response is kept in file storage.
 *
 * Long enough to re-parse everything after finding a parser bug, and no
 * longer. The pull row and its cost survive the file, because the cost record
 * has to be checkable against an invoice long after the payload is useless.
 */
export const SEO_RAW_RETENTION_DAYS = 30;

/** How long cycles and their lines are kept. One quarter of history. */
export const SEO_CYCLE_RETENTION_DAYS = 90;

/**
 * The backoff a worker waits after DataForSEO pushes back, by attempt.
 *
 * A 429 is not a failure, it is "later" — the rows go back to `PENDING` with a
 * later `dueAt` rather than counting against their attempts as an error would.
 */
export const SEO_BACKOFF_MS = [10_000, 60_000, 300_000] as const;

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
 * Competitors collected for one website in a cycle.
 *
 * Every one of them is a paid pull at the parent website's own rate, so this
 * is a cost ceiling as much as a transaction one. A hundred rivals against a
 * single site is a plan conversation, not something a cycle should discover
 * halfway through writing itself.
 */
export const SEO_COMPETITORS_PER_WEBSITE = 100;

/**
 * Searches checked for one website in a cycle.
 *
 * Each is one paid Google results page per place — but one page serves every
 * host and every company that tracks the same phrase from the same place, and
 * files a position for every known site that appears on it. So this bounds
 * what one website can add to a cycle, not what the platform pays per client.
 * A host with more searches than this is a plan conversation.
 */
export const SEO_KEYWORD_CHECKS_PER_WEBSITE = 200;

/**
 * Lines one expansion mutation may write before it stops and carries on in
 * the next.
 *
 * `SEO_EXPANSION_PAGE` bounds websites, not what each one fans out to: a
 * hundred sites with two hundred searches and a dozen questions each is tens
 * of thousands of writes, far past what one transaction may hold. So a page
 * also stops once it has written this many lines, and the cursor carries on
 * from the last website it finished — never mid-website, so a site's lines
 * are always written together.
 */
export const SEO_PAGE_LINE_BUDGET = 2_000;

/**
 * How long after a cycle closes its moves are drawn.
 *
 * A cycle closes when its last pull settles, but each answer is parsed after
 * that, in its own action. Drawing the moves the same instant would draw them
 * from the cycle before. Five minutes is long past a parse and short enough
 * that the Brief is current by the time anyone opens it.
 */
export const SEO_MOVES_DELAY_MS = 5 * 60 * 1000;

/**
 * How old an answer a manual (Planner) collection will reuse: one hour. A scheduled
 * run reuses anything its own cadence still calls fresh; a person pressing the
 * button wants today's numbers, and this only stops a double press paying twice.
 */
export const SEO_MANUAL_FRESH_MS = 60 * 60 * 1000;
