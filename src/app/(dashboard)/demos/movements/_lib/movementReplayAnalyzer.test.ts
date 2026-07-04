import { describe, expect, it } from "vitest";
import {
  parseMovementDebugReplaySessions,
  summarizeMovementDebugReplaySession,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
} from "./movementDebugReplay";
import { buildMovementReplaySessionFromRecording } from "./movementRecordingReplay";
import { analyzeMovementDebugReplaySession } from "./movementReplayAnalyzer";
import type { TrackingLandmark } from "./movementTrackingCalibration";

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
      appliedUpperBody: 0,
      hipDrop: 0,
      leftFootContact: false,
      leftKneeLift: 0,
      plantedSquatIkDepth: 0,
      rightFootContact: false,
      rightKneeLift: 0,
      sourceQuality: 0.9,
      squatDepth: 0,
      totalLowerBody: 6,
      totalUpperBody: 5,
      totalSegments: 11,
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

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
  const pose = makePose();
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

function scalePoseInFrame(
  pose: TrackingLandmark[],
  scale: number,
  origin = { x: 0.5, y: 0.28, z: 0 },
) {
  return pose.map((landmark) => ({
    ...landmark,
    x: origin.x + (landmark.x - origin.x) * scale,
    y: origin.y + (landmark.y - origin.y) * scale,
    z: origin.z + ((landmark.z ?? 0) - origin.z) * scale,
  }));
}

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function trackingFrame(pose: TrackingLandmark[]) {
  return frame({
    tracking: {
      pose,
      worldPose: pose,
    },
  });
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
  it("exposes simulated game-path frames for replay/game parity checks", () => {
    const neutralPose = withCorePose();
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(neutralPose),
      trackingFrame(scalePoseInFrame(neutralPose, 0.68)),
      trackingFrame(scalePoseInFrame(squatPose(), 0.68)),
    ]));

    expect(analysis.gamePath.calibrationQuality).toBeGreaterThan(0.8);
    expect(analysis.gamePath.retargetSourceQuality).toBeGreaterThan(0.8);
    expect(analysis.gamePath.parity.divergenceFrameCount).toBe(1);
    expect(analysis.gamePath.frames[1]).toMatchObject({
      lowerLabel: "neutral",
      shouldDrivePlayerSquat: false,
      squatDepth: 0,
      visualRootDrop: 0,
    });
    expect(analysis.gamePath.frames[2]).toMatchObject({
      feetOwner: "recorded-retarget",
      lowerLabel: "squat",
      lowerOwner: "player-stable-squat",
      shouldDrivePlayerSquat: true,
    });
    expect(analysis.gamePath.frames[2]?.squatDepth).toBeGreaterThan(0.55);
  });

  it("flags stored replay output that diverges from the simulated game path", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(scalePoseInFrame(squatPose(), 0.68)),
    ]));

    const divergence = analysis.failures.find((failure) => failure.code === "replay_game_path_diverged");
    expect(divergence).toMatchObject({
      frameIndex: 1,
      severity: "warning",
    });
    expect(analysis.gamePath.parity).toEqual({
      divergenceFrameCount: 1,
      firstDivergenceFrame: 1,
    });
    expect(divergence?.detail).toContain("replay output diverges from simulated game path");
  });

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
          appliedUpperBody: 5,
          hipDrop: 0.36,
          leftFootContact: true,
          leftKneeLift: 0.22,
          plantedSquatIkDepth: 0.44,
          rightFootContact: true,
          rightKneeLift: 0.22,
          sourceQuality: 0.92,
          squatDepth: 0.62,
          totalLowerBody: 6,
          totalUpperBody: 5,
          totalSegments: 11,
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
          appliedUpperBody: 5,
          hipDrop: 0.01,
          leftFootContact: false,
          leftKneeLift: 0,
          plantedSquatIkDepth: 0,
          rightFootContact: false,
          rightKneeLift: 0.46,
          sourceQuality: 0.98,
          squatDepth: 0,
          totalLowerBody: 6,
          totalUpperBody: 5,
          totalSegments: 11,
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
          maxY: 1.04,
          minX: 0.35,
          minY: 0.1,
          outOfFrameCount: 3,
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

  it("compresses contiguous source-quality warnings into frame ranges", () => {
    const makeOutOfFrame = () => frame({
      poseBounds: {
        maxX: 0.7,
        maxY: 1.04,
        minX: 0.35,
        minY: 0.1,
        outOfFrameCount: 3,
      },
    });
    const analysis = analyzeMovementDebugReplaySession(session([
      makeOutOfFrame(),
      makeOutOfFrame(),
      makeOutOfFrame(),
      frame(),
    ]));

    const sourceWarnings = analysis.failures.filter((failure) => (
      failure.code === "source_lower_body_out_of_frame"
    ));
    expect(sourceWarnings).toHaveLength(1);
    expect(sourceWarnings[0]?.frameIndex).toBe(0);
    expect(sourceWarnings[0]?.detail).toContain("Frames 0-2");
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

  it("flags upper-body avatar divergence when torso and arms do not match the source", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.12,
          averageUpperBodyDirectionError: 0.62,
          comparedLowerBodySegments: 6,
          comparedUpperBodySegments: 5,
          segments: {
            spine: {
              confidence: 0.96,
              direction: { x: 0, y: 1, z: 0 },
              length: 0.24,
              sourceDirection: { x: -0.45, y: 0.89, z: 0 },
              sourceError: 0.62,
            },
            leftUpperArm: {
              confidence: 0.96,
              direction: { x: -0.2, y: -0.98, z: 0 },
              length: 0.2,
              sourceDirection: { x: -0.85, y: -0.52, z: 0 },
              sourceError: 0.55,
            },
            rightUpperArm: {
              confidence: 0.96,
              direction: { x: 0.2, y: -0.98, z: 0 },
              length: 0.2,
              sourceDirection: { x: 0.85, y: -0.52, z: 0 },
              sourceError: 0.55,
            },
          },
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_upper_body_diverged");
  });

  it("flags modest upper-body mismatch instead of showing a clean frame", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.08,
          averageUpperBodyDirectionError: 0.21,
          comparedLowerBodySegments: 6,
          comparedUpperBodySegments: 5,
          segments: {
            spine: {
              confidence: 1,
              direction: { x: 0, y: 1, z: 0 },
              length: 0.24,
              sourceDirection: { x: -0.2, y: 0.98, z: 0 },
              sourceError: 0.2,
            },
            leftUpperArm: {
              confidence: 0.95,
              direction: { x: -0.1, y: -0.99, z: 0 },
              length: 0.2,
              sourceDirection: { x: -0.35, y: -0.94, z: 0 },
              sourceError: 0.2,
            },
            rightUpperArm: {
              confidence: 0.95,
              direction: { x: 0.1, y: -0.99, z: 0 },
              length: 0.2,
              sourceDirection: { x: 0.35, y: -0.94, z: 0 },
              sourceError: 0.2,
            },
          },
        },
      }),
    ]));

    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_upper_body_diverged");
  });
});
