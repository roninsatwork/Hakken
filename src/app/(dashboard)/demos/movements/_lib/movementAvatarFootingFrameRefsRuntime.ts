import type * as THREE from "three";
import type { MovementAvatarFootLockState } from "./movementAvatarFootLock";
import type { MovementAvatarFootingFrameRuntimeResult } from "./movementAvatarFootingFrameRuntime";

type MovementAvatarMutableRef<T> = {
  current: T;
};

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
