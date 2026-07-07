import { describe, expect, it } from "vitest";

import {
  DEFAULT_WATCHED_FILES,
  USER_FACING_SUPPORT_AUDIT_FAMILIES,
  USER_FACING_SUPPORT_AUDIT_GATES,
  buildMovementArchitectureGuardReport,
  evaluateSourcePurityRule,
  evaluateRouteBypassPurityRule,
  formatReport,
  parseMovementArchitectureGuardArgs,
  summarizeCoverageProductTruth,
  summarizeBroadUpperBodyCaptureContract,
  summarizeGameVisualCaptureConsistency,
  summarizeGameSemanticReview,
  summarizeGameVisualReviewConsistency,
  summarizePhase14ScriptContracts,
  summarizeProofManifest,
  summarizeReplayGameParity,
  summarizeUserFacingSupportAuditGateReadiness,
  summarizeUserFacingSupportAuditGates,
} from "./movement-architecture-guard.mjs";

const expectedInternalDemoOnlyFamilies = [
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

const supportClaimVisualTargets = [
  { cases: ["baseline"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
  { cases: ["strongest-squat"], displayLowerLabel: "squat", sourceLowerLabel: "squat" },
  { cases: ["strongest-left-leg-lift"], displayLowerLabel: "left-knee-raise", sourceLowerLabel: "right-knee-raise" },
  { cases: ["strongest-right-leg-lift"], displayLowerLabel: "right-knee-raise", sourceLowerLabel: "left-knee-raise" },
  { cases: ["first-source-display-divergence"], displayLowerLabel: "left-knee-raise", sourceLowerLabel: "right-knee-raise" },
  { cases: ["strongest-side-bend"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
  { cases: ["strongest-head-direction"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
  { cases: ["strongest-root-turn"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
];
const broadUpperBodyGameProofCases = [
  "strongest-standing-arm-raise",
  "strongest-standing-twist",
  "strongest-standing-reach",
];
const broadUpperBodyRecordedProofCases = [
  "standing-arm-raise",
  "standing-twist",
  "standing-reach",
  "shoulder-scapula-control",
];
const seatedRecordedProofCases = [
  "seated-neutral",
  "seated-twist",
  "seated-forward-fold",
  "seated-leg-lift",
  "chair-contact",
];
const seatedGameProofCases = [
  "strongest-seated-chair-contact",
  "strongest-seated-twist",
  "strongest-seated-forward-fold",
  "strongest-seated-leg-lift",
];
const expectedGameVisualProofFrames = 50;
const cleanPackageJson = {
  scripts: {
    "movement:expansion-preview-handoff:sitting": "node scripts/movement-debug/movement-expansion-preview-handoff.mjs --family sitting --out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.json --guide-out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.md",
    "movement:expansion-preview-handoff:sitting:best-partial": "node scripts/movement-debug/movement-expansion-preview-handoff.mjs --family sitting --recording-id-from-best-partial --out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.best-partial.json --guide-out tmp/movement-replay-lab/current-expansion-preview-sitting-handoff.best-partial.md",
    "movement:expansion-preview-handoff:walking": "node scripts/movement-debug/movement-expansion-preview-handoff.mjs --family walking --out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.json --guide-out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.md",
    "movement:expansion-preview-handoff:walking:best-partial": "node scripts/movement-debug/movement-expansion-preview-handoff.mjs --family walking --recording-id-from-best-partial --game-visual-plan tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-plan.json --out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.best-partial.json --guide-out tmp/movement-replay-lab/current-expansion-preview-walking-handoff.best-partial.md",
    "movement:next-proof-readiness": "node scripts/movement-debug/next-proof-readiness.mjs",
    "movement:next-proof-readiness:strict": "node scripts/movement-debug/next-proof-readiness.mjs --strict",
    "movement:support-readiness-matrix": "node scripts/movement-debug/movement-support-readiness-matrix.mjs",
    "movement:support-readiness-matrix:strict": "node scripts/movement-debug/movement-support-readiness-matrix.mjs --strict",
    "movement:architecture-plan-status-audit": "node scripts/movement-debug/movement-architecture-plan-status-audit.mjs",
    "movement:architecture-plan-status-audit:strict": "node scripts/movement-debug/movement-architecture-plan-status-audit.mjs --strict",
    "movement:roadmap-progress-report": "node scripts/movement-debug/movement-roadmap-progress-report.mjs",
    "movement:roadmap-progress-report:strict": "node scripts/movement-debug/movement-roadmap-progress-report.mjs --strict",
    "movement:outstanding-tasks-audit": "node scripts/movement-debug/movement-outstanding-tasks-audit.mjs",
    "movement:outstanding-tasks-audit:strict": "node scripts/movement-debug/movement-outstanding-tasks-audit.mjs --strict",
    "movement:coverage-registry-claim-audit": "npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementCoverageRegistry.test.ts'",
    "movement:replay:export-session": "node scripts/movement-debug/export-replay-session.mjs",
    "movement:root-turn-support-audit": "node scripts/movement-debug/root-turn-support-claim-audit.mjs",
    "movement:sitting-support-audit": "node scripts/movement-debug/sitting-support-readiness-audit.mjs",
    "movement:squat-knee-lift-support-audit": "node scripts/movement-debug/squat-knee-lift-support-claim-audit.mjs",
    "movement:walking-support-audit": "node scripts/movement-debug/walking-support-readiness-audit.mjs",
    "movement:upper-body-standing-capture-final-audit": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --capture-contract tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
    "movement:upper-body-standing-capture-handoff": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md --capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md --capture-contract-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
    "movement:upper-body-standing-capture-handoff:top-candidate": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --recording-id-from-top-candidate --candidate-review-out tmp/movement-replay-lab/current-upper-body-standing-broad-candidate-review.md --capture-guide-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-guide.md --capture-contract-out tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
    "movement:upper-body-standing-capture-preflight": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
    "movement:upper-body-standing-capture-ready": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json --strict",
    "movement:upper-body-standing-support-audit": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs",
  },
};

const visualCaptures = Array.from({ length: expectedGameVisualProofFrames }, (_, index) => {
  const recordingId = index < 20 ? "recording-a" : "recording-b";
  const supportClaimTarget = supportClaimVisualTargets[index];
  const cases = supportClaimTarget?.cases ?? [`case-${index}`];
  return {
    canvasPath: `tmp/captures/${recordingId}-${index}-canvas.png`,
    capturedDebugFrameIndex: index,
    currentUrl: `http://localhost:3100/demos/movements/${recordingId}/play?debugGameFrame=${index}`,
    pagePath: `tmp/captures/${recordingId}-${index}-page.png`,
    status: "captured",
    target: {
      cases,
      displayLowerLabel: supportClaimTarget?.displayLowerLabel ?? "squat",
      frameIndex: index,
      movementId: recordingId,
      recordingId,
      sourceLowerLabel: supportClaimTarget?.sourceLowerLabel ?? "squat",
    },
  };
});

const cleanCaptureManifest = {
  captures: visualCaptures,
  errors: [],
};

const readableDecisions = visualCaptures.map((capture) => ({
  decision: "readable-pass",
  key: `${capture.target.recordingId}:${capture.target.frameIndex}:${capture.target.cases.join("+")}`,
  reviewContext: {
    canvasPath: capture.canvasPath,
    cases: capture.target.cases,
    capturedDebugFrameIndex: capture.capturedDebugFrameIndex,
    currentUrl: capture.currentUrl,
    displayLowerLabel: capture.target.displayLowerLabel,
    frameIndex: capture.target.frameIndex,
    movementId: capture.target.movementId,
    pagePath: capture.pagePath,
    recordingId: capture.target.recordingId,
    sourceLowerLabel: capture.target.sourceLowerLabel,
    status: capture.status,
  },
}));

function captureToAnalysisFrame(capture) {
  return {
    cases: capture.target.cases,
    displayLowerLabel: capture.target.displayLowerLabel,
    frameIndex: capture.target.frameIndex,
    sourceLowerLabel: capture.target.sourceLowerLabel,
  };
}

const cleanAnalysis = [
  {
    sessionId: "recording-a",
    coverage: {
      summary: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        missingProofFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn"],
      },
    },
    gamePath: {
      visualProofFrames: visualCaptures.slice(0, 20).map(captureToAnalysisFrame),
    },
    metrics: {
      replayGameScoreMessageDivergenceFrameCount: 0,
      replayGameScoreMessageFrameCount: 6000,
      replayGameWrapperDivergenceFrameCount: 0,
    },
  },
  {
    sessionId: "recording-b",
    gamePath: {
      visualProofFrames: visualCaptures.slice(20).map(captureToAnalysisFrame),
    },
    metrics: {
      replayGameScoreMessageDivergenceFrameCount: 0,
      replayGameScoreMessageFrameCount: 5383,
      replayGameWrapperDivergenceFrameCount: 0,
    },
  },
];

const cleanManifest = {
  rows: [
    ...[
      "standing",
      "squat",
      "left-leg-raise",
      "right-leg-raise",
      "mirror-side-ownership",
      "side-bend",
      "head-direction",
      "root-turn",
      ...broadUpperBodyRecordedProofCases,
    ].map((proofCase) => ({
      acceptedProductLimitation: false,
      proofCase,
      recordingId: "recording-a",
      status: "passed",
    })),
    ...Array.from({ length: 50 }, () => ({ acceptedProductLimitation: false, status: "passed" })),
    ...Array.from({ length: 65 }, () => ({
      acceptedProductLimitation: false,
      proofCase: "side-bend",
      status: "covered-by-other-recording",
    })),
    ...Array.from({ length: 18 }, () => ({
      acceptedProductLimitation: true,
      proofCase: "weak-feet",
      status: "source-data-limitation",
    })),
    ...Array.from({ length: 9 }, () => ({
      acceptedProductLimitation: true,
      automatedStatus: "passed",
      evidenceFrameCount: 12,
      proofCase: "root-travel",
      recordingId: "walking-product-scoped-candidate",
      status: "product-scope-limitation",
    })),
  ],
};

const partialSittingManifest = {
  rows: [
    ...seatedRecordedProofCases
      .filter((proofCase) => proofCase !== "seated-forward-fold")
      .map((proofCase) => ({
      acceptedProductLimitation: false,
      automatedStatus: "passed",
      evidenceFrameCount: 10,
      proofCase,
      recordingId: "seated-best-partial",
      status: "passed",
    })),
    {
      acceptedProductLimitation: false,
      automatedStatus: "missing-proof",
      evidenceFrameCount: 0,
      proofBlockerCode: "no-candidate-amplitude",
      proofCase: "seated-forward-fold",
      recordingId: "seated-best-partial",
      status: "missing-proof",
    },
  ],
};

const partialSittingGameVisualPlan = {
  summary: {
    proofCases: seatedGameProofCases.filter((proofCase) => proofCase !== "strongest-seated-forward-fold"),
  },
};

const partialSittingSemanticReview = {
  decisions: partialSittingGameVisualPlan.summary.proofCases.map((proofCase) => ({
    decision: "readable-pass",
    reviewContext: {
      cases: [proofCase],
    },
  })),
};
const sectionProgressPercents = [92, 87, 75, 75, 99, 76, 94, 98, 84, 90, 80, 99, 98, 99, 94];
const outstandingTaskFixtureText = [
  "Maintain 0 missing-proof, manual-review, failed, and blocking rows",
  "Keep the 14 internal preview/demo/diagnostic coverage families out of product copy",
  "Capture or identify a real seated recording",
  "For `sitting`, cover the remaining `seated-forward-fold` case",
  "Capture or identify a real walking/root-travel bundle",
  "Keep the refreshed 50-frame Game visual capture/review set current",
  "Before committing or handing off the current movement slice",
  ...Array.from({ length: 18 }, (_, index) => `Keep placeholder open task ${index}`),
];

function currentPlanBoardText({
  internalCount = 14,
  productionPercent = 26,
  userFacingCount = 5,
} = {}) {
  return `# Movement Studio Best-Practice Architecture Plan

## Current Standing Board

Current verified support claims:

- User-facing: \`upright\`, \`upper-body-standing\`, \`standing-side-bend-head-direction\`, \`squat-knee-lift\`, and narrow standing \`root-turn\`.
- Internal preview/demo-only and now explicitly testable through synthetic proof fixtures: \`root-travel\`, \`walking\`, \`pivot-weight-transfer\`, \`jump-hop\`, \`lunges\`, \`sitting\`, \`kneeling\`, \`lying-floor-work\`, \`quadruped\`, \`rolling-crawling\`, \`yoga\`, \`pilates\`, and \`props-contact\`.
- Internal diagnostic/demo-only: \`facing-occlusion\`.

Current movement-family coverage:

- User-facing supported families: ${userFacingCount}/19.
- Non-user-facing internal families: ${internalCount}/19.

Current proof snapshot from the cheap gates run in this audit:

- \`movement:support-readiness-matrix -- --no-write --json\` passes as the all-family status cross-check: 19 families total, ${userFacingCount} user-facing production-supported families, ${internalCount} internal preview/diagnostic families, ${productionPercent}% production family support, and 0 blocked current user-facing families.

Current progress estimates:

- Overall full human-movement engine: about 70%.
- Current standing/posture/Game Studio slice: 98%.
- Architecture-hardening slice: 99%.
- Current proof-closure slice: 100%.
- Game parity proof slice: 100%.
- Movement-family preview coverage slice: 100% testable preview/diagnostic coverage, ${productionPercent}% user-facing production support.
- Product-support scoreboard slice: 100%.
- Architecture-plan status slice: 100%.
- Seated validation lane: 77% toward promotion.
- Walking validation lane: 41% toward promotion.
- Average progress across the 15 plan sections: about 90%.
- Plan adherence for the current standing architecture: 97%.

## Executive Verdict

## Section Progress

| Section | Progress | Done | Outstanding |
| --- | --- | --- | --- |
${sectionProgressPercents.map((percent, index) => `| Phase ${index}: Section ${index} | ${percent}% | Done | Outstanding |`).join("\n")}

## Always-Open Outstanding Tasks

${outstandingTaskFixtureText.map((task) => `- [ ] ${task}.`).join("\n")}

## Recommended Next Slice

Next concrete tasks:

1. Record or identify seated forward-fold evidence, then run \`npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet\`.
2. Current user-facing support list in product/UI copy: \`upright\`, \`upper-body-standing\`, \`standing-side-bend-head-direction\`, \`squat-knee-lift\`, and narrow standing \`root-turn\` for standing root orientation only.
3. Treat \`root-travel\`, floor/yoga/Pilates, walking, jumping, props/contact, sitting, kneeling, and rolling/crawling as non-user-facing until proof exists; keep \`root-turn\` scoped to standing root orientation only.
4. Keep the next recording/review target explicit: seated forward fold.
5. Capture or identify a real walking/root-travel bundle with \`movement-proof-root-travel\`.
6. Keep the refreshed 50-target Game visual proof set current.
7. Decide whether to keep compact summaries only; do not commit raw \`tmp/movement-replay-lab/**\` captures by default.
8. Pick the next family only after writing its support-claim audit shape first.
9. Before merge or push, run the repo local gate under Node 22.13.0.
`;
}

function buildCleanGuardReport(overrides = {}) {
  return buildMovementArchitectureGuardReport({
    analysis: cleanAnalysis,
    broadGameVisualPlan: {
      summary: {
        proofCases: broadUpperBodyGameProofCases,
      },
    },
    broadSemanticReview: {
      decisions: broadUpperBodyGameProofCases.map((proofCase) => ({
        decision: "readable-pass",
        reviewContext: {
          cases: [proofCase],
        },
      })),
    },
    captureManifest: cleanCaptureManifest,
    files: [
      {
        lineCount: 220,
        maxLines: 240,
        path: "VrmAvatar.tsx",
        reason: "renderer guard",
      },
    ],
    manifest: cleanManifest,
    packageJson: cleanPackageJson,
    planText: currentPlanBoardText(),
    semanticReview: {
      decisions: readableDecisions,
      errors: [],
    },
    sittingGameVisualPlan: partialSittingGameVisualPlan,
    sittingManifest: partialSittingManifest,
    sittingSemanticReview: partialSittingSemanticReview,
    routeBypassPurityResults: [
      {
        matches: [],
        ok: true,
        reason: "route bypass purity",
        scannedFileCount: 3,
      },
    ],
    sourcePurityResults: [
      {
        matches: [],
        ok: true,
        path: "movementSourceFrame.ts",
        reason: "source purity",
      },
    ],
    ...overrides,
  });
}

describe("movement architecture guard", () => {
  it("keeps renderer and ready-frame helpers under explicit watched-file caps", () => {
    expect(DEFAULT_WATCHED_FILES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        maxLines: 240,
        path: "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
      }),
      expect.objectContaining({
        maxLines: 260,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameOrchestrationRuntime.ts",
      }),
      expect.objectContaining({
        maxLines: 280,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarReadyFrameApplicationRuntime.ts",
      }),
      expect.objectContaining({
        maxLines: 260,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.ts",
      }),
      expect.objectContaining({
        maxLines: 430,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarTrackingDebugTelemetry.ts",
      }),
      expect.objectContaining({
        maxLines: 130,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarVisualTelemetry.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 60,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecisionTypes.ts",
      }),
      expect.objectContaining({
        maxLines: 140,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactAnchors.ts",
      }),
      expect.objectContaining({
        maxLines: 220,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactDecisionRuntime.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 250,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactCorrectionApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 180,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactObjectApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSegmentApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 220,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRestMappedSegmentApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 170,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlantedSquatIkSegmentApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 180,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentMappingApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 190,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplicationSpecs.ts",
      }),
      expect.objectContaining({
        maxLines: 180,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplicationVrmAdapters.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 60,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationTypes.ts",
      }),
      expect.objectContaining({
        maxLines: 140,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadQuaternionApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 80,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadPositionApplication.ts",
      }),
      expect.objectContaining({
        maxLines: 150,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationRuntime.ts",
      }),
      expect.objectContaining({
        maxLines: 90,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationVrmAdapters.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPoseDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 150,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpinePoseDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 120,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplicationPoseDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 90,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLockDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerDrive.ts",
      }),
      expect.objectContaining({
        maxLines: 130,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerSpineDriveShared.ts",
      }),
      expect.objectContaining({
        maxLines: 140,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPlayerSpineDrive.ts",
      }),
      expect.objectContaining({
        maxLines: 130,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarPlayerSpineDriveRuntime.ts",
      }),
      expect.objectContaining({
        maxLines: 110,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRecordedSpineDrive.ts",
      }),
      expect.objectContaining({
        maxLines: 30,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 170,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodySourceOwnerDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 130,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarRetargetSegmentApplicationDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 150,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyStageDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 120,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyVisualDecision.ts",
      }),
      expect.objectContaining({
        maxLines: 20,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationEstimators.ts",
      }),
      expect.objectContaining({
        maxLines: 360,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarFloorSupportPresentationEstimators.ts",
      }),
      expect.objectContaining({
        maxLines: 210,
        path: "src/app/(dashboard)/demos/movements/_lib/movementAvatarStandingSupportPresentationEstimators.ts",
      }),
    ]));
  });

  it("tracks which movement families have user-facing support audit gates", () => {
    expect(USER_FACING_SUPPORT_AUDIT_FAMILIES).toEqual([
      "root-turn",
      "sitting",
      "squat-knee-lift",
      "standing-side-bend-head-direction",
      "upper-body-standing",
      "upright",
      "walking",
    ]);
    expect(USER_FACING_SUPPORT_AUDIT_GATES).toMatchObject({
      "sitting": {
        readinessKey: "sittingSupport.ready",
        scriptName: "movement:sitting-support-audit",
      },
      "squat-knee-lift": {
        readinessKey: "squatKneeLiftSupportClaim.ok",
        scriptName: "movement:squat-knee-lift-support-audit",
      },
      "root-turn": {
        readinessKey: "rootTurnSupportClaim.ok",
        scriptName: "movement:root-turn-support-audit",
      },
      "standing-side-bend-head-direction": {
        readinessKey: "upperBodyStandingSupport.narrowReady",
        scriptName: "movement:upper-body-standing-support-audit",
      },
      "upper-body-standing": {
        readinessKey: "upperBodyStandingSupport.broadReady",
        scriptName: "movement:upper-body-standing-support-audit",
      },
      "upright": {
        builtIn: "coverage-product-truth-and-proof-manifest",
        readinessKey: "coverageProductTruth.found",
      },
      "walking": {
        readinessKey: "walkingSupport.ready",
        scriptName: "movement:walking-support-audit",
      },
    });
  });

  it("guards user-facing support audit gate npm scripts", () => {
    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson)).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "walking",
          hasInternalDemoOnlyFailure: true,
          hasSingleTarget: true,
          hasUserFacingFailure: true,
          ok: true,
        }),
        expect.objectContaining({
          family: "upright",
          hasSingleTarget: true,
          hasUserFacingFailure: true,
          ok: true,
        }),
      ]),
      ok: true,
    });

    const packageJsonMissingWalkingGate = {
      scripts: {
        ...cleanPackageJson.scripts,
      },
    };
    delete packageJsonMissingWalkingGate.scripts["movement:walking-support-audit"];

    expect(summarizeUserFacingSupportAuditGates(packageJsonMissingWalkingGate)).toMatchObject({
      ok: false,
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "walking",
          ok: false,
          readinessKey: "walkingSupport.ready",
          scriptContractTracked: true,
          scriptName: "movement:walking-support-audit",
        }),
      ]),
    });

    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson, {
      "new-family": {
        scriptName: "movement:sitting-support-audit",
      },
    })).toMatchObject({
      ok: false,
      gateResults: [
        expect.objectContaining({
          command: "node scripts/movement-debug/sitting-support-readiness-audit.mjs",
          family: "new-family",
          hasSingleTarget: true,
          ok: false,
          readinessKey: null,
          scriptContractTracked: true,
        }),
      ],
    });

    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson, {
      "new-family": {
        readinessKey: "newFamilySupport.ready",
        scriptName: "movement:sitting-support-audit",
      },
    }, {})).toMatchObject({
      ok: false,
      gateResults: [
        expect.objectContaining({
          command: "node scripts/movement-debug/sitting-support-readiness-audit.mjs",
          family: "new-family",
          hasSingleTarget: true,
          ok: false,
          readinessKey: "newFamilySupport.ready",
          scriptContractTracked: false,
        }),
      ],
    });

    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson, {
      "new-family": {
        builtIn: "new-built-in",
        readinessKey: "newFamilySupport.ready",
        scriptName: "movement:sitting-support-audit",
        userFacingFailure: "expected new family support audit to pass before user-facing promotion",
      },
    })).toMatchObject({
      ok: false,
      gateResults: [
        expect.objectContaining({
          family: "new-family",
          hasSingleTarget: false,
          ok: false,
        }),
      ],
    });

    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson, {
      "new-family": {
        readinessKey: "newFamilySupport.ready",
        scriptName: "movement:sitting-support-audit",
      },
    })).toMatchObject({
      ok: false,
      gateResults: [
        expect.objectContaining({
          family: "new-family",
          hasUserFacingFailure: false,
          ok: false,
        }),
      ],
    });

    expect(summarizeUserFacingSupportAuditGates(cleanPackageJson, {
      "new-family": {
        mustStayBlockedWhileInternal: true,
        readinessKey: "newFamilySupport.ready",
        scriptName: "movement:sitting-support-audit",
        userFacingFailure: "expected new family support audit to pass before user-facing promotion",
      },
    })).toMatchObject({
      ok: false,
      gateResults: [
        expect.objectContaining({
          family: "new-family",
          hasInternalDemoOnlyFailure: false,
          ok: false,
        }),
      ],
    });
  });

  it("summarizes support audit readiness from the gate registry", () => {
    expect(summarizeUserFacingSupportAuditGateReadiness({
      coverageProductTruth: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn"],
      },
      expectedInternalDemoOnlyFamilies,
      expectedUserFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn"],
      readinessByKey: {
        "coverageProductTruth.found": true,
        "rootTurnSupportClaim.ok": true,
        "sittingSupport.ready": false,
        "squatKneeLiftSupportClaim.ok": true,
        "upperBodyStandingSupport.broadReady": true,
        "upperBodyStandingSupport.narrowReady": true,
        "walkingSupport.ready": false,
      },
    })).toMatchObject({
      internalBlockedGateCount: 2,
      internalBlockedOkCount: 2,
      ok: true,
      promotionReadyCount: 5,
      unusedReadinessKeys: [],
    });

    expect(summarizeUserFacingSupportAuditGateReadiness({
      auditGates: {
        "new-family": {
          readinessKey: "newFamilySupport.ready",
          scriptName: "movement:sitting-support-audit",
        },
      },
      coverageProductTruth: {
        internalDemoOnlyFamilies: [],
        userFacingFamilies: [],
      },
      readinessByKey: {},
    })).toMatchObject({
      gateResults: [
        expect.objectContaining({
          failures: [
            "expected support audit gate family new-family to exist in coverage product truth",
            "expected support audit gate for new-family readiness signal newFamilySupport.ready to be wired into architecture guard readiness map",
          ],
          family: "new-family",
          ok: false,
          registeredFamily: false,
          readinessSignalWired: false,
        }),
      ],
      ok: false,
    });

    expect(summarizeUserFacingSupportAuditGateReadiness({
      auditGates: {
        "new-family": {
          readinessKey: "sittingSupport.ready",
          scriptName: "movement:sitting-support-audit",
        },
      },
      coverageProductTruth: {
        internalDemoOnlyFamilies: [],
        userFacingFamilies: [],
      },
      readinessByKey: {
        "sittingSupport.ready": false,
      },
    })).toMatchObject({
      gateResults: [
        expect.objectContaining({
          failures: ["expected support audit gate family new-family to exist in coverage product truth"],
          family: "new-family",
          ok: false,
          registeredFamily: false,
          readinessSignalWired: true,
        }),
      ],
      ok: false,
    });

    expect(summarizeUserFacingSupportAuditGateReadiness({
      auditGates: {
        "root-travel": {
          readinessKey: "sittingSupport.ready",
          scriptName: "movement:sitting-support-audit",
        },
      },
      coverageProductTruth: {
        internalDemoOnlyFamilies: ["root-travel"],
        userFacingFamilies: [],
      },
      expectedInternalDemoOnlyFamilies: ["root-travel"],
      readinessByKey: {
        "sittingSupport.ready": false,
      },
    })).toMatchObject({
      gateResults: [
        expect.objectContaining({
          failures: ["expected internal-demo-only support audit gate for root-travel to declare mustStayBlockedWhileInternal"],
          family: "root-travel",
          internalDemoOnly: true,
          internalGatePolicyExplicit: false,
          ok: false,
          registeredFamily: true,
        }),
      ],
      ok: false,
    });

    expect(summarizeUserFacingSupportAuditGateReadiness({
      auditGates: {
        "new-family": {
          readinessKey: "newFamilySupport.ready",
          scriptName: "movement:sitting-support-audit",
        },
      },
      coverageProductTruth: {
        internalDemoOnlyFamilies: [],
        userFacingFamilies: [],
      },
      readinessByKey: {
        "newFamilySupport.ready": true,
        "orphanedSupport.ready": false,
      },
    })).toMatchObject({
      ok: false,
      unusedReadinessKeys: ["orphanedSupport.ready"],
    });

    expect(summarizeUserFacingSupportAuditGateReadiness({
      coverageProductTruth: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "walking"),
        userFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn", "walking"],
      },
      expectedInternalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "walking"),
      expectedUserFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn", "walking"],
      readinessByKey: {
        "coverageProductTruth.found": true,
        "sittingSupport.ready": false,
        "squatKneeLiftSupportClaim.ok": true,
        "upperBodyStandingSupport.broadReady": true,
        "upperBodyStandingSupport.narrowReady": true,
        "walkingSupport.ready": false,
      },
    })).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          failures: ["expected walking support audit to pass before user-facing promotion"],
          family: "walking",
          ok: false,
          ready: false,
          userFacing: true,
        }),
      ]),
      ok: false,
    });
  });

  it("parses focused proof artifact overrides", () => {
    expect(parseMovementArchitectureGuardArgs([
      "--root",
      "/repo",
      "--analysis",
      "tmp/analysis.json",
      "--capture-manifest",
      "tmp/capture-manifest.json",
      "--manifest",
      "tmp/manifest.json",
      "--semantic-review",
      "tmp/semantic.json",
      "--sitting-game-visual-plan",
      "tmp/sitting-plan.json",
      "--sitting-manifest",
      "tmp/sitting-manifest.json",
      "--sitting-semantic-review",
      "tmp/sitting-semantic.json",
    ])).toEqual({
      proofPaths: {
        analysis: "tmp/analysis.json",
        broadGameVisualPlan: "tmp/movement-replay-lab/current-game-visual-proof-plan.broad-upper-body.json",
        broadSemanticReview: "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.broad-upper-body.codex-semantic-review.json",
        captureManifest: "tmp/capture-manifest.json",
        manifest: "tmp/manifest.json",
        semanticReview: "tmp/semantic.json",
        sittingGameVisualPlan: "tmp/sitting-plan.json",
        sittingManifest: "tmp/sitting-manifest.json",
        sittingSemanticReview: "tmp/sitting-semantic.json",
      },
      rootDir: "/repo",
    });
  });

  it("summarizes semantic Game visual decisions", () => {
    expect(summarizeGameSemanticReview({
      decisions: [
        { decision: "readable-pass" },
        { decision: "readable-fail" },
        { status: "TODO" },
      ],
      errors: ["missing screenshot"],
    })).toEqual({
      decisionCounts: {
        TODO: 1,
        "readable-fail": 1,
        "readable-pass": 1,
      },
      errorCount: 1,
      readablePassCount: 1,
      targetCount: 3,
    });
  });

  it("summarizes Game visual review consistency against the capture manifest", () => {
    expect(summarizeGameVisualReviewConsistency({
      decisions: readableDecisions,
      errors: [],
    }, cleanCaptureManifest)).toMatchObject({
      captureErrorCount: 0,
      captureTargetCount: expectedGameVisualProofFrames,
      contextMismatchCount: 0,
      decisionTargetCount: expectedGameVisualProofFrames,
      missingDecisionKeys: [],
      staleDecisionKeys: [],
    });

    const staleReviewSummary = summarizeGameVisualReviewConsistency({
      decisions: [
        {
          ...readableDecisions[0],
          reviewContext: {
            ...readableDecisions[0].reviewContext,
            frameIndex: 999,
          },
        },
        {
          decision: "readable-pass",
          key: "stale:0:baseline",
          reviewContext: {},
        },
      ],
      errors: [],
    }, cleanCaptureManifest);

    expect(staleReviewSummary).toMatchObject({
      captureTargetCount: expectedGameVisualProofFrames,
      contextMismatchCount: 1,
      decisionTargetCount: 2,
      staleDecisionKeys: ["stale:0:baseline"],
    });
    expect(staleReviewSummary.missingDecisionKeys).toEqual(expect.arrayContaining([
      "recording-a:1:strongest-squat",
      "recording-b:36:case-36",
    ]));
  });

  it("summarizes Game visual capture consistency against reviewed analysis targets", () => {
    expect(summarizeGameVisualCaptureConsistency(cleanAnalysis, cleanCaptureManifest)).toMatchObject({
      analysisTargetCount: expectedGameVisualProofFrames,
      captureTargetCount: expectedGameVisualProofFrames,
      contextMismatchCount: 0,
      missingCaptureKeys: [],
      staleCaptureKeys: [],
    });

    expect(summarizeGameVisualCaptureConsistency(cleanAnalysis, {
      captures: [
        {
          ...visualCaptures[0],
          target: {
            ...visualCaptures[0].target,
            sourceLowerLabel: "wrong-label",
          },
        },
        {
          ...visualCaptures[1],
          target: {
            ...visualCaptures[1].target,
            recordingId: "stale-recording",
          },
        },
      ],
      errors: [],
    })).toMatchObject({
      analysisTargetCount: expectedGameVisualProofFrames,
      captureTargetCount: 2,
      contextMismatchCount: 1,
      missingCaptureKeys: expect.arrayContaining([
        "recording-a:1:strongest-squat",
      ]),
      staleCaptureKeys: ["stale-recording:1:strongest-squat"],
    });
  });

  it("summarizes Replay/Game parity from session analyses", () => {
    expect(summarizeReplayGameParity(cleanAnalysis)).toEqual({
      scoreMessageDivergenceFrames: 0,
      scoreMessageParityFrames: 11383,
      sessionCount: 2,
      visualProofFrames: expectedGameVisualProofFrames,
      wrapperDivergenceFrames: 0,
    });
  });

  it("summarizes coverage product truth from reviewed analysis", () => {
    expect(summarizeCoverageProductTruth(cleanAnalysis)).toEqual({
      found: true,
      internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
      missingProofFamilies: expectedInternalDemoOnlyFamilies,
      userFacingFamilies: ["upright", "upper-body-standing", "standing-side-bend-head-direction", "squat-knee-lift", "root-turn"],
    });
  });

  it("summarizes blocking proof manifest rows", () => {
    expect(summarizeProofManifest({
      rows: [
        { acceptedProductLimitation: false, status: "passed" },
        { acceptedProductLimitation: false, proofStatus: "missing-proof" },
        { acceptedProductLimitation: false, reviewStatus: "manual-review" },
        {
          acceptedProductLimitation: true,
          proofCase: "root-travel",
          status: "product-scope-limitation",
        },
        {
          acceptedProductLimitation: false,
          proofCase: "weak-feet",
          status: "source-data-limitation",
        },
      ],
    })).toMatchObject({
      acceptedProductLimitationRows: 1,
      blockingRows: 2,
      productScopeProofCaseCounts: {
        "root-travel": 1,
      },
      rowCount: 5,
      statusCounts: {
        "manual-review": 1,
        "missing-proof": 1,
        "product-scope-limitation": 1,
        "source-data-limitation": 1,
        passed: 1,
      },
      unresolvedSourceDataLimitationRows: 1,
    });
  });

  it("summarizes broad upper-body capture contracts", () => {
    expect(summarizeBroadUpperBodyCaptureContract({
      commands: [
        { id: "initial-analysis" },
        {
          command: "npm run movement:upper-body-standing-support-audit -- --strict",
          id: "merged-readiness-audit",
        },
      ],
      captureWorkflowState: "waiting-for-recording-id",
      recordingIdPlaceholder: "<new-recording-id>",
      productScopedBroadEvidenceCandidates: [
        {
          recordingId: "candidate-a",
        },
      ],
      requiredGameProofCases: ["strongest-standing-arm-raise"],
      requiredRecordedProofCases: ["standing-arm-raise"],
      schema: "sonae-broad-upper-body-capture-contract/v1",
      supportClaimStatus: "blocked-internal-demo-only",
    })).toEqual({
      broadPassedProofCandidateCount: 0,
      broadPassingRecordingCount: 0,
      broadProductScopedEvidenceCandidateCount: 1,
      captureWorkflowState: "waiting-for-recording-id",
      commandIds: ["initial-analysis", "merged-readiness-audit"],
      gameProofCases: ["strongest-standing-arm-raise"],
      hasRecordingPlaceholder: true,
      hasStrictFinalAudit: true,
      missingBroadGamePlanCases: [],
      missingBroadPassedProofCases: [],
      missingBroadReadableGameCases: [],
      recordedProofCases: ["standing-arm-raise"],
      schema: "sonae-broad-upper-body-capture-contract/v1",
      supportClaimStatus: "blocked-internal-demo-only",
    });
    expect(summarizeBroadUpperBodyCaptureContract({
      commands: [
        {
          command: "npm run movement:upper-body-standing-support-audit",
          id: "merged-readiness-audit",
        },
      ],
    })).toMatchObject({
      broadPassedProofCandidateCount: 0,
      broadPassingRecordingCount: 0,
      broadProductScopedEvidenceCandidateCount: 0,
      captureWorkflowState: "unknown",
      hasStrictFinalAudit: false,
      supportClaimStatus: "unknown",
    });
  });

  it("checks source-frame purity for forbidden display and presentation terms", () => {
    expect(evaluateSourcePurityRule({
      content: "export type Source = { landmarks: TrackingLandmark[] }",
      forbiddenTerms: ["displayLandmarks", "mirrorMode"],
      path: "movementSourceFrame.ts",
      reason: "source purity",
    })).toMatchObject({
      matches: [],
      ok: true,
    });

    expect(evaluateSourcePurityRule({
      content: "export type Source = { displayLandmarks: TrackingLandmark[]; mirrorMode: string }",
      forbiddenTerms: ["displayLandmarks", "mirrorMode"],
      path: "movementSourceFrame.ts",
      reason: "source purity",
    })).toMatchObject({
      matches: [
        { term: "displayLandmarks" },
        { term: "mirrorMode" },
      ],
      ok: false,
    });
  });

  it("allows route bypass terms only in explicit bypass helpers", () => {
    expect(evaluateRouteBypassPurityRule({
      allowedPaths: ["movementStartBypass.ts"],
      files: [
        {
          content: "export const reason = 'debug-auto-baseline';",
          path: "movementStartBypass.ts",
        },
        {
          content: "export const source = 'raw landmarks';",
          path: "movementMotionFrame.ts",
        },
      ],
      forbiddenTerms: ["debug-auto-baseline", "debugGameFrame"],
      reason: "route bypass purity",
    })).toMatchObject({
      matches: [],
      ok: true,
      scannedFileCount: 2,
    });

    expect(evaluateRouteBypassPurityRule({
      allowedPaths: ["movementStartBypass.ts"],
      files: [
        {
          content: "export const bad = 'debugGameFrame';",
          path: "movementMotionFrame.ts",
        },
      ],
      forbiddenTerms: ["debug-auto-baseline", "debugGameFrame"],
      reason: "route bypass purity",
    })).toMatchObject({
      matches: [
        {
          path: "movementMotionFrame.ts",
          term: "debugGameFrame",
        },
      ],
      ok: false,
      scannedFileCount: 1,
    });
  });

  it("guards Phase 14 npm script contracts", () => {
    expect(summarizePhase14ScriptContracts(cleanPackageJson)).toMatchObject({
      ok: true,
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:upper-body-standing-capture-ready": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:upper-body-standing-capture-ready",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:next-proof-readiness": "node scripts/movement-debug/not-next-proof-readiness.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["scripts/movement-debug/next-proof-readiness.mjs"],
          ok: false,
          scriptName: "movement:next-proof-readiness",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:next-proof-readiness:strict": "node scripts/movement-debug/next-proof-readiness.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:next-proof-readiness:strict",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:support-readiness-matrix:strict": "node scripts/movement-debug/movement-support-readiness-matrix.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:support-readiness-matrix:strict",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:architecture-plan-status-audit:strict": "node scripts/movement-debug/movement-architecture-plan-status-audit.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:architecture-plan-status-audit:strict",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:roadmap-progress-report:strict": "node scripts/movement-debug/movement-roadmap-progress-report.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:roadmap-progress-report:strict",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:outstanding-tasks-audit:strict": "node scripts/movement-debug/movement-outstanding-tasks-audit.mjs",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["--strict"],
          ok: false,
          scriptName: "movement:outstanding-tasks-audit:strict",
        }),
      ]),
    });

    expect(summarizePhase14ScriptContracts({
      scripts: {
        ...cleanPackageJson.scripts,
        "movement:coverage-registry-claim-audit": "npm run test:run -- 'src/app/(dashboard)/demos/movements/_lib/movementExpansionPreviewAudit.test.ts'",
      },
    })).toMatchObject({
      ok: false,
      scriptResults: expect.arrayContaining([
        expect.objectContaining({
          missingFragments: ["src/app/(dashboard)/demos/movements/_lib/movementCoverageRegistry.test.ts"],
          ok: false,
          scriptName: "movement:coverage-registry-claim-audit",
        }),
      ]),
    });
  });

  it("passes when architecture watch files and proof artifacts are inside guardrails", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: cleanAnalysis,
      broadGameVisualPlan: {
        summary: {
          proofCases: broadUpperBodyGameProofCases,
        },
      },
      broadSemanticReview: {
        decisions: broadUpperBodyGameProofCases.map((proofCase) => ({
          decision: "readable-pass",
          reviewContext: {
            cases: [proofCase],
          },
        })),
      },
      captureManifest: cleanCaptureManifest,
      files: [
        {
          lineCount: 220,
          maxLines: 240,
          path: "VrmAvatar.tsx",
          reason: "renderer guard",
        },
      ],
      manifest: cleanManifest,
      packageJson: cleanPackageJson,
      planText: currentPlanBoardText(),
      semanticReview: {
        decisions: readableDecisions,
        errors: [],
      },
      sittingGameVisualPlan: partialSittingGameVisualPlan,
      sittingManifest: partialSittingManifest,
      sittingSemanticReview: partialSittingSemanticReview,
      routeBypassPurityResults: [
        {
          matches: [],
          ok: true,
          reason: "route bypass purity",
          scannedFileCount: 3,
        },
      ],
      sourcePurityResults: [
        {
          matches: [],
          ok: true,
          path: "movementSourceFrame.ts",
          reason: "source purity",
        },
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.proofFailures).toEqual([]);
    expect(report.phase14ScriptContracts).toMatchObject({
      ok: true,
    });
    expect(report.userFacingSupportAuditGates).toMatchObject({
      ok: true,
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "upright",
          ok: true,
          scriptName: null,
        }),
        expect.objectContaining({
          family: "walking",
          ok: true,
          scriptName: "movement:walking-support-audit",
        }),
      ]),
    });
    expect(report.userFacingSupportAuditGateReadiness).toMatchObject({
      internalBlockedGateCount: 2,
      internalBlockedOkCount: 2,
      ok: true,
      promotionReadyCount: 5,
    });
    expect(report.rootTurnSupportClaim).toMatchObject({
      ok: true,
      passingCandidateCount: 1,
    });
    expect(report.supportReadinessMatrix).toMatchObject({
      blockedUserFacingFamilies: [],
      productionFamilySupportPercent: 26,
      ready: true,
      userFacingCount: 5,
    });
    expect(report.architecturePlanStatus).toMatchObject({
      expected: {
        internalFamilyCount: 14,
        productionFamilySupportPercent: 26,
        userFacingCount: 5,
      },
      failures: [],
      ok: true,
    });
    expect(report.roadmapProgress).toMatchObject({
      ok: true,
      progress: {
        overallPercent: 70,
        sectionAverageNearestFive: 90,
      },
    });
    expect(report.outstandingTasks).toMatchObject({
      ok: true,
      recommendedTaskCount: 9,
      uncheckedTaskCount: 25,
    });
    expect(report.walkingSupport).toMatchObject({
      missingAnalyzerProofCases: ["root-travel"],
      productScopedRecordedProofCases: ["root-travel"],
      ready: false,
      walkingProofCandidates: [
        expect.objectContaining({
          evidenceProofCaseCount: 0,
          productScopedProofCases: ["root-travel"],
          recordingId: "walking-product-scoped-candidate",
        }),
      ],
    });
    expect(report.sittingSupport).toMatchObject({
      missingAnalyzerProofCases: ["seated-forward-fold"],
      missingGamePlanCases: ["strongest-seated-forward-fold"],
      missingReadableGameCases: ["strongest-seated-forward-fold"],
      ready: false,
      seatedProofCandidates: [
        expect.objectContaining({
          analyzerProofCaseCount: 4,
          missingAnalyzerProofCases: ["seated-forward-fold"],
          recordingId: "seated-best-partial",
        }),
      ],
    });
    expect(formatReport(report)).toContain(
      "Support readiness matrix: ready, production families 5/19 (26%), blocked user-facing 0",
    );
    expect(formatReport(report)).toContain(
      "Architecture plan status: passed, current board 5/19 (26%), internal 14/19",
    );
    expect(formatReport(report)).toContain(
      "Roadmap progress: ready, overall 70%, section average about 90%, production families 5/19 (26%)",
    );
    expect(formatReport(report)).toContain(
      "Outstanding tasks: ready, unchecked 25, recommended next 9",
    );
    expect(formatReport(report)).toContain(
      "Root-turn support claim: passed (1 reviewed bundle(s))",
    );
    expect(formatReport(report)).toContain(
      "Sitting support blockers: analyzer seated-forward-fold, Game plan/readability strongest-seated-forward-fold",
    );
    expect(formatReport(report)).toContain(
      "Sitting support best candidate: seated-best-partial (analyzer 4, passed 4, missing analyzer seated-forward-fold, missing passed seated-forward-fold)",
    );
    expect(formatReport(report)).toContain(
      "Sitting support next recording: movement-proof-seated-forward-fold (npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet)",
    );
    expect(formatReport(report)).toContain(
      "Walking support blockers: analyzer root-travel, recorded passed root-travel, Game plan/readability strongest-root-travel",
    );
    expect(formatReport(report)).toContain(
      "Walking support best candidate: walking-product-scoped-candidate (evidence 0, passed 0, product-scoped root-travel, missing passed root-travel)",
    );
    expect(formatReport(report)).toContain(
      "Walking support next recording: movement-proof-root-travel (npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet)",
    );
    expect(report.broadUpperBodyCaptureContract).toMatchObject({
      commandIds: [
        "initial-analysis",
        "replay-session-export",
        "replay-proof-set",
        "replay-review",
        "reviewed-analysis",
        "focused-game-visual-plan",
        "focused-game-visual-capture",
        "focused-game-visual-review",
        "merged-readiness-audit",
      ],
      gameProofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-twist",
        "strongest-standing-reach",
      ],
      hasRecordingPlaceholder: true,
      hasStrictFinalAudit: true,
      missingBroadGamePlanCases: [],
      missingBroadPassedProofCases: [],
      missingBroadReadableGameCases: [],
      recordedProofCases: broadUpperBodyRecordedProofCases,
      schema: "sonae-broad-upper-body-capture-contract/v1",
    });
  });

  it("fails when the architecture plan current board drifts from the support matrix", () => {
    const report = buildCleanGuardReport({
      planText: currentPlanBoardText({
        internalCount: 15,
        productionPercent: 21,
        userFacingCount: 4,
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.architecturePlanStatus).toMatchObject({
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "architecture plan status audit failed: missing current-board text: User-facing supported families: 5/19.",
      "architecture plan status audit failed: stale current-board text is still present: User-facing supported families: 4/19.",
    ]));
  });

  it("fails the architecture guard when a registered support audit gate has no script", () => {
    const packageJsonMissingWalkingGate = {
      scripts: {
        ...cleanPackageJson.scripts,
      },
    };
    delete packageJsonMissingWalkingGate.scripts["movement:walking-support-audit"];

    const report = buildCleanGuardReport({
      packageJson: packageJsonMissingWalkingGate,
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGates).toMatchObject({
      ok: false,
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "walking",
          ok: false,
          scriptName: "movement:walking-support-audit",
        }),
      ]),
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected support audit gate for walking to reference an existing npm script or built-in guard",
      "expected Phase 14 script movement:walking-support-audit to include scripts/movement-debug/walking-support-readiness-audit.mjs",
    ]));
  });

  it("fails the architecture guard when a support audit gate is not phase-contract tracked", () => {
    const report = buildCleanGuardReport({
      packageJson: {
        scripts: {
          ...cleanPackageJson.scripts,
          "movement:untracked-support-audit": "node scripts/movement-debug/sitting-support-readiness-audit.mjs",
        },
      },
      proofExpectations: {
        auditGates: {
          ...USER_FACING_SUPPORT_AUDIT_GATES,
          "untracked-family": {
            readinessKey: "sittingSupport.ready",
            scriptName: "movement:untracked-support-audit",
            userFacingFailure: "expected untracked-family support audit to pass before user-facing promotion",
          },
        },
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGates).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "untracked-family",
          ok: false,
          scriptContractTracked: false,
        }),
      ]),
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected support audit gate for untracked-family to be tracked by Phase 14 script contracts",
    ]));
  });

  it("fails the architecture guard when a support audit gate has an invalid schema", () => {
    const report = buildCleanGuardReport({
      proofExpectations: {
        auditGates: {
          ...USER_FACING_SUPPORT_AUDIT_GATES,
          "ambiguous-family": {
            builtIn: "ambiguous-built-in",
            readinessKey: "sittingSupport.ready",
            scriptName: "movement:sitting-support-audit",
            userFacingFailure: "expected ambiguous-family support audit to pass before user-facing promotion",
          },
        },
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGates).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "ambiguous-family",
          hasSingleTarget: false,
          ok: false,
        }),
      ]),
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected support audit gate for ambiguous-family to define exactly one of npm script or built-in guard",
    ]));
  });

  it("fails the architecture guard when a support audit gate family is not in coverage truth", () => {
    const report = buildCleanGuardReport({
      proofExpectations: {
        auditGates: {
          ...USER_FACING_SUPPORT_AUDIT_GATES,
          "phantom-family": {
            readinessKey: "sittingSupport.ready",
            scriptName: "movement:sitting-support-audit",
            userFacingFailure: "expected phantom-family support audit to pass before user-facing promotion",
          },
        },
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGateReadiness).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "phantom-family",
          ok: false,
          registeredFamily: false,
        }),
      ]),
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected support audit gate family phantom-family to exist in coverage product truth",
    ]));
  });

  it("fails the architecture guard when an internal support audit gate omits blocked policy", () => {
    const report = buildCleanGuardReport({
      proofExpectations: {
        auditGates: {
          ...USER_FACING_SUPPORT_AUDIT_GATES,
          "root-travel": {
            readinessKey: "sittingSupport.ready",
            scriptName: "movement:sitting-support-audit",
            userFacingFailure: "expected root-travel support audit to pass before user-facing promotion",
          },
        },
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGateReadiness).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "root-travel",
          internalDemoOnly: true,
          internalGatePolicyExplicit: false,
          ok: false,
        }),
      ]),
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected internal-demo-only support audit gate for root-travel to declare mustStayBlockedWhileInternal",
    ]));
  });

  it("fails the architecture guard when a support audit readiness signal is not wired", () => {
    const report = buildCleanGuardReport({
      proofExpectations: {
        auditGates: {
          ...USER_FACING_SUPPORT_AUDIT_GATES,
          "unwired-family": {
            readinessKey: "unwiredFamilySupport.ready",
            scriptName: "movement:sitting-support-audit",
            userFacingFailure: "expected unwired-family support audit to pass before user-facing promotion",
          },
        },
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGateReadiness).toMatchObject({
      gateResults: expect.arrayContaining([
        expect.objectContaining({
          family: "unwired-family",
          ok: false,
          readinessKey: "unwiredFamilySupport.ready",
          readinessSignalWired: false,
        }),
      ]),
      ok: false,
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected support audit gate for unwired-family readiness signal unwiredFamilySupport.ready to be wired into architecture guard readiness map",
    ]));
  });

  it("fails the architecture guard when the support audit readiness map has stale keys", () => {
    const report = buildCleanGuardReport({
      proofExpectations: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies,
        supportAuditReadinessByKey: {
          "coverageProductTruth.found": true,
          "orphanedSupport.ready": false,
          "sittingSupport.ready": false,
          "squatKneeLiftSupportClaim.ok": true,
          "upperBodyStandingSupport.broadReady": true,
          "upperBodyStandingSupport.narrowReady": true,
          "walkingSupport.ready": false,
        },
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.userFacingSupportAuditGateReadiness).toMatchObject({
      ok: false,
      unusedReadinessKeys: ["orphanedSupport.ready"],
    });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected architecture guard readiness map key orphanedSupport.ready to be referenced by a support audit gate",
    ]));
  });

  it("blocks walking promotion until the walking support audit is ready", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: [
        {
          ...cleanAnalysis[0],
          coverage: {
            summary: {
              internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "walking"),
              missingProofFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "walking"),
              userFacingFamilies: [
                "upright",
                "upper-body-standing",
                "standing-side-bend-head-direction",
                "squat-knee-lift",
                "walking",
              ],
            },
          },
        },
        cleanAnalysis[1],
      ],
      broadGameVisualPlan: {
        summary: {
          proofCases: broadUpperBodyGameProofCases,
        },
      },
      broadSemanticReview: {
        decisions: broadUpperBodyGameProofCases.map((proofCase) => ({
          decision: "readable-pass",
          reviewContext: {
            cases: [proofCase],
          },
        })),
      },
      captureManifest: cleanCaptureManifest,
      files: [
        {
          lineCount: 220,
          maxLines: 240,
          path: "VrmAvatar.tsx",
          reason: "renderer guard",
        },
      ],
      manifest: cleanManifest,
      packageJson: cleanPackageJson,
      proofExpectations: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "walking"),
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
          "walking",
        ],
      },
      semanticReview: {
        decisions: readableDecisions,
        errors: [],
      },
      routeBypassPurityResults: [
        {
          matches: [],
          ok: true,
          reason: "route bypass purity",
          scannedFileCount: 3,
        },
      ],
      sourcePurityResults: [
        {
          matches: [],
          ok: true,
          path: "movementSourceFrame.ts",
          reason: "source purity",
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected walking support audit to pass before user-facing promotion",
    ]));
  });

  it("blocks sitting promotion until the sitting support audit is ready", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: [
        {
          ...cleanAnalysis[0],
          coverage: {
            summary: {
              internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "sitting"),
              missingProofFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "sitting"),
              userFacingFamilies: [
                "upright",
                "upper-body-standing",
                "standing-side-bend-head-direction",
                "squat-knee-lift",
                "sitting",
              ],
            },
          },
        },
        cleanAnalysis[1],
      ],
      broadGameVisualPlan: {
        summary: {
          proofCases: broadUpperBodyGameProofCases,
        },
      },
      broadSemanticReview: {
        decisions: broadUpperBodyGameProofCases.map((proofCase) => ({
          decision: "readable-pass",
          reviewContext: {
            cases: [proofCase],
          },
        })),
      },
      captureManifest: cleanCaptureManifest,
      files: [
        {
          lineCount: 220,
          maxLines: 240,
          path: "VrmAvatar.tsx",
          reason: "renderer guard",
        },
      ],
      manifest: cleanManifest,
      packageJson: cleanPackageJson,
      proofExpectations: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "sitting"),
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
          "sitting",
        ],
      },
      semanticReview: {
        decisions: readableDecisions,
        errors: [],
      },
      sittingGameVisualPlan: partialSittingGameVisualPlan,
      sittingManifest: partialSittingManifest,
      sittingSemanticReview: partialSittingSemanticReview,
      routeBypassPurityResults: [
        {
          matches: [],
          ok: true,
          reason: "route bypass purity",
          scannedFileCount: 3,
        },
      ],
      sourcePurityResults: [
        {
          matches: [],
          ok: true,
          path: "movementSourceFrame.ts",
          reason: "source purity",
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected sitting support audit to pass before user-facing promotion",
    ]));
  });

  it("blocks user-facing promotion for families without a dedicated support audit gate", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: [
        {
          ...cleanAnalysis[0],
          coverage: {
            summary: {
              internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "root-travel"),
              missingProofFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "root-travel"),
              userFacingFamilies: [
                "upright",
                "upper-body-standing",
                "standing-side-bend-head-direction",
                "squat-knee-lift",
                "root-travel",
              ],
            },
          },
        },
        cleanAnalysis[1],
      ],
      broadGameVisualPlan: {
        summary: {
          proofCases: broadUpperBodyGameProofCases,
        },
      },
      broadSemanticReview: {
        decisions: broadUpperBodyGameProofCases.map((proofCase) => ({
          decision: "readable-pass",
          reviewContext: {
            cases: [proofCase],
          },
        })),
      },
      captureManifest: cleanCaptureManifest,
      files: [
        {
          lineCount: 220,
          maxLines: 240,
          path: "VrmAvatar.tsx",
          reason: "renderer guard",
        },
      ],
      manifest: cleanManifest,
      packageJson: cleanPackageJson,
      proofExpectations: {
        internalDemoOnlyFamilies: expectedInternalDemoOnlyFamilies.filter((family) => family !== "root-travel"),
        userFacingFamilies: [
          "upright",
          "upper-body-standing",
          "standing-side-bend-head-direction",
          "squat-knee-lift",
          "root-travel",
        ],
      },
      semanticReview: {
        decisions: readableDecisions,
        errors: [],
      },
      sittingGameVisualPlan: partialSittingGameVisualPlan,
      sittingManifest: partialSittingManifest,
      sittingSemanticReview: partialSittingSemanticReview,
      routeBypassPurityResults: [
        {
          matches: [],
          ok: true,
          reason: "route bypass purity",
          scannedFileCount: 3,
        },
      ],
      sourcePurityResults: [
        {
          matches: [],
          ok: true,
          path: "movementSourceFrame.ts",
          reason: "source purity",
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      "expected user-facing movement families to have dedicated support audit gates: root-travel",
    ]));
  });

  it("fails when a watched file regrows or proof artifacts drift", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: [
        {
          coverage: {
            summary: {
              internalDemoOnlyFamilies: ["root-turn"],
              missingProofFamilies: [],
              userFacingFamilies: ["upright", "root-travel"],
            },
          },
          sessionId: "recording-a",
          gamePath: {
            visualProofFrames: [
              captureToAnalysisFrame(visualCaptures[0]),
              captureToAnalysisFrame(visualCaptures[1]),
            ],
          },
          metrics: {
            replayGameScoreMessageDivergenceFrameCount: 1,
            replayGameScoreMessageFrameCount: 20,
            replayGameWrapperDivergenceFrameCount: 0,
          },
        },
      ],
      captureManifest: {
        captures: [
          {
            ...visualCaptures[0],
            target: {
              ...visualCaptures[0].target,
              sourceLowerLabel: "wrong-label",
            },
          },
          {
            ...visualCaptures[1],
            target: {
              ...visualCaptures[1].target,
              recordingId: "stale-recording",
            },
          },
        ],
        errors: ["missing page"],
      },
      files: [
        {
          lineCount: 260,
          maxLines: 240,
          path: "VrmAvatar.tsx",
          reason: "renderer guard",
        },
      ],
      manifest: {
        rows: [
          { acceptedProductLimitation: false, status: "missing-proof" },
          {
            acceptedProductLimitation: false,
            proofCase: "weak-feet",
            status: "source-data-limitation",
          },
          {
            acceptedProductLimitation: true,
            proofCase: "side-bend",
            status: "product-scope-limitation",
          },
        ],
      },
      packageJson: {
        scripts: {
          ...cleanPackageJson.scripts,
          "movement:upper-body-standing-capture-ready": "node scripts/movement-debug/upper-body-standing-support-readiness-audit.mjs --capture-contract-preflight tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json",
        },
      },
      semanticReview: {
        decisions: [
          {
            ...readableDecisions[0],
            decision: "readable-fail",
            reviewContext: {
              ...readableDecisions[0].reviewContext,
              frameIndex: 999,
            },
          },
          {
            decision: "readable-pass",
            key: "stale:0:baseline",
            reviewContext: {},
          },
        ],
        errors: [],
      },
      routeBypassPurityResults: [
        {
          matches: [{ path: "movementMotionFrame.ts", term: "debugGameFrame" }],
          ok: false,
          reason: "route bypass purity",
          scannedFileCount: 1,
        },
      ],
      sourcePurityResults: [
        {
          matches: [{ term: "displayLandmarks" }],
          ok: false,
          path: "movementSourceFrame.ts",
          reason: "source purity",
        },
      ],
    });

    expect(report.ok).toBe(false);
    expect(report.fileResults[0]).toMatchObject({ ok: false });
    expect(report.routeBypassPurityResults[0]).toMatchObject({ ok: false });
    expect(report.sourcePurityResults[0]).toMatchObject({ ok: false });
    expect(report.proofFailures).toEqual(expect.arrayContaining([
      expect.stringContaining("readable Game visual passes"),
      expect.stringContaining("Game visual analysis targets"),
      expect.stringContaining("missing 1 analysis target rows"),
      expect.stringContaining("stale target rows"),
      expect.stringContaining("stale analysis target context rows"),
      expect.stringContaining("Game visual capture targets"),
      expect.stringContaining("capture manifest has 1 errors"),
      expect.stringContaining("capture decision rows"),
      expect.stringContaining("stale decision rows"),
      expect.stringContaining("stale capture context rows"),
      expect.stringContaining("score/message parity frames"),
      expect.stringContaining("Replay/Game divergences"),
      expect.stringContaining("Game visual proof frames"),
      expect.stringContaining("blocking proof-manifest rows"),
      expect.stringContaining("proof-manifest status covered-by-other-recording"),
      expect.stringContaining("proof-manifest status product-scope-limitation"),
      expect.stringContaining("proof-manifest status source-data-limitation"),
      expect.stringContaining("accepted proof limitations"),
      expect.stringContaining("unresolved source-data limitation rows"),
      expect.stringContaining("product-scope proof case root-travel"),
      expect.stringContaining("user-facing movement families"),
      expect.stringContaining("dedicated support audit gates"),
      expect.stringContaining("internal-demo-only movement families"),
      expect.stringContaining("missing full proof"),
      expect.stringContaining("standing side-bend/head-direction support audit"),
      expect.stringContaining("broad upper-body standing support audit"),
      expect.stringContaining("Phase 14 script movement:upper-body-standing-capture-ready"),
    ]));
  });
});
