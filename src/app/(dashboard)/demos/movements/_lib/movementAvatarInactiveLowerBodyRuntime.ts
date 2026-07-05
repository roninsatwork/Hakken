import type * as THREE from "three";
import { resolveMovementAvatarInactiveLowerBodyDecision } from "./movementAvatarPipeline";
import { applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones } from "./movementAvatarLowerBodyApplication";

export type MovementAvatarInactiveLowerBodyRuntimeApplication = {
  appliedNeutralRotations: number;
  feetOwner: string | null;
  lowerBodyOwner: string | null;
};

export function applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
  avatarRole,
  lookupBone,
  lowerBodyNeutralSlerp,
  lowerBodySourceReliable,
}: {
  avatarRole: "instructor" | "player";
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  lowerBodyNeutralSlerp: number;
  lowerBodySourceReliable: boolean;
}): MovementAvatarInactiveLowerBodyRuntimeApplication {
  const inactiveLowerBodyDecision = resolveMovementAvatarInactiveLowerBodyDecision({
    avatarRole,
    lowerBodySourceReliable,
  });
  const neutralApplication = applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
    lookupBone,
    slerp: lowerBodyNeutralSlerp,
  });

  return {
    appliedNeutralRotations: neutralApplication.applied,
    feetOwner: inactiveLowerBodyDecision.feetOwner,
    lowerBodyOwner: inactiveLowerBodyDecision.lowerBodyOwner,
  };
}
