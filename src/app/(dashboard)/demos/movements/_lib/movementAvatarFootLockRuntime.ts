import * as THREE from "three";
import {
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarFootLockOptions,
  type MovementAvatarFootLockOptionsDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  applyMovementAvatarFootLockRootCorrection,
  resolveMovementAvatarFootLockApplication,
  type MovementAvatarFootLockApplicationDecision,
  type MovementAvatarFootLockRootCorrectionApplicationResult,
  type MovementAvatarFootLockState,
} from "./movementAvatarFootLock";

export type MovementAvatarFootLockRuntimeDecision = {
  footLockDecision: MovementAvatarFootLockApplicationDecision;
  options: MovementAvatarFootLockOptionsDecision;
  shouldLock: boolean;
};

export function resolveMovementAvatarFootLockRuntimeDecision({
  avatarRole,
  currentLeft,
  currentRight,
  hasAvatarRoot,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  previousState,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  currentLeft: THREE.Vector3 | null;
  currentRight: THREE.Vector3 | null;
  hasAvatarRoot: boolean;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  previousState: MovementAvatarFootLockState;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarFootLockRuntimeDecision {
  const options = resolveMovementAvatarFootLockOptions({ avatarRole });
  const shouldEngage = resolveMovementAvatarFootLockEngagement({
    avatarRole,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    retargetFrame,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
  }).shouldEngage;
  const shouldLock = Boolean(hasAvatarRoot && currentLeft && currentRight && shouldEngage);
  const footLockDecision = resolveMovementAvatarFootLockApplication({
    currentLeft: shouldLock ? currentLeft : null,
    currentRight: shouldLock ? currentRight : null,
    options,
    previousState,
    shouldLock,
  });

  return {
    footLockDecision,
    options,
    shouldLock,
  };
}

export function applyMovementAvatarFootLockRuntimeRootCorrection({
  avatarRoot,
  footLockDecision,
  options,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  footLockDecision: MovementAvatarFootLockApplicationDecision;
  options: MovementAvatarFootLockOptionsDecision;
}): MovementAvatarFootLockRootCorrectionApplicationResult {
  if (!avatarRoot) {
    return {
      applied: false,
      correctionScale: 0,
    };
  }

  const application = applyMovementAvatarFootLockRootCorrection({
    apply: (correction, correctionScale) => {
      avatarRoot.position.addScaledVector(correction, correctionScale);
      return true;
    },
    decision: footLockDecision,
    options,
  });
  if (application.applied) {
    avatarRoot.updateMatrixWorld(true);
  }

  return application;
}
