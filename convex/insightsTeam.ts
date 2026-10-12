import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { isTrackedHold } from "./utils/websitePairing";
import { INSIGHTS_LEAD_ROLE, INSIGHTS_ROLES, type InsightsRole } from "./utils/agentRoles";
import { DEFAULT_CLIENT_SCHEDULE, DUE_SLACK_MS, FIRST_TEAM_SCHEDULE, LEAD_LIMIT_USD, TEAM_AGENTS, TEAM_SCHEDULE } from "./utils/insightTeam";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { startRoleRun } from "./roleRuns";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { assertSeoInterval } from "./seoScheduleService";
import { appError } from "./utils/appError";
import { factValidator } from "./utils/insightFacts";
import { EARLIER_BRIEFS, INSIGHT_BRIEFS, fixedRulesFor } from "./utils/insightBriefs";
import { changeKindValidator, changeResultValidator } from "./utils/insightTrack";
import { REPORT_KINDS, reportBodyValidator, weekSummaryValidator } from "./utils/insightSummary";
import { measurementValidator } from "./utils/insightMeasurement";
import { planValidator } from "./utils/insightPlan";
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
  args: {
    /** The run asking: a scheduled one reads only the clients due by their own Insights schedule; Run, every client. */
    runId: v.optional(v.id("agentRuns")),
  },
  /** The websites due their week; those covered but not due, for the daily quick check; and why each isn't due. */
  returns: v.object({ members: v.array(memberValidator), websites: v.array(websiteValidator), waiting: v.array(websiteValidator), notDue: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const run = args.runId ? await ctx.db.get(args.runId) : null;
    const scheduled = run?.triggerType === "SCHEDULE";
    const now = Date.now();
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
    const waiting: Array<typeof websiteValidator.type> = [];
    const notDue: string[] = [];
    for (const holdId of holdIds) {
      const hold = await ctx.db.get(holdId);
      if (!hold || isTrackedHold(hold)) continue;
      if (testing && !testing.has(hold.companyId)) continue;
      const website = await ctx.db.get(hold.websiteId);
      const host = website?.displayHost ?? website?.host ?? "";
      // Each client on its own Insights schedule: off, or not yet due since its last week, and a scheduled run passes it by.
      const schedule = (await ctx.db.get(hold.companyId))?.insightsSchedule;
      if (schedule && !schedule.isActive) {
        notDue.push(`${host} (Insights switched off for its company)`);
        continue;
      }
      if (scheduled) {
        const last = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", holdId)).order("desc").first();
        const next = last ? getNextWorkflowScheduleRunAt({ intervalStr: schedule?.intervalStr ?? DEFAULT_CLIENT_SCHEDULE, now: new Date(last.createdAt) }) : now;
        if (next !== undefined && next > now + DUE_SLACK_MS) {
          notDue.push(`${host} (next due ${new Date(next).toISOString().slice(0, 10)})`);
          waiting.push({ holdId, companyId: hold.companyId, host });
          continue;
        }
      }
      websites.push({ holdId, companyId: hold.companyId, host });
    }
    return { members, websites, waiting, notDue };
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
      if (existing) {
        // Its Instructions page filled with Hakken's own job and brief where blank, so they can be read and refined (12 Oct 2026);
        // never over what an administrator wrote.
        const fill = {
          ...((!existing.systemPrompt?.trim() || EARLIER_BRIEFS[role]?.includes(existing.systemPrompt)) && INSIGHT_BRIEFS[role].brief && existing.systemPrompt !== INSIGHT_BRIEFS[role].brief ? { systemPrompt: INSIGHT_BRIEFS[role].brief } : {}),
          ...(!existing.standingObjective?.trim() ? { standingObjective: INSIGHT_BRIEFS[role].job } : {}),
        };
        if (Object.keys(fill).length > 0) {
          await ctx.db.patch(existing._id, { ...fill, updatedAt: now });
          made.push(`${existing.name}: its job and brief filled in`);
        }
        // The lead's first schedule was weekly; each client now has its own, so the team looks every morning — unless an administrator changed it.
        if (role === INSIGHTS_LEAD_ROLE) {
          const first = await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", existing._id)).first();
          if (first && first.intervalStr === FIRST_TEAM_SCHEDULE) {
            await ctx.db.patch(first._id, { name: TEAM_SCHEDULE.name, intervalStr: TEAM_SCHEDULE.intervalStr, nextRunAt: getNextWorkflowScheduleRunAt({ intervalStr: TEAM_SCHEDULE.intervalStr, now: new Date(now) }) });
            made.push("Insights: the team's run, now every morning");
          }
        }
        continue;
      }
      const agentId = await ctx.db.insert("agents", {
        name: TEAM_AGENTS[role].name,
        description: TEAM_AGENTS[role].description,
        ...(INSIGHT_BRIEFS[role].brief ? { systemPrompt: INSIGHT_BRIEFS[role].brief } : {}),
        standingObjective: INSIGHT_BRIEFS[role].job,
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
  atStake: v.optional(v.number()),
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
export const MOST_A_WEEK = 30;

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
    summary: v.optional(weekSummaryValidator),
    measurement: v.optional(measurementValidator),
    plan: v.optional(planValidator),
  },
  /** The published findings' ids, in their order, for the week's brief. */
  returns: v.array(v.id("insightFindings")),
  handler: async (ctx, args) => {
    const now = Date.now();
    const old = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", args.week)).take(MOST_A_WEEK * 2);
    for (const finding of old) await ctx.db.delete(finding._id);
    const published: Array<Id<"insightFindings">> = [];
    for (const finding of args.findings.slice(0, MOST_A_WEEK)) {
      const id = await ctx.db.insert("insightFindings", { ...finding, companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, runId: args.runId, createdAt: now });
      if (finding.status === "PUBLISHED") published.push(id);
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
      ...(args.summary ? { summary: args.summary } : {}),
      createdAt: now,
    };
    if (week) await ctx.db.replace(week._id, record);
    else await ctx.db.insert("insightWeeks", record);
    // The Measurement check, the newest only: one row a website.
    if (args.measurement) {
      const held = await ctx.db.query("insightMeasurements").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
      const row = { companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, ...args.measurement, createdAt: now };
      if (held) await ctx.db.replace(held._id, row);
      else await ctx.db.insert("insightMeasurements", row);
    }
    // Opportunities and the page plan, the newest only.
    if (args.plan) {
      const held = await ctx.db.query("insightPlans").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
      const row = { companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, ...args.plan, createdAt: now };
      if (held) await ctx.db.replace(held._id, row);
      else await ctx.db.insert("insightPlans", row);
    }
    // Two years kept (I7): the website's weeks and findings older than that go as each new week is saved.
    const cutoff = new Date(now - KEPT_MS).toISOString().slice(0, 10);
    const oldWeeks = await ctx.db.query("insightWeeks").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).lt("week", cutoff)).take(10);
    for (const oldWeek of oldWeeks) {
      await ctx.db.delete(oldWeek._id);
      const gone = await ctx.db.query("insightFindings").withIndex("by_hold_week", (q) => q.eq("companyWebsiteId", args.holdId).eq("week", oldWeek.week)).take(MOST_A_WEEK * 2);
      for (const finding of gone) await ctx.db.delete(finding._id);
    }
    return published;
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

// ---------------------------------------------------------------------------
// Each client's Insights schedule (Anthony, 2026-10-11: "I want to be able to set the schedule as I may decide monthly for some clients")

export const getCompanyInsightsSchedule = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({ intervalStr: v.string(), isActive: v.boolean(), isDefault: v.boolean() }),
  handler: async (ctx, args) => {
    const schedule = (await ctx.db.get(args.companyId))?.insightsSchedule;
    return schedule ? { ...schedule, isDefault: false } : { intervalStr: DEFAULT_CLIENT_SCHEDULE, isActive: true, isDefault: true };
  },
});

