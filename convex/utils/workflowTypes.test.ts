import { describe, expect, test } from "vitest";
import {
  parseWorkflowEdges,
  parseWorkflowNodes,
  parseWorkflowOutput,
  parseWorkflowState,
  validateWorkflowEdgesJson,
  validateWorkflowNodesJson,
} from "./workflowTypes";

describe("workflow type helpers", () => {
  test("parses only valid workflow nodes and edges in tolerant runtime mode", () => {
    expect(
      parseWorkflowNodes(
        JSON.stringify([
          { id: "trigger-1", type: "triggerNode", data: { _triggerType: "MANUAL" } },
          { id: 123, type: "agentNode" },
          { id: "bad-trigger", data: { _triggerType: "NOPE" } },
        ])
      )
    ).toEqual([{ id: "trigger-1", type: "triggerNode", data: { _triggerType: "MANUAL" } }]);

    expect(
      parseWorkflowEdges(
        JSON.stringify([
          { source: "trigger-1", target: "agent-1" },
          { source: "agent-1" },
        ])
      )
    ).toEqual([{ source: "trigger-1", target: "agent-1" }]);
  });

  test("throws clear errors for invalid workflow graph updates", () => {
    expect(() => validateWorkflowNodesJson(JSON.stringify({ id: "not-an-array" }))).toThrow(
      "Workflow nodes must be a JSON array."
    );

    expect(() => validateWorkflowNodesJson(JSON.stringify([{ type: "agentNode" }]))).toThrow(
      "Workflow node at index 0 must include a string id"
    );

    expect(() => validateWorkflowEdgesJson(JSON.stringify([{ source: "a" }]))).toThrow(
      "Workflow edge at index 0 must include string source and target node ids."
    );
  });

  test("keeps state and output payloads object-shaped", () => {
    expect(parseWorkflowState(JSON.stringify(["not", "object"]))).toEqual({});
    expect(parseWorkflowOutput("not json")).toEqual({});
    expect(parseWorkflowOutput(JSON.stringify({ _system: { halt: true } }))).toEqual({ _system: { halt: true } });
  });
});
