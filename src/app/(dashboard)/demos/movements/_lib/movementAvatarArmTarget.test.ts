import { describe, expect, it } from "vitest";
import { resolveMovementAvatarArmTargetComposition } from "./movementAvatarArmTarget";
import {
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarStudioDecision,
} from "./movementAvatarLegacyDecision";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import {
  createVrmImageSolverLandmarks,
  normalizeVrmLandmark,
  type VrmHandsPayload,
  type VrmSolverLandmark,
} from "./vrmRigging";

function solverLandmarks(): VrmSolverLandmark[] {
  return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
}

describe("movement avatar arm target composition", () => {
  it("composes player arm landmarks with hand wrist fallback and front-body cleanup", () => {
    const imageLandmarks = solverLandmarks();
    imageLandmarks[15] = {
      ...imageLandmarks[15]!,
      visibility: 0.2,
    };
    const targetSolverLandmarks = createVrmImageSolverLandmarks(imageLandmarks);
    const calibration = buildMovementCalibration({ poseLandmarks: imageLandmarks });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: imageLandmarks });
    const decision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: imageLandmarks },
    });
    const rigHands: VrmHandsPayload = {
      left: {
        landmarks: [
          {
            x: 0.68,
            y: 0.42,
            z: -0.09,
            visibility: 0.95,
          },
        ],
      },
    };

    const target = resolveMovementAvatarArmTargetComposition({
      imageLandmarks,
      isPlayer: true,
      lowerBodyDrive: decision.lowerBodyDrive,
      rigHands,
      solverLandmarks: imageLandmarks,
      targetSolverLandmarks,
    });

    expect(target.armTargets.left.wristSource).toBe("hand");
    expect(target.leftFrontBodyArmBias).toBeGreaterThan(0);
    expect(target.leftElbowTarget?.x).not.toBe(target.playerArmLandmarks[13]!.x);
    expect(target.leftWristTarget).toEqual(target.armTargets.left.wristTarget);
    expect(target.rightWristTarget).toEqual(target.armTargets.right.wristTarget);
    expect(target.playerSafeArmZScale).toBe(0.24);
  });

  it("keeps recorded arm targets same-side and free of live front-body bias", () => {
    const imageLandmarks = solverLandmarks();
    const calibration = buildMovementCalibration({ poseLandmarks: imageLandmarks });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: imageLandmarks });
    const decision = resolveMovementAvatarReplayDecision({
      avatarRole: "instructor",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: imageLandmarks },
    });

    const target = resolveMovementAvatarArmTargetComposition({
      imageLandmarks,
      isPlayer: false,
      lowerBodyDrive: decision.lowerBodyDrive,
      rigHands: undefined,
      solverLandmarks: imageLandmarks,
      targetSolverLandmarks: imageLandmarks,
    });

    expect(target.armTargets.left.wristSource).toBe("pose");
    expect(target.leftFrontBodyArmBias).toBe(0);
    expect(target.leftElbowTarget).toEqual(imageLandmarks[13]);
    expect(target.leftWristTarget).toEqual(imageLandmarks[15]);
    expect(target.playerSafeArmZScale).toBeUndefined();
  });
});
