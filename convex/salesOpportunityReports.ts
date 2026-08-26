import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { getCurrentImport, requireSalesDataCompany } from "./salesData";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { extraFieldForType } from "./salesDataCustomerFields";
import {
  buildGapProducts,
  buildTypeBaskets,
  collectReportFigures,
  estimateProspect,
  findGroupGaps,
  findUnsupportedFigures,
  summariseOpportunities,
  type ComparableCustomer,
  type GroupMemberSpend,
  type ProspectSubject,
} from "./salesOpportunityService";
import { appError } from "./utils/appError";

/**
 * The opportunity report: one press, one run, one row.
 *
 * Every figure is computed by the deterministic passes in
 * `salesOpportunityService.ts`, called through the three tools the
 * Comax - Opportunity Report Agent holds. The agent's contribution is the
 * order of the calls and the prose on top; it cannot put a number on the
 * report that the passes did not compute, because the save refuses one.
 *
 * No job-and-queue machinery here, deliberately. The research sweep needed it
 * because its work is hundreds of web searches across many runs; this report
 * is three tool calls and a paragraph, well inside a single run's budget. The
 * report row itself carries the phase the progress bar reads.
 */

const OPPORTUNITY_CONNECTOR_KEY = "sales-opportunity-report";
const SAVE_HANDLER_MAPPING = "opportunityReport.saveSummary";

/** One doc per gap; far above any real report, well under the read cap. */
const GAP_PRODUCT_DOC_LIMIT = 2000;
/** One doc per customer type, and a workbook has a handful of those. */
const TYPE_BASKET_DOC_LIMIT = 50;

/** Plenty for a workspace of tens of accounts; a guard, not a target. */
const ACCOUNT_SCAN_LIMIT = 500;
const PROSPECT_SCAN_LIMIT = 500;
/** Matches the customer profile's own per-account row cap. */
const ACCOUNT_ROW_LIMIT = 1000;
const AGENT_BINDING_LOOKUP_LIMIT = 100;

/** How often the watchdog looks, and how long a report may take in total. */
const WATCH_TICK_MS = 30_000;
const REPORT_TIMEOUT_MS = 20 * 60_000;

// === The screen's read ===================================================

export const getLatestOpportunityReport = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);

    // A running report outranks the newest finished one: while the agent
    // works, the screen shows the bar, not last week's numbers pretending to
    // be current. When nothing is running, newest wins.
    const report =
      (await findRunningReport(ctx, companyId))
      ?? (await ctx.db
        .query("salesOpportunityReports")
        .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
        .order("desc")
        .first());

    if (!report) return null;

    // The estimates are sums over one workbook's six months, so the screen
    // must say which file and which months — and whether a newer import has
    // arrived since, which is the cue to run the report again.
    const reportImport = await ctx.db.get(report.importId);
    const currentImport = await getCurrentImport(ctx, companyId);

    // Each gap's order sheet, one doc per gap in its own table.
    const gapProducts = await ctx.db
      .query("salesOpportunityReportGapProducts")
      .withIndex("by_company_report", (q) =>
        q.eq("companyId", companyId).eq("reportId", report._id)
      )
      .take(GAP_PRODUCT_DOC_LIMIT);

    // What a customer of each type buys, for the sites nobody supplies yet.
    const typeBaskets = await ctx.db
      .query("salesOpportunityReportTypeBaskets")
      .withIndex("by_company_report", (q) =>
        q.eq("companyId", companyId).eq("reportId", report._id)
      )
      .take(TYPE_BASKET_DOC_LIMIT);

    return {
      status: report.status,
      phase: report.phase,
      startedAt: report.startedAt,
      completedAt: report.completedAt ?? null,
      failureReason: report.failureReason ?? null,
      headline: report.headline ?? null,
      prospects: report.prospects ?? [],
      gaps: report.gaps ?? [],
      gapProducts: gapProducts.map((entry) => ({
        accountNameKey: entry.accountNameKey,
        categoryKey: entry.categoryKey,
        products: entry.products,
      })),
      typeBaskets: typeBaskets.map((entry) => ({
        customerTypeKey: entry.customerTypeKey,
        customerType: entry.customerType,
        totalSpendGBP: entry.totalSpendGBP,
        customerCount: entry.customerCount,
        categories: entry.categories,
      })),
      summary: report.summary ?? null,
      exceptions: report.exceptions ?? [],
      importFileName: reportImport?.fileName ?? null,
      importPeriodLabels: reportImport?.periodLabels ?? [],
      describesCurrentImport: currentImport?._id === report.importId,
    };
  },
});

