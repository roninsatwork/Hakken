"use node";

import type { ActionCtx } from "./_generated/server";

import type { Content } from "./utils/providerContentTypes";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { redactPII, DEFAULT_PII_CONFIG } from "./utils/pii";
import {
  buildToolFailureResult,
  canExecuteTool,
  executeRegisteredTool,
  parseToolCallPayload,
  validateToolCallArgsAgainstSchema,
} from "./aiToolExecutionService";

import {
  createModelTurnStream,
  finishAssistantReply,
  runModelTurn,
  type ModelTurnStream,
} from "./modelTurnService";
import { type MessageEvidence } from "./utils/messageEvidence";
import {
  EXPLICIT_CACHE_TTL_SECONDS,
  getPromptCacheStyle,
  resolvePromptCacheSegments,
  shouldCreateExplicitCache,
} from "./promptCacheService";
import {
  getCancelledRunMessage,
  isCheckpointStorable,
  isRunStopRequested,
  shouldCheckpointSegment,
  trimConversationForCheckpoint,
} from "./agentRunContinuationService";
import {
  buildModelStepRecord,
  buildRefusedToolCallKey,
  buildRunUsagePayload,
  buildToolDispatchLogEntry,
  classifyExecutedToolResult,
  estimateStablePrefixTokens,
  parseAgentOutputSchema,
  parseRefusedToolCalls,
  resolveToolCallWithoutExecution,
  shouldRequestToolApproval,
  shouldRetryTurnWithoutPromptCache,
  type ExecutedAgentToolCall,
  buildToolInteractionTurns,
  getAgentStepStatusFromToolStatus,
  getCostBudgetStopMessage,
  getRuntimeBudgetStopMessage,
  getTokenBudgetStopMessage,
  getStepBudgetStopMessage,
  getToolBudgetStopMessage,
  shouldStopForCostBudget,
  shouldStopForRuntimeBudget,
  shouldStopForTokenBudget,
  shouldStopForToolBudget,
} from "./agentRuntimeService";
import { getErrorMessage } from "./utils/lang";

import {
  autonomyAppliesToTool,
  calculateModelCostGBP,
  getApprovalRequiredMessage,
} from "./agentRuntimeTurnService";
import {
  buildLoopExecutionContext,
  finalizeObjectiveFailure,
  type LoopExecutionContext,
  type ObjectiveLoopState,
} from "./agentObjectiveLoopService";

/**
 * The objective loop: the run itself.
 *
 * Everything here executes a run — building its tools and knowledge, walking
 * the model/tool conversation, settling parallel tool batches, checkpointing
 * between action segments, and closing out failure. agentRuntime.ts keeps the
 * registered actions and hands each one straight here, so the API surface and
 * the machine it drives can be read separately. Registers no Convex functions.
 */

