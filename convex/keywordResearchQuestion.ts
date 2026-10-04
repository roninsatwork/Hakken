"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

/**
 * What the AI says (board 4; docs/plans/active/keyword-research-plan.md):
 * the question a person would ask an AI assistant behind a Google search,
 * written by the Keyword research agent's own model from its own
 * instructions (its template's, changeable on the agent), and its cost
 * written on the run. Only in Live: in Test the question is a plain sentence
 * of the keyword, so a Test lookup costs nothing at all.
 */

const FORMAT = "Answer with the question alone, on one line, at most 20 words.";
const MAX_QUESTION = 300;

export const writeQuestion = internalAction({
  args: { runId: v.id("agentRuns"), companyId: v.optional(v.id("companies")), keyword: v.string(), country: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const setup = await ctx.runQuery(internal.keywordResearchRun.readQuestionSetup, { runId: args.runId });
    if (!setup) return null;
    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      ...(setup.requestedModelId ? { requestedModelId: setup.requestedModelId } : {}),
      ...(args.companyId ? { companyId: args.companyId } : {}),
      useCase: "agent",
    });
    const prompt = `Google search: ${args.keyword}\nCountry: ${args.country}`;
    let text = "";
    let failed = false;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction: `${setup.instructions}\n\n${FORMAT}`,
        contents: [{ type: "text", text: prompt }],
      });
      text = (response.text ?? "").trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION);
      inputTokens = response.inputTokens ?? 0;
      outputTokens = response.outputTokens ?? 0;
    } catch {
      failed = true;
    }
    await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
      runId: args.runId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      actionContext: `Writing the question behind "${args.keyword}"`,
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens,
      outputTokens,
      promptContent: prompt,
      responseContent: text,
      failed: failed || !text,
    });
    return text || null;
  },
});
