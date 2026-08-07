import { describe, expect, test } from "vitest";
import {
  NO_POLICY_FILTERS,
  filterPolicies,
  isUnnamed,
  scopeOf,
  sortPolicies,
  type PolicyEntry,
} from "./governancePolicyService";

const rule = (overrides: Partial<PolicyEntry> = {}): PolicyEntry => ({
  name: "House style",
  trigger: "when writing anything",
  instruction: "never use an em dash",
  priority: "NORMAL",
  ...overrides,
});

describe("how far a rule reaches", () => {
  test("no workspace and no assistant means everywhere", () => {
    expect(scopeOf(rule())).toBe("EVERYWHERE");
  });

  test("a workspace rule reaches that workspace", () => {
    expect(scopeOf(rule({ companyId: "company_a" }))).toBe("WORKSPACE");
  });

  test("an assistant rule is filed as an assistant rule, not a workspace one", () => {
    // Assistant rules carry a workspace too. Testing the workspace first would
    // overstate what every assistant-level rule governs.
    expect(scopeOf(rule({ agentId: "agent_a", companyId: "company_a" }))).toBe("AGENT");
  });
});

describe("finding a rule among the rules", () => {
  const rules = [
    rule({ name: "House style", instruction: "never use an em dash", priority: "CRITICAL" }),
    rule({ name: "", trigger: "before sending email", instruction: "always sign off", priority: "HIGH" }),
    rule({ name: "Tone", instruction: "be brief", priority: "LOW", companyId: "company_a" }),
  ];

  test("no filters leaves the list alone", () => {
    expect(filterPolicies(rules, NO_POLICY_FILTERS)).toHaveLength(3);
  });

  test("searches what a rule says", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, search: "em dash" })).toHaveLength(1);
  });

  test("searches what sets a rule off, not only what it says", () => {
    // Somebody looking for "before sending" is describing the trigger.
    const found = filterPolicies(rules, { ...NO_POLICY_FILTERS, search: "before sending" });

    expect(found[0].instruction).toBe("always sign off");
  });

  test("a rule with no name is still findable by what it says", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, search: "sign off" })).toHaveLength(1);
  });

  test("filters by how strong the rule is", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, priority: "CRITICAL" })).toHaveLength(1);
  });

  test("filters by how far it reaches", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, scope: "WORKSPACE" })).toHaveLength(1);
  });

  test("filters stack", () => {
    const found = filterPolicies(rules, {
      ...NO_POLICY_FILTERS,
      scope: "EVERYWHERE",
      priority: "CRITICAL",
    });

    expect(found.map((entry) => entry.name)).toEqual(["House style"]);
  });

  test("nothing matching is empty rather than everything", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, search: "zzz" })).toEqual([]);
  });

  test("ignores case and stray spacing", () => {
    expect(filterPolicies(rules, { ...NO_POLICY_FILTERS, search: "  EM DASH " })).toHaveLength(1);
  });
});

describe("a rule nobody named", () => {
  test("an empty or blank name counts as unnamed", () => {
    expect(isUnnamed(rule({ name: "" }))).toBe(true);
    expect(isUnnamed(rule({ name: "   " }))).toBe(true);
    expect(isUnnamed(rule({ name: undefined }))).toBe(true);
  });

  test("a named rule is not", () => {
    expect(isUnnamed(rule())).toBe(false);
  });
});

describe("strongest first", () => {
  test("critical sits above the rest whenever it was written", () => {
    const sorted = sortPolicies([
      rule({ name: "d", priority: "LOW" }),
      rule({ name: "b", priority: "HIGH" }),
      rule({ name: "a", priority: "CRITICAL" }),
      rule({ name: "c", priority: "NORMAL" }),
    ]);

    expect(sorted.map((entry) => entry.name)).toEqual(["a", "b", "c", "d"]);
  });

  test("sorting keeps every rule", () => {
    expect(sortPolicies([rule(), rule({ name: "x" })])).toHaveLength(2);
  });
});
