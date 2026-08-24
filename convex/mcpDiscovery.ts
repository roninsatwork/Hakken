/**
 * Asking a connected server what it can do.
 *
 * Phase 2 of `docs/plans/active/tool-server-plan.md`. This contacts a server and
 * records the tools it says it offers. It does **not** make those tools
 * available to an agent — that is phase 3, and keeping the two apart is what
 * stops connecting a server from silently arming it.
 *
 * All the protocol thinking lives in `mcpProtocol.ts`, which has no network in
 * it and is tested directly. What remains here is the part that genuinely needs
 * a socket: the request, the timeout, the size cap, and turning whatever came
 * back into a row.
 *
 * **A failed discovery is a normal outcome, not an exception.** Servers go down,
 * credentials expire, addresses change. Every failure path below ends by
 * recording *why* against the server, so the screen can say what happened rather
 * than showing a spinner that never resolves.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminAction, adminQuery, assertTenantAccess } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { getErrorMessage } from "./utils/lang";
import { normaliseServerUrl } from "./mcpServerPolicy";
import {
  type Exchange,
  McpFailure,
  openSession,
  postJsonRpc,
  resolveServerAuthorization,
} from "./mcpTransport";
import {
  buildToolsListRequest,
  MCP_MAX_PAGES,
  MCP_MAX_TOOLS,
  MCP_PROTOCOL_VERSION,
  normaliseToolsPage,
  type DiscoveredTool,
} from "./mcpProtocol";

/**
 * Walk the tool list.
 *
 * Both bounds matter. `MCP_MAX_PAGES` stops a server that always returns a
 * cursor from looping forever; `MCP_MAX_TOOLS` stops one that returns a
 * plausible number of pages containing an implausible number of tools. Hitting
 * either is reported rather than silently truncated, because a list quietly
 * missing its tail is worse than one that says it was cut short.
 */
async function collectTools(args: {
  url: string;
  authorization?: string;
  session: Exchange;
}): Promise<{ tools: DiscoveredTool[]; rejected: number; truncated: boolean }> {
  const tools: DiscoveredTool[] = [];
  let rejected = 0;
  let cursor: string | undefined;
  let requestId = 2;

  for (let page = 0; page < MCP_MAX_PAGES; page += 1) {
    const response = await postJsonRpc({
      url: args.url,
      body: buildToolsListRequest(requestId, cursor),
      authorization: args.authorization,
      sessionId: args.session.sessionId,
      protocolVersion: args.session.protocolVersion,
      expectedId: requestId,
    });
    requestId += 1;

    const parsed = normaliseToolsPage(response.result ?? {});
    rejected += parsed.rejected;

    for (const tool of parsed.tools) {
      if (tools.length >= MCP_MAX_TOOLS) {
        return { tools, rejected, truncated: true };
      }
      tools.push(tool);
    }

    if (!parsed.nextCursor) return { tools, rejected, truncated: false };
    cursor = parsed.nextCursor;
  }

  return { tools, rejected, truncated: true };
}

/** The server record, for the action that cannot reach the database itself. */
export const getServerForDiscovery = internalQuery({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => await ctx.db.get(args.serverId),
});

/**
 * Replace what we know a server offers.
 *
 * A wholesale replace rather than a merge. A tool the server has stopped
 * offering must disappear, and reconciling additions, removals and changes by
 * hand is three chances to leave a stale row behind that an agent could still be
 * holding a binding to.
 */
