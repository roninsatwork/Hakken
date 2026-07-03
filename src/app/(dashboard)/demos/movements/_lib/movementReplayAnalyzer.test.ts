import { describe, expect, it } from "vitest";
import {
  parseMovementDebugReplaySessions,
  summarizeMovementDebugReplaySession,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
} from "./movementDebugReplay";
import { buildMovementReplaySessionFromRecording } from "./movementRecordingReplay";
import { analyzeMovementDebugReplaySession } from "./movementReplayAnalyzer";

function frame(overrides: Partial<MovementDebugReplayFrame> = {}): MovementDebugReplayFrame {
  return {
    bodyConfidence: {
      head: 0.98,
      hips: 0.98,
      leftFoot: 0.92,
      leftKnee: 0.95,
      rightFoot: 0.92,
      rightKnee: 0.95,
      torso: 0.98,
    },
    capturedAt: 1000,
    fallbacks: {
      lowerBody: "neutral",
      owners: "head player-calibrated; torso player-spine-model; lower neutral; feet neutral",
      retarget: "q0.90 s0.00 hip0.00 knee 0.00/0.00 feet --",
    },
    poseBounds: {
      maxX: 0.65,
      maxY: 0.95,
      minX: 0.35,
      minY: 0.1,
      outOfFrameCount: 0,
    },
    retarget: {
      appliedLowerBody: 0,
      hipDrop: 0,
      leftFootContact: false,
      leftKneeLift: 0,
      plantedSquatIkDepth: 0,
      rightFootContact: false,
      rightKneeLift: 0,
      sourceQuality: 0.9,
      squatDepth: 0,
      visualRootDrop: 0,
    },
    tracking: {
      pose: [],
      worldPose: [],
    },
    ...overrides,
  };
}

function session(samples: MovementDebugReplayFrame[]): MovementDebugReplaySession {
  return {
    baselineSummary: "full-body-auto-baseline:4",
    durationMs: 1600,
    endedAt: 2600,
    id: "session-1",
    movementId: "movement-1",
    sampleCount: samples.length,
    samples,
    startedAt: 1000,
    trigger: "debug-auto-baseline",
    warningSummary: "none",
  };
}

