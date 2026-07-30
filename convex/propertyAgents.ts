import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { TenantMutationCtx } from "./tenantFunctions";
import { requireTenant, tenantMutation } from "./tenantFunctions";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

const RIGHTMOVE_AGENT_NAME = "Rightmove Agent";
const RIGHTMOVE_URL_HOST_SUFFIX = "rightmove.co.uk";
const MIN_PROPERTY_LIMIT = 10;
const MAX_PROPERTY_LIMIT = 1000;
const RIGHTMOVE_OBJECTIVE_MAX_LENGTH = 4000;
const ACTIVE_AGENT_LOOKUP_LIMIT = 200;

function isRightmoveHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === RIGHTMOVE_URL_HOST_SUFFIX || normalized.endsWith(`.${RIGHTMOVE_URL_HOST_SUFFIX}`);
}

function normalizeRightmoveUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError("Paste a Rightmove search URL first.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError("Paste a valid Rightmove search URL first.");
  }

  if (parsed.protocol !== "https:" || !isRightmoveHost(parsed.hostname)) {
    throw new ConvexError("Paste a valid Rightmove search URL first.");
  }

  if (!parsed.pathname.toLowerCase().includes("/property-for-sale/")) {
    throw new ConvexError("Paste a Rightmove property search URL first.");
  }

  return parsed.toString();
}

function normalizePropertyLimit(value: number) {
  if (!Number.isFinite(value)) {
    throw new ConvexError("Enter a valid property limit.");
  }
  const integerValue = Math.trunc(value);
  if (integerValue < MIN_PROPERTY_LIMIT || integerValue > MAX_PROPERTY_LIMIT) {
    throw new ConvexError(`Property limit must be between ${MIN_PROPERTY_LIMIT} and ${MAX_PROPERTY_LIMIT}.`);
  }
  return integerValue;
}

function canUseAgentForCompany(agent: Doc<"agents">, companyId: Id<"companies">) {
  return agent.companyId === companyId || !agent.companyId;
}

function chooseRightmoveAgent(agents: Doc<"agents">[], companyId: Id<"companies">) {
  const usableAgents = agents.filter((agent) => agent.isActive !== false && canUseAgentForCompany(agent, companyId));

  return (
    usableAgents.find((agent) => agent.companyId === companyId) ||
    usableAgents.find((agent) => !agent.companyId)
  );
}

async function resolveRightmoveAgent(ctx: TenantMutationCtx, companyId: Id<"companies">) {
  const exactNameMatches = await ctx.db
    .query("agents")
    .withIndex("by_name", (q) => q.eq("name", RIGHTMOVE_AGENT_NAME))
    .take(25);
  const exactMatch = chooseRightmoveAgent(exactNameMatches, companyId);
  if (exactMatch) return exactMatch;

  const activeAgents = await ctx.db
    .query("agents")
    .withIndex("by_active_created", (q) => q.eq("isActive", true))
    .order("desc")
    .take(ACTIVE_AGENT_LOOKUP_LIMIT);
  const normalizedName = RIGHTMOVE_AGENT_NAME.toLowerCase();
  const fallbackMatch = chooseRightmoveAgent(
    activeAgents.filter((agent) => agent.name.trim().toLowerCase() === normalizedName),
    companyId
  );
  if (fallbackMatch) return fallbackMatch;

  throw new ConvexError("The Rightmove Agent is not configured or is inactive.");
}

function buildRightmoveObjective(args: { rightmoveUrl: string; maxProperties: number }) {
  const objective = [
    "Collect property listings from this Rightmove search and file them for the team.",
    `Rightmove search URL: ${args.rightmoveUrl}`,
    `Gather up to ${args.maxProperties} properties.`,
    `Use ${args.maxProperties} as the maxProperties value for this request, even if an example in your instructions shows a different number.`,
    "Start the collection, report that it has started, and stop. Do not wait for every listing or guess final counts.",
  ].join("\n");

  if (objective.length > RIGHTMOVE_OBJECTIVE_MAX_LENGTH) {
    throw new ConvexError("The Rightmove URL is too long to send to the agent.");
  }

  return objective;
}

export const startRightmoveCollection = tenantMutation({
  args: {
    rightmoveUrl: v.string(),
    maxProperties: v.number(),
  },
  returns: v.object({
    agentRunId: v.id("agentRuns"),
    status: v.literal("QUEUED"),
  }),
  handler: async (ctx, args) => {
    const companyId = requireTenant(ctx, "Choose a workspace before gathering properties.");
    const rightmoveUrl = normalizeRightmoveUrl(args.rightmoveUrl);
    const maxProperties = normalizePropertyLimit(args.maxProperties);
    const agent = await resolveRightmoveAgent(ctx, companyId);
    const objective = buildRightmoveObjective({ rightmoveUrl, maxProperties });
    const now = Date.now();
    const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
      agentId: agent._id,
      companyId,
    });

    const agentRunId = await ctx.db.insert("agentRuns", {
      agentId: agent._id,
      agentVersionId,
      triggerType: "MANUAL",
      objective,
      status: "QUEUED",
      companyId,
      userId: ctx.userId,
      startedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: agent._id,
      objective,
      triggerType: "MANUAL",
      runId: agentRunId,
      companyId,
      userId: ctx.userId,
    });

    return {
      agentRunId,
      status: "QUEUED" as const,
    };
  },
});
