import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { installBuiltInConnector } from "./aiTools";
import { normalizeKey } from "./salesDataImportService";

/**
 * Put the Comax agents into the state the screens expect, on any deployment.
 *
 * The tools an agent can use are database rows, not code. Deploying the
 * connector *definitions* to production ships the recipe and nothing else:
 * until a super admin installs each connector and switches its tools on for
 * each agent, every Comax agent on that deployment is bare, and the screens
 * that drive them fail at the point of use with "no active agent has the
 * tools switched on".
 *
 * Doing that by hand is four agents × up to six tools across three
 * connectors, on every environment, in a UI where a missed switch looks
 * identical to a deliberate one. So the intended shape is declared here and
 * applied in one pass.
 *
 * The declaration below is not a new opinion — it restates what the runtime
 * already assumes. `provisionResearchWorkers` splits the customer and
 * prospect tools across two workers; market discovery binds its own five plus
 * the web reader; the opportunity report resolves its agent by who holds the
 * save tool. Written down in one table, that becomes checkable.
 */

const RESEARCH_CONNECTOR_KEY = "sales-customer-research";
const MARKET_DISCOVERY_CONNECTOR_KEY = "sales-market-discovery";
const OPPORTUNITY_CONNECTOR_KEY = "sales-opportunity-report";
const WEB_READER_CONNECTOR_KEY = "sonae-firecrawl";

const WEB_READER_MAPPING = "web.scrape";

/**
 * Every mapping this script considers its business.
 *
 * A tool outside this set is left exactly as it is. Somebody may have given a
 * Comax agent the HTTP Request tool or a knowledge search on purpose, and a
 * provisioning script that silently strips it would be worse than one that
 * never ran.
 */
const MANAGED_MAPPINGS = [
  "salesCustomers.research.read",
  "salesCustomers.research.record",
  "salesCustomers.prospects.read",
  "salesCustomers.prospects.record",
  "salesCustomers.job.next",
  "marketDiscovery.job.next",
  "marketDiscovery.groups.record",
  "marketDiscovery.groups.review",
  "marketDiscovery.locations.read",
  "marketDiscovery.locations.record",
  "opportunityReport.matchProspects",
  "opportunityReport.findGroupGaps",
  "opportunityReport.saveSummary",
  WEB_READER_MAPPING,
] as const;

type ComaxAgentPlan = {
  /** Matched against the agent's name, normalised. */
  nameFragment: string;
  label: string;
  mappings: string[];
};

const COMAX_AGENT_PLANS: ComaxAgentPlan[] = [
  {
    nameFragment: "COMPANY RESEARCH",
    label: "Comax - Company Research Agent",
    // Fills in the details of customers already on the books.
    mappings: [
      "salesCustomers.research.read",
      "salesCustomers.research.record",
      "salesCustomers.job.next",
      WEB_READER_MAPPING,
    ],
  },
  {
    nameFragment: "PROSPECT SEARCH",
    label: "Comax - Prospect Search Agent",
    // Finds sibling sites inside groups the workspace already supplies.
    mappings: [
      "salesCustomers.prospects.read",
      "salesCustomers.prospects.record",
      "salesCustomers.job.next",
      WEB_READER_MAPPING,
    ],
  },
  {
    nameFragment: "MARKET DISCOVERY",
    label: "Comax - Market Discovery Agent",
    // Finds parent groups outside the import, and their locations.
    mappings: [
      "marketDiscovery.job.next",
      "marketDiscovery.groups.record",
      "marketDiscovery.groups.review",
      "marketDiscovery.locations.read",
      "marketDiscovery.locations.record",
      WEB_READER_MAPPING,
    ],
  },
  {
    nameFragment: "OPPORTUNITY REPORT",
    label: "Comax - Opportunity Report Agent",
    // Prices the gap. No web reader: every figure comes from our own records,
    // and a report that could browse could also make a number up.
    mappings: [
      "opportunityReport.matchProspects",
      "opportunityReport.findGroupGaps",
      "opportunityReport.saveSummary",
    ],
  },
];

const AGENT_LOOKUP_LIMIT = 500;
const TOOL_LOOKUP_LIMIT = 500;
const BINDING_LOOKUP_LIMIT = 500;

export type ComaxProvisioningResult = {
  summary: string;
  metadata: Record<string, string | number | boolean>;
};

function isComaxAgent(agent: Doc<"agents">) {
  return normalizeKey(agent.name).includes("COMAX");
}

/**
 * The Comax agents' own workspace.
 *
 * Read off the agents rather than matched by company name: the connectors are
 * tenant-restricted, so installing them against the wrong workspace would
 * produce rows that look right and serve nobody. If the agents disagree about
 * which workspace they belong to, that is a real problem and worth stopping
 * for rather than guessing at.
 */
function resolveComaxCompanyId(agents: Doc<"agents">[]) {
  const companyIds = new Set<string>();
  for (const agent of agents) {
    if (agent.companyId) companyIds.add(agent.companyId);
  }

  if (companyIds.size > 1) {
    throw new Error(
      "The Comax agents are split across more than one workspace, so there is no single "
        + "workspace to install the connectors against. Fix the agents' workspace on their "
        + "settings screens, then run this again."
    );
  }

  const [only] = [...companyIds];
  return (only as Id<"companies"> | undefined) ?? undefined;
}

