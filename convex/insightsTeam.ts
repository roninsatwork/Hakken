import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { isTrackedHold } from "./utils/websitePairing";
import { INSIGHTS_LEAD_ROLE, INSIGHTS_ROLES, type InsightsRole } from "./utils/agentRoles";
import { LEAD_LIMIT_USD, TEAM_AGENTS, TEAM_SCHEDULE } from "./utils/insightTeam";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { startRoleRun } from "./roleRuns";
import { factValidator } from "./utils/insightFacts";
import { insightSpecialistValidator, insightSureValidator } from "./insightsSchema";

/**
 * The Insights team's records (docs/plans/active/insights-analyst-plan.md
 * §6, §8): who is on the team, which websites its weekly run reads, each
 * website's run, and the week it saves. The run itself is
 * `insightsRun.ts`; the screens' reads are `insightsReads.ts`.
 */

/** A role's agent, as the run uses it: its model, its instructions, its limit. */
const memberValidator = v.object({
  role: v.string(),
  agentId: v.id("agents"),
  name: v.string(),
  isActive: v.boolean(),
  requestedModelId: v.optional(v.string()),
  instructions: v.string(),
  maxCostUsd: v.optional(v.number()),
  mode: v.union(v.literal("TEST"), v.literal("LIVE")),
});

const websiteValidator = v.object({ holdId: v.id("companyWebsites"), companyId: v.id("companies"), host: v.string() });

/** Connections read a page at a time when listing every connected website. */
const CONNECTIONS_PER_READ = 500;

/**
 * The team, and the websites its run reads: every owned website with Search
 * Console or Google Analytics connected (I16). In Test — the Head of
 * Strategy's mode until set Live — only the companies a super admin is
 * working in, so the findings are seen before any customer's (I19).
 */
export const teamSetup = internalQuery({
  args: {},
  returns: v.object({ members: v.array(memberValidator), websites: v.array(websiteValidator) }),
  handler: async (ctx) => {
    const members: Array<typeof memberValidator.type> = [];
    for (const role of INSIGHTS_ROLES) {
      const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
      if (!agent) continue;
      members.push({
        role,
        agentId: agent._id,
        name: agent.name,
        isActive: agent.isActive,
        ...(agent.modelSelectionMode === "inherit" ? {} : { requestedModelId: agent.modelId }),
        instructions: agent.systemPrompt ?? "",
        ...(agent.maxCostUsd !== undefined ? { maxCostUsd: agent.maxCostUsd } : {}),
        mode: agent.plannerMode ?? "TEST",
      });
    }
    const lead = members.find((member) => member.role === INSIGHTS_LEAD_ROLE);
    const holdIds = new Set<Id<"companyWebsites">>();
    for (const table of ["searchConsoleConnections", "googleAnalyticsConnections"] as const) {
      for (let after = 0; ;) {
        const page = await ctx.db
          .query(table)
          .withIndex("by_status", (q) => q.eq("status", "CONNECTED").gt("_creationTime", after))
          .take(CONNECTIONS_PER_READ);
        for (const connection of page) holdIds.add(connection.companyWebsiteId);
        if (page.length < CONNECTIONS_PER_READ) break;
        after = page[page.length - 1]._creationTime;
      }
    }
    // Test: the companies super admins are working in (their own, or the one they are in as a super admin).
    let testing: Set<Id<"companies">> | null = null;
    if ((lead?.mode ?? "TEST") === "TEST") {
      testing = new Set();
      const admins = await ctx.db.query("users").withIndex("by_role_lastLogin", (q) => q.eq("role", "SUPER_ADMIN")).take(50);
      for (const admin of admins) {
        const company = admin.impersonatingCompanyId ?? admin.companyId;
        if (company) testing.add(company);
      }
    }
    const websites: Array<typeof websiteValidator.type> = [];
    for (const holdId of holdIds) {
      const hold = await ctx.db.get(holdId);
      if (!hold || isTrackedHold(hold)) continue;
      if (testing && !testing.has(hold.companyId)) continue;
      const website = await ctx.db.get(hold.websiteId);
      websites.push({ holdId, companyId: hold.companyId, host: website?.displayHost ?? website?.host ?? "" });
    }
    return { members, websites };
  },
});

/**
 * The team's agents, made once — each role missing an agent gets one — and
 * the Head of Strategy's weekly schedule made with it. Idempotent: never
 * changes an agent or a schedule an administrator has set.
 */
export const ensureTeamInternal = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const now = Date.now();
    const made: string[] = [];
    for (const role of INSIGHTS_ROLES) {
      const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
      if (existing) continue;
      const agentId = await ctx.db.insert("agents", {
        name: TEAM_AGENTS[role].name,
        description: TEAM_AGENTS[role].description,
        systemKey: role,
        modelId: "agent (resolved at run time)",
        modelSelectionMode: "inherit",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        ...(role === INSIGHTS_LEAD_ROLE ? { maxCostUsd: LEAD_LIMIT_USD, plannerMode: "TEST" as const } : {}),
        createdAt: now,
        updatedAt: now,
      });
      made.push(TEAM_AGENTS[role].name);
      if (role === INSIGHTS_LEAD_ROLE) {
        await ctx.db.insert("schedules", {
          name: TEAM_SCHEDULE.name,
          agentId,
          intervalStr: TEAM_SCHEDULE.intervalStr,
          isActive: true,
          nextRunAt: getNextWorkflowScheduleRunAt({ intervalStr: TEAM_SCHEDULE.intervalStr, now: new Date(now) }),
          createdAt: now,
        });
      }
    }
    return made;
  },
});

