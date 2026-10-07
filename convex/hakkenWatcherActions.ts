"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { gatherInstructions } from "./assistantKnowledge";
import { shiftDay } from "./searchConsoleDays";
import { alertTemplate, checkedAlert, dayWords, type AlertFacts, type AlertWords } from "./utils/hakkenTaskAlerts";
import { TRIAL_DAYS, dayMet, judgeDays, pathOf, settledDay, usualOf, type TaskCondition } from "./utils/hakkenTaskRules";
import { WATCHER, WATCH_STEP } from "./utils/hakkenWatcher";

/**
 * The Hakken Watcher Agent's round (docs/plans/active/hakken-tasks-plan.md,
 * item 1.3): every alert that is due — its owner's time has come — judged on
 * the Search Console days that have settled since it last looked, in plain
 * code; when its rule is met on the newest, the alert's words written through
 * the one brain and checked against the figures, then sent to its owner. A
 * busy morning hands itself on in steps, so nothing waits on a person.
 */

/** Days a check reads at most: a task switched back on after a long pause starts from a week ago. */
const MOST_DAYS_JUDGED = 7;

type CheckOutcome = "ALERTED" | "JUDGED" | "NOTHING_NEW" | "PROBLEM" | "GONE";

async function checkOne(ctx: ActionCtx, taskId: Id<"hakkenTasks">): Promise<CheckOutcome> {
  const task = await ctx.runQuery(internal.hakkenWatcher.taskForCheckInternal, { taskId });
  if (!task) return "GONE";
  if (!task.newestDay) {
    await ctx.runMutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged: [], problem: "Search Console isn't connected." });
    return "PROBLEM";
  }
  const now = Date.now();
  const to = settledDay(now, task.newestDay);
  const first = task.lastJudgedDay ? shiftDay(task.lastJudgedDay, 1) : settledDay(task.createdAt, task.newestDay);
  const from = first < shiftDay(to, 1 - MOST_DAYS_JUDGED) ? shiftDay(to, 1 - MOST_DAYS_JUDGED) : first;
  if (from > to) {
    await ctx.runMutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged: [] });
    return "NOTHING_NEW";
  }

  const read = await ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, { companyId: task.companyId, target: task.target, from, to });
  if (!read.ok) {
    await ctx.runMutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged: [], problem: read.problem });
    return "PROBLEM";
  }
  const days = read.days.map((day) => ({ day: day.day, value: task.measure === "visitors" ? day.clicks : day.impressions }));
  const usual = task.usual ?? usualOf(days.map((day) => day.value));
  const judged = judgeDays(days, task.condition, usual, task.streakBefore);
  const newest = judged.at(-1);
  if (!newest?.tells) {
    await ctx.runMutation(internal.hakkenWatcher.recordCheckInternal, { taskId, judged });
    return "JUDGED";
  }

  const facts: AlertFacts = {
    website: task.target.website,
    ...(task.target.page ? { page: task.target.page } : {}),
    measure: task.measure,
    condition: task.condition,
    day: newest.day,
    value: newest.value,
    usual,
    streak: newest.streak,
  };
  const words = await writeAlert(ctx, task.companyId, task.userId, facts);
  const series = await fourWeeks(ctx, task, newest.day, usual);
  await ctx.runMutation(internal.hakkenWatcher.recordCheckInternal, {
    taskId,
    judged,
    alert: { day: newest.day, headline: words.headline, body: words.body, value: newest.value, ...(usual !== null ? { usual } : {}), ...(series ? { series } : {}) },
  });
  return "ALERTED";
}

/**
 * The four weeks to the alert's day, for the chart in its email (item 3.2):
 * each day's figure — a day Google did not show it counting as none — and
 * whether it met the rule; from where Search Console's history starts, when
 * that is later, so a day before it is never drawn as a quiet one. Nothing
 * when the figures cannot be read: the email goes without its chart rather
 * than not at all.
 */