// === Starting it ==========================================================

/**
 * Start the report from the workspace screen.
 *
 * Pressing the button while one is running joins the running one rather than
 * queueing a second — the same double-press rule the research job settled on.
 * It starts a paid agent run, so nothing schedules it; a person presses it,
 * every time.
 */
export const startOpportunityReport = tenantMutation({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const now = Date.now();

    const running = await findRunningReport(ctx, companyId);
    if (running) {
      // A report abandoned by a dead run must not lock the button for ever.
      // The watchdog normally settles this first; this is the belt to its
      // braces, for a watchdog that never got to run.
      if (now - running.startedAt > REPORT_TIMEOUT_MS) {
        await ctx.db.patch(running._id, {
          status: "FAILED",
          phase: "DONE",
          failureReason: "The report took too long and was given up on.",
          updatedAt: now,
          completedAt: now,
        });
      } else {
        return { started: false as const, alreadyRunning: true as const };
      }
    }

    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) {
      throw appError("NOT_FOUND", "Import a workbook first — the report prices its six months of sales.");
    }

    const agent = await resolveOpportunityAgent(ctx, companyId);

    const reportId = await ctx.db.insert("salesOpportunityReports", {
      companyId,
      importId: currentImport._id,
      status: "RUNNING",
      phase: "MATCHING",
      agentId: agent._id,
      requestedBy: ctx.user._id,
      startedAt: now,
      updatedAt: now,
    });

    const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
      agentId: agent._id,
      companyId,
    });
    const objective = buildReportObjective();
    const runId = await ctx.db.insert("agentRuns", {
      agentId: agent._id,
      agentVersionId,
      triggerType: "MANUAL",
      objective,
      title: `Opportunity report · ${currentImport.fileName}`,
      status: "QUEUED",
      companyId,
      userId: ctx.user._id,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(reportId, { runId, updatedAt: now });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: agent._id,
      objective,
      triggerType: "MANUAL",
      runId,
      companyId,
      userId: ctx.user._id,
    });
    await ctx.scheduler.runAfter(WATCH_TICK_MS, internal.salesOpportunityReports.watchReportInternal, {
      reportId,
    });

    return { started: true as const, alreadyRunning: false as const };
  },
});

/**
 * The agent's instructions for one report run.
 *
 * The order is stated rather than left to the model because the passes build
 * on each other — the gaps pass computes the headline, which needs the
 * prospect section already written.
 */
function buildReportObjective(): string {
  return [
    "Build the opportunity report for this workspace.",
    "Call the prospect pricing tool first, then the group gaps tool, and read what each returns.",
    "Then write the executive summary: which opportunities matter most and why, in plain",
    "sentences a salesperson can act on — name the chains and sites, not just the totals.",
    "Quote every pound figure exactly as the tools returned it; the save refuses a summary",
    "naming a figure the report does not hold. Save it with the summary tool, listing anything",
    "that could not be priced as an exception.",
  ].join(" ");
}

/**
 * Which agent builds the report: whichever active one holds the save tool.
 *
 * Resolved by binding rather than by name, the same rule as the research
 * workers — an agent renamed on its settings screen must not break the
 * button.
 */
async function resolveOpportunityAgent(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">
): Promise<Doc<"agents">> {
  const tools = await ctx.db
    .query("aiTools")
    .withIndex("by_connector_key", (q) => q.eq("connectorKey", OPPORTUNITY_CONNECTOR_KEY))
    .take(AGENT_BINDING_LOOKUP_LIMIT);

  for (const tool of tools) {
    if (tool.handlerMapping !== SAVE_HANDLER_MAPPING) continue;
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .take(AGENT_BINDING_LOOKUP_LIMIT);
    for (const binding of bindings) {
      const agent = await ctx.db.get(binding.agentId);
      if (!agent || agent.isActive === false) continue;
      // A global agent serves any workspace; a tenant's own agent serves only
      // theirs. Either is fine, another workspace's is not.
      if (agent.companyId && agent.companyId !== companyId) continue;
      return agent;
    }
  }

  throw appError("NOT_CONFIGURED", "No active agent has the opportunity report tools switched on. "
      + "Add them to an agent under its Interfaces screen, then try again.");
}

/**
 * The watchdog: a report whose run died must settle, not sit RUNNING for
 * ever behind a frozen progress bar. Reschedules itself until the report
 * ends one way or the other.
 *
 * A run that dies after both computed passes have landed does not fail the
 * report — every figure is already real and on the row; only the prose is
 * missing, and that is worth an exception line, not a bin. The first live
 * run proved this mode exists: parked for approval mid-run, it resumed,
 * priced the prospects, and declared the whole job done.
 */
