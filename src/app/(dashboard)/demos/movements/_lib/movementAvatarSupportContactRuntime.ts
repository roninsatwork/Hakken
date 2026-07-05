import type * as THREE from "three";
import type { MovementAvatarSupportContactLockDecision } from "./movementAvatarPipeline";
import {
  applyMovementAvatarSupportContactLocksToObjects,
  type MovementAvatarSupportContactObjectApplicationResult,
} from "./movementAvatarSupportContactApplication";

function emptySupportContactRuntimeResult(): MovementAvatarSupportContactObjectApplicationResult {
  return {
    applied: false,
    appliedAnchors: 0,
    appliedBoneCorrection: 0,
    appliedRootCorrection: 0,
    supportContactCorrection: 0,
  };
}

export function applyMovementAvatarSupportContactRuntimeLocks({
  avatarRoot,
  contactLocks,
  floorY,
  lookupBone,
  scene,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  contactLocks: MovementAvatarSupportContactLockDecision;
  floorY: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
}): MovementAvatarSupportContactObjectApplicationResult {
  if (!avatarRoot || !scene || !contactLocks.shouldApply) {
    return emptySupportContactRuntimeResult();
  }

  return applyMovementAvatarSupportContactLocksToObjects({
    avatarRoot,
    contactLocks,
    floorY,
    lookupBone,
    scene,
  });
}
