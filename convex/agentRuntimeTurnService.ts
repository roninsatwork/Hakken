import type { Doc } from "./_generated/dataModel";
import { buildToolResultPayload, type ToolSideEffectLevel } from "./aiToolExecutionService";
import { calculateModelCostGBP as calculateCostGBP } from "./aiCostService";
import { isRecord } from "./utils/lang";

/**
 * The agent runtime's pure workings: parsing a model's tool call, deciding
 * whether it needs a person, pricing a turn, and the sentences the run says
 * about approvals. Lifted from agentRuntime.ts unchanged so they can be read
 * and tested without the 900-line loop around them.
 */

export function parseToolArguments(argumentsJson: string): Record<string, unknown> {
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

export function parseToolResult(resultJson: string | undefined): unknown {
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

export function autonomyAppliesToTool(args: {
    sideEffectLevel: ToolSideEffectLevel;
    fromConnectedServer?: boolean;
    agentRunsAutonomously?: boolean;
}) {
    if (args.agentRunsAutonomously !== true) return false;
    return !(args.fromConnectedServer === true && args.sideEffectLevel !== "READ");
}


export function getToolConfirmationRequired(
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

export function calculateModelCostGBP(args: {
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


export function getApprovalRequiredMessage(toolName: string, fromConnectedServer?: boolean) {
    const destination = fromConnectedServer
        // Worth saying plainly. Everything else an agent asks to do happens
        // inside this platform; this one leaves it, carrying the workspace's
        // own credential to somebody else's system.
        ? ` That tool runs on a server this workspace has connected, so approving it sends the request outside the platform.`
        : "";
    return `Approval required before continuing. The agent requested "${toolName}", and an administrator must approve or reject that tool call.${destination}`;
}


export function getApprovedToolCompletionMessage(args: {
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


export function buildHistoricalReplaySystemPrompt(args: {
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
