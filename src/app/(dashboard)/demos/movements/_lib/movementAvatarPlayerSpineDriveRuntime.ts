import { buildMovementSpineModel } from "./movementSpineMetrics";
import type { MovementCalibration } from "./movementTrackingCalibration";
import type { MovementLandmark } from "./movementTypes";
import { resolveUpperBodyPlayerSpineDrive } from "./movementAvatarUpperBodyPlayerSpineDrive";
import {
  average,
  capRecordedPresentationSideBend,
  clamp,
  NEUTRAL_PLAYER_SPINE_DRIVE,
  visibility,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerSpineDriveShared";

export function resolveMovementAvatarPlayerSpineDrive({
  calibration,
  isPlayer,
  poseLandmarks,
  torsoTrackingReady,
}: {
  calibration?: MovementCalibration | null;
  isPlayer: boolean;
  poseLandmarks: MovementLandmark[];
  torsoTrackingReady: boolean;
}): MovementAvatarPlayerSpineDrive {
  if (!isPlayer) return NEUTRAL_PLAYER_SPINE_DRIVE;
  if (!torsoTrackingReady) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      owner: "player-spine-held",
    };
  }

  if (!calibration || calibration.quality < 0.45) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      owner: "player-spine-held",
    };
  }

  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const hipConfidence = average([visibility(leftHip), visibility(rightHip)]);
  if (hipConfidence < 0.3) {
    const upperBodyDrive = resolveUpperBodyPlayerSpineDrive({ calibration, poseLandmarks });
    if (upperBodyDrive) return upperBodyDrive;
  }

  const spineModel = buildMovementSpineModel(poseLandmarks);
  if (!spineModel || spineModel.confidence < 0.35 || !calibration.shoulderCenter) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      confidence: spineModel?.confidence ?? 0,
      owner: "player-spine-held",
    };
  }

  const neutralSideBend = calibration.shoulderCenter.x - calibration.hipCenter.x;
  const neutralLean = calibration.shoulderCenter.y - calibration.hipCenter.y;
  const neutralDepthLean = calibration.shoulderCenter.z - calibration.hipCenter.z;
  const sideBend = clamp((spineModel.torsoSideBend - neutralSideBend) / 0.16, -1, 1);
  const presentationSideBend = capRecordedPresentationSideBend(sideBend);
  const forwardLean = clamp((spineModel.torsoLean - neutralLean) / 0.18, -1, 1);
  const depthLean = clamp((spineModel.torsoDepthLean - neutralDepthLean) / 0.18, -1, 1);
  const presentationForwardLean = Math.abs(depthLean) > Math.abs(forwardLean)
    ? depthLean
    : forwardLean;
  const twist = clamp(spineModel.shoulderHipRotation / 0.65, -1, 1);
  const activity = Math.max(Math.abs(sideBend), Math.abs(forwardLean), Math.abs(depthLean), Math.abs(twist));
  const owner = activity >= 0.06 ? "player-spine-model" : "player-spine-neutral";

  return {
    confidence: spineModel.confidence,
    forwardLean,
    owner,
    rotations: {
      hips: {
        x: -presentationForwardLean * 0.08,
        y: twist * 0.04,
        z: 0,
      },
      spine: {
        x: -presentationForwardLean * 0.32,
        y: twist * 0.08,
        z: presentationSideBend * 0.95,
      },
      chest: {
        x: -presentationForwardLean * 0.52,
        y: twist * 0.12,
        z: presentationSideBend * 1.35,
      },
      upperChest: {
        x: -presentationForwardLean * 0.38,
        y: twist * 0.1,
        z: presentationSideBend * 1.1,
      },
    },
    shouldApplySpine: true,
    sideBend,
    twist,
  };
}
