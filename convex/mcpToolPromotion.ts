/**
 * Turning what a server said it offers into tools an agent could be given.
 *
 * Phase 3 of `docs/plans/active/tool-server-plan.md`, and the phase that carries
 * the risk. Discovery (phase 2) records what a server claims; this is the step
 * that lets those claims into the tool library, where an agent can be bound to
 * them.
 *
 * Three things make that safe, and each is deliberate:
 *
 * 1. **Every imported tool has an owner.** `companyId` is set from the server,
 *    which is what `isToolVisibleToCompany` reads when a run resolves its tools.
 *    A global agent running for another company never sees them.
 * 2. **Nothing is believed.** The protocol lets a server say a tool is
 *    read-only, and the specification says explicitly not to trust that. So
 *    everything arrives as `EXTERNAL`, which the approval rules treat as "always
 *    ask", and inactive until a person switches it on.
 * 3. **Nothing can run yet.** The handler these point at is not registered with
 *    the dispatcher until phase 4, and the dispatcher refuses anything it does
 *    not recognise. The rows exist, are visible, are bindable — and are inert.
 */

import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { MCP_MAX_TOOLS } from "./mcpProtocol";
import {
  buildServerToolName,
  IMPORTED_TOOL_DEFAULTS,
  MCP_TOOL_HANDLER,
} from "./mcpToolPolicy";

/**
 * Delete a server's tools, and every binding pointing at them.
 *
 * A plain function rather than a mutation because both the rebuild below and the
 * disconnect path in `mcpServers.ts` need it, and a Convex mutation cannot call
 * another one.
 *
 * The bindings matter as much as the tools. An agent left holding a binding to a
 * tool that no longer exists is a run that fails mid-task, rather than at the
 * moment somebody could have noticed.
 */
export async function removeServerTools(
  ctx: MutationCtx,
  serverId: Id<"mcpServers">,
): Promise<number> {
  const tools = await ctx.db
    .query("aiTools")
    .withIndex("by_mcp_server", (q) => q.eq("mcpServerId", serverId))
    .take(MCP_MAX_TOOLS);

  for (const tool of tools) {
    const bindings = await ctx.db
      .query("agentTools")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .take(MCP_MAX_TOOLS);
    for (const binding of bindings) await ctx.db.delete(binding._id);
    await ctx.db.delete(tool._id);
  }

  return tools.length;
}

/**
 * Rewrite one server's tools in the library.
 *
 * Wholesale replace, for the same reason discovery replaces its own rows: a tool
 * the server has stopped offering must not survive as something an agent can
 * still be pointed at.
 */
export async function rebuildServerTools(
  ctx: MutationCtx,
  serverId: Id<"mcpServers">,
): Promise<{ created: number; removed: number }> {
  const server = await ctx.db.get(serverId);
  if (!server) return { created: 0, removed: 0 };

  const removed = await removeServerTools(ctx, serverId);

  const discovered = await ctx.db
    .query("mcpServerTools")
    .withIndex("by_server", (q) => q.eq("serverId", serverId))
    .take(MCP_MAX_TOOLS);

  const now = Date.now();
  const usedNames = new Set<string>();
  let created = 0;

  for (const tool of discovered) {
    const name = buildServerToolName(server.name, tool.name);
    // Truncation can make two distinct tools collide. The model addresses a tool
    // by name alone, so a duplicate is two systems behind one word — dropped
    // rather than gambled on.
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    await ctx.db.insert("aiTools", {
      name,
      description: tool.description || `A tool offered by ${server.name}.`,
      // What the model is offered, carried in its own field since phase 4.
      modelName: name,
      // Where the call goes. One entry for every tool from every server.
      handlerMapping: MCP_TOOL_HANDLER,
      companyId: server.companyId,
      mcpServerId: server._id,
      // What to ask the server for. It does not know about our prefix.
      mcpToolName: tool.name,
      inputSchema: tool.inputSchemaJson,
      outputSchema: tool.outputSchemaJson,
      requiredRole: IMPORTED_TOOL_DEFAULTS.requiredRole,
      sideEffectLevel: IMPORTED_TOOL_DEFAULTS.sideEffectLevel,
      confirmationRequired: IMPORTED_TOOL_DEFAULTS.confirmationRequired,
      isActive: IMPORTED_TOOL_DEFAULTS.isActive,
      createdAt: now,
      updatedAt: now,
    });
    created += 1;
  }

  return { created, removed };
}

/**
 * Import what a server offers into the tool library.
 *
 * Separate from discovery on purpose. Asking a server what it can do and letting
 * an agent do it are different decisions, and a person makes the second one.
 */
export const importServerTools = adminMutation({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args): Promise<{ created: number; removed: number }> => {
    const companyId = getActiveCompanyId(ctx.user);
    const server = await ctx.db.get(args.serverId);

    // The same answer whether it is missing or somebody else's: a different one
    // for each would confirm another company's records exist to anyone guessing.
    if (!server || (ctx.user.role !== "SUPER_ADMIN" && server.companyId !== companyId)) {
      throw appError("UNAUTHORIZED", "That tool server does not exist.");
    }

    return await rebuildServerTools(ctx, server._id);
  },
});
