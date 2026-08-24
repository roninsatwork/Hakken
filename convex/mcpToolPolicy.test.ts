import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  buildServerToolName,
  IMPORTED_TOOL_DEFAULTS,
  isToolVisibleToCompany,
} from "./mcpToolPolicy";

/**
 * The boundary rule, on its own.
 *
 * Agents are global; tools are not always. This is the single function that
 * decides whether a shared agent, running for one company, may be offered a tool
 * that arrived from another company's connected server. Everything else about
 * this feature can be rebuilt; this is the part that must not be wrong.
 */

const acme = "company_acme" as Id<"companies">;
const northwind = "company_northwind" as Id<"companies">;

describe("who may see a tool", () => {
  test("a tool with no owner is global, as every existing tool is", () => {
    expect(isToolVisibleToCompany({}, acme)).toBe(true);
    expect(isToolVisibleToCompany({}, northwind)).toBe(true);
    expect(isToolVisibleToCompany({}, undefined)).toBe(true);
  });

  test("an owned tool is visible to its owner", () => {
    expect(isToolVisibleToCompany({ companyId: acme }, acme)).toBe(true);
  });

  test("an owned tool is invisible to anybody else", () => {
    // The leak this whole phase exists to prevent: one company's agent reaching
    // another company's system, with that company's credential.
    expect(isToolVisibleToCompany({ companyId: acme }, northwind)).toBe(false);
  });

  test("a run with no company gets no owned tools at all", () => {
    // An agent can run without a conversation behind it — a schedule, a workflow
    // node. Failing open there would make the one path that skips the check the
    // one nobody was looking at.
    expect(isToolVisibleToCompany({ companyId: acme }, undefined)).toBe(false);
  });
});

describe("naming a tool that came from a server", () => {
  test("carries the server's name, so provenance is legible in a transcript", () => {
    expect(buildServerToolName("Finance", "get_invoice")).toBe("finance_get_invoice");
  });

  test("keeps two servers offering the same tool apart", () => {
    // The model addresses a tool by name alone. A collision is two different
    // systems behind one word, and whichever matched first wins.
    expect(buildServerToolName("Finance", "search"))
      .not.toBe(buildServerToolName("Warehouse", "search"));
  });

  test("flattens punctuation and spacing a server name may carry", () => {
    expect(buildServerToolName("Acme  Finance (EU)!", "get_invoice"))
      .toBe("acme_finance_eu_get_invoice");
  });

  test("never produces a name a model provider would reject", () => {
    for (const serverName of ["Ünïcödé Server", "   ", "...", "a".repeat(200)]) {
      const name = buildServerToolName(serverName, "get_invoice");
      expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  test("falls back to the bare tool name when a server name yields nothing usable", () => {
    expect(buildServerToolName("!!!", "get_invoice")).toBe("get_invoice");
  });
});

describe("what an imported tool is allowed to claim", () => {
  test("arrives switched off", () => {
    expect(IMPORTED_TOOL_DEFAULTS.isActive).toBe(false);
  });

  test("arrives as EXTERNAL, which the approval rules always gate", () => {
    // The protocol lets a server annotate a tool as read-only, and the
    // specification says explicitly not to trust that. A server wanting its
    // write tool run unattended would say exactly what a read-only tool says.
    expect(IMPORTED_TOOL_DEFAULTS.sideEffectLevel).toBe("EXTERNAL");
    expect(IMPORTED_TOOL_DEFAULTS.confirmationRequired).toBe(true);
  });
});
