import { describe, expect, test } from "vitest";
import {
  buildMergeNodeOutput,
  createWorkflowRuntimeContext,
  executeApprovalNode,
  executeBypassNode,
  executeIteratorNode,
  executeLogicNode,
  executeWaitNode,
  evaluateLogicBranch,
  getWorkflowSystemCommands,
  parseRuntimeJson,
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

  test("creates runtime context from mapped input without trusting malformed JSON", () => {
    expect(
      createWorkflowRuntimeContext({
        nodeData: { _inputTemplate: "Hello {{trigger.name}}" },
        stepInput: JSON.stringify({ trigger: { name: "Ada" } }),
        executionState: undefined,
      })
    ).toMatchObject({
      globalStatePayload: { trigger: { name: "Ada" } },
      resolvedInput: "Hello Ada",
    });

    expect(
      createWorkflowRuntimeContext({
        nodeData: { _inputMapping: { value: "{{missing}}" } },
        stepInput: "not json",
        executionState: undefined,
      })
    ).toMatchObject({
      globalStatePayload: {},
      resolvedInput: JSON.stringify({ value: "" }),
    });
  });

  test("parses runtime JSON with an explicit fallback", () => {
    expect(parseRuntimeJson(JSON.stringify({ ok: true }))).toEqual({ ok: true });
    expect(parseRuntimeJson("nope", { ok: false })).toEqual({ ok: false });
  });

  test("executes pure runtime node handlers with typed outputs", () => {
    expect(JSON.parse(executeLogicNode({ _logicConfig: { fallbackBranch: "fallback", rules: [] } }, {}))).toEqual({
      evaluated: "fallback",
    });

    expect(JSON.parse(executeWaitNode({ _waitConfig: { delaySeconds: "{{delay}}" } }, { delay: 2 }))).toEqual({
      _system: { delayMs: 2000, structurallyHandled: true },
      waitedSeconds: 2,
    });

    expect(
      JSON.parse(
        executeApprovalNode(
          { _approvalConfig: { message: "Review this", previewTarget: "{{payload}}" } },
          { payload: { id: 1 } }
        )
      )
    ).toEqual({
      _system: { halt: true, structurallyHandled: true },
      message: "Review this",
      previewData: JSON.stringify({ id: 1 }),
    });

    expect(JSON.parse(executeIteratorNode({ _iteratorConfig: { listVariable: "{{items}}" } }, { items: ["a", "b"] }))).toEqual({
      _system: { isIterator: true },
      items: ["a", "b"],
    });

    expect(JSON.parse(executeBypassNode({ nodeType: "unknownNode", resolvedInput: "payload" }))).toEqual({
      bypassed: true,
      nodeType: "unknownNode",
      received: "payload",
    });
  });

  test("builds merge output from single and fan-out upstream steps", () => {
    expect(
      JSON.parse(
        buildMergeNodeOutput({
          nodeId: "merge",
          edges: [
            { source: "single", target: "merge" },
            { source: "fanout", target: "merge" },
          ],
          executionSteps: [
            { nodeId: "single", status: "SUCCESS", output: JSON.stringify({ ok: true }) },
            { nodeId: "fanout", status: "SUCCESS", output: JSON.stringify({ item: "a" }) },
            { nodeId: "fanout", status: "SUCCESS", output: JSON.stringify({ item: "b" }) },
            { nodeId: "ignored", status: "SUCCESS", output: JSON.stringify({ nope: true }) },
          ],
        })
      )
    ).toEqual({
      _system: { isMerge: true, structurallyHandled: true },
      mergedContexts: {
        single: { ok: true },
        fanout: [{ item: "a" }, { item: "b" }],
      },
    });
  });

  test("merge output tolerates malformed upstream output", () => {
    expect(
      JSON.parse(
        buildMergeNodeOutput({
          nodeId: "merge",
          edges: [{ source: "upstream", target: "merge" }],
          executionSteps: [{ nodeId: "upstream", status: "SUCCESS", output: "not json" }],
        })
      )
    ).toEqual({
      _system: { isMerge: true, structurallyHandled: true },
      mergedContexts: {
        upstream: {},
      },
    });
  });

  test("rejects invalid runtime node configs clearly", () => {
    expect(() => executeLogicNode({ _logicConfig: { rules: "nope" } }, {})).toThrow("Logic node config");
    expect(() => executeWaitNode({ _waitConfig: { delaySeconds: {} } }, {})).toThrow("Wait node config");
    expect(() => executeApprovalNode({ _approvalConfig: { previewTarget: 123 } }, {})).toThrow("Approval node config");
    expect(() => executeIteratorNode({ _iteratorConfig: { listVariable: 123 } }, {})).toThrow("Iterator node config");
  });
});
