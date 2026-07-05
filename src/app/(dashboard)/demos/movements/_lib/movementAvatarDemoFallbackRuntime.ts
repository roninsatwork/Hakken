import type { VrmQuaternionBoneLike } from "./vrmRigging";
import { applyVrmDemoFallbackPoseToBones } from "./vrmRigging";

export function applyMovementAvatarDemoFallbackRuntimePose({
  lookupBone,
  slerp,
}: {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  slerp: number;
}) {
  return applyVrmDemoFallbackPoseToBones({
    lookupBone,
    slerp,
  });
}
