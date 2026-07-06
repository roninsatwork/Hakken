import type * as THREE from "three";

type MovementAvatarLastGoodQuaternionRef = {
  current: Record<string, THREE.Quaternion | null | undefined>;
};

export function createMovementAvatarLowerBodyFrameCallbacksRuntime({
  lastGoodQuaternionRef,
  scene,
}: {
  lastGoodQuaternionRef: MovementAvatarLastGoodQuaternionRef;
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
}) {
  return {
    getLastGoodQuaternion: (boneName: string) => lastGoodQuaternionRef.current[boneName] ?? null,
    storeLastGoodQuaternion: (boneName: string, quaternion: THREE.Quaternion) => {
      lastGoodQuaternionRef.current[boneName] = quaternion;
    },
    updateWorldMatrix: () => {
      scene.updateMatrixWorld(true);
    },
  };
}
