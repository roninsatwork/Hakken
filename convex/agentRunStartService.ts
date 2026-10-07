import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isDataForSeoRole, isNewsRole, isResearchRole, isSearchConsoleRole } from "./utils/agentRoles";
import { WIKI_STAFF } from "./wikiStaff";
import { TRANSLATOR } from "./utils/contentTranslator";
import { WATCHER } from "./utils/hakkenWatcher";
import { STAT_REPORTER } from "./utils/statReporter";

/**
 * How an agent's run starts, once its run record exists: the one decision the
 * Run button (`scheduler.manualRunSchedule`) and a schedule
 * (`workflowEngine.scheduleDispatcher`) both make, so the two cannot drift.
 *
 * They did drift. The Run button learned that a wiki agent's run is its round
 * (`wikiStaffRunActions.ts`: on the model loop the staff "produced a paragraph
 * of text and changed nothing") and that a DataForSEO agent's run is its
 * role's fixed job (`seoAgentRuns.ts`). The schedule path kept sending both to
 * the model. The Collector's schedule was caught on 2026-09-24, when it woke at
 * 09:00 to ask a model that was not there and collected nothing; the wiki
 * staff had the same gap until 2026-09-25, found before any of them had a
 * schedule.
 *
 * - A wiki agent does its round over every wiki, with no model call about it.
 * - A DataForSEO agent does its role's fixed job, with no model call.
 * - The Keyword research agent buys what its lookups wait for (`keywordResearchRun.ts`).
 * - A News agent — the News Collector, the Weekly Digest, the Email Sender —
 *   does its role's fixed job (`newsAgentRunActions.ts`). Until 2026-10-01
 *   every role that could be given went to the DataForSEO job.
 * - The Translator translates whatever is still missing (`contentTranslation.ts`).
 * - Every other agent is given its objective on the model loop.
 */
export type AgentRunStart = "WIKI_ROUND" | "SEO_JOB" | "RESEARCH_JOB" | "NEWS_JOB" | "SEARCH_CONSOLE_JOB" | "TRANSLATION_ROUND" | "WATCH_ROUND" | "REPORT_ROUND" | "MODEL";

export async function startAgentRun(
  ctx: Pick<MutationCtx, "scheduler">,
  args: {
    agent: Pick<Doc<"agents">, "_id" | "systemKey">;
    runId: Id<"agentRuns">;
    workflowExecutionId: Id<"workflowExecutions">;
    /** What the agent is told; only the model loop reads it. */
    objective: string;
    triggerType: "MANUAL" | "SCHEDULE";
    scheduleId?: Id<"schedules">;
    /** The workspace the run belongs to — the model loop's tools are scoped to it. */
    companyId?: Id<"companies">;
    userId?: Id<"users">;
  },
): Promise<AgentRunStart> {
  const { agent, runId, workflowExecutionId } = args;

  const staff = WIKI_STAFF.find((member) => member.systemKey === agent.systemKey);
  if (staff) {
    await ctx.scheduler.runAfter(0, internal.wikiStaffRunActions.runStaffNow, {
      systemKey: staff.systemKey,
      runId,
      workflowExecutionId,
    });
    return "WIKI_ROUND";
  }

  if (agent.systemKey === TRANSLATOR.systemKey) {
    await ctx.scheduler.runAfter(0, internal.contentTranslationActions.runTranslatorNow, { runId, workflowExecutionId });
    return "TRANSLATION_ROUND";
  }

  // The Hakken Watcher Agent: every alert due now (hakken-tasks-plan.md, item 1.3).
  if (agent.systemKey === WATCHER.systemKey) {
    await ctx.scheduler.runAfter(0, internal.hakkenWatcherActions.runWatcherNow, { runId, workflowExecutionId });
    return "WATCH_ROUND";
  }

  // The Stat Report Agent: every report due now (item 4.1).
  if (agent.systemKey === STAT_REPORTER.systemKey) {
    await ctx.scheduler.runAfter(0, internal.hakkenStatReporter.runStatReporterNow, { runId, workflowExecutionId });
    return "REPORT_ROUND";
  }

  if (isDataForSeoRole(agent.systemKey)) {
    await ctx.scheduler.runAfter(0, internal.seoAgentRuns.runSeoRoleNow, {
      role: agent.systemKey,
      runId,
      workflowExecutionId,
    });
    return "SEO_JOB";
  }

  if (isResearchRole(agent.systemKey)) {
    await ctx.scheduler.runAfter(0, internal.keywordResearchRun.runKeywordResearchNow, { runId, workflowExecutionId });
    return "RESEARCH_JOB";
  }

  if (isNewsRole(agent.systemKey)) {
    await ctx.scheduler.runAfter(0, internal.newsAgentRunActions.runNewsRoleNow, {
      role: agent.systemKey,
      runId,
      workflowExecutionId,
    });
    return "NEWS_JOB";
  }

  if (isSearchConsoleRole(agent.systemKey)) {
    await ctx.scheduler.runAfter(0, internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId, workflowExecutionId });
    return "SEARCH_CONSOLE_JOB";
  }

  await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
    agentId: agent._id,
    objective: args.objective,
    triggerType: args.triggerType,
    runId,
    ...(args.scheduleId ? { scheduleId: args.scheduleId } : {}),
    workflowExecutionId,
    companyId: args.companyId,
    userId: args.userId,
  });
  return "MODEL";
}
