import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import {
  estimateMovementAvatarChairPoseDepth,
  estimateMovementAvatarForwardFoldDepth,
  estimateMovementAvatarHalfLiftDepth,
} from "./movementAvatarSupportPresentationEstimators";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  movementAvatarStandingPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarStandingFoldSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision | null {
  if (exercisePose.poseKey === "yoga-half-lift-prep") {
    const halfLiftDepth = estimateMovementAvatarHalfLiftDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.24 + halfLiftDepth * 0.28, y: 0, z: -0.28 }, 0.16),
        armSpec("leftUpperArm", { x: 0.24 + halfLiftDepth * 0.28, y: 0, z: 0.28 }, 0.16),
        armSpec("rightLowerArm", { x: 0.05 + halfLiftDepth * 0.18, y: 0, z: -0.06 }, 0.14),
        armSpec("leftLowerArm", { x: 0.05 + halfLiftDepth * 0.18, y: 0, z: 0.06 }, 0.14),
      ],
      owner: "support-presentation-yoga-half-lift",
      specs: [
        spec("rightUpperLeg", { x: 0.14 + halfLiftDepth * 0.14, y: 0, z: -0.02 }, 0.14),
        spec("leftUpperLeg", { x: 0.14 + halfLiftDepth * 0.14, y: 0, z: 0.02 }, 0.14),
        spec("rightLowerLeg", { x: -0.05 - halfLiftDepth * 0.05, y: 0, z: 0.01 }, 0.12),
        spec("leftLowerLeg", { x: -0.05 - halfLiftDepth * 0.05, y: 0, z: -0.01 }, 0.12),
        spec("rightFoot", { x: 0.03, y: 0, z: 0 }, 0.12),
        spec("leftFoot", { x: 0.03, y: 0, z: 0 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ halfLiftDepth, key: "halfLift" }),
      spineSpecs: [
        spineSpec("hips", { x: 0.08 + halfLiftDepth * 0.18, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: 0.12 + halfLiftDepth * 0.26, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: 0.08 + halfLiftDepth * 0.2, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (exercisePose.poseKey === "yoga-forward-fold-prep") {
    const foldDepth = estimateMovementAvatarForwardFoldDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.32 + foldDepth * 0.38, y: 0, z: -0.34 }, 0.16),
        armSpec("leftUpperArm", { x: 0.32 + foldDepth * 0.38, y: 0, z: 0.34 }, 0.16),
        armSpec("rightLowerArm", { x: 0.08 + foldDepth * 0.26, y: 0, z: -0.08 }, 0.14),
        armSpec("leftLowerArm", { x: 0.08 + foldDepth * 0.26, y: 0, z: 0.08 }, 0.14),
      ],
      owner: "support-presentation-yoga-forward-fold",
      specs: [
        spec("rightUpperLeg", { x: 0.16 + foldDepth * 0.18, y: 0, z: -0.03 }, 0.14),
        spec("leftUpperLeg", { x: 0.16 + foldDepth * 0.18, y: 0, z: 0.03 }, 0.14),
        spec("rightLowerLeg", { x: -0.08 - foldDepth * 0.08, y: 0, z: 0.01 }, 0.12),
        spec("leftLowerLeg", { x: -0.08 - foldDepth * 0.08, y: 0, z: -0.01 }, 0.12),
        spec("rightFoot", { x: 0.04, y: 0, z: 0 }, 0.12),
        spec("leftFoot", { x: 0.04, y: 0, z: 0 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ foldDepth, key: "forwardFold" }),
      spineSpecs: [
        spineSpec("hips", { x: 0.12 + foldDepth * 0.42, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: 0.18 + foldDepth * 0.52, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: 0.14 + foldDepth * 0.44, y: 0, z: 0 }, 0.16),
        spineSpec("upperChest", { x: 0.08 + foldDepth * 0.28, y: 0, z: 0 }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "yoga-chair-prep") {
    const chairDepth = estimateMovementAvatarChairPoseDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: -0.58 - chairDepth * 0.18, y: 0, z: -0.18 }, 0.18),
        armSpec("leftUpperArm", { x: -0.58 - chairDepth * 0.18, y: 0, z: 0.18 }, 0.18),
        armSpec("rightLowerArm", { x: -0.16 - chairDepth * 0.12, y: 0, z: -0.04 }, 0.16),
        armSpec("leftLowerArm", { x: -0.16 - chairDepth * 0.12, y: 0, z: 0.04 }, 0.16),
      ],
      owner: "support-presentation-yoga-chair",
      specs: [
        spec("rightUpperLeg", { x: 0.74 + chairDepth * 0.74, y: -0.04, z: -0.1 }, 0.2),
        spec("leftUpperLeg", { x: 0.74 + chairDepth * 0.74, y: 0.04, z: 0.1 }, 0.2),
        spec("rightLowerLeg", { x: -0.64 - chairDepth * 0.82, y: 0, z: 0.04 }, 0.2),
        spec("leftLowerLeg", { x: -0.64 - chairDepth * 0.82, y: 0, z: -0.04 }, 0.2),
        spec("rightFoot", { x: 0.16 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
        spec("leftFoot", { x: 0.16 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
      ],
      standingPose: movementAvatarStandingPose({ chairDepth, key: "chair" }),
      spineSpecs: [
        spineSpec("hips", { x: -0.04 - chairDepth * 0.12, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: 0.08 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: 0.08 + chairDepth * 0.14, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  return null;
}
