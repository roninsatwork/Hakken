"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { SWEEP_SYSTEM_INSTRUCTION, buildTranscript, parseSuggestions } from "./companyMemorySuggestions";

/**
 * The sweep itself, in the Node runtime.
 *
 * Split from companyMemorySuggestions.ts because the provider adapters are
 * "use node" — without it the Google client lands in the V8 runtime, cannot use
 * the deployment's service-account credentials, and fails asking for an API key
 * as though it were running in a browser. A Convex file marked "use node" may
 * only export actions, so the queries and the mutation stay next door.
 */

/**
 * Return types are written out rather than inferred.
 *
 * These actions call queries and mutations declared in this same file, so
 * letting TypeScript infer their results makes the module refer to itself and
 * inference collapses across the whole generated API.
 */
export const sweepDispatcher = internalAction({
  args: {},
  handler: async (ctx): Promise<{ companies: number }> => {
    const companies = await ctx.runQuery(internal.companyMemorySuggestions.listCompaniesToSweepInternal, {});
    for (const company of companies) {
      await ctx.scheduler.runAfter(0, internal.companyMemorySuggestionActions.sweepCompany, {
        companyId: company.companyId,
        since: company.lastSweptAt,
      });
    }
    return { companies: companies.length };
  },
});

export const sweepCompany = internalAction({
  args: {
    companyId: v.id("companies"),
    since: v.number(),
  },
  handler: async (ctx, args): Promise<{ suggested: number }> => {
    const input: {
      openSuggestionCount: number;
      isBacklogged: boolean;
      messages: Array<{ role: string; content: string; createdAt: number; feedbackLabels?: string[] }>;
    } = await ctx.runQuery(internal.companyMemorySuggestions.getSweepInputInternal, {
      companyId: args.companyId,
      since: args.since,
    });

    // Nothing was said. Move the marker and spend nothing.
    if (input.messages.length === 0) {
      await ctx.runMutation(internal.companyMemorySuggestions.recordSweepInternal, {
        companyId: args.companyId,
        sweptTo: args.since,
        messagesRead: 0,
        skippedReason: "No new messages.",
      });
      return { suggested: 0 };
    }

    // Flagged conversations are listed ahead of the chronological window, so
    // the last entry is no longer necessarily the newest — the marker takes
    // the true maximum or unrated conversations would be re-read forever.
    // A flagged conversation can be older than the marker (asked before,
    // rated after), so the floor is the marker itself — it never moves back.
    const sweptTo = Math.max(args.since, ...input.messages.map((message) => message.createdAt));

    // A queue nobody has emptied does not need more added to it, and the
    // marker still moves so the same conversations are not re-read later.
    if (input.isBacklogged) {
      await ctx.runMutation(internal.companyMemorySuggestions.recordSweepInternal, {
        companyId: args.companyId,
        sweptTo,
        messagesRead: input.messages.length,
        skippedReason: `${input.openSuggestionCount} suggestions already waiting for review.`,
      });
      return { suggested: 0 };
    }

    try {
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        companyId: args.companyId,
        useCase: "fast-chat",
      });

      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        systemInstruction: SWEEP_SYSTEM_INSTRUCTION,
        contents: [{ type: "text", text: buildTranscript(input.messages) }],
        temperature: 0.1,
      });

      const suggestions = parseSuggestions(response.text ?? "");
      const result: { suggested: number } = await ctx.runMutation(
        internal.companyMemorySuggestions.recordSweepInternal,
        {
          companyId: args.companyId,
          sweptTo,
          messagesRead: input.messages.length,
          suggestions,
        },
      );
      return result;
    } catch (error) {
      // A failed sweep must not move the marker: the conversations it could not
      // read are still unread, and silently skipping them would lose them.
      console.error(
        "Company memory sweep failed:",
        normalizeAiRuntimeError(error, "Memory suggestion sweep failed.").error,
      );
      await ctx.runMutation(internal.companyMemorySuggestions.recordSweepInternal, {
        companyId: args.companyId,
        sweptTo: args.since,
        messagesRead: input.messages.length,
        skippedReason: "The model could not be reached.",
      });
      return { suggested: 0 };
    }
  },
});
