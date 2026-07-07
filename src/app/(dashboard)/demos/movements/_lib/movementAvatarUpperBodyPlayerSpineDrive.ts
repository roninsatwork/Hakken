import type { MovementCalibration } from "./movementTrackingCalibration";
import type { MovementLandmark } from "./movementTypes";
import {
  average,
  clamp,
  midpoint,
  visibility,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerSpineDriveShared";

function getPoseHeadCenter(poseLandmarks: MovementLandmark[]) {
  const nose = poseLandmarks[0];
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  if (!nose || !leftEar || !rightEar) return null;

  return {
    x: average([nose.x, leftEar.x, rightEar.x]),
    y: average([nose.y, leftEar.y, rightEar.y]),
    z: average([nose.z ?? 0, leftEar.z ?? 0, rightEar.z ?? 0]),
    confidence: average([visibility(nose), visibility(leftEar), visibility(rightEar)]),
  };
}

export function resolveUpperBodyPlayerSpineDrive({
  calibration,
  poseLandmarks,
}: {
  calibration: MovementCalibration;
  poseLandmarks: MovementLandmark[];
}): MovementAvatarPlayerSpineDrive | null {
  const headCenter = getPoseHeadCenter(poseLandmarks);
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  if (!headCenter || !leftShoulder || !rightShoulder || !calibration.headCenter || !calibration.shoulderCenter) {
    return null;
  }

  const shoulderConfidence = average([visibility(leftShoulder), visibility(rightShoulder)]);
  const confidence = Math.min(headCenter.confidence, shoulderConfidence);
  if (confidence < 0.55) return null;

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const shoulderScale = Math.max(calibration.shoulderWidth, 0.16);
  const neutralHeadShoulderX = calibration.headCenter.x - calibration.shoulderCenter.x;
  const neutralHeadShoulderY = calibration.headCenter.y - calibration.shoulderCenter.y;
  const currentHeadShoulderX = headCenter.x - shoulderCenter.x;
  const currentHeadShoulderY = headCenter.y - shoulderCenter.y;
  const shoulderLateral = clamp(
    (shoulderCenter.x - calibration.shoulderCenter.x) / (shoulderScale * 0.85),
    -1,
    1,
  );
  const headShoulderSideBend = clamp(
    (currentHeadShoulderX - neutralHeadShoulderX) / (shoulderScale * 0.72),
    -1,
    1,
  );
  const sideBend = clamp(headShoulderSideBend * 0.55 + shoulderLateral * 0.55, -1, 1);
  const headDrop = clamp(
    (currentHeadShoulderY - neutralHeadShoulderY) / (shoulderScale * 0.78),
    -1,
    1,
  );
  const shoulderDrop = clamp(
    (shoulderCenter.y - calibration.shoulderCenter.y) / (shoulderScale * 0.9),
    -1,
    1,
  );
  const shoulderDepth = clamp(
    (((rightShoulder.z ?? 0) - (leftShoulder.z ?? 0)) / Math.max(shoulderScale, 0.16)) * 0.45,
    -1,
    1,
  );
  const forwardLean = clamp(headDrop * 0.72 + shoulderDrop * 0.28, -1, 1);
  const twist = shoulderDepth;
  const activity = Math.max(Math.abs(sideBend), Math.abs(forwardLean), Math.abs(twist));
  const owner = activity >= 0.06 ? "player-upper-body-model" : "player-upper-body-neutral";

  return {
    confidence,
    forwardLean,
    owner,
    rotations: {
      hips: {
        x: forwardLean * 0.02,
        y: twist * 0.02,
        z: -sideBend * 0.02,
      },
      spine: {
        x: forwardLean * 0.12,
        y: twist * 0.08,
        z: -sideBend * 0.2,
      },
      chest: {
        x: forwardLean * 0.22,
        y: twist * 0.16,
        z: -sideBend * 0.42,
      },
      upperChest: {
        x: forwardLean * 0.18,
        y: twist * 0.18,
        z: -sideBend * 0.38,
      },
    },
    shouldApplySpine: true,
    sideBend,
    twist,
  };
}
