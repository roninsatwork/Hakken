import { describe, expect, test } from "vitest";
import {
  buildActionRequest,
  buildActionResponseOutput,
  buildCodeNodeOutput,
  buildDatabaseNodeOutput,
  buildDatabaseOperationInput,
  buildEmailDeliveryOutput,
  buildEmailMessage,
  buildEmailSimulationOutput,
  buildMergeNodeOutput,
  buildWorkflowScheduleDecision,
  createWorkflowRuntimeContext,
  executeApprovalNode,
  executeBypassNode,
  executeIteratorNode,
  executeLogicNode,
  executeWaitNode,
  getRuntimeErrorMessage,
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

  test("builds schedule decisions from workflow system commands", () => {
    expect(buildWorkflowScheduleDecision(JSON.stringify({ _system: { delayMs: 2500 } }), ["next-a", "next-b"])).toEqual({
      halt: false,
      schedules: [
        { nodeId: "next-a", delayMs: 2500 },
        { nodeId: "next-b", delayMs: 2500 },
      ],
    });

    expect(buildWorkflowScheduleDecision(JSON.stringify({ _system: { halt: true, delayMs: 2500 } }), ["next"])).toEqual({
      halt: true,
      schedules: [],
    });
  });

  test("normalizes runtime error messages", () => {
    expect(getRuntimeErrorMessage(new Error("Boom"))).toBe("Boom");
    expect(getRuntimeErrorMessage("nope")).toBe("Unknown error");
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

  test("builds templated API action requests with safe headers and bodies", () => {
    expect(
      buildActionRequest(
        {
          _actionConfig: {
            method: "POST",
            url: "https://api.example.com/{{tenant}}",
            headers: [
              { key: "Authorization", value: "Bearer {{token}}" },
              { key: "", value: "ignored" },
            ],
            body: { name: "{{name}}" },
          },
        },
        { tenant: "acme", token: "secret", name: "Ada" }
      )
    ).toEqual({
      url: "https://api.example.com/acme",
      fetchOptions: {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: JSON.stringify({ name: "Ada" }),
      },
    });

    expect(() =>
      buildActionRequest({ _actionConfig: { url: "http://localhost:3000/internal" } }, {})
    ).toThrow("SSRF Prevention");
  });

  test("normalizes API action response output", () => {
    expect(JSON.parse(buildActionResponseOutput(201, JSON.stringify({ id: 1 })))).toEqual({
      status: 201,
      data: { id: 1 },
    });

    expect(JSON.parse(buildActionResponseOutput(200, "plain text"))).toEqual({
      status: 200,
      data: "plain text",
    });
  });

  test("builds safe code node output from parsed input and execution state", () => {
    expect(
      JSON.parse(
        buildCodeNodeOutput({
          nodeData: {},
          resolvedInput: JSON.stringify({ ok: true }),
          executionState: undefined,
        })
      )
    ).toEqual({ ok: true });

    expect(
      buildCodeNodeOutput({
        nodeData: { _inputTemplate: "Hello {{input.name}} from {{execution.trigger.source}}" },
        resolvedInput: JSON.stringify({ name: "Ada" }),
        executionState: JSON.stringify({ trigger: { source: "workflow" } }),
      })
    ).toBe(JSON.stringify("Hello Ada from workflow"));
  });

  test("builds database operation input from mapping or JSON template", () => {
    expect(
      buildDatabaseOperationInput(
        {
          _dbConfig: { tableName: "properties", operation: "UPDATE", docId: "{{docId}}" },
          _inputMapping: { $set: { owner: "{{owner}}" } },
        },
        { docId: "abc123", owner: "Ada" }
      )
    ).toEqual({
      tableName: "properties",
      operation: "UPDATE",
      docId: "abc123",
      data: { set: { owner: "Ada" } },
    });

    expect(
      buildDatabaseOperationInput(
        {
          _dbConfig: { tableName: "properties", operation: "INSERT" },
          _inputTemplate: '{"name":"{{name}}"}',
        },
        { name: "Grace" }
      )
    ).toEqual({
      tableName: "properties",
      operation: "INSERT",
      docId: undefined,
      data: { name: "Grace" },
    });

    expect(
      buildDatabaseOperationInput(
        {
          _dbConfig: { tableName: "properties", operation: "INSERT" },
          _inputTemplate: "not json",
        },
        {}
      ).data
    ).toEqual({});
  });

  test("builds templated email messages with fallback sender and recipient lists", () => {
    expect(
      buildEmailMessage({
        nodeData: {
          _emailConfig: {
            to: "ada@example.com, grace@example.com",
            subject: "Hello {{name}}",
            body: "<p>{{message}}</p>",
          },
        },
        globalStatePayload: { name: "Ada", message: "Approved" },
        defaultFromAddress: "Sonae <hello@example.com>",
      })
    ).toEqual({
      fromAddress: "Sonae <hello@example.com>",
      toAddresses: ["ada@example.com", "grace@example.com"],
      subject: "Hello Ada",
      body: "<p>Approved</p>",
    });
  });

  test("builds database and email node outputs", () => {
    expect(JSON.parse(buildDatabaseNodeOutput({ operation: "SELECT", tableName: "properties", result: [{ id: 1 }] }))).toEqual({
      _system: { db: true },
      operation: "SELECT",
      tableName: "properties",
      result: [{ id: 1 }],
    });

    expect(
      JSON.parse(
        buildEmailSimulationOutput({
          toAddresses: "ada@example.com",
          subject: "Hello",
          body: "A".repeat(120),
        })
      )
    ).toEqual({
      success: true,
      simulated: true,
      to: "ada@example.com",
      subject: "Hello",
      bodyPreview: "A".repeat(100),
    });

    expect(JSON.parse(buildEmailDeliveryOutput({ dispatchId: { id: "email_123" }, toAddresses: ["ada@example.com"], subject: "Hello" }))).toEqual({
      success: true,
      dispatchId: "email_123",
      to: ["ada@example.com"],
      subject: "Hello",
    });
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
    expect(() => buildActionRequest({}, {})).toThrow("API Node is missing configuration");
    expect(() => buildActionRequest({ _actionConfig: { headers: [{ key: 123 }] } }, {})).toThrow("API node config");
    expect(() => buildDatabaseOperationInput({}, {})).toThrow("Database Node is missing configuration");
    expect(() => buildDatabaseOperationInput({ _dbConfig: { operation: "UPSERT" } }, {})).toThrow("Database node config");
    expect(() => buildEmailMessage({ nodeData: { _emailConfig: { to: 123 } }, globalStatePayload: {}, defaultFromAddress: "from" })).toThrow("Email node config");
    expect(() => executeLogicNode({ _logicConfig: { rules: "nope" } }, {})).toThrow("Logic node config");
    expect(() => executeWaitNode({ _waitConfig: { delaySeconds: {} } }, {})).toThrow("Wait node config");
    expect(() => executeApprovalNode({ _approvalConfig: { previewTarget: 123 } }, {})).toThrow("Approval node config");
    expect(() => executeIteratorNode({ _iteratorConfig: { listVariable: 123 } }, {})).toThrow("Iterator node config");
  });
});