/** A client's Insights schedule: daily to monthly, in the platform's format, and whether the team reads it at all. */
export const saveCompanyInsightsSchedule = superAdminMutation({
  args: { companyId: v.id("companies"), intervalStr: v.string(), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.companyId))) throw appError("NOT_FOUND", "Company not found.");
    assertSeoInterval(args.intervalStr);
    await ctx.db.patch(args.companyId, { insightsSchedule: { intervalStr: args.intervalStr, isActive: args.isActive } });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Reports (§4.1, §4.2): the Report Writer's, frozen as written

/** The month and quarter keys a day falls in: "2026-09", "2026-Q3". */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}
export function quarterKey(day: string): string {
  return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
}

/** The month before a day's month, "2026-09" on any day of October 2026. */
export function previousMonth(day: string): string {
  const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** Which reports a website is due today: the monthly report from the 4th, for the month before; the board report once a quarter. */
export const reportsDue = internalQuery({
  args: { holdId: v.id("companyWebsites"), today: v.string() },
  returns: v.object({ month: v.union(v.string(), v.null()), quarter: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const month = previousMonth(args.today);
    const quarter = quarterKey(args.today);
    const hasMonth = Number(args.today.slice(8, 10)) < 4 || (await ctx.db.query("insightReports").withIndex("by_hold_kind_period", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "MONTHLY").eq("period", month)).first()) !== null;
    const hasQuarter = (await ctx.db.query("insightReports").withIndex("by_hold_kind_period", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "BOARD").eq("period", quarter)).first()) !== null;
    return { month: hasMonth ? null : month, quarter: hasQuarter ? null : quarter };
  },
});

