import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { MovementRetargetSegmentName } from "./movementRetargeting";

export type MovementAvatarRetargetBoneName = Parameters<
  VRM["humanoid"]["getNormalizedBoneNode"]
>[0];

export type MovementAvatarRetargetRestBone = {
  worldDirection: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
};

export type MovementAvatarRetargetRestMap = Partial<
  Record<MovementAvatarRetargetBoneName, MovementAvatarRetargetRestBone>
>;

export type MovementAvatarRetargetBoneMapping = {
  bone: MovementAvatarRetargetBoneName;
  child: MovementAvatarRetargetBoneName;
  segment: MovementRetargetSegmentName;
  type: "arm" | "foot" | "leg" | "spine";
};

export const MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS: MovementAvatarRetargetBoneMapping[] = [
  { bone: "rightUpperLeg", child: "rightLowerLeg", segment: "rightThigh", type: "leg" },
  { bone: "rightLowerLeg", child: "rightFoot", segment: "rightShin", type: "leg" },
  { bone: "leftUpperLeg", child: "leftLowerLeg", segment: "leftThigh", type: "leg" },
  { bone: "leftLowerLeg", child: "leftFoot", segment: "leftShin", type: "leg" },
  { bone: "rightFoot", child: "rightToes", segment: "rightFoot", type: "foot" },
  { bone: "leftFoot", child: "leftToes", segment: "leftFoot", type: "foot" },
];

export const MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS: MovementAvatarRetargetBoneMapping[] = [
  { bone: "spine", child: "chest", segment: "spine", type: "spine" },
  { bone: "rightUpperArm", child: "rightLowerArm", segment: "rightUpperArm", type: "arm" },
  { bone: "rightLowerArm", child: "rightHand", segment: "rightLowerArm", type: "arm" },
  { bone: "leftUpperArm", child: "leftLowerArm", segment: "leftUpperArm", type: "arm" },
  { bone: "leftLowerArm", child: "leftHand", segment: "leftLowerArm", type: "arm" },
];

export const MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS =
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS;

export const MOVEMENT_AVATAR_VISUAL_MAPPINGS = [
  ...MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
  ...MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
];

export function buildMovementAvatarRetargetRestMap(
  vrm: VRM,
): MovementAvatarRetargetRestMap {
  const restMap: MovementAvatarRetargetRestMap = {};
  vrm.scene.updateMatrixWorld(true);

  MOVEMENT_AVATAR_VISUAL_MAPPINGS.forEach(({ bone: boneName, child: childName }) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const child = vrm.humanoid.getNormalizedBoneNode(childName);
    if (!bone || !child) return;

    const boneWorldPosition = new THREE.Vector3();
    const childWorldPosition = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPosition);
    child.getWorldPosition(childWorldPosition);

    const worldDirection = childWorldPosition.sub(boneWorldPosition);
    if (worldDirection.lengthSq() < 0.000001) return;

    const worldQuaternion = new THREE.Quaternion();
    bone.getWorldQuaternion(worldQuaternion);

    restMap[boneName] = {
      worldDirection: worldDirection.normalize(),
      worldQuaternion,
    };
  });

  return restMap;
}

export function movementSourceSegmentToAvatarWorldDirection(
  direction: { x: number; y: number; z: number },
  zScale: number,
) {
  const worldDirection = new THREE.Vector3(
    direction.x,
    -direction.y,
    -direction.z * zScale,
  );

  return worldDirection.lengthSq() > 0.000001 ? worldDirection.normalize() : null;
}
