"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { SWEEP_SYSTEM_INSTRUCTION, buildTranscript, parseNotes } from "./userMemories";

/**
 * The personal sweep (personal-layer-and-goals-plan.md, part 2): one
 * person's own recent conversations, read for durable notes about the
 * person. Mirror of companyMemorySuggestionActions.ts, in the Node runtime
 * for the same reason — the provider adapters are "use node".
 *
 * Two walls the queries behind this enforce: the sweep reads only the
 * subject's own threads and writes only the subject's own rows, and it
 * spends nothing while the autonomousMemory switch is off — there is no
 * per-person review queue on purpose, because a queue of notes about
 * people would itself be a surface someone else could read.
 */

export const sweepDispatcher = internalAction({
  args: {},
  handler: async (ctx): Promise<{ users: number }> => {
    const users = await ctx.runQuery(internal.userMemories.listUsersToSweepInternal, {});
    for (const user of users) {
      await ctx.scheduler.runAfter(0, internal.userMemorySuggestionActions.sweepUser, {
        userId: user.userId,
        since: user.lastSweptAt,
      });
    }
    return { users: users.length };
  },
});

export const sweepUser = internalAction({
  args: {
    userId: v.id("users"),
    since: v.number(),
  },
  handler: async (ctx, args): Promise<{ saved: number }> => {
    const input: {
      isFull: boolean;
      messages: Array<{ role: string; content: string; createdAt: number }>;
    } = await ctx.runQuery(internal.userMemories.getSweepInputInternal, {
      userId: args.userId,
      since: args.since,
    });

    if (input.isFull) {
      await ctx.runMutation(internal.userMemories.recordSweepInternal, {
        userId: args.userId,
        sweptTo: args.since,
        messagesRead: 0,
        skippedReason: "The note is full.",
      });
      return { saved: 0 };
    }

    if (input.messages.length === 0) {
      await ctx.runMutation(internal.userMemories.recordSweepInternal, {
        userId: args.userId,
        sweptTo: args.since,
        messagesRead: 0,
        skippedReason: "No new messages.",
      });
      return { saved: 0 };
    }

    const sweptTo = Math.max(args.since, ...input.messages.map((message) => message.createdAt));

    try {
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        useCase: "fast-chat",
      });
      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        systemInstruction: SWEEP_SYSTEM_INSTRUCTION,
        contents: [{ type: "text", text: buildTranscript(input.messages) }],
        temperature: 0.1,
      });

      const notes = parseNotes(response.text ?? "");
      const result: { saved: number } = await ctx.runMutation(
        internal.userMemories.recordSweepInternal,
        {
          userId: args.userId,
          sweptTo,
          messagesRead: input.messages.length,
          notes,
        }
      );
      return result;
    } catch (error) {
      // A failed sweep must not move the marker: the conversations it could
      // not read are still unread, and silently skipping them would lose them.
      console.error(
        "Personal note sweep failed:",
        normalizeAiRuntimeError(error, "Personal note sweep failed.").error
      );
      await ctx.runMutation(internal.userMemories.recordSweepInternal, {
        userId: args.userId,
        sweptTo: args.since,
        messagesRead: input.messages.length,
        skippedReason: "The model could not be reached.",
      });
      return { saved: 0 };
    }
  },
});
