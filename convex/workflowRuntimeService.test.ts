import { describe, expect, test } from "vitest";
import {
  evaluateLogicBranch,
  getWorkflowSystemCommands,
  sanitizeForConvexValue,
} from "./workflowRuntimeService";

describe("workflow runtime service", () => {
  test("evaluates the first matching logic branch", () => {
    const branch = evaluateLogicBranch(
      {
        fallbackBranch: "fallback",
        rules: [
          { variable: "{{score}}", operator: "LESS_THAN", value: "50", branch: "low" },
          { variable: "{{score}}", operator: "GREATER_THAN", value: "80", branch: "high" },
        ],
      },
      { score: 91 }
    );

    expect(branch).toBe("high");
  });

  test("falls back when no logic rule matches", () => {
    const branch = evaluateLogicBranch(
      {
        fallbackBranch: "fallback",
        rules: [{ variable: "{{name}}", operator: "EQUALS", value: "Ada", branch: "match" }],
      },
      { name: "Grace" }
    );

    expect(branch).toBe("fallback");
  });

  test("sanitizes nested Convex document keys", () => {
    expect(
      sanitizeForConvexValue({
        $set: {
          nested: [{ $bad: true }],
        },
      })
    ).toEqual({
      set: {
        nested: [{ bad: true }],
      },
    });
  });

  test("parses workflow system commands from node output", () => {
    expect(getWorkflowSystemCommands(JSON.stringify({ _system: { delayMs: 1500, halt: true } }))).toEqual({
      delayMs: 1500,
      halt: true,
    });
    expect(getWorkflowSystemCommands("not json")).toEqual({ delayMs: 0, halt: false });
  });
});
