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
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ drafted: number }> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
    if (!(await ctx.runQuery(internal.wikiStaff.isStaffActiveInternal, { systemKey: "WIKI_EXAMINER" }))) {
      return { drafted: 0 };
    }
    const growth = await ctx.runQuery(internal.wikiExamGrowth.listGrowthCandidatesInternal, {
      companyId: args.companyId,
    });
    if (growth.candidates.length === 0) return { drafted: 0 };

    let drafted = 0;
    try {
      const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          "You draft exam questions for a company's AI from real questions its customers asked. Propose ONLY questions the existing exam does not already cover — up to three. " +
          'Reply with strict JSON, nothing else: {"drafts": [{"grewFrom": string, "prompt": string, "expected": string}]} — grewFrom is the real question exactly as given, prompt the exam wording, expected a plain statement of what a correct answer must get right. An empty list is a fine answer.',
        contents: [
          {
            type: "text",
            text:
              `Real questions customers asked (most asked first):\n` +
              growth.candidates.map((c) => `- ${c.question} (asked ${c.askCount}×)`).join("\n") +
              `\n\nThe existing exam already covers:\n` +
              growth.existingPrompts.map((p) => `- ${p}`).join("\n"),
          },
        ],
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
          companyId: args.companyId,
          prompt: draft.prompt,
          expectedBehavior: draft.expected,
          grewFrom: draft.grewFrom,
        });
        if (inserted) drafted += 1;
      }
    } catch (error) {
      console.error("The Examiner could not draft this month; nothing was proposed", error);
    }

    if (drafted > 0) {
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_EXAMINER",
        companyId: args.companyId,
        trigger: "SCHEDULE",
        objective: "Draft exam questions from the questions real people asked.",
        summary: `Drafted ${drafted} exam questions for a person's decision. Nothing was activated.`,
        startedAt,
      });
    }
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
      if (!scope) continue;
      await ctx.scheduler.runAfter(0, internal.wikiExamGrowthActions.growExamForCompany, {
        companyId: scope,
      });
      dispatched += 1;
    }
    return { companies: dispatched };
  },
});
