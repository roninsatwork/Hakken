import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementLandmark } from "./movementTypes";
import { resolveMovementAvatarFullBodySpineDrive } from "./movementAvatarFullBodySpineDrive";
import { NEUTRAL_PLAYER_SPINE_DRIVE, type MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerSpineDriveShared";

export function resolveMovementAvatarRecordedSpineDrive({
  kneeLift,
  poseLandmarks,
  retargetCalibration,
  torsoTrackingReady,
  worldPoseLandmarks,
}: {
  kneeLift?: { left: number; right: number } | null;
  poseLandmarks: MovementLandmark[];
  retargetCalibration?: MovementRetargetSourceModel | null;
  torsoTrackingReady: boolean;
  worldPoseLandmarks?: MovementLandmark[] | null;
}): MovementAvatarPlayerSpineDrive {
  if (!torsoTrackingReady || !retargetCalibration || retargetCalibration.quality < 0.45) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      owner: "recorded-spine-held",
    };
  }

  return resolveMovementAvatarFullBodySpineDrive({
    kneeLift,
    ownerRole: "instructor",
    poseLandmarks,
    retargetCalibration,
    worldPoseLandmarks,
  });
}