export const recordDiscovery = internalMutation({
  args: {
    serverId: v.id("mcpServers"),
    companyId: v.id("companies"),
    ok: v.boolean(),
    message: v.string(),
    serverLabel: v.optional(v.string()),
    protocolVersion: v.optional(v.string()),
    tools: v.optional(v.array(v.object({
      name: v.string(),
      title: v.optional(v.string()),
      description: v.string(),
      inputSchemaJson: v.string(),
      outputSchemaJson: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.tools) {
      // Bounded rather than collected. Nothing can have written more than
      // `MCP_MAX_TOOLS` rows for one server, so this is the whole set — but it
      // is the bound that makes that true rather than an assumption about it.
      const existing = await ctx.db
        .query("mcpServerTools")
        .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
        .take(MCP_MAX_TOOLS);
      for (const row of existing) await ctx.db.delete(row._id);

      for (const tool of args.tools) {
        await ctx.db.insert("mcpServerTools", {
          serverId: args.serverId,
          companyId: args.companyId,
          ...tool,
          discoveredAt: now,
        });
      }
    }

    await ctx.db.patch(args.serverId, {
      lastDiscoveryAt: now,
      lastDiscoveryOk: args.ok,
      lastDiscoveryMessage: args.message,
      ...(args.tools ? { discoveredToolCount: args.tools.length } : {}),
      ...(args.serverLabel ? { serverLabel: args.serverLabel } : {}),
      ...(args.protocolVersion ? { protocolVersion: args.protocolVersion } : {}),
      // A server that would not answer is not connected, whatever it said last
      // time. Leaving it CONNECTED would show a green light over a dead line.
      ...(args.ok ? {} : { status: "ERROR" as const }),
      updatedAt: now,
    });
  },
});

/** What a company knows one of its servers offers. */
export const listDiscoveredTools = internalQuery({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => await ctx.db
    .query("mcpServerTools")
    .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
    .take(MCP_MAX_TOOLS),
});

/**
 * What a server offers, for the person who just checked it.
 *
 * A count is not an answer to "did that work" — a server can answer perfectly
 * and offer nothing useful. Seeing the actual list is the difference between
 * knowing the connection is alive and knowing it is worth having.
 */
export const listServerTools = adminQuery({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args) => {
    const server = await ctx.db.get(args.serverId);
    assertTenantAccess(ctx, server);
    if (!server) return [];

    const tools = await ctx.db
      .query("mcpServerTools")
      .withIndex("by_server", (q) => q.eq("serverId", args.serverId))
      .take(MCP_MAX_TOOLS);

    return tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
    }));
  },
});

/**
 * Contact a server and record what it offers.
 *
 * An action rather than a mutation because it reaches the network, so the tenant
 * cannot come from `ctx.companyId` the way it does elsewhere — it is resolved
 * from the caller and checked against the record, which is the same guarantee
 * arrived at by a different road.
 */
export const discoverServerTools = adminAction({
  args: { serverId: v.id("mcpServers") },
  handler: async (ctx, args): Promise<{ ok: boolean; message: string; toolCount: number }> => {
    const companyId: Id<"companies"> | undefined = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NO_ACTIVE_COMPANY", "No active company");

    const server = await ctx.runQuery(internal.mcpDiscovery.getServerForDiscovery, {
      serverId: args.serverId,
    });
    // Deliberately the same message whether it is missing or somebody else's:
    // a different answer for each would confirm the existence of another
    // company's records to anyone willing to guess.
    if (!server || server.companyId !== companyId) {
      throw appError("UNAUTHORIZED", "That tool server does not exist.");
    }

    // Re-checked rather than trusted because it passed once. The address is the
    // one field worth an attacker's effort, and a stored value is not a check.
    const url = normaliseServerUrl(server.url);

    const credential = resolveServerAuthorization(server);
    if (!credential.ok) {
      return await record(ctx, server._id, companyId, false, credential.reason);
    }
    const authorization = credential.authorization;

    try {
      // Resolved rather than hardcoded: a renamed deployment introduces itself
      // by its own name to every server it connects to.
      const branding = await ctx.runQuery(internal.settings.getEmailBranding, {});
      const session = await openSession(url, branding.platformName, authorization);
      const collected = await collectTools({ url, authorization, session });

      const notes: string[] = [`Found ${collected.tools.length} tools.`];
      if (collected.rejected > 0) {
        notes.push(`${collected.rejected} were ignored because the server described them incorrectly.`);
      }
      if (collected.truncated) {
        notes.push(`The list was cut short at ${MCP_MAX_TOOLS}.`);
      }

      await ctx.runMutation(internal.mcpDiscovery.recordDiscovery, {
        serverId: server._id,
        companyId,
        ok: true,
        message: notes.join(" "),
        serverLabel: session.label,
        protocolVersion: session.protocolVersion,
        tools: collected.tools,
      });

      return { ok: true, message: notes.join(" "), toolCount: collected.tools.length };
    } catch (error) {
      // A server misbehaving is an outcome to record, not a stack trace to
      // surface. Anything genuinely unexpected still reads sensibly here.
      const message = error instanceof McpFailure
        ? error.message
        : getErrorMessage(error, "The server could not be reached.");

      return await record(ctx, server._id, companyId, false, message);
    }
  },
});

async function record(
  ctx: ActionCtx,
  serverId: Id<"mcpServers">,
  companyId: Id<"companies">,
  ok: boolean,
  message: string,
) {
  await ctx.runMutation(internal.mcpDiscovery.recordDiscovery, { serverId, companyId, ok, message });
  return { ok, message, toolCount: 0 };
}

export { MCP_PROTOCOL_VERSION };
