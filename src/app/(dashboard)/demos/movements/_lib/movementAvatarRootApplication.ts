import * as THREE from "three";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

export const MOVEMENT_AVATAR_ROOT_POSITION_LERP = 0.18;
export const MOVEMENT_AVATAR_ROOT_YAW_LERP = 0.22;

export type MovementAvatarRootTransformSnapshot = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
};

export type MovementAvatarRootTransformApplication = MovementAvatarRootTransformSnapshot & {
  appliedYaw: number;
};

export type MovementAvatarRootVector3 = {
  x: number;
  y: number;
  z: number;
};

export type MovementAvatarRootStepFootApplication = {
  side: "left" | "right";
  slerp: number;
  targetWorldPosition: MovementAvatarRootVector3;
};

export type MovementAvatarRootStepFootApplicationResult = {
  applied: boolean;
};

export type MovementAvatarRootStepFootLocalApplication = MovementAvatarRootStepFootApplication & {
  targetLocalPosition: MovementAvatarRootVector3;
};

export type MovementAvatarRootTransformApplicationResult = {
  applied: boolean;
};

function lerp(current: number, target: number, alpha: number) {
  return current + (target - current) * alpha;
}

function lerpAngle(current: number, target: number, alpha: number) {
  const delta = normalizeMovementAvatarRootAngle(target - current);
  return current + delta * alpha;
}

export function normalizeMovementAvatarRootAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function resolveMovementAvatarRootTransformApplication({
  current,
  positionLerp = MOVEMENT_AVATAR_ROOT_POSITION_LERP,
  rootTarget,
  yawLerp = MOVEMENT_AVATAR_ROOT_YAW_LERP,
}: {
  current: MovementAvatarRootTransformSnapshot;
  positionLerp?: number;
  rootTarget: MovementAvatarRootTargetDecision;
  yawLerp?: number;
}): MovementAvatarRootTransformApplication {
  const rotation = {
    x: lerp(current.rotation.x, rootTarget.targetPitch, rootTarget.rootOrientationSlerp),
    y: lerpAngle(current.rotation.y, rootTarget.targetYaw, yawLerp),
    z: lerp(current.rotation.z, rootTarget.targetRoll, rootTarget.rootOrientationSlerp),
  };
  const position = {
    x: lerp(current.position.x, rootTarget.targetX, positionLerp),
    y: lerp(current.position.y, rootTarget.targetY, rootTarget.rootHeightLerp),
    z: lerp(current.position.z, rootTarget.targetZ, positionLerp),
  };

  return {
    appliedYaw: normalizeMovementAvatarRootAngle(rotation.y - Math.PI),
    position,
    rotation,
  };
}

export function resolveMovementAvatarRootStepFootApplication({
  footWorldPosition,
  stepResponse,
}: {
  footWorldPosition: { x: number; y: number; z: number };
  stepResponse: MovementRootMotionStepResponseDecision;
}): MovementAvatarRootStepFootApplication | null {
  if (!stepResponse.shouldApply || !stepResponse.side) return null;

  return {
    side: stepResponse.side,
    slerp: stepResponse.slerp,
    targetWorldPosition: {
      x: footWorldPosition.x,
      y: footWorldPosition.y + stepResponse.footLiftOffset,
      z: footWorldPosition.z,
    },
  };
}

export function applyMovementAvatarRootTransformApplication({
  application,
  apply,
}: {
  application: MovementAvatarRootTransformApplication;
  apply: (application: MovementAvatarRootTransformApplication) => boolean;
}): MovementAvatarRootTransformApplicationResult {
  return {
    applied: apply(application),
  };
}

export function applyMovementAvatarRootTransformToObject({
  application,
  root,
}: {
  application: MovementAvatarRootTransformApplication;
  root: THREE.Object3D | null | undefined;
}): MovementAvatarRootTransformApplicationResult {
  if (!root) {
    return {
      applied: false,
    };
  }

  root.rotation.x = application.rotation.x;
  root.rotation.y = application.rotation.y;
  root.rotation.z = application.rotation.z;
  root.position.x = application.position.x;
  root.position.y = application.position.y;
  root.position.z = application.position.z;

  return {
    applied: true,
  };
}

export function applyMovementAvatarRootStepFootApplication({
  application,
  apply,
}: {
  application: MovementAvatarRootStepFootApplication | null;
  apply: (application: MovementAvatarRootStepFootApplication) => boolean;
}): MovementAvatarRootStepFootApplicationResult {
  if (!application) {
    return {
      applied: false,
    };
  }

  return {
    applied: apply(application),
  };
}

export function applyMovementAvatarRootStepFootLocalApplication({
  application,
  apply,
  toLocalPosition,
}: {
  application: MovementAvatarRootStepFootApplication | null;
  apply: (application: MovementAvatarRootStepFootLocalApplication) => boolean;
  toLocalPosition: (
    targetWorldPosition: MovementAvatarRootStepFootApplication["targetWorldPosition"],
  ) => MovementAvatarRootVector3 | null;
}): MovementAvatarRootStepFootApplicationResult {
  if (!application) {
    return {
      applied: false,
    };
  }

  const targetLocalPosition = toLocalPosition(application.targetWorldPosition);
  if (!targetLocalPosition) {
    return {
      applied: false,
    };
  }

  return {
    applied: apply({
      ...application,
      targetLocalPosition,
    }),
  };
}

export function applyMovementAvatarRootStepResponseToFootObject({
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
  if (!stepResponse.shouldApply || !stepResponse.side) {
    return {
      applied: false,
    };
  }

  const foot = stepResponse.side === "left" ? leftFoot : rightFoot;
  if (!foot?.parent) {
    return {
      applied: false,
    };
  }

  scene?.updateMatrixWorld(true);
  foot.updateMatrixWorld(true);
  foot.parent.updateMatrixWorld(true);

  const footWorldPosition = new THREE.Vector3();
  foot.getWorldPosition(footWorldPosition);

  return applyMovementAvatarRootStepFootLocalApplication({
    application: resolveMovementAvatarRootStepFootApplication({
      footWorldPosition,
      stepResponse,
    }),
    apply: (application) => {
      foot.position.lerp(
        new THREE.Vector3(
          application.targetLocalPosition.x,
          application.targetLocalPosition.y,
          application.targetLocalPosition.z,
        ),
        application.slerp,
      );
      return true;
    },
    toLocalPosition: (targetWorldPosition) => {
      if (!foot.parent) return null;

      return foot.parent.worldToLocal(
        new THREE.Vector3(
          targetWorldPosition.x,
          targetWorldPosition.y,
          targetWorldPosition.z,
        ),
      );
    },
  });
}
