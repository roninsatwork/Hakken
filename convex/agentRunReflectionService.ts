/**
 * The reflection pass: read what a failed or cancelled run left behind and
 * write one structured account of why it went wrong, with proposals attached.
 *
 * Extracted from the admin mutation so the same classification runs whether a
 * person pressed the button on the run screen or the run just finished badly
 * with nobody watching (self-improvement plan, Phase 1). Deliberately
 * deterministic — no model call — so reflecting on every failure costs
 * nothing and cannot itself fail for provider reasons.
 *
 * `actorId` is set only when a person asked. The automatic pass writes no
 * per-candidate audit actor, matching the platform rule that the trail never
 * names an admin who was not involved.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const REFLECTION_DETAIL_LIMIT = 200;
const REFLECTION_TEXT_LIMIT = 1200;

export type ReflectionCategory =
  | "MISSING_CONTEXT"
  | "BAD_TOOL_PLAN"
  | "BAD_TOOL_ARGUMENTS"
  | "TOOL_FAILURE"
  | "PROVIDER_FAILURE"
  | "POLICY_BLOCKED"
  | "APPROVAL_REJECTED"
  | "TENANT_SCOPE_BLOCKED"
  | "PROMPT_INJECTION_BLOCKED"
  | "USER_CANCELLED"
  | "UNKNOWN";

function truncateText(value: string, limit = REFLECTION_TEXT_LIMIT) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function includesAny(value: string | undefined, needles: string[]) {
  const lower = (value || "").toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function getFailedStep(steps: Doc<"agentRunSteps">[]) {
  return steps.find((step) => step.status === "FAILED") || steps.at(-1);
}

function getRelevantToolCall(toolCalls: Doc<"agentToolCalls">[]) {
  return toolCalls.find((toolCall) => toolCall.status === "FAILED")
    // A missing connector is the most actionable thing a reflection can surface:
    // it points at a capability gap rather than at the agent's reasoning, and
    // no amount of prompt tuning will fix it.
    || toolCalls.find((toolCall) => toolCall.status === "NOT_IMPLEMENTED")
    || toolCalls.find((toolCall) => toolCall.status === "DENIED")
    || toolCalls.find((toolCall) => toolCall.status === "CANCELLED")
    || toolCalls.find((toolCall) => toolCall.status === "APPROVAL_REQUIRED");
}

function classifyReflection(args: {
  run: Doc<"agentRuns">;
  steps: Doc<"agentRunSteps">[];
  toolCalls: Doc<"agentToolCalls">[];
  approvals: Doc<"agentRunApprovals">[];
  feedback: Doc<"agentRunFeedback">[];
}): ReflectionCategory {
  const combinedError = [
    args.run.error,
    args.run.finalOutput,
    ...args.steps.map((step) => step.error || step.output),
    ...args.toolCalls.map((toolCall) => toolCall.error),
    ...args.approvals.map((approval) => approval.decisionReason),
    ...args.feedback.flatMap((entry) => [entry.comment, ...entry.labels]),
  ].filter(Boolean).join(" ");

  if (args.run.status === "CANCELLED") return "USER_CANCELLED";
  if (args.approvals.some((approval) => approval.status === "REJECTED")) return "APPROVAL_REJECTED";
  if (args.toolCalls.some((toolCall) => toolCall.status === "DENIED")) return "POLICY_BLOCKED";
  if (includesAny(combinedError, ["tenant", "unauthorized", "scope", "foreign company", "cross-tenant"])) {
    return "TENANT_SCOPE_BLOCKED";
  }
  if (includesAny(combinedError, ["prompt injection", "jailbreak", "hidden prompt", "system instruction"])) {
    return "PROMPT_INJECTION_BLOCKED";
  }
  if (includesAny(combinedError, ["schema", "validation", "argument", "args", "json"])) {
    return "BAD_TOOL_ARGUMENTS";
  }
  if (args.toolCalls.some((toolCall) => toolCall.status === "FAILED")) return "TOOL_FAILURE";
  if (includesAny(combinedError, ["provider", "vertex", "model", "rate limit", "quota", "timeout"])) {
    return "PROVIDER_FAILURE";
  }
  if (args.feedback.some((entry) => entry.labels.includes("MISSED_CONTEXT"))) return "MISSING_CONTEXT";
  if (args.feedback.some((entry) => entry.labels.includes("WRONG_TOOL"))) return "BAD_TOOL_PLAN";

  return "UNKNOWN";
}

function buildReflectionText(args: {
  category: ReflectionCategory;
  run: Doc<"agentRuns">;
  failedStep?: Doc<"agentRunSteps">;
  toolCall?: Doc<"agentToolCalls">;
}) {
  const handler = args.toolCall?.handlerMapping || args.toolCall?.normalizedToolName;
  if (args.category === "USER_CANCELLED") {
    return "The run was cancelled before completion. Review whether the trigger duplicated work, waited too long for approval, or no longer matched the operator's intent.";
  }
  if (args.category === "APPROVAL_REJECTED") {
    return "A proposed action was rejected by an operator. Review the proposed tool arguments and approval rationale before allowing similar actions.";
  }
  if (args.category === "BAD_TOOL_ARGUMENTS") {
    return handler
      ? `Tool arguments for ${handler} appear to have failed validation or did not match the expected schema.`
      : "A tool call appears to have failed because the generated arguments did not match the expected schema.";
  }
  if (args.category === "TOOL_FAILURE") {
    return handler
      ? `The ${handler} tool failed during execution. Check the handler result, input arguments, and target object state.`
      : "A tool failed during execution. Check the handler result, input arguments, and target object state.";
  }
  if (args.category === "TENANT_SCOPE_BLOCKED") {
    return "The run hit a tenant-scope or authorization boundary. Preserve the block and inspect the objective/tool arguments for cross-tenant assumptions.";
  }
  if (args.category === "PROMPT_INJECTION_BLOCKED") {
    return "The run appears to have encountered prompt-injection or hidden-instruction content. Preserve the refusal and convert the case into an evaluator fixture.";
  }
  if (args.category === "PROVIDER_FAILURE") {
    return "The model provider or runtime failed before the agent could complete. Replay after provider health is stable and compare outputs.";
  }
  if (args.category === "MISSING_CONTEXT") {
    return "Feedback or trace evidence suggests the agent lacked required context. Identify the missing source before adding memory.";
  }
  if (args.category === "BAD_TOOL_PLAN") {
    return "Feedback or trace evidence suggests the agent chose the wrong tool or sequence. Review tool descriptions and planning instructions.";
  }

  const source = args.run.error || args.failedStep?.error || args.run.finalOutput || "No specific failure signal was recorded.";
  return truncateText(source, 500);
}

function buildProposals(args: {
  category: ReflectionCategory;
  run: Doc<"agentRuns">;
  toolCall?: Doc<"agentToolCalls">;
}) {
  if (args.category === "MISSING_CONTEXT") {
    return {
      missingContext: "Identify the tenant-approved source that should have been retrieved before this run.",
      proposedMemory: `Candidate memory should capture the missing operating context for: ${truncateText(args.run.objective, 220)}`,
      proposedEvalFixture: "Create an eval that verifies the agent retrieves the missing context before answering.",
    };
  }
  if (args.category === "BAD_TOOL_ARGUMENTS") {
    return {
      proposedToolChange: args.toolCall
        ? `Review the input schema and description for ${args.toolCall.handlerMapping}; add examples or stricter enum constraints if needed.`
        : "Review the tool schema and add clearer argument examples.",
      proposedEvalFixture: "Create an eval that expects valid tool arguments for this objective.",
    };
  }
  if (args.category === "APPROVAL_REJECTED") {
    return {
      proposedPromptChange: "Clarify when the agent should ask for this action and what rationale must be shown to approvers.",
      proposedEvalFixture: "Create an eval that verifies the action pauses for approval and includes enough operator context.",
    };
  }
  if (args.category === "PROMPT_INJECTION_BLOCKED" || args.category === "TENANT_SCOPE_BLOCKED") {
    return {
      proposedEvalFixture: "Create a safety eval that preserves the block and verifies no unsafe content is retained as memory.",
    };
  }
  if (args.category === "BAD_TOOL_PLAN") {
    return {
      proposedPromptChange: "Clarify tool-selection order and decision criteria for this objective type.",
      proposedEvalFixture: "Create an eval that checks the expected tool plan.",
    };
  }
  if (args.category === "USER_CANCELLED") {
    return {
      proposedPromptChange: "Review trigger configuration and objective wording if cancellations repeat for this run type.",
    };
  }

  return {
    proposedEvalFixture: "Create a regression fixture if this failure should not recur.",
  };
}

function getConfidence(category: ReflectionCategory) {
  if (category === "UNKNOWN") return 0.35;
  if (category === "PROVIDER_FAILURE") return 0.65;
  if (category === "MISSING_CONTEXT" || category === "BAD_TOOL_PLAN") return 0.7;
  return 0.85;
}

export type ReflectRunResult =
  | { outcome: "missing" }
  | { outcome: "not-eligible"; status: Doc<"agentRuns">["status"] }
  | { outcome: "written"; reflectionId: Id<"agentRunReflections"> };

/**
 * Classify one run and upsert its reflection. One reflection per run: a
 * second call — button after scheduler, retry after crash — patches the
 * existing row rather than stacking duplicates.
 *
 * Tolerant by design (returns instead of throwing) because the scheduled
 * caller runs after runs that may since have been deleted or re-driven; the
 * admin mutation turns the non-written outcomes back into its historical
 * errors so the button behaves exactly as before.
 */
