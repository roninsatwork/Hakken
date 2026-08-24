import { describe, expect, test } from "vitest";
import {
  DAY_MS,
  describeActions,
  describeOutcome,
  describeToolPlainly,
  describeTrigger,
  isWithin,
  narrateRun,
  periodEndingNow,
  summarisePack,
  trimObjective,
  type ToolAction,
} from "./evidencePackService";

const action = (overrides: Partial<ToolAction> = {}): ToolAction => ({
  normalizedToolName: "search_knowledge",
  sideEffectLevel: "READ",
  status: "SUCCESS",
  blocked: false,
  ...overrides,
});

describe("nothing in the pack is written for a developer", () => {
  test("a tool name becomes something a reader recognises", () => {
    expect(describeToolPlainly("send_email_notification")).toBe("send email notification");
    expect(describeToolPlainly("salesDataUpsertCustomer")).toBe("sales data upsert customer");
  });

  test("an unnamed tool still reads as a sentence", () => {
    expect(describeToolPlainly("")).toBe("an unnamed action");
  });

  test("an outcome is a sentence, not a status code", () => {
    expect(describeOutcome("SUCCESS")).toBe("It finished what it was asked to do.");
    expect(describeOutcome("FAILED")).toContain("stopped before finishing");
  });

  test("how a run started distinguishes oversight from none", () => {
    // "A schedule started it, with nobody watching" is a different fact about
    // oversight than "someone asked it to", and an auditor cares about which.
    expect(describeTrigger("SCHEDULE")).toContain("nobody watching");
    expect(describeTrigger("CHAT")).toContain("Someone asked it to");
  });

  test("an unrecognised trigger still says something true", () => {
    expect(describeTrigger("SOMETHING_NEW")).toContain("how was not recorded");
  });
});

describe("what a run did, grouped by consequence", () => {
  test("a run that only read says so", () => {
    expect(describeActions([action(), action()])).toEqual([
      "It looked things up 2 times, changing nothing.",
    ]);
  });

  test("a single action reads as once, not 1 times", () => {
    expect(describeActions([action()])[0]).toContain("once");
  });

  test("changes are named, because that is what a reader wants", () => {
    const lines = describeActions([action({ normalizedToolName: "crm_update", sideEffectLevel: "WRITE" })]);

    expect(lines[0]).toBe("It made changes once: crm update.");
  });

  test("a refusal is reported, and is the sentence that matters most", () => {
    const lines = describeActions([action({ normalizedToolName: "send_email", blocked: true })]);

    expect(lines[0]).toContain("was not allowed to do, and was stopped");
    expect(lines[0]).toContain("send email");
  });

  test("repeated calls to the same tool are named once", () => {
    const lines = describeActions([
      action({ normalizedToolName: "crm_update", sideEffectLevel: "WRITE" }),
      action({ normalizedToolName: "crm_update", sideEffectLevel: "WRITE" }),
    ]);

    expect(lines[0]).toBe("It made changes 2 times: crm update.");
  });

  test("a run that did nothing outside the conversation says that", () => {
    expect(describeActions([])).toEqual(["It did not take any action outside the conversation."]);
  });
});

describe("a whole run reads as a short paragraph", () => {
  test("in the order a reader asks in", () => {
    const lines = narrateRun({
      agentName: "Invoice checker",
      objective: "Check last month's invoices against purchase orders",
      trigger: "SCHEDULE",
      status: "SUCCESS",
      actions: [action({ normalizedToolName: "crm_update", sideEffectLevel: "WRITE" })],
      approvedBy: "Danette Cole",
      approvalReason: "Checked the totals myself",
    });

    expect(lines[0]).toBe(
      "Invoice checker was asked to: Check last month's invoices against purchase orders."
    );
    expect(lines[1]).toContain("A schedule started it");
    expect(lines[2]).toContain("It made changes");
    expect(lines[3]).toBe("Danette Cole approved it, saying: Checked the totals myself");
    expect(lines[4]).toBe("It finished what it was asked to do.");
  });

  test("an approval with no reason still names who gave it", () => {
    const lines = narrateRun({
      agentName: "Invoice checker",
      objective: "Do a thing",
      trigger: "MANUAL",
      status: "SUCCESS",
      actions: [],
      approvedBy: "Ravi Menon",
    });

    expect(lines).toContain("Ravi Menon approved it.");
  });

  test("no approval line appears when nobody approved anything", () => {
    const lines = narrateRun({
      agentName: "Invoice checker",
      objective: "Do a thing",
      trigger: "MANUAL",
      status: "SUCCESS",
      actions: [],
    });

    expect(lines.some((line) => line.includes("approved"))).toBe(false);
  });

  test("a run with no recorded objective does not leave a blank", () => {
    const lines = narrateRun({
      agentName: "Invoice checker",
      objective: "   ",
      trigger: "MANUAL",
      status: "SUCCESS",
      actions: [],
    });

    expect(lines[0]).toBe("Invoice checker was asked to: nothing was recorded.");
  });
});

describe("an objective is free text and has to survive being long", () => {
  test("a short one gains a full stop rather than being left hanging", () => {
    expect(trimObjective("Check the invoices")).toBe("Check the invoices.");
  });

  test("one that already ends in a full stop is left alone", () => {
    expect(trimObjective("Check the invoices.")).toBe("Check the invoices.");
  });

  test("a very long one is cut and marked as cut", () => {
    expect(trimObjective("x".repeat(400))).toHaveLength(241);
    expect(trimObjective("x".repeat(400)).endsWith("…")).toBe(true);
  });
});

describe("the period covers what it says it covers", () => {
  test("a seven-day period ends now and starts seven days back", () => {
    const now = 1_000 * DAY_MS;
    expect(periodEndingNow(7, now)).toEqual({ from: now - 7 * DAY_MS, to: now });
  });

  test("both ends are included", () => {
    const period = { from: 100, to: 200 };
    expect(isWithin(period, 100)).toBe(true);
    expect(isWithin(period, 200)).toBe(true);
  });

  test("anything outside is out", () => {
    const period = { from: 100, to: 200 };
    expect(isWithin(period, 99)).toBe(false);
    expect(isWithin(period, 201)).toBe(false);
  });

  test("something with no time at all is not counted in", () => {
    expect(isWithin({ from: 0, to: 1 }, undefined)).toBe(false);
  });
});

describe("the summary line at the top", () => {
  test("says the four numbers a reader looks for", () => {
    expect(summarisePack({ systems: 14, runs: 30, approvals: 4, blocked: 2 })).toBe(
      "14 AI systems, 30 runs, 4 human decisions. 2 actions were blocked."
    );
  });

  test("singulars read properly", () => {
    expect(summarisePack({ systems: 1, runs: 1, approvals: 1, blocked: 1 })).toBe(
      "1 AI system, 1 run, 1 human decision. 1 action was blocked."
    );
  });

  test("nothing blocked is stated rather than left out", () => {
    // An absent sentence reads as an omission; "Nothing was blocked" is a
    // finding, and it is the one most packs will carry.
    expect(summarisePack({ systems: 2, runs: 5, approvals: 0, blocked: 0 })).toContain(
      "Nothing was blocked."
    );
  });
});
