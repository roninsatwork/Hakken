import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { distinctValues, getCurrentImport, requireSalesDataCompany } from "./salesData";
import { normalizeKey } from "./salesDataImportService";
import { matchDiscoveredSite, type KnownSite } from "./salesDataProspectMatching";
import {
  canonicalSourceUrl,
  isUsableSourceUrl,
  resolveSourceName,
  truncateReasoning,
} from "./salesDataResearchService";
import { getBuiltInToolConnector } from "./toolConnectorDefinitions";
import { isModuleEnabled } from "./utils/companyModules";
import { SALES_DATA_MODULE_KEY } from "./utils/salesDataModule";

const MARKET_DISCOVERY_CONNECTOR_KEY = "sales-market-discovery";
const WEB_READER_MAPPING = "web.scrape";
const PAGE_READ_HANDLER_MAPPING = "web.scrape";

const JOB_TICK_MS = 30_000;
const RUN_SILENCE_MS = 6 * 60 * 1000;
const RUN_TOOL_CALL_LIMIT = 300;
const LOOKUP_LIMIT = 500;
const AGENT_BINDING_LOOKUP_LIMIT = 200;
const GROUPS_PER_CUSTOMER_TYPE = 2;
const DEFAULT_MAX_COST_GBP = 25;

type MarketDiscoveryJob = Doc<"salesDataMarketDiscoveryJobs">;
type MarketDiscoveryGroup = Doc<"salesDataMarketDiscoveryGroups">;

type MarketDiscoveryTask =
  | {
      kind: "FIND_GROUPS";
      instruction: string;
      customerType: string;
      customerTypeKey: string;
      accepted: number;
      target: number;
    }
  | {
      kind: "FIND_LOCATIONS";
      groupName: string;
      groupNameKey: string;
      customerType: string;
      customerTypeKey: string;
      instruction: string;
    };

async function assertSalesDataCompany(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">
) {
  const company = await ctx.db.get(companyId);
  if (!isModuleEnabled(company, SALES_DATA_MODULE_KEY)) {
    throw new Error("Sales Data is not enabled for this workspace.");
  }
}

async function activeJobFor(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">
): Promise<MarketDiscoveryJob | null> {
  return await ctx.db
    .query("salesDataMarketDiscoveryJobs")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "RUNNING"))
    .first();
}

async function pagesReadInRun(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  runId: Id<"agentRuns">
) {
  const calls = await ctx.db
    .query("agentToolCalls")
    .withIndex("by_run_started", (q) => q.eq("runId", runId))
    .take(RUN_TOOL_CALL_LIMIT);

  const pages = new Set<string>();
  for (const call of calls) {
    if (call.handlerMapping !== PAGE_READ_HANDLER_MAPPING || call.status !== "SUCCESS") continue;
    try {
      const args = JSON.parse(call.argumentsJson) as { url?: unknown };
      const canonical = typeof args.url === "string" ? canonicalSourceUrl(args.url) : null;
      if (canonical) pages.add(canonical);
    } catch {
      // Not proof of a read.
    }
  }
  return pages;
}

async function requireRunOpenedSource(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { runId?: Id<"agentRuns">; sourceUrl: string }
) {
  if (!args.runId) {
    return {
      ok: false as const,
      reason: "This write needs a run id so the source can be checked against pages opened this run.",
    };
  }
  const canonical = canonicalSourceUrl(args.sourceUrl);
  if (!canonical) {
    return { ok: false as const, reason: "Give the full web address of the source page." };
  }
  const pages = await pagesReadInRun(ctx, args.runId);
  if (!pages.has(canonical)) {
    return {
      ok: false as const,
      reason: "Open the source page with the web reader in this run before recording it.",
    };
  }
  return { ok: true as const };
}

async function lastStepAt(ctx: Pick<QueryCtx, "db">, runId: Id<"agentRuns">) {
  const step = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return step?.startedAt ?? null;
}

async function runSpendGBP(ctx: Pick<QueryCtx, "db">, run: Doc<"agentRuns">) {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", run._id))
    .take(LOOKUP_LIMIT);
  const fromSteps = steps.reduce((total, step) => total + (step.costGBP ?? 0), 0);
  return Math.max(run.costGBP ?? 0, fromSteps);
}

async function countGroupsByStatus(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  job: MarketDiscoveryJob
) {
  const groups = await ctx.db
    .query("salesDataMarketDiscoveryGroups")
    .withIndex("by_company_job_status", (q) => q.eq("companyId", job.companyId).eq("jobId", job._id))
    .take(LOOKUP_LIMIT);

  return {
    groups,
    accepted: groups.filter((group) => group.status === "ACCEPTED").length,
    rejected: groups.filter((group) => group.status === "REJECTED").length,
    duplicate: groups.filter((group) => group.status === "DUPLICATE").length,
    needsCheck: groups.filter((group) => group.status === "NEEDS_CHECK").length,
  };
}

