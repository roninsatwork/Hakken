import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { governanceAction, superAdminAction, superAdminQuery } from "./tenantFunctions";
import * as governanceShapes from "./utils/governanceShapes";
import {
  PERSONAL_DATA_RULES,
  describeErasure,
  indexFor,
  ruleFor,
  rulesFor,
  type ErasureResult,
  type ErasureTally,
  type PersonSummary,
  type PersonalDataSection,
  type SubjectAccessResult,
} from "./personalDataService";
import { appError } from "./utils/appError";
import { purgeAuthIdentity } from "./utils/authIdentityPurge";
import { usersForCanonicalEmail } from "./authEvents";

/**
 * Answering the two questions a person can ask about their own data: what do
 * you hold, and please delete it.
 *
 * Both walk the manifest in `personalDataService`, which is checked against the
 * schema by a test — so neither can quietly miss a table somebody added later.
 * That check is what makes the answer worth giving.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/**
 * How much one execution may read.
 *
 * An indexed search only ever loads the person's own rows, so it can afford a
 * generous page. A fallback scan loads every row it steps over — including
 * tables whose rows carry whole tool results — so its page is small enough that
 * even fat rows stay well inside the sixteen-megabyte ceiling.
 */
const INDEXED_PAGE = 500;
const SCAN_PAGE = 200;

/**
 * How far a single table may be searched.
 *
 * A ceiling rather than no ceiling because an action that walks a table of
 * millions one page at a time is not answering the request either. Reaching it
 * is reported rather than passed off as a complete answer.
 */
const MAX_PAGES = 200;

/**
 * How much destructive work one action segment may hand to Convex mutations.
 * A larger request saves its exact cursor and schedules the next segment,
 * instead of silently stopping at the old subject-access read ceiling.
 */
// Twenty pages is at most 4,000 row writes. Keep the handoff comfortably
// inside one action's lifetime so a very large request progresses through
// many durable checkpoints instead of risking one long, uncheckpointed turn.
const ERASURE_PAGES_PER_SEGMENT = 20;

const erasureTallyValidator = v.object({
  table: v.string(),
  treatment: v.union(v.literal("ERASE"), v.literal("DISSOCIATE"), v.literal("RETAIN")),
  rows: v.number(),
});

const erasureRunValidator = v.object({
  _id: v.id("personalDataErasureRuns"),
  _creationTime: v.number(),
  subjectUserId: v.id("users"),
  subjectEmail: v.string(),
  actorId: v.id("users"),
  status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
  ruleIndex: v.number(),
  fieldIndex: v.number(),
  cursor: v.optional(v.string()),
  pagesProcessed: v.number(),
  attempts: v.number(),
  tallies: v.array(erasureTallyValidator),
  startedAt: v.number(),
  lastProgressAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
});

type ErasureProgress = {
  ruleIndex: number;
  fieldIndex: number;
  cursor: string | null;
  pagesProcessed: number;
  tallies: ErasureTally[];
};

const ERASABLE_RULES = PERSONAL_DATA_RULES.filter(
  (rule) => rule.treatment !== "RETAIN" && rule.table !== "users",
);

/**
 * The table being searched comes from the manifest, so its name is data rather
 * than something the compiler knows. These describe the shape actually used —
 * an index range on one field, then a page — so the cast is confined here
 * instead of being sprinkled through every call.
 */
type PaginableQuery = {
  paginate: (options: { cursor: string | null; numItems: number }) => Promise<{
    page: Array<Record<string, unknown> & { _id: Id<TableNames> }>;
    continueCursor: string;
    isDone: boolean;
  }>;
};

type IndexableQuery = PaginableQuery & {
  withIndex: (
    name: string,
    range: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
  ) => PaginableQuery;
};

/** The person's rows in one table, by index where there is one and by scan where there is not. */
function searchFor(
  query: unknown,
  table: string,
  field: string,
  userId: Id<"users">,
): { source: PaginableQuery; indexed: boolean } {
  const index = indexFor(table, field);
  const base = query as IndexableQuery;

  return index
    ? { source: base.withIndex(index, (q) => q.eq(field, userId)), indexed: true }
    : { source: base, indexed: false };
}

