import { describe, expect, it } from "vitest";

import {
  DEFAULT_WATCHED_FILES,
  buildMovementArchitectureGuardReport,
  evaluateSourcePurityRule,
  evaluateRouteBypassPurityRule,
  parseMovementArchitectureGuardArgs,
  summarizeCoverageProductTruth,
  summarizeBroadUpperBodyCaptureContract,
  summarizeGameVisualCaptureConsistency,
  summarizeGameSemanticReview,
  summarizeGameVisualReviewConsistency,
  summarizeProofManifest,
  summarizeReplayGameParity,
} from "./movement-architecture-guard.mjs";

const expectedInternalDemoOnlyFamilies = [
  "upper-body-standing",
  "root-turn",
  "root-travel",
];

const supportClaimVisualTargets = [
  { cases: ["baseline"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
  { cases: ["strongest-squat"], displayLowerLabel: "squat", sourceLowerLabel: "squat" },
  { cases: ["strongest-left-leg-lift"], displayLowerLabel: "left-knee-raise", sourceLowerLabel: "right-knee-raise" },
  { cases: ["strongest-right-leg-lift"], displayLowerLabel: "right-knee-raise", sourceLowerLabel: "left-knee-raise" },
  { cases: ["first-source-display-divergence"], displayLowerLabel: "left-knee-raise", sourceLowerLabel: "right-knee-raise" },
  { cases: ["strongest-side-bend"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
  { cases: ["strongest-head-direction"], displayLowerLabel: "neutral", sourceLowerLabel: "neutral" },
];
const expectedGameVisualProofFrames = 49;

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
        userFacingFamilies: ["upright", "standing-side-bend-head-direction", "squat-knee-lift"],
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
    ...["standing", "squat", "left-leg-raise", "right-leg-raise", "mirror-side-ownership", "side-bend", "head-direction"].map((proofCase) => ({
      acceptedProductLimitation: false,
      proofCase,
      recordingId: "recording-a",
      status: "passed",
    })),
    ...Array.from({ length: 59 }, () => ({ acceptedProductLimitation: false, status: "passed" })),
    ...Array.from({ length: 26 }, () => ({
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
      proofCase: "root-travel",
      status: "product-scope-limitation",
    })),
    ...[
      "standing-arm-raise",
      "standing-twist",
      "standing-reach",
      "shoulder-scapula-control",
    ].flatMap((proofCase) => (
      Array.from({ length: 9 }, () => ({
        acceptedProductLimitation: true,
        proofCase,
        status: "product-scope-limitation",
      }))
    )),
  ],
};

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
    ])).toEqual({
      proofPaths: {
        analysis: "tmp/analysis.json",
        captureManifest: "tmp/capture-manifest.json",
        manifest: "tmp/manifest.json",
        semanticReview: "tmp/semantic.json",
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
      userFacingFamilies: ["upright", "standing-side-bend-head-direction", "squat-knee-lift"],
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
      recordingIdPlaceholder: "<new-recording-id>",
      requiredGameProofCases: ["strongest-standing-arm-raise"],
      requiredRecordedProofCases: ["standing-arm-raise"],
      schema: "sonae-broad-upper-body-capture-contract/v1",
    })).toEqual({
      broadPassedProofCandidateCount: 0,
      broadPassingRecordingCount: 0,
      commandIds: ["initial-analysis", "merged-readiness-audit"],
      gameProofCases: ["strongest-standing-arm-raise"],
      hasRecordingPlaceholder: true,
      hasStrictFinalAudit: true,
      recordedProofCases: ["standing-arm-raise"],
      schema: "sonae-broad-upper-body-capture-contract/v1",
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
      hasStrictFinalAudit: false,
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

  it("passes when architecture watch files and proof artifacts are inside guardrails", () => {
    const report = buildMovementArchitectureGuardReport({
      analysis: cleanAnalysis,
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

    expect(report.ok).toBe(true);
    expect(report.proofFailures).toEqual([]);
    expect(report.broadUpperBodyCaptureContract).toMatchObject({
      commandIds: [
        "initial-analysis",
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
      recordedProofCases: [
        "standing-arm-raise",
        "standing-twist",
        "standing-reach",
        "shoulder-scapula-control",
      ],
      schema: "sonae-broad-upper-body-capture-contract/v1",
    });
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
      expect.stringContaining("internal-demo-only movement families"),
      expect.stringContaining("missing full proof"),
      expect.stringContaining("standing side-bend/head-direction support audit"),
    ]));
  });
});
