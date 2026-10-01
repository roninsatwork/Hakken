import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { outboxMessageTypeValidator, outboxStatusValidator } from "./outboxSchema";
import { renderOutboxRow } from "./outboxTemplates";
import { superAdminQuery } from "./tenantFunctions";

/**
 * Admin → Content → Outbox (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 7): every email queued, newest first, filtered by what became of it —
 * waiting, sent, failed or skipped — each opening on its own page with the
 * email as its reader gets it and the runs that queued and sent it.
 */

const rowValidator = v.object({
  _id: v.id("outboxMessages"),
  messageType: outboxMessageTypeValidator,
  email: v.string(),
  language: v.string(),
  status: outboxStatusValidator,
  attempts: v.number(),
  createdAt: v.number(),
  sentAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

function listRow(row: Doc<"outboxMessages">) {
  return {
    _id: row._id,
    messageType: row.messageType,
    email: row.email,
    language: row.language,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? null,
    error: row.error ?? null,
  };
}

export const listOutboxForAdmin = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(outboxStatusValidator) },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const status = args.status;
    const query = status
      ? ctx.db.query("outboxMessages").withIndex("by_status_created", (q) => q.eq("status", status))
      : ctx.db.query("outboxMessages").withIndex("by_created");
    const page = await query.order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(listRow) };
  },
});

const runLink = v.union(v.null(), v.object({ runId: v.id("agentRuns"), agentId: v.id("agents") }));

async function linkOf(ctx: QueryCtx, runId: Id<"agentRuns"> | undefined) {
  const run = runId ? await ctx.db.get(runId) : null;
  return run ? { runId: run._id, agentId: run.agentId } : null;
}

export const getOutboxMessageForAdmin = superAdminQuery({
  args: { messageId: v.string() },
  returns: v.union(v.null(), v.object({
    ...rowValidator.fields,
    dueAt: v.number(),
    resendId: v.union(v.string(), v.null()),
    queuedBy: runLink,
    sentBy: runLink,
    /** The email as its reader gets it, or why it would not be sent. */
    preview: v.union(
      v.object({ subject: v.string(), html: v.string(), text: v.string() }),
      v.object({ skip: v.string() }),
    ),
  })),
  handler: async (ctx, args) => {
    const messageId = ctx.db.normalizeId("outboxMessages", args.messageId);
    const row = messageId ? await ctx.db.get(messageId) : null;
    if (!row) return null;
    const rendered = await renderOutboxRow(ctx, row);
    const preview: { skip: string } | { subject: string; html: string; text: string } = "skip" in rendered
      ? { skip: rendered.skip }
      : { subject: rendered.email.subject, html: rendered.email.html, text: rendered.email.text };
    return {
      ...listRow(row),
      dueAt: row.dueAt,
      resendId: row.resendId ?? null,
      queuedBy: await linkOf(ctx, row.queuedByRunId),
      sentBy: await linkOf(ctx, row.sentByRunId),
      preview,
    };
  },
});
