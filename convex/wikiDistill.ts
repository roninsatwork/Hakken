import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminQuery, tenantQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";

/**
 * The distiller's default-runtime half (wiki-replaces-knowledge plan, stage
 * one). Importing IS how the wiki learns: the on-ready hook feeds every new
 * document in, and the catch-up sweep brings the already-imported store in
 * line, a few documents at a time, until nothing is left behind. There is
 * no button anywhere in this file, and there never will be.
 */

/** How many documents one catch-up tick may send to the model, per company. */
export const WIKI_DISTILL_BATCH_SIZE = 5;

/** More than any real document needs; keeps a scraped page from flooding a prompt. */
export const WIKI_DISTILL_TEXT_MAX_CHARS = 8_000;

/** One document's distillable text: its own content, or its chunks joined. */
async function distillableText(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  document: Doc<"knowledgeDocuments">
): Promise<string> {
  if (document.textContent?.trim()) return document.textContent.slice(0, WIKI_DISTILL_TEXT_MAX_CHARS);
  const chunks = await ctx.db
    .query("knowledgeChunks")
    .withIndex("by_document", (q) => q.eq("documentId", document._id))
    .take(12);
  return chunks.map((chunk) => chunk.text).join("\n\n").slice(0, WIKI_DISTILL_TEXT_MAX_CHARS);
}

function isDistillable(document: Doc<"knowledgeDocuments">): boolean {
  return (
    document.status === "ready" &&
    !document.threadId &&
    // A company's shelf, or the global one (global-wiki-plan.md, phase 1).
    // Agent-scoped documents belong to neither brain and are never taught.
    (Boolean(document.companyId) || !document.agentId) &&
    document.wikiDistilledAt === undefined &&
    // A review-marked document waits for its person (wiki-agents plan,
    // phase 4): the wiki learns nothing from it until approval clears it.
    document.wikiReviewRequested !== true
  );
}

/**
 * Claim-first, then read: the claim (stamping `wikiDistilledAt`) happens in
 * a transaction before any model call, so the on-ready hook and the catch-up
 * sweep can never read the same document twice, whatever the timing. A
 * distillation that fails after its claim is logged and left — a rare lost
 * lesson beats an infinite retry loop of model spend.
 */
export const claimDocumentForDistillInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (
    ctx,
    args
  ): Promise<{ companyId: Id<"companies"> | null; title: string; sourceUrl: string | null; text: string } | null> => {
    const document = await ctx.db.get(args.documentId);
    if (!document || !isDistillable(document)) return null;
    await ctx.db.patch(document._id, { wikiDistilledAt: Date.now() });
    const text = await distillableText(ctx, document);
    if (!text.trim()) return null;
    return {
      companyId: document.companyId ?? null,
      title: document.title,
      sourceUrl: document.sourceUrl ?? null,
      text,
    };
  },
});

/** The catch-up sweep's shopping list: companies still holding documents the
 * wiki has not read. Bounded the way the tending sweep's list is. */
export const listCompaniesWithUndistilledInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"companies">>> => {
    const documents = await ctx.db.query("knowledgeDocuments").order("desc").take(2000);
    const companies = new Set<Id<"companies">>();
    for (const document of documents) {
      // The global shelf's backlog is the staff's global round, not a slot
      // in the company list (global-wiki-plan.md, phase 4).
      if (isDistillable(document) && document.companyId) companies.add(document.companyId);
    }
    return [...companies];
  },
});

/** The sweep's claim: up to a batch of unread documents, stamped before any
 * model sees them. Two concurrent chains split the work instead of doubling it. */
export const claimNextDistillBatchInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ documentId: Id<"knowledgeDocuments">; title: string; sourceUrl: string | null; text: string }>> => {
    const documents = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(1000);
    const now = Date.now();
    const batch = [];
    for (const document of documents) {
      if (batch.length >= WIKI_DISTILL_BATCH_SIZE) break;
      if (!isDistillable(document)) continue;
      await ctx.db.patch(document._id, { wikiDistilledAt: now });
      const text = await distillableText(ctx, document);
      batch.push({
        documentId: document._id,
        title: document.title,
        sourceUrl: document.sourceUrl ?? null,
        text,
      });
    }
    return batch;
  },
});

/** Already-distilled documents with their text — the source-note backfill's
 * shopping list (wiki-agents plan, phase 3). Bounded and mechanical. */
export const getDistilledDocumentsInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ documentId: Id<"knowledgeDocuments">; title: string; sourceUrl: string | null; text: string }>> => {
    const documents = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(1000);
    const result = [];
    for (const document of documents) {
      if (document.status !== "ready" || document.threadId || document.wikiDistilledAt === undefined) {
        continue;
      }
      // Under the global scope the bare index also surfaces agent-scoped
      // documents; they belong to neither brain.
      if (!document.companyId && document.agentId) continue;
      const text = await distillableText(ctx, document);
      if (!text.trim()) continue;
      result.push({
        documentId: document._id,
        title: document.title,
        sourceUrl: document.sourceUrl ?? null,
        text,
      });
    }
    return result;
  },
});

export const recordDistillProgressInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    documentsRead: v.number(),
    pagesWritten: v.number(),
    pagesImproved: v.number(),
    lastDocumentTitle: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const state = await ctx.db
      .query("wikiDistillState")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .unique();
    if (state) {
      await ctx.db.patch(state._id, {
        documentsRead: state.documentsRead + args.documentsRead,
        pagesWritten: state.pagesWritten + args.pagesWritten,
        pagesImproved: state.pagesImproved + args.pagesImproved,
        ...(args.lastDocumentTitle ? { lastDocumentTitle: args.lastDocumentTitle } : {}),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("wikiDistillState", {
        companyId: args.companyId,
        documentsRead: args.documentsRead,
        pagesWritten: args.pagesWritten,
        pagesImproved: args.pagesImproved,
        ...(args.lastDocumentTitle ? { lastDocumentTitle: args.lastDocumentTitle } : {}),
        updatedAt: now,
      });
    }
  },
});

/**
 * The Wiki screen's progress panel (design, screen 2): how far the reading
 * has got, and whether any is still to do. Live, so the bar moves by itself.
 */
async function distillProgressFor(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  companyId: Id<"companies"> | undefined
) {
  const documents = await ctx.db
    .query("knowledgeDocuments")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(1000);
  const eligible = documents.filter(
    (document) =>
      document.status === "ready" &&
      !document.threadId &&
      (Boolean(document.companyId) || !document.agentId)
  );
  const remaining = eligible.filter((document) => document.wikiDistilledAt === undefined).length;
  const state = await ctx.db
    .query("wikiDistillState")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .unique();
  return {
    totalDocuments: eligible.length,
    remainingDocuments: remaining,
    documentsRead: state?.documentsRead ?? 0,
    pagesWritten: state?.pagesWritten ?? 0,
    pagesImproved: state?.pagesImproved ?? 0,
    lastDocumentTitle: state?.lastDocumentTitle ?? null,
    isReading: remaining > 0,
  };
}

export const getDistillProgress = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return null;
    return await distillProgressFor(ctx, companyId);
  },
});

export const getDistillProgressForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    return await distillProgressFor(ctx, undefined);
  },
});

export const getDistillProgressForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await distillProgressFor(ctx, args.companyId);
  },
});
