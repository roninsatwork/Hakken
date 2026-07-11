import * as THREE from "three";
import type { MovementAvatarFootLockOptionsDecision } from "./movementAvatarPipeline";

export type MovementAvatarFootLockState = {
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  correction: THREE.Vector3;
  strength: number;
};

export type MovementAvatarFootLockApplicationDecision = {
  appliedCorrection: number;
  drift: number;
  lateralDrift: number;
  nextState: MovementAvatarFootLockState;
  shouldApplyCorrection: boolean;
};

export type MovementAvatarFootLockRootCorrectionApplicationResult = {
  applied: boolean;
  correctionScale: number;
  verticalCorrectionScale: number;
};

export function createMovementAvatarFootLockState(): MovementAvatarFootLockState {
  return {
    correction: new THREE.Vector3(),
    left: null,
    right: null,
    strength: 0,
  };
}

function cloneFootLockState(state: MovementAvatarFootLockState): MovementAvatarFootLockState {
  return {
    correction: state.correction.clone(),
    left: state.left?.clone() ?? null,
    right: state.right?.clone() ?? null,
    strength: state.strength,
  };
}

export function resolveMovementAvatarFootLockApplication({
  currentLeft,
  currentRight,
  options,
  previousState,
  shouldLock,
}: {
  currentLeft: THREE.Vector3 | null;
  currentRight: THREE.Vector3 | null;
  options: MovementAvatarFootLockOptionsDecision;
  previousState: MovementAvatarFootLockState;
  shouldLock: boolean;
}): MovementAvatarFootLockApplicationDecision {
  const nextState = cloneFootLockState(previousState);

  if (!shouldLock || !currentLeft || !currentRight) {
    nextState.strength = THREE.MathUtils.lerp(nextState.strength, 0, options.releaseSlerp);
    nextState.correction.set(0, 0, 0);
    if (nextState.strength < options.minStrengthBeforeClear) {
      nextState.left = null;
      nextState.right = null;
    }

    return {
      appliedCorrection: 0,
      drift: 0,
      lateralDrift: 0,
      nextState,
      shouldApplyCorrection: false,
    };
  }

  if (!nextState.left || !nextState.right || nextState.strength < 0.12) {
    nextState.left = currentLeft.clone();
    nextState.right = currentRight.clone();
    nextState.strength = options.initialStrength;
    nextState.correction.set(0, 0, 0);

    return {
      appliedCorrection: 0,
      drift: 0,
      lateralDrift: 0,
      nextState,
      shouldApplyCorrection: false,
    };
  }

  nextState.strength = THREE.MathUtils.lerp(nextState.strength, 1, options.engageSlerp);

  const targetMidpoint = nextState.left.clone().add(nextState.right).multiplyScalar(0.5);
  const currentMidpoint = currentLeft.clone().add(currentRight).multiplyScalar(0.5);
  const lateralCorrection = targetMidpoint.sub(currentMidpoint);
  const targetFloorY = Math.min(nextState.left.y, nextState.right.y);
  const currentFloorY = Math.min(currentLeft.y, currentRight.y);
  const verticalCorrection = targetFloorY - currentFloorY;
  const drift = Math.max(
    currentLeft.distanceTo(nextState.left),
    currentRight.distanceTo(nextState.right),
  );
  const lateralDrift = Math.max(
    Math.hypot(currentLeft.x - nextState.left.x, currentLeft.z - nextState.left.z),
    Math.hypot(currentRight.x - nextState.right.x, currentRight.z - nextState.right.z),
  );

  if (lateralDrift > options.maxLateralDriftBeforeReset) {
    nextState.left = currentLeft.clone();
    nextState.right = currentRight.clone();
    nextState.strength = options.initialStrength;
    nextState.correction.set(0, 0, 0);

    return {
      appliedCorrection: 0,
      drift,
      lateralDrift,
      nextState,
      shouldApplyCorrection: false,
    };
  }

  nextState.correction.set(
    THREE.MathUtils.clamp(lateralCorrection.x, -0.075, 0.075),
    THREE.MathUtils.clamp(
      verticalCorrection,
      -options.maxVerticalCorrection,
      options.maxVerticalCorrection,
    ),
    THREE.MathUtils.clamp(lateralCorrection.z, -0.075, 0.075),
  );

  const correctionScale = nextState.strength * options.correctionScale;
  const verticalCorrectionScale = nextState.strength * options.verticalCorrectionScale;
  const appliedCorrection = new THREE.Vector3(
    nextState.correction.x * correctionScale,
    nextState.correction.y * verticalCorrectionScale,
    nextState.correction.z * correctionScale,
  ).length();

  return {
    appliedCorrection,
    drift,
    lateralDrift,
    nextState,
    shouldApplyCorrection: true,
  };
}

export function applyMovementAvatarFootLockRootCorrection({
  apply,
  decision,
  options,
}: {
  apply: (
    correction: THREE.Vector3,
    correctionScale: number,
    verticalCorrectionScale: number,
  ) => boolean;
  decision: MovementAvatarFootLockApplicationDecision;
  options: MovementAvatarFootLockOptionsDecision;
}): MovementAvatarFootLockRootCorrectionApplicationResult {
  if (!decision.shouldApplyCorrection) {
    return {
      applied: false,
      correctionScale: 0,
      verticalCorrectionScale: 0,
    };
  }

  const correctionScale = decision.nextState.strength * options.correctionScale;
  const verticalCorrectionScale = decision.nextState.strength * options.verticalCorrectionScale;

  return {
    applied: apply(
      decision.nextState.correction,
      correctionScale,
      verticalCorrectionScale,
    ),
    correctionScale,
    verticalCorrectionScale,
  };
}
