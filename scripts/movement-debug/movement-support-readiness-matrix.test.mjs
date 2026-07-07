import { describe, expect, it } from "vitest";

import {
  buildSupportReadinessMatrix,
  formatSupportReadinessMatrix,
  parseSupportReadinessMatrixArgs,
  supportReadinessStrictFailure,
} from "./movement-support-readiness-matrix.mjs";

const userFacingFamilies = [
  "upright",
  "upper-body-standing",
  "standing-side-bend-head-direction",
  "squat-knee-lift",
  "root-turn",
];

const internalDemoOnlyFamilies = [
  "facing-occlusion",
  "root-travel",
  "walking",
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "sitting",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];

function analysisFixture() {
  return [
    {
      coverage: {
        summary: {
          internalDemoOnlyFamilies,
          missingProofFamilies: internalDemoOnlyFamilies,
          userFacingFamilies,
        },
      },
      sessionId: "recording-a",
    },
  ];
}

function manifestRow(recordingId, proofCase, status = "passed", extras = {}) {
  return {
    automatedStatus: status === "passed" ? "passed" : "missing-proof",
    proofCase,
    recordingId,
    status,
    ...extras,
  };
}

function manifestFixture() {
  return {
    rows: [
      ...[
        "standing",
        "side-bend",
        "head-direction",
        "standing-arm-raise",
        "standing-twist",
        "standing-reach",
        "shoulder-scapula-control",
        "squat",
        "left-leg-raise",
        "right-leg-raise",
        "mirror-side-ownership",
        "root-turn",
      ].map((proofCase) => manifestRow("recording-a", proofCase)),
      manifestRow("recording-a", "root-travel", "product-scope-limitation", {
        candidateAmplitude: 0.002,
        expectedMinimumAmplitude: 0.16,
      }),
    ],
  };
}

function readableDecision(recordingId, visualCase) {
  return {
    decision: "readable-pass",
    key: `${recordingId}:1:${visualCase}`,
    reviewContext: {
      cases: [visualCase],
      displayLowerLabel: visualCase === "strongest-squat" ? "squat" : "neutral",
      frameIndex: 1,
      recordingId,
      status: "captured",
    },
  };
}

function semanticReviewFixture() {
  return {
    decisions: [
      "baseline",
      "strongest-squat",
      "strongest-left-leg-lift",
      "strongest-right-leg-lift",
      "first-source-display-divergence",
      "strongest-side-bend",
      "strongest-head-direction",
      "strongest-standing-arm-raise",
      "strongest-standing-twist",
      "strongest-standing-reach",
      "strongest-root-turn",
    ].map((visualCase) => {
      const decision = readableDecision("recording-a", visualCase);
      if (visualCase === "strongest-left-leg-lift") {
        decision.reviewContext.displayLowerLabel = "left-knee-raise";
      }
      if (visualCase === "strongest-right-leg-lift") {
        decision.reviewContext.displayLowerLabel = "right-knee-raise";
      }
      return decision;
    }),
  };
}

function gameCaptureManifestFixture() {
  return {
    captures: semanticReviewFixture().decisions.map((decision) => ({
      target: {
        cases: decision.reviewContext.cases,
        frameIndex: decision.reviewContext.frameIndex,
        recordingId: decision.reviewContext.recordingId,
      },
    })),
  };
}

function sittingManifestFixture() {
  return {
    rows: [
      manifestRow("recording-b", "seated-neutral"),
      manifestRow("recording-b", "seated-twist"),
      manifestRow("recording-b", "seated-leg-lift"),
      manifestRow("recording-b", "chair-contact"),
      manifestRow("recording-b", "seated-forward-fold", "missing-proof", {
        proofBlockerCode: "no-candidate-amplitude",
      }),
    ],
  };
}

const sittingGamePlanFixture = {
  summary: {
    proofCases: [
      "strongest-seated-chair-contact",
      "strongest-seated-twist",
      "strongest-seated-leg-lift",
    ],
  },
};

