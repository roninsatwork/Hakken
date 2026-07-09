import type * as THREE from "three";
import {
  applyMovementAvatarUpperBodyFrameRuntime,
  type MovementAvatarUpperBodyFrameRuntimeResult,
} from "./movementAvatarUpperBodyFrameRuntime";
import type { MovementAvatarRetargetFrameRuntimeAdapters } from "./movementAvatarRetargetFrameRuntime";

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
  ...input
}: Omit<
  MovementAvatarUpperBodyFrameRuntimeInput,
  "applyRetargetMappings" | "lastGood"
> & {
  lastGoodQuaternionRef: MovementAvatarMutableRef<Record<string, THREE.Quaternion>>;
  retargetFrameRuntimeAdapters: Pick<MovementAvatarRetargetFrameRuntimeAdapters, "applyRetargetMappings">;
}): MovementAvatarUpperBodyFrameOrchestrationRuntimeResult {
  const upperBodyFrameRuntime = applyMovementAvatarUpperBodyFrameRuntime({
    ...input,
    applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
    lastGood: lastGoodQuaternionRef.current,
  });

  return {
    retargetAppliedUpperBody: upperBodyFrameRuntime.retargetAppliedUpperBody,
    upperBodyFrameRuntime,
  };
}
