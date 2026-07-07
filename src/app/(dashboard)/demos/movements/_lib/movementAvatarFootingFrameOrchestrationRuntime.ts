import type * as THREE from "three";
import type { MovementAvatarFootLockState } from "./movementAvatarFootLock";
import {
  applyMovementAvatarFootingFrameRuntime,
  type MovementAvatarFootingFrameRuntimeResult,
} from "./movementAvatarFootingFrameRuntime";
import { applyMovementAvatarFootingFrameRefsRuntime } from "./movementAvatarFootingFrameRefsRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarFootingFrameRuntimeInput = Parameters<typeof applyMovementAvatarFootingFrameRuntime>[0];

export type MovementAvatarFootingFrameOrchestrationRuntimeResult = {
  footLockCorrection: number;
  footLockDrift: number;
  footLockState: MovementAvatarFootLockState;
  footingRuntime: MovementAvatarFootingFrameRuntimeResult;
};

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