function progressPercent(job: MarketDiscoveryJob) {
  if (job.status !== "RUNNING") return 100;
  if (job.phase === "SETUP") return 5;
  if (job.phase === "FIND_GROUPS" || job.phase === "VERIFY_GROUPS") {
    const groupProgress = Math.min(1, job.groupsAccepted / Math.max(1, job.targetGroupCount));
    return Math.round(5 + groupProgress * 55);
  }
  if (job.phase === "FIND_LOCATIONS") {
    const accepted = Math.max(1, job.groupsAccepted);
    const completed = Math.min(1, (job.locationsFiled + job.locationsDuplicate + job.locationsNeedsCheck) / accepted);
    return Math.round(60 + completed * 35);
  }
  return 100;
}

function targetTypesForJob(job: MarketDiscoveryJob) {
  return job.customerTypes && job.customerTypes.length > 0
    ? job.customerTypes
    : [{
        customerType: job.customerType,
        customerTypeKey: job.customerTypeKey,
        targetGroupCount: job.targetGroupCount,
      }];
}

function acceptedCountForType(groups: MarketDiscoveryGroup[], customerTypeKey: string) {
  return groups.filter(
    (group) => group.status === "ACCEPTED" && group.customerTypeKey === customerTypeKey
  ).length;
}

function describePhase(job: MarketDiscoveryJob) {
  switch (job.phase) {
    case "SETUP": return "Setting up";
    case "FIND_GROUPS": return "Finding parent groups";
    case "VERIFY_GROUPS": return "Checking groups";
    case "FIND_LOCATIONS": return "Finding locations";
    case "DONE": return "Done";
  }
}

async function describeJob(ctx: Pick<QueryCtx, "db">, job: MarketDiscoveryJob) {
  let spentGBP = job.spentGBP;
  if (job.runId) {
    const run = await ctx.db.get(job.runId);
    if (run) spentGBP += await runSpendGBP(ctx, run);
  }
  return {
    status: job.status,
    phase: job.phase,
    phaseLabel: describePhase(job),
    percent: progressPercent(job),
    customerType: job.customerType,
    targetGroupCount: job.targetGroupCount,
    groupsAccepted: job.groupsAccepted,
    groupsRejected: job.groupsRejected,
    groupsDuplicate: job.groupsDuplicate,
    groupsNeedsCheck: job.groupsNeedsCheck,
    locationsFiled: job.locationsFiled,
    locationsDuplicate: job.locationsDuplicate,
    locationsNeedsCheck: job.locationsNeedsCheck,
    currentLabel: job.currentLabel ?? null,
    spentGBP: Number(spentGBP.toFixed(2)),
    maxCostGBP: job.maxCostGBP,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt ?? null,
    endedReason: job.endedReason ?? null,
  };
}

async function updateJobCounts(ctx: MutationCtx, jobId: Id<"salesDataMarketDiscoveryJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job) return null;
  const { accepted, rejected, duplicate, needsCheck } = await countGroupsByStatus(ctx, job);
  await ctx.db.patch(job._id, {
    groupsAccepted: accepted,
    groupsRejected: rejected,
    groupsDuplicate: duplicate,
    groupsNeedsCheck: needsCheck,
    updatedAt: Date.now(),
  });
  return await ctx.db.get(job._id);
}

async function findMarketDiscoveryAgent(ctx: Pick<MutationCtx, "db">, companyId: Id<"companies">) {
  const tool = await ctx.db
    .query("aiTools")
    .withIndex("by_connector_key", (q) => q.eq("connectorKey", MARKET_DISCOVERY_CONNECTOR_KEY))
    .take(AGENT_BINDING_LOOKUP_LIMIT);
  const jobTool = tool.find((row) => row.handlerMapping === "marketDiscovery.job.next");
  if (jobTool) {
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_tool", (q) => q.eq("toolId", jobTool._id))
      .take(AGENT_BINDING_LOOKUP_LIMIT);
    for (const binding of bindings) {
      const agent = await ctx.db.get(binding.agentId);
      if (!agent || agent.isActive === false) continue;
      if (agent.companyId && agent.companyId !== companyId) continue;
      return agent;
    }
  }

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_active_created", (q) => q.eq("isActive", true))
    .order("desc")
    .take(AGENT_BINDING_LOOKUP_LIMIT);
  return (
    agents.find((agent) =>
      (!agent.companyId || agent.companyId === companyId)
      && normalizeKey(agent.name).includes("MARKET DISCOVERY")
    )
    ?? null
  );
}

const MARKET_DISCOVERY_TOOL_MAPPINGS = [
  "marketDiscovery.job.next",
  "marketDiscovery.groups.record",
  "marketDiscovery.groups.review",
  "marketDiscovery.locations.read",
  "marketDiscovery.locations.record",
  WEB_READER_MAPPING,
] as const;

