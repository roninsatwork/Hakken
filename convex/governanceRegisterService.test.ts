import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  NO_REGISTER_FILTERS,
  describeMissing,
  filterRegister,
  sortRegister,
  sortRegisterBy,
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


describe("finding something in a register that builds itself", () => {
  const make = (overrides: Partial<AiSystemEntry>): AiSystemEntry => ({
    id: "x",
    kind: "ASSISTANT",
    name: "Invoice checker",
    purpose: "Reads supplier invoices",
    ownerName: "Dana Okafor",
    risk: "LOW",
    humanApproves: true,
    facesPublic: false,
    missing: [],
    ...overrides,
  });

  const entries = [
    make({ id: "a", name: "Comax - Prospect Search Agent", purpose: "Finds prospects", risk: "UNRATED" }),
    make({ id: "b", name: "Research Agent", ownerName: "", missing: ["Nobody is accountable for this."] }),
    make({ id: "c", name: "Main website bot", kind: "WIDGET", risk: "HIGH", model: "fast-mini-preview" }),
  ];

  test("no filters leaves the register alone", () => {
    expect(filterRegister(entries, NO_REGISTER_FILTERS)).toHaveLength(3);
  });

  test("searches the name", () => {
    const found = filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "research" });

    expect(found.map((entry) => entry.id)).toEqual(["b"]);
  });

  test("searches what a system is for, not only what it is called", () => {
    // Somebody looking for the prospecting assistant may not remember its name.
    const found = filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "prospects" });

    expect(found.map((entry) => entry.id)).toEqual(["a"]);
  });

  test("searches the person accountable and the model on the row", () => {
    expect(filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "dana" })).toHaveLength(2);
    expect(filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "fast-mini" })).toHaveLength(1);
  });

  test("ignores case and stray spacing, because people type how they type", () => {
    expect(filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "  RESEARCH " })).toHaveLength(1);
  });

  test("filters by rating", () => {
    const found = filterRegister(entries, { ...NO_REGISTER_FILTERS, risk: "HIGH" });

    expect(found.map((entry) => entry.id)).toEqual(["c"]);
  });

  test("filters by what kind of thing it is", () => {
    const found = filterRegister(entries, { ...NO_REGISTER_FILTERS, kind: "WIDGET" });

    expect(found.map((entry) => entry.id)).toEqual(["c"]);
  });

  test("shows only what needs a person", () => {
    const found = filterRegister(entries, { ...NO_REGISTER_FILTERS, attentionOnly: true });

    expect(found.map((entry) => entry.id)).toEqual(["b"]);
  });

  test("filters stack rather than replacing each other", () => {
    const found = filterRegister(entries, {
      ...NO_REGISTER_FILTERS,
      search: "agent",
      risk: "UNRATED",
    });

    expect(found.map((entry) => entry.id)).toEqual(["a"]);
  });

  test("nothing matching is empty rather than everything", () => {
    // The failure that turns a filter into a liar is falling back to the full
    // list when it matches nothing.
    expect(filterRegister(entries, { ...NO_REGISTER_FILTERS, search: "zzz" })).toEqual([]);
  });
});

describe("reordering the register without losing what it is for", () => {
  const make = (overrides: Partial<AiSystemEntry>): AiSystemEntry => ({
    id: "x",
    kind: "ASSISTANT",
    name: "Something",
    purpose: "Does a thing",
    ownerName: "Someone",
    risk: "LOW",
    humanApproves: true,
    facesPublic: false,
    missing: [],
    ...overrides,
  });

  const entries = [
    make({ id: "quiet", name: "Zeta sandbox", activity: 0, lastActiveAt: 10, risk: "UNRATED" }),
    make({ id: "busy", name: "Alpha research", activity: 200, lastActiveAt: 50, risk: "UNRATED" }),
    make({ id: "rated", name: "Mid discovery", activity: 11, lastActiveAt: 99, risk: "HIGH" }),
  ];

  test("the default still puts what needs a person first", () => {
    // The register exists to surface incomplete records. A screen that opens
    // sorted by name buries that under the alphabet.
    const incomplete = make({ id: "gap", activity: 0, missing: ["No purpose recorded."] });

    expect(sortRegisterBy([...entries, incomplete], "ATTENTION")[0].id).toBe("gap");
  });

  test("busiest first says which unrated system is actually urgent", () => {
    expect(sortRegisterBy(entries, "ACTIVITY").map((entry) => entry.id)).toEqual([
      "busy",
      "rated",
      "quiet",
    ]);
  });

  test("something with no activity figure sorts below something with none recorded as zero", () => {
    // A widget is not run the way an assistant is, and pretending it ran nought
    // times would rank it alongside an assistant that genuinely sat idle.
    const widget = make({ id: "widget", kind: "WIDGET", activity: undefined });

    expect(sortRegisterBy([widget, make({ id: "idle", activity: 0 })], "ACTIVITY").map((e) => e.id)).toEqual(
      ["idle", "widget"],
    );
  });

  test("most recently active first", () => {
    expect(sortRegisterBy(entries, "LAST_ACTIVE").map((entry) => entry.id)).toEqual([
      "rated",
      "busy",
      "quiet",
    ]);
  });

  test("by name, for finding one you already know", () => {
    expect(sortRegisterBy(entries, "NAME").map((entry) => entry.id)).toEqual([
      "busy",
      "rated",
      "quiet",
    ]);
  });

  test("riskiest first", () => {
    expect(sortRegisterBy(entries, "RISK")[0].id).toBe("rated");
  });

  test("sorting never loses an entry", () => {
    for (const sort of ["ATTENTION", "ACTIVITY", "LAST_ACTIVE", "NAME", "RISK"] as const) {
      expect(sortRegisterBy(entries, sort)).toHaveLength(3);
    }
  });
});
