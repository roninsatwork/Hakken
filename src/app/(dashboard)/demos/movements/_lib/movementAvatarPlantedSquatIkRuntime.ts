import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { resolveMovementAvatarPlantedSquatIkPose } from "./movementAvatarPipeline";
import {
  buildMovementAvatarRetargetRestMap,
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

export function applyMovementAvatarPlantedSquatIkRuntimeFrame({
  avatarRole,
  avatarRoot,
  canApply = true,
  currentRestMap,
  depth,
  lookupBone,
  refreshRestMap,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  const forward = new THREE.Vector3(0, 0, 1);
  if (avatarRoot) {
    avatarRoot.getWorldDirection(forward).normalize();
  }

  return applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
    avatarRole,
    canApply,
    currentRestMap,
    depth,
    forward,
    lookupBone,
    refreshRestMap,
    storeLastGood,
  });
}

export function applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
  avatarRole,
  avatarRoot,
  currentRestMap,
  depth,
  lookupBone,
  storeLastGood,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
  vrm: VRM | null | undefined;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  return applyMovementAvatarPlantedSquatIkRuntimeFrame({
    avatarRole,
    avatarRoot,
    canApply: Boolean(vrm),
    currentRestMap,
    depth,
    lookupBone,
    refreshRestMap: () => vrm ? buildMovementAvatarRetargetRestMap(vrm) : currentRestMap,
    storeLastGood,
  });
}
