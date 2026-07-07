import type * as THREE from "three";

export type MovementAvatarFrameScenePreparationRuntime = {
  fallbackSlerp: number;
  hipsNode: THREE.Object3D | null;
  updatedSceneMatrixWorld: boolean;
};

export function resolveMovementAvatarFrameScenePreparationRuntime({
  avatarRole,
  lookupBone,
  scene,
}: {
  avatarRole: "instructor" | "player";
  lookupBone: (boneName: "hips") => THREE.Object3D | null | undefined;
  scene?: Pick<THREE.Object3D, "updateMatrixWorld"> | null;
}): MovementAvatarFrameScenePreparationRuntime {
  scene?.updateMatrixWorld(true);

  return {
    fallbackSlerp: avatarRole === "player" ? 0.5 : 0.3,
    hipsNode: lookupBone("hips") ?? null,
    updatedSceneMatrixWorld: Boolean(scene),
  };
}
