"use node";

import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { v } from "convex/values";
import type { Content, GenerateContentConfig, Tool } from "./utils/providerContentTypes";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseDocuments } from "./utils/fileParser";
import {
  buildToolFailureResult,
  buildToolResultPayload,
  executeRegisteredTool,
  normalizeAiRuntimeError,
} from "./aiToolExecutionService";
import { buildAgentSystemInstruction, buildUntrustedKnowledgeContext } from "./aiPromptAssembly";
import {
  createModelTurnStream,
  guardModelTurn,
} from "./modelTurnService";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { getGoogleVertexProviderModelId, GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { PHOTO_ACTION_PROPOSAL_INSTRUCTION } from "./photoActionService";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import { buildCompanyMemoryEvidence, buildCompanyRuntimeEvidence } from "./utils/messageEvidence";
import {
} from "./promptCacheService";
import {
  AGENT_RUN_MAX_SEGMENTS,
  isRunStopRequested,
} from "./agentRunContinuationService";
import {
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
} from "./agentRuntimeService";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";
import {
  buildHistoricalReplaySystemPrompt,
  calculateModelCostUsd,
  getApprovedToolCompletionMessage,
  parseToolArguments,
} from "./agentRuntimeTurnService";
import {
  executeObjectiveLoop,
  runTriggeredOnAgentLoop,
} from "./agentObjectiveLoop";
import {
  buildLoopExecutionContext,
  finalizeObjectiveFailure,
  settleBatchAndContinue,
  type LoopExecutionContext,
} from "./agentObjectiveLoopService";







export const runAgentObjective = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    let agentRunId: Id<"agentRuns"> | undefined;
    let companyId: Id<"companies"> | undefined;
    const stream = createModelTurnStream();
    const promptCache: { name?: string } = {};
    // Hoisted so the failure handler can release a provider-side cache through
    // the same adapter that created it.
    let execution: LoopExecutionContext | undefined;

    // The shared safety gate (modelTurnService): evaluate and, when refused,
    // save the refusal into the thread attributed to this runtime — worded as
    // the deployment's configured platform, not the shipped default.
    const guardedThread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
    const safetyDecision = await guardModelTurn(ctx, {
        content: args.content,
        refusal: { threadId: args.threadId, source: "agent" },
        platformName: (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName,
        ...(guardedThread?.companyId ? { companyId: guardedThread.companyId } : {}),
    });
    if (!safetyDecision.allowed) return;

    // Embeddings only, and pinned to the region that serves the embedding model.

    try {
        execution = await buildLoopExecutionContext(ctx, {
            agentId: args.agentId,
            threadId: args.threadId,
        });
        const { owner, runtimeSkills, modelConfig } = execution;
        companyId = owner.companyId;

        agentRunId = await ctx.runMutation(internal.agentRuns.createRunInternal, {
            agentId: args.agentId,
            threadId: args.threadId,
            triggerType: "CHAT",
            objective: args.content,
            status: "RUNNING",
            companyId: owner.companyId,
            userId: owner.userId,
            modelId: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
            maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        });
        const runId = agentRunId;
        let preLoopStepIndex = 0;
        if (runtimeSkills.length > 0) {
            preLoopStepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: owner.companyId,
                stepIndex: preLoopStepIndex,
                kind: "OBSERVE",
                status: "SUCCESS",
                input: args.content,
                output: JSON.stringify({
                    skills: runtimeSkills.map((skill) => ({
                        skillId: skill.skillId,
                        skillVersionId: skill.skillVersionId,
                        name: skill.name,
                        category: skill.category,
                        riskLevel: skill.riskLevel,
                        requiredToolMappings: skill.requiredToolMappings,
                    })),
                }),
            });
        }

        const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
            threadId: args.threadId,
        });

        // Map Hakken generic messages into expected Vertex AI Content arrays
        const conversationHistory: Content[] = messages.slice(-20).map((msg) => {
            return {
                role: msg.role === "user" ? "user" : "model",
                parts: [{ text: msg.content }]
            };
        });

        // Add the current user prompt
        let currentUserContent = args.content;

        if (args.fileIds && args.fileIds.length > 0) {
            const documentText = await parseDocuments(ctx, args.fileIds);
            if (documentText) {
                currentUserContent += buildUntrustedKnowledgeContext({
                    sourceLabel: "attached documents for this prompt",
                    chunks: [documentText],
                    maxChars: 10000,
                });
            }
        }

        // A photo can only ride to a model that can see it. Only the Google
        // adapter takes inlineData parts — every other adapter refuses
        // non-text content at the boundary — so on any other model the reply
        // says the photo went unread instead of silently eating it. This path
        // used to be the silently-eating one; the widget always routes here.
        const imageParts: Content["parts"] = [];
        let imageNotice = "";
        if (args.fileIds && args.fileIds.length > 0) {
            const contentTypes = await ctx.runQuery(internal.chat.getAttachmentContentTypesInternal, {
                fileIds: args.fileIds,
            });
            const imageFileIds = args.fileIds.filter((_, index) => contentTypes[index]?.startsWith("image/"));
            if (imageFileIds.length > 0 && modelConfig.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
                imageNotice =
                    "\n\n*You attached a photo, but the model this conversation runs on cannot look at images, so it was not read. An administrator can fix this by moving the agent to a Google model.*";
            } else {
                for (const fileId of imageFileIds) {
                    try {
                        const fileUrl = await ctx.storage.getUrl(fileId);
                        if (!fileUrl) continue;
                        const fileResponse = await fetch(fileUrl);
                        if (!fileResponse.ok) continue;
                        const arrayBuffer = await fileResponse.arrayBuffer();
                        // Same ceiling the plain-chat path holds for inline processing.
                        if (arrayBuffer.byteLength > 5242880) continue;
                        imageParts.push({
                            inlineData: {
                                mimeType: fileResponse.headers.get("content-type") || "application/octet-stream",
                                data: Buffer.from(arrayBuffer).toString("base64"),
                            },
                        });
                    } catch (e) {
                        console.error("Failed to inline attached image for agent turn:", fileId, e);
                    }
                }
            }
        }

        if (currentUserContent.length > 10000) {
            currentUserContent = currentUserContent.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
        }

        const memoryMatches = await ctx.runQuery(internal.agentMemories.searchMemoryInternal, {
            agentId: args.agentId,
            companyId: owner.companyId,
            queryText: args.content,
            limit: 5,
        });
        if (memoryMatches.length > 0) {
            await ctx.runMutation(internal.agentMemories.recordUsageInternal, {
                runId,
                agentId: args.agentId,
                companyId: owner.companyId,
                queryText: args.content,
                memories: memoryMatches.map((memory) => ({ memoryId: memory.id, score: memory.score })),
            });
            preLoopStepIndex += 1;
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: args.agentId,
                companyId: owner.companyId,
                stepIndex: preLoopStepIndex,
                kind: "OBSERVE",
                status: "SUCCESS",
                input: args.content,
                output: JSON.stringify({ memories: memoryMatches.map((memory) => ({ id: memory.id, applyMode: memory.applyMode, score: memory.score })) }),
            });
            currentUserContent += buildUntrustedKnowledgeContext({
                sourceLabel: "agent memory",
                chunks: memoryMatches.map((memory) => memory.content),
                maxChars: 6000,
            });
        }

        // The company's when-relevant memories, which this path never read.
        // Held for the message's evidence trail as well as the prompt, so a
        // rating on the answer can find the memories behind it.
        let ratedCompanyMemories: Parameters<typeof buildCompanyMemoryEvidence>[0] = [];
        if (owner.companyId) {
            const companyMemories = await ctx.runQuery(internal.companyMemories.getRuntimeMemoriesInternal, {
                companyId: owner.companyId,
                queryText: args.content,
                limit: 5,
            });
            if (companyMemories.relevant.length > 0) {
                ratedCompanyMemories = companyMemories.relevant;
                currentUserContent += buildUntrustedKnowledgeContext({
                    sourceLabel: "company memory",
                    chunks: companyMemories.relevant.map((memory) => `${memory.title}: ${memory.content}`),
                    maxChars: 6000,
                });
            }
        }

        // A photo turn may end in a structured follow-up proposal, generated
        // in this same reply rather than by a second model call.
        if (imageParts.length > 0) {
            currentUserContent += PHOTO_ACTION_PROPOSAL_INSTRUCTION;
        }

        conversationHistory.push({
            role: "user",
            // Text first: downstream grounding appends to parts[0].text.
            parts: [{ text: currentUserContent }, ...(imageParts ?? [])]
        });

        // --- RAG VECTOR SEARCH PIPELINE (Agent Isolated) ---
        let ragContext = "";
        // The chunks that actually reached the prompt, for the evidence trail —
        // this is what lets the knowledge-evidence sweep credit a rated answer
        // back to its sources.
        const includedChunkIds: string[] = [];
        try {
            const queryVector = await embedRetrievalQuery(ctx, {
                query: args.content,
                companyId: owner.companyId,
                operation: "agentRagEmbedding",
            });

            if (queryVector) {
                // Hybrid (vector + keyword) search of the agent's own knowledge.
                const vectorMatches = await searchKnowledgeScope(ctx, {
                    queryVector,
                    queryText: args.content,
                    scope: { kind: "agent", agentId: args.agentId },
                    limit: 100, // Matching the maximum RAG boundary limit
                    priorCompanyId: owner.companyId,
                });
                
                if (vectorMatches.length > 0) {
                    const MAX_RAG_CHARS = 32000;
                    const chunkTexts: string[] = [];
                    let chunkTextLength = 0;

                    for (const res of vectorMatches) {
                       if (chunkTextLength >= MAX_RAG_CHARS) {
                          break;
                       }
                       const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: res._id });
                       if (chunk) {
                          if (chunkTextLength + chunk.text.length > MAX_RAG_CHARS) {
                             break;
                          }
                          chunkTexts.push(chunk.text);
                          chunkTextLength += chunk.text.length;
                          includedChunkIds.push(res._id);
                       }
                    }

                    if (chunkTexts.length > 0) {
                        ragContext = buildUntrustedKnowledgeContext({
                            sourceLabel: "agent-scoped knowledge",
                            chunks: chunkTexts,
                            maxChars: MAX_RAG_CHARS,
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Agent RAG pipeline failed to execute", e);
        }

        if (ragContext) {
             // Append to the final user message to prioritize context grounding over system instruction fading
             const finalMessage = conversationHistory[conversationHistory.length - 1];
             const finalTextPart = finalMessage?.parts?.[0];
             if (finalTextPart?.text) {
                 finalTextPart.text += ragContext;
             }
        }

        await executeObjectiveLoop(ctx, {
            runId,
            agentId: args.agentId,
            threadId: args.threadId,
            objective: args.content,
            execution,
            conversationHistory,
            stream,
            promptCache,
            // The same trail the assistant path writes, so an agent's answer is
            // just as ratable: memory counters and the knowledge-evidence sweep
            // both read it off the message.
            replyNotice: imageNotice || undefined,
            photoTurn: imageParts.length > 0 || undefined,
            messageEvidence: {
                companyMemoryEvidenceJson: buildCompanyMemoryEvidence(ratedCompanyMemories),
                companyRuntimeEvidenceJson: buildCompanyRuntimeEvidence({
                    skillIds: [],
                    sourceIds: includedChunkIds,
                }),
            },
            state: {
                stepIndex: preLoopStepIndex,
                loopIndex: 0,
                toolCallCount: 0,
                inTokens: 0,
                outTokens: 0,
                cachedInTokens: 0,
                segmentCount: 1,
                // Everything assembled up to this point — history, the objective,
                // retrieved knowledge — is what every later turn re-sends
                // unchanged, so it is the run's cacheable prefix.
                stablePrefixTurns: conversationHistory.length,
            },
            runStartedAt: Date.now(),
        });
    } catch (error: unknown) {
        await finalizeObjectiveFailure(ctx, {
            runId: agentRunId,
            threadId: args.threadId,
            agentId: args.agentId,
            objective: args.content,
            companyId,
            stream,
            promptCache,
            provider: execution?.provider,
            error,
        });
    }
  },
});

