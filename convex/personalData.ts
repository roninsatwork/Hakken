import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { governanceAction, superAdminAction } from "./tenantFunctions";
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
  handler: async (ctx, args): Promise<PersonSummary | null> => {
    const email = args.email.trim().toLowerCase();
    if (!email) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

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

export const removePerson = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.userId);
    if (person) await ctx.db.delete(args.userId);
  },
});

export const recordAction = internalMutation({
  args: {
    actorId: v.id("users"),
    subjectId: v.optional(v.id("users")),
    action: v.union(v.literal("SUBJECT_ACCESS"), v.literal("ERASURE")),
    summary: v.array(v.string()),
  },
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

    const tallies: ErasureTally[] = [];

    for (const rule of PERSONAL_DATA_RULES) {
      if (rule.treatment === "RETAIN" || rule.table === "users") continue;

      let rows = 0;

      for (const field of rule.fields) {
        let cursor: string | null = null;

        for (let page = 0; page < MAX_PAGES; page += 1) {
          const result: { removed: number; cursor: string | null; isDone: boolean } =
            await ctx.runMutation(internal.personalData.eraseFromTable, {
              table: rule.table,
              field,
              userId: person.userId,
              cursor,
              dissociate: rule.treatment === "DISSOCIATE",
            });

          rows += result.removed;
          if (result.isDone) break;
          cursor = result.cursor;
        }
      }

      tallies.push({ table: rule.table, treatment: rule.treatment, rows });
    }

    // The person themselves goes last, so a failure part-way through leaves an
    // account that can be found and finished rather than orphaned rows nobody
    // can trace back.
    await ctx.runMutation(internal.personalData.removePerson, { userId: person.userId });

    const summary = describeErasure(tallies);

    await ctx.runMutation(internal.personalData.recordAction, {
      actorId: ctx.userId,
      // Deliberately not the deleted id: it points at nothing now, and the
      // summary is what the record is for.
      action: "ERASURE",
      summary: [`Erased everything held about ${person.email}.`, ...summary],
    });

    return { email: person.email, summary, tallies };
  },
});

/** What the screens show before anyone presses anything. */
export const retainedExceptions = governanceAction({
  args: {},
  handler: async (): Promise<Array<{ table: string; reason: string }>> =>
    rulesFor("RETAIN").map((rule) => ({ table: rule.table, reason: rule.reason })),
});
