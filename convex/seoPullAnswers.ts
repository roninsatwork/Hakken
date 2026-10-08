import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";

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
 * **Kept as a file** (core-data-normalisation-plan.md §6.5, N7, 2026-10-08):
 * the action holding the answer stores it in Convex's file storage
 * (`keepAnswerFile`) and the request's row points to it — the database's
 * largest table (33.5 MB on dev) and its largest single writes gone from it.
 * Only an action reads a file, and an action is what files an answer
 * (`readPullForParse`). Only an answer past `MAX_ANSWER_BYTES` is still not
 * kept, and its request says so (`rawTruncated`).
 *
 * Answers kept before were rows of up to `MAX_ANSWER_PARTS` parts, each
 * inside a document's megabyte: still read (`readPullAnswerParts`) until they
 * expire, a week on, or are moved (`moveAnswersToFiles`).
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
 * An answer stored as a file, from the action holding it, with its size — or
 * null when it is past `MAX_ANSWER_BYTES`, kept nowhere, and its request
 * marked as such. Recorded against its request by `storePullAnswer`.
 */
export async function keepAnswerFile(ctx: ActionCtx, json: string): Promise<{ file: Id<"_storage">; bytes: number } | null> {
  const bytes = utf8Length(json);
  if (bytes > MAX_ANSWER_BYTES) return null;
  const file = await ctx.storage.store(new Blob([json], { type: "application/json" }));
  return { file, bytes };
}

/** A stored answer's file as a request's answer, replacing any it had. `storedAt` keeps a moved answer's own age. */
export async function storePullAnswer(
  ctx: MutationCtx,
  pullId: Id<"seoDataPulls">,
  kept: { file: Id<"_storage">; bytes: number },
  storedAt = Date.now(),
): Promise<void> {
  await deletePullAnswers(ctx, pullId);
  await ctx.db.insert("seoPullAnswers", { pullId, file: kept.file, bytes: kept.bytes, storedAt });
}

/**
 * A file stored for an answer that its request did not take — recorded by an
 * earlier try, or no longer waiting — removed, unless an answer names it.
 */
export async function dropUntakenAnswer(ctx: MutationCtx, kept: { file: Id<"_storage"> } | undefined): Promise<void> {
  if (!kept) return;
  const named = await ctx.db.query("seoPullAnswers").withIndex("by_file", (q) => q.eq("file", kept.file)).first();
  if (!named && (await ctx.db.system.get(kept.file))) await ctx.storage.delete(kept.file);
}

/** Whether a stored file is an answer's: the upload sweep keeps it (`uploadReservations.cleanup`). */
export async function isAnswerFile(ctx: { db: QueryCtx["db"] }, file: Id<"_storage">): Promise<boolean> {
  return (await ctx.db.query("seoPullAnswers").withIndex("by_file", (q) => q.eq("file", file)).first()) !== null;
}

/** A request's answer as filing reads it: its file, or the parts of one kept before in its rows. */
export type KeptAnswer = { file: Id<"_storage"> } | { parts: string[] };

export async function readPullAnswer(ctx: Reader, pull: Pick<Doc<"seoDataPulls">, "_id" | "resultJson">): Promise<KeptAnswer | null> {
  const first = await ctx.db.query("seoPullAnswers").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).first();
  if (first?.file) return { file: first.file };
  const parts = await readPullAnswerParts(ctx, pull);
  return parts ? { parts } : null;
}

/** A request's answer whole, read from an action: its file, or its parts joined. */
export async function answerText(ctx: ActionCtx, kept: KeptAnswer | null): Promise<string | null> {
  if (!kept) return null;
  if ("parts" in kept) return kept.parts.join("");
  const blob = await ctx.storage.get(kept.file);
  return blob ? await blob.text() : null;
}

/**
 * An answer kept in rows before 2026-10-08, as its parts, in order — from its
 * own rows, or from the request itself while that is still to be moved — or
 * null, as for an answer kept as a file. An answer missing
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
  if (rows.some((row) => row.resultJson === undefined)) return null;
  const count = rows[0].parts ?? 1;
  if (rows.length !== count) return null;
  const ordered = [...rows].sort((left, right) => (left.part ?? 0) - (right.part ?? 0));
  if (ordered.some((row, index) => (row.part ?? 0) !== index || (row.parts ?? 1) !== count)) return null;
  return ordered.map((row) => row.resultJson ?? "");
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

/** Remove a request's stored answer, its file with it, as the request itself is deleted. Returns the rows removed. */
export async function deletePullAnswers(ctx: MutationCtx, pullId: Id<"seoDataPulls">): Promise<number> {
  const answers = await ctx.db
    .query("seoPullAnswers")
    .withIndex("by_pull", (q) => q.eq("pullId", pullId))
    .take(ROWS_PER_ANSWER);
  for (const answer of answers) await deleteAnswerRow(ctx, answer);
  return answers.length;
}

