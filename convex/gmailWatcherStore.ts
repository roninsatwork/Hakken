import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The watcher's bookkeeping, split from `gmailWatcher.ts` because the watcher
 * itself runs in the Node runtime (its decision step calls a model through
 * `aiProviderRegistry`) and a Node file may only export actions.
 */

export const listConnectedMailboxes = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"toolConnectors">[]> => {
    // Bounded: one mailbox per workspace, installed by hand.
    const connectors = await ctx.db
      .query("toolConnectors")
      .withIndex("by_key", (q) => q.eq("key", "google-gmail"))
      .take(100);
    return connectors.filter(
      (connector) =>
        connector.installStatus === "INSTALLED" &&
        connector.isActive &&
        connector.authConnectionStatus === "CONNECTED" &&
        connector.companyId !== undefined
    );
  },
});

/**
 * Record a message id the moment it is seen (commitment 7). Answers with
 * what the watcher should do: process it, or leave it alone.
 */
export const recordSeenMessage = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    companyId: v.optional(v.id("companies")),
    gmailMessageId: v.string(),
    gmailThreadId: v.string(),
    sender: v.string(),
    subject: v.string(),
  },
  handler: async (ctx, args): Promise<"PROCESS" | "ALREADY_HANDLED"> => {
    const existing = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_connector_message", (q) =>
        q.eq("connectorId", args.connectorId).eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (existing) {
      // A PENDING row is a message whose processing died mid-way — but only
      // a stale one. A fresh PENDING row is a message being processed RIGHT
      // NOW by another sweep, and treating it as retryable let two
      // overlapping sweeps answer the same mail twice (seen live on the
      // first day: two identical replies a second apart).
      const isStalePending =
        existing.decision === "PENDING" && Date.now() - existing.updatedAt > 5 * 60 * 1000;
      return isStalePending ? "PROCESS" : "ALREADY_HANDLED";
    }
    const now = Date.now();
    await ctx.db.insert("mailboxMessages", {
      companyId: args.companyId,
      connectorId: args.connectorId,
      gmailMessageId: args.gmailMessageId,
      gmailThreadId: args.gmailThreadId,
      sender: args.sender,
      subject: args.subject,
      decision: "PENDING",
      createdAt: now,
      updatedAt: now,
    });
    return "PROCESS";
  },
});

export const markDecision = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    gmailMessageId: v.string(),
    decision: v.union(v.literal("REPLIED"), v.literal("TASK"), v.literal("SKIPPED")),
    reason: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mailboxMessages")
      .withIndex("by_connector_message", (q) =>
        q.eq("connectorId", args.connectorId).eq("gmailMessageId", args.gmailMessageId)
      )
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      decision: args.decision,
      decisionReason: args.reason,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      updatedAt: Date.now(),
    });
  },
});

/**
 * What the last poll actually did (seven-gaps plan, phase 2). The watcher
 * runs sixty times an hour, so this is the truest witness the Connections
 * screen has for whether a mailbox is answering.
 */
export const recordPollOutcomeInternal = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectorId, {
      lastPolledAt: Date.now(),
      // Cleared on success: a row must never wear yesterday's failure beside
      // today's good poll.
      lastPollError: args.ok ? undefined : (args.error ?? "The poll failed.").slice(0, 300),
    });
  },
});
