import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { chargeTaskWork } from "./hakkenTaskCredits";
import { queueOutboxMessage } from "./outbox";
import { appUrl } from "./outboxTemplates";
import { ensureReaderPreferences } from "./readerPreferences";
import { shiftDay } from "./searchConsoleDays";
import { readList } from "./searchConsoleLists";
import { emailWording } from "./utils/emailWording";
import { REPORT_DAYS, pickPages, signed, type PageChange } from "./utils/hakkenReports";
import { pathOf } from "./utils/hakkenTaskRules";
import { nextRunOf } from "./utils/hakkenTaskTiming";
import { REPORT_STEP, STAT_REPORTER } from "./utils/statReporter";

/**
 * The Stat Report Agent (docs/plans/active/hakken-tasks-plan.md, item 4.1):
 * every quarter of an hour, each report whose owner's day and time have come
 * — its pages read from Search Console's own Pages list over the newest 7 days
 * held against the 7 before, the ones that moved its way picked in plain
 * code — sent to its owner by email and in the bell, then set for next week.
 * A busy morning hands itself on in steps, so nothing waits on a person.
 */

/** Idempotent: the Stat Report Agent, created once and kept in step, never overwriting its switch. */
export const ensureStatReporterInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const definition = {
      name: STAT_REPORTER.name,
      description: STAT_REPORTER.description,
      systemPrompt: STAT_REPORTER.systemPrompt,
      standingObjective: STAT_REPORTER.standingObjective,
    };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", STAT_REPORTER.systemKey)).first();
    if (!existing) {
      await ctx.db.insert("agents", {
        ...definition,
        systemKey: STAT_REPORTER.systemKey,
        modelId: "none (plain code)",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return null;
  },
});

/** Whether it is switched on; it is, until someone switches it off on the Agents screen. */
export const isStatReporterOnInternal = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", STAT_REPORTER.systemKey)).first();
    return agent?.isActive ?? true;
  },
});

/** Reports that are on and due, oldest due first. */
export const dueReportsInternal = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(v.id("hakkenTasks")),
  handler: async (ctx, args) => {
    const due = await ctx.db
      .query("hakkenTasks")
      .withIndex("by_kind_state_next", (q) => q.eq("kind", "REPORT").eq("state", "ON").lte("nextCheckAt", args.now))
      .take(args.limit);
    return due.map((task) => task._id);
  },
});

type ReportPages = { from: string; to: string; pages: PageChange[]; total: number } | null;

/**
 * A report's pages as they stand: the website's Pages list over the newest 7
 * days held against the 7 before, sorted by change its way, and those that
 * moved that way picked. Nothing while the website's figures are not ready.
 * What a report sends, and what the Assistant shows before anyone says yes.
 */
export async function readReportPages(
  ctx: Pick<QueryCtx, "db">,
  companyWebsiteId: Id<"companyWebsites">,
  report: { direction: "lost" | "gained"; count: number },
): Promise<ReportPages> {
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
  if (!connection?.newestDay) return null;
  const to = connection.newestDay;
  const from = shiftDay(to, -(REPORT_DAYS - 1));
  const list = await readList(ctx, companyWebsiteId, {
    searchType: "web", dimension: "page", from, to, sort: "change", direction: report.direction === "lost" ? "asc" : "desc",
  });
  if (list.live || list.preparing || !list.comparable) return null;
  const pages = pickPages(
    list.rows.filter((row) => row.previousClicks !== null).map((row) => ({ page: row.key, now: row.clicks, before: row.previousClicks ?? 0 })),
    report.direction,
    report.count,
  );
  return { from, to, pages, total: pages.reduce((sum, page) => sum + page.change, 0) };
}

/** A report's pages now, for the Assistant's proposal. */
export const reportPreviewInternal = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), direction: v.union(v.literal("lost"), v.literal("gained")), count: v.number() },
  returns: v.union(
    v.null(),
    v.object({ from: v.string(), to: v.string(), total: v.number(), pages: v.array(v.object({ page: v.string(), now: v.number(), before: v.number(), change: v.number() })) }),
  ),
  handler: async (ctx, args) => await readReportPages(ctx, args.companyWebsiteId, args),
});

const sendOutcomeValidator = v.union(v.literal("SENT"), v.literal("NOTHING_YET"), v.literal("GONE"));
type SendOutcome = typeof sendOutcomeValidator.type;

/**
 * One report: its pages from the newest 7 days held, the ones that moved its
 * way, to its owner — an email through the outbox, once for each newest day,
 * and the bell — then set for its next week. A website whose figures are not
 * ready yet waits for next week rather than sending nothing.
 */