export const findByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.string(),
  })),
  handler: async (ctx, args): Promise<PersonSummary | null> => {
    const email = args.email.trim().toLowerCase();
    if (!email) return null;

    const users = await usersForCanonicalEmail(ctx, email);

    if (users.length === 0) return null;
    if (users.length > 1) {
      throw appError("CONFLICT", "More than one account uses that email address. Repair the identity records before continuing.");
    }
    const user = users[0];
    if (!user) return null;

    return { userId: user._id, name: user.name ?? "", email: user.email ?? "", role: user.role ?? "USER" };
  },
});

/**
 * One page of one table, searched for one person.
 *
 * A page rather than a table because the whole manifest used to be walked
 * inside a single execution: fifty unindexed scans, every row of every table
 * loaded, and the sixteen-megabyte read ceiling hit long before the answer was
 * ready. The caller stitches the pages together, so no one execution reads more
 * than it can.
 *
 * Read-only, so an auditor can answer a subject access request without being
 * able to act on it.
 */
export const collectPage = internalQuery({
  args: {
    table: v.string(),
    field: v.string(),
    userId: v.id("users"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    rows: v.array(v.any()),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ rows: unknown[]; cursor: string | null; isDone: boolean }> => {
    const { source, indexed } = searchFor(
      ctx.db.query(args.table as TableNames),
      args.table,
      args.field,
      args.userId,
    );

    const page = await source.paginate({
      cursor: args.cursor,
      numItems: indexed ? INDEXED_PAGE : SCAN_PAGE,
    });

    // Matched in code rather than with `.filter()` on purpose. A database-side
    // filter still walks the whole table looking for matches, which is the
    // thing that was blowing the limit; paginating first bounds what is read,
    // and the match then costs nothing.
    const matched = indexed ? page.page : page.page.filter((row) => row[args.field] === args.userId);

    // Fields the manifest marks redacted come back blanked: the admin
    // producing the export may not read them (the personal-layer ruling —
    // admins see counts, never words). The row's existence still shows.
    const redactFields = ruleFor(args.table)?.redactFields;
    const rows = redactFields && redactFields.length > 0
      ? matched.map((row) => {
          const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
          for (const field of redactFields) {
            if (field in copy) copy[field] = "[REDACTED — visible only to the person themselves]";
          }
          return copy;
        })
      : matched;

    return { rows, cursor: page.continueCursor, isDone: page.isDone };
  },
});


export const produceSubjectAccess = governanceAction({
  args: { email: v.string() },
  returns: governanceShapes.subjectAccessShape,
  handler: async (ctx, args): Promise<SubjectAccessResult> => {
    const found = await ctx.runQuery(internal.personalData.findByEmail, { email: args.email });
    if (!found) {
      // The same answer whether or not the address exists would be pointless
      // here: the person asking is an administrator answering a legal request,
      // not an anonymous caller probing for accounts.
      throw appError("NOT_FOUND", "No account was found for that email address.");
    }

    const person = { ...found, userId: found.userId as Id<"users"> };

    const sections: PersonalDataSection[] = [];

    for (const rule of PERSONAL_DATA_RULES) {
      if (rule.table === "users") continue;

      const rows: unknown[] = [];
      let truncated = false;

      for (const field of rule.fields) {
        let cursor: string | null = null;

        for (let page = 0; page < MAX_PAGES; page += 1) {
          const result: { rows: unknown[]; cursor: string | null; isDone: boolean } = await ctx.runQuery(
            internal.personalData.collectPage,
            { table: rule.table, field, userId: person.userId, cursor },
          );

          rows.push(...result.rows);
          if (result.isDone) break;

          cursor = result.cursor;
          // The last page allowed was not the last page there was.
          if (page === MAX_PAGES - 1) truncated = true;
        }
      }

      if (rows.length > 0) {
        sections.push({
          table: rule.table,
          treatment: rule.treatment,
          reason: rule.reason,
          rows,
          ...(truncated ? { truncated: true } : {}),
        });
      }
    }

    await ctx.runMutation(internal.personalData.recordAction, {
      actorId: ctx.userId,
      subjectId: person.userId,
      action: "SUBJECT_ACCESS",
      summary: [`Produced everything held about ${person.email}.`],
    });

    return { person, sections };
  },
});

/**
 * One page of one table, erased or unlinked.
 *
 * Paged for the same reason the search is: an unindexed `.filter()` walks the
 * whole table inside one transaction, and on the busier tables that never
 * finished. Acting on a page at a time keeps each transaction small and lets a
 * long history complete across several of them.
 */
export const eraseFromTable = internalMutation({
  args: {
    table: v.string(),
    field: v.string(),
    userId: v.id("users"),
    cursor: v.union(v.string(), v.null()),
    /** Clear the field rather than delete the row. */
    dissociate: v.boolean(),
  },
  returns: v.object({
    removed: v.number(),
    cursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ removed: number; cursor: string | null; isDone: boolean }> => {
    const { source, indexed } = searchFor(
      ctx.db.query(args.table as TableNames),
      args.table,
      args.field,
      args.userId,
    );

    const page = await source.paginate({
      cursor: args.cursor,
      numItems: indexed ? INDEXED_PAGE : SCAN_PAGE,
    });

    const rows = indexed ? page.page : page.page.filter((row) => row[args.field] === args.userId);

    for (const row of rows) {
      if (args.dissociate) {
        // Cleared rather than pointed at a tombstone user. A field that is
        // absent reads as "nobody recorded"; a field pointing at a placeholder
        // account invents a person who never did anything.
        await ctx.db.patch(row._id, { [args.field]: undefined } as never);
      } else {
        await ctx.db.delete(row._id);
      }
    }

    return { removed: rows.length, cursor: page.continueCursor, isDone: page.isDone };
  },
});

async function processErasureSegment(
  ctx: ActionCtx,
  userId: Id<"users">,
  progress: ErasureProgress,
): Promise<{ done: boolean; progress: ErasureProgress }> {
  const next: ErasureProgress = {
    ...progress,
    tallies: progress.tallies.map((tally) => ({ ...tally })),
  };
  let pagesThisSegment = 0;

  while (next.ruleIndex < ERASABLE_RULES.length) {
    const rule = ERASABLE_RULES[next.ruleIndex];
    if (!rule) break;

    if (!next.tallies[next.ruleIndex]) {
      next.tallies.push({ table: rule.table, treatment: rule.treatment, rows: 0 });
    }

    while (next.fieldIndex < rule.fields.length) {
      const field = rule.fields[next.fieldIndex];
      if (!field) break;

      const result: { removed: number; cursor: string | null; isDone: boolean } =
        await ctx.runMutation(internal.personalData.eraseFromTable, {
          table: rule.table,
          field,
          userId,
          cursor: next.cursor,
          dissociate: rule.treatment === "DISSOCIATE",
        });

      const tally = next.tallies[next.ruleIndex];
      if (tally) tally.rows += result.removed;
      next.pagesProcessed += 1;
      pagesThisSegment += 1;

      if (result.isDone) {
        next.fieldIndex += 1;
        next.cursor = null;
      } else {
        next.cursor = result.cursor;
      }

      if (pagesThisSegment >= ERASURE_PAGES_PER_SEGMENT) {
        return { done: false, progress: next };
      }
    }

    next.ruleIndex += 1;
    next.fieldIndex = 0;
    next.cursor = null;
  }

  return { done: true, progress: next };
}

export const findRunningErasure = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), erasureRunValidator),
  handler: async (ctx, args) =>
    await ctx.db
      .query("personalDataErasureRuns")
      .withIndex("by_subject_status", (q) => q.eq("subjectUserId", args.userId).eq("status", "RUNNING"))
      .first(),
});