function builtInToolForMapping(mapping: string) {
  for (const connectorKey of [MARKET_DISCOVERY_CONNECTOR_KEY, "sonae-firecrawl"]) {
    const connector = getBuiltInToolConnector(connectorKey);
    const definition = connector?.toolDefinitions.find((tool) => tool.handlerMapping === mapping);
    if (connector && definition) return { connector, definition };
  }
  return null;
}

const MARKET_DISCOVERY_PROMPT = `You find new parent companies for Comax, then file their locations as market-discovery prospects.

HOW THIS RUN WORKS
1. Call "Comax — Market discovery next task" first. It tells you one customer type, the target number of parent groups and whether you should find groups or locations.
2. Work on that one customer type only. Do not switch types in the same run.
3. For parent groups, search outside the imported customer list. Do not use groups Comax already sells to, and do not use groups already filed as prospects.
4. Open the source page before recording anything. Search snippets are not proof.
5. Record parent groups as you find them. High-confidence groups need a page proving the parent exists and belongs to the selected customer type.
6. When the job tells you to find locations, use the accepted parent group it gives you. Prefer official/provider-owned location lists.
7. File locations as you find them. Every location needs a source page that lists it.
8. Keep asking for the next task until the job says there is nothing left, then stop and say what was found.

BEING HONEST
- Never infer a parent company from a search result, a directory category, a news article, a recruiter page or a supplier page.
- A parent company needs source proof that it exists and belongs to the selected customer type.
- A location needs source proof from a page opened in this run.
- If a group or location is uncertain, park it for review instead of filing it as a clean prospect.
- A duplicate is a useful outcome. Report it and move on.`;

async function ensureAgentBindings(
  ctx: MutationCtx,
  args: { agent: Doc<"agents">; companyId: Id<"companies">; userId: Id<"users"> }
) {
  const tools = await ctx.db.query("aiTools").take(LOOKUP_LIMIT);
  const byMapping = new Map(tools.map((tool) => [tool.handlerMapping, tool]));

  for (const mapping of MARKET_DISCOVERY_TOOL_MAPPINGS) {
    let tool = byMapping.get(mapping);
    if (!tool) {
      const builtIn = builtInToolForMapping(mapping);
      if (builtIn) {
        const toolId = await ctx.db.insert("aiTools", {
          name: builtIn.definition.name,
          description: builtIn.definition.description,
          handlerMapping: builtIn.definition.handlerMapping,
          connectorKey: builtIn.connector.key,
          secretRefKeys: builtIn.definition.secretRefKeys ?? [],
          requiredRole: builtIn.definition.requiredRole,
          inputSchema: builtIn.definition.inputSchema,
          outputSchema: builtIn.definition.outputSchema,
          sideEffectLevel: builtIn.definition.sideEffectLevel,
          confirmationRequired: builtIn.definition.confirmationRequired,
          isActive: true,
          version: 1,
          updatedAt: Date.now(),
          createdAt: Date.now(),
          createdBy: args.userId,
        });
        tool = await ctx.db.get(toolId) ?? undefined;
        if (tool) byMapping.set(mapping, tool);
      }
    }
    if (!tool) {
      throw new ConvexError(
        "The market discovery tools are not installed yet. Install the Comax Market Discovery connector first."
      );
    }
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .take(AGENT_BINDING_LOOKUP_LIMIT);
    if (bindings.some((binding) => binding.agentId === args.agent._id)) continue;
    await ctx.db.insert("agentTools", {
      agentId: args.agent._id,
      toolId: tool._id,
      assignedAt: Date.now(),
    });
  }

  await ctx.db.patch(args.agent._id, {
    systemPrompt: MARKET_DISCOVERY_PROMPT,
    ...(args.agent.maxSteps === undefined ? { maxSteps: 700 } : {}),
    ...(args.agent.maxToolCalls === undefined ? { maxToolCalls: 700 } : {}),
    ...(args.agent.maxRuntimeMs === undefined ? { maxRuntimeMs: 3_600_000 } : {}),
    ...(args.agent.maxInputTokens === undefined ? { maxInputTokens: 5_000_000 } : {}),
    ...(args.agent.maxCostGBP === undefined ? { maxCostGBP: DEFAULT_MAX_COST_GBP } : {}),
    updatedAt: Date.now(),
  });
}

async function requireMarketDiscoveryAgent(
  ctx: MutationCtx,
  args: { companyId: Id<"companies">; userId: Id<"users"> }
) {
  const { companyId } = args;
  const agent = await findMarketDiscoveryAgent(ctx, companyId);
  if (!agent) {
    throw new ConvexError(
      "No active Market Discovery Agent was found. Create or activate an agent named Market Discovery Agent, then try again."
    );
  }
  await ensureAgentBindings(ctx, { agent, companyId, userId: args.userId });
  return await ctx.db.get(agent._id) ?? agent;
}

