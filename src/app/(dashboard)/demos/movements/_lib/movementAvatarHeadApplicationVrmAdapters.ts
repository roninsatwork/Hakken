import type * as THREE from "three";
import { applyVrmNamedRotationTargetToBones } from "./vrmRigging";
import { applyMovementAvatarHeadApplication } from "./movementAvatarHeadApplicationRuntime";
import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadApplicationResult,
} from "./movementAvatarHeadApplicationTypes";

export function applyMovementAvatarHeadApplicationToVrmBones({
  baseHeadPosition,
  headApplicationPose,
  headBonePitch,
  headPositionSlerp,
  headRoll,
  headSlerp,
  headWorldYaw,
  lookupBone,
  neckSlerp,
  shouldApplyHeadMotion,
  upperChestCompensationSlerp,
}: {
  baseHeadPosition: THREE.Vector3 | null | undefined;
  headApplicationPose: MovementAvatarHeadApplicationPoseDecision;
  headBonePitch: number;
  headPositionSlerp: number;
  headRoll: number;
  headSlerp: number;
  headWorldYaw: number;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  neckSlerp: number;
  shouldApplyHeadMotion: boolean;
  upperChestCompensationSlerp: number;
}): MovementAvatarHeadApplicationResult {
  return applyMovementAvatarHeadApplication({
    applyUpperChestCompensation: (compensation, slerp) => applyVrmNamedRotationTargetToBones({
      bone: "upperChest",
      lookupBone,
      rotation: compensation,
      slerp,
    }).applied > 0,
    baseHeadPosition,
    headApplicationPose,
    headBonePitch,
    headNode: lookupBone("head"),
    headPositionSlerp,
    headRoll,
    headSlerp,
    headWorldYaw,
    neckNode: lookupBone("neck"),
    neckSlerp,
    shouldApplyHeadMotion,
    upperChestCompensationSlerp,
  });
}
