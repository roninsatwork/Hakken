import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarKneelingSupportPresentationPose({
  exercisePose,
}: {
  exercisePose: MovementExercisePoseDecision;
}): MovementAvatarSupportPresentationDecision {
  const isHalfKneel = exercisePose.poseKey === "half-kneeling-floor";
  const isLowLunge = exercisePose.poseKey === "low-lunge-floor";

  return decision({
    armSpecs: [
      armSpec("rightUpperArm", { x: 0.04, y: 0, z: -0.92 }, 0.14),
      armSpec("leftUpperArm", { x: 0.04, y: 0, z: 0.92 }, 0.14),
    ],
    owner: isLowLunge
      ? "support-presentation-low-lunge"
      : isHalfKneel ? "support-presentation-half-kneeling" : "support-presentation-kneeling",
    specs: [
      spec("rightUpperLeg", { x: isHalfKneel || isLowLunge ? 1.15 : 0.48, y: -0.04, z: -0.08 }, 0.2),
      spec("leftUpperLeg", { x: isLowLunge ? 0.74 : 0.48, y: 0.04, z: 0.08 }, 0.2),
      spec("rightLowerLeg", { x: isHalfKneel || isLowLunge ? -1.0 : -1.78, y: 0, z: 0.06 }, 0.22),
      spec("leftLowerLeg", { x: -1.78, y: 0, z: -0.06 }, 0.22),
      spec("rightFoot", { x: isHalfKneel || isLowLunge ? 0.06 : -0.58, y: 0, z: 0 }, 0.18),
      spec("leftFoot", { x: -0.58, y: 0, z: 0 }, 0.18),
    ],
    spineSpecs: [
      spineSpec("hips", { x: isLowLunge ? 0.14 : 0.02, y: 0, z: 0 }, 0.16),
      spineSpec("spine", { x: isLowLunge ? 0.32 : 0.1, y: 0, z: 0 }, 0.16),
      spineSpec("chest", { x: isLowLunge ? 0.26 : 0.08, y: 0, z: 0 }, 0.16),
    ],
  });
}
