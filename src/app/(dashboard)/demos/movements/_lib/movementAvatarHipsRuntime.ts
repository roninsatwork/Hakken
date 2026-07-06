import type {
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";
import type * as THREE from "three";

export type MovementAvatarHipsRuntimePositionDecision = {
  floorContactCorrection: number;
  nextHipsY: number;
  squatTargetY: number;
};

export type MovementAvatarHipsRuntimeBoneLike = {
  position: THREE.Vector3;
};

export type MovementAvatarHipsRuntimeApplicationResult = {
  applied: boolean;
  nextBaseHipsPosition: THREE.Vector3 | null;
  positionDecision: MovementAvatarHipsRuntimePositionDecision | null;
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

export function applyMovementAvatarHipsRuntimeToBone({
  baseHipsPosition,
  floorY,
  hipsApplication,
  hipsNode,
  hipsPositionOptions,
  lowestFootY,
}: {
  baseHipsPosition: THREE.Vector3 | null;
  floorY: number;
  hipsApplication: MovementAvatarHipsApplicationDecision;
  hipsNode: MovementAvatarHipsRuntimeBoneLike | null;
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
  lowestFootY: number | null;
}): MovementAvatarHipsRuntimeApplicationResult {
  if (!hipsNode) {
    return {
      applied: false,
      nextBaseHipsPosition: baseHipsPosition,
      positionDecision: null,
    };
  }

  const nextBaseHipsPosition = baseHipsPosition ?? hipsNode.position.clone();
  const positionDecision = resolveMovementAvatarHipsRuntimePosition({
    baseHipsY: nextBaseHipsPosition.y,
    currentHipsY: hipsNode.position.y,
    floorY,
    hipsApplication,
    hipsPositionOptions,
    lowestFootY,
  });
  hipsNode.position.y = positionDecision.nextHipsY;

  return {
    applied: true,
    nextBaseHipsPosition,
    positionDecision,
  };
}