export async function reflectRun(ctx: MutationCtx, args: {
  runId: Id<"agentRuns">;
  actorId?: Id<"users">;
}): Promise<ReflectRunResult> {
  const run = await ctx.db.get(args.runId);
  if (!run) return { outcome: "missing" };
  if (run.status !== "FAILED" && run.status !== "CANCELLED") {
    return { outcome: "not-eligible", status: run.status };
  }

  const [steps, toolCalls, approvals, feedback] = await Promise.all([
    ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_step", (q) => q.eq("runId", args.runId))
      .order("asc")
      .take(REFLECTION_DETAIL_LIMIT),
    ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
      .order("asc")
      .take(REFLECTION_DETAIL_LIMIT),
    ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", args.runId))
      .order("asc")
      .take(REFLECTION_DETAIL_LIMIT),
    ctx.db
      .query("agentRunFeedback")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .order("asc")
      .take(REFLECTION_DETAIL_LIMIT),
  ]);

  const failedStep = getFailedStep(steps);
  const toolCall = getRelevantToolCall(toolCalls);
  const approval = approvals.find((entry) => entry.status === "REJECTED" || entry.status === "CANCELLED")
    || approvals.find((entry) => entry.status === "PENDING");
  const category = classifyReflection({ run, steps, toolCalls, approvals, feedback });
  const rootCause = buildReflectionText({ category, run, failedStep, toolCall });
  const proposals = buildProposals({ category, run, toolCall });
  const now = Date.now();
  const evidenceJson = JSON.stringify({
    runId: args.runId,
    sourceStatus: run.status,
    runError: run.error,
    finalOutput: run.finalOutput,
    failedStepId: failedStep?._id,
    failedStepIndex: failedStep?.stepIndex,
    failedStepKind: failedStep?.kind,
    toolCallId: toolCall?._id,
    toolHandler: toolCall?.handlerMapping,
    toolStatus: toolCall?.status,
    toolError: toolCall?.error,
    approvalId: approval?._id,
    approvalStatus: approval?.status,
    approvalReason: approval?.decisionReason,
    feedback: feedback.map((entry) => ({
      id: entry._id,
      rating: entry.rating,
      labels: entry.labels,
    })),
  });

  const existing = await ctx.db
    .query("agentRunReflections")
    .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
    .order("desc")
    .first();

  const payload = {
    category,
    sourceStatus: run.status,
    objectiveSummary: truncateText(run.objective, 500),
    failureStepIndex: failedStep?.stepIndex,
    failureStepKind: failedStep?.kind,
    toolCallId: toolCall?._id,
    approvalId: approval?._id,
    rootCause,
    missingContext: proposals.missingContext,
    proposedMemory: proposals.proposedMemory,
    proposedPromptChange: proposals.proposedPromptChange,
    proposedToolChange: proposals.proposedToolChange,
    proposedEvalFixture: proposals.proposedEvalFixture,
    confidence: getConfidence(category),
    evidenceJson,
    status: "GENERATED" as const,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    await ctx.db.insert("auditLogs", {
      ...(args.actorId ? { actorId: args.actorId } : {}),
      actionType: "UPDATE_AGENT_RUN_REFLECTION",
      entityId: existing._id,
      entityType: "agentRunReflections",
      companyId: run.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: args.runId,
        category,
        automatic: !args.actorId,
      }),
    });
    return { outcome: "written", reflectionId: existing._id };
  }

  const reflectionId = await ctx.db.insert("agentRunReflections", {
    runId: args.runId,
    agentId: run.agentId,
    companyId: run.companyId,
    ...(args.actorId ? { createdBy: args.actorId } : {}),
    createdAt: now,
    ...payload,
  });
  await ctx.db.insert("auditLogs", {
    ...(args.actorId ? { actorId: args.actorId } : {}),
    actionType: "CREATE_AGENT_RUN_REFLECTION",
    entityId: reflectionId,
    entityType: "agentRunReflections",
    companyId: run.companyId,
    timestamp: now,
    metadata: JSON.stringify({
      runId: args.runId,
      category,
      automatic: !args.actorId,
    }),
  });

  return { outcome: "written", reflectionId };
}
