import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  findCompletedToolCall,
  markReplayedResult,
  normalizeIdempotencyKey,
  recordCompletedToolCall,
} from "./aiToolIdempotencyService";
import { appError } from "./utils/appError";

const COMPANY_OVERVIEW_MAX_CHARS = 5000;
const COMPANY_OVERVIEW_HANDLER_MAPPING = "company.overview.update";
const IDEMPOTENCY_PURGE_BATCH_SIZE = 500;

function normalizeOverview(value: string) {
  const overview = value.trim();
  if (overview.length === 0) {
    throw appError("INVALID_INPUT", "Company overview cannot be empty.");
  }

  if (overview.length > COMPANY_OVERVIEW_MAX_CHARS) {
    throw appError("INVALID_INPUT", `Company overview cannot exceed ${COMPANY_OVERVIEW_MAX_CHARS} characters.`);
  }

  return overview;
}

export const updateCompanyOverview = internalMutation({
  args: {
    companyId: v.id("companies"),
    actorId: v.id("users"),
    overview: v.string(),
    runId: v.optional(v.id("agentRuns")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const overview = normalizeOverview(args.overview);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");

    const now = Date.now();
    const idempotencyKey = normalizeIdempotencyKey(args.idempotencyKey);

    // A run can now be resumed after a crash or an approval, so the same tool
    // call really can arrive twice. Replaying the first result is what makes the
    // key mean something — it was previously logged and otherwise ignored.
    if (idempotencyKey) {
      const completed = await findCompletedToolCall(ctx, {
        companyId: args.companyId,
        handlerMapping: COMPANY_OVERVIEW_HANDLER_MAPPING,
        idempotencyKey,
        now,
      });

      if (completed) {
        try {
          return markReplayedResult(JSON.parse(completed.resultJson) as unknown);
        } catch {
          // A record we cannot read is no basis for skipping a write, but it is
          // also no basis for repeating one. Fall through and apply the write:
          // the operation is a set-to-a-value, so re-applying it is harmless.
        }
      }
    }

    const previousOverview = company.overview || "";
    const changed = previousOverview !== overview;

    if (changed) {
      await ctx.db.patch(args.companyId, { overview });
    }

    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      actionType: "AGENT_UPDATE_COMPANY_OVERVIEW",
      entityId: args.companyId,
      entityType: "companies",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: args.runId,
        toolCallId: args.toolCallId,
        idempotencyKey,
        changed,
        previousOverviewLength: previousOverview.length,
        nextOverviewLength: overview.length,
      }),
    });

    const result = {
      companyId: args.companyId,
      changed,
      previousOverview,
      overview,
    };

    if (idempotencyKey) {
      await recordCompletedToolCall(ctx, {
        companyId: args.companyId,
        handlerMapping: COMPANY_OVERVIEW_HANDLER_MAPPING,
        idempotencyKey,
        resultJson: JSON.stringify(result),
        runId: args.runId,
        toolCallId: args.toolCallId,
        now,
      });
    }

    return result;
  },
});

/**
 * Drop idempotency records past their window.
 *
 * Without this the table grows for ever, since every side-effecting tool call
 * carrying a key adds a row. Batched and rescheduled by the cron rather than
 * deleting everything at once, so a long backlog cannot exceed a mutation's
 * transaction limits.
 */
export const purgeExpiredToolIdempotency = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("agentToolIdempotency")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(IDEMPOTENCY_PURGE_BATCH_SIZE);

    await Promise.all(expired.map((record) => ctx.db.delete(record._id)));

    return { deleted: expired.length };
  },
});
