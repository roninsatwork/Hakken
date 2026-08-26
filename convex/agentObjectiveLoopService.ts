"use node";

import type { ActionCtx } from "./_generated/server";
import type { AgentProviderAdapter, AgentToolDeclaration } from "./agentProviderTypes";
import { getAgentProviderAdapter } from "./agentProviderRegistry";
import { isToolVisibleToCompany } from "./mcpToolPolicy";
import type { Content, FunctionDeclaration, Tool } from "./utils/providerContentTypes";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

import {
  buildProviderToolDeclaration,
  normalizeAiRuntimeError,
  type ToolAccessRole,
  type ToolSideEffectLevel,
} from "./aiToolExecutionService";
import { buildAgentSystemInstruction } from "./aiPromptAssembly";
import {
  finishAssistantReply,
  type ModelTurnStream,
} from "./modelTurnService";

import {
  isCheckpointStorable,
  trimConversationForCheckpoint,
} from "./agentRunContinuationService";
import {
  isModelCostMeasurable,
  resolveAgentObjectiveLimits,
  buildToolInteractionTurns,
} from "./agentRuntimeService";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";
import {
  getToolConfirmationRequired,
  parseToolArguments,
  parseToolResult,
} from "./agentRuntimeTurnService";

/**
 * Everything around one objective run that is not the run itself.
 *
 * Setting a run up, settling a batch of parallel tool calls once every
 * approval in it has been answered, and closing a run out when it fails. All
 * three are called from `agentRuntime.ts` as well as from the loop, all three
 * are separable, and keeping them beside a nine-hundred-line loop function
 * only made that function harder to find. Registers no Convex functions.
 */

type RuntimeToolMetadata = {
    toolId: Id<"aiTools">;
    requiredRole: ToolAccessRole;
    handlerMapping: string;
    inputSchema?: string;
    sideEffectLevel: ToolSideEffectLevel;
    confirmationRequired: boolean;
    /**
     * Whether this tool lives on a server the workspace connected.
     *
     * Carried so the person asked to approve a call is told it leaves the
     * platform, and so autonomy cannot wave through a third party's write.
     */
    fromConnectedServer?: boolean;
};

type BatchSettlement = {
    settled: boolean;
    stepIndex: number;
    batchCalls: Array<{ name: string; argumentsJson: string; resultJson?: string; thoughtSignature?: string }>;
};

export async function settleBatchAndContinue(ctx: ActionCtx, args: {
    approvalId: Id<"agentRunApprovals">;
    runId: Id<"agentRuns">;
    settlement: BatchSettlement;
    status: "SUCCESS" | "FAILED";
    finalOutput: string;
    error?: string;
}) {
    if (!args.settlement.settled) return;

    // Put the whole turn into the conversation the model is having, then let the
    // loop carry on. Without this the agent asked permission, watched the tool
    // run, and never found out what it returned.
    const checkpoint = await ctx.runQuery(internal.agentRunCheckpoints.getCheckpointInternal, {
        runId: args.runId,
    });

    if (checkpoint?.status === "AWAITING_APPROVAL" && checkpoint.threadId) {
        let transcript: Content[] | undefined;
        try {
            const parsed = JSON.parse(checkpoint.transcriptJson) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) transcript = parsed as Content[];
        } catch {
            transcript = undefined;
        }

        if (transcript) {
            // One model turn declaring every call of that turn, one function turn
            // answering all of them, in the order the model asked. Built from the
            // tool call rows rather than from this one approval, because the calls
            // that ran without needing approval have been waiting on their rows
            // since the run parked.
            const batchTurns = buildToolInteractionTurns(args.settlement.batchCalls.map((call) => ({
                name: call.name,
                args: parseToolArguments(call.argumentsJson),
                responsePayload: parseToolResult(call.resultJson),
                thoughtSignature: call.thoughtSignature,
            })));
            transcript.push(...batchTurns as Content[]);

            const { serialized } = trimConversationForCheckpoint(transcript);
            if (isCheckpointStorable(serialized)) {
                const resumed = await ctx.runMutation(internal.agentRunApprovals.continueRunAfterApprovalInternal, {
                    approvalId: args.approvalId,
                    transcriptJson: serialized,
                    stepIndex: args.settlement.stepIndex,
                });
                if (resumed) return;
            }
        }
    }

    // No transcript to resume into — a triggered run with no chat thread, or a
    // conversation too large to have been checkpointed. Conclude the run and
    // report the outcome rather than leaving it open.
    const completion = await ctx.runMutation(internal.agentRunApprovals.completeApprovalResumeInternal, {
        approvalId: args.approvalId,
        status: args.status,
        finalOutput: args.finalOutput,
        error: args.error,
    });

    if (completion.threadId) {
        await ctx.runMutation(internal.chat.saveAssistantMessage, {
            threadId: completion.threadId,
            content: completion.finalOutput,
        });
    }
}