const sittingReviewFixture = {
  decisions: [
    "strongest-seated-chair-contact",
    "strongest-seated-twist",
    "strongest-seated-leg-lift",
  ].map((visualCase) => readableDecision("recording-b", visualCase)),
};

function buildFixtureMatrix() {
  return buildSupportReadinessMatrix({
    analysis: analysisFixture(),
    gameCaptureManifest: gameCaptureManifestFixture(),
    manifest: manifestFixture(),
    semanticReview: semanticReviewFixture(),
    sittingGameVisualPlan: sittingGamePlanFixture,
    sittingManifest: sittingManifestFixture(),
    sittingSemanticReview: sittingReviewFixture,
  });
}

describe("movement support readiness matrix", () => {
  it("summarizes current product support count separately from internal preview families", () => {
    const matrix = buildFixtureMatrix();

    expect(matrix.ready).toBe(true);
    expect(matrix.userFacingCount).toBe(5);
    expect(matrix.familyCount).toBe(19);
    expect(matrix.productionFamilySupportPercent).toBe(26);
    expect(matrix.internalFamilyCount).toBe(14);
    expect(matrix.blockedUserFacingFamilies).toEqual([]);
  });

  it("keeps sitting and walking/root-travel blocked with concrete next actions", () => {
    const matrix = buildFixtureMatrix();
    const sitting = matrix.rows.find((row) => row.family === "sitting");
    const walking = matrix.rows.find((row) => row.family === "walking");
    const rootTravel = matrix.rows.find((row) => row.family === "root-travel");

    expect(sitting.readyForUserFacing).toBe(false);
    expect(sitting.blockers).toContain("analyzer seated-forward-fold");
    expect(walking.readyForUserFacing).toBe(false);
    expect(walking.blockers).toContain("analyzer root-travel");
    expect(rootTravel.readyForUserFacing).toBe(false);
    expect(rootTravel.audit).toBe("movement:walking-support-audit");
  });

  it("formats the matrix with the production support percentage", () => {
    const text = formatSupportReadinessMatrix(buildFixtureMatrix());

    expect(text).toContain("User-facing production support: 5/19 (26%)");
    expect(text).toContain("| root-turn | user-facing | yes | movement:root-turn-support-audit | none |");
    expect(text).toContain("| sitting | internal-preview | no | movement:sitting-support-audit | analyzer seated-forward-fold");
  });

  it("reports strict failures only for current user-facing support regressions", () => {
    const matrix = buildFixtureMatrix();
    expect(supportReadinessStrictFailure(matrix)).toBe("");

    const blocked = {
      ...matrix,
      blockedUserFacingFamilies: ["root-turn"],
      ready: false,
    };
    expect(supportReadinessStrictFailure(blocked)).toContain("root-turn");
  });

  it("parses CLI options", () => {
    expect(parseSupportReadinessMatrixArgs([
      "--analysis",
      "analysis.json",
      "--manifest",
      "manifest.json",
      "--game-review",
      "review.json",
      "--game-captures",
      "captures.json",
      "--broad-game-plan",
      "broad-plan.json",
      "--broad-review",
      "broad-review.json",
      "--sitting-manifest",
      "sitting.json",
      "--sitting-game-plan",
      "sitting-plan.json",
      "--sitting-review",
      "sitting-review.json",
      "--out",
      "out.json",
      "--markdown-out",
      "out.md",
      "--no-write",
      "--strict",
      "--json",
    ])).toMatchObject({
      analysisPath: "analysis.json",
      broadGamePlanPath: "broad-plan.json",
      broadReviewPath: "broad-review.json",
      gameCaptureManifestPath: "captures.json",
      gameReviewPath: "review.json",
      json: true,
      manifestPath: "manifest.json",
      markdownOutPath: "out.md",
      outPath: "out.json",
      sittingGamePlanPath: "sitting-plan.json",
      sittingManifestPath: "sitting.json",
      sittingReviewPath: "sitting-review.json",
      strict: true,
      write: false,
    });
  });
});