async function fourWeeks(
  ctx: ActionCtx,
  task: {
    companyId: Id<"companies">;
    target: { companyWebsiteId: Id<"companyWebsites">; website: string; page?: string };
    measure: "visitors" | "impressions";
    condition: TaskCondition;
    oldestDay?: string;
  },
  day: string,
  usual: number | null,
): Promise<{ from: string; values: number[]; met: boolean[] } | null> {
  const fourWeeksBack = shiftDay(day, 1 - TRIAL_DAYS);
  const from = task.oldestDay && task.oldestDay > fourWeeksBack ? task.oldestDay : fourWeeksBack;
  if (from > day) return null;
  const read = await ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, { companyId: task.companyId, target: task.target, from, to: day });
  if (!read.ok) return null;
  const byDay = new Map(read.days.map((entry) => [entry.day, task.measure === "visitors" ? entry.clicks : entry.impressions]));
  const values: number[] = [];
  for (let each = from; each <= day; each = shiftDay(each, 1)) values.push(byDay.get(each) ?? 0);
  return { from, values, met: values.map((value) => dayMet(value, task.condition, usual)) };
}

/**
 * The alert's words, written through the one brain — what Ask Hakken is told,
 * with the Watcher's own part — from the checked figures alone. Words with a
 * number the figures do not hold, or a model that fails, send the template.
 */
async function writeAlert(ctx: ActionCtx, companyId: Id<"companies">, userId: Id<"users">, facts: AlertFacts): Promise<AlertWords> {
  const template = alertTemplate(facts);
  try {
    const instructions = await gatherInstructions(ctx, {
      companyId,
      surface: "COMPANY_CHAT",
      noteFor: userId,
      presentation: "WRITTEN",
      agent: { systemPrompt: WATCHER.systemPrompt, skills: [], alwaysMemories: [] },
    });
    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "fast-chat", companyId });
    const prompt = JSON.stringify({
      task: "Write the alert this person asked for. Reply with only JSON: {\"headline\": a few words, \"body\": one or two sentences}.",
      what: facts.page ? `the page ${pathOf(facts.page)} on ${facts.website}` : `the website ${facts.website}`,
      measure: facts.measure === "visitors" ? "visitors from Google (Search Console clicks)" : "times shown in Google (impressions)",
      day: dayWords(facts.day),
      figureThatDay: facts.value,
      usualDay: facts.usual,
      daysInARow: facts.streak,
      theirRule: facts.condition,
      example: template,
    });
    const response = await generateTextWithResolvedModel({ model, systemInstruction: instructions.systemInstruction, contents: [{ type: "text", text: prompt }] });
    await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
      systemKey: WATCHER.systemKey,
      companyId,
      actionContext: "Writing an alert",
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens: response.inputTokens ?? 0,
      outputTokens: response.outputTokens ?? 0,
      promptContent: prompt,
      responseContent: response.text ?? "",
    });
    return checkedAlert(response.text ?? "", facts) ?? template;
  } catch (error) {
    console.error("The Watcher could not write an alert's words; sending the template", error);
    return template;
  }
}

/** One step of a round: up to `WATCH_STEP` due alerts, then the next step if more are waiting. */
async function watchStep(ctx: ActionCtx): Promise<Record<CheckOutcome, number>> {
  const counts: Record<CheckOutcome, number> = { ALERTED: 0, JUDGED: 0, NOTHING_NEW: 0, PROBLEM: 0, GONE: 0 };
  await ctx.runMutation(internal.hakkenWatcher.ensureWatcherInternal, {});
  if (!(await ctx.runQuery(internal.hakkenWatcher.isWatcherOnInternal, {}))) return counts;
  const due = await ctx.runQuery(internal.hakkenWatcher.dueTasksInternal, { now: Date.now(), limit: WATCH_STEP });
  for (const taskId of due) {
    try {
      counts[await checkOne(ctx, taskId)] += 1;
    } catch (error) {
      // One alert's failure is its own: the next check tries it again.
      console.error("The Watcher could not check an alert", taskId, error);
      counts.PROBLEM += 1;
    }
  }
  if (due.length === WATCH_STEP) await ctx.scheduler.runAfter(0, internal.hakkenWatcherActions.watchDue, {});
  return counts;
}

/** Every quarter of an hour (`jobLedger.ts`): the alerts whose owner's time has come. */
export const watchDue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await watchStep(ctx);
    return null;
  },
});

/** The Run button on the Agents screen: every alert due now, with what it found on the run. */
export const runWatcherNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    try {
      const counts = await watchStep(ctx);
      const summary = `Checked ${counts.ALERTED + counts.JUDGED + counts.NOTHING_NEW} alerts due; ${counts.ALERTED} told their owner; ${counts.PROBLEM} could not be checked.`;
      await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, { runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}), status: "SUCCESS", summary, startedAt });
    } catch (error) {
      await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, {
        runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}), status: "FAILED",
        summary: error instanceof Error ? error.message : "The round failed.", startedAt,
      });
    }
    return null;
  },
});
