export const DEFAULT_AGENT_OBJECTIVE_LIMITS = {
  maxSteps: 4,
  maxToolCalls: 3,
  maxRuntimeMs: 120000,
  maxInputTokens: 200000,
  maxOutputTokens: 20000,
  maxCostGBP: 1,
} as const;

type ToolCallStatus = "SUCCESS" | "FAILED" | "DENIED" | "CANCELLED";

export function getAgentStepStatusFromToolStatus(status: ToolCallStatus) {
  return status === "SUCCESS" ? "SUCCESS" : "FAILED";
}

export function shouldStopForToolBudget(args: {
  requestedToolCalls: number;
  completedToolCalls: number;
  maxToolCalls: number;
}) {
  return args.requestedToolCalls > 0 && args.completedToolCalls >= args.maxToolCalls;
}

export function shouldStopForRuntimeBudget(args: { elapsedMs: number; maxRuntimeMs: number }) {
  return args.elapsedMs >= args.maxRuntimeMs;
}

export function shouldStopForTokenBudget(args: {
  inputTokens: number;
  outputTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}) {
  return args.inputTokens >= args.maxInputTokens || args.outputTokens >= args.maxOutputTokens;
}

export function shouldStopForCostBudget(args: { costGBP: number; maxCostGBP: number }) {
  return args.costGBP >= args.maxCostGBP;
}

export function getToolBudgetStopMessage(maxToolCalls: number) {
  return `Agent stopped after reaching the maximum tool-call limit of ${maxToolCalls}.`;
}

export function getRuntimeBudgetStopMessage(maxRuntimeMs: number) {
  return `Agent stopped after reaching the maximum runtime limit of ${Math.round(maxRuntimeMs / 1000)} seconds.`;
}

export function getTokenBudgetStopMessage() {
  return "Agent stopped after reaching the configured token budget.";
}

export function getCostBudgetStopMessage(maxCostGBP: number) {
  return `Agent stopped after reaching the maximum cost limit of GBP ${maxCostGBP.toFixed(2)}.`;
}
