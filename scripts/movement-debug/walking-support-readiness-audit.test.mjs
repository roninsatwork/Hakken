import { describe, expect, it } from "vitest";

import {
  auditWalkingSupportReadiness,
  formatWalkingSupportReadiness,
  parseWalkingSupportReadinessAuditArgs,
} from "./walking-support-readiness-audit.mjs";

const recordedProofCases = ["root-travel"];
const gameProofCases = ["strongest-root-travel"];

function proofRow({
  automatedStatus = "passed",
  candidateAmplitude,
  evidenceFrameCount,
  expectedMinimumAmplitude,
  nextAction = null,
  proofBlockerCode = automatedStatus === "missing-proof" ? "missing-analyzer-proof" : null,
  proofCase = "root-travel",
  recordingId = "recording-a",
  status = "passed",
} = {}) {
  return {
    automatedStatus,
    candidateAmplitude,
    evidenceFrameCount: evidenceFrameCount ?? (automatedStatus === "missing-proof" ? 0 : 12),
    expectedMinimumAmplitude,
    nextAction,
    proofBlockerCode,
    proofCase,
    recordingId,
    status,
  };
}

function semanticReview(cases = gameProofCases) {
  return {
    decisions: cases.map((proofCase) => ({
      decision: "readable-pass",
      reviewContext: {
        cases: [proofCase],
      },
    })),
  };
}

describe("walking support readiness audit", () => {
  it("parses audit arguments", () => {
    expect(parseWalkingSupportReadinessAuditArgs([
      "--manifest",
      "tmp/manifest.json",
      "--game-visual-plan",
      "tmp/plan.json",
      "--semantic-review",
      "tmp/review.json",
      "--recording-plan-out",
      "tmp/support-plan.json",
      "--strict",
      "--json",
    ])).toMatchObject({
      gameVisualPlanPath: "tmp/plan.json",
      json: true,
      manifestPath: "tmp/manifest.json",
      recordingPlanOutPath: "tmp/support-plan.json",
      semanticReviewPath: "tmp/review.json",
      strict: true,
    });
  });

  it("passes when one recording bundle has root-travel proof and Game readability", () => {
    const audit = auditWalkingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: gameProofCases,
        },
      },
      manifest: {
        rows: recordedProofCases.map((proofCase) => proofRow({ proofCase })),
      },
      semanticReview: semanticReview(),
    });

    expect(audit).toMatchObject({
      missingGamePlanCases: [],
      missingReadableGameCases: [],
      missingRecordedPassedProofCases: [],
      passingRecordingIds: ["recording-a"],
      productScopedRecordedProofCases: [],
      ready: true,
    });
    expect(formatWalkingSupportReadiness(audit)).toContain("Walking support readiness: ready");
  });

  it("keeps walking blocked when root travel is still product-scoped", () => {
    const audit = auditWalkingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: [],
        },
      },
      manifest: {
        rows: [
          proofRow({
            automatedStatus: "product-scope-limitation",
            candidateAmplitude: 0.003,
            evidenceFrameCount: 0,
            expectedMinimumAmplitude: 0.16,
            nextAction: "Capture a recording with larger, clearer movement amplitude for this proof case.",
            proofBlockerCode: "candidate-below-threshold",
            status: "product-scope-limitation",
          }),
        ],
      },
      semanticReview: semanticReview([]),
    });

    expect(audit).toMatchObject({
      missingGamePlanCases: ["strongest-root-travel"],
      missingAnalyzerProofCases: ["root-travel"],
      missingReadableGameCases: ["strongest-root-travel"],
      missingRecordedPassedProofCases: ["root-travel"],
      productScopedRecordedProofCases: ["root-travel"],
      ready: false,
    });
    expect(audit.missingAnalyzerProofReasons).toMatchObject({
      "root-travel": {
        amplitudeRatio: 0.01875,
        candidateAmplitude: 0.003,
        expectedMinimumAmplitude: 0.16,
        nextAction: "Capture a recording with larger, clearer movement amplitude for this proof case.",
        proofBlockerCode: "candidate-below-threshold",
        proofBlockerCounts: {
          "candidate-below-threshold": 1,
        },
        recordingId: "recording-a",
        recordingIds: ["recording-a"],
        searchedRecordingCount: 1,
      },
    });
    expect(audit.recordingGap.summary).toMatchObject({
      byProofCase: {
        "root-travel": 1,
      },
      captureScenarioCount: 1,
      minimumFreshRecordingCount: 1,
    });
    expect(audit.recordingGap.captureScenarios[0]).toMatchObject({
      freshRecordingLabel: "movement-proof-root-travel",
      id: "root-travel",
    });
    expect(audit.walkingProofCandidates[0]).toMatchObject({
      evidenceProofCaseCount: 0,
      passedProofCaseCount: 0,
      productScopedProofCases: ["root-travel"],
      recordingId: "recording-a",
    });
    expect(formatWalkingSupportReadiness(audit)).toContain("Walking support readiness: blocked");
    expect(formatWalkingSupportReadiness(audit)).toContain("Product-scoped recorded proof cases: root-travel");
    expect(formatWalkingSupportReadiness(audit)).toContain("- root-travel: candidate-below-threshold; searched 1 recording; best candidate 0.003/0.160 (2%); blockers candidate-below-threshold:1; Capture a recording with larger, clearer movement amplitude for this proof case.");
    expect(formatWalkingSupportReadiness(audit)).toContain("Recording gap plan: 1 row(s); 1 action group(s); 1 capture scenario(s); 1 fresh recording(s) minimum");
    expect(formatWalkingSupportReadiness(audit)).toContain("Fresh recording scenario: movement-proof-root-travel");
    expect(formatWalkingSupportReadiness(audit)).toContain("Quick validation: npm run movement:proof:validate:root-travel");
    expect(formatWalkingSupportReadiness(audit)).toContain("Next recording targets: root-travel");
  });

  it("turns product-scoped below-threshold root travel into a promotion recording task", () => {
    const audit = auditWalkingSupportReadiness({
      gameVisualPlan: { summary: { proofCases: [] } },
      manifest: {
        rows: [
          proofRow({
            automatedStatus: "product-scope-limitation",
            candidateAmplitude: 0.004,
            evidenceFrameCount: 0,
            expectedMinimumAmplitude: 0.16,
            nextAction: "No action; this proof case is outside the current user-facing recorded proof gate.",
            proofBlockerCode: null,
            status: "product-scope-limitation",
          }),
        ],
      },
      semanticReview: semanticReview([]),
    });

    expect(audit.missingAnalyzerProofReasons).toMatchObject({
      "root-travel": {
        nextAction: "Capture a recording with larger, clearer root-travel movement for walking promotion.",
        proofBlockerCode: "candidate-below-threshold",
        proofBlockerCounts: {
          "candidate-below-threshold": 1,
        },
      },
    });
    expect(audit.recordingGap.summary).toMatchObject({
      byBlockerCode: {
        "candidate-below-threshold": 1,
      },
      byPriority: {
        "recording-high": 1,
      },
      byTriageDisposition: {
        "no-readable-motion-rerecord": 1,
      },
    });
    expect(audit.recordingGap.summary.topActionGroups[0]).toMatchObject({
      blockerCode: "candidate-below-threshold",
      recommendedAction: "Capture a recording with larger, clearer movement amplitude for this proof case.",
    });
  });
});
