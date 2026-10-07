import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { shiftDay } from "./searchConsoleDays";
import { TRIAL_DAYS, settledDay, taskTitle, trialOf, usualOf, type TaskCondition, type TaskMeasure } from "./utils/hakkenTaskRules";
import { taskTimeOfDay } from "./utils/hakkenTaskTiming";

/**
 * The Assistant's Hakken task tools (docs/plans/active/hakken-tasks-plan.md,
 * item 1.2), registered with the rest in `aiToolExecutionService.ts`. None of
 * them changes anything: a new alert, and pausing, resuming or deleting one,
 * are proposed — written onto the reply with two buttons — and happen only
 * when the person taps yes (`hakkenTasks.answerProposal`). So they are reads,
 * a member's to make for their own tasks, and every one is the run's owner's:
 * the person in the conversation, never one the model names.
 */

const NO_COMPANY = { ok: false, problem: "This conversation belongs to no company, so there's nothing to keep an eye on here." };
const NO_PERSON = { ok: false, problem: "Tasks are set up by a signed-in person, in their own conversation." };

const OPS = new Set(["below", "above", "dropBy", "riseBy"]);
const CHANGES: Record<string, "PAUSE" | "RESUME" | "DELETE"> = { pause: "PAUSE", resume: "RESUME", delete: "DELETE" };

function text(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The rule from the model's words, or what is missing from it. */
function ruleOf(args: Record<string, unknown>): { measure: TaskMeasure; condition: TaskCondition } | { problem: string } {
  const measure = (text(args, "measure") ?? "visitors") as TaskMeasure;
  if (measure !== "visitors" && measure !== "impressions") return { problem: "Alerts can watch visitors from Google or how often the page shows up in Google (impressions)." };
  const op = text(args, "when");
  if (!op || !OPS.has(op)) return { problem: "Say when to tell them: below or above a number, or dropBy or riseBy a percentage of its usual day." };
  const value = number(args, "value");
  if (value === undefined || value <= 0) return { problem: "Say the number or percentage the alert is about." };
  if (op === "dropBy" && value > 100) return { problem: "A drop can be at most 100%." };
  const days = Math.min(14, Math.max(1, Math.round(number(args, "days") ?? 1)));
  return { measure, condition: { op: op as TaskCondition["op"], value, days } };
}

export const ASSISTANT_TASK_HANDLERS: Record<string, (input: ToolHandlerExecutionInput) => Promise<unknown>> = {
  /**
   * A new alert, written out for a yes: its website or page, its rule, its
   * time, and — tried on the last four settled weeks before it starts — its
   * usual day and how often it would have told them.
   */
  "assistant.tasks.propose": async (input) => {
    if (!input.companyId) return NO_COMPANY;
    if (!input.userId) return NO_PERSON;
    const website = text(input.args, "website");
    if (!website) return { ok: false, problem: "Say which of the company's websites the alert is for." };
    const rule = ruleOf(input.args);
    if ("problem" in rule) return { ok: false, problem: rule.problem };
    const page = text(input.args, "page");

    const resolved = await input.ctx.runQuery(internal.hakkenTaskFigures.resolveTargetInternal, {
      companyId: input.companyId, website, ...(page ? { page } : {}),
    });
    if (!resolved.ok) return { ok: false, problem: resolved.problem };
    const to = settledDay(Date.now(), resolved.newestDay);
    const from = shiftDay(to, -(TRIAL_DAYS - 1));
    const read = await input.ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, {
      companyId: input.companyId, target: resolved.target, from, to,
    });
    if (!read.ok) return { ok: false, problem: read.problem };

    const days = read.days.map((day) => ({ day: day.day, value: rule.measure === "visitors" ? day.clicks : day.impressions }));
    const usual = usualOf(days.map((day) => day.value));
    const trial = trialOf(days, rule.condition, usual);
    const title = taskTitle({ website: resolved.target.website, ...(resolved.target.page ? { page: resolved.target.page } : {}), measure: rule.measure, condition: rule.condition });
    return {
      ok: true,
      website: resolved.target.website,
      from,
      to,
      link: `/app/search-console/${resolved.target.companyWebsiteId}${resolved.target.page ? "/pages" : ""}`,
      usualDay: usual,
      wouldHaveToldThem: `${trial.tells} of the last ${trial.of} days`,
      note:
        "The task is written out under your reply with two buttons, “Yes, start watching” and “Not now”; nothing starts until they tap yes. In one or two warm sentences, say what you found (its usual day, how often it would have told them) and that they just need to say yes. Don't repeat the task's lines.",
      proposal: {
        action: "CREATE",
        status: "PENDING",
        title,
        measure: rule.measure,
        target: resolved.target,
        condition: rule.condition,
        ...(usual !== null ? { usual } : {}),
        timeOfDay: taskTimeOfDay(text(input.args, "time")),
        channels: { bell: true, email: true, telegram: false },
        trial,
      },
    };
  },

  /** The person's own tasks, with each one's id for a change. */
  "assistant.tasks.list": async (input) => {
    if (!input.companyId) return NO_COMPANY;
    if (!input.userId) return NO_PERSON;
    const tasks = await input.ctx.runQuery(internal.hakkenTasks.listForOwnerInternal, { userId: input.userId, companyId: input.companyId });
    return {
      ok: true,
      tasks: tasks.map((task) => ({ taskId: task.taskId, title: task.title, state: task.state === "ON" ? "on" : task.state === "PAUSED" ? "paused" : "paused: needs them to look at it", time: task.timeOfDay })),
      link: "/app/hakken-tasks",
    };
  },

  /** Pausing, resuming or deleting one of the person's own, written out for a yes. */
  "assistant.tasks.change": async (input) => {
    if (!input.companyId) return NO_COMPANY;
    if (!input.userId) return NO_PERSON;
    const action = CHANGES[text(input.args, "change") ?? ""];
    if (!action) return { ok: false, problem: "Say whether to pause, resume or delete the task." };
    const taskId = text(input.args, "taskId");
    const task = taskId
      ? await input.ctx.runQuery(internal.hakkenTasks.ownTaskInternal, { userId: input.userId, companyId: input.companyId, taskId })
      : null;
    if (!task) return { ok: false, problem: "That isn't one of their tasks. List their tasks first and use its taskId." };
    return {
      ok: true,
      note: "The change is written out under your reply with two buttons; nothing changes until they tap yes. Say so in one short sentence.",
      proposal: { action, status: "PENDING", title: task.title, taskId: task.taskId },
    };
  },
};
