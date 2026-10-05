import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Credits: what a company holds, what each piece of work charged it, and what
 * that work really cost us (docs/plans/active/usage-credits-plan.md).
 *
 * Step 1 of that plan is the record alone: every charge is written, with its
 * real cost beside it, and nothing is refused — so the cost audit has real
 * sites to read before any price is set. Only `creditLedger.ts` writes these.
 */

/** The kinds of paid work a price line exists for (`creditKinds.ts`). */
export const creditKindValidator = v.union(
  v.literal("rankings"),
  v.literal("aiAnswers"),
  v.literal("keywordResearch"),
  v.literal("siteAudit"),
  v.literal("backlinks"),
  v.literal("assistant"),
);

export const creditSourceValidator = v.union(v.literal("plan"), v.literal("topup"));

/** Why a statement line that is not plain work was written (`creditCharges.reason`). */
export const creditReasonValidator = v.union(v.literal("raised"), v.literal("recounted"), v.literal("nothingBack"));

/** What a statement line is: work charged, a batch granted or ended, work that failed given back, or work counted again. */
export const creditEntryValidator = v.union(v.literal("charge"), v.literal("grant"), v.literal("ended"), v.literal("refund"), v.literal("recount"));

export const creditTables = {
  /**
   * A batch of a company's credits: the plan's for one month, or one top-up's.
   *
   * Work draws from the open batch that ends soonest, so plan credits — which
   * end with their month — are used before bought ones, which last 12 months.
   * What a batch still holds when it ends is written off as its own line.
   */
  creditBatches: defineTable({
    companyId: v.id("companies"),
    source: creditSourceValidator,
    /** `YYYY-MM`, UTC, for a plan batch: one a month, found by it. */
    month: v.optional(v.string()),
    granted: v.number(),
    left: v.number(),
    startsAt: v.number(),
    endsAt: v.number(),
    state: v.union(v.literal("open"), v.literal("ended")),
    endedAt: v.optional(v.number()),
    /** What it still held when it ended. */
    writtenOff: v.optional(v.number()),
    createdAt: v.number(),
  })
    /** A company's open batches, soonest-ending first: the order credits are drawn in. */
    .index("by_company_state_ends", ["companyId", "state", "endsAt"])
    .index("by_company_month", ["companyId", "month"])
    /** The hourly ending of batches whose time is up. */
    .index("by_state_ends", ["state", "endsAt"]),

  /**
   * The statement: one row per charge, refund, monthly grant or ending.
   *
   * A collection's work is charged one row per website and kind of work, not
   * per request: the row opens when the run plans its first line, gathers the
   * units of every line — bought, or served by a request another company paid
   * for, which is charged in full all the same — and its real cost as requests
   * settle, then closes when the run finishes. Only then are credits taken.
   *
   * `realCostUsd` is what the suppliers charged us for this company's share;
   * `reusedValueUsd` what the data it was served for nothing cost whoever
   * bought it. **Both are super admin only**: no company screen reads them.
   */
  creditCharges: defineTable({
    companyId: v.id("companies"),
    /**
     * A `recount` is a charge's credits counted again once what came back
     * was known after it was charged (finish-off-plan.md, items 3 and 9):
     * credits given back in, or taken out, as a line of its own — the line it
     * corrects is never rewritten.
     */
    entry: creditEntryValidator,
    /** `open` while a run is still gathering; `void` when it closed with nothing to charge. */
    state: v.union(v.literal("open"), v.literal("charged"), v.literal("void")),
    /** When it was charged; for an open run, when it opened. */
    at: v.number(),
    kind: v.optional(creditKindValidator),
    /** For a grant or an ending: which kind of batch. */
    source: v.optional(creditSourceValidator),
    websiteId: v.optional(v.id("websites")),
    /** Who started it, or who set up the schedule that did. */
    userId: v.optional(v.id("users")),
    how: v.union(v.literal("scheduled"), v.literal("byHand"), v.literal("automatic"), v.literal("bought")),
    /** Keywords, answers, pages, links or questions, as the price line counts them. */
    units: v.number(),
    /** Plan lines gathered into this charge, for a collection's run. */
    lines: v.number(),
    /** Units taken back off because their request failed or was never sent. */
    failedUnits: v.number(),
    /** The price line as it stood when the run opened: what it is charged at. */
    price: v.optional(v.object({ credits: v.number(), per: v.number() })),
    creditsOut: v.number(),
    creditsIn: v.number(),
    /** The batches that paid, and how much each. */
    paidFrom: v.array(v.object({ batchId: v.id("creditBatches"), credits: v.number() })),
    /** Credits no batch could cover (docs/plans/active/usage-credits-plan.md, outstanding question 2). */
    owed: v.number(),
    /** Every open batch's credits, less what is owed, once this was written. */
    balanceAfter: v.optional(v.number()),
    realCostUsd: v.number(),
    reusedValueUsd: v.number(),
    /** What it is for, once: `cycle:<id>:<website>:<kind>`, `research:<run>`, `message:<id>`, `pull:<id>`. */
    runKey: v.optional(v.string()),
    cycleId: v.optional(v.id("seoCollectionCycles")),
    agentRunId: v.optional(v.id("agentRuns")),
    messageId: v.optional(v.id("messages")),
    pullId: v.optional(v.id("seoDataPulls")),
    batchId: v.optional(v.id("creditBatches")),
    /** The charge a refund gives back, or a recount counts again. */
    refundOf: v.optional(v.id("creditCharges")),
    /** What a person would call it: the keywords looked up. */
    detail: v.optional(v.string()),
    /**
     * Why a line that is not plain work was written: `raised`, a month's
     * plan credits raised after they were granted (finish-off-plan.md, item
     * 3a); `recounted`, a charge counted again from what came back (item 3);
     * `nothingBack`, a lookup that brought nothing back, given back (item 9).
     * A refund with none is work that failed.
     */
    reason: v.optional(creditReasonValidator),
    /** What it stood at before: a raised batch's credits, or a recounted charge's units. */
    before: v.optional(v.number()),
    /**
     * An open collection run: its lines whose requests are still out. It
     * stays open, when its collection finishes, until each has come back —
     * so what they bring is counted before it is charged (item 3).
     */
    pendingLines: v.optional(v.number()),
    /** A charge counted again since it was charged: the units and credits it stands at now. */
    unitsNow: v.optional(v.number()),
    creditsNow: v.optional(v.number()),
    /** Units the one-off recount (`creditCorrections.ts`) found it owes, not yet written as a recount line. */
    recountUnits: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_company_at", ["companyId", "at"])
    .index("by_run_key", ["runKey"])
    .index("by_cycle_state", ["cycleId", "state"])
    /** Runs left open: closed by the hourly sweep once their collection has nothing in flight. */
    .index("by_state_at", ["state", "at"]),

  /** What a company owes past its last credit, carried until outstanding question 2 says what pays it. */
  creditAccounts: defineTable({
    companyId: v.id("companies"),
    owed: v.number(),
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  /**
   * The price list: one line per kind of work, `credits` for every `per`
   * units. A kind with no row is priced from `DEFAULT_CREDIT_PRICES` — the
   * placeholders the plan was drawn with, until the cost audit.
   */
  creditPrices: defineTable({
    kind: creditKindValidator,
    credits: v.number(),
    per: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_kind", ["kind"]),

  /** The platform's credit settings, one row; absent, the defaults in `creditKinds.ts`. */
  creditSettings: defineTable({
    key: v.literal("platform"),
    /** Credits in a month's plan batch, where the company's plan sets none. */
    planCredits: v.number(),
    /** What one credit covers, in US dollars of real cost (outstanding question 1). */
    creditCoversUsd: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  /**
   * Credits charged per company, month, kind and website: what the Usage
   * screens' totals read, so no screen sums the statement (the rule
   * `seoDayRollups` already keeps). A month is a row per kind and website,
   * not per day as well, so a company's month stays one small read however
   * many websites it watches. `websiteKey` is the website's id, or `none`.
   */
  creditMonthRollups: defineTable({
    companyId: v.id("companies"),
    /** `YYYY-MM`, UTC. */
    month: v.string(),
    kind: creditKindValidator,
    websiteKey: v.string(),
    credits: v.number(),
    runs: v.number(),
    realCostUsd: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_month_kind_site", ["companyId", "month", "kind", "websiteKey"])
    .index("by_company_month", ["companyId", "month"]),

  /**
   * Every company's month, per kind of work: what Admin → Settings → Credit
   * prices reads to set prices from — credits charged, the units they were
   * charged for, what the suppliers charged us (`realCostUsd`) and what
   * sharing saved (`reusedValueUsd`). Six rows a month, whatever the number
   * of companies.
   */
  creditPlatformMonths: defineTable({
    /** `YYYY-MM`, UTC. */
    month: v.string(),
    kind: creditKindValidator,
    credits: v.number(),
    runs: v.number(),
    units: v.number(),
    realCostUsd: v.number(),
    reusedValueUsd: v.number(),
    updatedAt: v.number(),
  }).index("by_month_kind", ["month", "kind"]),

  /** Credits charged per company and day, and how many of them by hand: the Usage chart's days and its pace. */
  creditDayTotals: defineTable({
    companyId: v.id("companies"),
    /** `YYYY-MM-DD`, UTC. */
    day: v.string(),
    credits: v.number(),
    /** Credits for work someone started — a lookup, a question — rather than a schedule. */
    byHand: v.number(),
    updatedAt: v.number(),
  }).index("by_company_day", ["companyId", "day"]),
};