export async function executeObjectiveLoop(ctx: ActionCtx, params: {
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    /**
     * The conversation to stream the reply into, when there is one.
     *
     * Absent for scheduled and manually started work. The loop then does its
     * job silently rather than posting into somebody's chat history — a
     * scheduled run appearing in Ask Hakken would read as though the agent had
     * spoken to them unprompted.
     */
    threadId?: Id<"threads">;
    objective: string;
    execution: LoopExecutionContext;
    conversationHistory: Content[];
    stream: ModelTurnStream;
    /**
     * The provider-side cache this run is using, if any.
     *
     * Held by the caller for the same reason the stream is: if the loop dies
     * part-way, the caller's failure handler still has to release it. A cache
     * left behind is billed storage for a conversation nobody is having.
     */
    promptCache: { name?: string };
    /**
     * What reached the model behind this reply — company memories and
     * knowledge chunks — written onto the final assistant message so a rating
     * can be traced back to its sources. Absent for scheduled runs (no chat
     * message to rate) and for checkpoint resumes (the pre-loop assembly that
     * knew the ids is gone; a resumed run's answer is simply evidence-less).
     */
    messageEvidence?: MessageEvidence;
    /**
     * A sentence appended verbatim to the reply — today, the admission that an
     * attached photo went unread because the model cannot see. Deterministic
     * on purpose: honesty about a dropped attachment must not depend on the
     * model choosing to mention it.
     */
    replyNotice?: string;
    /**
     * Whether the turn being answered carried a photo. Gates the photo-action
     * proposal extraction at save time — only an image-bearing turn may grow
     * an action chip, however convincingly a block appears in other replies.
     */
    photoTurn?: boolean;
    state: ObjectiveLoopState;
    runStartedAt: number;
}) {
        const { runId, threadId, objective, execution, conversationHistory, stream, state, runStartedAt, messageEvidence } = params;
        const agentId = params.agentId;
        const { owner, modelConfig, provider, systemInstruction, temperature, toolDeclarations, providerTools, toolMetadataByName, limits } = execution;
        const config = execution.modelDoc;
        const companyId = owner.companyId;
        const segmentStartedAt = Date.now();

        let assistantReply = "";
        let finalStepStatus: "SUCCESS" | "FAILED" = "SUCCESS";
        let stepIndex = state.stepIndex;
        let toolCallCount = state.toolCallCount;
        let inTokens = state.inTokens;
        let outTokens = state.outTokens;
        let cachedInTokens = state.cachedInTokens;
        let stablePrefixTurns = state.stablePrefixTurns;
        const promptCache = params.promptCache;
        promptCache.name = state.promptCacheName;
        const cacheStyle = getPromptCacheStyle(modelConfig.providerKey);

        // The fixed answer shape this agent asks for, if it asks for one.
        // Parsed once per segment rather than per turn.
        const parsedOutputSchema = parseAgentOutputSchema(execution.agent.outputSchema);
        if (parsedOutputSchema.invalidJson) {
            console.warn("Agent output schema is not valid JSON; running without it", { runId });
        }
        const agentResponseJsonSchema = parsedOutputSchema.schema;

        /**
         * Release the provider-side cache, if this run made one.
         *
         * Called on every terminal path. A cache that outlives its run is not a
         * correctness problem — it carries a TTL — but it is billed storage for
         * a conversation nobody is having any more.
         */
        const releasePromptCache = async () => {
            if (!promptCache.name) return;
            const name = promptCache.name;
            promptCache.name = undefined;
            await provider.releasePromptCache?.(name);
        };

        /**
         * Save the run's position so another action can take over from here.
         *
         * Called after every completed model turn. The cost is one write per
         * turn — trivial next to the model call that produced it — and it buys
         * two things: a segment can hand over cleanly before the action ceiling,
         * and a run that dies can be picked up rather than losing everything it
         * had done.
         */
        const saveCheckpoint = async (checkpointStatus: "ACTIVE" | "AWAITING_APPROVAL", nextLoopIndex: number) => {
            const { serialized, trimmed } = trimConversationForCheckpoint(conversationHistory);
            if (!isCheckpointStorable(serialized)) {
                // A single turn larger than the whole budget. Nothing can be
                // stored, so the run stays live in this action and simply is not
                // resumable — better than a write that throws and takes the run
                // down with it.
                console.warn("Agent run transcript too large to checkpoint", { runId });
                return false;
            }

            await ctx.runMutation(internal.agentRunCheckpoints.saveCheckpointInternal, {
                runId,
                agentId,
                companyId,
                threadId,
                status: checkpointStatus,
                transcriptJson: serialized,
                transcriptTrimmed: trimmed,
                stepIndex,
                loopIndex: nextLoopIndex,
                toolCallCount,
                inputTokens: inTokens,
                outputTokens: outTokens,
                streamMessageId: stream.messageId,
                // A trimmed transcript no longer starts where the cached prefix
                // did, so the cache describes a conversation this request is not
                // having. Drop it and stop caching for the rest of the run
                // rather than referencing a prefix that has moved.
                stablePrefixTurns: trimmed ? 0 : stablePrefixTurns,
                promptCacheName: trimmed ? undefined : promptCache.name,
                segmentCount: state.segmentCount,
            });

            if (trimmed && promptCache.name) {
                await releasePromptCache();
                stablePrefixTurns = 0;
            }
            return true;
        };

        /**
         * Has someone stopped this run while it was working?
         *
         * `cancelRun` writes CANCELLED to the row and returns — it cannot reach
         * into an action already in flight. Without this check the loop carried
         * on calling tools and posted its answer over a cancellation the
         * operator had already been told was applied.
         */
        const readStopRequest = async () => {
            const runState = await ctx.runQuery(internal.agentRuns.getRunExecutionStateInternal, { runId });
            if (!runState) return { stopped: true, message: getCancelledRunMessage() };
            if (isRunStopRequested(runState.status)) {
                return { stopped: true, message: getCancelledRunMessage(runState.finalOutput) };
            }
            return { stopped: false, message: "" };
        };

        // Read once for this action rather than per call. A refusal is written by a
        // person while the run is parked, so the list cannot change while this
        // action is in flight; a resumed run enters here again and re-reads it.
        const loopRunState = await ctx.runQuery(internal.agentRuns.getRunExecutionStateInternal, { runId });
        const refusedToolCalls = parseRefusedToolCalls(loopRunState?.refusedToolCallsJson);
        // On the run record so checkpoint resume inherits it without threading.
        const isRehearsalRun = loopRunState?.isRehearsal === true;

        /**
         * Wind up a run that was stopped from outside.
         *
         * Deliberately does not touch the run's status: `cancelRun` has already
         * written CANCELLED, the final step and the reason, and overwriting that
         * would replace the operator's record with the runtime's. What is left
         * is the part `cancelRun` could not do — closing the reply, so the
         * reader stops waiting — and recording the spend incurred up to here.
         */
        const concludeStoppedRun = async (message: string) => {
            await releasePromptCache();
            await ctx.runMutation(internal.agentRunCheckpoints.clearCheckpointInternal, { runId });
            await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
                runId,
                ...buildRunUsagePayload({
                    inputTokens: inTokens,
                    outputTokens: outTokens,
                    cachedInputTokens: cachedInTokens,
                    rates: config,
                    model: modelConfig,
                }),
            });

            // Nothing streamed yet means the thread's last message is the
            // user's and the surface is showing a thinking indicator that
            // would otherwise never clear — the shared delivery covers that
            // branch too.
            await finishAssistantReply(ctx, {
                threadId,
                stream,
                content: message,
                usage: { inputTokens: inTokens, outputTokens: outTokens },
                model: modelConfig,
            });
        };

        let turnsThisSegment = 0;

        for (let loopIndex = state.loopIndex; loopIndex < limits.maxSteps; loopIndex += 1) {
            const stopRequest = await readStopRequest();
            if (stopRequest.stopped) {
                await concludeStoppedRun(stopRequest.message);
                return;
            }

            // Hand over to a freshly scheduled action rather than starting a
            // model turn this segment may not live long enough to finish. Only
            // between turns: the transcript is consistent here and would not be
            // mid-turn. Never on the first turn of a segment, or a run could
            // bounce between segments without making progress.
            if (turnsThisSegment > 0 && shouldCheckpointSegment({
                segmentElapsedMs: Date.now() - segmentStartedAt,
            })) {
                if (await saveCheckpoint("ACTIVE", loopIndex)) {
                    await ctx.scheduler.runAfter(0, internal.agentRuntime.continueAgentObjective, { runId });
                    return;
                }
                // Not resumable, so carry on here and let the runtime budget
                // stop the run rather than abandoning it.
            }

            turnsThisSegment += 1;

            // The system instruction, the tool declarations and everything
            // retrieved for this objective are re-sent on every turn. Once a run
            // has shown it is the multi-turn kind, upload that prefix once and
            // reference it instead. A run that answers in one or two turns never
            // gets here, and so never pays for a cache it would not reuse.
            if (shouldCreateExplicitCache({
                style: cacheStyle,
                estimatedPrefixTokens: estimateStablePrefixTokens({
                    turns: conversationHistory,
                    stablePrefixTurns,
                    systemInstruction,
                    providerTools,
                }),
                completedTurns: loopIndex,
                alreadyCached: promptCache.name !== undefined,
            })) {
                const segments = resolvePromptCacheSegments({
                    turns: conversationHistory,
                    stableTurnCount: stablePrefixTurns,
                });
                if (segments.stable.length > 0) {
                    // Returns undefined on any failure — and on a provider that
                    // does not cache this way at all — so the run simply pays
                    // full price rather than stopping.
                    promptCache.name = await provider.createPromptCache?.({
                        model: modelConfig,
                        systemInstruction,
                        tools: toolDeclarations,
                        turns: segments.stable,
                        ttlSeconds: EXPLICIT_CACHE_TTL_SECONDS,
                        label: `agent-run-${runId}`,
                    });
                    if (promptCache.name) stablePrefixTurns = segments.stable.length;
                }
            }

            // The provider adapter owns everything provider-shaped from here:
            // how the prefix is cached, how a tool request is represented, how
            // the stream is framed. The loop only says what it wants and reads
            // back a normalised answer.
            const turnRequest = {
                model: modelConfig,
                systemInstruction,
                turns: conversationHistory,
                tools: toolDeclarations,
                temperature,
                cacheName: promptCache.name,
                cachedPrefixTurns: stablePrefixTurns,
                // Both settings have been on the agent screen since it was
                // built, and neither reached a model from here: reasoning effort
                // was read by nothing at all, and web access only by the
                // workflow-node path. So an agent set to High that searched the
                // web inside a workflow did neither when launched from its own
                // page.
                reasoningEffort: execution.agent.reasoningEffort,
                webSearch: execution.agent.allowInternetAccess === true,
                responseJsonSchema: agentResponseJsonSchema,
            };
            // The shared turn (modelTurnService) owns the streaming discipline:
            // each turn's text replaces the last, so tool-call narration does
            // not accumulate in front of the answer that follows it, and the
            // partial reply is written to the thread at a bounded rate. The
            // adapter call — with its cache-rejection retry — is this
            // runtime's own strategy, handed in whole.
            const response = await runModelTurn(ctx, {
                threadId,
                stream,
                model: modelConfig,
                callModel: async ({ onText }) => {
                    try {
                        return await provider.streamTurn(turnRequest, {
                            operation: toolCallCount === 0 ? "agentGeneratePassOne" : "agentGenerateToolSynthesis",
                            onText,
                        });
                    } catch (error) {
                        // A cached request the provider will not accept must not end the
                        // run. Retry it once in full, when the policy allows it.
                        if (!shouldRetryTurnWithoutPromptCache({
                            usedPromptCache: Boolean(promptCache.name),
                            streamedChars: stream.text.length,
                        })) throw error;

                        console.warn("Cached prompt request rejected; retrying without the cache", {
                            runId,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        await releasePromptCache();
                        stablePrefixTurns = 0;
                        stream.text = "";
                        stream.flushedText = "";

                        return await provider.streamTurn({
                            ...turnRequest,
                            cacheName: undefined,
                            cachedPrefixTurns: 0,
                        }, {
                            operation: "agentGenerateUncachedRetry",
                            onText,
                        });
                    }
                },
            });

            const responseInputTokens = response.inputTokens;
            const responseOutputTokens = response.outputTokens;
            inTokens += responseInputTokens;
            outTokens += responseOutputTokens;
            cachedInTokens += response.cachedInputTokens;
            const estimatedCostGBP = calculateModelCostGBP({
                inputTokens: inTokens,
                outputTokens: outTokens,
                cachedInputTokens: cachedInTokens,
                config,
            });

            const requestedToolCalls = response.toolCalls.length;
            stepIndex += 1;
            const modelStepRecord = buildModelStepRecord({
                loopIndex,
                completedToolCalls: toolCallCount,
                responseText: response.text,
                toolCallNames: response.toolCalls.map((call: { name: string }) => call.name),
            });
            await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                runId,
                agentId: agentId,
                companyId: companyId,
                stepIndex,
                kind: "MODEL",
                status: "SUCCESS",
                input: modelStepRecord.input,
                output: modelStepRecord.output,
                modelId: modelConfig.modelId,
                providerKey: modelConfig.providerKey,
                providerModelId: modelConfig.providerModelId,
                inputTokens: responseInputTokens,
                outputTokens: responseOutputTokens,
            });

            if (shouldStopForRuntimeBudget({
                elapsedMs: Date.now() - runStartedAt,
                maxRuntimeMs: limits.maxRuntimeMs,
            })) {
                assistantReply = getRuntimeBudgetStopMessage(limits.maxRuntimeMs);
                finalStepStatus = "FAILED";
                break;
            }

            if (shouldStopForTokenBudget({
                inputTokens: inTokens,
                outputTokens: outTokens,
                maxInputTokens: limits.maxInputTokens,
                maxOutputTokens: limits.maxOutputTokens,
            })) {
                assistantReply = getTokenBudgetStopMessage();
                finalStepStatus = "FAILED";
                break;
            }

            if (shouldStopForCostBudget({
                costGBP: estimatedCostGBP,
                maxCostGBP: limits.maxCostGBP,
            })) {
                assistantReply = getCostBudgetStopMessage(limits.maxCostGBP);
                finalStepStatus = "FAILED";
                break;
            }

            if (requestedToolCalls === 0) {
                assistantReply = response.text || "Execution completed with no readable text output.";
                break;
            }

            if (shouldStopForToolBudget({
                requestedToolCalls,
                completedToolCalls: toolCallCount,
                maxToolCalls: limits.maxToolCalls,
            })) {
                assistantReply = getToolBudgetStopMessage(limits.maxToolCalls);
                finalStepStatus = "FAILED";
                break;
            }

            const funcCalls = response.toolCalls;
            if (funcCalls.length === 0) {
                assistantReply = "Execution completed with no readable text output.";
                break;
            }

            // A single model turn may request several tool calls. Execute each
            // one, then answer them together in one function turn so the
            // transcript matches what the model asked for.
            const executedCalls: ExecutedAgentToolCall[] = [];
            let toolBudgetStopMessage: string | undefined;
            /**
             * Gated calls in this batch, in request order.
             *
             * The loop used to park and return on the first call needing approval,
             * discarding every call after it in the same batch — the model had to
             * notice and re-request them. Now each one is queued and the batch is
             * parked once, at the end.
             */
            let deferredApprovalCount = 0;
            let firstApprovalMessage: string | undefined;

            for (const funcCall of funcCalls) {
                // Bound the batch: shouldStopForToolBudget only looks at completed
                // calls, so a model requesting more calls than the remaining budget
                // would otherwise overrun the limit within a single turn.
                if (toolCallCount >= limits.maxToolCalls) {
                    toolBudgetStopMessage = getToolBudgetStopMessage(limits.maxToolCalls);
                    break;
                }

                // Checked per tool, not once per turn. A batch can hold several
                // calls and a cancellation arriving between them must stop the
                // rest: these are the operations with real side effects, and
                // "cancelled" has to mean nothing further ran.
                const batchStopRequest = await readStopRequest();
                if (batchStopRequest.stopped) {
                    conversationHistory.push(...buildToolInteractionTurns(executedCalls));
                    await concludeStoppedRun(batchStopRequest.message);
                    return;
                }

                const toolCall = parseToolCallPayload({ name: funcCall.name, callArgs: funcCall.args });
                const rawArgsString = JSON.stringify(toolCall.args);
                const redactedArgsString = redactPII(rawArgsString, DEFAULT_PII_CONFIG);
                console.log("Agent requested function call:", toolCall.name, redactedArgsString);

                // The dispatch used to be logged here, before the tool had run.
                // Nothing at this point knows whether the call will succeed, so
                // the entry could only ever be written without an outcome — which
                // is why the screen was left inferring one from the wording of
                // the interaction type, and reporting every failed tool call as a
                // success. The entry is now written once the call has resolved,
                // below, where the result is actually known.
                const toolStartedAt = Date.now();

                const currentUser = owner.userId
                    ? await ctx.runQuery(internal.users.getUserInternal, { userId: owner.userId })
                    : null;
                const toolMetadata = toolMetadataByName.get(toolCall.name);
                const requiredRole = toolMetadata?.requiredRole ?? "SUPER_ADMIN";
                const schemaValidation = validateToolCallArgsAgainstSchema({
                    schema: toolMetadata?.inputSchema,
                    callArgs: toolCall.args,
                });
                const accessDecision = canExecuteTool({
                    requiredRole,
                    userRole: currentUser?.role,
                    userCompanyId: currentUser?.companyId,
                    targetCompanyId: companyId,
                    sideEffectLevel: toolMetadata?.sideEffectLevel,
                    confirmationRequired: toolMetadata?.confirmationRequired,
                    // Passed as well as being folded into the metadata above,
                    // because canExecuteTool re-derives the confirmation
                    // requirement from the side-effect level and would otherwise
                    // overrule it — parking an autonomous agent on every write.
                    //
                    // Not the raw flag: whether autonomy applies to *this* tool,
                    // from the one function that decides it. Handing over the raw
                    // flag is what let an autonomous agent write to a connected
                    // server without anyone being asked.
                    autonomous: autonomyAppliesToTool({
                        sideEffectLevel: (toolMetadata?.sideEffectLevel ?? "READ"),
                        fromConnectedServer: toolMetadata?.fromConnectedServer,
                        agentRunsAutonomously: execution.agent.autonomousToolExecution === true,
                    }),
                });

                // Already refused, so do not ask again. A refusal is fed back to the
                // model rather than ending the run, and a model that still wants to
                // send that email will ask again — queueing a second approval for a
                // decision a person has already made burns the reviewer's attention
                // rather than the token budget. Answered inline with the same
                // refusal instead.
                const refusedKey = buildRefusedToolCallKey(toolCall.name, rawArgsString);
                const wasRefused = refusedToolCalls.includes(refusedKey);

                if (
                    toolMetadata &&
                    shouldRequestToolApproval({
                        isRehearsalRun,
                        wasRefused,
                        schemaValidationOk: schemaValidation.ok,
                        accessDecision,
                    })
                ) {
                    toolCallCount += 1;
                    const approvalMessage = getApprovalRequiredMessage(toolCall.name, toolMetadata.fromConnectedServer);
                    stepIndex += 1;
                    const toolStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                        runId,
                        agentId: agentId,
                        companyId: companyId,
                        stepIndex,
                        kind: "TOOL_CALL",
                        status: "PENDING",
                        input: redactedArgsString,
                        output: approvalMessage,
                    });

                    const toolCallId = await ctx.runMutation(internal.agentRuns.insertToolCallInternal, {
                        runId,
                        stepId: toolStepId,
                        agentId: agentId,
                        toolId: toolMetadata.toolId,
                        normalizedToolName: toolCall.name,
                        handlerMapping: toolMetadata.handlerMapping,
                        argumentsJson: rawArgsString,
                        redactedArgumentsJson: redactedArgsString,
                        status: "APPROVAL_REQUIRED",
                        requiredRole,
                        sideEffectLevel: toolMetadata.sideEffectLevel,
                        confirmationRequired: true,
                        companyId: companyId,
                        userId: owner.userId,
                        turnIndex: loopIndex,
                        thoughtSignature: funcCall.thoughtSignature,
                    });

                    stepIndex += 1;
                    const approvalStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                        runId,
                        agentId: agentId,
                        companyId: companyId,
                        stepIndex,
                        kind: "APPROVAL_REQUEST",
                        status: "PENDING",
                        input: redactedArgsString,
                        output: approvalMessage,
                    });

                    await ctx.runMutation(internal.agentRunApprovals.insertApprovalInternal, {
                        runId,
                        stepId: approvalStepId,
                        toolCallId,
                        agentId: agentId,
                        companyId: companyId,
                        requestedBy: owner.userId,
                        status: "PENDING",
                        message: approvalMessage,
                        previewJson: JSON.stringify({
                            tool: toolCall.name,
                            handlerMapping: toolMetadata.handlerMapping,
                            arguments: toolCall.args,
                            sideEffectLevel: toolMetadata.sideEffectLevel,
                        }),
                    });

                    // This call is waiting on a person, so it has no outcome yet
                    // and says so. Logged rather than skipped because the old
                    // dispatch entry was written before this branch, and dropping
                    // it silently would take a parked call out of the raw log
                    // altogether — the one case where somebody most wants to see
                    // why nothing is happening.
                    if (agentId) {
                        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                            agentId,
                            threadId,
                            interactionType: `TOOL AWAITING APPROVAL: ${toolCall.name}`,
                            promptContent: objective,
                            responseContent: approvalMessage,
                            companyId,
                            runId,
                            stepId: approvalStepId,
                            outcome: "UNKNOWN",
                            durationMs: Date.now() - toolStartedAt,
                        });
                    }

                    // Queued, not parked. The rest of the batch still has to be
                    // considered: the model asked for those calls too, and
                    // returning here is what used to discard them.
                    deferredApprovalCount += 1;
                    firstApprovalMessage ??= approvalMessage;
                    continue;
                }

                let toolStatus: "SUCCESS" | "NOT_IMPLEMENTED" | "FAILED" | "DENIED" | "CANCELLED" | "REHEARSED" = "FAILED";
                let toolError: string | undefined;
                let toolResponsePayload: unknown;

                // Everything that can be decided without side effects is decided
                // in one place: refusals, invalid arguments, rehearsed writes,
                // denials and unknown tools. Only a call that passes every gate
                // reaches the execution below — which also means the classifier
                // has always answered by the time `toolMetadata` is absent, so
                // the else-branch may rely on it being present.
                const preResolved = resolveToolCallWithoutExecution({
                    toolName: toolCall.name,
                    wasRefused,
                    schemaValidation,
                    isRehearsalRun,
                    toolMetadata,
                    accessDecision,
                });

                if (preResolved) {
                    toolStatus = preResolved.status;
                    toolError = preResolved.error;
                    toolResponsePayload = preResolved.responsePayload;
                } else if (toolMetadata) {
                    try {
                        const result = await executeRegisteredTool({
                            ctx,
                            handlerMapping: toolMetadata.handlerMapping,
                            args: toolCall.args,
                            agentId: agentId,
                            companyId: companyId,
                            userId: owner.userId,
                            runId,
                            toolId: toolMetadata.toolId,
                            fallbackQuery: objective,
                        });
                        const classified = classifyExecutedToolResult({
                            toolName: toolCall.name,
                            result,
                        });
                        toolStatus = classified.status;
                        toolError = classified.error;
                        toolResponsePayload = classified.responsePayload;
                    } catch (error: unknown) {
                        toolError = getErrorMessage(error, "Unknown Engine Exception");
                        toolResponsePayload = buildToolFailureResult(error);
                    }
                }

                toolCallCount += 1;
                stepIndex += 1;
                const toolStepId = await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                    runId,
                    agentId: agentId,
                    companyId: companyId,
                    stepIndex,
                    kind: "TOOL_CALL",
                    status: getAgentStepStatusFromToolStatus(toolStatus),
                    input: redactedArgsString,
                    output: JSON.stringify(toolResponsePayload),
                    error: toolError,
                });

                await ctx.runMutation(internal.agentRuns.insertToolCallInternal, {
                    runId,
                    stepId: toolStepId,
                    agentId: agentId,
                    toolId: toolMetadata?.toolId,
                    normalizedToolName: toolCall.name,
                    handlerMapping: toolMetadata?.handlerMapping ?? toolCall.name,
                    argumentsJson: rawArgsString,
                    redactedArgumentsJson: redactedArgsString,
                    resultJson: JSON.stringify(toolResponsePayload),
                    status: toolStatus,
                    requiredRole,
                    sideEffectLevel: toolMetadata?.sideEffectLevel ?? "READ",
                    confirmationRequired: toolMetadata?.confirmationRequired ?? false,
                    companyId: companyId,
                    userId: owner.userId,
                    turnIndex: loopIndex,
                    thoughtSignature: funcCall.thoughtSignature,
                    error: toolError,
                });

                stepIndex += 1;
                await ctx.runMutation(internal.agentRuns.appendStepInternal, {
                    runId,
                    agentId: agentId,
                    companyId: companyId,
                    stepIndex,
                    kind: "TOOL_RESULT",
                    status: getAgentStepStatusFromToolStatus(toolStatus),
                    input: toolCall.name,
                    output: JSON.stringify(toolResponsePayload),
                    error: toolError,
                });

                // Log Telemetry: Tool Dispatch, now that it has resolved.
                if (agentId) {
                    const dispatchLog = buildToolDispatchLogEntry({
                        toolName: toolCall.name,
                        toolStatus,
                        toolError,
                        redactedArgsJson: redactedArgsString,
                    });
                    await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
                        agentId,
                        threadId,
                        interactionType: dispatchLog.interactionType,
                        promptContent: objective,
                        responseContent: dispatchLog.responseContent,
                        companyId,
                        runId,
                        stepId: toolStepId,
                        outcome: dispatchLog.outcome,
                        durationMs: Date.now() - toolStartedAt,
                    });
                }

                executedCalls.push({
                    name: toolCall.name,
                    args: toolCall.args,
                    responsePayload: toolResponsePayload,
                    thoughtSignature: funcCall.thoughtSignature,
                });
            }

            if (deferredApprovalCount > 0) {
                // Park once for the whole batch.
                //
                // Deliberately no tool-result turn is written into the transcript
                // here. A model turn requesting N calls must be answered by one
                // turn carrying N results, and only some of them exist yet — the
                // rest are waiting on a person. Pushing what has run so far would
                // put a turn answering 2 of 3 calls into the conversation, and the
                // resume would then append a second turn for the third. That is
                // what the runtime used to do, and it is a transcript the provider
                // contract does not allow: it can be rejected outright, or worse
                // accepted with results lined up against the wrong calls.
                //
                // The results are not lost. They are on the tool call rows, keyed
                // by `turnIndex`, and the resume that settles the last approval
                // assembles the whole batch into one turn in request order.
                const parkMessage = firstApprovalMessage ?? getApprovalRequiredMessage("tool");
                await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
                    runId,
                    ...buildRunUsagePayload({
                        inputTokens: inTokens,
                        outputTokens: outTokens,
                        cachedInputTokens: cachedInTokens,
                        rates: config,
                        model: modelConfig,
                    }),
                });
                await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
                    runId,
                    status: "PENDING_APPROVAL",
                    finalOutput: parkMessage,
                });
                // A turn that requests a tool often narrates first. That
                // half-sentence is on screen marked as typing, and the run is
                // now parked indefinitely waiting for a human, so it has to be
                // closed here rather than at the end of a loop that is not
                // going to reach its end.
                await finishAssistantReply(ctx, {
                    threadId,
                    stream,
                    content: parkMessage,
                    usage: { inputTokens: inTokens, outputTokens: outTokens },
                    model: modelConfig,
                });

                // A person may take hours to decide, and a prompt cache lives for
                // minutes. Release it now rather than paying to store a prefix that
                // will have expired by the time anyone looks.
                await releasePromptCache();

                // Marked AWAITING_APPROVAL so the stalled-run sweeper leaves it
                // alone: a run waiting on a person is not a run that died. The turn
                // that requested the tools is finished, so the resumed loop starts
                // at the next one.
                await saveCheckpoint("AWAITING_APPROVAL", loopIndex + 1);
                return;
            }

            // Record the whole batch as one model turn plus one function turn,
            // before any budget stop, so the transcript is never left with
            // calls that have no matching response.
            conversationHistory.push(...buildToolInteractionTurns(executedCalls));

            if (toolBudgetStopMessage) {
                assistantReply = toolBudgetStopMessage;
                finalStepStatus = "FAILED";
                break;
            }

            // Save after every completed turn, not only at a handover. This is
            // what turns a killed action from total loss into a resumable run:
            // the sweeper can only revive a run as far as its last checkpoint.
            await saveCheckpoint("ACTIVE", loopIndex + 1);
        }

        // Falling out of the loop without a reply means the step budget ran out:
        // every other stop sets its own message and breaks.
        if (!assistantReply) {
            assistantReply = getStepBudgetStopMessage(limits.maxSteps);
            finalStepStatus = "FAILED";
        }

        stepIndex += 1;
        await ctx.runMutation(internal.agentRuns.appendStepInternal, {
            runId,
            agentId: agentId,
            companyId: companyId,
            stepIndex,
            kind: "FINAL",
            status: finalStepStatus,
            output: assistantReply,
            modelId: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
            inputTokens: inTokens,
            outputTokens: outTokens,
        });
        
        const runUsage = buildRunUsagePayload({
            inputTokens: inTokens,
            outputTokens: outTokens,
            cachedInputTokens: cachedInTokens,
            rates: config,
            model: modelConfig,
        });

        if (params.replyNotice) {
            assistantReply += params.replyNotice;
        }

        // Write response back to DB. When text was streamed the row already
        // exists, so the shared delivery closes it rather than inserting a
        // duplicate reply. The final content is authoritative: a budget stop
        // replaces whatever partial text the reader saw with the explanation
        // of why the run ended.
        await finishAssistantReply(ctx, {
            threadId,
            stream,
            content: assistantReply,
            usage: { inputTokens: inTokens, outputTokens: outTokens },
            model: modelConfig,
            evidence: messageEvidence,
            photoTurn: params.photoTurn,
        });

        await ctx.runMutation(internal.agentRuns.recordRunUsageInternal, {
            runId,
            ...runUsage,
        });

        await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
            runId,
            status: finalStepStatus,
            finalOutput: assistantReply,
        });

        // The run is over: its saved position is no longer something to resume
        // from, and leaving it would keep offering the run to the sweeper. The
        // cached prefix goes with it — nobody will read that conversation again.
        await releasePromptCache();
        await ctx.runMutation(internal.agentRunCheckpoints.clearCheckpointInternal, { runId });

        // Log Telemetry: Final Output
        // Write the explicit execution log for non-tool synthesis
        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
            agentId,
            threadId,
            interactionType: "LLM SYNTHESIS",
            promptContent: objective,
            responseContent: assistantReply,
            companyId,
            runId,
            outcome: finalStepStatus === "SUCCESS" ? "SUCCESS" : "FAILED",
        });

        if (owner.userId) {
            await ctx.runMutation(internal.agentTransactions.insertTransactionInternal, {
                agentId,
                threadId,
                userId: owner.userId,
                companyId,
                // Drills carry their flag into the ledger: the spend is real
                // and stays in cost figures, but interaction analytics must
                // not read a rehearsal as customer traffic.
                ...(isRehearsalRun ? { isRehearsal: true } : {}),
                actionContext: "Sandbox Execution",
                modelUsed: modelConfig.modelId,
                providerKey: modelConfig.providerKey,
                providerModelId: modelConfig.providerModelId,
                inputTokens: inTokens,
                outputTokens: outTokens,
                costGBP: runUsage.costGBP,
                status: finalStepStatus,
            });
        }
}

