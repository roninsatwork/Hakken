import { describe, expect, it } from "vitest";

import {
  auditFacingOcclusionSupportReadiness,
  formatFacingOcclusionSupportReadiness,
  parseFacingOcclusionSupportReadinessAuditArgs,
} from "./facing-occlusion-support-readiness-audit.mjs";

function analysisFixture({ userFacing = false } = {}) {
  return [
    {
      coverage: {
        summary: {
          internalDemoOnlyFamilies: userFacing ? [] : ["facing-occlusion"],
          missingProofFamilies: userFacing ? [] : ["facing-occlusion"],
          userFacingFamilies: userFacing ? ["facing-occlusion"] : [],
        },
      },
      sessionId: "recording-a",
    },
  ];
}

function manifestWithManualReviewCandidate(recordingId = "candidate-recording") {
  return {
    rows: [
      {
        automatedStatus: "passed",
        evidenceFrameCount: 12,
        proofBlockerCode: "manual-review-pending",
        proofCase: "facing-occlusion-recovery",
        recordingId,
        status: "manual-review",
      },
      {
        automatedStatus: "passed",
        evidenceFrameCount: 1,
        proofBlockerCode: "manual-review-pending",
        proofCase: "side-swap-recovery",
        recordingId,
        status: "manual-review",
      },
      {
        automatedStatus: "passed",
        evidenceFrameCount: 5,
        proofBlockerCode: "manual-review-pending",
        proofCase: "self-occlusion-recovery",
        recordingId,
        status: "manual-review",
      },
    ],
  };
}

function manifestWithPassedCandidate(recordingId = "candidate-recording") {
  return {
    rows: [
      "facing-occlusion-recovery",
      "side-swap-recovery",
      "self-occlusion-recovery",
    ].map((proofCase) => ({
      automatedStatus: "passed",
      evidenceFrameCount: 1,
      proofBlockerCode: null,
      proofCase,
      recordingId,
      status: "passed",
    })),
  };
}

function focusedGamePlanFixture() {
  return {
    summary: {
      proofCases: [
        "strongest-facing-occlusion-recovery",
        "strongest-side-swap-recovery",
      ],
    },
  };
}

function readableGameReviewFixture() {
  return {
    decisions: [
      {
        decision: "readable-pass",
        reviewContext: {
          cases: ["strongest-facing-occlusion-recovery"],
        },
      },
      {
        decision: "readable-pass",
        reviewContext: {
          cases: ["strongest-side-swap-recovery"],
        },
      },
    ],
  };
}

describe("facing/occlusion support readiness audit", () => {
  it("keeps facing/occlusion diagnostic-only with concrete blockers", () => {
    const audit = auditFacingOcclusionSupportReadiness({
      analysis: analysisFixture(),
    });

    expect(audit.ready).toBe(false);
    expect(audit.proofReadyForPromotion).toBe(false);
    expect(audit.internalDiagnostic).toBe(true);
    expect(audit.missingRecordedEvidenceRequirements).toEqual([
      "recorded fallback/readability proof",
      "side-swap recovery evidence",
      "self-occlusion recovery evidence",
    ]);
    expect(audit.missingGamePlanCases).toEqual([
      "strongest-facing-occlusion-recovery",
      "strongest-side-swap-recovery",
    ]);
    expect(audit.recordingGap.captureScenarios[0]).toMatchObject({
      freshRecordingLabel: "movement-proof-facing-occlusion-recovery",
      proofCases: [
        "facing-occlusion-recovery",
        "self-occlusion-recovery",
        "side-swap-recovery",
      ],
      quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-facing-occlusion-recovery --quiet",
    });
    expect(formatFacingOcclusionSupportReadiness(audit)).toContain(
      "Keep facing/occlusion diagnostic-only",
    );
    expect(formatFacingOcclusionSupportReadiness(audit)).toContain(
      "Fresh recording scenario: movement-proof-facing-occlusion-recovery",
    );
  });

  it("still blocks if product truth is changed before proof exists", () => {
    const audit = auditFacingOcclusionSupportReadiness({
      analysis: analysisFixture({ userFacing: true }),
    });

    expect(audit.ready).toBe(false);
    expect(audit.proofReadyForPromotion).toBe(false);
    expect(audit.userFacing).toBe(true);
    expect(audit.missingRecordedEvidenceRequirements.length).toBeGreaterThan(0);
  });

  it("reports review-conversion candidates instead of fresh recording when analyzer and Game evidence exist", () => {
    const audit = auditFacingOcclusionSupportReadiness({
      analysis: analysisFixture(),
      gameVisualPlan: focusedGamePlanFixture(),
      manifest: manifestWithManualReviewCandidate("recording-candidate"),
      semanticReview: readableGameReviewFixture(),
    });

    expect(audit.ready).toBe(false);
    expect(audit.proofReadyForPromotion).toBe(false);
    expect(audit.missingAnalyzerProofCases).toEqual([]);
    expect(audit.missingGamePlanCases).toEqual([]);
    expect(audit.missingReadableGameCases).toEqual([]);
    expect(audit.recordedReviewCandidateIds).toEqual(["recording-candidate"]);
    expect(audit.recordedReviewPendingCases).toEqual([
      "facing-occlusion-recovery",
      "side-swap-recovery",
      "self-occlusion-recovery",
    ]);
    expect(audit.recordingGap.captureScenarios).toEqual([]);
    expect(audit.nextActions.join(" ")).toContain("Review existing facing/occlusion candidate recording(s) recording-candidate");
  });

  it("distinguishes closed proof from user-facing promotion truth", () => {
    const internalAudit = auditFacingOcclusionSupportReadiness({
      analysis: analysisFixture(),
      gameVisualPlan: focusedGamePlanFixture(),
      manifest: manifestWithPassedCandidate("recording-candidate"),
      semanticReview: readableGameReviewFixture(),
    });

    expect(internalAudit.ready).toBe(false);
    expect(internalAudit.proofReadyForPromotion).toBe(true);
    expect(internalAudit.decision).toContain("proof is ready for promotion review");
    expect(internalAudit.nextActions.join(" ")).toContain("product-truth promotion decision");

    const userFacingAudit = auditFacingOcclusionSupportReadiness({
      analysis: analysisFixture({ userFacing: true }),
      gameVisualPlan: focusedGamePlanFixture(),
      manifest: manifestWithPassedCandidate("recording-candidate"),
      semanticReview: readableGameReviewFixture(),
    });

    expect(userFacingAudit.ready).toBe(true);
    expect(userFacingAudit.proofReadyForPromotion).toBe(true);
  });

  it("parses CLI options", () => {
    expect(parseFacingOcclusionSupportReadinessAuditArgs([
      "--analysis",
      "analysis.json",
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
      analysisPath: "analysis.json",
      gameVisualPlanPath: "plan.json",
      json: true,
      manifestPath: "manifest.json",
      recordingPlanOutPath: "recording-plan.json",
      semanticReviewPath: "review.json",
      strict: true,
    });
  });
});
