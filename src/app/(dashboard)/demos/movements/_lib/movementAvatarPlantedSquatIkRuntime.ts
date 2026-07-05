import * as THREE from "three";
import { resolveMovementAvatarPlantedSquatIkPose } from "./movementAvatarPipeline";
import {
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import {
  applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones,
  resolveMovementAvatarPlantedSquatIkWorldDirections,
  type MovementAvatarPlantedSquatIkApplicationResult,
} from "./movementAvatarSegmentApplication";

export type MovementAvatarPlantedSquatIkRuntimeApplication =
  MovementAvatarPlantedSquatIkApplicationResult & {
    restMap: MovementAvatarRetargetRestMap;
  };

export function applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
  avatarRole,
  canApply = true,
  currentRestMap,
  depth,
  forward,
  lookupBone,
  refreshRestMap,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  forward: THREE.Vector3;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  const plantedSquatIk = resolveMovementAvatarPlantedSquatIkPose({
    avatarRole,
    depth,
  });
  if (plantedSquatIk.ikDepth <= 0.001) {
    return {
      applied: 0,
      appliedDepth: 0,
      restMap: currentRestMap,
    };
  }

  return applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones({
    canApply,
    currentRestMap,
    ikDepth: plantedSquatIk.ikDepth,
    lookupBone,
    refreshRestMap,
    specs: resolveMovementAvatarPlantedSquatIkWorldDirections({
      forward,
      plantedSquatIk,
    }),
    storeLastGood,
  });
}
