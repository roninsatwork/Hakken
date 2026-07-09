import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
  buildMovementAvatarRetargetRestMap,
  movementSourceSegmentToAvatarWorldDirection,
  type MovementAvatarRetargetBoneName,
} from "./movementAvatarRestPose";

function makeBone(name: string, position: THREE.Vector3) {
  const bone = new THREE.Object3D();
  bone.name = name;
  bone.position.copy(position);
  return bone;
}

function makeVrm(bones: Partial<Record<MovementAvatarRetargetBoneName, THREE.Object3D>>) {
  const scene = new THREE.Object3D();
  Object.values(bones).forEach((bone) => {
    if (bone) scene.add(bone);
  });

  return {
    humanoid: {
      getNormalizedBoneNode: (name: MovementAvatarRetargetBoneName) => bones[name] ?? null,
    },
    scene,
  } as unknown as VRM;
}

describe("movement avatar rest pose", () => {
  it("keeps shared upper/lower retarget mappings explicit", () => {
    expect(MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS).toHaveLength(6);
    expect(MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS).toHaveLength(5);
    expect(MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS).toHaveLength(5);
    expect(MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS.some((mapping) => mapping.type === "spine")).toBe(true);
  });

  it("builds rest directions for valid VRM bone pairs and skips missing or zero-length pairs", () => {
    const spine = makeBone("spine", new THREE.Vector3(0, 0, 0));
    const chest = makeBone("chest", new THREE.Vector3(0, 2, 0));
    const rightUpperArm = makeBone("rightUpperArm", new THREE.Vector3(1, 1, 0));
    const rightLowerArm = makeBone("rightLowerArm", new THREE.Vector3(1, 1, 0));
    const vrm = makeVrm({
      chest,
      rightLowerArm,
      rightUpperArm,
      spine,
    });

    const restMap = buildMovementAvatarRetargetRestMap(vrm);

    expect(restMap.spine?.worldDirection.x).toBeCloseTo(0);
    expect(restMap.spine?.worldDirection.y).toBeCloseTo(1);
    expect(restMap.spine?.worldDirection.z).toBeCloseTo(0);
    expect(restMap.rightUpperArm).toBeUndefined();
    expect(restMap.leftUpperArm).toBeUndefined();
  });

  it("converts source segment direction into avatar world direction with y/z handedness", () => {
    const direction = movementSourceSegmentToAvatarWorldDirection(
      { x: 1, y: 2, z: -2 },
      0.5,
    );

    expect(direction?.x).toBeCloseTo(1 / Math.sqrt(6));
    expect(direction?.y).toBeCloseTo(-2 / Math.sqrt(6));
    expect(direction?.z).toBeCloseTo(1 / Math.sqrt(6));
    expect(movementSourceSegmentToAvatarWorldDirection({ x: 0, y: 0, z: 0 }, 1)).toBeNull();
  });
});
