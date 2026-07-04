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
  nextState: MovementAvatarFootLockState;
  shouldApplyCorrection: boolean;
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

  if (drift > options.maxDriftBeforeReset) {
    nextState.left = currentLeft.clone();
    nextState.right = currentRight.clone();
    nextState.strength = options.initialStrength;
    nextState.correction.set(0, 0, 0);

    return {
      appliedCorrection: 0,
      drift,
      nextState,
      shouldApplyCorrection: false,
    };
  }

  nextState.correction.set(
    THREE.MathUtils.clamp(lateralCorrection.x, -0.075, 0.075),
    THREE.MathUtils.clamp(verticalCorrection, -0.05, 0.05),
    THREE.MathUtils.clamp(lateralCorrection.z, -0.075, 0.075),
  );

  const correctionScale = nextState.strength * options.correctionScale;

  return {
    appliedCorrection: nextState.correction.length() * correctionScale,
    drift,
    nextState,
    shouldApplyCorrection: true,
  };
}
