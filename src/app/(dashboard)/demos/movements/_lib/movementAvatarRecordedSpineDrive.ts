import type { MovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementSpineModel } from "./movementSpineMetrics";
import type { MovementLandmark } from "./movementTypes";
import {
  capRecordedPresentationSideBend,
  clamp,
  NEUTRAL_PLAYER_SPINE_DRIVE,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerSpineDriveShared";

export function resolveMovementAvatarRecordedSpineDrive({
  kneeLift,
  poseLandmarks,
  retargetCalibration,
  torsoTrackingReady,
}: {
  kneeLift?: { left: number; right: number } | null;
  poseLandmarks: MovementLandmark[];
  retargetCalibration?: MovementRetargetSourceModel | null;
  torsoTrackingReady: boolean;
}): MovementAvatarPlayerSpineDrive {
  if (!torsoTrackingReady || !retargetCalibration || retargetCalibration.quality < 0.45) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      owner: "recorded-spine-held",
    };
  }

  const spineModel = buildMovementSpineModel(poseLandmarks);
  if (!spineModel || spineModel.confidence < 0.35) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      confidence: spineModel?.confidence ?? 0,
      owner: "recorded-spine-held",
    };
  }

  const neutralSideBend = retargetCalibration.shoulderCenter.x - retargetCalibration.hipCenter.x;
  const neutralLean = retargetCalibration.shoulderCenter.y - retargetCalibration.hipCenter.y;
  const sideBend = clamp((spineModel.torsoSideBend - neutralSideBend) / 0.16, -1, 1);
  const presentationSideBend = capRecordedPresentationSideBend(sideBend, kneeLift);
  const forwardLean = clamp((spineModel.torsoLean - neutralLean) / 0.18, -1, 1);
  const twist = clamp(spineModel.shoulderHipRotation / 0.65, -1, 1);
  const activity = Math.max(Math.abs(sideBend), Math.abs(forwardLean), Math.abs(twist));
  const owner = activity >= 0.06 ? "recorded-spine-model" : "recorded-spine-neutral";

  return {
    confidence: spineModel.confidence,
    forwardLean,
    owner,
    rotations: {
      hips: {
        x: forwardLean * 0.03,
        y: twist * 0.03,
        z: presentationSideBend * 0.6,
      },
      spine: {
        x: forwardLean * 0.16,
        y: twist * 0.08,
        z: presentationSideBend * 0.95,
      },
      chest: {
        x: forwardLean * 0.2,
        y: twist * 0.12,
        z: presentationSideBend * 1.35,
      },
      upperChest: {
        x: forwardLean * 0.14,
        y: twist * 0.1,
        z: presentationSideBend * 1.1,
      },
    },
    shouldApplySpine: true,
    sideBend,
    twist,
  };
}
