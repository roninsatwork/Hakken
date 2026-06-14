import { describe, expect, test } from "vitest";
import {
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
  getAgentStepStatusFromToolStatus,
  getCostBudgetStopMessage,
  getRuntimeBudgetStopMessage,
  getTokenBudgetStopMessage,
  getToolBudgetStopMessage,
  shouldStopForCostBudget,
  shouldStopForRuntimeBudget,
  shouldStopForTokenBudget,
  shouldStopForToolBudget,
} from "./agentRuntimeService";

describe("agentRuntimeService", () => {
  test("exposes conservative default loop budgets", () => {
    expect(DEFAULT_AGENT_OBJECTIVE_LIMITS).toEqual({
      maxSteps: 4,
      maxToolCalls: 3,
      maxRuntimeMs: 120000,
      maxInputTokens: 200000,
      maxOutputTokens: 20000,
      maxCostGBP: 1,
    });
  });

  test("maps tool execution outcomes onto persisted step status", () => {
    expect(getAgentStepStatusFromToolStatus("SUCCESS")).toBe("SUCCESS");
    expect(getAgentStepStatusFromToolStatus("FAILED")).toBe("FAILED");
    expect(getAgentStepStatusFromToolStatus("DENIED")).toBe("FAILED");
    expect(getAgentStepStatusFromToolStatus("CANCELLED")).toBe("FAILED");
  });

  test("stops only when the model requests another tool after budget is spent", () => {
    expect(shouldStopForToolBudget({ requestedToolCalls: 0, completedToolCalls: 3, maxToolCalls: 3 })).toBe(false);
    expect(shouldStopForToolBudget({ requestedToolCalls: 1, completedToolCalls: 2, maxToolCalls: 3 })).toBe(false);
    expect(shouldStopForToolBudget({ requestedToolCalls: 1, completedToolCalls: 3, maxToolCalls: 3 })).toBe(true);
  });

  test("returns a deterministic tool budget stop message", () => {
    expect(getToolBudgetStopMessage(3)).toBe("Agent stopped after reaching the maximum tool-call limit of 3.");
  });

  test("stops when runtime, token, or cost budgets are reached", () => {
    expect(shouldStopForRuntimeBudget({ elapsedMs: 119999, maxRuntimeMs: 120000 })).toBe(false);
    expect(shouldStopForRuntimeBudget({ elapsedMs: 120000, maxRuntimeMs: 120000 })).toBe(true);

    expect(
      shouldStopForTokenBudget({
        inputTokens: 199999,
        outputTokens: 19999,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(false);
    expect(
      shouldStopForTokenBudget({
        inputTokens: 200000,
        outputTokens: 19999,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(true);
    expect(
      shouldStopForTokenBudget({
        inputTokens: 199999,
        outputTokens: 20000,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(true);

    expect(shouldStopForCostBudget({ costGBP: 0.99, maxCostGBP: 1 })).toBe(false);
    expect(shouldStopForCostBudget({ costGBP: 1, maxCostGBP: 1 })).toBe(true);
  });

  test("returns deterministic runtime, token, and cost budget messages", () => {
    expect(getRuntimeBudgetStopMessage(120000)).toBe("Agent stopped after reaching the maximum runtime limit of 120 seconds.");
    expect(getTokenBudgetStopMessage()).toBe("Agent stopped after reaching the configured token budget.");
    expect(getCostBudgetStopMessage(1)).toBe("Agent stopped after reaching the maximum cost limit of GBP 1.00.");
  });
});
