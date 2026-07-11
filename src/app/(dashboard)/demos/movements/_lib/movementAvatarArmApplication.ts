import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import {
  applyVrmArmLastGoodPoseToBones,
  applyVrmArmRelaxedPoseToBones,
} from "./vrmRigging";
import type * as THREE from "three";

export type MovementAvatarArmApplicationMode =
  | "retargeted"
  | "hold-last-good"
  | "relax";

export type MovementAvatarArmApplicationResult = {
  handled: boolean;
  mode: MovementAvatarArmApplicationMode;
};

/**
 * Arms are owned by the rest-mapped segment retarget. This application only
 * degrades gracefully when the retarget could not solve this arm's segments:
 * hold the last good pose while tracking is momentarily weak, otherwise relax.
 */
export function applyMovementAvatarArmApplication({
  armDecision,
  holdLastGood,
  relax,
  retargetApplied,
  side,
}: {
  armDecision: MovementAvatarArmDecision;
  holdLastGood: (side: "left" | "right") => void;
  relax: (side: "left" | "right") => void;
  retargetApplied: boolean;
  side: "left" | "right";
}): MovementAvatarArmApplicationResult {
  if (retargetApplied) {
    return {
      handled: false,
      mode: "retargeted",
    };
  }

  if (armDecision.isTrackingReady || armDecision.unreadyFallback === "hold-last-good") {
    holdLastGood(side);
    return {
      handled: true,
      mode: "hold-last-good",
    };
  }

  relax(side);
  return {
    handled: true,
    mode: "relax",
  };
}

export function applyMovementAvatarArmApplicationToVrmBones({
  armDecision,
  armRelaxedSlerp,
  lastGood,
  lookupBone,
  retargetApplied,
  side,
}: {
  armDecision: MovementAvatarArmDecision;
  armRelaxedSlerp: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  retargetApplied: boolean;
  side: "left" | "right";
}): MovementAvatarArmApplicationResult {
  const hasStoredArmPose = Boolean(
    lastGood[`${side}UpperArm`] || lastGood[`${side}LowerArm`],
  );
  const continuityDecision =
    !retargetApplied && armDecision.unreadyFallback === "relax" && hasStoredArmPose
      ? { ...armDecision, unreadyFallback: "hold-last-good" as const }
      : armDecision;

  return applyMovementAvatarArmApplication({
    armDecision: continuityDecision,
    holdLastGood: (targetSide) => {
      applyVrmArmLastGoodPoseToBones({
        lastGood,
        lookupBone,
        side: targetSide,
      });
    },
    relax: (targetSide) => {
      applyVrmArmRelaxedPoseToBones({
        lookupBone,
        side: targetSide,
        slerp: armRelaxedSlerp,
      });
    },
    retargetApplied,
    side,
  });
}