/**
 * Pick a run back up in a fresh action.
 *
 * Scheduled by the loop itself when a segment has been working long enough that
 * starting another model turn would risk overrunning the Convex action ceiling,
 * and by the sweeper when a run has stopped moving. Either way the work already
 * done is in the checkpoint, so this reloads the agent's configuration and the
 * stored transcript and carries on from the next model turn.
 *
 * This mirrors `convex/workflowRuntime.ts`, where each node is its own scheduled
 * action and the execution's place is kept in the database. That design was
 * already in the repo and working; the agent runtime simply had not adopted it.
 */
export const continueAgentObjective = internalAction({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.runQuery(internal.agentRunCheckpoints.getCheckpointInternal, {
      runId: args.runId,
    });
    if (!checkpoint || checkpoint.status !== "ACTIVE") return;

    const runState = await ctx.runQuery(internal.agentRuns.getRunExecutionStateInternal, {
      runId: args.runId,
    });
    // Cancelled, already concluded, or gone: resuming would execute tools nobody
    // is waiting for and post an answer over a decision already taken.
    if (!runState || isRunStopRequested(runState.status)) {
      await ctx.runMutation(internal.agentRunCheckpoints.clearCheckpointInternal, { runId: args.runId });
      return;
    }

    // Absent for triggered work: a run started by a schedule or a job has no
    // conversation, and the loop below already writes nothing in that case.
    // This function used to treat a missing thread as "not resumable" and
    // delete the checkpoint — which silently killed every triggered run at its
    // first segment handover, leaving it marked RUNNING with nothing left for
    // the stall sweeper to find.
    const threadId = checkpoint.threadId;
    const stream = createModelTurnStream(checkpoint.streamMessageId);
    const promptCache: { name?: string } = { name: checkpoint.promptCacheName };
    let execution: LoopExecutionContext | undefined;

    try {
      if (checkpoint.segmentCount >= AGENT_RUN_MAX_SEGMENTS) {
        throw appError("INVALID_INPUT", "Agent run exceeded the maximum number of continuation segments.");
      }

      execution = await buildLoopExecutionContext(ctx, {
        agentId: checkpoint.agentId,
        threadId,
        // With no thread to read the owner from, the run row is the record of
        // whose work this is. Without it a resumed segment would rebuild its
        // tools with no company, and every workspace-scoped tool would fail.
        owner: { companyId: runState.companyId, userId: runState.userId },
      });

      const conversationHistory = JSON.parse(checkpoint.transcriptJson) as Content[];
      if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
        throw appError("INVALID_INPUT", "Agent run checkpoint holds no usable conversation transcript.");
      }

      await executeObjectiveLoop(ctx, {
        runId: args.runId,
        agentId: checkpoint.agentId,
        threadId,
        objective: runState.objective,
        execution,
        conversationHistory,
        stream,
        promptCache,
        state: {
          stepIndex: checkpoint.stepIndex,
          loopIndex: checkpoint.loopIndex,
          toolCallCount: checkpoint.toolCallCount,
          inTokens: checkpoint.inputTokens,
          outTokens: checkpoint.outputTokens,
          cachedInTokens: 0,
          segmentCount: checkpoint.segmentCount + 1,
          stablePrefixTurns: checkpoint.stablePrefixTurns ?? 0,
          // Reuse the cache the earlier segment built rather than paying to
          // upload the same prefix again.
          promptCacheName: checkpoint.promptCacheName,
        },
        // The whole run's clock, not this segment's. Budgets bound the run the
        // user is waiting on; restarting the timer per segment would make
        // `maxRuntimeMs` mean nothing.
        runStartedAt: runState.startedAt,
      });
    } catch (error: unknown) {
      await finalizeObjectiveFailure(ctx, {
        runId: args.runId,
        threadId,
        agentId: checkpoint.agentId,
        objective: runState.objective,
        companyId: checkpoint.companyId,
        stream,
        promptCache,
        provider: execution?.provider,
        error,
      });
    }
  },
});


