import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isAssignableAgentRole, type AgentRoleChoice } from "./utils/agentRoles";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Which agent holds which role, for the Role dropdown on an agent's Settings.
 *
 * Read through the role index, so it costs one row per role holder however
 * many agents there are. Fixed roles (wiki staff, Decisions) are included so
 * the dropdown can show them as taken; only the assignable ones can move.
 */
export const listAgentRoleHolders = superAdminQuery({
  args: {},
  returns: v.array(v.object({
    systemKey: v.string(),
    agentId: v.id("agents"),
    name: v.string(),
  })),
  handler: async (ctx) => {
    const holders = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.gt("systemKey", ""))
      .take(100);
    return holders.map((agent) => ({ systemKey: agent.systemKey!, agentId: agent._id, name: agent.name }));
  },
});

/**
 * Give an agent a role, or take it away, as part of saving its Settings.
 *
 * A fixed role never moves: the wiki staff and the Decisions agent are found
 * by their key, so reassigning one would leave its work running under nobody.
 * An assignable role belongs to one agent at a time — two Collectors would
 * each think the queue was theirs.
 */
export async function applyAgentRole(
  ctx: MutationCtx,
  agent: Doc<"agents">,
  role: AgentRoleChoice,
  userId: Id<"users">,
): Promise<void> {
  const current = agent.systemKey;
  const target = role === "NONE" ? undefined : role;
  if (current === target) return;

  if (current !== undefined && !isAssignableAgentRole(current)) {
    throw appError("INVALID_INPUT", "This agent's role is built in and cannot be changed.");
  }

  if (target !== undefined) {
    const holder = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", target))
      .first();
    if (holder && holder._id !== agent._id) {
      throw appError("CONFLICT", `${holder.name} already has this role. Give it another role first.`);
    }
  }

  await ctx.db.patch(agent._id, { systemKey: target, updatedAt: Date.now() });
  await ctx.db.insert("auditLogs", {
    actorId: userId,
    actionType: "SET_AGENT_ROLE",
    entityId: agent._id,
    entityType: "agents",
    metadata: JSON.stringify({ from: current ?? "NONE", to: role }),
    timestamp: Date.now(),
  });
}
