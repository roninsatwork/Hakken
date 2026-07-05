import type * as THREE from "three";
import {
  applyMovementAvatarRootStepResponseToFootObject,
  type MovementAvatarRootStepFootApplicationResult,
} from "./movementAvatarRootApplication";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

export function applyMovementAvatarRootStepRuntimeResponse({
  leftFoot,
  rightFoot,
  scene,
  stepResponse,
}: {
  leftFoot: THREE.Object3D | null | undefined;
  rightFoot: THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
  stepResponse: MovementRootMotionStepResponseDecision;
}): MovementAvatarRootStepFootApplicationResult {
  return applyMovementAvatarRootStepResponseToFootObject({
    leftFoot,
    rightFoot,
    scene,
    stepResponse,
  });
}