export const watchReportInternal = internalMutation({
  args: { reportId: v.id("salesOpportunityReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report || report.status !== "RUNNING") return;

    const now = Date.now();
    const run = report.runId ? await ctx.db.get(report.runId) : null;
    const runEnded =
      !run || run.status === "SUCCESS" || run.status === "FAILED" || run.status === "CANCELLED";
    const tooLong = now - report.startedAt > REPORT_TIMEOUT_MS;

    if (!runEnded && !tooLong) {
      await ctx.scheduler.runAfter(WATCH_TICK_MS, internal.salesOpportunityReports.watchReportInternal, {
        reportId: args.reportId,
      });
      return;
    }

    if (report.phase === "SUMMARY" && report.headline) {
      await ctx.db.patch(args.reportId, {
        status: "COMPLETE_WITH_EXCEPTIONS",
        phase: "DONE",
        exceptions: [
          ...unpricedExceptions(report),
          "The agent never wrote its summary. Every figure below is computed and complete.",
        ],
        updatedAt: now,
        completedAt: now,
      });
      return;
    }

    await ctx.db.patch(args.reportId, {
      status: "FAILED",
      phase: "DONE",
      failureReason: runEnded
        ? "The run ended without finishing the report."
        : "The report took too long and was given up on.",
      updatedAt: now,
      completedAt: now,
    });
  },
});

/** What could not be priced, from the rows — never from anyone's account. */
function unpricedExceptions(report: Doc<"salesOpportunityReports">): string[] {
  return (report.prospects ?? [])
    .filter((prospect) => prospect.confidence === "NONE")
    .map((prospect) => `${prospect.siteName} could not be priced: ${prospect.basis}`);
}

// === The three passes the agent's tools call ==============================

/**
 * The report a tool call is working on.
 *
 * Normally the row `startOpportunityReport` made. A run started from the
 * agent's own admin screen has no report yet, so the first pass makes one —
 * which is what lets "Run Agent" build a real report instead of erroring at
 * the first tool.
 */
async function requireReportForRun(
  ctx: MutationCtx,
  args: { companyId: Id<"companies">; runId?: Id<"agentRuns"> }
): Promise<Doc<"salesOpportunityReports">> {
  const report = await findRunningReport(ctx, args.companyId);
  if (!report) {
    throw appError(
      "CONFLICT",
      "No report is being built. Call the prospect pricing tool first — it opens the report."
    );
  }
  if (report.runId && args.runId && report.runId !== args.runId) {
    throw appError("CONFLICT", "Another run is already building this workspace's report. Stop here.");
  }
  return report;
}

async function findRunningReport(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">
) {
  return await ctx.db
    .query("salesOpportunityReports")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "RUNNING"))
    .first();
}

/** Bedrooms or pupils for one subject, read where the CRM keeps them. */
async function sizeOnFile(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">,
  subjectKey: string,
  customerTypeKey: string
): Promise<number | null> {
  const field = extraFieldForType(customerTypeKey);
  if (!field) return null;
  const details = await ctx.db
    .query("salesDataCustomers")
    .withIndex("by_company_account", (q) =>
      q.eq("companyId", companyId).eq("accountNameKey", subjectKey)
    )
    .unique();
  return details?.[field] ?? null;
}

async function loadComparableCustomers(
  ctx: Pick<QueryCtx, "db">,
  companyId: Id<"companies">,
  importId: Id<"salesDataImports">
): Promise<Array<ComparableCustomer & { customerType: string }>> {
  const accounts = await ctx.db
    .query("salesDataAccounts")
    .withIndex("by_company_import", (q) => q.eq("companyId", companyId).eq("importId", importId))
    .take(ACCOUNT_SCAN_LIMIT);

  return await Promise.all(
    accounts.map(async (account) => ({
      accountNameKey: account.accountNameKey,
      accountName: account.accountName,
      groupNameKey: account.groupNameKey,
      groupName: account.groupName,
      customerTypeKey: account.customerTypeKey,
      customerType: account.customerType,
      totalRevenueGBP: account.totalRevenue,
      size: await sizeOnFile(ctx, companyId, account.accountNameKey, account.customerTypeKey),
    }))
  );
}

/**
 * Pass one: price every NEW prospect against the customers.
 *
 * Also the report's opening move when the run was started from the agent
 * screen rather than the button — see `requireReportForRun`.
 */
