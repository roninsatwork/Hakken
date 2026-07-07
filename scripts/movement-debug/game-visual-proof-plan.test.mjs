import { describe, expect, it } from "vitest";

import {
  gameVisualProofPlanForAnalyses,
  parseGameVisualProofPlanArgs,
} from "./game-visual-proof-plan.mjs";

const analysis = {
  gamePath: {
    visualProofFrames: [
      {
        cases: ["baseline"],
        displayLowerLabel: "neutral",
        displayedMovementStrength: 0,
        frameIndex: 0,
        rawMovementStrength: 0,
        readableMovementStrength: 0,
        reasons: ["first available Game motion frame"],
        scoreAllowed: true,
        sourceLowerLabel: "neutral",
      },
      {
        cases: ["first-scoring-frame", "strongest-squat"],
        displayLowerLabel: "squat",
        displayedMovementStrength: 0.61,
        frameIndex: 24,
        rawMovementStrength: 0.6,
        readableMovementStrength: 0.61,
        reasons: ["first Game gameplay event with positive score", "strongest displayed squat depth"],
        rootHeadingYaw: 0.2,
        rootTravelDistance: 0.02,
        scoreAllowed: true,
        sourceLowerLabel: "squat",
        squatDepth: 0.44,
      },
    ],
  },
  sessionId: "recording-abc123",
  summary: {
    frameCount: 48,
    movementId: "movement-1",
  },
};

describe("game visual proof plan", () => {
  it("parses focused planning arguments", () => {
    expect(parseGameVisualProofPlanArgs([
      "--analysis",
      "tmp/analysis.json",
      "--out",
      "tmp/plan.json",
      "--base-url",
      "http://localhost:3100",
        "--max-sessions",
        "2",
        "--max-frames-per-session",
        "3",
        "--proof-case",
        "strongest-standing-arm-raise",
        "--proof-case",
        "strongest-standing-twist",
      ])).toMatchObject({
        analysisPath: "tmp/analysis.json",
        baseUrl: "http://localhost:3100",
        maxFramesPerSession: 3,
        maxSessions: 2,
        outPath: "tmp/plan.json",
        proofCases: ["strongest-standing-arm-raise", "strongest-standing-twist"],
      });
  });

  it("builds a machine-readable Game Studio visual target plan from replay analysis", () => {
    const plan = gameVisualProofPlanForAnalyses([analysis], {
      baseUrl: "http://localhost:3100/",
    });

    expect(plan.summary).toMatchObject({
      byProofCase: {
        baseline: 1,
        "first-scoring-frame": 1,
        "strongest-squat": 1,
      },
      movementIds: ["movement-1"],
      proofCases: ["baseline", "first-scoring-frame", "strongest-squat"],
      recordingIds: ["recording-abc123"],
      analysisWithVisualProofFrameFieldCount: 1,
      selectedSessionCount: 1,
      targetFrameCount: 2,
      totalAnalysisCount: 1,
    });
    expect(plan.sessions).toEqual([
      expect.objectContaining({
        captureMode: "game-studio-recorded-frame-injection-needed",
        frameCount: 48,
        movementId: "movement-1",
        nextAction: expect.stringContaining("Do not count them as visual proof"),
        playRouteHint: "http://localhost:3100/demos/movements/movement-1/play?debugTracking=1&guidedPreview=1",
        recordingId: "recording-abc123",
        targetFrameCount: 2,
      }),
    ]);
    expect(plan.sessions[0]?.frames[1]).toMatchObject({
      cases: ["first-scoring-frame", "strongest-squat"],
      frameIndex: 24,
      playRouteHint: "http://localhost:3100/demos/movements/movement-1/play?debugTracking=1&guidedPreview=1&debugGameFrame=24",
      squatDepth: 0.44,
    });
  });

  it("limits sessions and frames without changing proof-case metadata shape", () => {
    const plan = gameVisualProofPlanForAnalyses([
      analysis,
      {
        ...analysis,
        sessionId: "recording-def456",
      },
    ], {
      maxFramesPerSession: 1,
      maxSessions: 1,
    });

    expect(plan.summary).toMatchObject({
      maxFramesPerSession: 1,
      maxSessions: 1,
      recordingIds: ["recording-abc123"],
      selectedSessionCount: 1,
      targetFrameCount: 1,
    });
    expect(plan.sessions[0]?.frames).toHaveLength(1);
    expect(plan.sessions[0]?.proofCases).toEqual(["baseline"]);
  });

  it("filters a focused plan to requested proof cases", () => {
    const broadAnalysis = {
      ...analysis,
      gamePath: {
        visualProofFrames: [
          ...analysis.gamePath.visualProofFrames,
          {
            cases: ["strongest-standing-arm-raise", "strongest-standing-reach"],
            displayLowerLabel: "neutral",
            frameIndex: 32,
            rawMovementStrength: 0.4,
            readableMovementStrength: 0.55,
            reasons: ["strongest displayed standing arm raise"],
            scoreAllowed: true,
            sourceLowerLabel: "neutral",
          },
          {
            cases: ["strongest-standing-twist"],
            displayLowerLabel: "neutral",
            frameIndex: 40,
            rawMovementStrength: 0.35,
            readableMovementStrength: 0.52,
            reasons: ["strongest displayed standing twist"],
            scoreAllowed: true,
            sourceLowerLabel: "neutral",
          },
        ],
      },
    };
    const plan = gameVisualProofPlanForAnalyses([broadAnalysis], {
      proofCases: ["strongest-standing-arm-raise", "strongest-standing-twist"],
    });

    expect(plan.summary).toMatchObject({
      byProofCase: {
        "strongest-standing-arm-raise": 1,
        "strongest-standing-reach": 1,
        "strongest-standing-twist": 1,
      },
      proofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-reach",
        "strongest-standing-twist",
      ],
      requestedProofCases: ["strongest-standing-arm-raise", "strongest-standing-twist"],
      targetFrameCount: 2,
    });
    expect(plan.sessions[0]?.frames.map((frame) => frame.frameIndex)).toEqual([32, 40]);
  });
});
