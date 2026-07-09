import type * as THREE from "three";
import {
  applyMovementAvatarUpperBodyFrameRuntime,
  type MovementAvatarUpperBodyFrameRuntimeResult,
} from "./movementAvatarUpperBodyFrameRuntime";
import type { MovementAvatarRetargetFrameRuntimeAdapters } from "./movementAvatarRetargetFrameRuntime";
import type { VrmRiggedPose } from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

type MovementAvatarUpperBodyFrameRuntimeInput = Parameters<typeof applyMovementAvatarUpperBodyFrameRuntime>[0];

export type MovementAvatarUpperBodyFrameOrchestrationRuntimeResult = {
  retargetAppliedUpperBody: number;
  upperBodyFrameRuntime: MovementAvatarUpperBodyFrameRuntimeResult;
};

export function applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
  lastGoodQuaternionRef,
  retargetFrameRuntimeAdapters,
  riggedPose,
  ...input
}: Omit<
  MovementAvatarUpperBodyFrameRuntimeInput,
  "applyRetargetMappings" | "lastGood" | "sources"
> & {
  lastGoodQuaternionRef: MovementAvatarMutableRef<Record<string, THREE.Quaternion>>;
  retargetFrameRuntimeAdapters: Pick<MovementAvatarRetargetFrameRuntimeAdapters, "applyRetargetMappings">;
  riggedPose: VrmRiggedPose;
}): MovementAvatarUpperBodyFrameOrchestrationRuntimeResult {
  const upperBodyFrameRuntime = applyMovementAvatarUpperBodyFrameRuntime({
    ...input,
    applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
    lastGood: lastGoodQuaternionRef.current,
    sources: {
      hips: riggedPose.Hips?.rotation,
      spine: riggedPose.Spine,
    },
  });

  return {
    retargetAppliedUpperBody: upperBodyFrameRuntime.retargetAppliedUpperBody,
    upperBodyFrameRuntime,
  };
}
