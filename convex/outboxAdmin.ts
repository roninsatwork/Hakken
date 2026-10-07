import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { communicationValidator, outboxMessageTypeValidator, outboxStatusValidator } from "./outboxSchema";
import { includesSearchTerm, normalizeSearchTerm } from "./adminQueryService";
import { outboxFromAddress } from "./emailBrandingService";
import { OUTBOX_QUEUE_AGENT } from "./utils/outboxQueueAgent";
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
  communication: communicationValidator,
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
    communication: row.communication,
    email: row.email,
    language: row.language,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? null,
    error: row.error ?? null,
  };
}

/** Rows read per page while a search narrows them; the screen reads on until its page is full (`useServerPagedTable`'s fill). */
const SEARCH_PAGE = 100;

/**
 * Every email, newest first, by what became of it and its type of
 * communication, and found by its address (outbox-and-preferences-plan.md, C1).
 * A search narrows each page as it reads it, so a page can come back short.
 */
export const listOutboxForAdmin = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(outboxStatusValidator),
    communication: v.optional(communicationValidator),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const { status, communication } = args;
    const term = normalizeSearchTerm(args.search);
    const base = status
      ? ctx.db.query("outboxMessages").withIndex("by_status_created", (q) => q.eq("status", status))
      : communication
        ? ctx.db.query("outboxMessages").withIndex("by_communication_created", (q) => q.eq("communication", communication))
        : ctx.db.query("outboxMessages").withIndex("by_created");
    const narrowed = status && communication ? base.filter((q) => q.eq(q.field("communication"), communication)) : base;
    const opts = term ? { ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, SEARCH_PAGE) } : args.paginationOpts;
    const page = await narrowed.order("desc").paginate(opts);
    const rows = term ? page.page.filter((row) => includesSearchTerm(row.email, term)) : page.page;
    return { ...page, page: rows.map(listRow) };
  },
});

/** The agent's next scheduled run at or after a row is due, or null when it has no schedule that is on. */
async function nextOutboxRunAt(ctx: QueryCtx, dueAt: number): Promise<number | null> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", OUTBOX_QUEUE_AGENT.systemKey)).first();
  if (!agent || agent.isActive === false) return null;
  const schedules = await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).take(5);
  const next = schedules.filter((schedule) => schedule.isActive && schedule.nextRunAt !== undefined).map((schedule) => schedule.nextRunAt as number);
  if (next.length === 0) return null;
  const soonest = Math.min(...next);
  // A retry due after the next run waits for the run after it: an hour on.
  return soonest >= dueAt ? soonest : soonest + Math.ceil((dueAt - soonest) / 3_600_000) * 3_600_000;
}

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
    /** When it goes: the Outbox Queue Processing Agent's next run, while it waits. */
    nextRunAt: v.union(v.number(), v.null()),
    /** The one Outbox address it is sent from, or null while none is set. */
    sentFrom: v.union(v.string(), v.null()),
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
      nextRunAt: row.status === "WAITING" ? await nextOutboxRunAt(ctx, row.dueAt) : null,
      sentFrom: outboxFromAddress(process.env, await ctx.db.query("systemSettings").first()),
      preview,
    };
  },
});

/**
 * The note above the Outbox (outbox-and-preferences-plan.md, C1): when the
 * Outbox Queue Processing Agent next runs, how many emails wait for it, and
 * the one address they go from.
 */
export const getOutboxSummaryForAdmin = superAdminQuery({
  args: {},
  returns: v.object({
    nextRunAt: v.union(v.number(), v.null()),
    waiting: v.number(),
    moreWaiting: v.boolean(),
    sentFrom: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const ceiling = 999;
    const waiting = await ctx.db.query("outboxMessages").withIndex("by_status_due", (q) => q.eq("status", "WAITING")).take(ceiling + 1);
    return {
      nextRunAt: await nextOutboxRunAt(ctx, 0),
      waiting: Math.min(waiting.length, ceiling),
      moreWaiting: waiting.length > ceiling,
      sentFrom: outboxFromAddress(process.env, await ctx.db.query("systemSettings").first()),
    };
  },
});
