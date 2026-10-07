import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Hakken tasks: what a person has asked Hakken to keep doing for them
 * (docs/plans/active/hakken-tasks-plan.md). A task is its owner's — set up by
 * a user, seen by that user, and its alerts sent to that user alone; a super
 * admin sees a company's on Admin → Companies. Only `hakkenTasks.ts` writes
 * these.
 */

/** An alert watches a figure; a report is sent on a schedule; research finds out why. Phase 1 builds alerts. */
export const hakkenTaskKindValidator = v.union(v.literal("ALERT"), v.literal("REPORT"), v.literal("RESEARCH"));

/**
 * `ON` runs; `PAUSED` waits for its owner; `NEEDS_YOU` was paused by Hakken
 * because it can no longer work (the Caretaker, Phase 5); `DELETED` is gone
 * from every screen and kept only for the record of what it cost.
 */
export const hakkenTaskStateValidator = v.union(v.literal("ON"), v.literal("PAUSED"), v.literal("NEEDS_YOU"), v.literal("DELETED"));

/** What an alert watches, from Search Console (Phase 1): its clicks, read as visitors from Google, and its impressions. */
export const hakkenTaskMeasureValidator = v.union(v.literal("visitors"), v.literal("impressions"));

/**
 * When an alert's day counts: under or over a number, or down or up by a
 * share of its usual. `days` in a row before it tells its owner.
 */
export const hakkenTaskConditionValidator = v.object({
  op: v.union(v.literal("below"), v.literal("above"), v.literal("dropBy"), v.literal("riseBy")),
  /** A count for below and above; a percentage for dropBy and riseBy. */
  value: v.number(),
  days: v.number(),
});

/** A website of the company's own, and optionally one of its pages. */
export const hakkenTaskTargetValidator = v.object({
  companyWebsiteId: v.id("companyWebsites"),
  website: v.string(),
  page: v.optional(v.string()),
});

/**
 * What a report sends (The Stat Report Agent, item 4.1): the pages of the
 * website that lost, or gained, the most of its measure over the newest 7
 * days held against the 7 before — Search Console's own Pages list — every
 * week on `weekday` (1 Monday … 7 Sunday) at the owner's time.
 */
export const hakkenTaskReportValidator = v.object({
  look: v.literal("pagesChange"),
  direction: v.union(v.literal("lost"), v.literal("gained")),
  /** How many pages: 3 to 10. */
  count: v.number(),
  every: v.literal("week"),
  weekday: v.number(),
});

export const hakkenTaskChannelsValidator = v.object({
  bell: v.boolean(),
  email: v.boolean(),
  telegram: v.boolean(),
});

/**
 * A change the Assistant proposes in a reply, waiting for its owner's tap
 * (item 1.2): a new alert, written out line by line, or pausing, resuming or
 * deleting one of their own. Nothing changes until they answer; the model
 * only proposes. Kept on the reply (`messages.taskProposal`).
 */
export const hakkenTaskProposalValidator = v.object({
  // RESEARCH: "find out why", run once in the background on a yes (item 4.2).
  action: v.union(v.literal("CREATE"), v.literal("PAUSE"), v.literal("RESUME"), v.literal("DELETE"), v.literal("RESEARCH")),
  status: v.union(v.literal("PENDING"), v.literal("DONE"), v.literal("DECLINED")),
  title: v.string(),
  /** The task a change is to, or the task a yes made. */
  taskId: v.optional(v.id("hakkenTasks")),
  measure: v.optional(hakkenTaskMeasureValidator),
  target: v.optional(hakkenTaskTargetValidator),
  condition: v.optional(hakkenTaskConditionValidator),
  /** A report rather than an alert (item 4.1). */
  report: v.optional(hakkenTaskReportValidator),
  /** What to find out, and on which of the company's websites or pages (item 4.2). */
  research: v.optional(v.object({ question: v.string(), website: v.optional(v.string()), page: v.optional(v.string()) })),
  usual: v.optional(v.number()),
  timeOfDay: v.optional(v.string()),
  channels: v.optional(hakkenTaskChannelsValidator),
  /** How often it would have told them over the last four weeks, before they say yes. */
  trial: v.optional(v.object({ tells: v.number(), of: v.number() })),
  answeredAt: v.optional(v.number()),
});

export const hakkenTaskTables = {
  hakkenTasks: defineTable({
    companyId: v.id("companies"),
    /** Its owner: the person who set it up, the only one who sees it in the app and the only one told. */
    userId: v.id("users"),
    kind: hakkenTaskKindValidator,
    state: hakkenTaskStateValidator,
    /** In plain words, as its owner's Hakken tasks page shows it. */
    title: v.string(),
    measure: v.optional(hakkenTaskMeasureValidator),
    target: v.optional(hakkenTaskTargetValidator),
    condition: v.optional(hakkenTaskConditionValidator),
    /** What a report sends, and on which weekday (item 4.1). */
    report: v.optional(hakkenTaskReportValidator),
    /** Its figure's usual day when it was set, for the alert's words ("it usually gets about 23"). */
    usual: v.optional(v.number()),
    /** The owner's local time to hear from Hakken, "09:00", in `timeZone`. */
    timeOfDay: v.string(),
    /** An IANA zone from the owner's browser when they set it ("Europe/London"). */
    timeZone: v.string(),
    channels: hakkenTaskChannelsValidator,
    /** The conversation it was set up in, when there was one. */
    threadId: v.optional(v.id("threads")),
    /** The last Search Console day judged, "2026-10-04". */
    lastJudgedDay: v.optional(v.string()),
    /** The newest day it told its owner about: "Alert sent" while that is its newest day judged. */
    lastAlertedDay: v.optional(v.string()),
    /** When it next runs: its owner's time on the next day. */
    nextCheckAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    pausedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["userId", "companyId", "createdAt"])
    .index("by_company", ["companyId", "createdAt"])
    // Each agent's own due tasks: the Watcher's alerts, the Stat Report Agent's reports.
    .index("by_kind_state_next", ["kind", "state", "nextCheckAt"]),

  /** Every day a task judged, newest last: the figure, whether its rule was met, and whether its owner was told. */
  hakkenTaskChecks: defineTable({
    taskId: v.id("hakkenTasks"),
    companyId: v.id("companies"),
    day: v.string(),
    value: v.optional(v.number()),
    met: v.boolean(),
    /** Days in a row the rule has been met, this one included. */
    streak: v.number(),
    alerted: v.boolean(),
    /** Why a day could not be judged, in plain words. */
    note: v.optional(v.string()),
    checkedAt: v.number(),
  }).index("by_task_day", ["taskId", "day"]),
};
