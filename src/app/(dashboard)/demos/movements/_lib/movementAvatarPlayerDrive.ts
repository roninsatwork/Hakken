import type { MovementCalibration } from "./movementTrackingCalibration";
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
  owner: "neutral" | "player-spine-held" | "player-spine-model" | "player-spine-neutral";
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
  if (!torsoTrackingReady || !calibration || calibration.quality < 0.45) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      owner: "player-spine-held",
    };
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

export function getNeutralMovementAvatarPlayerSpineRotations() {
  return {
    chest: neutralRotation(),
    hips: neutralRotation(),
    spine: neutralRotation(),
    upperChest: neutralRotation(),
  };
}
