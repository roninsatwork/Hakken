import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * DataForSEO's answers, kept apart from the requests that bought them.
 *
 * An answer can run to megabytes; a request row is a few hundred bytes. Kept
 * on the request, every read of requests carried every answer with it — the
 * queue, the reuse checks, a collection's progress — and Korda's 149 came to
 * more than one function may read (16 MB): its last answer could never be
 * filed and its collection never closed (2026-09-25). Here, only what parses
 * or re-reads an answer ever reads one.
 *
 * **Kept in parts.** A document holds at most a megabyte, and an answer over
 * that used to be dropped whole — paid for, and nothing filed (reliability
 * plan 2.4). An answer is now kept in as many parts of `ANSWER_PART_BYTES` as
 * it needs, up to `MAX_ANSWER_PARTS`, and passed between functions as those
 * parts: no single value anywhere is larger than a document may be. Only an
 * answer past `MAX_ANSWER_BYTES` is still not kept, and its request says so
 * (`rawTruncated`).
 *
 * Requests stored before 2026-09-25 carried their answer until the move
 * (`2026-09-25-answers-off-requests` in `dataMigrations.ts`) took it across;
 * `readPullAnswerParts` still reads either.
 */

type Reader = { db: QueryCtx["db"] };

/** One part's most, in bytes: inside a document's megabyte, with room for the rest of its row. */
export const ANSWER_PART_BYTES = 900_000;

/**
 * Parts one answer may take. Four keep a whole answer — read to be filed, and
 * written when it is recorded — well inside what one function may read and
 * write (16 MB), and its parsing inside an action's memory.
 */
export const MAX_ANSWER_PARTS = 4;

/** The largest answer kept, in bytes. */
export const MAX_ANSWER_BYTES = ANSWER_PART_BYTES * MAX_ANSWER_PARTS;

/** Rows read to remove a request's answer: its parts, with room for any a retried store left. */
const ROWS_PER_ANSWER = MAX_ANSWER_PARTS * 2;

/** One UTF-16 unit's size in UTF-8, a surrogate pair counted whole on its first half. */
function unitBytes(text: string, at: number): { bytes: number; units: number } {
  const code = text.charCodeAt(at);
  if (code < 0x80) return { bytes: 1, units: 1 };
  if (code < 0x800) return { bytes: 2, units: 1 };
  if (code >= 0xd800 && code <= 0xdbff && at + 1 < text.length) {
    const next = text.charCodeAt(at + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return { bytes: 4, units: 2 };
  }
  return { bytes: 3, units: 1 };
}

/**
 * A text's size as stored: UTF-8 bytes, which is what a document's ceiling
 * counts. Counted in characters, an answer in a script of several bytes a
 * character passed the check and then failed to store (2026-09-25).
 */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let at = 0; at < text.length;) {
    const unit = unitBytes(text, at);
    bytes += unit.bytes;
    at += unit.units;
  }
  return bytes;
}

/**
 * An answer cut into parts of at most `ANSWER_PART_BYTES`, never inside a
 * character — or null when it would take more than `MAX_ANSWER_PARTS`.
 * Joined in order, the parts are the answer exactly.
 */
export function splitAnswer(json: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let at = 0; at < json.length;) {
    const unit = unitBytes(json, at);
    if (bytes + unit.bytes > ANSWER_PART_BYTES) {
      parts.push(json.slice(start, at));
      if (parts.length >= MAX_ANSWER_PARTS) return null;
      start = at;
      bytes = 0;
    }
    bytes += unit.bytes;
    at += unit.units;
  }
  parts.push(json.slice(start));
  return parts;
}

/** Store a request's answer, in its parts, replacing any it had. */
export async function storePullAnswer(
  ctx: MutationCtx,
  pullId: Id<"seoDataPulls">,
  parts: readonly string[],
): Promise<void> {
  await deletePullAnswers(ctx, pullId);
  const storedAt = Date.now();
  // One part is a row like every answer stored before parts: nothing to number.
  if (parts.length === 1) {
    await ctx.db.insert("seoPullAnswers", { pullId, resultJson: parts[0], storedAt });
    return;
  }
  for (const [part, resultJson] of parts.entries()) {
    await ctx.db.insert("seoPullAnswers", { pullId, resultJson, storedAt, part, parts: parts.length });
  }
}

/**
 * A request's answer as its parts, in order — from its own rows, or from the
 * request itself while that is still to be moved — or null. An answer missing
 * a part (the hourly purge takes rows a few at a time, and can stop between
 * one answer's parts) is no answer: half an answer must never be filed.
 */
export async function readPullAnswerParts(
  ctx: Reader,
  pull: Pick<Doc<"seoDataPulls">, "_id" | "resultJson">,
): Promise<string[] | null> {
  const rows = await ctx.db
    .query("seoPullAnswers")
    .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
    .take(MAX_ANSWER_PARTS + 1);
  if (rows.length === 0) return pull.resultJson !== undefined ? [pull.resultJson] : null;
  const count = rows[0].parts ?? 1;
  if (rows.length !== count) return null;
  const ordered = [...rows].sort((left, right) => (left.part ?? 0) - (right.part ?? 0));
  if (ordered.some((row, index) => (row.part ?? 0) !== index || (row.parts ?? 1) !== count)) return null;
  return ordered.map((row) => row.resultJson);
}

/** Whether a request has an answer kept, reading one part of it at most. */
export async function hasPullAnswer(
  ctx: Reader,
  pull: Pick<Doc<"seoDataPulls">, "_id" | "resultJson">,
): Promise<boolean> {
  if (pull.resultJson !== undefined) return true;
  const first = await ctx.db
    .query("seoPullAnswers")
    .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
    .first();
  return first !== null;
}

/** Remove a request's stored answer, as the request itself is deleted. Returns the rows removed. */
export async function deletePullAnswers(ctx: MutationCtx, pullId: Id<"seoDataPulls">): Promise<number> {
  const answers = await ctx.db
    .query("seoPullAnswers")
    .withIndex("by_pull", (q) => q.eq("pullId", pullId))
    .take(ROWS_PER_ANSWER);
  for (const answer of answers) await ctx.db.delete(answer._id);
  return answers.length;
}

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

/**
 * Requests moved per batch, whatever batch size the run asks for: each can
 * still carry a megabyte, and a function may read sixteen.
 */
const MOVE_PAGE = 4;

/**
 * The move: each request still carrying its answer has it taken across to
 * `seoPullAnswers` and cleared from the request. Idempotent — a request with
 * nothing on it is left alone, and one already taken across is only cleared.
 */
export async function moveAnswersOffRequests(
  ctx: MutationCtx,
  cursor: string | null,
  _batchSize: number,
): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("seoDataPulls").paginate({ numItems: MOVE_PAGE, cursor });

  let updated = 0;
  for (const pull of page.page) {
    if (pull.resultJson === undefined) continue;
    const moved = await ctx.db
      .query("seoPullAnswers")
      .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
      .first();
    if (!moved) {
      await ctx.db.insert("seoPullAnswers", {
        pullId: pull._id,
        resultJson: pull.resultJson,
        storedAt: pull.completedAt ?? pull.submittedAt,
      });
    }
    await ctx.db.patch(pull._id, { resultJson: undefined });
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}
