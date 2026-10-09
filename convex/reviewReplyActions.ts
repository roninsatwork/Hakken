"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { gatherInstructions } from "./assistantKnowledge";
import { REPLIER } from "./utils/reviewReplier";

/**
 * Draft a reply in each company's own voice to its reviews still waiting
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 2): what Ask
 * Hakken is told of the company — its prompt, rules and memories — with the
 * replier's own part, through the company's own chat model. Each call's cost
 * is recorded to the company under the replier's agent. Nothing is posted.
 */
export const draftReplies = internalAction({
  args: { listingId: v.id("listings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.reviewReplies.ensureReplierInternal, {});
    const jobs = await ctx.runQuery(internal.reviewReplies.repliesToDraft, { listingId: args.listingId });
    for (const job of jobs) {
      const instructions = await gatherInstructions(ctx, {
        companyId: job.companyId,
        surface: "COMPANY_CHAT",
        presentation: "WRITTEN",
        agent: { systemPrompt: REPLIER.systemPrompt, skills: [], alwaysMemories: [] },
      });
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "chat", companyId: job.companyId });
      for (const review of job.reviews) {
        const prompt = JSON.stringify({
          task: "Draft a reply to this review from the business. Reply with the draft only.",
          business: job.business,
          review: { stars: review.stars, reviewer: review.name?.split(/\s+/)[0] ?? null, words: review.text },
        });
        try {
          const response = await generateTextWithResolvedModel({ model, systemInstruction: instructions.systemInstruction, contents: [{ type: "text", text: prompt }] });
          await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
            systemKey: REPLIER.systemKey,
            companyId: job.companyId,
            actionContext: "Drafting a reply to a review",
            modelId: model.modelId,
            providerKey: model.providerKey,
            providerModelId: model.providerModelId,
            inputTokens: response.inputTokens ?? 0,
            outputTokens: response.outputTokens ?? 0,
            promptContent: prompt,
            responseContent: response.text ?? "",
          });
          const text = (response.text ?? "").trim();
          if (text) await ctx.runMutation(internal.reviewReplies.writeReplyDraft, { companyWebsiteId: job.companyWebsiteId, listingId: args.listingId, reviewId: review.id, text: text.slice(0, 2_000) });
        } catch (error) {
          // A model that fails leaves the review waiting for the next filing, undrafted.
          console.warn("A reply could not be drafted; the review waits for the next filing.", error);
          break;
        }
      }
    }
    return null;
  },
});