/** A report, saved as written; the same website's report of the same kind and period replaced. Reports older than two years go (I7). */
export const saveReport = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    kind: v.union(...REPORT_KINDS.map((kind) => v.literal(kind))),
    from: v.string(),
    to: v.string(),
    period: v.string(),
    title: v.string(),
    body: reportBodyValidator,
    runId: v.optional(v.id("agentRuns")),
  },
  returns: v.id("insightReports"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { holdId, ...rest } = args;
    const old = await ctx.db.query("insightReports").withIndex("by_hold_kind_period", (q) => q.eq("companyWebsiteId", holdId).eq("kind", args.kind).eq("period", args.period)).first();
    if (old) await ctx.db.delete(old._id);
    const reportId = await ctx.db.insert("insightReports", { ...rest, companyWebsiteId: holdId, status: "WRITTEN", createdAt: now });
    const expired = await ctx.db.query("insightReports").withIndex("by_company_created", (q) => q.eq("companyId", args.companyId).lt("createdAt", now - KEPT_MS)).take(20);
    for (const report of expired) await ctx.db.delete(report._id);
    return reportId;
  },
});

// ---------------------------------------------------------------------------
// Keeping score and the change log (§2.7, I25, I30)

/** A website's findings due to be checked by today, not yet checked. */
export const dueFindings = internalQuery({
  args: { holdId: v.id("companyWebsites"), today: v.string() },
  returns: v.array(v.object({
    findingId: v.id("insightFindings"),
    specialist: v.string(),
    watch: v.object({ key: v.string(), direction: v.union(v.literal("UP"), v.literal("DOWN")) }),
    then: v.union(v.null(), factValidator),
  })),
  handler: async (ctx, args) => {
    const due = await ctx.db.query("insightFindings").withIndex("by_check", (q) => q.eq("status", "PUBLISHED").lte("checkOn", args.today)).take(500);
    return due
      .filter((finding) => finding.companyWebsiteId === args.holdId && !finding.outcome && finding.watch)
      .map((finding) => ({ findingId: finding._id, specialist: finding.specialist, watch: finding.watch!, then: finding.facts.find((fact) => fact.key === finding.watch!.key) ?? null }));
  },
});

