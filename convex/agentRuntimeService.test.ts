import { describe, expect, test } from "vitest";
import {
  AGENT_OBJECTIVE_LIMIT_CEILINGS,
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
  UNPRICED_MODEL_OBJECTIVE_LIMITS,
  isModelCostMeasurable,
  resolveAgentObjectiveLimits,
  buildToolInteractionTurns,
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
  test("exposes default loop budgets with room for real work", () => {
    expect(DEFAULT_AGENT_OBJECTIVE_LIMITS).toEqual({
      maxSteps: 10,
      maxToolCalls: 8,
      maxRuntimeMs: 5 * 60 * 1000,
      maxInputTokens: 200000,
      maxOutputTokens: 20000,
      maxCostGBP: 1,
    });
  });

  test("falls back to a tighter budget when spend cannot be measured", () => {
    // With no pricing on the model, cost always computes to zero and the cost
    // ceiling never fires — so step and tool counts are the only backstop and
    // must stay conservative.
    expect(isModelCostMeasurable(undefined)).toBe(false);
    expect(isModelCostMeasurable({})).toBe(false);
    expect(isModelCostMeasurable({ standardInputCostBelow200k: 0, outputResponseCost: 0 })).toBe(false);
    expect(isModelCostMeasurable({ standardInputCostBelow200k: 0.5 })).toBe(true);
    expect(isModelCostMeasurable({ outputResponseCost: 1.5 })).toBe(true);

    const unpriced = resolveAgentObjectiveLimits({ maxSteps: 24, maxToolCalls: 20 }, { costMeasurable: false });
    expect(unpriced.maxSteps).toBe(UNPRICED_MODEL_OBJECTIVE_LIMITS.maxSteps);
    expect(unpriced.maxToolCalls).toBe(UNPRICED_MODEL_OBJECTIVE_LIMITS.maxToolCalls);

    // A deliberately smaller budget is still respected.
    expect(resolveAgentObjectiveLimits({ maxSteps: 2 }, { costMeasurable: false }).maxSteps).toBe(2);
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

  describe("tool interaction turns", () => {
    test("answers every call in a parallel batch, in order", () => {
      // The regression: the runtime executed functionCalls[0] only and appended
      // one response, so the transcript no longer matched what the model asked
      // for and the dropped calls failed silently.
      const turns = buildToolInteractionTurns([
        { name: "knowledge.search", args: { query: "pricing" }, responsePayload: { status: "success" } },
        { name: "company.overview.update", args: { overview: "new" }, responsePayload: { status: "error" } },
      ]);

      expect(turns).toHaveLength(2);
      expect(turns[0].role).toBe("model");
      expect(turns[1].role).toBe("function");

      // One model turn carrying every call...
      expect(turns[0].parts).toEqual([
        { functionCall: { name: "knowledge.search", args: { query: "pricing" } } },
        { functionCall: { name: "company.overview.update", args: { overview: "new" } } },
      ]);

      // ...answered by one function turn with the matching responses in order.
      expect(turns[1].parts).toEqual([
        {
          functionResponse: {
            name: "knowledge.search",
            response: { name: "knowledge.search", content: { status: "success" } },
          },
        },
        {
          functionResponse: {
            name: "company.overview.update",
            response: { name: "company.overview.update", content: { status: "error" } },
          },
        },
      ]);
    });

    test("pairs a single call the same way", () => {
      const turns = buildToolInteractionTurns([
        { name: "knowledge.search", args: {}, responsePayload: { status: "success" } },
      ]);

      expect(turns).toHaveLength(2);
      expect(turns[0].parts).toHaveLength(1);
      expect(turns[1].parts).toHaveLength(1);
    });

    test("emits nothing when no call executed, leaving no dangling model turn", () => {
      expect(buildToolInteractionTurns([])).toEqual([]);
    });

    test("keeps the call and response counts equal for any batch size", () => {
      const calls = Array.from({ length: 5 }, (_, index) => ({
        name: `tool.${index}`,
        args: { index },
        responsePayload: { index },
      }));

      const turns = buildToolInteractionTurns(calls);
      expect(turns[0].parts).toHaveLength(turns[1].parts.length);
      expect(turns[0].parts).toHaveLength(5);
    });
  });

  describe("per-agent limits", () => {
    test("falls back to the platform defaults when an agent sets nothing", () => {
      expect(resolveAgentObjectiveLimits(undefined)).toMatchObject({
        maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        maxToolCalls: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls,
        maxCostGBP: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostGBP,
      });
      expect(resolveAgentObjectiveLimits({})).toMatchObject({
        maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
      });
    });

    test("uses an agent's own budget when it sets one", () => {
      // The whole point: a deep research agent should be able to take more
      // steps than a trivial classifier.
      expect(resolveAgentObjectiveLimits({ maxSteps: 12, maxToolCalls: 10 })).toMatchObject({
        maxSteps: 12,
        maxToolCalls: 10,
      });
    });

    test("clamps to the platform ceiling instead of trusting the record", () => {
      const resolved = resolveAgentObjectiveLimits({
        maxSteps: 10_000,
        maxToolCalls: 10_000,
        maxRuntimeMs: 60 * 60 * 1000,
        maxCostGBP: 5_000,
      });

      expect(resolved.maxSteps).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxSteps);
      expect(resolved.maxToolCalls).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxToolCalls);
      expect(resolved.maxCostGBP).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxCostGBP);
      // Must stay inside the Convex action execution window.
      expect(resolved.maxRuntimeMs).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs);
      expect(resolved.maxRuntimeMs).toBeLessThan(10 * 60 * 1000);
    });

    test("ignores unusable values rather than failing the run", () => {
      // Older records, hand-edited data, or a bad form submission must degrade
      // to the default instead of producing a zero-step agent.
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(resolveAgentObjectiveLimits({ maxSteps: bad }).maxSteps).toBe(
          DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        );
      }
    });

    test("floors fractional values so a limit is always a whole count", () => {
      expect(resolveAgentObjectiveLimits({ maxSteps: 7.9 }).maxSteps).toBe(7);
    });
  });
});