export async function provisionComaxAgents(
  ctx: MutationCtx,
  actorId: Id<"users">
): Promise<ComaxProvisioningResult> {
  const allAgents = await ctx.db.query("agents").take(AGENT_LOOKUP_LIMIT);
  const comaxAgents = allAgents.filter(isComaxAgent);

  if (comaxAgents.length === 0) {
    throw new Error(
      "No agent on this deployment has Comax in its name. Create the Comax agents first, "
        + "then run this script to give them their tools."
    );
  }

  const companyId = resolveComaxCompanyId(comaxAgents);

  // Connectors first: binding an agent to a tool row that does not exist yet
  // is the failure this script exists to prevent.
  const installedConnectors: string[] = [];
  for (const key of [RESEARCH_CONNECTOR_KEY, MARKET_DISCOVERY_CONNECTOR_KEY, OPPORTUNITY_CONNECTOR_KEY]) {
    await installBuiltInConnector(ctx, { key, installedBy: actorId, companyId });
    installedConnectors.push(key);
  }
  // The web reader is a platform connector and global by definition, so it
  // takes no workspace. Installing it here means a fresh deployment does not
  // need a second trip to a different screen before an agent can read a page.
  await installBuiltInConnector(ctx, { key: WEB_READER_CONNECTOR_KEY, installedBy: actorId });
  installedConnectors.push(WEB_READER_CONNECTOR_KEY);

  const tools = await ctx.db.query("aiTools").take(TOOL_LOOKUP_LIMIT);
  const toolsByMapping = new Map<string, Doc<"aiTools">>();
  for (const tool of tools) {
    const existing = toolsByMapping.get(tool.handlerMapping);
    // A tenant's own copy beats a global one for a tenant-restricted connector,
    // and either beats nothing.
    if (!existing || (tool.isActive && !existing.isActive)) {
      toolsByMapping.set(tool.handlerMapping, tool);
    }
  }

  const missingTools: string[] = [];
  const configured: string[] = [];
  const notFound: string[] = [];
  let added = 0;
  let removed = 0;
  let approvalsCleared = 0;

  for (const plan of COMAX_AGENT_PLANS) {
    const agent = comaxAgents.find(
      (candidate) => normalizeKey(candidate.name).includes(plan.nameFragment) && candidate.isActive !== false
    );
    if (!agent) {
      notFound.push(plan.label);
      continue;
    }

    const wanted = new Set(plan.mappings);
    const existingBindings = await ctx.db
      .query("agentTools")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .take(BINDING_LOOKUP_LIMIT);

    const heldMappings = new Set<string>();
    for (const binding of existingBindings) {
      const tool = await ctx.db.get(binding.toolId);
      if (!tool) {
        // A binding to a tool that no longer exists is dead weight either way.
        await ctx.db.delete(binding._id);
        continue;
      }
      heldMappings.add(tool.handlerMapping);

      if (wanted.has(tool.handlerMapping)) continue;
      // Only this script's own mappings are taken away. Anything else on the
      // agent was somebody's decision.
      if (!MANAGED_MAPPINGS.includes(tool.handlerMapping as (typeof MANAGED_MAPPINGS)[number])) continue;

      await ctx.db.delete(binding._id);
      heldMappings.delete(tool.handlerMapping);
      removed += 1;
    }

    for (const mapping of plan.mappings) {
      if (heldMappings.has(mapping)) continue;
      const tool = toolsByMapping.get(mapping);
      if (!tool) {
        missingTools.push(`${plan.label}: ${mapping}`);
        continue;
      }
      await ctx.db.insert("agentTools", {
        agentId: agent._id,
        toolId: tool._id,
        assignedAt: Date.now(),
      });
      added += 1;
    }

    // These agents are driven by a screen with its own progress bar and stop
    // button, and their tools can only write their own job's rows. Left gated,
    // the first thing a run does is park itself in the approval queue behind a
    // bar stuck on step one — which is exactly how the first live opportunity
    // report run was lost.
    if (agent.autonomousToolExecution !== true || agent.humanApprovalRequired === true) {
      await ctx.db.patch(agent._id, {
        autonomousToolExecution: true,
        humanApprovalRequired: false,
        updatedAt: Date.now(),
      });
      approvalsCleared += 1;
    }

    configured.push(plan.label);
  }

  const summaryParts: string[] = [];
  summaryParts.push(
    `${configured.length} of ${COMAX_AGENT_PLANS.length} Comax agents configured: ${added} tool${added === 1 ? "" : "s"} switched on, ${removed} switched off.`
  );
  if (approvalsCleared > 0) {
    summaryParts.push(
      `${approvalsCleared} agent${approvalsCleared === 1 ? " was" : "s were"} still waiting for human approval before every write; ${approvalsCleared === 1 ? "it now runs" : "they now run"} unattended.`
    );
  }
  if (notFound.length > 0) {
    summaryParts.push(`Not found on this deployment, so left alone: ${notFound.join(", ")}.`);
  }
  if (missingTools.length > 0) {
    summaryParts.push(
      `No tool row exists for ${missingTools.length} wanted binding${missingTools.length === 1 ? "" : "s"} (${missingTools.join("; ")}). Check the connector installed cleanly.`
    );
  }

  return {
    summary: summaryParts.join(" "),
    metadata: {
      workspaceScoped: companyId !== undefined,
      connectorsInstalled: installedConnectors.join(", "),
      agentsConfigured: configured.join(", ") || "none",
      agentsNotFound: notFound.join(", ") || "none",
      toolsAdded: added,
      toolsRemoved: removed,
      approvalGatesCleared: approvalsCleared,
      missingToolRows: missingTools.join("; ") || "none",
    },
  };
}
