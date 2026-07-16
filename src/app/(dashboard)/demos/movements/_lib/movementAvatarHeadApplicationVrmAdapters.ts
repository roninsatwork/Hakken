import type * as THREE from "three";
import { applyVrmNamedRotationTargetToBones } from "./vrmRigging";
import { applyMovementAvatarHeadApplication } from "./movementAvatarHeadApplicationRuntime";
import type {
  MovementAvatarHeadApplicationPoseDecision,
  MovementAvatarHeadApplicationResult,
} from "./movementAvatarHeadApplicationTypes";
import { movementAvatarFrameRateAdjustedSlerp } from "./movementAvatarFrameTiming";

export function applyMovementAvatarHeadApplicationToVrmBones({
  baseHeadPosition,
  frameDeltaSeconds,
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
  frameDeltaSeconds?: number;
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
    headPositionSlerp: movementAvatarFrameRateAdjustedSlerp(headPositionSlerp, frameDeltaSeconds),
    headRoll,
    headSlerp: movementAvatarFrameRateAdjustedSlerp(headSlerp, frameDeltaSeconds),
    headWorldYaw,
    neckNode: lookupBone("neck"),
    neckSlerp: movementAvatarFrameRateAdjustedSlerp(neckSlerp, frameDeltaSeconds),
    shouldApplyHeadMotion,
    upperChestCompensationSlerp: movementAvatarFrameRateAdjustedSlerp(
      upperChestCompensationSlerp,
      frameDeltaSeconds,
    ),
  });
}
