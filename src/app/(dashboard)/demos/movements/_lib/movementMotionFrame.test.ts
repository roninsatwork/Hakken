import { describe, expect, it } from "vitest";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import {
  resolveMovementGameplayEventFrameSummary,
  resolveMovementGameplayEvents,
} from "./movementGameplayEvents";
import { mirrorMovementLandmarksForDisplay } from "./movementMirrorMapping";
import {
  buildLiveMovementSourceFrame,
  buildRecordedMovementSourceFrame,
  buildSyntheticMovementSourceFrame,
} from "./movementSourceFrame";
import {
  buildMovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { resolveMovementMotionFrame } from "./movementMotionFrame";

function movementDecisionSemanticSnapshot(
  decision: ReturnType<typeof resolveMovementMotionFrame>["avatarDecision"],
) {
  return {
    bodyOrientation: decision.bodyOrientation.orientation,
    exercisePose: decision.exercisePose.poseKey,
    lowerLabel: decision.lowerLabel,
    lowerOwner: decision.lowerOwner,
    shouldDrivePlayerLegRaise: decision.lowerBodyDrive.shouldDrivePlayerLegRaise,
    shouldDrivePlayerSquat: decision.lowerBodyDrive.shouldDrivePlayerSquat,
    spineOwner: decision.spineDrive.owner,
    supportStatus: decision.supportConstraint.status,
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

describe("movementMotionFrame", () => {
  it("resolves a motion frame from a source frame through the current avatar pipeline", () => {
    const neutral = withCorePose();
    const active = squatPose();
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 1000,
      poseLandmarks: active,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "same-side",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });

    expect(motionFrame.source).toBe(sourceFrame);
    expect(motionFrame.cameraConfidence).toBe(sourceFrame.cameraConfidence);
    expect(motionFrame.startReadiness).toBe(sourceFrame.startReadiness);
    expect(motionFrame.mirrorMode).toBe("same-side");
    expect(motionFrame.displayLandmarks.pose).toBe(active);
    expect(motionFrame.truthSkeleton.sourceStatus).toBe("raw");
    expect(motionFrame.truthSkeleton.centers.hip?.x).toBeCloseTo(0.5);
    expect(motionFrame.avatarDecision.lowerBodyIntent.label).toBe("squat");
    expect(motionFrame.bodyOrientation).toBe(motionFrame.avatarDecision.bodyOrientation);
    expect(motionFrame.support).toBe(motionFrame.avatarDecision.bodySupport);
    expect(motionFrame.rootTarget).toBe(motionFrame.avatarDecision.rootOrientation);
    expect(motionFrame.owners).toMatchObject({
      feet: motionFrame.avatarDecision.feetOwner,
      lowerBody: motionFrame.avatarDecision.lowerOwner,
      root: motionFrame.avatarDecision.rootOrientation.owner,
      spine: motionFrame.avatarDecision.spineDrive.owner,
      torso: motionFrame.avatarDecision.torsoOwner,
    });
    expect(motionFrame.readability.scoreAllowed).toBe(true);
    expect(motionFrame.readability.state).toBe("active");
    expect(motionFrame.readability.confidence).toBe(sourceFrame.cameraConfidence.frameVisibility);
    expect(motionFrame.readability.rawMovementStrength).toBeGreaterThan(0);
    expect(motionFrame.readability.displayedMovementStrength).toBe(
      motionFrame.readability.readableMovementStrength,
    );
    expect(motionFrame.readability.readableMovementStrength).toBeGreaterThan(0);
    expect(motionFrame.avatarDecision.bodyConfidence.torso).toBeGreaterThan(0.8);
  });

  it("keeps source truth separate from display-adapted landmarks", () => {
    const sourcePose = withCorePose();
    const displayPose = sourcePose.map((landmark) => ({
      ...landmark,
      x: 1 - landmark.x,
    }));
    const sourceFrame = buildSyntheticMovementSourceFrame({
      capturedAt: 2000,
      poseLandmarks: sourcePose,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: sourcePose }),
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: sourcePose }),
      sourceFrame,
    });

    expect(motionFrame.source.landmarks.pose).toBe(sourcePose);
    expect(motionFrame.displayLandmarks.pose).toBe(displayPose);
    expect(motionFrame.mirrorMode).toBe("facing-player");
    expect(motionFrame.display.sideMap).toEqual({
      sourceLeft: "avatarRight",
      sourceRight: "avatarLeft",
    });
  });

  it("uses source landmarks for canonical movement decisions and display landmarks only for avatar display decisions", () => {
    const sourcePose = withCorePose();
    const displayPose = squatPose();
    const sourceFrame = buildSyntheticMovementSourceFrame({
      capturedAt: 3000,
      poseLandmarks: sourcePose,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: sourcePose }),
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: sourcePose }),
      sourceFrame,
    });

    expect(motionFrame.avatarDecision.lowerBodyIntent.label).toBe("neutral");
    expect(motionFrame.avatarDisplayDecision.lowerBodyIntent.label).toBe("squat");
    expect(motionFrame.readability.rawMovementStrength).toBeLessThan(0.1);
    expect(motionFrame.readability.displayedMovementStrength).toBeGreaterThan(0.1);
    expect(motionFrame.readability.readableMovementStrength).toBe(
      motionFrame.readability.displayedMovementStrength,
    );
    expect(motionFrame.truthSkeleton.centers.hip?.y).toBeCloseTo(0.68);
  });

  it("keeps source and display semantics aligned when display landmarks are only mirrored for presentation", () => {
    const neutral = withCorePose();
    const sourcePose = squatPose();
    const displayPose = mirrorMovementLandmarksForDisplay(sourcePose, {
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
    });
    const sourceFrame = buildSyntheticMovementSourceFrame({
      capturedAt: 3500,
      poseLandmarks: sourcePose,
    });
    const mirroredMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });
    const sourceOnlyMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });

    expect(movementDecisionSemanticSnapshot(mirroredMotionFrame.avatarDisplayDecision)).toEqual(
      movementDecisionSemanticSnapshot(mirroredMotionFrame.avatarDecision),
    );
    expect(resolveMovementGameplayEventFrameSummary(
      resolveMovementGameplayEvents({ motionFrame: mirroredMotionFrame }),
    )).toEqual(resolveMovementGameplayEventFrameSummary(
      resolveMovementGameplayEvents({ motionFrame: sourceOnlyMotionFrame }),
    ));
  });

  it("keeps recorded replay source and display semantics aligned when display landmarks are mirrored", () => {
    const neutral = withCorePose();
    const sourcePose = squatPose();
    const displayPose = mirrorMovementLandmarksForDisplay(sourcePose, {
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
    });
    const sourceFrame = buildRecordedMovementSourceFrame({
      bodyConfidence: {},
      capturedAt: 3600,
      fallbacks: {},
      tracking: {
        pose: sourcePose,
        worldPose: sourcePose,
      },
    });
    const mirroredMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      displayPoseLandmarks: displayPose,
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });
    const sourceOnlyMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame,
    });

    expect(mirroredMotionFrame.source.sourceOrigin).toBe("recorded-replay");
    expect(mirroredMotionFrame.source.landmarks.pose).toBe(sourcePose);
    expect(mirroredMotionFrame.displayLandmarks.pose).toBe(displayPose);
    expect(movementDecisionSemanticSnapshot(mirroredMotionFrame.avatarDisplayDecision)).toEqual(
      movementDecisionSemanticSnapshot(mirroredMotionFrame.avatarDecision),
    );
    expect(resolveMovementGameplayEventFrameSummary(
      resolveMovementGameplayEvents({ motionFrame: mirroredMotionFrame }),
    )).toEqual(resolveMovementGameplayEventFrameSummary(
      resolveMovementGameplayEvents({ motionFrame: sourceOnlyMotionFrame }),
    ));
  });

  it("exposes camera uncertainty through readability metadata", () => {
    const sourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 4000,
      poseLandmarks: weakTrackingPose(),
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: withCorePose() }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() }),
      sourceFrame,
    });

    expect(motionFrame.readability.state).toBe("lost");
    expect(motionFrame.readability.scoreAllowed).toBe(false);
    expect(motionFrame.readability.reasons).toEqual(expect.arrayContaining([
      "torso-weak",
      "head-weak",
    ]));
    expect(motionFrame.readability.messageEvents).toContain("move-where-i-can-see-you");
  });

  it("holds the last readable motion briefly when tracking drops", () => {
    const neutral = withCorePose();
    const previousSourceFrame = buildLiveMovementSourceFrame({
      capturedAt: 5000,
      frameId: "previous-readable",
      poseLandmarks: squatPose(),
    });
    const previousMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: previousSourceFrame,
    });
    const motionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      previousMotionFrame,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 5100,
        poseLandmarks: weakTrackingPose(),
      }),
    });

    expect(motionFrame.readability.state).toBe("held");
    expect(motionFrame.readability.scoreAllowed).toBe(false);
    expect(motionFrame.readability.heldFromFrameId).toBe("previous-readable");
    expect(motionFrame.readability.holdMsRemaining).toBe(150);
    expect(motionFrame.readability.reasons).toContain("held-last-readable-motion");
    expect(motionFrame.held).toEqual(["readability"]);
    expect(motionFrame.readability.readableMovementStrength).toBe(
      previousMotionFrame.readability.readableMovementStrength,
    );
  });

  it("does not hold expired or unreadable previous motion", () => {
    const neutral = withCorePose();
    const previousMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 6000,
        poseLandmarks: squatPose(),
      }),
    });
    const expiredMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      previousMotionFrame,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 6301,
        poseLandmarks: weakTrackingPose(),
      }),
    });
    const unreadablePreviousMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 7000,
        poseLandmarks: neutral,
      }),
    });
    const lowStrengthMotionFrame = resolveMovementMotionFrame({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: neutral }),
      mirrorMode: "facing-player",
      previousMotionFrame: unreadablePreviousMotionFrame,
      retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks: neutral }),
      sourceFrame: buildLiveMovementSourceFrame({
        capturedAt: 7100,
        poseLandmarks: weakTrackingPose(),
      }),
    });

    expect(expiredMotionFrame.readability.state).toBe("lost");
    expect(expiredMotionFrame.readability.holdMsRemaining).toBe(0);
    expect(expiredMotionFrame.held).toEqual([]);
    expect(lowStrengthMotionFrame.readability.state).toBe("lost");
    expect(lowStrengthMotionFrame.held).toEqual([]);
  });
});
