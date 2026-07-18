import { describe, expect, it } from "vitest";
import { auditDeepCaptureTieredFinishGate } from "./deep-capture-tiered-finish-gate.mjs";

function summary(proofTier, recordingCount) {
  return {
    exactChecksumDivergenceCount: 0,
    passed: true,
    proofProfile: "deep-capture-v1",
    proofTier,
    recordingCount,
  };
}

describe("Deep Capture tiered finish gate", () => {
  it("requires each prior tier in order", () => {
    const report = auditDeepCaptureTieredFinishGate({
      summaries: { representative: summary("representative", 3) },
      through: "representative",
    });
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("targeted: summary is missing");
  });

  it("passes targeted, representative, and all-nine only with exact current Deep Capture summaries", () => {
    expect(auditDeepCaptureTieredFinishGate({
      summaries: {
        "all-nine": summary("all-nine", 9),
        representative: summary("representative", 3),
        targeted: summary("targeted", 1),
      },
    })).toMatchObject({ passed: true, requiredTiers: ["targeted", "representative", "all-nine"] });
  });

  it("rejects legacy profiles, wrong tier sizes, and exact boundary drift", () => {
    const targeted = summary("targeted", 1);
    targeted.proofProfile = "commissioning-v2";
    targeted.exactChecksumDivergenceCount = 1;
    const report = auditDeepCaptureTieredFinishGate({ summaries: { targeted }, through: "targeted" });
    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("not Deep Capture"),
      expect.stringContaining("divergence"),
    ]));
  });
});