/**
 * A stored tool call's arguments, as the provider expects them.
 *
 * Anything that is not a JSON object degrades to `{}` rather than failing the
 * resume: a call whose arguments cannot be read still has to be answered, or the
 * model is left with a request and no response.
 */

/**
 * Counters that must survive a handover between action segments.
 *
 * Every budget is enforced against the whole run, not against the segment that
 * happens to be executing, so these are carried in the checkpoint rather than
 * being recomputed. A run that resets its tool count on resumption would have no
 * effective tool limit at all.
 */
export type ObjectiveLoopState = {
  stepIndex: number;
  loopIndex: number;
  toolCallCount: number;
  inTokens: number;
  outTokens: number;
  /** The share of `inTokens` the provider served from cache, priced separately. */
  cachedInTokens: number;
  segmentCount: number;
  /**
   * How many leading turns form the prompt prefix that never changes for the
   * rest of the run. Zero disables caching for this run, which is what a trimmed
   * transcript falls back to.
   */
  stablePrefixTurns: number;
  /** Provider-side cache object holding that prefix, once one has been created. */
  promptCacheName?: string;
};

/**
 * Rebuild everything the objective loop needs that is derived from the database.
 *
 * Deliberately excludes the transcript. Retrieval, memory lookup and document
 * parsing are expensive and non-deterministic, and their results are already
 * baked into the stored conversation — so a continuation reloads the agent's
 * configuration but never redoes its research. Repeating it would pay for the
 * same embeddings twice and could ground the second half of a run in different
 * knowledge from the first.
 */
/**
 * Who a piece of work belongs to.
 *
 * The loop used to read this off the conversation, which quietly made a
 * conversation a precondition for running an agent at all — and that is the
 * reason scheduled and manually started runs went down a separate, cut-down
 * path that could not use tools. A run needs to know the company and the
 * person; it does not need somebody to have been typing.
 */
export type RunOwner = { companyId?: Id<"companies">; userId?: Id<"users"> };

