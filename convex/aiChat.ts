"use node";

/**
 * The assistant's reply pipeline: `generateHakkenResponse` (the one road every
 * chat answer takes — widget, app, ask box, evals) and the thread titler.
 * Split out of the old `convex/ai.ts` grab-bag on 2026-08-21
 * (foundation-quality plan, phase 3); speech lives in `aiSpeech.ts`, realtime
 * voice sessions in `aiVoiceSession.ts`, workflow node authoring in
 * `workflowNodeConfig.ts`.
 */

import { internalAction } from "./_generated/server";
import { appError } from "./utils/appError";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { PHOTO_ACTION_PROPOSAL_INSTRUCTION } from "./photoActionService";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import type { AiContentPart } from "./aiRuntimeTypes";
import { shouldInjectPersonalNote } from "./aiPromptAssembly";
import { composeWrittenPrompt, gatherInstructions, gatherReading } from "./assistantKnowledge";
import {
  createModelTurnStream,
  finishAssistantReply,
  guardModelTurn,
  runModelTurn,
} from "./modelTurnService";
import { buildCompanyMemoryEvidence, buildCompanyRuntimeEvidence } from "./utils/messageEvidence";

const CHAT_CONTENT_MAX_LENGTH = 10000;

export const generateHakkenResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    // 🛡️ SECURITY: Denial of Wallet Prevention (Enforce 10k character limit ~ 2500 tokens)
    if (args.content.length > CHAT_CONTENT_MAX_LENGTH) {
       throw appError("INVALID_INPUT", "Payload Too Large: Input exceeds maximum system context window.");
    }

    // The pre-reply pill shows these stages; each is written as the run
    // actually enters that phase, and cleared when the reply lands or fails,
    // so the pill can only ever claim work that is happening.
    const setStage = (stage?: string) =>
        ctx.runMutation(internal.chat.setAssistantStage, { threadId: args.threadId, stage });

    await setStage("CHECKING");

    // The deployment's configured name, resolved once: the refusal copy, the
    // fallback assistant identity, and the failure notice below all speak as
    // this platform rather than as the shipped default.
    const platformName = (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName;

    // The shared safety gate (modelTurnService): evaluate and, when refused,
    // save the refusal into the thread attributed to this runtime.
    const guardedThread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
    const safetyDecision = await guardModelTurn(ctx, {
        content: args.content,
        refusal: { threadId: args.threadId, source: "assistant" },
        platformName,
        ...(guardedThread?.companyId ? { companyId: guardedThread.companyId } : {}),
    });
    if (!safetyDecision.allowed) {
        await setStage(undefined);
        return;
    }

    // Embeddings only, and pinned to the region that serves the embedding
    // model. Generation in this handler goes through the provider registry.

    // Above the try so the catch can close a stream the failure interrupted —
    // a reply left marked as streaming shows a caret against an answer that is
    // never coming.
    const streamState = createModelTurnStream();

    try {
        const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
        let modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            requestedModelId: args.modelId,
            companyId: thread?.companyId,
            useCase: "chat",
        });

        // A message carrying a photo must reach a model that can see it. Only
        // the Google adapter takes image parts today — every other adapter
        // refuses non-text at the boundary — so an image on any other model is
        // re-routed through the vision job, and the override is said in the
        // reply rather than hidden. A deployment where even that resolves to
        // a blind model refuses in a plain sentence instead of throwing at
        // the provider.
        let visionNotice = "";
        // Whether this turn carries a photo — also the gate for the
        // photo-action proposal, which only an image-bearing turn may yield.
        let photoTurn = false;
        if (args.fileIds && args.fileIds.length > 0) {
            const contentTypes = await ctx.runQuery(internal.chat.getAttachmentContentTypesInternal, {
                fileIds: args.fileIds,
            });
            const hasImage = contentTypes.some((type) => type?.startsWith("image/"));
            photoTurn = hasImage;
            if (hasImage && modelConfig.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
                const visionConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
                    companyId: thread?.companyId,
                    useCase: "vision",
                });
                if (visionConfig.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
                    await ctx.runMutation(internal.chat.saveAssistantNoticeInternal, {
                        threadId: args.threadId,
                        content:
                            "I can't look at images on this deployment yet — no vision-capable model is enabled. Your message was not processed; remove the image and send the text again, or ask an administrator to enable a Google model.",
                    });
                    await setStage(undefined);
                    return;
                }
                visionNotice = `\n\n*Answered with ${visionConfig.modelId} so I could look at your image.*`;
                modelConfig = visionConfig;
            }
        }

        // --- Vector Pipeline Synchronization Guard ---
        // Sleep the action loop natively until async chunking completes
        let docsReady = false;
        let loopCount = 0;
        let readingFilesStageSet = false;

        while (!docsReady && loopCount < 30) { // Max wait 60 seconds (30 * 2000ms)
            const threadDocs = await ctx.runQuery(internal.knowledge.getThreadDocumentsInternal, { threadId: args.threadId });
            const pendingDocs = threadDocs.filter((d) => d.status === "processing" || d.status === "pending");

            if (pendingDocs.length === 0) {
               docsReady = true;
               break;
            }

            // Only when files genuinely are still being read, and only once —
            // not re-written on every poll.
            if (!readingFilesStageSet) {
                readingFilesStageSet = true;
                await setStage("READING_FILES");
            }

            loopCount++;
            await new Promise(r => setTimeout(r, 2000));
        }

        // Fetch up to 20 previous messages to pass as context
        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });

        // What Hakken knows is put together where every door's is
        // (assistantKnowledge.ts, assistant-foundation-plan.md item 1): this
        // door only says who is asking and how much room the answer has.
        const instructions = await gatherInstructions(ctx, {
            companyId: thread?.companyId,
            // The thread says which surface is asking. Eval threads carry no
            // widget id, so they count as company chat and run through the
            // runtime that ships.
            surface: thread?.widgetId ? "WIDGET" : "COMPANY_CHAT",
            // The personal layer (personal-layer-and-goals-plan.md, part 2):
            // the thread owner's own private note, and only theirs. The walls
            // (widget visitors, EVAL threads) live in shouldInjectPersonalNote
            // so they cannot drift per caller.
            ...(thread?.userId && shouldInjectPersonalNote(thread) ? { noteFor: thread.userId } : {}),
            presentation: "WRITTEN",
            platformName,
        });
        const reading = await gatherReading(ctx, {
            question: args.content,
            companyId: thread?.companyId,
            company: instructions.company,
            thread,
            allowance: "full",
            operation: "assistantRagEmbedding",
            onSearching: () => setStage("SEARCHING_KNOWLEDGE"),
        });

        const { alwaysMemories, userMemories } = instructions;
        const relevantMemories = reading.relevantMemories;
        const companyMemoryEvidenceJson = buildCompanyMemoryEvidence([...alwaysMemories, ...relevantMemories]);

        let combinedPrompt = composeWrittenPrompt({ messages, reading, question: args.content });
        // --- Ad-hoc File Parsing for Chat Uploads ---
        const payloadContents: AiContentPart[] = [];
        
        if (args.fileIds && args.fileIds.length > 0) {
            for (const fileId of args.fileIds) {
                try {
                    const fileUrl = await ctx.storage.getUrl(fileId);
                    if (fileUrl) {
                        const fileResponse = await fetch(fileUrl);
                        if (fileResponse.ok) {
                            const contentLength = fileResponse.headers.get("content-length");
                            if (contentLength && parseInt(contentLength, 10) > 5242880) { // 5MB
                                throw appError("INVALID_INPUT", `File exceeds the maximum allowed size of 5MB for inline processing.`);
                            }
                            
                            const mimeType = fileResponse.headers.get("content-type") || "application/octet-stream";
                            const arrayBuffer = await fileResponse.arrayBuffer();
                            
                            if (arrayBuffer.byteLength > 5242880) { // 5MB fallback check
                                throw appError("INVALID_INPUT", `File exceeds the maximum allowed size of 5MB for inline processing.`);
                            }
                            
                            const buffer = Buffer.from(arrayBuffer);
                            
                            payloadContents.push({
                                type: "inlineData",
                                data: buffer.toString('base64'),
                                mimeType: mimeType
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse attached file for Generation Context:", fileId, e);
                }
            }
        }
        
        // A photo turn may end in a structured follow-up proposal, generated
        // in this same reply rather than by a second model call.
        if (photoTurn) {
            combinedPrompt += PHOTO_ACTION_PROPOSAL_INSTRUCTION;
        }

        // Push the main textual context
        payloadContents.push({ type: "text", text: combinedPrompt });

        // --- STREAMED GENERATION ---
        // The shared turn (modelTurnService) owns the flush discipline —
        // the very same one the agent runtime streams through: partial text
        // written at a bounded rate, always finalized so no reply is left
        // showing a caret. Providers whose adapter cannot stream simply never
        // call onText, and the reply lands in one write at the end exactly as
        // before.
        await setStage("WRITING");

        const response = await runModelTurn(ctx, {
            threadId: args.threadId,
            stream: streamState,
            model: modelConfig,
            callModel: ({ onText }) => generateTextWithResolvedModel({
                model: modelConfig,
                contents: payloadContents,
                systemInstruction: instructions.systemInstruction,
                thinkingLevel: args.thinkingLevel,
                onText,
            }),
        });

        const assistantReply = `${response.text || "I was unable to assemble a coherent analysis."}${visionNotice}`;
        // The wiki's own bookkeeping for this question was booked with the
        // reading (assistantKnowledge.ts), the same for every door.
        const { wikiPageKeys } = reading;
        const companyRuntimeEvidenceJson = buildCompanyRuntimeEvidence({
            skillIds: instructions.companySkills.map((skill) => skill.skillId),
            sourceIds: reading.chunkIds,
            wikiPageKeys,
        });

        // Usage stamps for the personal note, scheduled like the wiki's own
        // marks so they never delay the reply.
        if (userMemories.length > 0) {
            await ctx.scheduler.runAfter(0, internal.userMemories.markUsedInternal, {
                memoryIds: userMemories.map((memory) => memory.memoryId),
            });
        }

        // The Filing Clerk considers staff answers that drew on more than
        // one wiki page (wiki-agents plan, phase 5) — the only place
        // cross-page synthesis can exist. Widget visitors' answers never
        // qualify, and a scheduled consideration can never delay the reply.
        if (thread?.companyId && !thread.widgetId && wikiPageKeys.length >= 2) {
            await ctx.scheduler.runAfter(0, internal.wikiFilingActions.considerAnswer, {
                companyId: thread.companyId,
                threadId: String(args.threadId),
                question: args.content.slice(0, 500),
                answer: assistantReply.slice(0, 4000),
                pageKeys: wikiPageKeys,
            });
        }

        // Finalize the streamed row, or fall back to the single write when no
        // flush ever happened (short answer, or a non-streaming provider).
        // Both branches live in the shared turn's delivery.
        const messageId = await finishAssistantReply(ctx, {
            threadId: args.threadId,
            stream: streamState,
            content: assistantReply,
            usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens },
            model: modelConfig,
            evidence: { companyMemoryEvidenceJson, companyRuntimeEvidenceJson },
            photoTurn: photoTurn || undefined,
        });

        // Both lists count as used: an always memory reached the model just as
        // surely as a looked-up one, and the screen's "uses" column would
        // otherwise read zero for exactly the memories that apply most.
        const usedMemories = [...alwaysMemories, ...relevantMemories];
        if (thread?.companyId && usedMemories.length > 0 && messageId !== undefined) {
            await ctx.runMutation(internal.companyMemories.recordRuntimeUsageInternal, {
                companyId: thread.companyId,
                threadId: args.threadId,
                messageId,
                queryText: args.content,
                memories: usedMemories.map((memory) => ({
                    memoryId: memory.memoryId,
                    score: memory.score,
                })),
            });
        }

        await setStage(undefined);

    } catch (error) {
        console.error("AI Orchestrator Error:", normalizeAiRuntimeError(error, "Core assistant generation failed."));

        const failureNotice = `${platformName} Core Offline: An error occurred communicating with the selected AI provider. Please try again shortly.`;
        // The partial answer stays visible — the reader already saw it — with
        // the failure notice appended, and the caret stops. A run that never
        // streamed gets the notice alone in a fresh message.
        await finishAssistantReply(ctx, {
            threadId: args.threadId,
            stream: streamState,
            content: streamState.messageId !== undefined
                ? `${streamState.text}\n\n${failureNotice}`
                : failureNotice,
        });
        // Best-effort: the failure message above already replaced the pill on
        // screen, and the stale guard would catch a stage this leaves behind.
        try {
            await setStage(undefined);
        } catch {
            // Clearing the stage must never mask the original failure.
        }
    }
  },
});

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