/** The team's weekly run, started now as the Head of Strategy's run (the operator's way to run it outside its schedule). */
export const startTeamNowInternal = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await startRoleRun(ctx, INSIGHTS_LEAD_ROLE, {
    objective: "Read every website the team covers and save the week's findings.",
    title: "Insights: the team's weekly run",
  }),
});

/** The week a run belongs to: its Monday, UTC. */
export function weekOf(now: number): string {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

/** One website's run, under the Head of Strategy's, and its work booked. */
export const startWebsiteRun = internalMutation({
  args: {
    parentRunId: v.id("agentRuns"),
    holdId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    host: v.string(),
    delayMs: v.number(),
  },
  returns: v.union(v.null(), v.id("agentRuns")),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    return await beginWebsiteRun(ctx, parent.agentId, args, args.delayMs);
  },
});

async function beginWebsiteRun(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  site: { holdId: Id<"companyWebsites">; companyId: Id<"companies">; host: string },
  delayMs: number,
): Promise<Id<"agentRuns">> {
  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: `Read every source of ${site.host} with its rivals, have each specialist look at its own discipline, connect what they find, and have the Editor check every figure before the week's findings are saved.`,
    title: `Insights: ${site.host}`,
    status: "QUEUED",
    companyId: site.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId,
    agentRunId: runId,
    triggerType: "EVENT",
    status: "RUNNING",
    startedAt: now,
  });
  await ctx.scheduler.runAfter(delayMs, internal.insightsRun.runWebsite, {
    runId,
    workflowExecutionId,
    holdId: site.holdId,
    companyId: site.companyId,
    host: site.host,
  });
  return runId;
}

const savedFindingValidator = v.object({
  specialist: insightSpecialistValidator,
  pattern: v.string(),
  status: v.union(v.literal("PUBLISHED"), v.literal("SENT_BACK")),
  rank: v.number(),
  headline: v.string(),
  story: v.string(),
  ruledOut: v.array(v.string()),
  action: v.string(),
  howWeKnow: v.string(),
  sure: insightSureValidator,
  sources: v.array(v.string()),
  facts: v.array(factValidator),
  comparisons: v.array(v.array(v.string())),
  watch: v.optional(v.object({ key: v.string(), direction: v.union(v.literal("UP"), v.literal("DOWN")) })),
  checkOn: v.optional(v.string()),
  editorNote: v.optional(v.string()),
});

/** How long a week and its findings are kept (I7). */
const KEPT_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** The week's findings beside each other, at most this many kept a week: the ones sent back with them, for Admin. */
const MOST_A_WEEK = 30;

/**
 * A website's week, saved: its findings — the week's earlier ones replaced, so
 * a second run in a week leaves one set — and its verdict, sources and cost.
 */
export const saveWeek = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    week: v.string(),
    runId: v.id("agentRuns"),
    verdict: v.string(),
    sources: v.array(v.object({ source: v.string(), facts: v.number() })),
    problems: v.array(v.string()),
    findings: v.array(savedFindingValidator),
    costUsd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const old = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(MOST_A_WEEK * 2);
    for (const finding of old) await ctx.db.delete(finding._id);
    for (const finding of args.findings.slice(0, MOST_A_WEEK)) {
      await ctx.db.insert("insightFindings", { ...finding, companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, runId: args.runId, createdAt: now });
    }
    const week = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).first();
    const record = {
      companyId: args.companyId,
      companyWebsiteId: args.holdId,
      week: args.week,
      runId: args.runId,
      verdict: args.verdict,
      sources: args.sources,
      problems: args.problems,
      published: args.findings.filter((finding) => finding.status === "PUBLISHED").length,
      sentBack: args.findings.filter((finding) => finding.status === "SENT_BACK").length,
      costUsd: args.costUsd,
      createdAt: now,
    };
    if (week) await ctx.db.replace(week._id, record);
    else await ctx.db.insert("insightWeeks", record);
    // Two years kept (I7): the website's weeks and findings older than that go as each new week is saved.
    const cutoff = new Date(now - KEPT_MS).toISOString().slice(0, 10);
    const oldWeeks = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).lt("week", cutoff)).take(10);
    for (const oldWeek of oldWeeks) {
      await ctx.db.delete(oldWeek._id);
      const gone = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", oldWeek.week)).take(MOST_A_WEEK * 2);
      for (const finding of gone) await ctx.db.delete(finding._id);
    }
    return null;
  },
});

/** The run's cost so far, for the week's record. */
export const runCost = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.number(),
  handler: async (ctx, args) => (await ctx.db.get(args.runId))?.costUsd ?? 0,
});

export type TeamMember = typeof memberValidator.type;
export type InsightsMemberRole = InsightsRole;
export type SavedFinding = typeof savedFindingValidator.type;
export type InsightWeek = Doc<"insightWeeks">;
