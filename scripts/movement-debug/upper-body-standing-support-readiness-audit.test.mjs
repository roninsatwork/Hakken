import { describe, expect, it } from "vitest";

import {
  applyBroadCaptureContractArgs,
  auditUpperBodyStandingSupportReadiness,
  formatBroadCaptureContract,
  formatBroadCaptureGuide,
  formatBroadCandidateReview,
  mergeGameVisualPlans,
  mergeSemanticReviews,
  parseUpperBodyStandingSupportReadinessAuditArgs,
} from "./upper-body-standing-support-readiness-audit.mjs";

function row(recordingId, proofCase, status = "passed", overrides = {}) {
  return {
    proofCase,
    recordingId,
    status,
    ...overrides,
  };
}

function decision(proofCase) {
  return {
    decision: "readable-pass",
    reviewContext: {
      cases: [proofCase],
    },
  };
}

const broadManifestProofCases = [
  "standing-arm-raise",
  "standing-twist",
  "standing-reach",
  "shoulder-scapula-control",
];

const broadReadableGameCases = [
  "strongest-side-bend",
  "strongest-head-direction",
  "strongest-standing-arm-raise",
  "strongest-standing-twist",
  "strongest-standing-reach",
];
const narrowReadableGameCases = [
  "strongest-side-bend",
  "strongest-head-direction",
];

