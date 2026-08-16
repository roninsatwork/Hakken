import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * The Freshness Checker's default-runtime half (wiki-agents plan, phase
 * 2): which pages are due a check, the sources to check them against, and
 * the verification stamp. The model work lives in wikiFreshnessActions.ts;
 * nothing here rewrites a page — a failed check becomes an open question.
 */

/** A page unexamined this long, and untaught for as long, is due. */
export const WIKI_FRESHNESS_AGE_MS = 21 * 24 * 60 * 60 * 1000;

/** How many pages one company's nightly check may send to the model. */
export const WIKI_FRESHNESS_BATCH = 3;

export const getFreshnessCandidatesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ pageId: Id<"wikiPages">; pageKey: string; content: string }>> => {
    const now = Date.now();
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    const due = [];
    for (const page of pages) {
      if (page.kind === "SOURCE" || page.kind === "CUSTOMER") continue;
      if (page.subjectKey.endsWith("-index")) continue;
      if (now - page.updatedAt < WIKI_FRESHNESS_AGE_MS) continue;
      if (page.lastVerifiedAt && now - page.lastVerifiedAt < WIKI_FRESHNESS_AGE_MS) continue;
      // Only pages that documents taught can be checked against documents.
      const receipts = await ctx.db
        .query("wikiPageSources")
        .withIndex("by_page", (q) => q.eq("pageId", page._id))
        .take(20);
      if (!receipts.some((receipt) => receipt.kind === "DOCUMENT")) continue;
      due.push({
        pageId: page._id,
        pageKey: `${page.kind}:${page.subjectKey}`,
        content: page.content.slice(0, 2000),
      });
      if (due.length >= WIKI_FRESHNESS_BATCH) break;
    }
    return due;
  },
});

/** The kept originals behind a page — what the check reads against. */
export const getSourceTextsForPageInternal = internalQuery({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args): Promise<{ texts: string[]; missingSources: number }> => {
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page", (q) => q.eq("pageId", args.pageId))
      .take(20);
    const texts: string[] = [];
    let missingSources = 0;
    for (const receipt of receipts) {
      if (receipt.kind !== "DOCUMENT") continue;
      if (texts.length >= 2) break;
      let document = null;
      try {
        document = await ctx.db.get(receipt.ref as Id<"knowledgeDocuments">);
      } catch {
        document = null;
      }
      if (!document || document.status !== "ready") {
        missingSources += 1;
        continue;
      }
      if (document.textContent?.trim()) {
        texts.push(document.textContent.slice(0, 6000));
        continue;
      }
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .take(8);
      const joined = chunks.map((chunk) => chunk.text).join("\n\n").slice(0, 6000);
      if (joined.trim()) texts.push(joined);
      else missingSources += 1;
    }
    return { texts, missingSources };
  },
});

export const markVerifiedInternal = internalMutation({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.pageId, { lastVerifiedAt: Date.now() });
  },
});