export async function buildLoopExecutionContext(ctx: ActionCtx, args: {
  agentId: Id<"agents">;
  /** Present when the run came from a conversation. Absent for scheduled work. */
  threadId?: Id<"threads">;
  /** Required when there is no conversation to read the owner from. */
  owner?: RunOwner;
}) {
  const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
  if (!agent) throw appError("NOT_FOUND", "Agent not found.");

  const thread = args.threadId
    ? await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId })
    : null;
  if (args.threadId && !thread) throw appError("NOT_FOUND", "Thread context missing");

  const owner: RunOwner = thread
    ? { companyId: thread.companyId, userId: thread.userId }
    : args.owner ?? {};

  const runtimeSkills = await ctx.runQuery(internal.agentSkills.getRuntimeSkillsInternal, {
    agentId: args.agentId,
    companyId: owner.companyId,
  });

  const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
    companyId: owner.companyId,
    useCase: "agent",
  });
  const agentTools = await ctx.runQuery(internal.agents.getAgentToolsInternal, { agentId: args.agentId });
  const dynamicTools: FunctionDeclaration[] = [];
  const toolMetadataByName = new Map<string, RuntimeToolMetadata>();

  for (const junction of agentTools) {
    const toolDef = await ctx.runQuery(internal.aiTools.getToolInternal, { id: junction.toolId });
    if (toolDef?.isActive === false) continue;
    // Agents are global; tools are not always. A tool that arrived from a
    // company's own connected server is reached with that company's credential,
    // so a shared agent running for anyone else must not be offered it — even if
    // a binding exists. This is the boundary, and it is here rather than at the
    // binding screen because this is the last place before a model sees the tool.
    if (toolDef && !isToolVisibleToCompany(toolDef, owner.companyId)) continue;
    const schemaStr = toolDef && "inputSchema" in toolDef && typeof toolDef.inputSchema === "string"
      ? toolDef.inputSchema
      : undefined;
    if (toolDef && schemaStr) {
      try {
        const declaration = buildProviderToolDeclaration({
          name: toolDef.name,
          description: toolDef.description,
          modelName: toolDef.modelName,
          handlerMapping: toolDef.handlerMapping,
          requiredRole: toolDef.requiredRole,
          inputSchema: schemaStr,
        });
        dynamicTools.push(declaration as FunctionDeclaration);
        const sideEffectLevel = (toolDef.sideEffectLevel || "READ") as ToolSideEffectLevel;
        toolMetadataByName.set(declaration.name, {
          toolId: toolDef._id,
          requiredRole: toolDef.requiredRole,
          handlerMapping: toolDef.handlerMapping,
          inputSchema: schemaStr,
          sideEffectLevel,
          confirmationRequired: getToolConfirmationRequired(
            sideEffectLevel,
            toolDef.confirmationRequired,
            agent.humanApprovalRequired,
            agent.autonomousToolExecution,
            Boolean(toolDef.mcpServerId),
          ),
          fromConnectedServer: Boolean(toolDef.mcpServerId),
        });
      } catch (error) {
        console.error("Failed to parse tool schema for:", toolDef.name, getErrorMessage(error, "Unknown Engine Exception"));
      }
    }
  }

  // The agent's own always-on memories, plus the company's. The company's were
  // read nowhere on this path, so giving a company a memory did nothing on any
  // widget with an agent attached.
  const [agentAlwaysMemories, companyAlwaysMemories, emailBranding] = await Promise.all([
    ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, { agentId: args.agentId }),
    owner.companyId
      ? ctx.runQuery(internal.companyMemories.getAlwaysMemoriesInternal, { companyId: owner.companyId })
      : Promise.resolve([]),
    // The deployment's configured name: an agent with no prompt of its own
    // introduces itself as this platform's agent, not the shipped default's.
    ctx.runQuery(internal.settings.getEmailBranding, {}),
  ]);
  const alwaysMemories = [
    ...companyAlwaysMemories.map((memory) => ({ title: memory.title, content: memory.content })),
    ...agentAlwaysMemories.map((memory) => ({ title: memory.title, content: memory.content })),
  ];

  const systemInstruction = buildAgentSystemInstruction(
    agent.systemPrompt,
    runtimeSkills,
    alwaysMemories,
    emailBranding.platformName
  );
  // Deterministic logic routing.
  const temperature = 0.1;

  // Neutral declarations: the adapter converts them to its provider's shape.
  // Kept separately from any provider config because a prompt cache must be
  // built from exactly the same declarations the request offers.
  const toolDeclarations: AgentToolDeclaration[] = dynamicTools.map((tool) => ({
    name: tool.name ?? "",
    description: tool.description ?? "",
    parametersJsonSchema: tool.parametersJsonSchema as Record<string, unknown> | undefined,
  }));
  const providerTools: Tool[] | undefined = dynamicTools.length > 0
    ? [{ functionDeclarations: dynamicTools }]
    : undefined;

  // Fails here, naming the model, rather than deep inside a provider call.
  const provider = getAgentProviderAdapter(modelConfig.providerKey);

  // One indexed lookup. This used to read the whole catalogue and build a Map
  // to find a single row, on every context build.
  // `?? undefined` because the rest of the runtime treats "no record" as
  // undefined; a query cannot return undefined, so it answers with null.
  const modelDoc = await ctx.runQuery(internal.aiModels.getModelByIdInternal, {
    modelId: modelConfig.modelId,
  }) ?? undefined;

  // Per-agent budget, clamped to the platform ceilings. When the model has no
  // pricing configured the cost ceiling can never fire, so the conservative
  // step/tool budget applies instead — those counts are then the only thing
  // bounding spend. See resolveAgentObjectiveLimits.
  const limits = resolveAgentObjectiveLimits(agent, {
    costMeasurable: isModelCostMeasurable(modelDoc),
  });

  return {
    agent, thread, owner, runtimeSkills, modelConfig, provider,
    systemInstruction, temperature, toolDeclarations, providerTools,
    toolMetadataByName, modelDoc, limits,
  };
}

