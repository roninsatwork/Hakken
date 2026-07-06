import type { VRM } from "@pixiv/three-vrm";
import { resolveMovementAvatarBoneEaseOptions } from "./movementAvatarPipeline";
import { applyMovementAvatarDemoFallbackRuntimePose } from "./movementAvatarDemoFallbackRuntime";
import { createVrmNormalizedBoneLookup } from "./vrmRigging";

export type MovementAvatarFrameAccessRole = "instructor" | "player";

export function createMovementAvatarFrameAccessRuntime({
  avatarRole,
  getVrm,
}: {
  avatarRole: MovementAvatarFrameAccessRole;
  getVrm: () => VRM | null | undefined;
}) {
  const lookupBone = createVrmNormalizedBoneLookup(getVrm);
  const boneEaseOptions = resolveMovementAvatarBoneEaseOptions({
    avatarRole,
  });

  return {
    avatarRole,
    boneEaseOptions,
    lookupBone,
    applyDemoFallbackPose(factor = boneEaseOptions.demoFallbackSlerp) {
      return applyMovementAvatarDemoFallbackRuntimePose({
        lookupBone,
        slerp: factor,
      });
    },
  };
}
