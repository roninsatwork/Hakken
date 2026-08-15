"use node";

import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import {
  buildDocumentTopicInstruction,
  buildRewriteSystemInstruction,
  buildRewriteUserContent,
  linkKeyFor,
  parseDocumentTopicSuggestions,
  validateRewrittenPage,
} from "./wikiRewriteService";

/**
 * The distiller (wiki-replaces-knowledge plan, stage one): a document in,
 * topic pages out, through the same audited rewrite landing as everything
 * else — so revisions, receipts, the pinned layer and the map all hold
 * without any machinery of their own. Two callers, no buttons: the on-ready
 * hook for every newly imported document, and the catch-up sweep that reads
 * what was imported before the wiki existed.
 */

type DistilResult = { pagesWritten: number; pagesImproved: number };

async function distilOne(
  ctx: ActionCtx,
  args: {
    companyId: Id<"companies">;
    documentId: string;
    title: string;
    sourceUrl: string | null;
    text: string;
  }
): Promise<DistilResult> {
  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    useCase: "fast-chat",
  });
  const suggestionResponse = await generateTextWithResolvedModel({
    model,
    systemInstruction: buildDocumentTopicInstruction(),
    contents: [{ type: "text", text: `Document: ${args.title}\n\n${args.text}` }],
  });
  const topics = parseDocumentTopicSuggestions(suggestionResponse.text ?? "");
  // What a person sees on the page's receipts: the address for a website
  // page, the title for a file or pasted text.
  const sourceLabel = args.sourceUrl
    ? `Website · ${args.sourceUrl.replace(/^https?:\/\//, "").slice(0, 80)}`
    : `Document · ${args.title.slice(0, 80)}`;
  // The names the writing may [[reference]], for Obsidian-style density.
  const linkableNames = (
    await ctx.runQuery(internal.wikiPages.getWikiIndexInternal, {
      companyId: args.companyId,
      includeCustomerPages: false,
    })
  )
    .map((entry) => entry.key.slice(entry.key.indexOf(":") + 1))
    .filter((name) => !name.endsWith("-index"));

  const result: DistilResult = { pagesWritten: 0, pagesImproved: 0 };
  for (const topic of topics) {
    const page = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
    });
    const rewriteResponse = await generateTextWithResolvedModel({
      model,
      systemInstruction: buildRewriteSystemInstruction(),
      contents: [
        {
          type: "text",
          text: buildRewriteUserContent({
            title: topic.slug,
            currentContent: page?.content ?? "",
            pinnedCorrections: page?.pinnedCorrections ?? [],
            eventLabel: "company document",
            eventText: `${topic.learned}\n\nFrom the document "${args.title}":\n${args.text.slice(0, 4000)}`,
            otherPages: linkableNames,
          }),
        },
      ],
    });
    const verdict = validateRewrittenPage(rewriteResponse.text ?? "");
    if (!verdict.ok) continue;
    await ctx.runMutation(internal.wikiPages.applyRewriteInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
      title: topic.slug,
      content: verdict.content,
      source: `DOCUMENT:${args.documentId}`,
      sourceLabel,
    });
    if (page) result.pagesImproved += 1;
    else result.pagesWritten += 1;
  }

  // Topics established by the same document are related; both ends recorded.
  for (const topic of topics) {
    const siblings = topics
      .filter((other) => other !== topic)
      .map((other) => linkKeyFor(other.kind, other.slug));
    if (siblings.length === 0) continue;
    await ctx.runMutation(internal.wikiPages.addLinksInternal, {
      companyId: args.companyId,
      kind: topic.kind,
      subjectKey: topic.slug,
      add: siblings,
    });
  }
  return result;
}

/** The on-ready hook: a document that just finished importing teaches the
 * wiki by itself. Scheduled from the ingestion landing in knowledge.ts. */
export const distilNewDocument = internalAction({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<void> => {
    // Claimed before read: the sweep and this hook can never double-spend.
    const document = await ctx.runMutation(internal.wikiDistill.claimDocumentForDistillInternal, {
      documentId: args.documentId,
    });
    if (!document) return;
    let result: DistilResult = { pagesWritten: 0, pagesImproved: 0 };
    try {
      result = await distilOne(ctx, {
        companyId: document.companyId,
        documentId: args.documentId,
        title: document.title,
        sourceUrl: document.sourceUrl,
        text: document.text,
      });
    } catch (error) {
      console.error("The wiki could not learn from a new document; the library still has it", error);
      return;
    }
    await ctx.runMutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId: document.companyId,
      documentsRead: 1,
      pagesWritten: result.pagesWritten,
      pagesImproved: result.pagesImproved,
      lastDocumentTitle: document.title,
    });
  },
});

/** The catch-up sweep: reads what was imported before the wiki existed, a
 * few documents per company per tick, until nothing is left behind. */
export const distilSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    const companies = await ctx.runQuery(internal.wikiDistill.listCompaniesWithUndistilledInternal, {});
    for (const companyId of companies) {
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, { companyId });
    }
    return { companies: companies.length };
  },
});

export const distilCompanyBatch = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<void> => {
    const batch = await ctx.runMutation(internal.wikiDistill.claimNextDistillBatchInternal, {
      companyId: args.companyId,
    });
    if (batch.length === 0) return;

    let documentsRead = 0;
    let pagesWritten = 0;
    let pagesImproved = 0;
    let lastDocumentTitle: string | undefined;
    for (const document of batch) {
      if (!document.text.trim()) continue; // marked below; nothing to read
      documentsRead += 1;
      lastDocumentTitle = document.title;
      try {
        const result = await distilOne(ctx, {
          companyId: args.companyId,
          documentId: document.documentId,
          title: document.title,
          sourceUrl: document.sourceUrl,
          text: document.text,
        });
        pagesWritten += result.pagesWritten;
        pagesImproved += result.pagesImproved;
      } catch (error) {
        console.error("The wiki could not learn from a document; moving on", error);
      }
    }

    await ctx.runMutation(internal.wikiDistill.recordDistillProgressInternal, {
      companyId: args.companyId,
      documentsRead,
      pagesWritten,
      pagesImproved,
      ...(lastDocumentTitle ? { lastDocumentTitle } : {}),
    });

    // More to do? The next batch schedules itself, so an import of any size
    // finishes without anyone watching it.
    await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilCompanyBatch, {
      companyId: args.companyId,
    });
  },
});
