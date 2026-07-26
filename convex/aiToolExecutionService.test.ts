import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import {
  assertCanExecuteTool,
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  executeRegisteredTool,
  getRegisteredToolHandlerMappings,
  isNotImplementedToolResult,
  normalizeToolFunctionName,
  normalizeToolExecutionPolicy,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  parseToolInputSchema,
  validateToolCallArgsAgainstSchema,
  validateToolJsonSchemaString,
} from "./aiToolExecutionService";

describe("ai tool execution service", () => {
  test("normalizes provider function names", () => {
    expect(normalizeToolFunctionName("crm.lookup-account")).toBe("crm_lookup_account");
    expect(normalizeToolFunctionName("123-start")).toBe("_123_start");
    expect(normalizeToolFunctionName("")).toBe("tool");
  });

  test("parses tool input schemas as JSON objects", () => {
    expect(parseToolInputSchema(undefined)).toBeUndefined();
    expect(parseToolInputSchema('{"type":"object","properties":{"id":{"type":"string"}}}')).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(parseToolInputSchema({ type: "object" })).toEqual({ type: "object" });

    expect(() => parseToolInputSchema("[]")).toThrow("Tool input schema must be a JSON object.");
    expect(() => parseToolInputSchema("not json")).toThrow();
  });

  test("validates tool schema contracts before saving", () => {
    expect(validateToolJsonSchemaString('{"type":"object","properties":{"id":{"type":"string"}}}')).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(validateToolJsonSchemaString(undefined)).toBeUndefined();

    expect(() => validateToolJsonSchemaString('{"type":"array"}')).toThrow('root type "object"');
    expect(() => validateToolJsonSchemaString('{"type":"object","properties":[]}')).toThrow("properties must be a JSON object");
    expect(() => validateToolJsonSchemaString('{"type":"object","required":[1]}')).toThrow("required must be an array of strings");
  });

  test("validates model tool arguments against the saved schema subset", () => {
    const schema = {
      type: "object",
      required: ["accountId", "limit"],
      properties: {
        accountId: { type: "string" },
        limit: { type: "integer" },
        includeClosed: { type: "boolean" },
      },
    };

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: "acc_1", limit: 10, includeClosed: false },
      })
    ).toEqual({ ok: true, errors: [] });

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: 123, limit: 1.5 },
      })
    ).toEqual({
      ok: false,
      errors: [
        "Tool argument 'accountId' must be a string.",
        "Tool argument 'limit' must be an integer.",
      ],
    });

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: "acc_1" },
      })
    ).toEqual({
      ok: false,
      errors: ["Missing required tool argument 'limit'."],
    });
  });

  test("builds provider-neutral tool declarations", () => {
    expect(
      buildProviderToolDeclaration({
        name: "CRM Lookup",
        description: "Look up CRM data.",
        handlerMapping: "crm.lookup-account",
        requiredRole: "ADMIN",
        inputSchema: '{"type":"object"}',
      })
    ).toEqual({
      name: "crm_lookup_account",
      description: "Look up CRM data.",
      parametersJsonSchema: { type: "object" },
    });
  });

  test("guards model tool call payloads", () => {
    expect(parseToolCallPayload({ name: "crm.lookup", callArgs: { id: "abc" } })).toEqual({
      name: "crm_lookup",
      args: { id: "abc" },
    });
    expect(parseToolCallPayload({ name: "crm.lookup" })).toEqual({
      name: "crm_lookup",
      args: {},
    });

    expect(() => parseToolCallPayload({ name: "", callArgs: {} })).toThrow("non-empty string name");
    expect(() => parseToolCallPayload({ name: "crm.lookup", callArgs: [] })).toThrow("args must be a JSON object");
  });

  test("builds normalized tool result payloads", () => {
    expect(buildToolResultPayload({ status: "success", data: { ok: true } })).toEqual({
      status: "success",
      data: { ok: true },
    });

    expect(buildToolResultPayload({ status: "error" })).toEqual({
      status: "error",
      error: "Tool execution failed.",
    });

    expect(buildToolFailureResult(new Error("External connector timed out"))).toEqual({
      status: "error",
      error: "External connector timed out",
    });
  });

  test("enforces tool execution role and tenant boundaries", () => {
    expect(canExecuteTool({ requiredRole: "ADMIN" })).toEqual({
      allowed: false,
      reason: "Tool execution requires an authenticated user.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "USER" })).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    expect(canExecuteTool({ requiredRole: "SUPER_ADMIN", userRole: "ADMIN", userCompanyId: "a" })).toEqual({
      allowed: false,
      reason: "Tool execution requires super-admin privileges.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "ADMIN", userCompanyId: "a", targetCompanyId: "b" })).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "ADMIN", userCompanyId: "a", targetCompanyId: "a" })).toEqual({
      allowed: true,
    });
    expect(canExecuteTool({ requiredRole: "SUPER_ADMIN", userRole: "SUPER_ADMIN", targetCompanyId: "b" })).toEqual({
      allowed: true,
    });

    expect(() => assertCanExecuteTool({ requiredRole: "ADMIN", userRole: "USER" })).toThrow(
      "Tool execution requires administrator privileges."
    );
  });

  test("normalizes tool side-effect policy and requires confirmation for risky tools", () => {
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "READ",
      confirmationRequired: false,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "WRITE" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "WRITE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "WRITE", confirmationRequired: false })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "WRITE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "DESTRUCTIVE" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "SUPER_ADMIN", sideEffectLevel: "EXTERNAL" })).toEqual({
      requiredRole: "SUPER_ADMIN",
      sideEffectLevel: "EXTERNAL",
      confirmationRequired: true,
    });

    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires explicit user confirmation.",
    });
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "b",
        sideEffectLevel: "DESTRUCTIVE",
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        confirmationGranted: true,
      })
    ).toEqual({ allowed: true });
  });

  test("an autonomous agent waives confirmation but keeps every other restriction", () => {
    // The normalizer forces confirmationRequired true for anything that is not a
    // plain read and ignores a passed-in false, so autonomy cannot be expressed
    // that way — it would be overruled and an unattended agent would still park
    // on every write.
    expect(
      normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "DESTRUCTIVE", confirmationRequired: false })
    ).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
    });

    // Waived for an admin in their own tenant...
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({ allowed: true });

    // ...and for a super admin.
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "SUPER_ADMIN",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({ allowed: true });

    // Autonomy removes the human, not the permissions. A tenant boundary still
    // holds, a role requirement still holds, and an unauthenticated caller is
    // still refused — each checked before confirmation is considered.
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "b",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(
      canExecuteTool({
        requiredRole: "SUPER_ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires super-admin privileges.",
    });
    expect(
      canExecuteTool({ requiredRole: "ADMIN", userRole: "USER", autonomous: true })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    expect(
      canExecuteTool({ requiredRole: "ADMIN", autonomous: true })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires an authenticated user.",
    });
  });

  test("normalizes AI runtime errors into stable UI-safe shapes", () => {
    expect(normalizeAiRuntimeError(new Error("Provider unavailable"))).toEqual({
      ok: false,
      error: "Provider unavailable",
    });

    expect(normalizeAiRuntimeError("bad")).toEqual({
      ok: false,
      error: "AI runtime request failed.",
    });

    expect(normalizeAiRuntimeError("bad", "Provider call failed.")).toEqual({
      ok: false,
      error: "Provider call failed.",
    });
  });

  test("the registry lists only handlers that actually do something", () => {
    // It used to include five stubs that returned a "not implemented" payload,
    // so the registry could not be used to answer "does this connector work?".
    // Everything unbuilt is now absent from it, which is what lets the
    // marketplace derive availability instead of keeping a parallel list.
    expect(getRegisteredToolHandlerMappings()).toEqual([
      "company.overview.update",
      "http.request",
      "knowledge.search",
      "notification.send",
    ]);
  });

  test("dispatches knowledge search through the registered read handler", async () => {
    const result = { matches: [], query: "pipeline risk" };
    const runQuery = vi.fn().mockResolvedValue(result);
    const runMutation = vi.fn();

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation },
        handlerMapping: "knowledge.search",
        args: { query: " pipeline risk ", limit: 3 },
        agentId: "agent_1" as never,
        companyId: "company_1" as never,
        fallbackQuery: "fallback query",
      })
    ).resolves.toBe(result);

    expect(runQuery).toHaveBeenCalledWith(internal.aiToolReadTools.searchKnowledge, {
      query: "pipeline risk",
      agentId: "agent_1",
      companyId: "company_1",
      limit: 3,
    });
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("dispatches company overview updates through the registered write handler", async () => {
    const result = { changed: true, overview: "New overview" };
    const runQuery = vi.fn();
    const runMutation = vi.fn().mockResolvedValue(result);

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation },
        handlerMapping: "company.overview.update",
        args: { overview: " New overview ", idempotencyKey: "run-1:overview" },
        companyId: "company_1" as never,
        userId: "user_1" as never,
        runId: "run_1" as never,
        toolCallId: "tool_call_1" as never,
      })
    ).resolves.toBe(result);

    expect(runMutation).toHaveBeenCalledWith(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId: "company_1",
      actorId: "user_1",
      overview: "New overview",
      runId: "run_1",
      toolCallId: "tool_call_1",
      idempotencyKey: "run-1:overview",
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  test("a handler mapping nothing declares is an error", async () => {
    // Broken configuration — a typo, a hand-written tool row pointing nowhere.
    // Distinct from a connector the catalogue advertises but nobody has built:
    // one needs fixing, the other needs writing.
    await expect(
      executeRegisteredTool({
        ctx: { runQuery: vi.fn(), runMutation: vi.fn() },
        handlerMapping: "crm.lookup",
        args: {},
      })
    ).rejects.toThrow("No tool handler is registered for 'crm.lookup'.");
  });

  test("a declared connector with no implementation reports itself, without throwing", async () => {
    // Reported rather than thrown so the runtime can record it as
    // NOT_IMPLEMENTED and tell the model plainly, instead of it looking like a
    // runtime fault the agent might sensibly retry.
    const runQuery = vi.fn();
    const runMutation = vi.fn();

    const result = await executeRegisteredTool({
      ctx: { runQuery, runMutation },
      handlerMapping: "jira.issues.search",
      args: { query: "open bugs" },
    });

    expect(isNotImplementedToolResult(result)).toBe(true);
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("external connector stubs fail safely without side effects", async () => {
    const runQuery = vi.fn();
    const runMutation = vi.fn();

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation },
        handlerMapping: "slack.message.send",
        args: { channel: "sales", text: "hello" },
        companyId: "company_1" as never,
      })
    ).resolves.toEqual({
      ok: false,
      status: "not_implemented",
      connectorName: "Slack",
      handlerMapping: "slack.message.send",
      companyId: "company_1",
      message: "Slack connector execution is not implemented yet.",
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });
});
