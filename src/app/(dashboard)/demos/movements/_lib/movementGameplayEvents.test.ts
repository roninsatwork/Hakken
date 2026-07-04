import { describe, expect, it } from "vitest";
import { resolveMovementGameplayEvents } from "./movementGameplayEvents";
import { resolveMovementMotionFrame } from "./movementMotionFrame";
import {
  buildLiveMovementSourceFrame,
  buildSyntheticMovementSourceFrame,
} from "./movementSourceFrame";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

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

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function weakTrackingPose() {
  return withCorePose().map((landmark) => ({
    ...landmark,
    visibility: 0.05,
  }));
}

function motionFrameFor(poseLandmarks: TrackingLandmark[], capturedAt = 1000) {
  const neutral = withCorePose();
  const sourceFrame = buildSyntheticMovementSourceFrame({
    capturedAt,
    poseLandmarks,
  });

  return resolveMovementMotionFrame({
    avatarRole: "player",
    calibration: buildMovementCalibration({ poseLandmarks: neutral }),
    mirrorMode: "facing-player",
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
    sourceFrame,
  });
}

describe("movementGameplayEvents", () => {
  it("awards child-friendly gameplay events for clear visible movement", () => {
    const motionFrame = motionFrameFor(squatPose());
    const result = resolveMovementGameplayEvents({ motionFrame });

    expect(result.scoreAllowed).toBe(true);
    expect(result.readableMovementStrength).toBeGreaterThan(0.28);
    expect(result.nextStreak).toBe(1);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "effort-reward",
        message: "great-effort",
        scoreDelta: 5,
      }),
      expect.objectContaining({
        eventType: "clear-movement-match",
        message: "nice-clear-move",
        scoreDelta: 10,
      }),
    ]));
  });

  it("uses help events instead of score loss when tracking is not scoreable", () => {
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: weakTrackingPose(),
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: withCorePose() }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() }),
      sourceFrame,
    });
    const result = resolveMovementGameplayEvents({
      motionFrame,
      streak: 3,
    });

    expect(result.scoreAllowed).toBe(false);
    expect(result.nextStreak).toBe(0);
    expect(result.events).toEqual([
      expect.objectContaining({
        eventType: "tracking-uncertainty",
        message: expect.stringMatching(/move-where-i-can-see-you|show-your-hands|show-your-feet/),
        scoreDelta: 0,
      }),
    ]);
  });

  it("emits recovery and streak events from motion-frame state", () => {
    const lost = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: withCorePose() }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 1000,
        poseLandmarks: weakTrackingPose(),
      }),
    });
    const recovered = motionFrameFor(squatPose(), 1100);
    const result = resolveMovementGameplayEvents({
      motionFrame: recovered,
      previousMotionFrame: lost,
      streak: 4,
    });

    expect(result.nextStreak).toBe(5);
    expect(result.events.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "recovery-after-lost-tracking",
      "streak-celebration",
    ]));
  });
});