async function groupExistsInWorkspace(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  args: { companyId: Id<"companies">; groupNameKey: string }
) {
  const currentImport = await getCurrentImport(ctx, args.companyId);
  if (currentImport) {
    const accountGroup = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q.eq("companyId", args.companyId).eq("importId", currentImport._id).eq("groupNameKey", args.groupNameKey)
      )
      .first();
    if (accountGroup) return true;
  }

  const prospectGroup = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_group", (q) =>
      q.eq("companyId", args.companyId).eq("groupNameKey", args.groupNameKey)
    )
    .first();
  return Boolean(prospectGroup);
}

async function loadKnownSitesForWorkspace(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  companyId: Id<"companies">
): Promise<KnownSite[]> {
  const currentImport = await getCurrentImport(ctx, companyId);
  const known: KnownSite[] = [];
  if (currentImport) {
    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) => q.eq("companyId", companyId).eq("importId", currentImport._id))
      .take(LOOKUP_LIMIT);
    for (const account of accounts) {
      const details = await ctx.db
        .query("salesDataCustomers")
        .withIndex("by_company_account", (q) =>
          q.eq("companyId", companyId).eq("accountNameKey", account.accountNameKey)
        )
        .unique();
      known.push({
        key: account.accountNameKey,
        name: account.accountName,
        groupName: account.groupName,
        ...(details?.postcode ? { postcode: details.postcode } : {}),
      });
    }
  }

  const prospects = await ctx.db
    .query("salesDataProspects")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "NEW"))
    .take(LOOKUP_LIMIT);
  known.push(...prospects.map((prospect) => ({
    key: prospect.prospectKey,
    name: prospect.siteName,
    groupName: prospect.groupName,
    ...(prospect.postcode ? { postcode: prospect.postcode } : {}),
  })));
  return known;
}

async function nextAcceptedGroupForLocations(ctx: MutationCtx, jobId: Id<"salesDataMarketDiscoveryJobs">) {
  const inProgress = await ctx.db
    .query("salesDataMarketDiscoveryGroups")
    .withIndex("by_job_locations_status", (q) => q.eq("jobId", jobId).eq("locationsStatus", "IN_PROGRESS"))
    .first();
  if (inProgress) return inProgress;

  return await ctx.db
    .query("salesDataMarketDiscoveryGroups")
    .withIndex("by_job_locations_status", (q) => q.eq("jobId", jobId).eq("locationsStatus", "PENDING"))
    .first();
}

async function finishJob(
  ctx: MutationCtx,
  args: {
    job: MarketDiscoveryJob;
    status: "COMPLETE" | "COMPLETE_WITH_EXCEPTIONS" | "STOPPED" | "FAILED";
    reason: string;
  }
) {
  const now = Date.now();
  await ctx.db.patch(args.job._id, {
    status: args.status,
    phase: "DONE",
    currentLabel: undefined,
    endedReason: args.reason,
    finishedAt: now,
    updatedAt: now,
  });
}

async function selectNextTask(ctx: MutationCtx, job: MarketDiscoveryJob): Promise<MarketDiscoveryTask | null> {
  const refreshed = await updateJobCounts(ctx, job._id);
  if (!refreshed) return null;
  const { groups } = await countGroupsByStatus(ctx, refreshed);
  const targetTypes = targetTypesForJob(refreshed);
  const nextType = targetTypes.find(
    (type) => acceptedCountForType(groups, type.customerTypeKey) < type.targetGroupCount
  );

  if (nextType) {
    if (refreshed.phase !== "FIND_GROUPS") {
      await ctx.db.patch(refreshed._id, {
        phase: "FIND_GROUPS",
        currentLabel: nextType.customerType,
        updatedAt: Date.now(),
      });
    } else if (refreshed.currentLabel !== nextType.customerType) {
      await ctx.db.patch(refreshed._id, {
        currentLabel: nextType.customerType,
        updatedAt: Date.now(),
      });
    }
    const accepted = acceptedCountForType(groups, nextType.customerTypeKey);
    return {
      kind: "FIND_GROUPS",
      instruction:
        `Find parent companies in ${nextType.customerType} that are not already in this workspace. `
        + "Record each candidate as soon as you have opened a proof page.",
      customerType: nextType.customerType,
      customerTypeKey: nextType.customerTypeKey,
      accepted,
      target: nextType.targetGroupCount,
    };
  }

  const group = await nextAcceptedGroupForLocations(ctx, refreshed._id);
  if (group) {
    await ctx.db.patch(group._id, {
      locationsStatus: "IN_PROGRESS",
      locationsAttemptedAt: Date.now(),
    });
    await ctx.db.patch(refreshed._id, {
      phase: "FIND_LOCATIONS",
      currentLabel: group.groupName,
      updatedAt: Date.now(),
    });
    return {
      kind: "FIND_LOCATIONS",
      groupName: group.groupName,
      groupNameKey: group.groupNameKey,
      customerType: group.customerType,
      customerTypeKey: group.customerTypeKey,
      instruction:
        `Find the locations run by ${group.groupName}. Record each location with a source page, `
        + "and ask for the next task when the group's locations have been attempted.",
    };
  }

  const status =
    refreshed.groupsNeedsCheck > 0 || refreshed.locationsNeedsCheck > 0
      ? "COMPLETE_WITH_EXCEPTIONS"
      : "COMPLETE";
  await finishJob(ctx, {
    job: refreshed,
    status,
    reason:
      status === "COMPLETE"
        ? `Found ${refreshed.groupsAccepted} parent groups and filed ${refreshed.locationsFiled} locations.`
        : `Found ${refreshed.groupsAccepted} parent groups and filed ${refreshed.locationsFiled} locations, with ${refreshed.groupsNeedsCheck + refreshed.locationsNeedsCheck} items to check.`,
  });
  return null;
}

