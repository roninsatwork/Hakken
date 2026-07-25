import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeEmailAddress } from "./aiToolNotificationService";

/**
 * Backing queries and writes for the notification connector.
 *
 * The connector itself lives in `aiToolExecutionService`; what is here is the
 * tenant data it needs and the record it leaves behind. Sending an email is an
 * irreversible act performed by an autonomous agent, so it is audited like any
 * other privileged write.
 */

const TENANT_RECIPIENT_LIMIT = 500;

/**
 * The addresses an agent in this tenant is permitted to notify.
 *
 * Scoped by company at the index, not filtered afterwards: this list is the
 * boundary between "notify a colleague" and "email a stranger", so it must not
 * be possible to widen it by passing a different argument.
 */
export const getTenantNotificationRecipients = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(TENANT_RECIPIENT_LIMIT);

    return users
      .map((user) => user.email)
      .filter((email): email is string => Boolean(email))
      .map(normalizeEmailAddress);
  },
});

/** Record a dispatched notification so it is reviewable after the fact. */
export const recordNotificationDispatch = internalMutation({
  args: {
    companyId: v.id("companies"),
    // Required, not optional. Sending email is irreversible and outward-facing,
    // so the audit trail must name someone accountable for it — the same rule
    // the company-overview write tool already applies.
    actorId: v.id("users"),
    agentId: v.optional(v.id("agents")),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    recipients: v.array(v.string()),
    subject: v.string(),
    dispatchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actionType: "AGENT_SEND_NOTIFICATION",
      entityId: args.runId ?? args.companyId,
      entityType: "agentRuns",
      companyId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        agentId: args.agentId,
        runId: args.runId,
        toolCallId: args.toolCallId,
        recipients: args.recipients,
        // The subject is recorded, the body is not. It is enough to identify the
        // message without copying model-generated content, which may repeat
        // whatever personal data prompted it, into a second store.
        subject: args.subject,
        dispatchId: args.dispatchId,
      }),
    });
  },
});

/**
 * The secret references configured for the connector a tool belongs to.
 *
 * Returns *references*, never values — resolution happens in the action, from
 * the deployment environment, so a credential never passes through the database
 * or a query result.
 */
export const getConnectorSecretRefsForTool = internalQuery({
  args: { toolId: v.id("aiTools") },
  handler: async (ctx, args) => {
    const tool = await ctx.db.get(args.toolId);
    if (!tool?.connectorId) return null;

    const refs = await ctx.db
      .query("toolConnectorSecretRefs")
      .withIndex("by_connector", (q) => q.eq("connectorId", tool.connectorId as Id<"toolConnectors">))
      .take(TENANT_RECIPIENT_LIMIT);

    return refs
      .filter((ref) => ref.status === "CONFIGURED")
      .map((ref) => ({ key: ref.key, providerRef: ref.providerRef }));
  },
});
