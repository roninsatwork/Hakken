import { defineTable } from "convex/server";
import { v } from "convex/values";

/** What a run is doing now (`DOING` in utils/autoSetupAgent.ts), for the line under the Auto Setup page's bar. */
export const doingValidator = v.union(
  v.literal("READ_PAGES"),
  v.literal("SEARCH_NAMES"),
  v.literal("SEARCH_ASKS"),
  v.literal("WRITE_PROFILE"),
  v.literal("RANKINGS"),
  v.literal("WRITE_LISTS"),
  v.literal("READ_RIVALS"),
  v.literal("NAME_RIVALS"),
);
export const doingNowValidator = v.object({ what: doingValidator, host: v.optional(v.string()), at: v.optional(v.number()), of: v.optional(v.number()) });

/**
 * Auto Setup's runs (docs/plans/active/auto-setup-plan.md, AS3, AS11): one row
 * a company, saying how far its run has got for the company's Websites tab.
 * The run itself — its steps, log lines and costs — is an agent run under the
 * Auto Setup agent, so it reads in Agents like any collector's.
 */
export const autoSetupTables = {
  autoSetupRuns: defineTable({
    companyId: v.id("companies"),
    status: v.union(v.literal("WORKING"), v.literal("DONE"), v.literal("STOPPED")),
    agentRunId: v.optional(v.id("agentRuns")),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    /** Who pressed Auto Setup: what it writes is theirs in the audit trail. */
    pressedBy: v.optional(v.id("users")),
    /** Websites it works through — the company's own, then its rivals — and those done: "4 of 9 websites done". */
    total: v.number(),
    done: v.number(),
    /**
     * Pieces of work the run takes — pages read, web searches, rankings looked
     * up, boxes written — and those done, so the page's bar moves with each
     * (2026-10-19). Missing on runs started before.
     */
    pieces: v.optional(v.number()),
    piecesDone: v.optional(v.number()),
    /** What it is doing now, for the line under the bar: the website, and "3 of 8" while it looks up rivals' rankings. */
    doing: v.optional(doingNowValidator),
    /** The company's own websites still to set up, one a step, then its rivals still to name, eight a step. */
    ownLeft: v.array(v.id("companyWebsites")),
    rivalsLeft: v.array(v.id("companyWebsites")),
    /** Web searches made so far: the run makes at most ten (AS7). */
    webSearches: v.number(),
    /** What it has written so far, added up for its report (board 3). */
    wrote: v.object({
      ownNames: v.number(),
      profiles: v.number(),
      rivalNames: v.number(),
      rivalsKept: v.number(),
      searches: v.number(),
      questions: v.number(),
      company: v.boolean(),
      countries: v.array(v.string()),
    }),
    startedAt: v.number(),
    /** When its last step finished: a run is judged alive by this, never by its start. */
    lastStepAt: v.number(),
    finishedAt: v.optional(v.number()),
    /** What it wrote and what is left for a person, in plain words, once it finished (board 3). */
    report: v.optional(v.string()),
    /** Why it stopped, in plain words, when it did. */
    stopped: v.optional(v.string()),
  }).index("by_company", ["companyId"])
    // Runs still working, for the watch that carries on one whose step was lost.
    .index("by_status_step", ["status", "lastStepAt"]),
};
