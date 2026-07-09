import type * as THREE from "three";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarFootLockState } from "./movementAvatarFootLock";
import {
  applyMovementAvatarFootLockRuntimeFrame,
  buildMovementAvatarFootLockRuntimeDebugTelemetry,
  type MovementAvatarFootLockRuntimeFrameApplication,
  type MovementAvatarFootLockRuntimeDebugTelemetry,
} from "./movementAvatarFootLockRuntime";
import {
  resolveMovementAvatarFootWorldRuntimeSnapshot,
  type MovementAvatarFootWorldRuntimeSnapshot,
} from "./movementAvatarFootWorldRuntime";
import {
  applyMovementAvatarHipsRuntimeToBone,
  type MovementAvatarHipsRuntimeApplicationResult,
  type MovementAvatarHipsRuntimeBoneLike,
} from "./movementAvatarHipsRuntime";
import type {
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";
import { applyMovementAvatarRootStepRuntimeResponse } from "./movementAvatarRootStepRuntime";
import type {
  MovementAvatarRootStepFootApplicationResult,
} from "./movementAvatarRootApplication";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";
import type { MovementRetargetFrame } from "./movementRetargeting";

export type MovementAvatarFootingFrameRuntimeResult = {
  footLockDebug: MovementAvatarFootLockRuntimeDebugTelemetry;
  footLockRuntimeApplication: MovementAvatarFootLockRuntimeFrameApplication;
  footWorldSnapshot: MovementAvatarFootWorldRuntimeSnapshot;
  hipsRuntimeApplication: MovementAvatarHipsRuntimeApplicationResult;
  nextBaseHipsPosition: THREE.Vector3 | null;
  nextFootLockState: MovementAvatarFootLockState;
  rootStepApplication: MovementAvatarRootStepFootApplicationResult;
};

export function applyMovementAvatarFootingFrameRuntime({
  avatarRole,
  avatarRoot,
  baseHipsPosition,
  floorY,
  hipsApplication,
  hipsNode,
  hipsPositionOptions,
  leftFoot,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  previousFootLockState,
  retargetFrame,
  rightFoot,
  scene,
  shouldApplyLowerBody,
  shouldLockActiveTorso,
  shouldHoldPlayerSquatPose,
  stepResponse,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  baseHipsPosition: THREE.Vector3 | null;
  floorY: number;
  hipsApplication: MovementAvatarHipsApplicationDecision;
  hipsNode: MovementAvatarHipsRuntimeBoneLike | null;
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
  leftFoot: THREE.Object3D | null | undefined;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  previousFootLockState: MovementAvatarFootLockState;
  retargetFrame: MovementRetargetFrame;
  rightFoot: THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
  shouldApplyLowerBody: boolean;
  shouldLockActiveTorso?: boolean;
  shouldHoldPlayerSquatPose: boolean;
  stepResponse: MovementRootMotionStepResponseDecision;
}): MovementAvatarFootingFrameRuntimeResult {
  const initialFootWorldSnapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
    avatarRoot,
    leftFoot,
    rightFoot,
    scene,
  });
  const hipsRuntimeApplication = applyMovementAvatarHipsRuntimeToBone({
    baseHipsPosition,
    floorY,
    hipsApplication,
    hipsNode,
    hipsPositionOptions,
    lowestFootY: initialFootWorldSnapshot.lowestFootY,
  });
  const footLockRuntimeApplication = applyMovementAvatarFootLockRuntimeFrame({
    avatarRole,
    avatarRoot,
    currentLeft: initialFootWorldSnapshot.left,
    currentRight: initialFootWorldSnapshot.right,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    previousState: previousFootLockState,
    retargetFrame,
    shouldApplyLowerBody,
    shouldLockActiveTorso,
    shouldHoldPlayerSquatPose,
  });
  const rootStepApplication = applyMovementAvatarRootStepRuntimeResponse({
    leftFoot,
    rightFoot,
    scene,
    stepResponse,
  });
  const footWorldSnapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
    avatarRoot,
    leftFoot,
    rightFoot,
    scene,
  });

  return {
    footLockDebug: buildMovementAvatarFootLockRuntimeDebugTelemetry({
      correction: footLockRuntimeApplication.appliedCorrection,
      drift: footLockRuntimeApplication.drift,
      state: footLockRuntimeApplication.nextState,
    }),
    footLockRuntimeApplication,
    footWorldSnapshot,
    hipsRuntimeApplication,
    nextBaseHipsPosition: hipsRuntimeApplication.nextBaseHipsPosition,
    nextFootLockState: footLockRuntimeApplication.nextState,
    rootStepApplication,
  };
}
