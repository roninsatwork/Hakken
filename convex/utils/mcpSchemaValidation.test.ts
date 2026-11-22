import { describe, expect, test } from "vitest";
import { validateMcpToolArgs } from "./mcpSchemaValidation";

describe("outbound MCP argument checks", () => {
  const schema = {
    type: "object", additionalProperties: false, required: ["status", "details"],
    properties: {
      status: { type: "string", enum: ["paid"] },
      details: { type: "object", required: ["invoice"], additionalProperties: false, properties: { invoice: { type: "string", minLength: 1 } } },
    },
  };

  test("accepts a complete call and refuses invalid values before the server sees them", () => {
    expect(validateMcpToolArgs(schema, { status: "paid", details: { invoice: "INV-1" } }).ok).toBe(true);
    expect(validateMcpToolArgs(schema, { status: "unpaid", details: { invoice: "INV-1" } }).ok).toBe(false);
    expect(validateMcpToolArgs(schema, { status: "paid", details: {} }).ok).toBe(false);
    expect(validateMcpToolArgs(schema, { status: "paid", details: { invoice: "INV-1" }, extra: true }).ok).toBe(false);
  });

  test("refuses unsupported rules and remote references instead of silently skipping them", () => {
    expect(validateMcpToolArgs({ type: "object", patternProperties: { "^x": { type: "string" } } }, { x: 1 }).ok).toBe(false);
    expect(validateMcpToolArgs({ type: "object", $ref: "https://example.com/schema" }, {}).ok).toBe(false);
    expect(validateMcpToolArgs("{bad json", {}).ok).toBe(false);
    expect(validateMcpToolArgs({ $ref: "#/properties", properties: { field: { type: "string" } } }, {}).ok).toBe(false);
  });

  test("checks local references and combinations", () => {
    const withReference = { type: "object", required: ["choice"], properties: { choice: { $ref: "#/$defs/choice" } }, $defs: { choice: { oneOf: [{ const: "yes" }, { const: "no" }] } } };
    expect(validateMcpToolArgs(withReference, { choice: "yes" }).ok).toBe(true);
    expect(validateMcpToolArgs(withReference, { choice: "maybe" }).ok).toBe(false);
  });

  test("refuses checks that run past the depth limit, including negative rules", () => {
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 30; i += 1) deep = { child: deep };
    expect(validateMcpToolArgs({ not: { const: deep } }, deep).ok).toBe(false);
    expect(validateMcpToolArgs({ $defs: { loop: { $ref: "#/$defs/loop" } }, not: { $ref: "#/$defs/loop" } }, {}).ok).toBe(false);
  });
});
