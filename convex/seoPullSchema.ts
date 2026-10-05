import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The DataForSEO call ledger, kept in a file of its own (moved out of
 * `schema.ts` on 2026-10-04, unchanged, to bring that file back inside its
 * size band — `src/module-size-drift.test.ts`).
 */
export const seoPullTables = {
  /**
   * Every pull Hakken has asked DataForSEO for, and what it cost us.
   *
   * Two jobs in one table, and they need each other:
   *
   *  1. **The task ledger.** Most of what we ask for is queued — we post a
   *     task, DataForSEO answers later on a webhook, and without a row holding
   *     our `tag` there is nothing to match that answer back to.
   *  2. **The cost record.** DataForSEO returns the cost of a call in its own
   *     reply, so the row that tracks the task is also the only place that
   *     honestly knows what it cost.
   *
   * **This is our cost, not a customer's.** Hakken absorbs DataForSEO spend and
   * no client ever sees it; `companyId` is here to answer "which client is
   * expensive to serve", which is a margin question for a super admin, never a
   * line on anyone's bill. Every screen over this table is super-admin-only for
   * that reason.
   *
   * Cost is in **USD**, as DataForSEO reports it. Not converted on the way in:
   * a stored number that was silently converted at an unrecorded rate cannot be
   * checked against an invoice later.
   */
  seoDataPulls: defineTable({
    /** The registry operation asked for — `dataForSeoRegistry.ts` owns the list. */
    operationId: v.string(),
    family: v.string(),
    mode: v.union(v.literal("QUEUED"), v.literal("LIVE")),
    /** The normalised host this was about, when the operation was about a site. */
    target: v.optional(v.string()),
    /** The website record it was about, when the target matched one we hold. */
    websiteId: v.optional(v.id("websites")),
    /**
     * Whose cadence caused this pull. Internal margin reporting only — a shared
     * website is pulled once for everyone watching it, so this names the reason
     * the pull happened, not somebody to charge.
     */
    companyId: v.optional(v.id("companies")),
    /** What was asked, as sent. Kept so a surprising result can be explained. */
    taskArgsJson: v.string(),
    /**
     * Where this pull is in its life.
     *
     * `PENDING` and `CLAIMED` are the queue. A row is created `PENDING` with a
     * `dueAt`, a worker claims it — patching to `CLAIMED` in the same
     * transaction it reads it, so two workers can never hold the same row —
     * and only then is it sent. Claim-before-send is not tidiness: DataForSEO
     * charges at submission, so a row sent twice is paid for twice.
     *
     * This is the same shape the knowledge queue runs on
     * (`claimNextPendingFileInternal` in `knowledge.ts`), deliberately. There
     * is one queue pattern on this platform, not two.
     */
    status: v.union(
      v.literal("PENDING"),
      v.literal("CLAIMED"),
      v.literal("SUBMITTED"),
      v.literal("READY"),
      v.literal("FAILED"),
    ),
    /** Our own matching key, echoed back by DataForSEO in the result. */
    tag: v.string(),
    /**
     * What this pull *is*, so the same question is never bought twice:
     * `operation : websiteId : paramsHash : cycleDate`. Built by
     * `seoIdempotency.ts`, which is the only place allowed to build one.
     *
     * Because billing happens at submission, this key is the difference
     * between a duplicate being untidy and a duplicate being expensive.
     */
    idempotencyKey: v.optional(v.string()),
    /** The collection cycle that planned this pull, when a cycle did. */
    cycleId: v.optional(v.id("seoCollectionCycles")),
    /**
     * The earliest a worker may send this.
     *
     * Set at enqueue as `cycleStart + (index x spacing)`, which is the whole
     * of the rate limiting, the tenant fairness and the thundering-herd
     * protection in this pipeline. A twenty-task tenant clears at once; a
     * five-thousand-task tenant spreads itself over hours; a small tenant
     * queued behind a large one is not stuck, because its rows come due
     * sooner. No scheduler and no fairness algorithm needed.
     */
    dueAt: v.optional(v.number()),
    /** The worker chain holding this row, and when it took it. */
    claimedBy: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    /** Set just before the send: from then on DataForSEO may have it, so it is never sent again. */
    postedAt: v.optional(v.number()),
    /** When its answer was filed into the Sites tables, and how often filing has been tried. */
    filedAt: v.optional(v.number()),
    fileAttempts: v.optional(v.number()),
    /** Sends tried. At `SEO_MAX_ATTEMPTS` the row is FAILED rather than retried. */
    attempts: v.optional(v.number()),
    /** When DataForSEO's pingback told us this was ready. */
    pingedAt: v.optional(v.number()),
    /** Its answer's last fetch that did not bring it, and what came back (reliability plan V1). */
    lastFetch: v.optional(v.object({ at: v.number(), said: v.string() })),
    /**
     * True when the answer was too large to keep even in parts
     * (`MAX_ANSWER_BYTES`): paid for, and nothing could be filed from it.
     */
    rawTruncated: v.optional(v.boolean()),
    /** Rows left off the end of a list answer to keep it inside that ceiling: counted, so it is said. */
    rowsLeftOff: v.optional(v.number()),
    /**
     * What the answer brought back — a list's rows, a crawl's pages crawled —
     * which credits count rather than what was asked for (finish-off-plan.md,
     * item 3). Absent on an answer recorded before 2026-10-05 until the
     * recount (`creditCorrections.ts`) has counted it.
     */
    rowsReturned: v.optional(v.number()),
    /** A list's next page, which has no plan line of its own: the units it put in its collection's credit charge. */
    creditUnits: v.optional(v.number()),
    /**
     * What DataForSEO gave back once the task finished — a crawl's pages not
     * crawled — taken off `costUsd` and everything that holds it, once
     * (`seoCrawlRefund.ts`, finish-off-plan.md item 5).
     */
    refundedUsd: v.optional(v.number()),
    /** The Collector run that sent it, whose cost holds what it was charged. */
    sentByRunId: v.optional(v.id("agentRuns")),
    /**
     * How far a list page's run meant to buy the list, in rows — the everyday
     * check, or the whole list kept when the week's was due: the pages its
     * first answer queues stop there (`queueListPages` in `sitePagedLists.ts`).
     */
    listReach: v.optional(v.number()),
    /** A keyword list page bought on every run as the everyday check, which the monthly estimate prices per run. */
    eachRun: v.optional(v.boolean()),
    /** DataForSEO's task id, once they have given us one. */
    taskId: v.optional(v.string()),
    /** What DataForSEO charged, in USD, as reported by DataForSEO. */
    costUsd: v.number(),
    /** True when this went to the free sandbox and cost nothing. */
    sandbox: v.boolean(),
    /**
     * **Moved out: answers are kept in `seoPullAnswers`.** Kept here, every
     * read of requests carried every answer with it, and a company's answers
     * came to more than one function may read (16 MB, 2026-09-25). A row
     * stored before then keeps its answer until
     * `2026-09-25-answers-off-requests` moves it; `readPullAnswerParts` reads
     * either. Why answers are kept at all, and not in file storage, is on
     * `seoPullAnswers`.
     */
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
    /**
     * Until when a request DataForSEO's supplier refused may be asked again
     * (`SEO_SUPPLIER_RETRY_WAITS_MS`): the end of the Collector run that put
     * it back. Past it the queue fails it rather than send it, because a
     * later run would buy it beside that night's own request.
     */
    retryUntil: v.optional(v.number()),
    /** The agent run that asked, when an agent asked. */
    agentRunId: v.optional(v.id("agentRuns")),
    requestedBy: v.optional(v.id("users")),
    /**
     * When the row was created. Since the queue landed this is no longer the
     * moment it was sent — that is `sentAt` — and the two can be hours apart
     * for a row that waited its turn behind a large tenant.
     */
    submittedAt: v.number(),
    /** When it was actually posted to DataForSEO. Absent while it waits. */
    sentAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_tag", ["tag"])
    .index("by_status_submitted", ["status", "submittedAt"])
    /** The queue's own read: what is pending, in the order it came due. */
    .index("by_status_due", ["status", "dueAt"])
    /** The reuse ladder's read: have we already asked this exact question? */
    .index("by_idempotency", ["idempotencyKey"])
    /** The pingback's read: one task id to one row, or nothing at all. */
    .index("by_task", ["taskId"])
    .index("by_cycle", ["cycleId"])
    /**
     * Whether a collection still has a request in one state, without reading
     * the rest. Scanning `by_cycle` for it read every answer in the
     * collection, and Korda's 149 came to more than a function may read
     * (16 MB) — so its last answer could never be filed, and nothing could
     * close it (2026-09-25).
     */
    .index("by_cycle_status", ["cycleId", "status"])
    /** Answers recorded but never filed, for the hourly re-file (reliability plan 1.11). */
    .index("by_status_filed_completed", ["status", "filedAt", "completedAt"])
    .index("by_submitted", ["submittedAt"])
    .index("by_operation_submitted", ["operationId", "submittedAt"])
    .index("by_company_submitted", ["companyId", "submittedAt"])
    .index("by_website_submitted", ["websiteId", "submittedAt"])
    /** A site's newest pulls of one operation: what the reuse ladder asks. */
    .index("by_website_operation_submitted", ["websiteId", "operationId", "submittedAt"])
    .index("by_run", ["agentRunId"]),

  /**
   * What one website's requests have cost in one collection, kept as they are
   * booked so the limit per website (`seoCollectionLimits.ts`) is one read
   * rather than a sum over the collection's requests.
   */
  seoCycleSpend: defineTable({
    cycleId: v.id("seoCollectionCycles"),
    websiteId: v.id("websites"),
    spentUsd: v.number(),
  }).index("by_cycle_website", ["cycleId", "websiteId"]),
};