export const startMarketDiscoveryJob = tenantMutation({
  args: {},
  returns: v.object({
    started: v.boolean(),
    alreadyRunning: v.optional(v.boolean()),
    jobId: v.optional(v.id("salesDataMarketDiscoveryJobs")),
  }),
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const running = await activeJobFor(ctx, companyId);
    if (running) return { started: false, alreadyRunning: true, jobId: running._id };

    const currentImport = await getCurrentImport(ctx, companyId);
    if (!currentImport) throw new ConvexError("Import a workbook first so the customer type can be checked.");

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import", (q) =>
        q.eq("companyId", companyId).eq("importId", currentImport._id)
      )
      .collect();
    const customerTypes = distinctValues(accounts, (account) => account.customerType)
      .map((customerType) => ({
        customerType,
        customerTypeKey: normalizeKey(customerType),
        targetGroupCount: GROUPS_PER_CUSTOMER_TYPE,
      }));
    if (customerTypes.length === 0) throw new ConvexError("Import a workbook with customer types first.");

    const totalTargetGroupCount = customerTypes.reduce(
      (total, type) => total + type.targetGroupCount,
      0
    );

    const agent = await requireMarketDiscoveryAgent(ctx, { companyId, userId: ctx.userId });
    const now = Date.now();
    const jobId = await ctx.db.insert("salesDataMarketDiscoveryJobs", {
      companyId,
      customerType: "All customer types",
      customerTypeKey: "ALL_CUSTOMER_TYPES",
      targetGroupCount: totalTargetGroupCount,
      customerTypes,
      status: "RUNNING",
      phase: "SETUP",
      agentId: agent._id,
      startedBy: ctx.userId,
      groupsAccepted: 0,
      groupsRejected: 0,
      groupsDuplicate: 0,
      groupsNeedsCheck: 0,
      locationsFiled: 0,
      locationsDuplicate: 0,
      locationsNeedsCheck: 0,
      currentLabel: "All customer types",
      maxCostGBP: agent.maxCostGBP ?? DEFAULT_MAX_COST_GBP,
      spentGBP: 0,
      startedAt: now,
      updatedAt: now,
    });

    const agentVersionId = await ensureAgentVersionSnapshot(ctx, { agentId: agent._id, companyId });
    const objective = [
      "Run market discovery for every customer type in this workspace.",
      `Find ${GROUPS_PER_CUSTOMER_TYPE} new parent companies per customer type that Comax does not already sell to.`,
      "Then find locations for each accepted parent company and file them as market-discovery prospects.",
      "Use the market discovery job tool for every next task and stop when it says there is nothing left.",
    ].join(" ");
    const runId = await ctx.db.insert("agentRuns", {
      agentId: agent._id,
      agentVersionId,
      triggerType: "MANUAL",
      objective,
      title: "Market discovery · all customer types",
      status: "QUEUED",
      companyId,
      userId: ctx.userId,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(jobId, { runId, phase: "FIND_GROUPS", updatedAt: now });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: agent._id,
      objective,
      triggerType: "MANUAL",
      runId,
      companyId,
      userId: ctx.userId,
    });
    await ctx.scheduler.runAfter(JOB_TICK_MS, internal.salesDataMarketDiscovery.watchJobInternal, {
      jobId,
    });

    return { started: true, jobId };
  },
});

export const stopMarketDiscoveryJob = tenantMutation({
  args: {},
  returns: v.object({ stopped: v.boolean() }),
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const job = await activeJobFor(ctx, companyId);
    if (!job) return { stopped: false };

    const now = Date.now();
    if (job.runId) {
      const run = await ctx.db.get(job.runId);
      if (run && (run.status === "QUEUED" || run.status === "RUNNING" || run.status === "PENDING_APPROVAL")) {
        await ctx.db.patch(run._id, {
          status: "CANCELLED",
          finalOutput: "Market discovery stopped from the Customers screen.",
          completedAt: now,
          cancelledAt: now,
          updatedAt: now,
        });
      }
    }

    await finishJob(ctx, {
      job,
      status: "STOPPED",
      reason: `Stopped with ${job.groupsAccepted} parent groups accepted and ${job.locationsFiled} locations filed.`,
    });
    return { stopped: true };
  },
});

