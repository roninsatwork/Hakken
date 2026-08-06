import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { governanceAction, superAdminAction } from "./tenantFunctions";
import {
  PERSONAL_DATA_RULES,
  describeErasure,
  rulesFor,
  type ErasureResult,
  type ErasureTally,
  type PersonSummary,
  type PersonalDataSection,
  type SubjectAccessResult,
} from "./personalDataService";

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

/** Bounded per transaction, so a person with a long history does not blow the limit. */
const BATCH = 200;
/** Enough passes to finish a large history; a stubborn table stops rather than looping forever. */
const MAX_PASSES = 50;

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
 * Everything held about one person, gathered table by table.
 *
 * Read-only, so an auditor can answer a subject access request without being
 * able to act on it.
 */
export const collect = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ sections: PersonalDataSection[] }> => {
    const sections: PersonalDataSection[] = [];

    for (const rule of PERSONAL_DATA_RULES) {
      if (rule.table === "users") continue;

      const rows: unknown[] = [];
      for (const field of rule.fields) {
        const found = await ctx.db
          .query(rule.table as TableNames)
          .filter((q) => q.eq(q.field(field as never), args.userId))
          .take(BATCH);
        rows.push(...found);
      }

      if (rows.length > 0) {
        sections.push({ table: rule.table, treatment: rule.treatment, reason: rule.reason, rows });
      }
    }

    return { sections };
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
      throw new Error("No account was found for that email address.");
    }

    const person = { ...found, userId: found.userId as Id<"users"> };
    const collected = await ctx.runQuery(internal.personalData.collect, { userId: person.userId });

    await ctx.runMutation(internal.personalData.recordAction, {
      actorId: ctx.userId,
      subjectId: person.userId,
      action: "SUBJECT_ACCESS",
      summary: [`Produced everything held about ${person.email}.`],
    });

    return { person, sections: collected.sections };
  },
});

/** One table's worth of erasure, small enough to fit in a transaction. */
export const eraseFromTable = internalMutation({
  args: { table: v.string(), fields: v.array(v.string()), userId: v.id("users") },
  handler: async (ctx, args): Promise<{ removed: number; more: boolean }> => {
    let removed = 0;
    let more = false;

    for (const field of args.fields) {
      const rows = await ctx.db
        .query(args.table as TableNames)
        .filter((q) => q.eq(q.field(field as never), args.userId))
        .take(BATCH);

      for (const row of rows) await ctx.db.delete(row._id);
      removed += rows.length;
      if (rows.length === BATCH) more = true;
    }

    return { removed, more };
  },
});

/** The name comes off; the record stays. */
export const dissociateInTable = internalMutation({
  args: { table: v.string(), fields: v.array(v.string()), userId: v.id("users") },
  handler: async (ctx, args): Promise<{ removed: number; more: boolean }> => {
    let changed = 0;
    let more = false;

    for (const field of args.fields) {
      const rows = await ctx.db
        .query(args.table as TableNames)
        .filter((q) => q.eq(q.field(field as never), args.userId))
        .take(BATCH);

      for (const row of rows) {
        // Cleared rather than pointed at a tombstone user. A field that is
        // absent reads as "nobody recorded"; a field pointing at a placeholder
        // account invents a person who never did anything.
        await ctx.db.patch(row._id, { [field]: undefined } as never);
      }

      changed += rows.length;
      if (rows.length === BATCH) more = true;
    }

    return { removed: changed, more };
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
  handler: async (ctx, args): Promise<ErasureResult> => {
    const found = await ctx.runQuery(internal.personalData.findByEmail, { email: args.email });
    if (!found) throw new Error("No account was found for that email address.");
    const person = { ...found, userId: found.userId as Id<"users"> };

    if (person.userId === ctx.userId) {
      // Erasing yourself mid-request would end the session that is performing
      // the erasure, leaving it half done and nobody signed in to finish it.
      throw new Error("You cannot erase your own account from here. Ask another administrator.");
    }

    const tallies: ErasureTally[] = [];

    for (const rule of PERSONAL_DATA_RULES) {
      if (rule.treatment === "RETAIN" || rule.table === "users") continue;

      const mutation =
        rule.treatment === "ERASE"
          ? internal.personalData.eraseFromTable
          : internal.personalData.dissociateInTable;

      let rows = 0;
      for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        const result = await ctx.runMutation(mutation, {
          table: rule.table,
          fields: rule.fields,
          userId: person.userId,
        });
        rows += result.removed;
        if (!result.more) break;
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
