import * as THREE from "three";
import {
  applyMovementAvatarFootLockRootCorrection,
  type MovementAvatarFootLockApplicationDecision,
  type MovementAvatarFootLockRootCorrectionApplicationResult,
  type MovementAvatarFootLockState,
  resolveMovementAvatarFootLockApplication,
} from "./movementAvatarFootLock";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  type MovementAvatarFootLockOptionsDecision,
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarFootLockOptions,
} from "./movementAvatarPipeline";
import { applyMovementAvatarRootStepResponseToFootObject, type MovementAvatarRootStepFootApplicationResult } from "./movementAvatarRootApplication";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarFootLockRuntime ---

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
  shouldYieldToSupportContact = false,
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
  shouldYieldToSupportContact?: boolean;
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
  const shouldLock = Boolean(
    !shouldYieldToSupportContact && hasAvatarRoot && currentLeft && currentRight && shouldEngage,
  );
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
      verticalCorrectionScale: 0,
    };
  }

  const application = applyMovementAvatarFootLockRootCorrection({
    apply: (correction, correctionScale, verticalCorrectionScale) => {
      avatarRoot.position.x += correction.x * correctionScale;
      avatarRoot.position.y += correction.y * verticalCorrectionScale;
      avatarRoot.position.z += correction.z * correctionScale;
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
  shouldYieldToSupportContact,
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
  shouldYieldToSupportContact?: boolean;
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
    shouldYieldToSupportContact,
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

// --- movementAvatarFootWorldRuntime ---

export type MovementAvatarFootWorldRuntimeSnapshot = {
  left: THREE.Vector3 | null;
  lowestFootY: number | null;
  right: THREE.Vector3 | null;
};

export function resolveMovementAvatarFootWorldRuntimeSnapshot({
  avatarRoot,
  leftFoot,
  rightFoot,
  scene,
  shouldRead = true,
}: {
  avatarRoot?: THREE.Object3D | null;
  leftFoot: THREE.Object3D | null | undefined;
  rightFoot: THREE.Object3D | null | undefined;
  scene?: THREE.Object3D | null;
  shouldRead?: boolean;
}): MovementAvatarFootWorldRuntimeSnapshot {
  if (!shouldRead || !leftFoot || !rightFoot) {
    return {
      left: null,
      lowestFootY: null,
      right: null,
    };
  }

  scene?.updateMatrixWorld(true);
  avatarRoot?.updateMatrixWorld(true);
  leftFoot.updateMatrixWorld(true);
  rightFoot.updateMatrixWorld(true);

  const left = leftFoot.getWorldPosition(leftFoot.position.clone());
  const right = rightFoot.getWorldPosition(rightFoot.position.clone());

  return {
    left,
    lowestFootY: Math.min(left.y, right.y),
    right,
  };
}

// --- movementAvatarHipsRuntime ---

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

// --- movementAvatarRootStepRuntime ---

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

// --- movementAvatarFootingFrameRuntime ---

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
  shouldYieldToSupportContact,
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
  shouldYieldToSupportContact?: boolean;
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
  const postHipsFootWorldSnapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
    avatarRoot,
    leftFoot,
    rightFoot,
    scene,
  });
  const footLockRuntimeApplication = applyMovementAvatarFootLockRuntimeFrame({
    avatarRole,
    avatarRoot,
    currentLeft: postHipsFootWorldSnapshot.left,
    currentRight: postHipsFootWorldSnapshot.right,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    previousState: previousFootLockState,
    retargetFrame,
    shouldApplyLowerBody,
    shouldLockActiveTorso,
    shouldHoldPlayerSquatPose,
    shouldYieldToSupportContact,
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

// --- movementAvatarFootingFrameRefsRuntime ---

export type MovementAvatarFootingFrameRefsRuntimeResult = {
  footLockCorrection: number;
  footLockDrift: number;
  footLockState: MovementAvatarFootLockState;
};

export function applyMovementAvatarFootingFrameRefsRuntime({
  baseHipsPositionRef,
  footingRuntime,
  plantedFootLockRef,
}: {
  baseHipsPositionRef: MovementAvatarMutableRef<THREE.Vector3 | null>;
  footingRuntime: MovementAvatarFootingFrameRuntimeResult;
  plantedFootLockRef: MovementAvatarMutableRef<MovementAvatarFootLockState>;
}): MovementAvatarFootingFrameRefsRuntimeResult {
  baseHipsPositionRef.current = footingRuntime.nextBaseHipsPosition;
  plantedFootLockRef.current = footingRuntime.nextFootLockState;

  return {
    footLockCorrection: footingRuntime.footLockRuntimeApplication.appliedCorrection,
    footLockDrift: footingRuntime.footLockRuntimeApplication.drift,
    footLockState: footingRuntime.nextFootLockState,
  };
}

// --- movementAvatarFootingFrameOrchestrationRuntime ---

type MovementAvatarFootingFrameRuntimeInput = Parameters<typeof applyMovementAvatarFootingFrameRuntime>[0];

export type MovementAvatarFootingFrameOrchestrationRuntimeResult = {
  footLockCorrection: number;
  footLockDrift: number;
  footLockState: MovementAvatarFootLockState;
  footingRuntime: MovementAvatarFootingFrameRuntimeResult;
};

export function finalizeMovementAvatarFootingFrameWorldSnapshot({
  avatarRoot,
  footingFrameOrchestrationRuntime,
  lookupBone,
  scene,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  footingFrameOrchestrationRuntime: MovementAvatarFootingFrameOrchestrationRuntimeResult;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
}): MovementAvatarFootingFrameOrchestrationRuntimeResult {
  return {
    ...footingFrameOrchestrationRuntime,
    footingRuntime: {
      ...footingFrameOrchestrationRuntime.footingRuntime,
      footWorldSnapshot: resolveMovementAvatarFootWorldRuntimeSnapshot({
        avatarRoot,
        leftFoot: lookupBone("leftFoot"),
        rightFoot: lookupBone("rightFoot"),
        scene,
      }),
    },
  };
}

export function applyMovementAvatarFootingFrameOrchestrationRuntime({
  baseHipsPositionRef,
  lookupBone,
  plantedFootLockRef,
  ...input
}: Omit<
  MovementAvatarFootingFrameRuntimeInput,
  "baseHipsPosition" | "leftFoot" | "previousFootLockState" | "rightFoot"
> & {
  baseHipsPositionRef: MovementAvatarMutableRef<THREE.Vector3 | null>;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plantedFootLockRef: MovementAvatarMutableRef<MovementAvatarFootLockState>;
}): MovementAvatarFootingFrameOrchestrationRuntimeResult {
  const footingRuntime = applyMovementAvatarFootingFrameRuntime({
    ...input,
    baseHipsPosition: baseHipsPositionRef.current,
    leftFoot: lookupBone("leftFoot"),
    previousFootLockState: plantedFootLockRef.current,
    rightFoot: lookupBone("rightFoot"),
  });
  const refsRuntime = applyMovementAvatarFootingFrameRefsRuntime({
    baseHipsPositionRef,
    footingRuntime,
    plantedFootLockRef,
  });

  return {
    footLockCorrection: refsRuntime.footLockCorrection,
    footLockDrift: refsRuntime.footLockDrift,
    footLockState: refsRuntime.footLockState,
    footingRuntime,
  };
}
