import type * as THREE from "three";
import {
  applyMovementAvatarRootTransformToObject,
  resolveMovementAvatarRootTransformApplication,
  type MovementAvatarRootTransformApplication,
  type MovementAvatarRootTransformApplicationResult,
} from "./movementAvatarRootApplication";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";

export type MovementAvatarRootTransformRuntimeResult = {
  application: MovementAvatarRootTransformApplication | null;
  result: MovementAvatarRootTransformApplicationResult;
};

export function applyMovementAvatarRootTransformRuntime({
  root,
  rootTarget,
}: {
  root: THREE.Object3D | null | undefined;
  rootTarget: MovementAvatarRootTargetDecision;
}): MovementAvatarRootTransformRuntimeResult {
  if (!root) {
    return {
      application: null,
      result: { applied: false },
    };
  }

  const application = resolveMovementAvatarRootTransformApplication({
    current: {
      position: {
        x: root.position.x,
        y: root.position.y,
        z: root.position.z,
      },
      rotation: {
        x: root.rotation.x,
        y: root.rotation.y,
        z: root.rotation.z,
      },
    },
    rootTarget,
  });

  return {
    application,
    result: applyMovementAvatarRootTransformToObject({
      application,
      root,
    }),
  };
}
