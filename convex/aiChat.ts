"use node";

/**
 * The thread titler: a short name for a new conversation from its first
 * message. Ask Hakken's own reply pipeline, which lived here as
 * `generateHakkenResponse`, was retired on 2026-10-06
 * (assistant-foundation-plan.md, item 9): every answer now comes from the
 * Assistant (`hakkenAssistant.answerInternal`), the one brain every door
 * answers through.
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { generationSpend, recordModelSpend } from "./modelSpend";

export const generateThreadTitle = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        companyId: thread?.companyId,
        useCase: "title",
      });
      
      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        contents: [{ type: "text", text: `User Message: "${args.content}"` }],
        systemInstruction: "You are a professional assistant. Generate a concise, 3-to-4 word description of the user's message. Use standard Title Case. Do not include quotes, periods, or other punctuation. Your output must ONLY be the title.",
        temperature: 0.2,
      });
      await recordModelSpend(ctx, {
        ...(thread?.agentId ? { agentId: thread.agentId } : {}),
        threadId: args.threadId,
        ...(thread?.userId ? { userId: thread.userId } : {}),
        ...(thread?.companyId ? { companyId: thread.companyId } : {}),
        actionContext: "Writing a thread title",
        ...generationSpend(modelConfig, response),
      });

      const title = response.text?.trim().replace(/^["']|["']$/g, '');
      if (title && title.length > 0) {
        await ctx.runMutation(internal.chat.renameThreadInternal, {
          threadId: args.threadId,
          title: title
        });
      }
    } catch (error) {
      console.error("Failed to generate thread title:", normalizeAiRuntimeError(error, "Thread title generation failed."));
    }
  }
});