export const getMarketDiscoveryJob = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = await requireSalesDataCompany(ctx);
    const job =
      (await activeJobFor(ctx, companyId))
      ?? (await ctx.db
        .query("salesDataMarketDiscoveryJobs")
        .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
        .order("desc")
        .first());
    if (!job) return null;
    return await describeJob(ctx, job);
  },
});

export const nextTaskInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    runId: v.optional(v.id("agentRuns")),
    previousOutcome: v.optional(v.union(v.literal("DONE"), v.literal("COULD_NOT"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) {
      return { done: true as const, task: null, message: "There is no market discovery job running." };
    }
    if (job.runId && args.runId && job.runId !== args.runId) {
      return { done: true as const, task: null, message: "Another run owns this market discovery job. Stop here." };
    }

    if (args.previousOutcome === "DONE" && job.phase === "FIND_LOCATIONS") {
      const current = await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_locations_status", (q) =>
          q.eq("jobId", job._id).eq("locationsStatus", "IN_PROGRESS")
        )
        .first();
      if (current) {
        await ctx.db.patch(current._id, {
          locationsStatus: "DONE",
          locationsEndedReason: args.note?.slice(0, 500),
          updatedAt: Date.now(),
        });
      }
    }

    const task = await selectNextTask(ctx, job);
    if (!task) {
      return { done: true as const, task: null, message: "Market discovery is complete. Stop and say what you found." };
    }

    return { done: false as const, task };
  },
});

export const recordGroupInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    groupName: v.string(),
    customerType: v.string(),
    website: v.optional(v.string()),
    sourceUrl: v.string(),
    sourceName: v.optional(v.string()),
    reasoning: v.string(),
    confidence: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"))),
    agentId: v.optional(v.id("agents")),
    runId: v.optional(v.id("agentRuns")),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) return { recorded: false as const, reason: "There is no market discovery job running." };
    if (job.runId && args.runId && job.runId !== args.runId) {
      return { recorded: false as const, reason: "Another run owns this market discovery job." };
    }

    const groupName = args.groupName.trim();
    const reasoning = truncateReasoning(args.reasoning);
    if (!groupName) return { recorded: false as const, reason: "Give the parent company name." };
    if (!reasoning) return { recorded: false as const, reason: "Give one line of reasoning for the parent company." };
    if (!isUsableSourceUrl(args.sourceUrl)) {
      return { recorded: false as const, reason: "A parent company needs the source page that proves it." };
    }
    const proof = await requireRunOpenedSource(ctx, { runId: args.runId, sourceUrl: args.sourceUrl });
    if (!proof.ok) return { recorded: false as const, reason: proof.reason };

    const groupNameKey = normalizeKey(groupName);
    const candidateTypeKey = normalizeKey(args.customerType);
    const targetTypes = targetTypesForJob(job);
    const targetType = targetTypes.find((type) => type.customerTypeKey === candidateTypeKey);
    const duplicate = await groupExistsInWorkspace(ctx, { companyId: args.companyId, groupNameKey });
    const earlier = await ctx.db
      .query("salesDataMarketDiscoveryGroups")
      .withIndex("by_company_group", (q) => q.eq("companyId", args.companyId).eq("groupNameKey", groupNameKey))
      .first();
    const { groups } = await countGroupsByStatus(ctx, job);
    const typeTargetAlreadyMet =
      targetType
      && acceptedCountForType(groups, targetType.customerTypeKey) >= targetType.targetGroupCount;
    const wrongType = !targetType;
    const status: MarketDiscoveryGroup["status"] =
      duplicate || earlier
        ? "DUPLICATE"
        : wrongType || typeTargetAlreadyMet
          ? "REJECTED"
          : args.confidence === "HIGH"
            ? "ACCEPTED"
            : "NEEDS_CHECK";

    const groupId = await ctx.db.insert("salesDataMarketDiscoveryGroups", {
      companyId: args.companyId,
      jobId: job._id,
      groupName,
      groupNameKey,
      customerType: args.customerType.trim() || job.customerType,
      customerTypeKey: candidateTypeKey || job.customerTypeKey,
      ...(args.website?.trim() ? { website: args.website.trim() } : {}),
      sourceUrl: args.sourceUrl.trim(),
      sourceName: resolveSourceName(args.sourceName, args.sourceUrl),
      reasoning,
      status,
      locationsStatus: status === "ACCEPTED" ? "PENDING" : "DONE",
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      foundAt: Date.now(),
    });

    const updated = await updateJobCounts(ctx, job._id);
    await ctx.db.patch(job._id, { currentLabel: groupName, updatedAt: Date.now() });

    if (status === "DUPLICATE") {
      return { recorded: false as const, duplicate: true as const, groupId, reason: `${groupName} is already known in this workspace.` };
    }
    if (status === "REJECTED") {
      return {
        recorded: false as const,
        rejected: true as const,
        groupId,
        reason: typeTargetAlreadyMet
          ? `${targetType?.customerType ?? args.customerType} already has its ${GROUPS_PER_CUSTOMER_TYPE} parent groups.`
          : `${groupName} does not match a customer type in this market discovery job.`,
      };
    }
    return {
      recorded: status === "ACCEPTED",
      needsCheck: status === "NEEDS_CHECK",
      groupId,
      groupsAccepted: updated?.groupsAccepted ?? job.groupsAccepted,
      targetGroupCount: job.targetGroupCount,
      message:
        status === "ACCEPTED"
          ? `${groupName} accepted for market discovery.`
          : `${groupName} parked for a person to check.`,
    };
  },
});