export const getErasureRun = internalQuery({
  args: { runId: v.id("personalDataErasureRuns") },
  returns: v.union(v.null(), erasureRunValidator),
  handler: async (ctx, args) => await ctx.db.get(args.runId),
});

export const createErasureRun = internalMutation({
  args: {
    subjectUserId: v.id("users"),
    subjectEmail: v.string(),
    actorId: v.id("users"),
    ruleIndex: v.number(),
    fieldIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
    pagesProcessed: v.number(),
    tallies: v.array(erasureTallyValidator),
  },
  returns: v.id("personalDataErasureRuns"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("personalDataErasureRuns")
      .withIndex("by_subject_status", (q) => q.eq("subjectUserId", args.subjectUserId).eq("status", "RUNNING"))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("personalDataErasureRuns", {
      subjectUserId: args.subjectUserId,
      subjectEmail: args.subjectEmail,
      actorId: args.actorId,
      status: "RUNNING",
      ruleIndex: args.ruleIndex,
      fieldIndex: args.fieldIndex,
      ...(args.cursor === null ? {} : { cursor: args.cursor }),
      pagesProcessed: args.pagesProcessed,
      attempts: 0,
      tallies: args.tallies,
      startedAt: now,
      lastProgressAt: now,
    });
  },
});

export const saveErasureProgress = internalMutation({
  args: {
    runId: v.id("personalDataErasureRuns"),
    ruleIndex: v.number(),
    fieldIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
    pagesProcessed: v.number(),
    tallies: v.array(erasureTallyValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "RUNNING") return false;
    await ctx.db.patch(args.runId, {
      ruleIndex: args.ruleIndex,
      fieldIndex: args.fieldIndex,
      cursor: args.cursor === null ? undefined : args.cursor,
      pagesProcessed: args.pagesProcessed,
      tallies: args.tallies,
      attempts: 0,
      error: undefined,
      lastProgressAt: Date.now(),
    });
    return true;
  },
});

