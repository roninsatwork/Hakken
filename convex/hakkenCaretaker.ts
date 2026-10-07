import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { holdQuestion, holdSearch } from "./holdLists";
import { readerPreferencesOf } from "./readerPreferences";
import { newestWholeDay, shiftDay } from "./searchConsoleDays";
import { resolvePlatformName } from "./settingsService";
import { CARETAKER } from "./utils/hakkenCaretaker";
import { emailWording } from "./utils/emailWording";

/**
 * The Caretaker Agent (docs/plans/active/hakken-tasks-plan.md, Phase 5): once a
 * day it looks at every task that is on and pauses the ones that can no
 * longer work — their website gone, Search Console disconnected or silent,
 * their page not shown in Google for four weeks, their question or search no
 * longer tracked, or the same task twice — as Needs you, and tells their
 * owner in the bell what happened and what to do. Turning one back on is one
 * tap on Hakken tasks, once it is fixed. Plain code; no model.
 */

export type NeedsYouReason = NonNullable<Doc<"hakkenTasks">["needsYou"]>["reason"];

/** Search Console's newest day this far behind its newest whole day: no figures are coming in. */
const SILENT_DAYS = 10;
/** A page not shown in Google on any of its owner's checks for this many days: gone, or moved. */
const PAGE_GONE_DAYS = 28;
/** Tasks looked at in one step of the sweep; the next step follows on its own. */
const CARE_STEP = 50;

/** Why a task can no longer work, or null while it can. */
export async function problemOf(ctx: Pick<QueryCtx, "db">, task: Doc<"hakkenTasks">, now: number): Promise<NeedsYouReason | null> {
  if (!task.target) return null;
  const hold = await ctx.db.get(task.target.companyWebsiteId);
  if (!hold || hold.companyId !== task.companyId) return "WEBSITE_GONE";
  if (task.answer) {
    const question = await holdQuestion(ctx, hold._id, task.answer.prompt);
    return question?.isActive ? null : "QUESTION_GONE";
  }
  if (task.ranking) {
    const search = await holdSearch(ctx, hold._id, task.ranking.keyword);
    return search?.isActive ? null : "SEARCH_GONE";
  }
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
    .first();
  if (connection?.status !== "CONNECTED") return "NOT_CONNECTED";
  if (connection.newestDay && connection.newestDay < shiftDay(newestWholeDay(now), -SILENT_DAYS)) return "NO_FIGURES";
  if (task.target.page) {
    const checks = await ctx.db
      .query("hakkenTaskChecks")
      .withIndex("by_task_day", (q) => q.eq("taskId", task._id))
      .order("desc")
      .take(PAGE_GONE_DAYS);
    if (checks.length >= PAGE_GONE_DAYS && checks.every((check) => check.value === 0)) return "PAGE_GONE";
  }
  return null;
}

/** An older task of the same owner that is on and says the same: this one is the same task twice. */
async function isDuplicate(ctx: Pick<QueryCtx, "db">, task: Doc<"hakkenTasks">): Promise<boolean> {
  const theirs = await ctx.db
    .query("hakkenTasks")
    .withIndex("by_owner", (q) => q.eq("userId", task.userId).eq("companyId", task.companyId))
    .take(300);
  return theirs.some((other) => other._id !== task._id && other.state === "ON" && other.title === task.title && other._creationTime < task._creationTime);
}

/** Paused as Needs you, and its owner told in the bell, in their own language. */
async function pauseForOwner(ctx: MutationCtx, task: Doc<"hakkenTasks">, reason: NeedsYouReason, now: number): Promise<void> {
  await ctx.db.patch(task._id, { state: "NEEDS_YOU", needsYou: { reason, since: now }, nextCheckAt: undefined, pausedAt: now, updatedAt: now });
  const { language } = await readerPreferencesOf(ctx, task.userId);
  const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
  const words = emailWording(language).caretaker;
  await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
    userId: task.userId,
    companyId: task.companyId,
    kind: "HAKKEN_TASK_NEEDS_YOU",
    title: words.title({ title: task.title }),
    body: words.body({
      reason,
      website: task.target?.website ?? "",
      page: task.target?.page ?? "",
      prompt: task.answer?.prompt ?? "",
      keyword: task.ranking?.keyword ?? "",
      platformName,
    }),
    href: "/app/hakken-tasks",
  });
}

/**
 * One step of the sweep: the next tasks of a kind that are on, each looked at
 * and the ones that can no longer work paused; then the next step, or the
 * next kind, until every task has been looked at.
 */
export const careStepInternal = internalMutation({
  args: { kind: v.union(v.literal("ALERT"), v.literal("REPORT")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ looked: v.number(), paused: v.number() }),
  handler: async (ctx, args): Promise<{ looked: number; paused: number }> => {
    const now = Date.now();
    const page = await ctx.db
      .query("hakkenTasks")
      .withIndex("by_kind_state_next", (q) => q.eq("kind", args.kind).eq("state", "ON"))
      .paginate({ cursor: args.cursor, numItems: CARE_STEP });
    let paused = 0;
    for (const task of page.page) {
      const reason = (await problemOf(ctx, task, now)) ?? ((await isDuplicate(ctx, task)) ? "DUPLICATE" : null);
      if (!reason) continue;
      await pauseForOwner(ctx, task, reason, now);
      paused += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.hakkenCaretaker.careStepInternal, { kind: args.kind, cursor: page.continueCursor });
    } else if (args.kind === "ALERT") {
      await ctx.scheduler.runAfter(0, internal.hakkenCaretaker.careStepInternal, { kind: "REPORT", cursor: null });
    }
    return { looked: page.page.length, paused };
  },
});

/** Idempotent: the Caretaker Agent, created once and kept in step — its name from the platform's — never overwriting its switch. */
export const ensureCaretakerInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    const definition = { name: CARETAKER.nameFor(platformName), description: CARETAKER.description, systemPrompt: CARETAKER.systemPrompt, standingObjective: CARETAKER.standingObjective };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", CARETAKER.systemKey)).first();
    if (!existing) {
      await ctx.db.insert("agents", { ...definition, systemKey: CARETAKER.systemKey, modelId: "none (plain code)", thinkingMode: false, isActive: true, isGlobal: true, createdAt: now, updatedAt: now });
    } else if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return null;
  },
});

/** Whether it is switched on; it is, until someone switches it off on the Agents screen. */
export const isCaretakerOnInternal = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", CARETAKER.systemKey)).first();
    return agent?.isActive ?? true;
  },
});

/** Once a day (`jobLedger.ts`), and on the Agents screen's Run button: the sweep, from its first step. */
export const careForTasks = internalAction({
  args: { runId: v.optional(v.id("agentRuns")), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.hakkenCaretaker.ensureCaretakerInternal, {});
    const on = await ctx.runQuery(internal.hakkenCaretaker.isCaretakerOnInternal, {});
    if (on) await ctx.runMutation(internal.hakkenCaretaker.careStepInternal, { kind: "ALERT", cursor: null });
    if (args.runId) {
      await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, {
        runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        status: "SUCCESS", summary: on ? "Looking at every task that is on; any that can no longer work are paused, and their owners told." : "Switched off, so nothing was looked at.", startedAt,
      });
    }
    return null;
  },
});