export const generateAgentResponse = internalAction({
  args: {
    threadId: v.id("threads"),
    agentId: v.id("agents"),
    content: v.string(),
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.agentRuntime.runAgentObjective, args);
  },
});

const triggeredAgentRunTriggerValidator = v.union(
  v.literal("MANUAL"),
  v.literal("SCHEDULE"),
  v.literal("WEBHOOK"),
  v.literal("WORKFLOW"),
  v.literal("EVENT")
);


export const runTriggeredAgentObjective = internalAction({
  args: {
    agentId: v.id("agents"),
    objective: v.string(),
    triggerType: triggeredAgentRunTriggerValidator,
    runId: v.optional(v.id("agentRuns")),
    workflowId: v.optional(v.id("workflows")),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    scheduleId: v.optional(v.id("schedules")),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    // Run the drill: real model, real reads, every non-read tool call
    // recorded instead of performed. See the improvement plan, Phase 4.
    rehearsal: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ output: string; runId: Id<"agentRuns"> }> => {
    let runId = args.runId;
    // The shared safety gate (modelTurnService). No refusal sink: a triggered
    // run has no conversation to refuse into, so the decision is recorded on
    // the run record below instead.
    const safetyDecision = await guardModelTurn(ctx, {
      content: args.objective,
      platformName: (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName,
    });

    try {
      const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
      if (!agent) throw appError("NOT_FOUND", "Agent not found.");
      if (agent.isActive === false) throw appError("CONFLICT", "Agent is inactive.");

      const replayExecutionContext = runId
        ? await ctx.runQuery(internal.agentRuns.getReplayExecutionContextInternal, { runId })
        : null;

      // Ordinary triggered work runs on the real engine, which is what gives it
      // its tools. Replaying a job against its historical setup deliberately
      // does not execute tools — it records what would have been called as a
      // dry run — so that case keeps the single-shot path below rather than
      // quietly gaining the power to act on a snapshot of the past.
      if (!replayExecutionContext && safetyDecision.allowed) {
        return await runTriggeredOnAgentLoop(ctx, {
          agentId: args.agentId,
          objective: args.objective,
          triggerType: args.triggerType,
          runId,
          workflowId: args.workflowId,
          scheduleId: args.scheduleId,
          companyId: args.companyId,
          userId: args.userId,
          rehearsal: args.rehearsal,
        });
      }

      const requestedModelId = replayExecutionContext?.modelId
        ?? (agent.modelSelectionMode === "inherit" ? undefined : agent.modelId);
          const executionSystemPrompt = replayExecutionContext
        ? buildHistoricalReplaySystemPrompt({
            systemPrompt: replayExecutionContext.systemPrompt ?? agent.systemPrompt,
            rules: replayExecutionContext.rules,
            skills: replayExecutionContext.skills,
          })
        : agent.systemPrompt;
      const executionTemperature = replayExecutionContext?.temperature !== undefined
        ? replayExecutionContext.temperature
        : (agent.temperature !== undefined ? agent.temperature : 0.1);

      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        requestedModelId,
        companyId: args.companyId,
        useCase: args.triggerType === "WORKFLOW" ? "workflow" : "agent",
      });

      if (!runId) {
        runId = await ctx.runMutation(internal.agentRuns.createRunInternal, {
          agentId: args.agentId,
          workflowId: args.workflowId,
          scheduleId: args.scheduleId,
          triggerType: args.triggerType,
          objective: args.objective,
          status: "RUNNING",
          companyId: args.companyId,
          userId: args.userId,
          modelId: modelConfig.modelId,
          providerKey: modelConfig.providerKey,
          providerModelId: modelConfig.providerModelId,
          maxSteps: 1,
          ...(args.rehearsal ? { isRehearsal: true } : {}),
        });
      } else {
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "RUNNING",
        });
      }
      let stepIndex = await ctx.runQuery(internal.agentRuns.getLatestStepIndexInternal, { runId });

      if (!safetyDecision.allowed) {
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex: stepIndex + 1,
          kind: "FINAL",
          status: "FAILED",
          output: safetyDecision.response,
          error: safetyDecision.category,
        });
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "FAILED",
          finalOutput: safetyDecision.response,
          error: safetyDecision.category,
        });
        if (args.workflowExecutionId) {
          await ctx.runMutation(internal.scheduler.completeAgentExecution, {
            executionId: args.workflowExecutionId,
            agentRunId: runId,
            success: false,
            output: safetyDecision.response,
          });
        }
        return { output: safetyDecision.response, runId };
      }

      let objectiveContent = args.objective;
      if (replayExecutionContext) {
        const replayExecutableTools = replayExecutionContext.tools.filter((tool) => tool.replayExecutable);
        const blockedReplayTools = replayExecutionContext.tools.filter((tool) => !tool.replayExecutable);
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({
            replayMode: replayExecutionContext.replayMode,
            replayOfRunId: replayExecutionContext.replayOfRunId,
            agentVersionId: replayExecutionContext.agentVersionId,
            versionNumber: replayExecutionContext.versionNumber,
            snapshotHash: replayExecutionContext.snapshotHash,
            promptHash: replayExecutionContext.promptHash,
            toolSetHash: replayExecutionContext.toolSetHash,
            memoryRevisionHash: replayExecutionContext.memoryRevisionHash,
            ruleSetHash: replayExecutionContext.ruleSetHash,
            modelConfigHash: replayExecutionContext.modelConfigHash,
            policyHash: replayExecutionContext.policyHash,
            hydrated: {
              prompt: replayExecutionContext.systemPrompt !== undefined,
              model: replayExecutionContext.modelId !== undefined,
              temperature: replayExecutionContext.temperature !== undefined,
              toolDeclarations: replayExecutionContext.tools.length > 0,
              toolExecution: false,
              memoryContents: replayExecutionContext.memoryContents.length > 0,
              rules: replayExecutionContext.rules.length > 0,
              skills: replayExecutionContext.skills.length > 0,
            },
            snapshotCounts: {
              tools: replayExecutionContext.toolCount,
              replayExecutableTools: replayExecutableTools.length,
              blockedReplayTools: blockedReplayTools.length,
              activeMemories: replayExecutionContext.memoryActiveCount,
              rules: replayExecutionContext.ruleCount,
              skills: replayExecutionContext.skillCount,
            },
            historicalTools: replayExecutionContext.tools.map((tool) => ({
              name: tool.name,
              handlerMapping: tool.handlerMapping,
              requiredRole: tool.requiredRole,
              sideEffectLevel: tool.sideEffectLevel,
              confirmationRequired: tool.confirmationRequired,
              isActive: tool.isActive,
              version: tool.version,
              replayExecutable: tool.replayExecutable,
              replayPolicy: tool.replayPolicy,
              replayBlockedReason: tool.replayBlockedReason,
              hasInputSchema: Boolean(tool.inputSchema),
            })),
          }),
        });
        if (replayExecutionContext.tools.length > 0) {
          stepIndex += 1;
          await ctx.runMutation(internal.agentRuns.appendStepInternal, {
            runId,
            agentId: args.agentId,
            companyId: args.companyId,
            stepIndex,
            kind: "TOOL_CALL",
            status: "SKIPPED",
            input: JSON.stringify({
              mode: "HISTORICAL_TOOL_REPLAY_TEST_MODE",
              requestedToolCount: replayExecutionContext.tools.length,
            }),
            output: JSON.stringify({
              executed: false,
              reason: "Historical tool execution is recorded as a dry-run policy check. Live tool calls are not replayed from snapshots.",
              testModeCandidates: replayExecutableTools.map((tool) => ({
                name: tool.name,
                handlerMapping: tool.handlerMapping,
                requiredRole: tool.requiredRole,
                sideEffectLevel: tool.sideEffectLevel,
                hasInputSchema: Boolean(tool.inputSchema),
              })),
              blockedTools: blockedReplayTools.map((tool) => ({
                name: tool.name,
                handlerMapping: tool.handlerMapping,
                sideEffectLevel: tool.sideEffectLevel,
                replayBlockedReason: tool.replayBlockedReason,
              })),
            }),
          });
          objectiveContent += buildUntrustedKnowledgeContext({
            sourceLabel: "historical replay tool declarations",
            chunks: replayExecutionContext.tools.map((tool) => {
              const status = tool.replayExecutable
                ? "read-only historical tool declaration available for reasoning only"
                : "historical tool execution blocked during replay";
              return [
                `tool: ${tool.name}`,
                `handlerMapping: ${tool.handlerMapping}`,
                tool.description ? `description: ${tool.description}` : undefined,
                tool.requiredRole ? `requiredRole: ${tool.requiredRole}` : undefined,
                tool.sideEffectLevel ? `sideEffectLevel: ${tool.sideEffectLevel}` : undefined,
                tool.version ? `version: ${tool.version}` : undefined,
                `replayStatus: ${status}`,
              ].filter(Boolean).join("\n");
            }),
            maxChars: 8000,
          });
        }
        if (replayExecutionContext.memoryContents.length > 0) {
          objectiveContent += buildUntrustedKnowledgeContext({
            sourceLabel: "historical replay memory snapshot",
            chunks: replayExecutionContext.memoryContents.map((memory) => {
              const metadata = [
                memory.kind ? `kind: ${memory.kind}` : undefined,
                memory.importance !== undefined ? `importance: ${memory.importance}` : undefined,
                memory.updatedAt !== undefined ? `updatedAt: ${memory.updatedAt}` : undefined,
              ].filter(Boolean).join(", ");
              return metadata ? `[${metadata}]\n${memory.content}` : memory.content;
            }),
            maxChars: 6000,
          });
        }
      }
      const memoryMatches = await ctx.runQuery(internal.agentMemories.searchMemoryInternal, {
        agentId: args.agentId,
        companyId: args.companyId,
        queryText: args.objective,
        limit: 5,
      });
      if (memoryMatches.length > 0) {
        await ctx.runMutation(internal.agentMemories.recordUsageInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          queryText: args.objective,
          memories: memoryMatches.map((memory) => ({ memoryId: memory.id, score: memory.score })),
        });
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({ memories: memoryMatches.map((memory) => ({ id: memory.id, applyMode: memory.applyMode, score: memory.score })) }),
        });
        objectiveContent += buildUntrustedKnowledgeContext({
          sourceLabel: "agent memory",
          chunks: memoryMatches.map((memory) => memory.content),
          maxChars: 6000,
        });
      }

      // The company's when-relevant memories, which this path never read.
      if (args.companyId) {
        const companyMemories = await ctx.runQuery(internal.companyMemories.getRuntimeMemoriesInternal, {
          companyId: args.companyId,
          queryText: args.objective,
          limit: 5,
        });
        if (companyMemories.relevant.length > 0) {
          objectiveContent += buildUntrustedKnowledgeContext({
            sourceLabel: "company memory",
            chunks: companyMemories.relevant.map((memory) => `${memory.title}: ${memory.content}`),
            maxChars: 6000,
          });
        }
      }

      const runtimeSkills = replayExecutionContext
        ? []
        : await ctx.runQuery(internal.agentSkills.getRuntimeSkillsInternal, {
            agentId: args.agentId,
            companyId: args.companyId,
          });
      if (runtimeSkills.length > 0) {
        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
          runId,
          agentId: args.agentId,
          companyId: args.companyId,
          stepIndex,
          kind: "OBSERVE",
          status: "SUCCESS",
          input: args.objective,
          output: JSON.stringify({
            skills: runtimeSkills.map((skill) => ({
              skillId: skill.skillId,
              skillVersionId: skill.skillVersionId,
              name: skill.name,
              category: skill.category,
              riskLevel: skill.riskLevel,
              requiredToolMappings: skill.requiredToolMappings,
            })),
          }),
        });
      }

      // Always-on memories: the agent's own, and the company's — which this
      // path, like the chat path, never read.
      const [triggeredAgentAlways, triggeredCompanyAlways, triggeredEmailBranding] = await Promise.all([
        ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, {
          agentId: args.agentId,
          companyId: args.companyId,
        }),
        args.companyId
          ? ctx.runQuery(internal.companyMemories.getAlwaysMemoriesInternal, { companyId: args.companyId })
          : Promise.resolve([]),
        ctx.runQuery(internal.settings.getEmailBranding, {}),
      ]);
      const triggeredAlwaysMemories = [
        ...triggeredCompanyAlways.map((memory) => ({ title: memory.title, content: memory.content })),
        ...triggeredAgentAlways.map((memory) => ({ title: memory.title, content: memory.content })),
      ];

      // Plain text in, plain text out, so this goes through the registry and
      // runs on whichever provider the model belongs to.
      const modelStartedAt = Date.now();
      const response = await generateTextWithResolvedModel({
        model: modelConfig,
        systemInstruction: buildAgentSystemInstruction(
          executionSystemPrompt,
          runtimeSkills,
          triggeredAlwaysMemories,
          triggeredEmailBranding.platformName
        ),
        contents: [{ type: "text", text: objectiveContent }],
        temperature: executionTemperature,
      });

      const output = response.text || "Execution completed with no readable text output.";
      const inputTokens = response.inputTokens || 0;
      const outputTokens = response.outputTokens || 0;
      const runModel = await ctx.runQuery(internal.aiModels.getModelByIdInternal, {
        modelId: modelConfig.modelId,
      });
      const costUsd = calculateModelCostUsd({
        inputTokens,
        outputTokens,
        config: runModel ?? undefined,
      });

      await ctx.runMutation(internal.agentRuns.appendStepInternal, {
        runId,
        agentId: args.agentId,
        companyId: args.companyId,
        stepIndex: stepIndex + 1,
        kind: "MODEL",
        status: "SUCCESS",
        input: args.objective,
        output,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
        inputTokens,
        outputTokens,
      });
      await ctx.runMutation(internal.agentRuns.appendStepInternal, {
        runId,
        agentId: args.agentId,
        companyId: args.companyId,
        stepIndex: stepIndex + 2,
        kind: "FINAL",
        status: "SUCCESS",
        output,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
        inputTokens,
        outputTokens,
        costUsd,
      });
      // The raw exchange. This path — used by Run Agent and by every schedule —
      // recorded its steps but never a word of what was actually said, so the
      // raw log was empty for any agent that was not chatted with. The
      // conversation path has always written this; this one never did.
      await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
        agentId: args.agentId,
        interactionType: "LLM SYNTHESIS",
        promptContent: args.objective,
        responseContent: output,
        companyId: args.companyId,
        runId,
        outcome: "SUCCESS",
        durationMs: Date.now() - modelStartedAt,
      });

      await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
        runId,
        inputTokens,
        outputTokens,
        costUsd,
        modelId: modelConfig.modelId,
        providerKey: modelConfig.providerKey,
        providerModelId: modelConfig.providerModelId,
      });
      await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
        runId,
        status: "SUCCESS",
        finalOutput: output,
      });

      if (args.workflowExecutionId) {
        await ctx.runMutation(internal.scheduler.completeAgentExecution, {
          executionId: args.workflowExecutionId,
          agentRunId: runId,
          success: true,
          output,
        });
      }

      return { output, runId };
    } catch (error: unknown) {
      const errorMessage = normalizeAiRuntimeError(error, "Triggered agent execution failed.").error;
      // A failure on this path was equally silent: the run was marked failed but
      // nothing recorded what went wrong in the reader's own log.
      await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
        agentId: args.agentId,
        interactionType: "ERROR",
        promptContent: args.objective,
        responseContent: errorMessage,
        companyId: args.companyId,
        ...(runId ? { runId } : {}),
        outcome: "FAILED",
      });
      if (runId) {
        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
          runId,
          status: "FAILED",
          error: errorMessage,
        });
      }
      if (args.workflowExecutionId && runId) {
        await ctx.runMutation(internal.scheduler.completeAgentExecution, {
          executionId: args.workflowExecutionId,
          agentRunId: runId,
          success: false,
          output: errorMessage,
        });
      }
      throw error;
    }
  },
});

