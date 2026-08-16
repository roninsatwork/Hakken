import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { questionKey } from "./wikiFeedbackService";

/**
 * The Examiner's default-runtime half (closing-the-loop-plan.md, phase
 * 4). Drafts grow from RESOLVED couldn't-answer rows — questions real
 * people asked that the wiki has since learned to answer — because a
 * draft grown from a still-open gap would only fail the checks it joins.
 * A rejected draft keeps its fingerprint for ever: the same question is
 * never proposed twice.
 */

export const listGrowthCandidatesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (
    ctx,
    args
  ): Promise<{
    candidates: Array<{ question: string; askCount: number }>;
    existingPrompts: string[];
  }> => {
    const resolved = await ctx.db
      .query("wikiUnansweredQuestions")
      .withIndex("by_company_status_asked", (q) =>
        q.eq("companyId", args.companyId).eq("status", "RESOLVED")
      )
      .order("desc")
      .take(50);

    const cases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_surface", (q) =>
        q.eq("companyId", args.companyId).eq("targetSurface", "COMPANY_CHAT")
      )
      .take(300);
    const knownFingerprints = new Set(
      cases.map((row) => row.proposalFingerprint).filter(Boolean)
    );

    const candidates = resolved
      .filter((row) => !knownFingerprints.has(questionKey(row.question)))
      .sort((a, b) => b.askCount - a.askCount)
      .slice(0, 8)
      .map((row) => ({ question: row.question, askCount: row.askCount }));

    return {
      candidates,
      existingPrompts: cases
        .filter((row) => row.status !== "ARCHIVED")
        .map((row) => row.prompt)
        .slice(0, 100),
    };
  },
});

export const proposeExamCaseInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    prompt: v.string(),
    expectedBehavior: v.string(),
    grewFrom: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const fingerprint = questionKey(args.grewFrom);
    if (!fingerprint) return false;
    const existing = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_fingerprint", (q) =>
        q.eq("companyId", args.companyId).eq("proposalFingerprint", fingerprint)
      )
      .first();
    if (existing) return false;
    const now = Date.now();
    const caseId = await ctx.db.insert("companyEvalCases", {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      name: `Grown from a real question — ${args.grewFrom.slice(0, 80)}`,
      // Advisory until a person decides otherwise: a grown check informs
      // before it gates.
      severity: "ADVISORY",
      targetSurface: "COMPANY_CHAT",
      prompt: args.prompt.slice(0, 500),
      expectedBehavior: args.expectedBehavior.slice(0, 1000),
      status: "PROPOSED",
      proposalFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_EXAM_DRAFTED",
      entityId: caseId.toString(),
      entityType: "companyEvalCases",
      ...(args.companyId ? { companyId: args.companyId } : {}),
      timestamp: now,
      metadata: JSON.stringify({ grewFrom: args.grewFrom.slice(0, 120) }),
    });
    return true;
  },
});

/** The Evals screen's drafts shelf. */
export const listProposedCasesForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const rows = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", args.companyId).eq("status", "PROPOSED")
      )
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      caseId: row._id,
      name: row.name,
      prompt: row.prompt,
      expectedBehavior: row.expectedBehavior,
      createdAt: row.createdAt,
    }));
  },
});

export const listProposedCasesForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to platform checks");
    }
    const rows = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", undefined).eq("status", "PROPOSED")
      )
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      caseId: row._id,
      name: row.name,
      prompt: row.prompt,
      expectedBehavior: row.expectedBehavior,
      createdAt: row.createdAt,
    }));
  },
});

/** The platform's active checks, for the panel: prompt and last result. */
export const listPlatformChecks = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to platform checks");
    }
    const rows = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", undefined).eq("status", "ACTIVE")
      )
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      caseId: row._id,
      prompt: row.prompt,
      lastRunStatus: row.lastRunStatus ?? null,
      lastRunAt: row.lastRunAt ?? null,
    }));
  },
});

async function decideDraft(
  ctx: import("./_generated/server").MutationCtx,
  args: {
    companyId: Id<"companies"> | undefined;
    userId: Id<"users">;
    caseId: Id<"companyEvalCases">;
    approve: boolean;
  }
): Promise<void> {
  const row = await ctx.db.get(args.caseId);
  if (!row || row.companyId !== args.companyId) throw new Error("Draft not found.");
  // (Platform drafts have no company; both sides undefined pass the wall.)
  if (row.status !== "PROPOSED") return;
  const now = Date.now();
  if (args.approve) {
    await ctx.db.patch(row._id, { status: "ACTIVE", updatedAt: now });
  } else {
    // Archived WITH its fingerprint: rejection is remembered for ever.
    await ctx.db.patch(row._id, {
      status: "ARCHIVED",
      archivedAt: now,
      archivedBy: args.userId,
      updatedAt: now,
    });
  }
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: args.approve ? "WIKI_EXAM_DRAFT_APPROVED" : "WIKI_EXAM_DRAFT_REJECTED",
    entityId: row._id.toString(),
    entityType: "companyEvalCases",
    ...(args.companyId ? { companyId: args.companyId } : {}),
    timestamp: now,
    metadata: JSON.stringify({ prompt: row.prompt.slice(0, 120) }),
  });
}

export const decideProposedCaseForGlobal = adminMutation({
  args: { caseId: v.id("companyEvalCases"), approve: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized access to platform checks");
    }
    await decideDraft(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

export const decideProposedCaseForCompany = adminMutation({
  args: { companyId: v.id("companies"), caseId: v.id("companyEvalCases"), approve: v.boolean() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await decideDraft(ctx, { userId: ctx.userId, ...args });
  },
});
