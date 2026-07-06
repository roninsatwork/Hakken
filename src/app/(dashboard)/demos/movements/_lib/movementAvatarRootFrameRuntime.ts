import type * as THREE from "three";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import { buildMovementAvatarRootDebug } from "./movementAvatarDebugTelemetry";
import type { MovementAvatarRootTransformApplication } from "./movementAvatarRootApplication";
import {
  resolveMovementAvatarRootMotionRuntimeFrame,
} from "./movementAvatarRootMotionRuntime";
import {
  resolveMovementAvatarRootTarget,
  type MovementAvatarRootTargetDecision,
} from "./movementAvatarRootTarget";
import {
  applyMovementAvatarRootTransformRuntime,
  type MovementAvatarRootTransformRuntimeResult,
} from "./movementAvatarRootTransformRuntime";
import type {
  MovementRootMotionFrame,
  MovementRootMotionInputFrame,
  MovementRootMotionStepResponseDecision,
} from "./movementRootMotion";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

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