/** One answer row, and its file when it has one. */
export async function deleteAnswerRow(ctx: MutationCtx, answer: Doc<"seoPullAnswers">): Promise<void> {
  if (answer.file && (await ctx.db.system.get(answer.file))) await ctx.storage.delete(answer.file);
  await ctx.db.delete(answer._id);
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

// ---------------------------------------------------------------------------
// Answers kept in rows before 2026-10-08, moved into files once
// ---------------------------------------------------------------------------

/** Answer rows looked at a step: each up to 900 KB. */
const MOVE_ROWS = 8;
/** How long one run of the move works before it hands on: an action stops at ten minutes. */
const MOVE_RUN_MS = 6 * 60 * 1000;

/** The next few answer rows, and the requests among them whose answer is still kept in rows. */
export const rowAnswersPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ pulls: v.array(v.id("seoDataPulls")), continueCursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("seoPullAnswers").withIndex("by_stored").paginate({ cursor: args.cursor, numItems: MOVE_ROWS });
    const pulls = page.page.filter((row) => row.resultJson !== undefined && (row.part ?? 0) === 0).map((row) => row.pullId);
    return { pulls, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** A request's answer kept in rows, whole, with when it was stored; null when it has none, or none whole. */
export const rowAnswer = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({ parts: v.array(v.string()), storedAt: v.number() })),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    const first = await ctx.db.query("seoPullAnswers").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).first();
    if (!pull || !first || first.file) return null;
    const parts = await readPullAnswerParts(ctx, pull);
    return parts ? { parts, storedAt: first.storedAt } : null;
  },
});

/** A moved answer's file as its request's answer, kept to its own age — unless it was moved or replaced meanwhile. */
export const recordMovedAnswer = internalMutation({
  args: { pullId: v.id("seoDataPulls"), file: v.id("_storage"), bytes: v.number(), storedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const first = await ctx.db.query("seoPullAnswers").withIndex("by_pull", (q) => q.eq("pullId", args.pullId)).first();
    if (!first || first.file) {
      await dropUntakenAnswer(ctx, { file: args.file });
      return false;
    }
    await storePullAnswer(ctx, args.pullId, { file: args.file, bytes: args.bytes }, args.storedAt);
    return true;
  },
});

/**
 * Run once on each deployment after 2026-10-08's change: every answer still
 * kept in rows stored as a file, a few rows a step, in runs that hand on to
 * the next until all are done. Safe to run again. Each answer expires a week
 * after it was stored whether moved or not; moved, it keeps that week.
 */
export const moveAnswersToFiles = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())), moved: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const started = Date.now();
    let cursor = args.cursor ?? null;
    let moved = args.moved ?? 0;
    for (;;) {
      if (Date.now() - started > MOVE_RUN_MS) {
        await ctx.scheduler.runAfter(0, internal.seoPullAnswers.moveAnswersToFiles, { cursor, moved });
        return null;
      }
      const page: { pulls: Id<"seoDataPulls">[]; continueCursor: string; isDone: boolean } =
        await ctx.runQuery(internal.seoPullAnswers.rowAnswersPage, { cursor });
      for (const pullId of page.pulls) {
        const answer: { parts: string[]; storedAt: number } | null = await ctx.runQuery(internal.seoPullAnswers.rowAnswer, { pullId });
        if (!answer) continue;
        const json = answer.parts.join("");
        const file = await ctx.storage.store(new Blob([json], { type: "application/json" }));
        const recorded: boolean = await ctx.runMutation(internal.seoPullAnswers.recordMovedAnswer, {
          pullId, file, bytes: utf8Length(json), storedAt: answer.storedAt,
        });
        if (recorded) moved += 1;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    console.log(`DataForSEO answers: ${moved} moved from rows into files.`);
    return null;
  },
});
