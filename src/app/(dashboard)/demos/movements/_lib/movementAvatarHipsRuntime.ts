import type {
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";

export type MovementAvatarHipsRuntimePositionDecision = {
  floorContactCorrection: number;
  nextHipsY: number;
  squatTargetY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(current: number, target: number, alpha: number) {
  return current + (target - current) * alpha;
}

export function resolveMovementAvatarHipsRuntimePosition({
  baseHipsY,
  currentHipsY,
  floorY,
  hipsApplication,
  hipsPositionOptions,
  lowestFootY,
}: {
  baseHipsY: number;
  currentHipsY: number;
  floorY: number;
  hipsApplication: MovementAvatarHipsApplicationDecision;
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
  lowestFootY: number | null;
}): MovementAvatarHipsRuntimePositionDecision {
  const squatTargetY = hipsApplication.shouldApplySquatDrop
    ? baseHipsY - hipsApplication.squatDrop
    : baseHipsY;
  let nextHipsY = lerp(currentHipsY, squatTargetY, hipsPositionOptions.rootLerp);
  const floorContactCorrection = hipsApplication.shouldApplyFloorContactCorrection && lowestFootY !== null
    ? clamp((floorY - lowestFootY) / 5.25, -0.18, 0.18) * hipsPositionOptions.floorContactCorrectionScale
    : 0;

  nextHipsY += floorContactCorrection;

  return {
    floorContactCorrection,
    nextHipsY,
    squatTargetY,
  };
}