export const failErasureRun = internalMutation({
  args: { runId: v.id("personalDataErasureRuns"), error: v.string() },
  returns: v.object({ retry: v.boolean(), attempts: v.number() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "RUNNING") return { retry: false, attempts: 0 };
    const attempts = run.attempts + 1;
    const retry = attempts < 5;
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      attempts,
      error: args.error.slice(0, 2_000),
      ...(retry ? {} : { status: "FAILED" as const, completedAt: now }),
    });
    return { retry, attempts };
  },
});

/**
 * Make identity removal and governance evidence one transaction. A crash
 * cannot leave a deleted user with live auth rows, or a completed deletion
 * without its audit record and durable run status.
 */
export const finalizeErasure = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    actorId: v.id("users"),
    summary: v.array(v.string()),
    runId: v.optional(v.id("personalDataErasureRuns")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.runId) {
      const run = await ctx.db.get(args.runId);
      if (!run || run.status !== "RUNNING") return false;
    }

    const person = await ctx.db.get(args.userId);
    if (person) {
      await purgeAuthIdentity(ctx, args.userId, person.email ?? args.email);
      await ctx.db.delete(args.userId);
    }

    await ctx.db.insert("auditLogs", {
      actionType: "ERASE_PERSONAL_DATA",
      actorId: args.actorId,
      entityType: "users",
      timestamp: Date.now(),
      metadata: JSON.stringify({
        summary: [`Erased everything held about ${args.email}.`, ...args.summary],
      }),
    });

    if (args.runId) {
      const now = Date.now();
      await ctx.db.patch(args.runId, {
        status: "SUCCESS",
        completedAt: now,
        lastProgressAt: now,
      });
    }
    return true;
  },
});

export const recordAction = internalMutation({
  args: {
    actorId: v.id("users"),
    subjectId: v.optional(v.id("users")),
    action: v.union(v.literal("SUBJECT_ACCESS"), v.literal("ERASURE")),
    summary: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      actionType: args.action === "ERASURE" ? "ERASE_PERSONAL_DATA" : "EXPORT_PERSONAL_DATA",
      actorId: args.actorId,
      entityType: "users",
      entityId: args.subjectId,
      timestamp: Date.now(),
      // The summary is kept, not the data. A record of an erasure that quoted
      // what was erased would put it straight back.
      metadata: JSON.stringify({ summary: args.summary }),
    });
  },
});

