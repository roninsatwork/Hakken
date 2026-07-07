import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import {
  applyMovementAvatarEndFrameRuntime,
  type MovementAvatarEndFrameRuntimeResult,
} from "./movementAvatarEndFrameRuntime";
import {
  applyMovementAvatarPostFrameDebugRuntime,
  type MovementAvatarPostFrameDebugRuntimeResult,
} from "./movementAvatarPostFrameDebugRuntime";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";
import type {
  VrmBlendshapeCategory,
  VrmExpressionTargetWriter,
  VrmHandsPayload,
} from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarFinalFrameOrchestrationRuntimeResult = {
  endFrameRuntime: MovementAvatarEndFrameRuntimeResult;
  postFrameDebugRuntime: MovementAvatarPostFrameDebugRuntimeResult;
};

export function applyMovementAvatarFinalFrameOrchestrationRuntime({
  avatarName,
  avatarRole,
  blendshapes,
  expressionManager,
  footLock,
  frameUpdatedAt,
  hands,
  isPlayer,
  lookupBone,
  mirrorForDisplay,
  retargetFrame,
  trackingDebugRef,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  blendshapes?: VrmBlendshapeCategory[] | null;
  expressionManager: VrmExpressionTargetWriter | null | undefined;
  footLock: Parameters<typeof applyMovementAvatarPostFrameDebugRuntime>[0]["footLock"];
  frameUpdatedAt: number;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  lookupBone: (vrmName: string) => THREE.Object3D | null | undefined;
  mirrorForDisplay: boolean;
  retargetFrame: MovementRetargetFrame;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  zScale: number;
}): MovementAvatarFinalFrameOrchestrationRuntimeResult {
  const postFrameDebugRuntime = applyMovementAvatarPostFrameDebugRuntime({
    avatarName,
    avatarRole,
    footLock,
    frameUpdatedAt,
    retargetFrame,
    trackingDebugRef,
    vrm,
    zScale,
  });
  const endFrameRuntime = applyMovementAvatarEndFrameRuntime({
    blendshapes,
    expressionManager,
    hands,
    isPlayer,
    lookupBone,
    mirrorForDisplay,
  });

  return {
    endFrameRuntime,
    postFrameDebugRuntime,
  };
}
