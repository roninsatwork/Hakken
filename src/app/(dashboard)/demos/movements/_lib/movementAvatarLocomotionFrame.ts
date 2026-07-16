import type * as THREE from "three";
import { buildMovementAvatarRootDebug } from "./movementAvatarDebugTelemetry";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
  type MovementAvatarRootOrientationDecision,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
} from "./movementAvatarPipeline";
import {
  applyMovementAvatarRootTransformToObject,
  type MovementAvatarRootTransformApplication,
  type MovementAvatarRootTransformApplicationResult,
  resolveMovementAvatarRootTransformApplication,
} from "./movementAvatarRootApplication";
import { type MovementAvatarRootTargetDecision, resolveMovementAvatarRootTarget } from "./movementAvatarRootTarget";
import {
  appendMovementRootMotionHistoryFrame,
  type MovementRootMotionFrame,
  type MovementRootMotionInputFrame,
  type MovementRootMotionStepResponseDecision,
} from "./movementRootMotion";
import {
  getCalibratedFloorCorrection,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarFloorRuntime ---

export type MovementAvatarFloorRuntimeDecision = {
  calibratedFloorCorrection: number;
  currentFloorY: number;
  floorConfidence: number;
};

export function resolveMovementAvatarFloorRuntime({
  calibration,
  poseLandmarks,
  profile,
  rigMeasurements,
  shouldUseCalibratedFloorCorrection,
}: {
  calibration: MovementCalibration | null;
  poseLandmarks: VrmSolverLandmark[];
  profile: MovementAvatarTrackingProfile;
  rigMeasurements: { hipHeight: number } | null;
  shouldUseCalibratedFloorCorrection: boolean;
}): MovementAvatarFloorRuntimeDecision {
  const currentFloorY = Math.max(
    poseLandmarks[27]?.y ?? 0,
    poseLandmarks[28]?.y ?? 0,
    poseLandmarks[31]?.y ?? 0,
    poseLandmarks[32]?.y ?? 0,
  );
  const floorConfidence = Math.max(
    poseLandmarks[27]?.visibility ?? 0,
    poseLandmarks[28]?.visibility ?? 0,
    poseLandmarks[31]?.visibility ?? 0,
    poseLandmarks[32]?.visibility ?? 0,
  );

  return {
    calibratedFloorCorrection: shouldUseCalibratedFloorCorrection
      ? getCalibratedFloorCorrection({
          calibration,
          currentFloorY,
          floorConfidence,
          profile,
          rigMeasurements,
        })
      : 0,
    currentFloorY,
    floorConfidence,
  };
}

// --- movementAvatarRootMotionRuntime ---

export function resolveMovementAvatarRootMotionRuntimeFrame({
  history,
  livePose,
  liveWorldPose,
  recordedRootMotionFrame,
}: {
  history: MovementRootMotionInputFrame[];
  livePose: MovementRootMotionInputFrame["pose"];
  liveWorldPose?: MovementRootMotionInputFrame["worldPose"];
  recordedRootMotionFrame: MovementRootMotionFrame | null;
}): MovementRootMotionFrame | null {
  if (recordedRootMotionFrame) return recordedRootMotionFrame;

  return appendMovementRootMotionHistoryFrame({
    history,
    pose: livePose,
    worldPose: liveWorldPose,
  });
}

// --- movementAvatarRootTransformRuntime ---

export type MovementAvatarRootTransformRuntimeResult = {
  application: MovementAvatarRootTransformApplication | null;
  result: MovementAvatarRootTransformApplicationResult;
};

export function applyMovementAvatarRootTransformRuntime({
  root,
  rootCommandYRef,
  rootTarget,
}: {
  root: THREE.Object3D | null | undefined;
  rootCommandYRef?: MovementAvatarMutableRef<number | null>;
  rootTarget: MovementAvatarRootTargetDecision;
}): MovementAvatarRootTransformRuntimeResult {
  if (!root) {
    return {
      application: null,
      result: { applied: false },
    };
  }

  const previousCommandY = rootCommandYRef?.current;
  const supportContactOffsetY = previousCommandY === null || previousCommandY === undefined
    ? 0
    : root.position.y - previousCommandY;
  const commandApplication = resolveMovementAvatarRootTransformApplication({
    current: {
      position: {
        x: root.position.x,
        y: previousCommandY ?? root.position.y,
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
  if (rootCommandYRef) rootCommandYRef.current = commandApplication.position.y;
  const application = {
    ...commandApplication,
    position: {
      ...commandApplication.position,
      // Preserve the previous support-contact solution in rendered space
      // while advancing only the controller's underlying height command.
      y: commandApplication.position.y + supportContactOffsetY,
    },
  };

  return {
    application,
    result: applyMovementAvatarRootTransformToObject({
      application,
      root,
    }),
  };
}

// --- movementAvatarRootFrameRuntime ---

export type MovementAvatarRootFrameRuntimeResult = {
  rootApplication: MovementAvatarRootTransformApplication | null;
  rootDebug: NonNullable<MovementTrackingDebugState["avatarRoot"]> | null;
  rootMotion: MovementRootMotionFrame | null;
  rootTarget: MovementAvatarRootTargetDecision;
  stepResponse: MovementRootMotionStepResponseDecision;
  transformRuntime: MovementAvatarRootTransformRuntimeResult;
};

export function applyMovementAvatarRootFrameRuntime({
  avatarBaseY,
  avatarRoot,
  avatarRootVisualLerp,
  history,
  livePose,
  liveWorldPose,
  positionOffset,
  recordedRootMotionFrame,
  rootCommandYRef,
  rootOrientation,
  visualRootDrop,
}: {
  avatarBaseY: number;
  avatarRoot: THREE.Object3D | null | undefined;
  avatarRootVisualLerp: number;
  history: MovementRootMotionInputFrame[];
  livePose: MovementRootMotionInputFrame["pose"];
  liveWorldPose?: MovementRootMotionInputFrame["worldPose"];
  positionOffset: readonly [number, number, number];
  recordedRootMotionFrame: MovementRootMotionFrame | null;
  rootCommandYRef?: MovementAvatarMutableRef<number | null>;
  rootOrientation: MovementAvatarRootOrientationDecision;
  visualRootDrop: number;
}): MovementAvatarRootFrameRuntimeResult {
  const rootMotion = resolveMovementAvatarRootMotionRuntimeFrame({
    history,
    livePose,
    liveWorldPose,
    recordedRootMotionFrame,
  });
  const rootTarget = resolveMovementAvatarRootTarget({
    avatarBaseY,
    avatarRootVisualLerp,
    positionOffset,
    rootMotion,
    rootOrientation,
    visualRootDrop,
  });
  const transformRuntime = applyMovementAvatarRootTransformRuntime({
    root: avatarRoot,
    rootCommandYRef,
    rootTarget,
  });
  const rootApplication = transformRuntime.application;

  return {
    rootApplication,
    rootDebug: rootApplication
      ? buildMovementAvatarRootDebug({
          orientationOwner: rootOrientation.owner,
          rootApplication,
          rootTarget,
        })
      : null,
    rootMotion,
    rootTarget,
    stepResponse: rootTarget.stepResponse,
    transformRuntime,
  };
}

// --- movementAvatarRootFrameRefsRuntime ---

export type MovementAvatarRootFrameRefsRuntimeResult = {
  appliedRootDebug: boolean;
};

export function applyMovementAvatarRootFrameRefsRuntime({
  rootFrameRuntime,
  trackingDebugRef,
}: {
  rootFrameRuntime: MovementAvatarRootFrameRuntimeResult;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarRootFrameRefsRuntimeResult {
  if (!trackingDebugRef?.current || !rootFrameRuntime.rootDebug) {
    return {
      appliedRootDebug: false,
    };
  }

  trackingDebugRef.current.avatarRoot = rootFrameRuntime.rootDebug;

  return {
    appliedRootDebug: true,
  };
}

// --- movementAvatarRootFrameOrchestrationRuntime ---

type MovementAvatarRootFrameRuntimeInput = Parameters<typeof applyMovementAvatarRootFrameRuntime>[0];

export type MovementAvatarRootFrameOrchestrationRuntimeResult = {
  rootFrameRuntime: MovementAvatarRootFrameRuntimeResult;
  stepResponse: MovementRootMotionStepResponseDecision;
};

export function applyMovementAvatarRootFrameOrchestrationRuntime({
  trackingDebugRef,
  ...input
}: MovementAvatarRootFrameRuntimeInput & {
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
}): MovementAvatarRootFrameOrchestrationRuntimeResult {
  const rootFrameRuntime = applyMovementAvatarRootFrameRuntime(input);
  applyMovementAvatarRootFrameRefsRuntime({
    rootFrameRuntime,
    trackingDebugRef,
  });

  return {
    rootFrameRuntime,
    stepResponse: rootFrameRuntime.stepResponse,
  };
}

// --- movementAvatarHipsFrameRuntime ---

export type MovementAvatarHipsFrameRuntimeDecision = {
  floorRuntime: MovementAvatarFloorRuntimeDecision;
  hipsApplication: MovementAvatarHipsApplicationDecision;
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
};

export function resolveMovementAvatarHipsFrameRuntime({
  avatarRole,
  calibration,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  playerSquatPresentationDepth,
  poseLandmarks,
  profile,
  rigMeasurements,
  shouldApplyLowerBody,
}: {
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  playerSquatPresentationDepth: number;
  poseLandmarks: VrmSolverLandmark[];
  profile: MovementAvatarTrackingProfile;
  rigMeasurements: { hipHeight: number; legLength: number } | null;
  shouldApplyLowerBody: boolean;
}): MovementAvatarHipsFrameRuntimeDecision {
  const hipsPositionOptions = resolveMovementAvatarHipsPositionOptions({
    avatarRole,
    lowerBodyDrive,
    profile,
    rigMeasurements,
  });
  const floorRuntime = resolveMovementAvatarFloorRuntime({
    calibration,
    poseLandmarks,
    profile,
    rigMeasurements,
    shouldUseCalibratedFloorCorrection: hipsPositionOptions.shouldUseCalibratedFloorCorrection,
  });
  const hipsApplication = resolveMovementAvatarHipsApplication({
    hipsPositionOptions,
    lowerBodyTrackingReady,
    playerSquatPresentationDepth,
    shouldApplyLowerBody,
  });

  return {
    floorRuntime,
    hipsApplication,
    hipsPositionOptions,
  };
}

// --- movementAvatarLocomotionFrameOrchestrationRuntime ---

export type MovementAvatarLocomotionFrameOrchestrationRuntime =
  | {
    calibratedFloorCorrection: number;
    hipsFrameRuntime: MovementAvatarHipsFrameRuntimeDecision;
    status: "fallback-demo-pose";
  }
  | {
    calibratedFloorCorrection: number;
    hipsFrameRuntime: MovementAvatarHipsFrameRuntimeDecision;
    rootFrameOrchestrationRuntime: MovementAvatarRootFrameOrchestrationRuntimeResult;
    status: "ready";
    stepResponse: MovementRootMotionStepResponseDecision;
  };

export function applyMovementAvatarLocomotionFrameOrchestrationRuntime({
  avatarBaseY,
  avatarRole,
  avatarRoot,
  calibration,
  displayWorldPose,
  forceStandby,
  history,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  mirrorPlayerDisplay,
  playerSquatPresentationDepth,
  poseLandmarks,
  positionOffset,
  profile,
  recordedRootMotionFrame,
  rigMeasurements,
  rootCommandYRef,
  rootOrientation,
  shouldApplyLowerBody,
  trackingDebugRef,
  visualRootDrop,
  worldPose,
}: {
  avatarBaseY: number;
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D;
  calibration: MovementCalibration | null;
  displayWorldPose: MovementRootMotionInputFrame["worldPose"];
  forceStandby: boolean;
  history: MovementRootMotionInputFrame[];
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  mirrorPlayerDisplay: boolean;
  playerSquatPresentationDepth: number;
  poseLandmarks: VrmSolverLandmark[];
  positionOffset: readonly [number, number, number];
  profile: MovementAvatarTrackingProfile;
  recordedRootMotionFrame: MovementRootMotionFrame | null;
  rigMeasurements: { hipHeight: number; legLength: number } | null;
  rootCommandYRef?: MovementAvatarMutableRef<number | null>;
  rootOrientation: MovementAvatarRootOrientationDecision;
  shouldApplyLowerBody: boolean;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  visualRootDrop: number;
  worldPose?: MovementRootMotionInputFrame["worldPose"];
}): MovementAvatarLocomotionFrameOrchestrationRuntime {
  const hipsFrameRuntime = resolveMovementAvatarHipsFrameRuntime({
    avatarRole,
    calibration,
    lowerBodyDrive,
    lowerBodyTrackingReady,
    playerSquatPresentationDepth,
    poseLandmarks,
    profile,
    rigMeasurements,
    shouldApplyLowerBody,
  });
  const calibratedFloorCorrection = hipsFrameRuntime.floorRuntime.calibratedFloorCorrection;

  if (forceStandby) {
    return {
      calibratedFloorCorrection,
      hipsFrameRuntime,
      status: "fallback-demo-pose",
    };
  }

  const rootFrameOrchestrationRuntime = applyMovementAvatarRootFrameOrchestrationRuntime({
    avatarBaseY,
    avatarRoot,
    avatarRootVisualLerp: hipsFrameRuntime.hipsPositionOptions.avatarRootVisualLerp,
    history,
    livePose: poseLandmarks,
    liveWorldPose: mirrorPlayerDisplay && worldPose ? displayWorldPose : worldPose ?? null,
    positionOffset,
    recordedRootMotionFrame,
    rootCommandYRef,
    rootOrientation,
    trackingDebugRef,
    visualRootDrop,
  });

  return {
    calibratedFloorCorrection,
    hipsFrameRuntime,
    rootFrameOrchestrationRuntime,
    status: "ready",
    stepResponse: rootFrameOrchestrationRuntime.stepResponse,
  };
}
