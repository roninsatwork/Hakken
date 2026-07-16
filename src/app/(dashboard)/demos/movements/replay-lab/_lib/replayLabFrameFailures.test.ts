import { describe, expect, it } from "vitest";
import { getReplayLabLiveCurrentFrameFailures } from "./replayLabFrameFailures";

type FailureInput = Parameters<typeof getReplayLabLiveCurrentFrameFailures>[0];

function failureInput(overrides: Partial<FailureInput> = {}): FailureInput {
  return {
    currentAvatarDebug: null,
    currentFrameActiveLegMotion: false,
    currentFrameSourceReady: false,
    currentFrameStationaryFeetFloorSideBend: false,
    currentFrameUsesSeatedSupport: false,
    safeFrameIndex: 12,
    ...overrides,
  };
}

describe("replay lab current-frame failures", () => {
  it("returns no failures without source or rendered-avatar evidence", () => {
    expect(getReplayLabLiveCurrentFrameFailures(failureInput())).toEqual([]);
  });

  it("keeps source framing failures tied to the selected frame", () => {
    const currentFrame = {
      poseBounds: {
        maxY: 1.12,
        outOfFrameCount: 5,
      },
    } as unknown as NonNullable<FailureInput["currentFrame"]>;

    expect(getReplayLabLiveCurrentFrameFailures(failureInput({ currentFrame }))).toContainEqual({
      code: "source_lower_body_out_of_frame",
      detail: expect.stringContaining("5 landmarks out of frame"),
      frameIndex: 12,
      severity: "warning",
    });
  });

  it("blocks active leg motion that is presented as seated support", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentFrameActiveLegMotion: true,
      currentFrameSourceReady: true,
      currentFrameUsesSeatedSupport: true,
    }));

    expect(failures).toContainEqual({
      code: "avatar_output_diverged",
      detail: expect.stringContaining("avatar support is seated"),
      frameIndex: 12,
      semanticCode: "movement-visible-but-unscored",
      severity: "error",
    });
  });

  it("uses the opposite avatar foot as planted during a leg raise", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentAvatarDebug: {
        avatarLegRaise: {
          appliedDepth: 0.5,
          expiresInMs: 0,
          holdActive: false,
          rawLeftDepth: 0.5,
          rawRightDepth: 0,
          side: "left",
        },
        avatarVisual: {
          averageLowerBodyDirectionError: 0,
          averageUpperBodyDirectionError: 0,
          comparedLowerBodySegments: 2,
          comparedUpperBodySegments: 2,
          footing: {
            leftFootClearance: 1.5,
            rightFootClearance: 0.01,
          },
          segments: {
            leftFoot: { sourceError: 0 },
            rightFoot: { sourceError: 0 },
          },
        },
        bodyConfidence: {},
        fallbacks: {},
        headApplied: {
          pitch: 0,
          roll: 0,
          yaw: 0,
        },
        headRaw: {
          confidence: 1,
          pitch: 0,
          roll: 0,
          source: "pose",
          yaw: 0,
        },
        updatedAt: 0,
      } as unknown as FailureInput["currentAvatarDebug"],
      currentFrameSourceReady: true,
      currentGamePathFrame: {
        supportIntentKey: "feet-floor",
      } as NonNullable<FailureInput["currentGamePathFrame"]>,
      currentRootMotionFrame: {
        intent: { plantedFoot: "left" },
      } as NonNullable<FailureInput["currentRootMotionFrame"]>,
    }));

    expect(failures.map((failure) => failure.code)).not.toContain("avatar_planted_foot_diverged");
  });

  it("accepts continuous recorded foot retarget when rendered leg segments are proven", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentAvatarDebug: {
        avatarVisual: {
          averageLowerBodyDirectionError: 0.01,
          averageUpperBodyDirectionError: 0,
          comparedLowerBodySegments: 6,
          comparedUpperBodySegments: 5,
          footing: {
            leftFootClearance: 0.01,
            rightFootClearance: 0.02,
          },
          segments: {
            leftFoot: { sourceError: 0.01 },
            rightFoot: { sourceError: 0.01 },
          },
        },
        bodyConfidence: {},
        fallbacks: {},
        headApplied: { pitch: 0, roll: 0, yaw: 0 },
        headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
        updatedAt: 0,
      } as unknown as FailureInput["currentAvatarDebug"],
      currentFrameActiveLegMotion: true,
      currentFrameSourceReady: true,
      currentGamePathFrame: {
        supportIntentKey: "feet-floor",
      } as NonNullable<FailureInput["currentGamePathFrame"]>,
      replayFeetOwner: "recorded-retarget",
    }));

    expect(failures.map((failure) => failure.code)).not.toContain("avatar_planted_foot_diverged");
  });

  it("marks an active spine owner proof-limited when its target rotations are missing", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentAvatarDebug: {
        avatarVisual: {
          averageUpperBodyDirectionError: 0,
          comparedUpperBodySegments: 4,
          segments: {
            spine: { sourceError: 0.8 },
          },
        },
        bodyConfidence: {},
        fallbacks: {},
        headApplied: { pitch: 0, roll: 0, yaw: 0 },
        headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
        spineDrive: {
          confidence: 0.9,
          forwardLean: 0.2,
          owner: "player-spine-model",
          sideBend: 0.1,
          twist: 0,
        },
        updatedAt: 0,
      } as unknown as FailureInput["currentAvatarDebug"],
      currentFrameSourceReady: true,
    }));

    expect(failures).toContainEqual({
      code: "spine_vertical_reference_missing",
      detail: expect.stringContaining("proof-limited"),
      frameIndex: 12,
      severity: "error",
    });
    expect(failures.map((failure) => failure.code)).not.toContain("avatar_spine_angle_diverged");
  });

  it("shows independent torso, head-chain, and toe-contact failures on the selected frame", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentAvatarDebug: {
        avatarVisual: {
          comparedLowerBodySegments: 0,
          semantic: {
            avatarScale: 2,
            evidenceVersion: "2026-07-16.v1",
            feet: {
              left: {
                heelClearance: 0.03,
                planeAngleRadians: 0.4,
                soleClearance: 0.03,
                sourceConfidence: 0.99,
                sourcePlanted: true,
                toeBaseClearance: 0.07,
                toeEndClearance: 0.09,
              },
              right: { sourcePlanted: false },
            },
            headChain: { confidence: 0.99, sourceError: 0.45 },
            torso: { confidence: 0.99, sourceError: 0.43 },
          },
          segments: {},
        },
        bodyConfidence: {},
        fallbacks: {},
        headApplied: { pitch: 0, roll: 0, yaw: 0 },
        headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
        updatedAt: 0,
      } as unknown as FailureInput["currentAvatarDebug"],
      currentFrameSourceReady: true,
    }));

    expect(failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "avatar_spine_angle_diverged",
      "avatar_head_alignment_diverged",
      "avatar_planted_foot_diverged",
    ]));
  });
});
