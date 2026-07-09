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

export type MovementAvatarFootLockRuntimeFrameApplication = {
  appliedCorrection: number;
  drift: number;
  footLockDecision: MovementAvatarFootLockApplicationDecision;
  nextState: MovementAvatarFootLockState;
  rootCorrection: MovementAvatarFootLockRootCorrectionApplicationResult;
  shouldLock: boolean;
};

export type MovementAvatarFootLockRuntimeDebugTelemetry = {
  correction: number;
  drift: number;
  strength: number;
};

export function buildMovementAvatarFootLockRuntimeDebugTelemetry({
  correction,
  drift,
  state,
}: {
  correction: number;
  drift: number;
  state: MovementAvatarFootLockState;
}): MovementAvatarFootLockRuntimeDebugTelemetry {
  return {
    correction,
    drift,
    strength: state.strength,
  };
}

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
  shouldLockActiveTorso,
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
  shouldLockActiveTorso?: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarFootLockRuntimeDecision {
  const options = resolveMovementAvatarFootLockOptions({ avatarRole });
  const shouldEngage = resolveMovementAvatarFootLockEngagement({
    avatarRole,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    retargetFrame,
    shouldApplyLowerBody,
    shouldLockActiveTorso,
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

export function applyMovementAvatarFootLockRuntimeFrame({
  avatarRole,
  avatarRoot,
  currentLeft,
  currentRight,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  previousState,
  retargetFrame,
  shouldApplyLowerBody,
  shouldLockActiveTorso,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentLeft: THREE.Vector3 | null;
  currentRight: THREE.Vector3 | null;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  previousState: MovementAvatarFootLockState;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldLockActiveTorso?: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarFootLockRuntimeFrameApplication {
  const runtimeDecision = resolveMovementAvatarFootLockRuntimeDecision({
    avatarRole,
    currentLeft,
    currentRight,
    hasAvatarRoot: Boolean(avatarRoot),
    lowerBodyDrive,
    lowerBodyTrackingReady,
    previousState,
    retargetFrame,
    shouldApplyLowerBody,
    shouldLockActiveTorso,
    shouldHoldPlayerSquatPose,
  });
  const footLockDecision = runtimeDecision.footLockDecision;

  return {
    appliedCorrection: footLockDecision.appliedCorrection,
    drift: footLockDecision.drift,
    footLockDecision,
    nextState: footLockDecision.nextState,
    rootCorrection: applyMovementAvatarFootLockRuntimeRootCorrection({
      avatarRoot,
      footLockDecision,
      options: runtimeDecision.options,
    }),
    shouldLock: runtimeDecision.shouldLock,
  };
}
