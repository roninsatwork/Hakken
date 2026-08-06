import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  describeMissing,
  sortRegister,
  summariseRegister,
  toAssistantEntry,
  toWidgetEntry,
  toWorkflowEntry,
  type AiSystemEntry,
} from "./governanceRegisterService";

const agent = (overrides: Partial<Doc<"agents">> = {}) =>
  ({
    _id: "agent_1" as Id<"agents">,
    _creationTime: 0,
    name: "Invoice checker",
    modelId: "model-under-test",
    thinkingMode: false,
    isActive: true,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  }) as Doc<"agents">;

const widget = (overrides: Partial<Doc<"widgets">> = {}) =>
  ({
    _id: "widget_1" as Id<"widgets">,
    _creationTime: 0,
    name: "Main website bot",
    allowedDomains: ["https://acme.com"],
    isActive: true,
    createdBy: "user_1" as Id<"users">,
    createdAt: 5,
    ...overrides,
  }) as Doc<"widgets">;

const workflow = (overrides: Partial<Doc<"workflows">> = {}) =>
  ({
    _id: "workflow_1" as Id<"workflows">,
    _creationTime: 0,
    name: "Nightly summary",
    isActive: true,
    triggerType: "SCHEDULE" as const,
    createdAt: 3,
    updatedAt: 4,
    createdBy: "user_1" as Id<"users">,
    ...overrides,
  }) as Doc<"workflows">;

describe("what counts as an AI system", () => {
  test("a website widget is its own entry, and says it talks to the public", () => {
    // The entry a regulator asks about first. Listing the assistant behind a
    // widget and not the widget itself describes the engine and omits the car.
    const entry = toWidgetEntry(widget(), "Danette Cole", agent());

    expect(entry.kind).toBe("WIDGET");
    expect(entry.facesPublic).toBe(true);
    expect(entry.name).toBe("Main website bot");
  });

  test("a widget with no allowed domains is not treated as public", () => {
    expect(toWidgetEntry(widget({ allowedDomains: [] }), "Danette Cole", null).facesPublic).toBe(false);
  });

  test("an AI-calling workflow is on the register too", () => {
    expect(toWorkflowEntry(workflow(), "Ravi Menon").kind).toBe("WORKFLOW");
  });

  test("an assistant is gated unless someone deliberately switched that off", () => {
    expect(toAssistantEntry(agent(), "Priya Shah", 10).humanApproves).toBe(true);
    expect(
      toAssistantEntry(agent({ autonomousToolExecution: true }), "Priya Shah", 10).humanApproves
    ).toBe(false);
  });

  test("an assistant carries no risk rating yet, and says so rather than guessing", () => {
    // `UNRATED` is honest. Defaulting to LOW would be a claim nobody made.
    expect(toAssistantEntry(agent(), "Priya Shah", 10).risk).toBe("UNRATED");
  });
});

describe("an incomplete record says what is missing, in words", () => {
  test("names both gaps", () => {
    expect(describeMissing("", "")).toEqual([
      "No purpose recorded.",
      "Nobody is accountable for this.",
    ]);
  });

  test("a described and owned system is complete", () => {
    expect(describeMissing("Checks invoices against purchase orders.", "Danette Cole")).toEqual([]);
  });

  test("whitespace is not a description", () => {
    expect(describeMissing("   ", "  ")).toHaveLength(2);
  });

  test("an assistant with no description is flagged", () => {
    const entry = toAssistantEntry(agent({ description: undefined }), "", undefined);

    expect(entry.missing).toContain("No purpose recorded.");
    expect(entry.missing).toContain("Nobody is accountable for this.");
  });
});

describe("the register puts what needs a person first", () => {
  const complete = (id: string, lastActiveAt: number): AiSystemEntry => ({
    id,
    kind: "ASSISTANT",
    name: id,
    purpose: "Does a thing.",
    ownerName: "Someone",
    risk: "UNRATED",
    humanApproves: true,
    facesPublic: false,
    lastActiveAt,
    missing: [],
  });

  test("incomplete entries sort above complete ones, however recent", () => {
    const incomplete = { ...complete("b", 1), missing: ["No purpose recorded."] };

    expect(sortRegister([complete("a", 999), incomplete]).map((e) => e.id)).toEqual(["b", "a"]);
  });

  test("otherwise the most recently active comes first", () => {
    expect(sortRegister([complete("old", 1), complete("new", 99)]).map((e) => e.id)).toEqual([
      "new",
      "old",
    ]);
  });

  test("the summary counts what a compliance officer opens the page to ask", () => {
    const entries: AiSystemEntry[] = [
      complete("a", 1),
      { ...complete("b", 2), missing: ["No purpose recorded."] },
      { ...complete("c", 3), facesPublic: true },
      { ...complete("d", 4), humanApproves: false },
    ];

    expect(summariseRegister(entries)).toEqual({
      total: 4,
      incomplete: 1,
      publicFacing: 1,
      unattended: 1,
      // Nothing in this fixture is rated, which is the state the whole estate
      // starts in and the figure the dashboard needs in order to say so.
      highRisk: 0,
      unrated: 4,
    });
  });

  test("an empty register summarises to zeroes rather than blanks", () => {
    expect(summariseRegister([])).toEqual({
      total: 0,
      incomplete: 0,
      publicFacing: 0,
      unattended: 0,
      highRisk: 0,
      unrated: 0,
    });
  });
});

/**
 * Widgets and workflows belong to a workspace; assistants usually belong to
 * nobody in particular, because they are global and serve everyone.
 */
describe("what a workspace sees on its own register", () => {
  const inScope = (companyId: string | undefined, scope: string | undefined) =>
    !scope || companyId === scope || companyId === undefined;

  test("a workspace sees its own records", () => {
    expect(inScope("company_a", "company_a")).toBe(true);
  });

  test("a workspace never sees another one's", () => {
    expect(inScope("company_b", "company_a")).toBe(false);
  });

  test("a global assistant counts as running in every workspace", () => {
    // Matching on company alone would hand a customer an empty register while
    // their assistants were plainly running.
    expect(inScope(undefined, "company_a")).toBe(true);
  });

  test("the platform view is scoped to nothing and sees all of it", () => {
    expect(inScope("company_b", undefined)).toBe(true);
    expect(inScope(undefined, undefined)).toBe(true);
  });
});

describe("risk shows up in the register itself", () => {
  test("an assistant carries whatever rating it was given", () => {
    expect(toAssistantEntry(agent({ riskLevel: "HIGH" }), "Priya Shah", 10).risk).toBe("HIGH");
  });

  test("an unclassified assistant reads as unrated rather than guessing low", () => {
    expect(toAssistantEntry(agent(), "Priya Shah", 10).risk).toBe("UNRATED");
  });

  test("the summary counts high-risk and unrated separately", () => {
    const base = toAssistantEntry(agent({ riskLevel: "HIGH" }), "Someone", 1);
    const summary = summariseRegister([base, { ...base, id: "b", risk: "UNRATED" }]);

    expect(summary.highRisk).toBe(1);
    expect(summary.unrated).toBe(1);
  });

  test("riskiest first, once completeness has been settled", () => {
    const complete = (id: string, risk: "HIGH" | "LOW" | "UNRATED") => ({
      ...toAssistantEntry(agent({ riskLevel: risk === "UNRATED" ? undefined : risk }), "Someone", 1),
      id,
      purpose: "Does a thing.",
      missing: [],
    });

    expect(
      sortRegister([complete("unrated", "UNRATED"), complete("low", "LOW"), complete("high", "HIGH")])
        .map((e) => e.id)
    ).toEqual(["high", "low", "unrated"]);
  });
});