export const runMatchingPassInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.optional(v.id("agentRuns")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let report = await findRunningReport(ctx, args.companyId);
    if (!report) {
      report = await openReportForRun(ctx, args);
    } else if (report.runId && args.runId && report.runId !== args.runId) {
      throw appError("CONFLICT", "Another run is already building this workspace's report. Stop here.");
    }
    if (report.phase !== "MATCHING") {
      throw appError("CONFLICT", "The prospects are already priced. Call the group gaps tool next.");
    }

    const customers = await loadComparableCustomers(ctx, args.companyId, report.importId);

    const prospectRows = await ctx.db
      .query("salesDataProspects")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId).eq("status", "NEW"))
      .take(PROSPECT_SCAN_LIMIT);

    const subjects: ProspectSubject[] = await Promise.all(
      prospectRows.map(async (row) => ({
        prospectKey: row.prospectKey,
        siteName: row.siteName,
        groupNameKey: row.groupNameKey,
        groupName: row.groupName,
        customerTypeKey: row.customerTypeKey,
        customerType: row.customerType,
        origin: row.origin ?? "EXISTING_CHAIN",
        size: await sizeOnFile(ctx, args.companyId, row.prospectKey, row.customerTypeKey),
      }))
    );

    const prospects = subjects
      .map((subject) => estimateProspect(subject, customers))
      .sort((a, b) => (b.estimateGBP ?? -1) - (a.estimateGBP ?? -1));

    await ctx.db.patch(report._id, { prospects, phase: "GAPS", updatedAt: now });

    return {
      prospectCount: prospects.length,
      prospects,
      message:
        prospects.length === 0
          ? "No prospects on file yet — the report's first section will be empty. "
            + "Say so in the summary; running prospect research is how it fills."
          : `Priced ${prospects.length} prospects. Call the group gaps tool next.`,
    };
  },
});