export const resumeApprovedToolCall = internalAction({
  args: {
    approvalId: v.id("agentRunApprovals"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.agentRunApprovals.getApprovalResumeContextInternal, {
      approvalId: args.approvalId,
    });
    if (!context?.approval || !context.run || !context.toolCall) {
      throw appError("NOT_FOUND", "Approval resume context not found.");
    }
    if (context.approval.status !== "APPROVED") {
      throw appError("CONFLICT", "Approval has not been approved.");
    }
    if (context.toolCall.status !== "PENDING") {
      throw appError("CONFLICT", "Approved tool call is not pending execution.");
    }

    const parsedArgs = parseToolArguments(context.toolCall.argumentsJson);

    let resultPayload;
    let finalOutput: string;
    let status: "SUCCESS" | "FAILED" = "FAILED";
    let error: string | undefined;

    try {
      const result = await executeRegisteredTool({
        ctx,
        handlerMapping: context.toolCall.handlerMapping,
        args: parsedArgs,
        agentId: context.approval.agentId,
        companyId: context.approval.companyId,
        userId: context.approval.reviewedBy,
        runId: context.approval.runId,
        toolCallId: context.toolCall._id,
        // Which catalogue row the agent actually invoked.
        //
        // **This was missing**, and the inline path a thousand lines above has
        // always passed it. Any handler that resolves its connector through the
        // invoked tool — every Gmail call, every tool on a connected server —
        // therefore lost track of which install it belonged to the moment a
        // human approved it. It worked unapproved and failed approved, which is
        // the hardest kind of fault to notice. Found 2026-08-24 by the first
        // tool-server write to go through this path.
        ...(context.toolCall.toolId ? { toolId: context.toolCall.toolId } : {}),
        fallbackQuery: context.run.objective,
      });
      status = "SUCCESS";
      resultPayload = buildToolResultPayload({
        status: "success",
        data: result,
      });
      finalOutput = getApprovedToolCompletionMessage({
        handlerMapping: context.toolCall.handlerMapping,
        normalizedToolName: context.toolCall.normalizedToolName,
        result,
      });
    } catch (toolError: unknown) {
      error = getErrorMessage(toolError, "Unknown Engine Exception");
      resultPayload = buildToolFailureResult(toolError);
      finalOutput = `Approved tool call failed: ${error}`;
    }

    // Record the outcome and find out whether the batch is settled. A single
    // model turn can request several tools, so this run may be holding other
    // approvals that nobody has decided yet.
    const settlement = await ctx.runMutation(internal.agentRunApprovals.recordApprovedToolResultInternal, {
      approvalId: args.approvalId,
      status,
      resultJson: JSON.stringify(resultPayload),
      error,
    });

    await settleBatchAndContinue(ctx, {
      approvalId: args.approvalId,
      runId: context.approval.runId,
      settlement,
      status,
      finalOutput,
      error,
    });
  },
});

