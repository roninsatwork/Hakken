import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";

/**
 * The weekly brain report (closing-the-loop-plan.md, phase 3): one plain
 * digest per company per week, assembled mechanically from what is
 * already recorded — the audit trail, the answer tallies, the staff's
 * run history, and the queues that wait on a person. No model call
 * anywhere; a quiet week says so in one line, and an empty company says
 * nothing at all.
 */

export type WeeklyReport = {
  pagesNew: number;
  pagesImproved: number;
  answered: number;
  unanswered: number;
  openUnanswered: number;
  staffRuns: number;
  waitingReviews: number;
  waitingQuestions: number;
  quiet: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function buildReport(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  companyId: Id<"companies"> | undefined,
  since: number
): Promise<WeeklyReport> {
  const audit = await ctx.db
    .query("auditLogs")
    .withIndex("by_company", (q) => q.eq("companyId", companyId).gte("timestamp", since))
    .take(2000);
  const pagesNew = audit.filter((row) => row.actionType === "WIKI_PAGE_CREATED").length;
  const pagesImproved = audit.filter(
    (row) => row.actionType === "WIKI_PAGE_REWRITE" || row.actionType === "WIKI_PAGE_HUMAN_EDIT"
  ).length;

  // Answers and their gaps always belong to a company — the platform
  // shelf has neither table (Anthony's wall: company questions never
  // pool under a global heading).
  const sinceDay = new Date(since).toISOString().slice(0, 10);
  const tallies = companyId
    ? await ctx.db
        .query("wikiAnswerTallies")
        .withIndex("by_company_day", (q) => q.eq("companyId", companyId).gte("dayKey", sinceDay))
        .take(14)
    : [];
  const answered = tallies.reduce((sum, row) => sum + row.answered, 0);
  const unanswered = tallies.reduce((sum, row) => sum + row.unanswered, 0);

  const openUnansweredRows = companyId
    ? await ctx.db
        .query("wikiUnansweredQuestions")
        .withIndex("by_company_status_asked", (q) =>
          q.eq("companyId", companyId).eq("status", "OPEN")
        )
        .take(100)
    : [];

  // The staff's rounds this week: runs in the window whose agent is one
  // of the wiki staff (systemKey is the badge).
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId).gte("startedAt", since))
    .take(500);
  let staffRuns = 0;
  const staffAgentIds = new Map<string, boolean>();
  for (const run of runs) {
    const key = run.agentId.toString();
    if (!staffAgentIds.has(key)) {
      const agent = await ctx.db.get(run.agentId);
      staffAgentIds.set(key, Boolean(agent?.systemKey?.startsWith("WIKI_")));
    }
    if (staffAgentIds.get(key)) staffRuns += 1;
  }

  const waitingReviews = (
    await ctx.db
      .query("wikiReviews")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "PENDING"))
      .take(100)
  ).length;
  const waitingQuestions = (
    await ctx.db
      .query("wikiOpenQuestions")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "OPEN"))
      .take(100)
  ).length;

  const quiet =
    pagesNew + pagesImproved + answered + unanswered + staffRuns === 0 &&
    waitingReviews + waitingQuestions + openUnansweredRows.length === 0;

  return {
    pagesNew,
    pagesImproved,
    answered,
    unanswered,
    openUnanswered: openUnansweredRows.length,
    staffRuns,
    waitingReviews,
    waitingQuestions,
    quiet,
  };
}

export const buildWeeklyReportInternal = internalQuery({
  args: { companyId: v.id("companies"), since: v.number() },
  handler: async (ctx, args): Promise<WeeklyReport> => {
    return await buildReport(ctx, args.companyId, args.since);
  },
});

/** The Wiki screen's This Week panel — the same numbers, live. */
export const getWeeklyReportForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<WeeklyReport> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await buildReport(ctx, args.companyId, Date.now() - WEEK_MS);
  },
});

/** The platform wiki's This Week strip: the parts of the week that exist
 * at the shelf's level — pages, staff rounds, and what waits. */
export const getWeeklyReportForGlobal = adminQuery({
  args: {},
  handler: async (ctx): Promise<WeeklyReport> => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    return await buildReport(ctx, undefined, Date.now() - WEEK_MS);
  },
});

/** One bell per admin per week, never per item; body carries the numbers
 * because the recipients' surface has no wiki screen to open. */
export const notifyCompanyAdminsInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<number> => {
    const members = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(200);
    let told = 0;
    for (const admin of members.filter((row) => row.role === "ADMIN")) {
      await ctx.runMutation(internal.notifications.notifyUserInternal, {
        userId: admin._id,
        companyId: args.companyId,
        kind: "WIKI_WEEKLY_REPORT",
        title: args.title,
        body: args.body,
      });
      told += 1;
    }
    if (told > 0) {
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_WEEKLY_REPORT_SENT",
        entityType: "companies",
        entityId: args.companyId.toString(),
        companyId: args.companyId,
        timestamp: Date.now(),
        metadata: JSON.stringify({ admins: told }),
      });
    }
    return told;
  },
});

/** The weekly rota: every company brain reports its week. The global
 * shelf sends nothing — it has no company admins to tell. */
export const sendWeeklyReports = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    const scopes = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    const since = Date.now() - WEEK_MS;
    let sent = 0;
    for (const scope of scopes) {
      if (!scope) continue;
      const report = await ctx.runQuery(internal.wikiReport.buildWeeklyReportInternal, {
        companyId: scope,
        since,
      });
      if (report.quiet) continue;
      const waiting = report.waitingReviews + report.waitingQuestions + report.openUnanswered;
      const body =
        `${report.pagesNew} new pages, ${report.pagesImproved} improved. ` +
        `${report.answered} questions answered from the wiki, ${report.unanswered} it couldn't answer. ` +
        `${report.staffRuns} staff rounds ran. ` +
        (waiting > 0 ? `${waiting} items waiting on a person.` : `Nothing waiting on anyone.`);
      const told = await ctx.runMutation(internal.wikiReport.notifyCompanyAdminsInternal, {
        companyId: scope,
        title: "Your wiki's week",
        body,
      });
      if (told > 0) sent += 1;
    }
    return { companies: sent };
  },
});
