import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, tenantQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, getActiveCompanyId } from "./authz";
import { internal } from "./_generated/api";

/**
 * The Reviewer's doors (wiki-agents plan, phase 4): a marked document's
 * claims held for a person. Approval clears the checkpoint and lets the
 * Distiller learn; rejection parks the document — kept in the library,
 * never taught to the wiki — and both decisions leave audit rows.
 */

/** The document behind a checkpoint, for the Reviewer's reading. */
export const getReviewableDocumentInternal = internalQuery({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (
    ctx,
    args
  ): Promise<{ companyId: Id<"companies"> | null; title: string; text: string } | null> => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.status !== "ready" || !document.wikiReviewRequested) {
      return null;
    }
    // A company's document or the global shelf's; agent- and thread-scoped
    // documents belong to neither brain and are never reviewed for one.
    if (!document.companyId && (document.agentId || document.threadId)) return null;
    let text = document.textContent?.trim() ?? "";
    if (!text) {
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .take(10);
      text = chunks.map((chunk) => chunk.text).join("\n\n");
    }
    if (!text.trim()) return null;
    return { companyId: document.companyId ?? null, title: document.title, text: text.slice(0, 8000) };
  },
});

/** A stood-down Reviewer waves documents through rather than blocking them. */
export const clearReviewFlagInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.documentId, { wikiReviewRequested: false });
  },
});

export const fileReviewInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    documentId: v.id("knowledgeDocuments"),
    title: v.string(),
    claimsJson: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("wikiReviews")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    if (existing) return;
    await ctx.db.insert("wikiReviews", {
      companyId: args.companyId,
      documentId: args.documentId,
      title: args.title,
      claimsJson: args.claimsJson,
      status: "PENDING",
      requestedAt: Date.now(),
    });
  },
});

function reviewForScreen(review: {
  _id: Id<"wikiReviews">;
  title: string;
  claimsJson: string;
  requestedAt: number;
}) {
  let claims: string[] = [];
  try {
    const parsed = JSON.parse(review.claimsJson) as unknown;
    if (Array.isArray(parsed)) claims = parsed.filter((claim): claim is string => typeof claim === "string");
  } catch {
    claims = [];
  }
  return { reviewId: review._id, title: review.title, claims, requestedAt: review.requestedAt };
}

export const listPendingReviews = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];
    const rows = await ctx.db
      .query("wikiReviews")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "PENDING"))
      .order("desc")
      .take(25);
    return rows.map(reviewForScreen);
  },
});

export const listPendingReviewsForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const rows = await ctx.db
      .query("wikiReviews")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", args.companyId).eq("status", "PENDING")
      )
      .order("desc")
      .take(25);
    return rows.map(reviewForScreen);
  },
});

export const listPendingReviewsForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    const rows = await ctx.db
      .query("wikiReviews")
      .withIndex("by_company_status", (q) =>
        q.eq("companyId", undefined).eq("status", "PENDING")
      )
      .order("desc")
      .take(25);
    return rows.map(reviewForScreen);
  },
});

export const decideReviewForGlobal = adminMutation({
  args: { reviewId: v.id("wikiReviews"), approve: v.boolean() },
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    await decideCore(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

async function decideCore(
  ctx: import("./_generated/server").MutationCtx & { scheduler: import("./_generated/server").MutationCtx["scheduler"] },
  args: {
    companyId: Id<"companies"> | undefined;
    userId: Id<"users">;
    reviewId: Id<"wikiReviews">;
    approve: boolean;
  }
): Promise<void> {
  const review = await ctx.db.get(args.reviewId);
  if (!review || review.companyId !== args.companyId) throw new Error("Review not found.");
  if (review.status !== "PENDING") return;
  const now = Date.now();
  await ctx.db.patch(review._id, {
    status: args.approve ? "APPROVED" : "REJECTED",
    decidedAt: now,
    decidedBy: args.userId,
  });
  if (args.approve) {
    // The checkpoint clears and the Distiller learns, exactly as if the
    // document had arrived unmarked.
    await ctx.db.patch(review.documentId, { wikiReviewRequested: false });
    await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilNewDocument, {
      documentId: review.documentId,
    });
  } else {
    // Parked: kept in the library, never taught. The distilled stamp keeps
    // every sweep's hands off it.
    await ctx.db.patch(review.documentId, { wikiDistilledAt: now });
  }
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: args.approve ? "WIKI_REVIEW_APPROVED" : "WIKI_REVIEW_REJECTED",
    entityId: review._id.toString(),
    entityType: "wikiReviews",
    companyId: args.companyId,
    timestamp: now,
    metadata: JSON.stringify({ documentId: review.documentId, title: review.title.slice(0, 120) }),
  });
}

export const decideReview = adminMutation({
  args: { reviewId: v.id("wikiReviews"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw new Error("No workspace selected.");
    await decideCore(ctx, { companyId, userId: ctx.userId, ...args });
  },
});

export const decideReviewForCompany = adminMutation({
  args: { companyId: v.id("companies"), reviewId: v.id("wikiReviews"), approve: v.boolean() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await decideCore(ctx, { userId: ctx.userId, ...args });
  },
});
