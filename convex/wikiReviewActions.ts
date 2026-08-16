"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

/**
 * The Reviewer (wiki-agents plan, phase 4): reads a review-marked document
 * when it becomes ready and files what a person needs to decide — the
 * main claims, plainly listed. It writes nothing to the wiki itself; a
 * stood-down Reviewer waves documents straight through to the Distiller,
 * because a checkpoint nobody staffs must not silently block imports.
 */

export const prepareReview = internalAction({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args): Promise<void> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_REVIEWER" }))) {
      await ctx.runMutation(internal.wikiReviews.clearReviewFlagInternal, {
        documentId: args.documentId,
      });
      await ctx.scheduler.runAfter(0, internal.wikiDistillActions.distilNewDocument, {
        documentId: args.documentId,
      });
      return;
    }

    const document = await ctx.runQuery(internal.wikiReviews.getReviewableDocumentInternal, {
      documentId: args.documentId,
    });
    if (!document) return;

    let claims: string[] = [];
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          'You review one document before a wiki is allowed to learn from it. Reply with strict JSON, nothing else: {"claims": [string]} — up to six plain sentences stating the main things this document claims. No judgement, no summary of style: just what it asserts.',
        contents: [{ type: "text", text: `Document: ${document.title}\n\n${document.text}` }],
      });
      const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { claims?: unknown }) : {};
      claims = (Array.isArray(parsed.claims) ? parsed.claims : [])
        .filter((claim): claim is string => typeof claim === "string" && claim.trim().length > 0)
        .slice(0, 6);
    } catch (error) {
      console.error("The Reviewer could not read a document; filing it for review anyway", error);
    }

    await ctx.runMutation(internal.wikiReviews.fileReviewInternal, {
      companyId: document.companyId ?? undefined,
      documentId: args.documentId,
      title: document.title,
      claimsJson: JSON.stringify(claims),
    });
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_REVIEWER",
      companyId: document.companyId ?? undefined,
      trigger: "EVENT",
      objective: `A review-marked document arrived: ${document.title.slice(0, 120)}`,
      summary: `Prepared ${claims.length} claims for a person's decision. Nothing was written to the wiki.`,
      startedAt,
    });
  },
});