export const continueErasure = internalAction({
  args: { runId: v.id("personalDataErasureRuns") },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    const run = await ctx.runQuery(internal.personalData.getErasureRun, args);
    if (!run || run.status !== "RUNNING") return;

    try {
      const result = await processErasureSegment(ctx, run.subjectUserId, {
        ruleIndex: run.ruleIndex,
        fieldIndex: run.fieldIndex,
        cursor: run.cursor ?? null,
        pagesProcessed: run.pagesProcessed,
        tallies: run.tallies as ErasureTally[],
      });

      if (result.done) {
        const summary = describeErasure(result.progress.tallies);
        await ctx.runMutation(internal.personalData.finalizeErasure, {
          userId: run.subjectUserId,
          email: run.subjectEmail,
          actorId: run.actorId,
          summary,
          runId: args.runId,
        });
        return;
      }

      const saved = await ctx.runMutation(internal.personalData.saveErasureProgress, {
        runId: args.runId,
        ...result.progress,
      });
      if (saved) {
        await ctx.scheduler.runAfter(0, internal.personalData.continueErasure, args);
      }
    } catch (error) {
      const failure = await ctx.runMutation(internal.personalData.failErasureRun, {
        runId: args.runId,
        error: error instanceof Error ? error.message : "The erasure worker failed.",
      });
      if (failure.retry) {
        const delay = Math.min(60_000 * 2 ** (failure.attempts - 1), 15 * 60_000);
        await ctx.scheduler.runAfter(delay, internal.personalData.continueErasure, args);
      }
    }
  },
});

export const erasureStatus = superAdminQuery({
  args: { runId: v.id("personalDataErasureRuns") },
  returns: v.object({
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    summary: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Erasure run not found.");
    return {
      status: run.status,
      summary: describeErasure(run.tallies as ErasureTally[]),
    };
  },
});

export const erase = superAdminAction({
  args: { email: v.string() },
  returns: governanceShapes.erasureShape,
  handler: async (ctx, args): Promise<ErasureResult> => {
    const found = await ctx.runQuery(internal.personalData.findByEmail, { email: args.email });
    if (!found) throw appError("NOT_FOUND", "No account was found for that email address.");
    const person = { ...found, userId: found.userId as Id<"users"> };

    if (person.userId === ctx.userId) {
      // Erasing yourself mid-request would end the session that is performing
      // the erasure, leaving it half done and nobody signed in to finish it.
      throw appError("UNAUTHORIZED", "You cannot erase your own account from here. Ask another administrator.");
    }

    const running = await ctx.runQuery(internal.personalData.findRunningErasure, {
      userId: person.userId,
    });
    if (running) {
      return {
        email: person.email,
        summary: ["Erasure is already continuing safely in the background."],
        tallies: running.tallies as ErasureTally[],
        queued: true,
        runId: String(running._id),
      };
    }

    const result = await processErasureSegment(ctx, person.userId, {
      ruleIndex: 0,
      fieldIndex: 0,
      cursor: null,
      pagesProcessed: 0,
      tallies: [],
    });

    if (!result.done) {
      const runId = await ctx.runMutation(internal.personalData.createErasureRun, {
        subjectUserId: person.userId,
        subjectEmail: person.email,
        actorId: ctx.userId,
        ...result.progress,
      });
      await ctx.scheduler.runAfter(0, internal.personalData.continueErasure, { runId });

      return {
        email: person.email,
        summary: ["Erasure is continuing safely in the background until every matching record is handled."],
        tallies: result.progress.tallies,
        queued: true,
        runId: String(runId),
      };
    }

    const summary = describeErasure(result.progress.tallies);

    await ctx.runMutation(internal.personalData.finalizeErasure, {
      userId: person.userId,
      email: person.email,
      actorId: ctx.userId,
      summary,
    });

    return { email: person.email, summary, tallies: result.progress.tallies };
  },
});

/** What the screens show before anyone presses anything. */
export const retainedExceptions = governanceAction({
  args: {},
  returns: governanceShapes.retainedExceptionListShape,
  handler: async (): Promise<Array<{ table: string; reason: string }>> =>
    rulesFor("RETAIN").map((rule) => ({ table: rule.table, reason: rule.reason })),
});