/** How each checked finding turned out, and the company's tally — kept after the findings go (I7). */
export const scoreFindings = internalMutation({
  args: {
    companyId: v.id("companies"),
    outcomes: v.array(v.object({ findingId: v.id("insightFindings"), specialist: v.string(), outcome: v.union(v.literal("RIGHT"), v.literal("WRONG"), v.literal("TOO_EARLY")), note: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const scored of args.outcomes) {
      await ctx.db.patch(scored.findingId, { outcome: scored.outcome, outcomeNote: scored.note });
      const tally = await ctx.db.query("insightTally").withIndex("by_company_specialist", (q) => q.eq("companyId", args.companyId).eq("specialist", scored.specialist)).first();
      const add = { right: scored.outcome === "RIGHT" ? 1 : 0, wrong: scored.outcome === "WRONG" ? 1 : 0, unclear: scored.outcome === "TOO_EARLY" ? 1 : 0 };
      if (tally) await ctx.db.patch(tally._id, { right: tally.right + add.right, wrong: tally.wrong + add.wrong, unclear: tally.unclear + add.unclear, updatedAt: now });
      else await ctx.db.insert("insightTally", { companyId: args.companyId, specialist: scored.specialist, ...add, updatedAt: now });
    }
    return null;
  },
});

const changeValidator = v.object({
  kind: changeKindValidator,
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  day: v.optional(v.string()),
  /** Where it was seen, Analytics when not said. */
  seenIn: v.optional(v.string()),
  before: v.number(),
  after: v.number(),
  result: changeResultValidator,
});

/** A change's result counted into what its kind has taught, across every company, from totals only (I30). */
async function learnFrom(ctx: MutationCtx, kind: string, companyId: Id<"companies">, result: string, now: number): Promise<void> {
  const learning = await ctx.db.query("insightLearnings").withIndex("by_kind", (q) => q.eq("kind", kind)).first();
  const count = { lost: result === "LOST" ? 1 : 0, held: result === "HELD" ? 1 : 0, grew: result === "GREW" ? 1 : 0 };
  if (learning) {
    await ctx.db.patch(learning._id, {
      companies: learning.companies.includes(companyId) ? learning.companies : [...learning.companies, companyId],
      lost: learning.lost + count.lost, held: learning.held + count.held, grew: learning.grew + count.grew, updatedAt: now,
    });
  } else {
    await ctx.db.insert("insightLearnings", { kind, companies: [companyId], ...count, updatedAt: now });
  }
}

/**
 * The changes seen this run, each logged once (I25), and the learning each
 * adds across every company, from totals only (I30). Changes older than two
 * years go with their findings.
 */
export const saveChanges = internalMutation({
  args: { holdId: v.id("companyWebsites"), companyId: v.id("companies"), week: v.string(), changes: v.array(changeValidator), notRemoved: v.optional(v.array(v.string())) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    let added = 0;
    // A page logged as removed that had visits after all was never removed: it leaves the log.
    for (const from of args.notRemoved ?? []) {
      const wrong = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "REMOVED").eq("from", from)).first();
      if (wrong) await ctx.db.delete(wrong._id);
    }
    for (const change of args.changes) {
      // A page first seen removed and later found replaced is one change: the replacement.
      if (change.kind === "REPLACED" || change.kind === "MERGED") {
        const removed = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", "REMOVED").eq("from", change.from)).first();
        if (removed) await ctx.db.patch(removed._id, { kind: change.kind, to: change.to, before: change.before, after: change.after, result: change.result });
      }
      // A page or profile change is one change a day: a price put on, taken off and put on again is three.
      const same = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId).eq("kind", change.kind).eq("from", change.from)).take(20);
      const held = same.find((row) => (row.day ?? null) === (change.day ?? null));
      if (held) {
        // What followed, as it stands now; a change too early to judge teaches once its days are in.
        if (held.after !== change.after || held.result !== change.result || held.to !== change.to) await ctx.db.patch(held._id, { to: change.to, after: change.after, result: change.result });
        if (held.result === "TOO_EARLY" && change.result !== "TOO_EARLY") await learnFrom(ctx, change.kind, args.companyId, change.result, now);
        continue;
      }
      const { seenIn, ...fields } = change;
      await ctx.db.insert("insightChanges", { ...fields, companyId: args.companyId, companyWebsiteId: args.holdId, week: args.week, seenIn: seenIn ?? "analytics", createdAt: now });
      added += 1;
      if (change.result !== "TOO_EARLY") await learnFrom(ctx, change.kind, args.companyId, change.result, now);
    }
    const expired = await ctx.db.query("insightChanges").withIndex("by_company_created", (q) => q.eq("companyId", args.companyId).lt("createdAt", now - KEPT_MS)).take(20);
    for (const change of expired) await ctx.db.delete(change._id);
    return added;
  },
});

/**
 * What the changes have taught, for the specialists' brief (I30): this
 * website's own changes and how each turned out, and — once five companies
 * have made a change of a kind — how often it kept its enquiries across
 * Hakken, from totals only.
 */
export const learningsFor = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const changes = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", args.holdId)).take(100);
    const named = (kind: string) => kind.toLowerCase().replace(/_/g, " ");
    const lines = changes.filter((change) => change.result !== "TOO_EARLY").slice(0, 10).map((change) => (change.day
      // A page or profile change, judged on the 30 days either side of its day.
      ? `${named(change.kind)}${change.from ? ` (${change.from})` : ""} on ${change.day}: ${change.before} enquiries in the 30 days before, then ${change.after} in the 30 after (${change.result.toLowerCase()})`
      : `${named(change.kind)} ${change.from ?? ""}${change.to ? ` into ${change.to}` : ""}: ${change.before} enquiries a year, then ${change.after} (${change.result.toLowerCase()})`));
    for (const kind of new Set(["REPLACED", "MERGED", "REMOVED", ...changes.map((change) => change.kind)])) {
      const learning = await ctx.db.query("insightLearnings").withIndex("by_kind", (q) => q.eq("kind", kind)).first();
      if (learning && learning.companies.length >= 5) {
        lines.push(`across ${learning.companies.length} businesses, a change of the kind "${named(kind)}" kept their enquiries ${learning.held + learning.grew} times of ${learning.lost + learning.held + learning.grew}`);
      }
    }
    return lines;
  },
});

/**
 * What Hakken always adds to an Insights agent's brief, for its Instructions
 * page to show read-only (12 Oct 2026): the ground rules that keep every
 * figure true and the shape of each answer the run reads. Null for any other
 * agent.
 */
export const insightFixedRules = superAdminQuery({
  args: { agentId: v.id("agents") },
  returns: v.union(v.null(), v.array(v.object({ part: v.string(), text: v.string() }))),
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    const role = INSIGHTS_ROLES.find((known) => known === agent?.systemKey);
    return role ? fixedRulesFor(role) : null;
  },
});
