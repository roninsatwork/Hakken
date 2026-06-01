import { describe, expect, test } from "vitest";
import {
  assertCanExecuteTool,
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  normalizeToolFunctionName,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  parseToolInputSchema,
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
});