/** A report opened by the run itself, when the button did not open one. */
async function openReportForRun(
  ctx: MutationCtx,
  args: { companyId: Id<"companies">; runId?: Id<"agentRuns">; userId?: Id<"users"> }
): Promise<Doc<"salesOpportunityReports">> {
  if (!args.userId) {
    throw appError("NO_ACTIVE_COMPANY", "This run belongs to nobody, so it cannot open a report.");
  }
  const currentImport = await getCurrentImport(ctx, args.companyId);
  if (!currentImport) {
    throw appError("INVALID_INPUT", "No workbook is imported, so there is nothing to price.");
  }
  const now = Date.now();
  const reportId = await ctx.db.insert("salesOpportunityReports", {
    companyId: args.companyId,
    importId: currentImport._id,
    status: "RUNNING",
    phase: "MATCHING",
    runId: args.runId,
    requestedBy: args.userId,
    startedAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(WATCH_TICK_MS, internal.salesOpportunityReports.watchReportInternal, {
    reportId,
  });
  const report = await ctx.db.get(reportId);
  if (!report) throw appError("NOT_FOUND", "The report row vanished as it was made.");
  return report;
}

/** Pass two: find the gaps inside every chain, and compute the headline. */
export const runGapsPassInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.optional(v.id("agentRuns")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const report = await requireReportForRun(ctx, args);
    if (report.phase === "MATCHING") {
      throw appError("CONFLICT", "Price the prospects first — the headline needs both sections.");
    }
    if (report.phase !== "GAPS") {
      throw appError("CONFLICT", "The gaps are already found. Write and save the summary next.");
    }

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", args.companyId).eq("importId", report.importId)
      )
      .take(ACCOUNT_SCAN_LIMIT);

    const members: GroupMemberSpend[] = [];
    // The same sweep that prices the gaps also gathers every product each
    // account buys, so each gap can carry its order sheet: what the sister
    // accounts actually purchase in the category the account is missing.
    const productRows: Array<{
      groupNameKey: string;
      customerTypeKey: string;
      customerType: string;
      accountNameKey: string;
      categoryKey: string;
      category: string;
      productDescription: string;
      spendGBP: number;
    }> = [];
    for (const account of accounts) {
      const rows = await ctx.db
        .query("salesDataRows")
        .withIndex("by_company_import_account_name", (q) =>
          q
            .eq("companyId", args.companyId)
            .eq("importId", report.importId)
            .eq("accountNameKey", account.accountNameKey)
        )
        .take(ACCOUNT_ROW_LIMIT);

      const byCategory = new Map<string, { category: string; spendGBP: number }>();
      for (const row of rows) {
        const entry = byCategory.get(row.productCategoryKey) ?? {
          category: row.productCategory,
          spendGBP: 0,
        };
        entry.spendGBP += row.totalRevenue;
        byCategory.set(row.productCategoryKey, entry);
        productRows.push({
          groupNameKey: account.groupNameKey,
          customerTypeKey: account.customerTypeKey,
          customerType: account.customerType,
          accountNameKey: account.accountNameKey,
          categoryKey: row.productCategoryKey,
          category: row.productCategory,
          productDescription: row.productDescription,
          spendGBP: row.totalRevenue,
        });
      }

      members.push({
        accountNameKey: account.accountNameKey,
        accountName: account.accountName,
        groupNameKey: account.groupNameKey,
        groupName: account.groupName,
        size: await sizeOnFile(ctx, args.companyId, account.accountNameKey, account.customerTypeKey),
        categories: [...byCategory.entries()].map(([categoryKey, entry]) => ({
          categoryKey,
          category: entry.category,
          spendGBP: entry.spendGBP,
        })),
      });
    }

    const { gaps, groupsExamined } = findGroupGaps(members);
    const headline = summariseOpportunities(report.prospects ?? [], gaps, groupsExamined);

    // Each gap's order sheet, in its own table so the report row stays small.
    // The group key comes from the member sweep — gap rows carry only the
    // display name.
    const groupKeyOf = new Map(
      members.map((member) => [member.accountNameKey, member.groupNameKey])
    );
    const gapProducts = buildGapProducts(
      productRows,
      gaps.map((gap) => ({
        accountNameKey: gap.accountNameKey,
        categoryKey: gap.categoryKey,
        groupNameKey: groupKeyOf.get(gap.accountNameKey) ?? "",
      }))
    );
    // The same sweep answers "what would a site like this buy?" for the
    // prospects and suspects, which have no sister accounts to point at.
    for (const basket of buildTypeBaskets(productRows)) {
      await ctx.db.insert("salesOpportunityReportTypeBaskets", {
        companyId: args.companyId,
        reportId: report._id,
        customerTypeKey: basket.customerTypeKey,
        customerType: basket.customerType,
        totalSpendGBP: basket.totalSpendGBP,
        customerCount: basket.customerCount,
        categories: basket.categories,
      });
    }

    for (const entry of gapProducts) {
      await ctx.db.insert("salesOpportunityReportGapProducts", {
        companyId: args.companyId,
        reportId: report._id,
        accountNameKey: entry.accountNameKey,
        categoryKey: entry.categoryKey,
        products: entry.products,
      });
    }

    await ctx.db.patch(report._id, {
      gaps,
      headline,
      phase: "SUMMARY",
      updatedAt: now,
    });

    return {
      gapCount: gaps.length,
      groupsExamined,
      gaps,
      headline,
      message: `Found ${gaps.length} gaps across ${groupsExamined} chains. Write and save the summary next.`,
    };
  },
});

/**
 * Pass three: the agent's prose, checked before it is believed.
 *
 * A summary naming a pound figure the computed sections do not hold is
 * refused with the figures listed, so the agent can correct itself — the
 * "claimed, not recorded" rule applied at write time rather than read time.
 */
export const saveSummaryInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.optional(v.id("agentRuns")),
    summary: v.string(),
    exceptions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const report = await requireReportForRun(ctx, args);
    if (report.phase !== "SUMMARY" || !report.headline) {
      throw appError("CONFLICT", "Both passes must run before the summary: prospects first, then gaps.");
    }

    const allowed = collectReportFigures(
      report.headline,
      report.prospects ?? [],
      report.gaps ?? []
    );
    const unsupported = findUnsupportedFigures(args.summary, allowed);
    if (unsupported.length > 0) {
      throw appError(
        "INVALID_INPUT",
        `The summary names figures the report does not hold: ${unsupported.join(", ")}. `
          + "Quote figures exactly as the tools returned them, then save again."
      );
    }

    // What could not be priced is an exception whether or not the agent says
    // so — the list is built from the rows, then the agent's own lines join it.
    const exceptions = [...new Set([...unpricedExceptions(report), ...(args.exceptions ?? [])])];

    await ctx.db.patch(report._id, {
      summary: args.summary,
      exceptions,
      status: exceptions.length > 0 ? "COMPLETE_WITH_EXCEPTIONS" : "COMPLETE",
      phase: "DONE",
      updatedAt: now,
      completedAt: now,
    });

    return {
      saved: true,
      status: exceptions.length > 0 ? "COMPLETE_WITH_EXCEPTIONS" : "COMPLETE",
      message: "The report is saved and on the Reports page.",
    };
  },
});
