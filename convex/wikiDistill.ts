import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminQuery, moduleQuery } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { CORE_MODULES } from "./utils/coreModules";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";
import { internal } from "./_generated/api";
import { splitDocumentIntoSections } from "./wikiRewriteService";
import { documentFullText as distillableText } from "./wikiDocumentText";
export { stitchChunks } from "./wikiRewriteService";
import { removeDocumentFromWiki } from "./wikiCheckupPages";

/** One company's documents read at a time by the re-read and the intake count; past it a run notes it and stops. */
export const WIKI_COMPANY_DOCUMENTS_READ = 1_000;

/**
 * The distiller's default-runtime half (wiki-replaces-knowledge plan, stage
 * one). Importing IS how the wiki learns: the on-ready hook feeds every new
 * document in, and the catch-up sweep brings the already-imported store in
 * line, a few documents at a time, until nothing is left behind. There is
 * no button anywhere in this file, and there never will be.
 */

/** How many documents one catch-up tick may send to the model, per company. */
export const WIKI_DISTILL_BATCH_SIZE = 5;

export { WIKI_DISTILL_TEXT_MAX_CHARS } from "./wikiDocumentText";

/**
 * The old reading length, kept for the one-time source-note backfill, which
 * walks every document at once and must stay inside one query's reads.
 */
const WIKI_BACKFILL_TEXT_MAX_CHARS = 8_000;

/**
 * The most text one catch-up batch claims. A batch stops adding documents
 * past this (always taking at least one), so five long files never pile
 * into one read.
 */
const WIKI_DISTILL_BATCH_MAX_CHARS = 150_000;

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

/** How many failed attempts a document gets before the wiki gives up on it. */
export const WIKI_DISTILL_MAX_ATTEMPTS = 3;

/**
 * Claim-first, then read: the claim (stamping `wikiDistilledAt`) happens in
 * a transaction before any model call, so the on-ready hook and the catch-up
 * sweep can never read the same document twice, whatever the timing.
 *
 * A failure after the claim used to be logged and left, on the reasoning
 * that a rare lost lesson beat an infinite retry loop of model spend. It is
 * not rare: one bad model call leaves the document filed, listed on screen,
 * and permanently unanswerable, with nothing anywhere saying so. The claim
 * is released instead (`releaseDistillClaimInternal`), and
 * `WIKI_DISTILL_MAX_ATTEMPTS` is what keeps the retry loop finite.
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

/**
 * A claim handed back after the distillation failed, so the catch-up sweep
 * picks the document up again. Gives up quietly once the document has had
 * `WIKI_DISTILL_MAX_ATTEMPTS` goes — a document that fails every time is a
 * document something else is wrong with, and it stays claimed rather than
 * burning model spend forever.
 */
export const releaseDistillClaimInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<{ released: boolean; attempts: number }> => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return { released: false, attempts: 0 };
    const attempts = (document.wikiDistillAttempts ?? 0) + 1;
    if (attempts >= WIKI_DISTILL_MAX_ATTEMPTS) {
      await ctx.db.patch(document._id, { wikiDistillAttempts: attempts });
      return { released: false, attempts };
    }
    await ctx.db.patch(document._id, {
      wikiDistillAttempts: attempts,
      wikiDistilledAt: undefined,
    });
    return { released: true, attempts };
  },
});

/**
 * One section of a document the wiki is reading, for the reader's later
 * sections (client-work pages, 2026-11-12). Only a claimed document is read
 * this way, so a section can never be read for a document the wiki has
 * handed back or has not yet started.
 */
export const getDocumentSectionInternal = internalQuery({
  args: { documentId: v.id("knowledgeDocuments"), sectionIndex: v.number() },
  handler: async (
    ctx,
    args
  ): Promise<{
    companyId: Id<"companies"> | null;
    title: string;
    sourceUrl: string | null;
    section: string;
    sectionCount: number;
  } | null> => {
    const document = await ctx.db.get(args.documentId);
    if (
      !document ||
      document.status !== "ready" ||
      document.threadId ||
      (!document.companyId && document.agentId) ||
      document.wikiDistilledAt === undefined
    ) {
      return null;
    }
    const sections = splitDocumentIntoSections(await distillableText(ctx, document));
    const section = sections[args.sectionIndex];
    if (!section) return null;
    return {
      companyId: document.companyId ?? null,
      title: document.title,
      sourceUrl: document.sourceUrl ?? null,
      section,
      sectionCount: sections.length,
    };
  },
});

/**
 * Whether a document the wiki is reading is still filed (2026-11-12). A
 * long document now takes minutes to read, and one deleted part-way through
 * had its source note written back after the delete had removed it. The
 * reader asks before each write and stops once the document is gone.
 */
export const isDocumentStillFiledInternal = internalQuery({
  args: { documentId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const id = ctx.db.normalizeId("knowledgeDocuments", args.documentId);
    return id !== null && (await ctx.db.get(id)) !== null;
  },
});

/**
 * The reader's last word on a document: if it was deleted while being read,
 * whatever the reader wrote for it after the delete is cleared the same way
 * the delete clears it. In one transaction, so nothing slips between.
 */