export const reviewGroupInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    groupName: v.string(),
    status: v.union(
      v.literal("ACCEPTED"),
      v.literal("NEEDS_CHECK"),
      v.literal("DUPLICATE"),
      v.literal("REJECTED")
    ),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) return { updated: false as const, reason: "There is no market discovery job running." };
    const groupNameKey = normalizeKey(args.groupName);
    const group = await ctx.db
      .query("salesDataMarketDiscoveryGroups")
      .withIndex("by_company_group", (q) => q.eq("companyId", args.companyId).eq("groupNameKey", groupNameKey))
      .first();
    if (!group || group.jobId !== job._id) return { updated: false as const, reason: "That group is not in this job." };
    await ctx.db.patch(group._id, {
      status: args.status,
      locationsStatus: args.status === "ACCEPTED" ? "PENDING" : "DONE",
    });
    await updateJobCounts(ctx, job._id);
    return { updated: true as const, status: args.status };
  },
});

export const readLocationsTaskInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    groupName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) return { found: false as const, message: "There is no market discovery job running." };
    const group = args.groupName
      ? await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_company_group", (q) => q.eq("companyId", args.companyId).eq("groupNameKey", normalizeKey(args.groupName ?? "")))
        .first()
      : await ctx.db
        .query("salesDataMarketDiscoveryGroups")
        .withIndex("by_job_locations_status", (q) => q.eq("jobId", job._id).eq("locationsStatus", "IN_PROGRESS"))
        .first();
    if (!group || group.jobId !== job._id || group.status !== "ACCEPTED") {
      return { found: false as const, message: "Ask for a location task before reading locations." };
    }
    return {
      found: true as const,
      group: {
        groupName: group.groupName,
        customerType: group.customerType,
        website: group.website ?? null,
        sourceUrl: group.sourceUrl,
        reasoning: group.reasoning,
      },
      knownSites: await loadKnownSitesForWorkspace(ctx, args.companyId),
    };
  },
});

