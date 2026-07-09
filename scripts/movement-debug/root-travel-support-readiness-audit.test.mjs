import { describe, expect, it } from "vitest";

import {
  auditRootTravelSupportReadiness,
  formatRootTravelSupportReadiness,
  parseRootTravelSupportReadinessAuditArgs,
} from "./root-travel-support-readiness-audit.mjs";

function proofRow({
  automatedStatus = "product-scope-limitation",
  candidateAmplitude = 0.002,
  expectedMinimumAmplitude = 0.16,
  proofBlockerCode = "candidate-below-threshold",
  recordingId = "recording-a",
  status = "product-scope-limitation",
} = {}) {
  return {
    automatedStatus,
    candidateAmplitude,
    evidenceFrameCount: 0,
    expectedMinimumAmplitude,
    proofBlockerCode,
    proofCase: "root-travel",
    recordingId,
    status,
  };
}

describe("root-travel support readiness audit", () => {
  it("keeps root-travel blocked with the walking/root-travel proof requirements", () => {
    const audit = auditRootTravelSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: [],
        },
      },
      manifest: {
        rows: [proofRow()],
      },
      semanticReview: {
        decisions: [],
      },
    });

    expect(audit).toMatchObject({
      decision: "Keep root-travel internal preview/demo-only; recorded root-travel proof is not ready for product support.",
      family: "root-travel",
      missingAnalyzerProofCases: ["root-travel"],
      missingGamePlanCases: ["strongest-root-travel"],
      missingReadableGameCases: ["strongest-root-travel"],
      missingRecordedPassedProofCases: ["root-travel"],
      productScopedRecordedProofCases: ["root-travel"],
      ready: false,
    });
    expect(audit.recordingGap.captureScenarios[0]).toMatchObject({
      freshRecordingLabel: "movement-proof-root-travel",
      quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet",
    });
    expect(formatRootTravelSupportReadiness(audit)).toContain("Root-travel support readiness: blocked");
    expect(formatRootTravelSupportReadiness(audit)).toContain("Fresh recording scenario: movement-proof-root-travel");
  });

  it("parses CLI options", () => {
    expect(parseRootTravelSupportReadinessAuditArgs([
      "--manifest",
      "manifest.json",
      "--game-visual-plan",
      "plan.json",
      "--semantic-review",
      "review.json",
      "--recording-plan-out",
      "recording-plan.json",
      "--strict",
      "--json",
    ])).toMatchObject({
      gameVisualPlanPath: "plan.json",
      json: true,
      manifestPath: "manifest.json",
      recordingPlanOutPath: "recording-plan.json",
      semanticReviewPath: "review.json",
      strict: true,
    });
  });
});