describe("movement debug replay parsing", () => {
  it("parses Convex data rows with samplesJson into replay sessions", () => {
    const sessions = parseMovementDebugReplaySessions([
      {
        _id: "abc",
        baselineSummary: "full-body-auto-baseline:2",
        durationMs: 900,
        endedAt: 1900,
        movementId: "movement-1",
        sampleCount: 1,
        samplesJson: JSON.stringify([
          frame({
            avatarVisual: {
              averageLowerBodyDirectionError: 0.12,
              comparedLowerBodySegments: 6,
              segments: {
                leftThigh: {
                  direction: { x: 0, y: -1, z: 0 },
                  length: 0.4,
                  sourceDirection: { x: 0, y: -1, z: 0 },
                  sourceError: 0.12,
                },
              },
            },
            camera: {
              aspectRatio: 4 / 3,
              trackHeight: 960,
              trackWidth: 1280,
              videoHeight: 960,
              videoWidth: 1280,
            },
          }),
        ]),
        startedAt: 1000,
        trigger: "debug-auto-baseline",
        warningSummary: "none",
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe("abc");
    expect(sessions[0]?.samples[0]?.avatarVisual?.comparedLowerBodySegments).toBe(6);
    expect(sessions[0]?.samples[0]?.camera?.trackWidth).toBe(1280);

    const summary = summarizeMovementDebugReplaySession(sessions[0]!);
    expect(summary.cameraModes).toEqual(["1280x960 ar1.33"]);
    expect(summary.averageRetargetQuality).toBeCloseTo(0.9);
  });

  it("converts full movement recording frames into replay sessions", () => {
    const pose = Array.from({ length: 33 }, (_, index) => ({
      x: 0.4 + index * 0.002,
      y: 0.2 + index * 0.01,
      z: 0,
      visibility: 0.9,
    }));
    const sessionFromRecording = buildMovementReplaySessionFromRecording(
      {
        _id: "movement-recording-1",
        createdAt: 1000,
        durationMs: 66,
        poseData: "[]",
        title: "Full squat recording",
      },
      [
        { timestamp: 0, landmarks: pose, worldLandmarks: pose },
        { timestamp: 33, landmarks: pose, worldLandmarks: pose },
      ],
      30,
    );

    expect(sessionFromRecording.id).toBe("movement-recording-1");
    expect(sessionFromRecording.trigger).toBe("saved-movement-recording");
    expect(sessionFromRecording.sampleCount).toBe(2);
    expect(sessionFromRecording.samples[0]?.tracking.pose).toHaveLength(33);
    expect(sessionFromRecording.samples[0]?.poseBounds?.outOfFrameCount).toBe(0);
  });
});

describe("movement replay analyzer", () => {
  it("passes a stable squat and stand recovery session", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame(),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.62",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          appliedLowerBody: 6,
          hipDrop: 0.36,
          leftFootContact: true,
          leftKneeLift: 0.22,
          plantedSquatIkDepth: 0.44,
          rightFootContact: true,
          rightKneeLift: 0.22,
          sourceQuality: 0.92,
          squatDepth: 0.62,
          visualRootDrop: 0.62,
        },
      }),
      frame(),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures).toEqual([]);
    expect(analysis.metrics.strongFullBodyFrameCount).toBe(3);
  });

  it("flags neutral feet while strong leg motion is present", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto d0.00 h0.01 k0.00 t0.84 l0.00 r0.46",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
        retarget: {
          appliedLowerBody: 0,
          hipDrop: 0.01,
          leftFootContact: false,
          leftKneeLift: 0,
          plantedSquatIkDepth: 0,
          rightFootContact: false,
          rightKneeLift: 0.46,
          sourceQuality: 0.98,
          squatDepth: 0,
          visualRootDrop: 0,
        },
      }),
    ]));

    expect(analysis.pass).toBe(false);
    expect(analysis.failures.map((failure) => failure.code)).toContain("false_knee_raise_candidate");
    expect(analysis.failures.map((failure) => failure.code)).toContain("feet_neutral_while_leg_motion_present");
  });

  it("flags lower body out of frame separately from avatar failures", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        bodyConfidence: {
          hips: 0.99,
          leftFoot: 0.08,
          leftKnee: 0.27,
          rightFoot: 0.09,
          rightKnee: 0.24,
        },
        poseBounds: {
          maxX: 0.7,
          maxY: 1.4,
          minX: 0.35,
          minY: 0.1,
          outOfFrameCount: 8,
        },
        retarget: {
          sourceQuality: 0.5,
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("source_lower_body_out_of_frame");
    expect(analysis.failures.every((failure) => failure.severity === "warning")).toBe(true);
  });

  it("flags sticky squat recovery when source returns neutral but avatar remains held", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.60",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0.4,
          plantedSquatIkDepth: 0.5,
          sourceQuality: 0.92,
          squatDepth: 0.6,
          visualRootDrop: 0.6,
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "neutral",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat-held; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0,
          leftKneeLift: 0,
          plantedSquatIkDepth: 0.24,
          rightKneeLift: 0,
          sourceQuality: 0.93,
          squatDepth: 0,
          visualRootDrop: 0.22,
        },
      }),
    ]));

    expect(analysis.pass).toBe(false);
    expect(analysis.failures.map((failure) => failure.code)).toContain("stand_recovery_missing");
  });

  it("flags excessive lower-body owner flicker", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame(),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.4",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
      }),
      frame(),
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto r0.5",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
      }),
    ]));

    expect(analysis.failures.map((failure) => failure.code)).toContain("lower_body_owner_flicker");
  });

  it("flags avatar output divergence when final VRM bones do not match the source", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.68,
          comparedLowerBodySegments: 6,
          segments: {
            leftThigh: {
              confidence: 0.92,
              direction: { x: 0.9, y: -0.1, z: 0 },
              length: 0.42,
              sourceDirection: { x: 0, y: -1, z: 0 },
              sourceError: 0.7,
            },
          },
        },
        fallbacks: {
          lowerBody: "squat-auto d0.62",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0.36,
          plantedSquatIkDepth: 0.44,
          sourceQuality: 0.92,
          squatDepth: 0.62,
          visualRootDrop: 0.62,
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_output_diverged");
    expect(analysis.metrics.avatarVisualFrameCount).toBe(1);
    expect(analysis.metrics.averageAvatarLowerBodyDirectionError).toBeCloseTo(0.68);
  });
});