describe("upper body standing support readiness audit", () => {
  it("blocks broad support when only narrow side-bend and head-direction proof exists", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: ["baseline", "strongest-squat"],
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          row("recording-b", "standing"),
          row("recording-b", "head-direction"),
        ],
      },
      semanticReview: {
        decisions: [
          decision("baseline"),
          decision("strongest-squat"),
        ],
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingBroadGamePlanCases: broadReadableGameCases,
      missingBroadManifestProofCases: broadManifestProofCases,
      missingBroadPassedProofCases: broadManifestProofCases,
      missingBroadReadableGameCases: broadReadableGameCases,
      missingNarrowGamePlanCases: narrowReadableGameCases,
      missingNarrowReadableGameCases: narrowReadableGameCases,
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: false,
    });
  });

  it("marks a narrow side-bend/head-direction claim ready when recorded and Game readability proof exist", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: narrowReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
        ],
      },
      semanticReview: {
        decisions: narrowReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingNarrowGamePlanCases: [],
      missingNarrowReadableGameCases: [],
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: true,
    });
  });

  it("passes when broad manifest proof and Game readability are both present", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: broadReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          ...broadManifestProofCases.map((proofCase) => row("recording-a", proofCase)),
        ],
      },
      semanticReview: {
        decisions: broadReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadReady: true,
      missingBroadGamePlanCases: [],
      missingBroadManifestProofCases: [],
      missingBroadPassedProofCases: [],
      missingBroadReadableGameCases: [],
      missingNarrowGamePlanCases: [],
      missingNarrowReadableGameCases: [],
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: true,
    });
  });

  it("reports product-scoped broad evidence without treating it as passed proof", () => {
    const productScopedEvidence = {
      evidenceFrameCount: 12,
      expectedMinimumAmplitude: 1,
      observedAmplitude: 2,
    };
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: broadReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          ...broadManifestProofCases.map((proofCase) => (
            row("recording-a", proofCase, "product-scope-limitation", productScopedEvidence)
          )),
          row("recording-b", "standing-arm-raise", "product-scope-limitation", productScopedEvidence),
          row("recording-b", "standing-twist", "product-scope-limitation", {
            evidenceFrameCount: 0,
            expectedMinimumAmplitude: 1,
            observedAmplitude: 0,
          }),
        ],
      },
      semanticReview: {
        decisions: broadReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingBroadPassedProofCases: broadManifestProofCases,
      productScopedBroadEvidenceRecordingIds: ["recording-a"],
      productScopedBroadEvidenceCandidates: [
        {
          missingProductScopedEvidenceCases: [],
          recordingId: "recording-a",
          totalEvidenceFrameCount: 48,
        },
        {
          missingProductScopedEvidenceCases: [
            "standing-twist",
            "standing-reach",
            "shoulder-scapula-control",
          ],
          recordingId: "recording-b",
          totalEvidenceFrameCount: 12,
        },
      ],
      productScopedBroadEvidenceSummary: {
        "standing-arm-raise": {
          evidenceProductScopeCount: 2,
          maxObservedAmplitude: 2,
          productScopeCount: 2,
        },
        "standing-twist": {
          evidenceProductScopeCount: 1,
          maxObservedAmplitude: 2,
          productScopeCount: 2,
        },
      },
    });

    const review = formatBroadCandidateReview(audit);
    expect(review).toContain("# Broad Upper-Body Standing Candidate Review");
    expect(review).toContain("`recording-a`");
    expect(review).toContain("standing-arm-raise: 12 frame(s), observed 2");
    expect(review).toContain("Capture Protocol");
    expect(review).toContain("Capture a new explicit broad upper-body bundle");

    const captureGuide = formatBroadCaptureGuide(audit, { captureLabel: "broad explicit!" });
    expect(captureGuide).toContain("# Broad Upper-Body Standing Explicit Capture Guide");
    expect(captureGuide).toContain("Suggested recording label: `broad-explicit-`");
    expect(captureGuide).toContain("--recording-ids <new-recording-id>");
    expect(captureGuide).toContain("pass `--recording-id <id>`");
    expect(captureGuide).toContain("--include-standing-upper-body-targets");
    expect(captureGuide).toContain("--include-broad-upper-body-product-scope-proof");
    expect(captureGuide).toContain("movement:replay:proof-set");
    expect(captureGuide).toContain("movement:replay:review");
    expect(captureGuide).toContain("--manifest tmp/movement-replay-lab/broad-explicit--analysis-reviewed.proof-manifest.json");
    expect(captureGuide).toContain("--proof-case strongest-standing-arm-raise");
    expect(captureGuide).toContain("movement:upper-body-standing-support-audit");
    expect(captureGuide).toContain("--capture-contract <capture-contract-file>");

    const recordingIdGuide = formatBroadCaptureGuide(audit, {
      captureLabel: "broad explicit!",
      recordingId: "rec_123 upper",
    });
    expect(recordingIdGuide).toContain("recording id `rec_123 upper`");
    expect(recordingIdGuide).toContain("--recording-ids 'rec_123 upper'");
    expect(recordingIdGuide).not.toContain("--recording-ids <new-recording-id>");

    const contract = formatBroadCaptureContract(audit, {
      captureLabel: "broad explicit!",
      recordingId: "rec_123 upper",
    });
    expect(contract).toMatchObject({
      broadReady: false,
      recordingId: "rec_123 upper",
      recordingIdPlaceholder: null,
      requiredGameProofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-twist",
        "strongest-standing-reach",
      ],
      requiredRecordedProofCases: broadManifestProofCases,
      safeLabel: "broad-explicit-",
      schema: "sonae-broad-upper-body-capture-contract/v1",
    });
    expect(contract.commands).toHaveLength(8);
    expect(contract.commands[0]).toMatchObject({
      id: "initial-analysis",
    });
    expect(contract.commands[0].command).toContain("--recording-ids 'rec_123 upper'");
    expect(contract.commands.at(-1).command).toContain("movement:upper-body-standing-support-audit");
  });

  it("parses CLI options", () => {
    expect(parseUpperBodyStandingSupportReadinessAuditArgs([
      "--manifest",
      "tmp/manifest.json",
      "--game-visual-plan",
      "tmp/plan.json",
      "--game-visual-plan",
      "tmp/broad-plan.json",
      "--semantic-review",
      "tmp/review.json",
      "--semantic-review",
      "tmp/broad-review.json",
      "--capture-contract",
      "tmp/capture-contract-input.json",
      "--candidate-review-out",
      "tmp/candidate-review.md",
      "--capture-guide-out",
      "tmp/capture-guide.md",
      "--capture-contract-out",
      "tmp/capture-contract.json",
      "--capture-label",
      "movement proof broad",
      "--recording-id",
      "rec_123",
      "--strict",
      "--json",
    ])).toEqual({
      gameVisualPlanPaths: ["tmp/plan.json", "tmp/broad-plan.json"],
      captureContractPath: "tmp/capture-contract-input.json",
      captureGuideOutPath: "tmp/capture-guide.md",
      captureLabel: "movement proof broad",
      candidateReviewOutPath: "tmp/candidate-review.md",
      captureContractOutPath: "tmp/capture-contract.json",
      json: true,
      manifestPath: "tmp/manifest.json",
      recordingId: "rec_123",
      semanticReviewPaths: ["tmp/review.json", "tmp/broad-review.json"],
      strict: true,
    });
  });

  it("applies generated broad capture contract paths to final audit inputs", () => {
    expect(applyBroadCaptureContractArgs({
      gameVisualPlanPaths: ["tmp/default-plan.json"],
      manifestPath: "tmp/default-manifest.json",
      semanticReviewPaths: ["tmp/default-review.json"],
    }, {
      paths: {
        gameVisualPlan: "tmp/focused-plan.json",
        reviewedManifest: "tmp/reviewed-manifest.json",
        semanticReviewDecisions: "tmp/focused-review.json",
      },
    })).toMatchObject({
      gameVisualPlanPaths: [
        "tmp/movement-replay-lab/current-game-visual-proof-plan.json",
        "tmp/focused-plan.json",
      ],
      manifestPath: "tmp/reviewed-manifest.json",
      semanticReviewPaths: [
        "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json",
        "tmp/focused-review.json",
      ],
    });

    expect(() => applyBroadCaptureContractArgs({}, {
      paths: {
        gameVisualPlan: "tmp/focused-plan.json",
      },
    })).toThrow("Broad capture contract is missing path(s): reviewedManifest, semanticReviewDecisions");
  });

  it("merges default and supplemental Game visual proof artifacts", () => {
    expect(mergeGameVisualPlans([
      {
        summary: {
          proofCases: ["strongest-side-bend", "strongest-head-direction"],
        },
      },
      {
        sessions: [
          {
            proofCases: ["strongest-standing-arm-raise"],
          },
        ],
      },
    ])).toEqual({
      captures: [],
      sessions: [
        {
          proofCases: ["strongest-standing-arm-raise"],
        },
      ],
      summary: {
        proofCases: [
          "strongest-head-direction",
          "strongest-side-bend",
          "strongest-standing-arm-raise",
        ],
      },
    });

    expect(mergeSemanticReviews([
      {
        decisions: [decision("strongest-side-bend")],
      },
      {
        decisions: [decision("strongest-standing-arm-raise")],
      },
    ])).toEqual({
      decisions: [
        decision("strongest-side-bend"),
        decision("strongest-standing-arm-raise"),
      ],
    });
  });
});
