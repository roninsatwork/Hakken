import type { MovementLandmark } from "./movementTypes";

export type AvatarRotation = {
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

export const NEUTRAL_ROTATION: AvatarRotation = { x: 0, y: 0, z: 0 };

export const NEUTRAL_PLAYER_SPINE_DRIVE: MovementAvatarPlayerSpineDrive = {
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

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function neutralRotation(): AvatarRotation {
  return { x: 0, y: 0, z: 0 };
}

export function capRecordedPresentationSideBend(
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

export function visibility(landmark?: MovementLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function midpoint(a: MovementLandmark, b: MovementLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
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
