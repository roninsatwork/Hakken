import type * as THREE from "three";
import {
  applyMovementAvatarLowerBodyFrameRuntime,
  type MovementAvatarLowerBodyFrameRuntimeResult,
} from "./movementAvatarLowerBodyFrameRuntime";
import { createMovementAvatarLowerBodyFrameCallbacksRuntime } from "./movementAvatarLowerBodyFrameCallbacksRuntime";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import type { MovementAvatarRetargetFrameRuntimeAdapters } from "./movementAvatarRetargetFrameRuntime";
import type { MovementAvatarRetargetRestMap } from "./movementAvatarRestPose";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarLowerBodyFrameRuntimeInput = Parameters<typeof applyMovementAvatarLowerBodyFrameRuntime>[0];

export type MovementAvatarLowerBodyFrameOrchestrationRuntimeResult = {
  footOwner: string;
  lowerBodyFrameRuntime: MovementAvatarLowerBodyFrameRuntimeResult;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedLowerBody: number;
};

export function applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
  lastGoodQuaternionRef,
  profile,
  retargetAvatarRestRef,
  retargetFrameRuntimeAdapters,
  scene,
  ...input
}: Omit<
  MovementAvatarLowerBodyFrameRuntimeInput,
  | "applyPlantedSquatIk"
  | "applyRetargetMappings"
  | "storeLastGoodQuaternion"
  | "updateWorldMatrix"
> & {
  lastGoodQuaternionRef: MovementAvatarMutableRef<Record<string, THREE.Quaternion>>;
  profile: MovementAvatarTrackingProfile | undefined;
  retargetAvatarRestRef: MovementAvatarMutableRef<MovementAvatarRetargetRestMap>;
  retargetFrameRuntimeAdapters: MovementAvatarRetargetFrameRuntimeAdapters;
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
}): MovementAvatarLowerBodyFrameOrchestrationRuntimeResult {
  const lowerBodyFrameCallbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
    lastGoodQuaternionRef,
    scene,
  });
  const lowerBodyFrameRuntime = applyMovementAvatarLowerBodyFrameRuntime({
    ...input,
    applyPlantedSquatIk: retargetFrameRuntimeAdapters.applyPlantedSquatIk,
    applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
    kneeRaiseLowerLegBoost: profile?.kneeRaiseLowerLegBoost,
    kneeRaiseUpperLegBoost: profile?.kneeRaiseUpperLegBoost,
    storeLastGoodQuaternion: lowerBodyFrameCallbacks.storeLastGoodQuaternion,
    updateWorldMatrix: lowerBodyFrameCallbacks.updateWorldMatrix,
  });
  retargetAvatarRestRef.current = retargetFrameRuntimeAdapters.getRestMap();

  return {
    footOwner: lowerBodyFrameRuntime.footOwner,
    lowerBodyFrameRuntime,
    lowerBodyOwner: lowerBodyFrameRuntime.lowerBodyOwner,
    plantedSquatIkDepth: lowerBodyFrameRuntime.plantedSquatIkDepth,
    retargetAppliedLowerBody: lowerBodyFrameRuntime.retargetAppliedLowerBody,
  };
}