export const recordLocationInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    groupName: v.string(),
    siteName: v.string(),
    town: v.optional(v.string()),
    postcode: v.optional(v.string()),
    sourceUrl: v.string(),
    sourceName: v.optional(v.string()),
    reasoning: v.string(),
    agentId: v.optional(v.id("agents")),
    runId: v.optional(v.id("agentRuns")),
  },
  handler: async (ctx, args) => {
    await assertSalesDataCompany(ctx, args.companyId);
    const job = await activeJobFor(ctx, args.companyId);
    if (!job) return { recorded: false as const, reason: "There is no market discovery job running." };
    if (job.runId && args.runId && job.runId !== args.runId) {
      return { recorded: false as const, reason: "Another run owns this market discovery job." };
    }
    const siteName = args.siteName.trim();
    const reasoning = truncateReasoning(args.reasoning);
    if (!siteName) return { recorded: false as const, reason: "Give the location name." };
    if (!reasoning) return { recorded: false as const, reason: "Give one line of reasoning for this location." };
    if (!isUsableSourceUrl(args.sourceUrl)) {
      return { recorded: false as const, reason: "A location needs the source page that lists it." };
    }
    const proof = await requireRunOpenedSource(ctx, { runId: args.runId, sourceUrl: args.sourceUrl });
    if (!proof.ok) return { recorded: false as const, reason: proof.reason };

    const group = await ctx.db
      .query("salesDataMarketDiscoveryGroups")
      .withIndex("by_company_group", (q) => q.eq("companyId", args.companyId).eq("groupNameKey", normalizeKey(args.groupName)))
      .first();
    if (!group || group.jobId !== job._id || group.status !== "ACCEPTED") {
      return { recorded: false as const, reason: "Record locations only for the accepted group the job gave you." };
    }

    const known = await loadKnownSitesForWorkspace(ctx, args.companyId);
    const match = matchDiscoveredSite(
      {
        siteName,
        groupName: group.groupName,
        ...(args.postcode?.trim() ? { postcode: args.postcode.trim() } : {}),
      },
      known
    );
    if (match.outcome === "KNOWN") {
      await ctx.db.patch(job._id, {
        locationsDuplicate: job.locationsDuplicate + 1,
        currentLabel: siteName,
        updatedAt: Date.now(),
      });
      return {
        recorded: false as const,
        alreadyKnown: true as const,
        matched: match.matched.name,
        reason: `${siteName} is already on file as "${match.matched.name}".`,
      };
    }

    const sourceUrl = args.sourceUrl.trim();
    const prospectId = await ctx.db.insert("salesDataProspects", {
      companyId: args.companyId,
      prospectKey: normalizeKey(siteName),
      siteName,
      groupName: group.groupName,
      groupNameKey: group.groupNameKey,
      customerType: group.customerType,
      customerTypeKey: group.customerTypeKey,
      ...(args.town?.trim() ? { town: args.town.trim() } : {}),
      ...(args.postcode?.trim() ? { postcode: args.postcode.trim() } : {}),
      status: "NEW",
      ...(match.outcome === "CONFLICT" ? { conflictNote: match.note } : {}),
      sourceUrl,
      sourceName: resolveSourceName(args.sourceName, sourceUrl),
      reasoning,
      origin: "MARKET_DISCOVERY",
      marketDiscoveryGroupId: group._id,
      marketDiscoveryJobId: job._id,
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      foundAt: Date.now(),
    });
    await ctx.db.patch(job._id, {
      locationsFiled: job.locationsFiled + 1,
      locationsNeedsCheck: job.locationsNeedsCheck + (match.outcome === "CONFLICT" ? 1 : 0),
      currentLabel: siteName,
      updatedAt: Date.now(),
    });

    return {
      recorded: true as const,
      prospectId,
      prospectKey: normalizeKey(siteName),
      conflict: match.outcome === "CONFLICT",
      message:
        match.outcome === "CONFLICT"
          ? `Filed as a market-discovery prospect, with a clash to check: ${match.note}`
          : `Filed as a market-discovery prospect in ${group.groupName}.`,
    };
  },
});

export const watchJobInternal = internalMutation({
  args: { jobId: v.id("salesDataMarketDiscoveryJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RUNNING") return;
    const now = Date.now();
    if (!job.runId) return;
    const run = await ctx.db.get(job.runId);
    if (!run) {
      await finishJob(ctx, { job, status: "FAILED", reason: "The market discovery run could not be found." });
      return;
    }
    const running = run.status === "QUEUED" || run.status === "RUNNING" || run.status === "PENDING_APPROVAL";
    const lastActivityAt = running ? await lastStepAt(ctx, run._id) : null;
    const goneQuiet = running && lastActivityAt !== null && now - lastActivityAt > RUN_SILENCE_MS;
    if (running && !goneQuiet) {
      await ctx.scheduler.runAfter(JOB_TICK_MS, internal.salesDataMarketDiscovery.watchJobInternal, {
        jobId: job._id,
      });
      return;
    }
    const spend = await runSpendGBP(ctx, run);
    await ctx.db.patch(job._id, { spentGBP: job.spentGBP + spend, updatedAt: now });
    if (run.status === "CANCELLED") {
      await finishJob(ctx, {
        job,
        status: "STOPPED",
        reason: `Stopped with ${job.groupsAccepted} parent groups accepted and ${job.locationsFiled} locations filed.`,
      });
      return;
    }
    if (goneQuiet) {
      await ctx.db.patch(run._id, {
        status: "FAILED",
        error: "The run stopped responding and the market discovery job moved on.",
        completedAt: now,
        updatedAt: now,
      });
      await finishJob(ctx, {
        job,
        status: "FAILED",
        reason: "The market discovery run stopped responding.",
      });
      return;
    }
    const refreshed = await updateJobCounts(ctx, job._id);
    if (!refreshed) return;
    const status =
      refreshed.groupsNeedsCheck > 0 || refreshed.locationsNeedsCheck > 0
        ? "COMPLETE_WITH_EXCEPTIONS"
        : "COMPLETE";
    await finishJob(ctx, {
      job: refreshed,
      status,
      reason:
        status === "COMPLETE"
          ? `Found ${refreshed.groupsAccepted} parent groups and filed ${refreshed.locationsFiled} locations.`
          : `Found ${refreshed.groupsAccepted} parent groups and filed ${refreshed.locationsFiled} locations, with ${refreshed.groupsNeedsCheck + refreshed.locationsNeedsCheck} items to check.`,
    });
  },
});
