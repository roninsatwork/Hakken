import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { HAKKEN_ASSISTANT } from "./utils/hakkenAssistant";

/**
 * The assistant's agent (docs/plans/active/assistant-foundation-plan.md,
 * item 4), created on first use and kept in step, as the Translator's is.
 *
 * Shown on the Agents screen like any agent: it can be switched off, its
 * spending limits set, and its model calls and costs land in the same ledger
 * every run's do. The definition's own words are kept current; what an
 * administrator decides — on or off, its prompt, its limits — is never
 * overwritten.
 */
export const ensureAssistantInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", HAKKEN_ASSISTANT.systemKey))
      .first();
    const definition = {
      name: HAKKEN_ASSISTANT.name,
      description: HAKKEN_ASSISTANT.description,
      standingObjective: HAKKEN_ASSISTANT.standingObjective,
    };
    if (!existing) {
      return await ctx.db.insert("agents", {
        ...definition,
        systemKey: HAKKEN_ASSISTANT.systemKey,
        // What it says it is comes from the platform's and the company's
        // prompts; anything here is added to them.
        systemPrompt: "",
        modelId: `${HAKKEN_ASSISTANT.modelUseCase} (resolved at run time)`,
        modelSelectionMode: "inherit",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return existing._id;
  },
});

/** The assistant's agent and whether it is on; null before its first use. */
export const getAssistantInternal = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ agentId: v.id("agents"), isActive: v.boolean() })),
  handler: async (ctx) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", HAKKEN_ASSISTANT.systemKey))
      .first();
    return agent ? { agentId: agent._id, isActive: agent.isActive } : null;
  },
});

/**
 * Every answer Ask Hakken gives (assistant-foundation-plan.md, item 5): a
 * message sent in Ask Hakken or a website chat with no agent of its own, a
 * company check, the wiki's Ask box. One door onto the Assistant, so none of
 * them can answer another way.
 *
 * Switched off on the Agents screen, the Assistant does not answer, and the
 * conversation says so in a plain sentence rather than waiting for ever.
 */
export const answerInternal = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notice = (content: string) =>
      ctx.runMutation(internal.chat.saveAssistantNoticeInternal, { threadId: args.threadId, content });

    const agentId = await ctx.runMutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    const assistant = await ctx.runQuery(internal.hakkenAssistant.getAssistantInternal, {});
    if (!assistant?.isActive) {
      const { platformName } = await ctx.runQuery(internal.settings.getEmailBranding, {});
      await notice(
        `Ask ${platformName} is switched off, so this was not answered. An administrator can switch ${HAKKEN_ASSISTANT.name} back on in Admin → Agents.`,
      );
      return null;
    }

    // A file dropped into the conversation is read into its own knowledge a
    // moment after it lands, and it is usually the reason for asking: wait
    // for it rather than answer without it — up to a minute, and saying so
    // while it waits.
    let saidReadingFiles = false;
    for (let attempt = 0; attempt < FILE_READ_ATTEMPTS; attempt += 1) {
      const documents = await ctx.runQuery(internal.knowledge.getThreadDocumentsInternal, { threadId: args.threadId });
      if (!documents.some((document) => document.status === "processing" || document.status === "pending")) break;
      if (!saidReadingFiles) {
        saidReadingFiles = true;
        await ctx.runMutation(internal.chat.setAssistantStage, { threadId: args.threadId, stage: "READING_FILES" });
      }
      await new Promise((resolve) => setTimeout(resolve, FILE_READ_WAIT_MS));
    }

    // A photo must reach a model that can see it. Only the Google adapter
    // takes image parts today, so on any other model the photo goes to the
    // vision job's model and the reply says so; where even that cannot see,
    // the conversation is told in a plain sentence instead.
    let modelId = args.modelId;
    let replyNotice: string | undefined;
    if (args.fileIds && args.fileIds.length > 0) {
      const contentTypes = await ctx.runQuery(internal.chat.getAttachmentContentTypesInternal, { fileIds: args.fileIds });
      if (contentTypes.some((type) => type?.startsWith("image/"))) {
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        const chat = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
          ...(modelId ? { requestedModelId: modelId } : {}),
          companyId: thread?.companyId,
          useCase: HAKKEN_ASSISTANT.modelUseCase,
        });
        if (chat.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
          const vision = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            companyId: thread?.companyId,
            useCase: "vision",
          });
          if (vision.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
            await notice(
              "I can't look at images on this deployment yet — no vision-capable model is enabled. Your message was not processed; remove the image and send the text again, or ask an administrator to enable a Google model.",
            );
            return null;
          }
          modelId = vision.modelId;
          replyNotice = `\n\n*Answered with ${vision.modelId} so I could look at your image.*`;
        }
      }
    }

    await ctx.runAction(internal.agentRuntime.runAgentObjective, {
      threadId: args.threadId,
      agentId,
      content: args.content,
      ...(modelId ? { modelId } : {}),
      ...(args.thinkingLevel ? { thinkingLevel: args.thinkingLevel } : {}),
      ...(args.fileIds ? { fileIds: args.fileIds } : {}),
      ...(replyNotice ? { replyNotice } : {}),
    });
    return null;
  },
});

/** How long a conversation's new files are waited for: a minute, checked every two seconds. */
const FILE_READ_ATTEMPTS = 30;
const FILE_READ_WAIT_MS = 2000;
