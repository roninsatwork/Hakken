import { describe, expect, it } from "vitest";
import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import { buildReplayAgentDiagnosisNavigationTargets } from "./replayAgentDiagnosisNavigation";

function makeAnalysis(): MovementReplayAnalysis {
  return {
    failures: [
      {
        code: "lower_body_owner_flicker",
        detail: "Owner changed too often.",
        frameIndex: 8,
        severity: "warning",
      },
    ],
    gamePath: {
      frames: [],
      sourceFrames: [],
      startReadinessMessageSummary: [],
    },
    metrics: {
      averageAvatarLowerBodyDirectionError: 0.44,
      avatarVisualFrameCount: 3,
      lowerBodyOwnerTransitions: 1,
      ownerTransitionsPerSecond: 0.5,
      visualMatchScore: 0.62,
    },
    replayStudio: {
      frames: [
        {
          actual: {
            comparedLowerBodySegments: 4,
            comparedUpperBodySegments: 2,
            feetOwner: "neutral",
            lowerBodyDirectionError: 0.12,
            lowerOwner: "neutral",
            supportIntent: "feet-floor",
            supportPresentation: "none",
            upperBodyDirectionError: 0.04,
          },
          expected: {
            motion: "neutral",
            owner: "neutral",
            side: null,
          },
          failures: [],
          frameIndex: 4,
          source: {
            readiness: "ready",
            sourceQuality: 0.92,
            visibleBodyParts: ["lower"],
          },
          status: "pass",
        },
        {
          actual: {
            comparedLowerBodySegments: 4,
            comparedUpperBodySegments: 2,
            feetOwner: "neutral",
            lowerBodyDirectionError: 0.44,
            lowerOwner: "player-left-leg-raise",
            supportIntent: "feet-floor",
            supportPresentation: "none",
            upperBodyDirectionError: 0.08,
          },
          expected: {
            motion: "leg-raise",
            owner: "player-right-leg-raise",
            side: "right",
          },
          failures: [
            {
              code: "avatar-wrong-side",
              detail: "Wrong side.",
              doNotPatch: [],
              evidenceStatus: "proven",
              focusedTests: [],
              likelyFiles: [],
              nextFixArea: "mirror mapping / side ownership",
              repairStage: "mirror-side-mapping",
              severity: "error",
            },
          ],
          frameIndex: 7,
          source: {
            readiness: "ready",
            sourceQuality: 0.94,
            visibleBodyParts: ["lower"],
          },
          status: "blocked",
        },
      ],
      session: {
        blockedFrameCount: 1,
        failureCount: 1,
        recordingId: "fixture",
        reviewedFrameCount: 0,
        status: "blocked",
        summary: {
          averageAvatarLowerBodyDirectionError: 0.44,
          avatarVisualFrameCount: 3,
          lowerBodyOwnerTransitionsPerSecond: 0.5,
          visualMatchScore: 0.62,
        },
        worstFrames: [],
      },
    },
    rootMotion: {
      frames: [],
      session: {
        status: "pass",
      },
    },
    sessionId: "fixture",
    summary: {
      frameCount: 2,
    },
  } as unknown as MovementReplayAnalysis;
}

describe("buildReplayAgentDiagnosisNavigationTargets", () => {
  it("returns first failure, worst frame, and first owner transition targets", () => {
    const analysis = makeAnalysis();
    analysis.replayStudio.session.worstFrames = [analysis.replayStudio.frames[1]];

    expect(buildReplayAgentDiagnosisNavigationTargets(analysis)).toEqual([
      {
        detail: "avatar-wrong-side",
        frameIndex: 7,
        key: "first-failure",
        label: "First Failure",
      },
      {
        detail: "avatar-wrong-side",
        frameIndex: 7,
        key: "worst-frame",
        label: "Worst Frame",
      },
      {
        detail: "neutral -> player-left-leg-raise",
        frameIndex: 7,
        key: "owner-transition",
        label: "Owner Transition",
      },
    ]);
  });

  it("omits targets when there is no analysis", () => {
    expect(buildReplayAgentDiagnosisNavigationTargets(null)).toEqual([]);
  });
});
