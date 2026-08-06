import { describe, expect, test } from "vitest";
import {
  AGENT_RISK_LEVELS,
  autonomyAfterRiskChange,
  describeRiskChange,
  refusalForAutonomy,
  requiresHumanApproval,
  resolveRisk,
} from "./agentRiskService";

describe("a rating restrains the platform rather than describing it", () => {
  test("high risk means a person has to approve", () => {
    expect(requiresHumanApproval("HIGH")).toBe(true);
  });

  test("lower ratings do not force the gate", () => {
    expect(requiresHumanApproval("MEDIUM")).toBe(false);
    expect(requiresHumanApproval("LOW")).toBe(false);
  });

  test("an unrated assistant is not forced either", () => {
    // Everything that predates the register is unrated. Refusing to run it
    // would have switched off working assistants the moment this shipped, and a
    // classification scheme should not break what it has not yet classified.
    expect(requiresHumanApproval(undefined)).toBe(false);
  });

  test("the three ratings are offered weakest first", () => {
    expect(AGENT_RISK_LEVELS).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });
});

describe("switching approval off is refused, not honoured", () => {
  test("a high-risk assistant cannot be set to run unattended", () => {
    expect(refusalForAutonomy({ risk: "HIGH", autonomous: true })).toContain("high risk");
  });

  test("the refusal says what to do about it", () => {
    // A refusal that does not name the way out is a dead end.
    expect(refusalForAutonomy({ risk: "HIGH", autonomous: true })).toContain(
      "Lower its risk rating first"
    );
  });

  test("a lower-rated assistant may run unattended", () => {
    expect(refusalForAutonomy({ risk: "MEDIUM", autonomous: true })).toBeNull();
    expect(refusalForAutonomy({ risk: "LOW", autonomous: true })).toBeNull();
  });

  test("leaving approval on is never refused, whatever the rating", () => {
    for (const risk of [...AGENT_RISK_LEVELS, undefined]) {
      expect(refusalForAutonomy({ risk, autonomous: false })).toBeNull();
      expect(refusalForAutonomy({ risk, autonomous: undefined })).toBeNull();
    }
  });
});

describe("raising the rating closes the gate instead of failing", () => {
  test("an unattended assistant raised to high risk gets its gate back", () => {
    // The most useful thing a compliance officer can do. Refusing it would
    // punish exactly the right instinct.
    expect(autonomyAfterRiskChange({ risk: "HIGH", autonomous: true })).toBe(false);
  });

  test("nothing changes when the rating does not require approval", () => {
    expect(autonomyAfterRiskChange({ risk: "LOW", autonomous: true })).toBe(true);
    expect(autonomyAfterRiskChange({ risk: undefined, autonomous: true })).toBe(true);
  });

  test("an already-gated assistant is left alone", () => {
    expect(autonomyAfterRiskChange({ risk: "HIGH", autonomous: false })).toBe(false);
    expect(autonomyAfterRiskChange({ risk: "HIGH", autonomous: undefined })).toBeUndefined();
  });
});

describe("a rating that was not sent leaves the existing one alone", () => {
  test("keeps what is there", () => {
    expect(resolveRisk(undefined, "MEDIUM")).toBe("MEDIUM");
  });

  test("takes what was sent", () => {
    expect(resolveRisk("HIGH", "LOW")).toBe("HIGH");
  });

  test("stays unrated when neither says", () => {
    expect(resolveRisk(undefined, undefined)).toBeUndefined();
  });
});

describe("the audit record says what an auditor is looking for", () => {
  test("names both ends of the change", () => {
    expect(describeRiskChange({ from: "LOW", to: "HIGH", gateClosed: false })).toBe(
      "Risk rating changed from low to high."
    );
  });

  test("says so when a gate closed as a result", () => {
    expect(describeRiskChange({ from: "LOW", to: "HIGH", gateClosed: true })).toContain(
      "Human approval was switched back on"
    );
  });

  test("calls an absent rating unrated rather than leaving a blank", () => {
    expect(describeRiskChange({ from: undefined, to: "MEDIUM", gateClosed: false })).toBe(
      "Risk rating changed from unrated to medium."
    );
  });
});
