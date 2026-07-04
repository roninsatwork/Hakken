import type { MovementCalibration } from "./movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementSpineModel } from "./movementSpineMetrics";
import type { MovementLandmark } from "./movementTypes";

type AvatarRotation = {
  x: number;
  y: number;
  z: number;
};

export type MovementAvatarPlayerSpineDrive = {
  confidence: number;
  forwardLean: number;
  owner:
    | "neutral"
    | "player-spine-held"
    | "player-spine-model"
    | "player-spine-neutral"
    | "player-upper-body-model"
    | "player-upper-body-neutral"
    | "recorded-spine-held"
    | "recorded-spine-model"
    | "recorded-spine-neutral";
  rotations: {
    chest: AvatarRotation;
    hips: AvatarRotation;
    spine: AvatarRotation;
    upperChest: AvatarRotation;
  };
  shouldApplySpine: boolean;
  sideBend: number;
  twist: number;
};

const NEUTRAL_ROTATION: AvatarRotation = { x: 0, y: 0, z: 0 };

const NEUTRAL_PLAYER_SPINE_DRIVE: MovementAvatarPlayerSpineDrive = {
  confidence: 0,
  forwardLean: 0,
  owner: "neutral",
  rotations: {
    chest: NEUTRAL_ROTATION,
    hips: NEUTRAL_ROTATION,
    spine: NEUTRAL_ROTATION,
    upperChest: NEUTRAL_ROTATION,
  },
  shouldApplySpine: false,
  sideBend: 0,
  twist: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function neutralRotation(): AvatarRotation {
  return { x: 0, y: 0, z: 0 };
}

function capRecordedPresentationSideBend(
  sideBend: number,
  kneeLift?: { left: number; right: number } | null,
) {
  const kneeAsymmetry = kneeLift ? Math.abs(kneeLift.left - kneeLift.right) : 0;
  const singleLegFactor = clamp((kneeAsymmetry - 0.04) / 0.08, 0, 1);
  const moderateSideBendFactor = clamp((0.5 - Math.abs(sideBend)) / 0.18, 0, 1);
  const singleLegOffsetFactor = singleLegFactor * moderateSideBendFactor;
  const cap = 0.32 - singleLegOffsetFactor * 0.24;
  return clamp(sideBend, -cap, cap);
}

function visibility(landmark?: MovementLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function midpoint(a: MovementLandmark, b: MovementLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

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

function resolveUpperBodyPlayerSpineDrive({
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
  const sideBend = clamp((spineModel.torsoSideBend - neutralSideBend) / 0.16, -1, 1);
  const forwardLean = clamp((spineModel.torsoLean - neutralLean) / 0.18, -1, 1);
  const twist = clamp(spineModel.shoulderHipRotation / 0.65, -1, 1);
  const activity = Math.max(Math.abs(sideBend), Math.abs(forwardLean), Math.abs(twist));
  const owner = activity >= 0.06 ? "player-spine-model" : "player-spine-neutral";

  return {
    confidence: spineModel.confidence,
    forwardLean,
    owner,
    rotations: {
      hips: {
        x: forwardLean * 0.04,
        y: twist * 0.04,
        z: -sideBend * 0.06,
      },
      spine: {
        x: forwardLean * 0.12,
        y: twist * 0.08,
        z: -sideBend * 0.22,
      },
      chest: {
        x: forwardLean * 0.16,
        y: twist * 0.12,
        z: -sideBend * 0.34,
      },
      upperChest: {
        x: forwardLean * 0.1,
        y: twist * 0.1,
        z: -sideBend * 0.28,
      },
    },
    shouldApplySpine: true,
    sideBend,
    twist,
  };
}

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

export function getNeutralMovementAvatarPlayerSpineRotations() {
  return {
    chest: neutralRotation(),
    hips: neutralRotation(),
    spine: neutralRotation(),
    upperChest: neutralRotation(),
  };
}
