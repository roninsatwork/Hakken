import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

/**
 * The chains of steps a website's collection runs in, each watched
 * (collection-reliability-plan.md, RR1): Google Analytics' run and its two
 * fills, Search Console's run, its 16-month fill and each of its adding-up
 * jobs.
 */
export const stepChainValidator = v.union(
  v.literal("GA_RUN"),
  v.literal("GA_FILL_DAYS"),
  v.literal("GA_FILL_PAGES"),
  v.literal("SC_RUN"),
  v.literal("SC_FILL"),
  v.literal("SC_SETTLE"),
);
export type StepChain = Infer<typeof stepChainValidator>;

export const collectionStepTables = {
  /**
   * Where one chain of a website's collection stands: the next step's own
   * arguments — its saved place — its booking on the scheduler, which the watch
   * reads, and how often a step at this place has started. One row a chain
   * and website (or adding-up job), written over by each run: it grows with
   * websites, not with time (`collectionSteps.ts`).
   */
  collectionSteps: defineTable({
    /** The chain and what it collects, as `collectionSteps.stepKey` names it. */
    key: v.string(),
    chain: stepChainValidator,
    /** The agent run the chain belongs to: its lines and its liveness. A fill has none. */
    runId: v.optional(v.id("agentRuns")),
    /** Grows with each booking; a step and its watch carry the booking they are for. */
    booking: v.number(),
    /** The step's own arguments, its place saved: what a watch starts again. */
    args: v.any(),
    /** Where the chain is, in plain words: the same place started again counts as another try. */
    place: v.string(),
    /** Steps started at this place: the second goes carefully, the third skips it. */
    tries: v.number(),
    /** Steps the watch started again in this chain, after the platform stopped one. */
    resumes: v.number(),
    bookedAt: v.number(),
    startedAt: v.optional(v.number()),
    /** The step's own booking on the scheduler: whether it is waiting, running, or ended, as Convex says. */
    stepJobId: v.optional(v.id("_scheduled_functions")),
    /** The chain ended, by its own closing; a closed chain's watch does nothing. */
    closedAt: v.optional(v.number()),
    /** Why the watch stopped carrying the chain on, when it did. */
    gaveUp: v.optional(v.string()),
    /** The most memory a step of the chain held, in MB, as it said when saving its place (RR5). */
    peakMb: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_run", ["runId"])
    .index("by_open_booked", ["closedAt", "bookedAt"]),
};
