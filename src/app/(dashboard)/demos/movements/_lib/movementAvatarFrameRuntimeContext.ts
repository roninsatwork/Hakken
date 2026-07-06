import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";

export type MovementAvatarFrameRuntimeContext = {
  avatarRoot: THREE.Group;
  vrm: VRM;
};

export function resolveMovementAvatarFrameRuntimeContext({
  avatarRoot,
  delta,
  vrm,
}: {
  avatarRoot: THREE.Group | null | undefined;
  delta: number;
  vrm: VRM | null | undefined;
}): MovementAvatarFrameRuntimeContext | null {
  if (!vrm || !avatarRoot) return null;

  vrm.update(delta);

  return {
    avatarRoot,
    vrm,
  };
}