export const sendReportInternal = internalMutation({
  args: { taskId: v.id("hakkenTasks") },
  returns: sendOutcomeValidator,
  handler: async (ctx, args): Promise<SendOutcome> => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.state !== "ON" || task.kind !== "REPORT" || !task.report || !task.target) return "GONE";
    const now = Date.now();
    const report = task.report;
    const target = task.target;
    await ctx.db.patch(task._id, { nextCheckAt: nextRunOf(task, now), updatedAt: now });

    const read = await readReportPages(ctx, target.companyWebsiteId, report);
    if (!read) return "NOTHING_YET";
    const { from, to, pages, total } = read;

    const owner = await ctx.db.get(task.userId);
    if (!owner) return "GONE";
    const preferences = await ensureReaderPreferences(ctx, owner._id);
    const language = preferences?.language ?? "en";
    const link = `/app/search-console/${target.companyWebsiteId}/pages`;
    const seen = await ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", task._id).eq("day", to)).first();
    if (!seen) {
      await ctx.db.insert("hakkenTaskChecks", { taskId: task._id, companyId: task.companyId, day: to, value: total, met: pages.length > 0, streak: 0, alerted: true, checkedAt: now });
      // A report sent is counted once for its week, at its price (Credit prices).
      await chargeTaskWork(ctx, {
        kind: "taskReports", runKey: `taskReports:${task._id}:${to}`, companyId: task.companyId, userId: task.userId, how: "scheduled",
        companyWebsiteId: target.companyWebsiteId, detail: task.title,
      }, now);
    }

    if (task.channels.email && owner.email) {
      await queueOutboxMessage(ctx, {
        messageType: "TASK_REPORT",
        userId: owner._id,
        email: owner.email,
        language,
        payload: {
          taskId: task._id, website: target.website, from, to, direction: report.direction, weekday: report.weekday,
          timeOfDay: task.timeOfDay, total, link, pages: pages.map((page) => ({ page: page.page, now: page.now, change: page.change })),
        },
        idempotencyKey: `TASK_REPORT:${task._id}:${to}`,
      });
    }
    if (task.channels.bell && !seen) {
      const words = emailWording(language).taskReport;
      await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
        userId: owner._id,
        companyId: task.companyId,
        kind: "HAKKEN_TASK_REPORT",
        title: words.bellTitle({ weekday: report.weekday }),
        body: words.bellBody({ change: signed(total, emailWording(language).dateLocale), pages: pages.length, direction: report.direction }),
        href: link,
      });
    }
    if (task.channels.telegram && !seen) {
      // A message in their Telegram chat, if they have linked one (item 6.1).
      const locale = emailWording(language).dateLocale;
      const biggest = pages[0];
      await ctx.scheduler.runAfter(0, internal.telegramActions.sendToUserInternal, {
        userId: owner._id,
        text: emailWording(language).telegram.report({
          weekday: report.weekday, total: Math.abs(total).toLocaleString(locale), pages: pages.length, direction: report.direction,
          ...(biggest ? { biggest: { page: pathOf(biggest.page), change: Math.abs(biggest.change).toLocaleString(locale) } } : {}),
          link: `${appUrl()}${link}`,
        }),
      });
    }
    return "SENT";
  },
});

type Counts = Record<SendOutcome | "PROBLEM", number>;

/** One step of a round: up to `REPORT_STEP` due reports, then the next step if more are waiting. */
async function reportStep(ctx: ActionCtx): Promise<Counts> {
  const counts: Counts = { SENT: 0, NOTHING_YET: 0, GONE: 0, PROBLEM: 0 };
  await ctx.runMutation(internal.hakkenStatReporter.ensureStatReporterInternal, {});
  if (!(await ctx.runQuery(internal.hakkenStatReporter.isStatReporterOnInternal, {}))) return counts;
  const due: Id<"hakkenTasks">[] = await ctx.runQuery(internal.hakkenStatReporter.dueReportsInternal, { now: Date.now(), limit: REPORT_STEP });
  for (const taskId of due) {
    try {
      const outcome: SendOutcome = await ctx.runMutation(internal.hakkenStatReporter.sendReportInternal, { taskId });
      counts[outcome] += 1;
    } catch (error) {
      // One report's failure is its own: its next week tries again.
      console.error("The Stat Report Agent could not send a report", taskId, error);
      counts.PROBLEM += 1;
    }
  }
  if (due.length === REPORT_STEP) await ctx.scheduler.runAfter(0, internal.hakkenStatReporter.reportDue, {});
  return counts;
}

/** Every quarter of an hour (`jobLedger.ts`): the reports whose owner's day and time have come. */
export const reportDue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    await reportStep(ctx);
    return null;
  },
});

/** The Run button on the Agents screen: every report due now, with what it did on the run. */
export const runStatReporterNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const startedAt = Date.now();
    const finish = async (status: "SUCCESS" | "FAILED", summary: string) =>
      await ctx.runMutation(internal.wikiStaff.finishStaffRunInternal, {
        runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}), status, summary, startedAt,
      });
    try {
      const counts = await reportStep(ctx);
      await finish("SUCCESS", `Sent ${counts.SENT} ${counts.SENT === 1 ? "report" : "reports"}; ${counts.NOTHING_YET} waited for Search Console's figures; ${counts.PROBLEM} could not be sent.`);
    } catch (error) {
      await finish("FAILED", error instanceof Error ? error.message : "The round failed.");
    }
    return null;
  },
});
