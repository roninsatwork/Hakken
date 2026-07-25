/**
 * Deduplication for side-effecting tool calls.
 *
 * The write tool accepted an `idempotencyKey`, wrote it into the audit log and
 * never read it back, so calling it twice with the same key applied the write
 * twice. That was survivable while a run was a single uninterruptible action.
 * It is not now: P3.3 made runs resumable, so a tool call really can be
 * re-issued after a crash or an approval, and a key that does not deduplicate
 * advertises a protection that does not exist.
 */

import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * How long a key is remembered.
 *
 * Long enough to cover every way a run can be retried — a stalled run is revived
 * within minutes, an approval may be decided hours later — and short enough that
 * the table does not grow without bound. A key reused after this window is
 * treated as a new request, which is the documented behaviour of every
 * idempotency scheme.
 */
export const TOOL_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

/**
 * Normalise a caller-supplied key.
 *
 * Returns undefined for anything unusable rather than throwing: an absent or
 * malformed key means "no deduplication requested", and refusing the whole write
 * because the model produced an odd key would turn a safety feature into an
 * outage.
 */
export function normalizeIdempotencyKey(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return undefined;
  return trimmed;
}

/**
 * The result of an earlier call with this key, if there was one.
 *
 * An expired record is treated as absent and left for the purge to remove;
 * deleting it here would mean a read path performing a write.
 */
export async function findCompletedToolCall(
  ctx: Pick<MutationCtx, "db">,
  args: {
    companyId: Id<"companies">;
    handlerMapping: string;
    idempotencyKey: string;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("agentToolIdempotency")
    .withIndex("by_scope_key", (q) =>
      q.eq("companyId", args.companyId)
        .eq("handlerMapping", args.handlerMapping)
        .eq("idempotencyKey", args.idempotencyKey))
    .first();

  if (!existing) return null;
  if (existing.expiresAt <= args.now) return null;
  return existing;
}

/** Remember a completed call so a repeat of it replays rather than reapplies. */
export async function recordCompletedToolCall(
  ctx: Pick<MutationCtx, "db">,
  args: {
    companyId: Id<"companies">;
    handlerMapping: string;
    idempotencyKey: string;
    resultJson: string;
    runId?: Id<"agentRuns">;
    toolCallId?: Id<"agentToolCalls">;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("agentToolIdempotency")
    .withIndex("by_scope_key", (q) =>
      q.eq("companyId", args.companyId)
        .eq("handlerMapping", args.handlerMapping)
        .eq("idempotencyKey", args.idempotencyKey))
    .first();

  const record = {
    companyId: args.companyId,
    handlerMapping: args.handlerMapping,
    idempotencyKey: args.idempotencyKey,
    resultJson: args.resultJson,
    runId: args.runId,
    toolCallId: args.toolCallId,
    createdAt: args.now,
    expiresAt: args.now + TOOL_IDEMPOTENCY_TTL_MS,
  };

  if (existing) {
    // Reached only when the previous record had expired. Replacing it restarts
    // the window against the call that actually happened.
    await ctx.db.patch(existing._id, record);
    return existing._id;
  }

  return await ctx.db.insert("agentToolIdempotency", record);
}

/**
 * Mark a replayed result so it is distinguishable from a fresh one.
 *
 * The model is told the work was already done. Without this it may read an
 * unchanged result as a failed attempt and try again with a new key, which is
 * precisely the duplicate write this exists to prevent.
 */
export function markReplayedResult(result: unknown) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    return { replayed: true, result };
  }

  return { ...(result as Record<string, unknown>), replayed: true };
}