export type LoopExecutionContext = Awaited<ReturnType<typeof buildLoopExecutionContext>>;

/**
 * Close out a run that failed with an unhandled exception.
 *
 * Shared by the initial action and every continuation, because a run can die in
 * any segment and the reader must get the same treatment wherever it happened.
 */
export async function finalizeObjectiveFailure(ctx: ActionCtx, args: {
  runId: Id<"agentRuns"> | undefined;
  /** Absent for work nobody is watching, which has no message to close. */
  threadId?: Id<"threads">;
  agentId: Id<"agents">;
  objective: string;
  companyId?: Id<"companies">;
  stream: ModelTurnStream;
  promptCache?: { name?: string };
  provider?: AgentProviderAdapter;
  error: unknown;
}) {
  console.error("Agent Engine Error:", args.error);
  const errorMessage = normalizeAiRuntimeError(args.error, "Agent execution failed.").error;

  // The run is over, so the prefix it cached is storage nobody will read. The
  // cache carries a TTL, so a failure to release it expires rather than leaks.
  if (args.promptCache?.name && args.provider) {
    const name = args.promptCache.name;
    args.promptCache.name = undefined;
    await args.provider.releasePromptCache?.(name);
  }

  await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
    agentId: args.agentId,
    threadId: args.threadId,
    interactionType: "ERROR",
    promptContent: args.objective,
    responseContent: errorMessage,
    companyId: args.companyId,
    runId: args.runId,
    outcome: "FAILED",
  });

  if (args.runId) {
    await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
      runId: args.runId,
      status: "FAILED",
      error: errorMessage,
    });
    // The run is over, so its saved position is no longer something to resume
    // from. Left behind, the sweeper would keep finding it.
    await ctx.runMutation(internal.agentRunCheckpoints.clearCheckpointInternal, { runId: args.runId });
  }

  const failureMessage = "Agent Execution Offline: Encountered an unhandled exception in the function calling runtime.";

  // If text was already streaming, close that row instead of adding a second
  // message: the reader would otherwise be left with a half-written answer
  // marked as still typing, plus an error underneath it. The shared delivery
  // makes that choice, and writes nothing for work nobody is watching.
  await finishAssistantReply(ctx, {
    threadId: args.threadId,
    stream: args.stream,
    content: failureMessage,
  });
}

/**
 * The bounded objective loop: model turn, tool calls, repeat until an answer or
 * a budget stops it.
 *
 * Extracted from the action that used to own it so a continuation can enter the
 * same loop mid-run. Everything that varies between a fresh start and a
 * resumption arrives in `state` and `conversationHistory`; the loop itself does
 * not know or care which it is.
 */
