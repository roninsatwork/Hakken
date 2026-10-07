import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { findConnectorInstall, installBuiltInConnector } from "./aiTools";
import { addNewBuiltInTools } from "./builtInToolSync";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { answerTiming } from "./utils/answerTiming";
import { appError } from "./utils/appError";
import { ASSISTANT_CONNECTOR_KEYS, HAKKEN_ASSISTANT } from "./utils/hakkenAssistant";

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
  args: {
    /**
     * Who is asking, when someone is: the company-figures connector is
     * installed the first time, in their name, as an install from the
     * Connections screen would be.
     */
    installedBy: v.optional(v.id("users")),
  },
  returns: v.id("agents"),
  handler: async (ctx, args) => {
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
    const agentId = existing?._id ?? await ctx.db.insert("agents", {
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
    if (existing && Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    for (const key of ASSISTANT_CONNECTOR_KEYS) await bindConnector(ctx, agentId, key, args.installedBy);
    return agentId;
  },
});

/**
 * One of the Assistant's connectors — its company-figures tools (item 7), its
 * task tools (hakken-tasks-plan.md, item 1.2) — installed once and bound to
 * it. Installing again would reset the connector's test state, so an install
 * that exists is only bound, never redone; a tool an administrator took off
 * the Assistant on the Agents screen is put back, because the Assistant's
 * tools are what every door answers from.
 */
async function bindConnector(ctx: MutationCtx, agentId: Id<"agents">, key: string, installedBy: Id<"users"> | undefined) {
  let connector = await findConnectorInstall(ctx, { key });
  if (!connector) {
    if (!installedBy) return;
    await installBuiltInConnector(ctx, { key, installedBy, tenantAvailability: "GLOBAL" });
    connector = await findConnectorInstall(ctx, { key });
    if (!connector) return;
  } else {
    // A tool its definition gained since it was installed (a report, a chart) reaches the Assistant too.
    await addNewBuiltInTools(ctx, connector, installedBy);
  }
  const tools = await ctx.db
    .query("aiTools")
    .withIndex("by_connector", (q) => q.eq("connectorId", connector._id))
    .take(20);
  const bound = new Set(
    (await ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).take(200)).map((row) => row.toolId),
  );
  for (const tool of tools) {
    if (!bound.has(tool._id)) await ctx.db.insert("agentTools", { agentId, toolId: tool._id, assignedAt: Date.now() });
  }
}

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
    /** When the message was saved, so the server log can say where an answer's time went (`utils/answerTiming.ts`). */
    receivedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Denial of wallet: refused before anything is read or asked, as typed
    // Ask Hakken always did (about 2,500 tokens).
    const timing = answerTiming({ receivedAt: args.receivedAt ?? Date.now() });
    timing.mark("firstWorker");
    if (args.content.length > MAX_QUESTION_LENGTH) {
      throw appError("INVALID_INPUT", "Payload Too Large: Input exceeds maximum system context window.");
    }
    const notice = (content: string) =>
      ctx.runMutation(internal.chat.saveAssistantNoticeInternal, { threadId: args.threadId, content });

    const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
    const agentId = await ctx.runMutation(internal.hakkenAssistant.ensureAssistantInternal, {
      ...(thread?.userId ? { installedBy: thread.userId } : {}),
    });
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
    let visionModel = false;
    let replyNotice: string | undefined;
    if (args.fileIds && args.fileIds.length > 0) {
      const contentTypes = await ctx.runQuery(internal.chat.getAttachmentContentTypesInternal, { fileIds: args.fileIds });
      if (contentTypes.some((type) => type?.startsWith("image/"))) {
        const chat = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
          ...(args.modelId ? { requestedModelId: args.modelId } : {}),
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
          // Resolved by the run the same way — by the job, not the name — so a
          // vision model the catalogue does not list is still the one used.
          visionModel = true;
          replyNotice = `\n\n*Answered with ${vision.modelId} so I could look at your image.*`;
        }
      }
    }

    timing.mark("handedOn");
    await ctx.runAction(internal.agentRuntime.runAgentObjective, {
      threadId: args.threadId,
      agentId,
      content: args.content,
      timing: timing.carry(),
      ...(args.modelId && !visionModel ? { modelId: args.modelId } : {}),
      ...(visionModel ? { visionModel: true } : {}),
      ...(args.thinkingLevel ? { thinkingLevel: args.thinkingLevel } : {}),
      ...(args.fileIds ? { fileIds: args.fileIds } : {}),
      ...(replyNotice ? { replyNotice } : {}),
    });
    return null;
  },
});

/** The longest question answered: what a message may be (`chat.sendMessage`). */
const MAX_QUESTION_LENGTH = 10_000;

/** How long a conversation's new files are waited for: a minute, checked every two seconds. */
const FILE_READ_ATTEMPTS = 30;
const FILE_READ_WAIT_MS = 2000;