export const forgetIfDeletedInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), documentId: v.string(), title: v.string() },
  handler: async (ctx, args): Promise<{ forgotten: boolean }> => {
    const id = ctx.db.normalizeId("knowledgeDocuments", args.documentId);
    if (id === null || (await ctx.db.get(id)) !== null) return { forgotten: false };
    const note = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", "SOURCE").eq("subjectKey", args.documentId)
      )
      .first();
    if (!note) return { forgotten: false };
    await removeDocumentFromWiki(ctx, { companyId: args.companyId, documentId: id, title: args.title });
    return { forgotten: true };
  },
});

/**
 * A changed document read again from the top (2026-11-12). The check-up
 * follows a change by comparing the old and new source notes, which hold a
 * document's first 24,000 characters; a longer document's later sections
 * are brought in line by reading it again, section by section. Pages are
 * improved, never duplicated — the wiki keeps one page per subject.
 */
export const rereadChangedDocumentInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<boolean> => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.status !== "ready" || document.threadId || document.wikiReviewRequested === true) return false;
    await ctx.db.patch(document._id, { wikiDistilledAt: undefined, wikiDistillAttempts: 0 });
    await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilNewDocument, { documentId: document._id });
    return true;
  },
});

/**
 * Every document a company has filed, read again from the top
 * (client-work pages, 2026-11-12): the claims are handed back and the
 * catch-up batch started, so documents the wiki only read the opening of
 * are read in full. Pages already written are improved, never duplicated —
 * the wiki keeps one page per subject. Run by an operator for one named
 * company; it spends model calls, so nothing runs it on a schedule.
 */
export const relearnCompanyDocumentsInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ documents: number }> => {
    const read = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(WIKI_COMPANY_DOCUMENTS_READ + 1);
    // Past the cap the rest wait for another run, and the log says so.
    if (read.length > WIKI_COMPANY_DOCUMENTS_READ) console.error(`Re-reading stopped at ${WIKI_COMPANY_DOCUMENTS_READ} documents; run it again for the rest`);
    const documents = read.slice(0, WIKI_COMPANY_DOCUMENTS_READ);
    let requeued = 0;
    for (const document of documents) {
      if (document.status !== "ready" || document.threadId) continue;
      if (document.wikiReviewRequested === true) continue;
      if (document.wikiDistilledAt === undefined && (document.wikiDistillAttempts ?? 0) === 0) continue;
      await ctx.db.patch(document._id, { wikiDistilledAt: undefined, wikiDistillAttempts: 0 });
      requeued += 1;
    }
    if (requeued > 0) {
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, {
        companyId: args.companyId,
      });
    }
    return { documents: requeued };
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

/** How many documents one wiki has waiting to be read (the daily
 * check-up's intake count, wiki-daily-checkup-plan.md). */
export const countUndistilledInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<number> => {
    // Read to the cap and one more: past it the count is "at least", which is all the intake step needs.
    const documents = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(WIKI_COMPANY_DOCUMENTS_READ + 1);
    return documents.filter((document) => isDistillable(document)).length;
  },
});

/** Whether the global shelf still holds unread documents — the catch-up
 * sweep's cue to run the global round (global-wiki-plan.md, phase 4). */
export const hasGlobalUndistilledInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const documents = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", undefined))
      .take(200);
    return documents.some((document) => isDistillable(document));
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
    let claimedChars = 0;
    for (const document of documents) {
      if (batch.length >= WIKI_DISTILL_BATCH_SIZE) break;
      if (batch.length > 0 && claimedChars >= WIKI_DISTILL_BATCH_MAX_CHARS) break;
      if (!isDistillable(document)) continue;
      await ctx.db.patch(document._id, { wikiDistilledAt: now });
      const text = await distillableText(ctx, document);
      claimedChars += text.length;
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

/** A document the wiki has already read, with its FRESH text — the
 * source-note refresher's read (watch-it-think plan, phase 2). */
export const getRefreshableDocumentInternal = internalQuery({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (
    ctx,
    args
  ): Promise<{ companyId: Id<"companies"> | null; title: string; sourceUrl: string | null; text: string } | null> => {
    const document = await ctx.db.get(args.documentId);
    if (
      !document ||
      document.status !== "ready" ||
      document.threadId ||
      (!document.companyId && document.agentId) ||
      document.wikiDistilledAt === undefined
    ) {
      return null;
    }
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
      const text = await distillableText(ctx, document, WIKI_BACKFILL_TEXT_MAX_CHARS);
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

/**
 * What the progress panel draws, and all `distillProgressFor` produces.
 *
 * Counts and one document title — no document ids, no page ids, nothing that
 * would let a reader walk from the progress bar into the source shelf.
 */
const distillProgressValidator = v.object({
  totalDocuments: v.number(),
  remainingDocuments: v.number(),
  documentsRead: v.number(),
  pagesWritten: v.number(),
  pagesImproved: v.number(),
  lastDocumentTitle: v.union(v.string(), v.null()),
  isReading: v.boolean(),
});

export const getDistillProgress = moduleQuery({
  module: CORE_MODULES.wiki,
  args: {},
  returns: v.union(v.null(), distillProgressValidator),
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return null;
    return await distillProgressFor(ctx, companyId);
  },
});

export const getDistillProgressForGlobal = adminQuery({
  args: {},
  returns: tailShapes.wikiDistillProgressShape,
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return await distillProgressFor(ctx, undefined);
  },
});

export const getDistillProgressForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  returns: tailShapes.wikiDistillProgressShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await distillProgressFor(ctx, args.companyId);
  },
});
