import type * as THREE from "three";
import {
  applyMovementAvatarRootFrameOrchestrationRuntime,
  type MovementAvatarRootFrameOrchestrationRuntimeResult,
} from "./movementAvatarRootFrameOrchestrationRuntime";
import {
  resolveMovementAvatarHipsFrameRuntime,
  type MovementAvatarHipsFrameRuntimeDecision,
} from "./movementAvatarHipsFrameRuntime";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementRootMotionFrame,
  MovementRootMotionInputFrame,
  MovementRootMotionStepResponseDecision,
} from "./movementRootMotion";
import type {
  MovementAvatarTrackingProfile,
  MovementCalibration,
  MovementTrackingDebugState,
} from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

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
  rigMeasurements: { hipHeight: number } | null;
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