/**
 * Resume a run whose approval was refused.
 *
 * The refusal is already recorded by `decideApproval`, including the result the
 * model will see, so there is no tool to run here. All that remains is the same
 * settle-or-wait decision an approval goes through: the model asked for this
 * turn's calls together and has to be answered together.
 */
export const resumeAfterRefusedToolCall = internalAction({
  args: {
    approvalId: v.id("agentRunApprovals"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.agentRunApprovals.getApprovalResumeContextInternal, {
      approvalId: args.approvalId,
    });
    if (!context?.approval || !context.run) return;
    if (context.approval.status !== "REJECTED") return;

    const settlement = await ctx.runQuery(internal.agentRunApprovals.getSettlementAfterDecisionInternal, {
      approvalId: args.approvalId,
    });
    if (!settlement) return;

    await settleBatchAndContinue(ctx, {
      approvalId: args.approvalId,
      runId: context.approval.runId,
      settlement,
      status: "FAILED",
      finalOutput: context.approval.decisionReason
        ? `Tool call refused: ${context.approval.decisionReason}`
        : "Tool call refused by a reviewer.",
    });
  },
});

export const executeAgentNode = internalAction({
  args: {
    agentId: v.id("agents"),
    input: v.string(),
  },
  handler: async (ctx, args) => {
    const ai = createVertexGenAIClient();

    const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
    if (!agent) throw appError("NOT_FOUND", "Agent not found.");

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
       requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
       useCase: "workflow",
    });
    const systemInstruction = agent.systemPrompt || "You are a specialized agent in a workflow.";

    // Google Search grounding is a capability only Vertex offers, so an agent
    // that wants the internet still needs a Vertex model — and now says so in
    // those terms rather than claiming the whole runtime requires one.
    const tools: Tool[] = [];
    if (agent.allowInternetAccess) {
        tools.push({ googleSearch: {} });
    }
    const targetModel = tools.length > 0
        ? getGoogleVertexProviderModelId(modelConfig, "internet access for a workflow agent")
        : modelConfig.providerModelId;
    
    const config: GenerateContentConfig = {
        systemInstruction: systemInstruction,
        temperature: agent.temperature !== undefined ? agent.temperature : 0.1,
    };
    
    if (tools.length > 0) {
        config.tools = tools;
    }

    if (agent.outputSchema) {
        try {
            config.responseMimeType = "application/json";
            config.responseJsonSchema = JSON.parse(agent.outputSchema);
        } catch (e) {
            console.error("Failed to parse output schema", e);
        }
    }

    let safeInput = args.input;
    if (safeInput.length > 10000) {
        safeInput = safeInput.substring(0, 10000) + "\n\n... [TRUNCATED DUE TO SIZE LIMITS]";
    }

    // Grounded runs stay on Vertex because that is where the search tool lives;
    // everything else goes through the registry and can run on any provider.
    //
    // Both branches are narrowed to the same shape here rather than returning a
    // union. A union return made this handler's inferred type circular, which
    // Convex reports as "implicitly has type any" several files away — a
    // confusing failure for a purely cosmetic saving.
    const generated: { text: string; inputTokens: number; outputTokens: number } = tools.length > 0
        ? await (async () => {
            const vertexResponse = await generateVertexContentWithRetry(ai, {
                model: targetModel,
                contents: `Input Data:\n${safeInput}`,
                config: config
            }, {
                operation: "workflowAgentNodeGenerate",
            });
            return {
                text: vertexResponse.text || "",
                inputTokens: vertexResponse.usageMetadata?.promptTokenCount || 0,
                outputTokens: vertexResponse.usageMetadata?.candidatesTokenCount || 0,
            };
        })()
        : await (async () => {
            const registryResponse = await generateTextWithResolvedModel({
                model: modelConfig,
                systemInstruction,
                contents: [{ type: "text", text: `Input Data:\n${safeInput}` }],
                temperature: agent.temperature !== undefined ? agent.temperature : 0.1,
                ...(config.responseJsonSchema
                    ? { jsonSchema: config.responseJsonSchema as Record<string, unknown> }
                    : {}),
            });
            return {
                text: registryResponse.text || "",
                inputTokens: registryResponse.inputTokens || 0,
                outputTokens: registryResponse.outputTokens || 0,
            };
        })();

    const output = generated.text || "{}";

    // Log Execution for Observability. No run id: this path is a workflow step
    // calling a model directly, outside any durable agent run.
    await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
        agentId: args.agentId,
        interactionType: "WORKFLOW_EXECUTION",
        promptContent: args.input,
        responseContent: output,
        outcome: "SUCCESS",
    });

    return {
        output,
        usage: {
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
        }
    };
  },
});