/**
 * A scheduled or manually started job, on the same engine chat uses.
 *
 * This is the whole point of the plan it belongs to. Triggered work used to go
 * through a single text generation with no tool declarations at all, so an
 * agent could read its instructions, understand exactly what was wanted, and
 * have no way to act on it. Everything it needs — tools, several steps,
 * approvals, budgets, checkpoints — already lived in the loop; it was simply
 * unreachable without a conversation.
 */
export async function runTriggeredOnAgentLoop(ctx: ActionCtx, args: {
  agentId: Id<"agents">;
  objective: string;
  triggerType: "MANUAL" | "SCHEDULE" | "WEBHOOK" | "WORKFLOW" | "EVENT";
  runId?: Id<"agentRuns">;
  workflowId?: Id<"workflows">;
  scheduleId?: Id<"schedules">;
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  rehearsal?: boolean;
}): Promise<{ output: string; runId: Id<"agentRuns"> }> {
  const stream = createModelTurnStream();
  const promptCache: { name?: string } = {};
  let execution: LoopExecutionContext | undefined;
  let runId = args.runId;

  try {
    execution = await buildLoopExecutionContext(ctx, {
      agentId: args.agentId,
      owner: { companyId: args.companyId, userId: args.userId },
    });
    const { modelConfig, limits } = execution;

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
        // The agent's real budget, not the one step the old path allowed. A
        // single step cannot call a tool and then use what came back, which is
        // most of what an agent is for.
        maxSteps: limits.maxSteps,
        ...(args.rehearsal ? { isRehearsal: true } : {}),
      });
    } else {
      await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
        runId,
        status: "RUNNING",
      });
    }

    // The objective is the only turn. There is no conversation behind a
    // scheduled job, so there is no history to carry.
    const conversationHistory: Content[] = [
      { role: "user", parts: [{ text: args.objective }] },
    ];

    await executeObjectiveLoop(ctx, {
      runId,
      agentId: args.agentId,
      objective: args.objective,
      execution,
      conversationHistory,
      stream,
      promptCache,
      state: {
        stepIndex: 0,
        loopIndex: 0,
        toolCallCount: 0,
        inTokens: 0,
        outTokens: 0,
        cachedInTokens: 0,
        segmentCount: 1,
        stablePrefixTurns: conversationHistory.length,
      },
      runStartedAt: Date.now(),
    });

    // Read back rather than tracked: the loop can hand over between action
    // segments, or park on an approval, and the run row is the only thing that
    // knows how it actually ended.
    const state = await ctx.runQuery(internal.agentRuns.getRunExecutionStateInternal, { runId });
    return { output: state?.finalOutput ?? "", runId };
  } catch (error: unknown) {
    await finalizeObjectiveFailure(ctx, {
      runId,
      agentId: args.agentId,
      objective: args.objective,
      companyId: args.companyId,
      stream,
      promptCache,
      provider: execution?.provider,
      error,
    });
    throw error;
  }
}
