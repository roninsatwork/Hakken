import { describe, expect, it } from "vitest";

import {
  auditSittingSupportReadiness,
  formatSittingSupportReadiness,
  parseSittingSupportReadinessAuditArgs,
} from "./sitting-support-readiness-audit.mjs";

const recordedProofCases = [
  "seated-neutral",
  "seated-twist",
  "seated-forward-fold",
  "seated-leg-lift",
  "chair-contact",
];

const gameProofCases = [
  "strongest-seated-chair-contact",
  "strongest-seated-twist",
  "strongest-seated-forward-fold",
  "strongest-seated-leg-lift",
];

function proofRow({
  automatedStatus = "passed",
  candidateAmplitude = automatedStatus === "passed" ? 1 : null,
  expectedMinimumAmplitude = null,
  nextAction = null,
  proofBlockerCode = automatedStatus === "passed" ? null : "missing-analyzer-proof",
  proofCase,
  recordingId = "recording-a",
  status = "passed",
} = {}) {
  return {
    automatedStatus,
    candidateAmplitude,
    evidenceFrameCount: automatedStatus === "passed" ? 10 : 0,
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

describe("sitting support readiness audit", () => {
  it("parses audit arguments", () => {
    expect(parseSittingSupportReadinessAuditArgs([
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

  it("passes when one recording bundle has all seated proof and Game readability", () => {
    const audit = auditSittingSupportReadiness({
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
      ready: true,
    });
    expect(formatSittingSupportReadiness(audit)).toContain("Sitting support readiness: ready");
  });

  it("keeps sitting blocked when opt-in rows only have partial analyzer proof", () => {
    const audit = auditSittingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: [
            "strongest-seated-chair-contact",
            "strongest-seated-twist",
          ],
        },
      },
      manifest: {
        rows: [
          proofRow({ proofCase: "seated-neutral", status: "manual-review" }),
          proofRow({ proofCase: "seated-twist", status: "manual-review" }),
          proofRow({
            automatedStatus: "missing-proof",
            candidateAmplitude: 0,
            expectedMinimumAmplitude: 1,
            nextAction: "Record or tag a stronger seated-forward-fold sample.",
            proofBlockerCode: "candidate-below-threshold",
            proofCase: "seated-forward-fold",
            status: "missing-proof",
          }),
          proofRow({
            automatedStatus: "missing-proof",
            proofCase: "seated-leg-lift",
            status: "missing-proof",
          }),
          proofRow({ proofCase: "chair-contact", status: "manual-review" }),
        ],
      },
      semanticReview: semanticReview([
        "strongest-seated-chair-contact",
      ]),
    });

    expect(audit).toMatchObject({
      missingAnalyzerProofCases: [
        "seated-forward-fold",
        "seated-leg-lift",
      ],
      missingAnalyzerProofReasons: {
        "seated-forward-fold": {
          candidateAmplitude: 0,
          expectedMinimumAmplitude: 1,
          nextAction: "Record or tag a stronger seated-forward-fold sample.",
          proofBlockerCode: "candidate-below-threshold",
          proofBlockerCounts: {
            "candidate-below-threshold": 1,
          },
          recordingId: "recording-a",
          recordingIds: ["recording-a"],
          searchedRecordingCount: 1,
        },
        "seated-leg-lift": {
          proofBlockerCode: "missing-analyzer-proof",
          proofBlockerCounts: {
            "missing-analyzer-proof": 1,
          },
          recordingId: "recording-a",
          recordingIds: ["recording-a"],
          searchedRecordingCount: 1,
        },
      },
      missingGamePlanCases: [
        "strongest-seated-forward-fold",
        "strongest-seated-leg-lift",
      ],
      missingReadableGameCases: [
        "strongest-seated-twist",
        "strongest-seated-forward-fold",
        "strongest-seated-leg-lift",
      ],
      missingRecordedPassedProofCases: recordedProofCases,
      ready: false,
      reviewPendingRecordedProofCases: [
        "seated-neutral",
        "seated-twist",
        "chair-contact",
      ],
    });
    expect(audit.recordingGap.summary).toMatchObject({
      byProofCase: {
        "seated-forward-fold": 1,
        "seated-leg-lift": 1,
      },
      byPriority: {
        "recording-high": 1,
        recording: 1,
      },
      captureScenarioCount: 2,
      minimumFreshRecordingCount: 2,
    });
    expect(audit.recordingGap.captureScenarios[0]).toMatchObject({
      freshRecordingLabel: "movement-proof-seated-forward-fold",
      id: "seated-forward-fold",
      proofCases: ["seated-forward-fold"],
    });
    expect(audit.seatedProofCandidates[0]).toMatchObject({
      analyzerProofCaseCount: 3,
      missingAnalyzerProofCases: [
        "seated-forward-fold",
        "seated-leg-lift",
      ],
      recordingId: "recording-a",
      reviewPendingProofCaseCount: 3,
      reviewPendingProofCases: [
        "seated-neutral",
        "seated-twist",
        "chair-contact",
      ],
    });
    expect(formatSittingSupportReadiness(audit)).toContain("Sitting support readiness: blocked");
    expect(formatSittingSupportReadiness(audit)).toContain("Next recording targets: seated-forward-fold, seated-leg-lift");
    expect(formatSittingSupportReadiness(audit)).toContain("- seated-forward-fold: candidate-below-threshold; best 0.000/1.000; searched 1 recording; blockers candidate-below-threshold:1; Record or tag a stronger seated-forward-fold sample.");
    expect(formatSittingSupportReadiness(audit)).toContain("Recording gap plan: 2 row(s); 2 action group(s); 2 capture scenario(s); 2 fresh recording(s) minimum");
    expect(formatSittingSupportReadiness(audit)).toContain("Fresh recording scenario: movement-proof-seated-forward-fold");
    expect(formatSittingSupportReadiness(audit)).toContain("Quick validation: npm run movement:proof:validate:seated-forward-fold");
    expect(formatSittingSupportReadiness(audit)).toContain("Next review targets: seated-neutral, seated-twist, chair-contact");
  });
});
