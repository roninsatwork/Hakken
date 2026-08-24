import { describe, expect, test } from "vitest";
import { BUILT_IN_TOOL_CONNECTORS } from "./toolConnectorDefinitions";
import {
  normaliseToolModelName,
  TOOL_MODEL_NAME_MAX,
  TOOL_MODEL_NAME_PATTERN,
  toToolModelName,
} from "./toolModelName";

/**
 * The name a model knows a tool by.
 *
 * Until 2026-08-24 there was no such thing: a tool reached the model as its
 * routing key with the punctuation swapped for underscores. These tests hold the
 * two halves of the fix — that a chosen name has to be well-formed, and that
 * every tool the platform ships actually has one.
 */

describe("the shape of a model-facing name", () => {
  test("accepts a verb and a noun in snake_case", () => {
    for (const name of ["read_mailbox", "search_knowledge", "write_board_report", "call_api"]) {
      expect(normaliseToolModelName(name)).toBe(name);
    }
  });

  test("trims, so two spellings cannot both be claimed", () => {
    expect(normaliseToolModelName("  read_mailbox  ")).toBe("read_mailbox");
  });

  test("refuses the shapes the old derivation used to produce", () => {
    // These are real examples of what tools presented as before this existed.
    // A single house convention means a model never has to work out whether
    // this platform writes readMailbox, read-mailbox or read_mailbox today.
    for (const name of [
      "salesCustomers_research_read",
      "opportunityReport_matchProspects",
      "marketDiscovery_groups_review",
    ]) {
      expect(() => normaliseToolModelName(name)).toThrow("lower-case words");
    }
  });

  test("refuses anything that is not lower-case snake_case", () => {
    for (const name of ["Read_Mailbox", "read mailbox", "read-mailbox", "_read", "read__mailbox", "read_", "2read"]) {
      expect(() => normaliseToolModelName(name)).toThrow();
    }
  });

  test("refuses a name too short to mean anything, or too long for a provider", () => {
    expect(() => normaliseToolModelName("ab")).toThrow("at least");
    expect(() => normaliseToolModelName("a".repeat(TOOL_MODEL_NAME_MAX + 1))).toThrow("or fewer");
  });
});

describe("producing a name from someone else's text", () => {
  test("flattens what a connected server called its tool", () => {
    expect(toToolModelName("Get Invoice (EU)")).toBe("get_invoice_eu");
    expect(toToolModelName("finance.getInvoice")).toBe("finance_getinvoice");
  });

  test("never produces a shape the validator would refuse", () => {
    for (const raw of ["!!!", "123 go", "Ünïcödé", "a".repeat(200), "___"]) {
      const produced = toToolModelName(raw);
      if (produced.length > 0) expect(produced).toMatch(TOOL_MODEL_NAME_PATTERN);
    }
  });
});

describe("every tool the platform ships", () => {
  const definitions = BUILT_IN_TOOL_CONNECTORS.flatMap((connector) =>
    connector.toolDefinitions.map((definition) => ({ connector: connector.key, ...definition })));

  test("has a chosen model name", () => {
    // The guard against the fault returning by omission. A tool without one is
    // never offered to a model, so it would go missing silently rather than
    // fail loudly.
    const missing = definitions.filter((d) => !d.modelName).map((d) => `${d.connector}:${d.handlerMapping}`);
    expect(missing).toEqual([]);
  });

  test("has a well-formed one", () => {
    const malformed = definitions
      .filter((d) => !TOOL_MODEL_NAME_PATTERN.test(d.modelName ?? ""))
      .map((d) => `${d.handlerMapping} -> ${d.modelName}`);
    expect(malformed).toEqual([]);
  });

  test("has one nothing else has claimed", () => {
    // Uniqueness was never enforced on any tool name before this. Two tools
    // under one word means whichever the runtime matches first wins, silently.
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const definition of definitions) {
      const existing = seen.get(definition.modelName);
      if (existing) clashes.push(`${definition.modelName}: ${existing} and ${definition.handlerMapping}`);
      else seen.set(definition.modelName, definition.handlerMapping);
    }
    expect(clashes).toEqual([]);
  });

  test("does not name itself after its own plumbing", () => {
    // The whole point. A name that is just the routing key with its dots
    // swapped for underscores is the accident this replaced, not a choice.
    const derived = definitions
      .filter((d) => d.modelName === d.handlerMapping.replace(/[^a-zA-Z0-9_]/g, "_"))
      .map((d) => d.handlerMapping);
    expect(derived).toEqual([]);
  });
});
