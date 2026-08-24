/**
 * Tool servers a company has connected.
 *
 * A tool server is an address that publishes its own list of tools. Connecting
 * one is how a workspace gains a capability without anyone writing an
 * integration for it — the alternative being a hand-built connector per service,
 * per client, owned forever.
 *
 * This module is phase 1 of `docs/plans/active/tool-server-plan.md`: storing the
 * connection, and nothing else. It does not contact the server, does not
 * discover tools, and does not let an agent call anything. Those are phases 2
 * to 4, and keeping them apart means the tenancy boundary below is provable
 * before anything is allowed through it.
 *
 * **The boundary.** Every function here resolves the caller's company from the
 * request, never from an argument, and every read is scoped by it. A server
 * belongs to exactly one company; there is no global tool server. Agents remain
 * global — what a shared agent may reach is decided by the company its run
 * belongs to, which is the existing rule everywhere else in the platform and is
 * why nothing here narrows an agent.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery, assertTenantAccess, requireTenant } from "./tenantFunctions";
import type { TenantIdentity } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  assertAuthConsistent,
  normaliseServerName,
  normaliseServerUrl,
  type McpServerAuthMode,
} from "./mcpServerPolicy";
import { MCP_MAX_TOOLS } from "./mcpProtocol";
import { removeServerTools } from "./mcpToolPromotion";

/**
 * Enough for any realistic workspace, and a bound so a listing cannot become an
 * unbounded read. A company with more connected servers than this has a problem
 * this cap is not the right place to solve.
 */
const MCP_SERVER_LIMIT = 100;

const authModeValidator = v.union(v.literal("NONE"), v.literal("SECRET_REF"));

const statusValidator = v.union(
  v.literal("CONNECTED"),
  v.literal("DISABLED"),
  v.literal("ERROR"),
);

/**
 * Refuse a second server under a name already in use here.
 *
 * Names are how an administrator tells two servers apart on screen and in an
 * agent's tool list. Two called "Finance" is a support ticket waiting to happen,
 * and the check is per company because one workspace's naming is no business of
 * another's.
 */
async function assertNameFree(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  name: string,
  ignoreId?: Id<"mcpServers">,
): Promise<void> {
  const existing = await ctx.db
    .query("mcpServers")
    .withIndex("by_company_name", (q) => q.eq("companyId", companyId).eq("name", name))
    .take(2);

  if (existing.some((row) => row._id !== ignoreId)) {
    throw appError("INVALID_INPUT", `A tool server called "${name}" is already connected.`);
  }
}

/**
 * Fetch a server and prove the caller may have it.
 *
 * Deliberately one helper rather than the same three lines in each function: the
 * failure mode this guards against is a new function added later that fetches
 * first and forgets to check.
 */
async function requireOwnServer(
  ctx: QueryCtx & TenantIdentity,
  id: Id<"mcpServers">,
): Promise<Doc<"mcpServers">> {
  const server = await ctx.db.get(id);
  assertTenantAccess(ctx, server);
  if (!server) throw appError("NOT_FOUND", "That tool server does not exist.");
  return server;
}

/** The servers this workspace has connected. */
export const listServers = adminQuery({
  args: {},
  handler: async (ctx) => {
    const companyId = requireTenant(ctx);

    return await ctx.db
      .query("mcpServers")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(MCP_SERVER_LIMIT);
  },
});

/** One server, by id. */
export const getServer = adminQuery({
  args: { id: v.id("mcpServers") },
  handler: async (ctx, args) => await requireOwnServer(ctx, args.id),
});

/**
 * Connect a server.
 *
 * Created `DISABLED`. Nothing should start reaching outward because a form was
 * submitted — phase 2 contacts the server to see what it offers, and an
 * administrator turning it on afterwards is a deliberate second act.
 */
export const createServer = adminMutation({
  args: {
    name: v.string(),
    url: v.string(),
    authMode: authModeValidator,
    secretRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const companyId = requireTenant(ctx);

    const name = normaliseServerName(args.name);
    const url = normaliseServerUrl(args.url);
    assertAuthConsistent(args.authMode as McpServerAuthMode, args.secretRef);
    await assertNameFree(ctx, companyId, name);

    const now = Date.now();

    return await ctx.db.insert("mcpServers", {
      companyId,
      name,
      url,
      authMode: args.authMode,
      secretRef: args.secretRef?.trim() || undefined,
      status: "DISABLED",
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.userId,
    });
  },
});

/**
 * Change a server's address, name, or credential.
 *
 * Every field is re-validated rather than trusted because it was acceptable
 * once: the address in particular is the thing an attacker would want to move,
 * and "it passed when it was created" is not a check.
 */
export const updateServer = adminMutation({
  args: {
    id: v.id("mcpServers"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    authMode: v.optional(authModeValidator),
    secretRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const server = await requireOwnServer(ctx, args.id);

    const name = args.name === undefined ? server.name : normaliseServerName(args.name);
    const url = args.url === undefined ? server.url : normaliseServerUrl(args.url);
    const authMode = (args.authMode ?? server.authMode) as McpServerAuthMode;
    const secretRef = args.secretRef === undefined ? server.secretRef : args.secretRef.trim() || undefined;

    assertAuthConsistent(authMode, secretRef);
    if (name !== server.name) {
      await assertNameFree(ctx, server.companyId, name, server._id);
    }

    await ctx.db.patch(server._id, {
      name,
      url,
      authMode,
      secretRef,
      updatedAt: Date.now(),
    });
  },
});

/** Turn a server on or off without disconnecting it. */
export const setServerStatus = adminMutation({
  args: { id: v.id("mcpServers"), status: statusValidator },
  handler: async (ctx, args) => {
    const server = await requireOwnServer(ctx, args.id);
    await ctx.db.patch(server._id, { status: args.status, updatedAt: Date.now() });
  },
});

/**
 * Disconnect a server, and take everything it brought with it.
 *
 * Three things go, in order: the tools it put in the library and every agent
 * binding pointing at them, the record of what it said it offered, and the
 * connection itself.
 *
 * Leaving any of it behind is worse than not deleting at all. An agent holding a
 * binding to a tool whose server is gone fails mid-task, at the moment it is
 * being relied on, rather than at the moment somebody could have noticed.
 */
export const deleteServer = adminMutation({
  args: { id: v.id("mcpServers") },
  handler: async (ctx, args) => {
    const server = await requireOwnServer(ctx, args.id);

    await removeServerTools(ctx, server._id);

    const discovered = await ctx.db
      .query("mcpServerTools")
      .withIndex("by_server", (q) => q.eq("serverId", server._id))
      .take(MCP_MAX_TOOLS);
    for (const row of discovered) await ctx.db.delete(row._id);

    await ctx.db.delete(server._id);
  },
});
