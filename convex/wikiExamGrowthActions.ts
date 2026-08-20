"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";

/**
 * The Examiner (closing-the-loop-plan.md, phase 4): monthly, per company
 * with history, real questions become drafted exam cases — clearly
 * marked, running nothing, gating nothing, waiting for a person on the
 * Evals screen. Bounded to a handful per run; a company with no resolved
 * couldn't-answer history spends nothing.
 */

export const growExamForCompany = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ drafted: number }> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_EXAMINER" }))) {
      return { drafted: 0 };
    }
    const growth = await ctx.runQuery(internal.wikiExamGrowth.listGrowthCandidatesInternal, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
    });
    if (growth.candidates.length === 0) return { drafted: 0 };

    let drafted = 0;
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const prompt =
        `Real questions customers asked (most asked first):\n` +
        growth.candidates.map((c) => `- ${c.question} (asked ${c.askCount}×)`).join("\n") +
        `\n\nThe existing exam already covers:\n` +
        growth.existingPrompts.map((p) => `- ${p}`).join("\n");
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          "You draft exam questions for a company's AI from real questions its customers asked. Propose ONLY questions the existing exam does not already cover — up to three. " +
          'Reply with strict JSON, nothing else: {"drafts": [{"grewFrom": string, "prompt": string, "expected": string}]} — grewFrom is the real question exactly as given, prompt the exam wording, expected a plain statement of what a correct answer must get right. An empty list is a fine answer.',
        contents: [{ type: "text", text: prompt }],
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
        systemKey: "WIKI_EXAMINER",
        ...(args.companyId ? { companyId: args.companyId } : {}),
        actionContext: "Wiki Exam Growth Round",
        modelId: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        promptContent: prompt,
        responseContent: response.text ?? "",
      });
      const jsonMatch = (response.text ?? "").match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { drafts?: unknown }) : {};
      const drafts = (Array.isArray(parsed.drafts) ? parsed.drafts : [])
        .filter(
          (draft): draft is { grewFrom: string; prompt: string; expected: string } =>
            typeof draft === "object" &&
            draft !== null &&
            typeof (draft as { grewFrom?: unknown }).grewFrom === "string" &&
            typeof (draft as { prompt?: unknown }).prompt === "string" &&
            typeof (draft as { expected?: unknown }).expected === "string"
        )
        .slice(0, 3);
      for (const draft of drafts) {
        const inserted = await ctx.runMutation(internal.wikiExamGrowth.proposeExamCaseInternal, {
          ...(args.companyId ? { companyId: args.companyId } : {}),
          prompt: draft.prompt,
          expectedBehavior: draft.expected,
          grewFrom: draft.grewFrom,
        });
        if (inserted) drafted += 1;
      }
    } catch (error) {
      console.error("The Examiner could not draft this month; nothing was proposed", error);
    }

    // Recorded whatever happened, so a month with nothing to draft still
    // proves the Examiner ran.
    await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
      systemKey: "WIKI_EXAMINER",
      ...(args.companyId ? { companyId: args.companyId } : {}),
      trigger: "SCHEDULE",
      objective: "Draft exam questions from the questions real people asked.",
      summary:
        drafted > 0
          ? `Drafted ${drafted} exam questions for a person's decision. Nothing was activated.`
          : "No new questions worth drafting an exam from this month.",
      startedAt,
    });
    return { drafted };
  },
});

/** The monthly rota: companies with resolved couldn't-answer history. */
export const examGrowthSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_EXAMINER" }))) {
      return { companies: 0 };
    }
    const scopes = await ctx.runQuery(internal.wikiTending.listCompaniesWithPagesInternal, {});
    let dispatched = 0;
    for (const scope of scopes) {
      // Companies only (Anthony's ruling, 2026-08-16). The platform's own
      // round used to ride along as null, but the global brain has no Evals
      // screen — so those drafts were written for a reviewer who does not
      // exist. Evals stay where they can be read and approved.
      if (!scope) continue;
      await ctx.scheduler.runAfter(0, internal.wikiExamGrowthActions.growExamForCompany, {
        companyId: scope,
      });
      dispatched += 1;
    }
    return { companies: dispatched };
  },
});
