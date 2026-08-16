import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import {
  displayQuestion,
  isSubstantiveQuestion,
  questionKey,
} from "./wikiFeedbackService";

/**
 * The loop's bookkeeping (closing-the-loop-plan.md, phases 1–2): one
 * mutation records what every answer meant — pages under it bump their
 * tallies and close any matching gap; no pages under it logs the gap.
 * Scheduled after the reply, never awaited by it, and entirely
 * mechanical: nothing here costs a model call.
 */

export const recordAnswerOutcomeInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    question: v.string(),
    /** The wiki pages the answer stood on; global/-prefixed keys are the
     * platform shelf's. Empty means the wiki had nothing. */
    pageKeys: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();

    if (args.pageKeys.length > 0) {
      // The pages that carried the answer get their marks (phase 2).
      for (const rawKey of args.pageKeys.slice(0, 8)) {
        const isGlobal = rawKey.startsWith("global/");
        const key = isGlobal ? rawKey.slice("global/".length) : rawKey;
        const separator = key.indexOf(":");
        if (separator <= 0) continue;
        const kind = key.slice(0, separator);
        if (!["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "SOURCE"].includes(kind)) continue;
        const page = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) =>
            q
              .eq("companyId", isGlobal ? undefined : args.companyId)
              .eq("kind", kind as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE")
              .eq("subjectKey", key.slice(separator + 1))
          )
          .unique();
        if (!page) continue;
        await ctx.db.patch(page._id, {
          usageCount: (page.usageCount ?? 0) + 1,
          lastUsedAt: now,
        });
      }

      // An answered asking closes the gap a failed one opened (phase 1):
      // the row resolves itself, no button pressed.
      const key = questionKey(args.question);
      if (key) {
        const open = await ctx.db
          .query("wikiUnansweredQuestions")
          .withIndex("by_company_key", (q) =>
            q.eq("companyId", args.companyId).eq("normalizedKey", key)
          )
          .unique();
        if (open && open.status === "OPEN") {
          await ctx.db.patch(open._id, { status: "RESOLVED", resolvedAt: now });
        }
      }
      return;
    }

    // No pages under the answer: the gap is logged, once, and counted on
    // repeats. A dismissed question stays dismissed — that was a person's
    // call — and a resolved one that fails again reopens, because the gap
    // is evidently back.
    if (!isSubstantiveQuestion(args.question)) return;
    const key = questionKey(args.question);
    if (!key) return;
    const existing = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_key", (q) =>
        q.eq("companyId", args.companyId).eq("normalizedKey", key)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("wikiUnansweredQuestions", {
        companyId: args.companyId,
        question: displayQuestion(args.question),
        normalizedKey: key,
        askCount: 1,
        status: "OPEN",
        firstAskedAt: now,
        lastAskedAt: now,
      });
      return;
    }
    if (existing.status === "DISMISSED") {
      await ctx.db.patch(existing._id, { askCount: existing.askCount + 1, lastAskedAt: now });
      return;
    }
    await ctx.db.patch(existing._id, {
      askCount: existing.askCount + 1,
      lastAskedAt: now,
      status: "OPEN",
      resolvedAt: undefined,
    });
  },
});

/** The panel's read: open gaps, most recently asked first. */
export const listUnansweredForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const rows = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_status_asked", (q) =>
        q.eq("companyId", args.companyId).eq("status", "OPEN")
      )
      .order("desc")
      .take(50);
    return rows
      .sort((a, b) => b.askCount - a.askCount || b.lastAskedAt - a.lastAskedAt)
      .map((row) => ({
        unansweredId: row._id,
        question: row.question,
        askCount: row.askCount,
        lastAskedAt: row.lastAskedAt,
      }));
  },
});

/** Not worth covering — a person's call, audited like every other. */
export const dismissUnansweredForCompany = adminMutation({
  args: { companyId: v.id("companies"), unansweredId: v.id("wikiUnansweredQuestions") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const row = await ctx.db.get(args.unansweredId);
    if (!row || row.companyId !== args.companyId) throw new Error("Question not found.");
    if (row.status !== "OPEN") return;
    const now = Date.now();
    await ctx.db.patch(row._id, { status: "DISMISSED" });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "WIKI_UNANSWERED_DISMISSED",
      entityId: row._id.toString(),
      entityType: "wikiUnansweredQuestions",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ question: row.question.slice(0, 120), askCount: row.askCount }),
    });
  },
});
