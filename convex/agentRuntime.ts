"use node";

import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { AgentProviderAdapter, AgentToolDeclaration } from "./agentProviderTypes";
import { getAgentProviderAdapter } from "./agentProviderRegistry";
import { isToolVisibleToCompany } from "./mcpToolPolicy";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { v } from "convex/values";
import type { Content, FunctionDeclaration, GenerateContentConfig, Tool } from "@google/genai";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { parseDocuments } from "./utils/fileParser";
import { redactPII, DEFAULT_PII_CONFIG } from "./utils/pii";
import {
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  executeRegisteredTool,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  validateToolCallArgsAgainstSchema,
  type ToolAccessRole,
  type ToolSideEffectLevel,
} from "./aiToolExecutionService";
import { buildAgentSystemInstruction, buildUntrustedKnowledgeContext } from "./aiPromptAssembly";
import {
  createModelTurnStream,
  finishAssistantReply,
  guardModelTurn,
  runModelTurn,
  type ModelTurnStream,
} from "./modelTurnService";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { getGoogleVertexProviderModelId, GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { PHOTO_ACTION_PROPOSAL_INSTRUCTION } from "./photoActionService";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import { buildCompanyMemoryEvidence, buildCompanyRuntimeEvidence, type MessageEvidence } from "./utils/messageEvidence";
import { calculateModelCostGBP as calculateCostGBP } from "./aiCostService";
import {
  EXPLICIT_CACHE_TTL_SECONDS,
  getPromptCacheStyle,
  resolvePromptCacheSegments,
  shouldCreateExplicitCache,
} from "./promptCacheService";
import {
  AGENT_RUN_MAX_SEGMENTS,
  getCancelledRunMessage,
  isCheckpointStorable,
  isRunStopRequested,
  shouldCheckpointSegment,
  trimConversationForCheckpoint,
} from "./agentRunContinuationService";
import {
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
  buildModelStepRecord,
  buildRefusedToolCallKey,
  buildRunUsagePayload,
  buildToolDispatchLogEntry,
  classifyExecutedToolResult,
  estimateStablePrefixTokens,
  isModelCostMeasurable,
  parseAgentOutputSchema,
  parseRefusedToolCalls,
  resolveAgentObjectiveLimits,
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
import { getErrorMessage, isRecord } from "./utils/lang";


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

/**
 * Answer the model for a whole turn, or leave the run parked.
 *
 * Shared by every path that settles an approval — approved, refused, and expired —
 * because the rule is the same for all three and getting it right once matters more
 * than reading naturally three times. While anything in the batch is still waiting
 * on a person, nothing is appended: a model turn requesting N calls must be answered
 * by one turn carrying N results, and a partial answer is the fault this avoids.
 */
async function settleBatchAndContinue(ctx: ActionCtx, args: {
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
function parseToolArguments(argumentsJson: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(argumentsJson) as unknown;
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

/**
 * A stored tool result, for replaying into the transcript.
 *
 * A call with no stored result is one that never ran — it should not happen once
 * the batch is settled, so it is reported to the model as an error rather than
 * being silently omitted, which would leave the response turn short of the
 * request turn.
 */
function parseToolResult(resultJson: string | undefined): unknown {
    if (!resultJson) {
        return buildToolResultPayload({
            status: "error",
            error: "This tool call has no recorded result.",
        });
    }
    try {
        return JSON.parse(resultJson) as unknown;
    } catch {
        return buildToolResultPayload({ status: "error", error: "Tool result could not be read." });
    }
}

/**
 * Whether a tool call has to be approved by a person before it runs.
 *
 * Precedence, most decisive first:
 *
 *  1. An autonomous agent never asks. Off means off — writes, sends, external
 *     calls and deletions all run unattended.
 *  2. An agent marked as requiring human approval asks for everything, reads
 *     included.
 *  3. Otherwise anything that is not a plain read asks, and a read asks only if
 *     its tool was configured to.
 *
 * Autonomy deliberately outranks the other two rather than deferring to them. A
 * half-autonomous agent that still parks on a delete recreates the fault this
 * whole area exists to fix: someone is told the agent runs unattended, it stops
 * silently, and nobody is watching the queue. Safety for an autonomous agent
 * lives in which tools it was given and what it is allowed to spend, both of
 * which a person can see.
 *
 * The `humanApprovalRequired` flag was stored on the record and offered in the
 * admin UI but never read here, so switching it on changed nothing. A control
 * that appears to restrict an agent and does not is worse than no control.
 */
/**
 * Whether an agent's autonomy applies to this particular tool.
 *
 * **The one thing autonomy does not buy** (tool-server plan, phase 6).
 *
 * The argument above holds because an autonomous agent's tools were chosen by
 * somebody accountable *and the tools themselves are ours*. A tool on a
 * connected server is neither: it was written by a third party, and that party
 * can change what it does tomorrow without its name or its description
 * changing. "Look at which tools it was given" stops being a way to see the
 * consequences.
 *
 * So a tool on somebody else's server that is not a plain read always asks,
 * whatever the agent's autonomy says. Reads are untouched — looking things up
 * unattended is most of what an autonomous agent is for, and a read cannot
 * change anything.
 *
 * **This is the only place that decides it.** Two functions used to: this one,
 * and `canExecuteTool`, which re-derived the requirement and was handed the raw
 * autonomy flag to stop it overruling the first. Two answers to one question is
 * the fault, not the fix — so the answer is computed here and both are given it.
 */
function autonomyAppliesToTool(args: {
    sideEffectLevel: ToolSideEffectLevel;
    fromConnectedServer?: boolean;
    agentRunsAutonomously?: boolean;
}) {
    if (args.agentRunsAutonomously !== true) return false;
    return !(args.fromConnectedServer === true && args.sideEffectLevel !== "READ");
}

function getToolConfirmationRequired(
    sideEffectLevel: ToolSideEffectLevel,
    configured?: boolean,
    agentRequiresApproval?: boolean,
    agentRunsAutonomously?: boolean,
    fromConnectedServer?: boolean,
) {
    if (autonomyAppliesToTool({ sideEffectLevel, fromConnectedServer, agentRunsAutonomously })) {
        return false;
    }
    if (agentRequiresApproval === true) return true;
    return sideEffectLevel === "READ" ? (configured ?? false) : true;
}

/**
 * Cost of the model usage so far.
 *
 * Thin wrapper over the shared calculator, kept so the existing call sites read
 * unchanged. `cachedInputTokens` is the part of the input the provider served
 * from a cache; it is priced separately, which is the point of caching at all.
 */
function calculateModelCostGBP(args: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    config?: Doc<"aiModels">;
}) {
    return calculateCostGBP({
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        cachedInputTokens: args.cachedInputTokens,
        rates: args.config,
    });
}

function getApprovalRequiredMessage(toolName: string, fromConnectedServer?: boolean) {
    const destination = fromConnectedServer
        // Worth saying plainly. Everything else an agent asks to do happens
        // inside this platform; this one leaves it, carrying the workspace's
        // own credential to somebody else's system.
        ? ` That tool runs on a server this workspace has connected, so approving it sends the request outside the platform.`
        : "";
    return `Approval required before continuing. The agent requested "${toolName}", and an administrator must approve or reject that tool call.${destination}`;
}

function getApprovedToolCompletionMessage(args: {
    handlerMapping: string;
    normalizedToolName: string;
    result: unknown;
}) {
    if (args.handlerMapping === "company.overview.update" && isRecord(args.result)) {
        return args.result.changed === false
            ? "Approved company overview update completed with no changes."
            : "Approved company overview update completed.";
    }

    return `Approved tool call completed: ${args.normalizedToolName}.`;
}

function buildHistoricalReplaySystemPrompt(args: {
    systemPrompt: string | null | undefined;
    rules: Array<{ name?: string; trigger?: string; instruction: string; priority?: number }>;
    skills?: Array<{ name: string; instruction: string; category?: string; riskLevel?: string }>;
}) {
    const configuredPrompt = args.systemPrompt || "";
    const skillInstruction = args.skills && args.skills.length > 0
        ? "\n\n====================\nHISTORICAL ENABLED AGENT SKILLS FROM THE REPLAYED VERSION SNAPSHOT:\n\n" + args.skills
            .map((skill) => {
                const metadata = [
                    skill.category ? `CATEGORY: ${skill.category}` : undefined,
                    skill.riskLevel ? `RISK: ${skill.riskLevel}` : undefined,
                ].filter(Boolean).join("\n");
                return `[SKILL: ${skill.name}]\n${metadata ? `${metadata}\n` : ""}${skill.instruction}`;
            })
            .join("\n\n---\n\n")
        : "";
    if (args.rules.length === 0) return `${configuredPrompt}${skillInstruction}`;

    const compiledRules = args.rules
        .map((rule) => {
            const label = rule.name ? `RULE: ${rule.name}` : "RULE";
            const priority = rule.priority !== undefined ? `PRIORITY: ${rule.priority}` : "PRIORITY: historical";
            const trigger = rule.trigger ? `WHEN: ${rule.trigger}` : "WHEN: historical replay context applies";
            return `[${label}]\n[${priority}]\n${trigger}\nTHEN: ${rule.instruction}`;
        })
        .join("\n\n---\n\n");

    return `${configuredPrompt}${skillInstruction}\n\n====================\nHISTORICAL ACTIVE AGENT RULES FROM THE REPLAYED VERSION SNAPSHOT:\n\n${compiledRules}`;
}

/**
 * Counters that must survive a handover between action segments.
 *
 * Every budget is enforced against the whole run, not against the segment that
 * happens to be executing, so these are carried in the checkpoint rather than
 * being recomputed. A run that resets its tool count on resumption would have no
 * effective tool limit at all.
 */
type ObjectiveLoopState = {
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
type RunOwner = { companyId?: Id<"companies">; userId?: Id<"users"> };

async function buildLoopExecutionContext(ctx: ActionCtx, args: {
  agentId: Id<"agents">;
  /** Present when the run came from a conversation. Absent for scheduled work. */
  threadId?: Id<"threads">;
  /** Required when there is no conversation to read the owner from. */
  owner?: RunOwner;
}) {
  const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
  if (!agent) throw new Error("Agent not found.");

  const thread = args.threadId
    ? await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId })
    : null;
  if (args.threadId && !thread) throw new Error("Thread context missing");

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

type LoopExecutionContext = Awaited<ReturnType<typeof buildLoopExecutionContext>>;

/**
 * Close out a run that failed with an unhandled exception.
 *
 * Shared by the initial action and every continuation, because a run can die in
 * any segment and the reader must get the same treatment wherever it happened.
 */
async function finalizeObjectiveFailure(ctx: ActionCtx, args: {
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
    const safetyDecision = await guardModelTurn(ctx, {
        content: args.content,
        refusal: { threadId: args.threadId, source: "agent" },
        platformName: (await ctx.runQuery(internal.settings.getEmailBranding, {})).platformName,
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

        // Map Sonae generic messages into expected Vertex AI Content arrays
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
        throw new Error("Agent run exceeded the maximum number of continuation segments.");
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
        throw new Error("Agent run checkpoint holds no usable conversation transcript.");
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

/**
 * The bounded objective loop: model turn, tool calls, repeat until an answer or
 * a budget stops it.
 *
 * Extracted from the action that used to own it so a continuation can enter the
 * same loop mid-run. Everything that varies between a fresh start and a
 * resumption arrives in `state` and `conversationHistory`; the loop itself does
 * not know or care which it is.
 */
async function executeObjectiveLoop(ctx: ActionCtx, params: {
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    /**
     * The conversation to stream the reply into, when there is one.
     *
     * Absent for scheduled and manually started work. The loop then does its
     * job silently rather than posting into somebody's chat history — a
     * scheduled run appearing in Ask Sonae would read as though the agent had
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
async function runTriggeredOnAgentLoop(ctx: ActionCtx, args: {
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
      if (!agent) throw new Error("Agent not found.");
      if (agent.isActive === false) throw new Error("Agent is inactive.");

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
        ctx.runQuery(internal.agentMemories.getAlwaysMemoriesInternal, { agentId: args.agentId }),
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
      const costGBP = calculateModelCostGBP({
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
        costGBP,
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
        costGBP,
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
      throw new Error("Approval resume context not found.");
    }
    if (context.approval.status !== "APPROVED") {
      throw new Error("Approval has not been approved.");
    }
    if (context.toolCall.status !== "PENDING") {
      throw new Error("Approved tool call is not pending execution.");
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
    if (!agent) throw new Error("Agent not found.");

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
