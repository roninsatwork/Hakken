import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import {
  estimateMovementAvatarForwardLungeDepth,
  estimateMovementAvatarJumpingJackDepth,
  estimateMovementAvatarSideLungeDepth,
  estimateMovementAvatarStandingArmRaiseDepth,
  estimateMovementAvatarStandingTwistDepth,
} from "./movementAvatarSupportPresentationEstimators";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  movementAvatarStandingPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarAthleticStandingSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision | null {
  if (exercisePose.poseKey === "forward-lunge-prep") {
    const forwardLungeDepth = estimateMovementAvatarForwardLungeDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.1 + forwardLungeDepth * 0.12, y: 0, z: -0.62 }, 0.16),
        armSpec("leftUpperArm", { x: 0.1 + forwardLungeDepth * 0.12, y: 0, z: 0.62 }, 0.16),
        armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
        armSpec("leftLowerArm", { x: 0.04, y: 0, z: 0.08 }, 0.14),
      ],
      owner: "support-presentation-forward-lunge",
      specs: [
        spec("rightUpperLeg", { x: 0.3 + forwardLungeDepth * 0.68, y: -0.06, z: -0.2 }, 0.18),
        spec("leftUpperLeg", { x: 0.12 + forwardLungeDepth * 0.22, y: 0.06, z: 0.16 }, 0.18),
        spec("rightLowerLeg", { x: -0.22 - forwardLungeDepth * 0.42, y: 0, z: 0.04 }, 0.16),
        spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.04 }, 0.14),
        spec("rightFoot", { x: 0.08, y: 0.1, z: -0.06 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.1, z: 0.06 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ forwardLungeDepth, key: "forwardLunge" }),
      spineSpecs: [
        spineSpec("hips", { x: 0.04 + forwardLungeDepth * 0.08, y: 0.03, z: 0 }, 0.14),
        spineSpec("spine", { x: 0.06 + forwardLungeDepth * 0.08, y: 0.03, z: 0 }, 0.14),
        spineSpec("chest", { x: 0.05 + forwardLungeDepth * 0.06, y: 0.02, z: 0 }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "side-lunge-prep") {
    const sideLungeDepth = estimateMovementAvatarSideLungeDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.08, y: 0, z: -0.72 }, 0.16),
        armSpec("leftUpperArm", { x: 0.08, y: 0, z: 0.72 }, 0.16),
        armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
        armSpec("leftLowerArm", { x: 0.04, y: 0, z: 0.08 }, 0.14),
      ],
      owner: "support-presentation-side-lunge",
      specs: [
        spec("rightUpperLeg", { x: 0.2 + sideLungeDepth * 0.42, y: -0.08, z: -0.32 }, 0.18),
        spec("leftUpperLeg", { x: 0.06 + sideLungeDepth * 0.12, y: 0.08, z: 0.28 }, 0.18),
        spec("rightLowerLeg", { x: -0.12 - sideLungeDepth * 0.36, y: 0, z: 0.06 }, 0.16),
        spec("leftLowerLeg", { x: -0.02, y: 0, z: -0.06 }, 0.14),
        spec("rightFoot", { x: 0.04, y: 0.12, z: -0.08 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.12, z: 0.08 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ key: "sideLunge", sideLungeDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0.02, y: 0.08 * sideLungeDepth, z: 0.08 * sideLungeDepth }, 0.14),
        spineSpec("spine", { x: 0.04, y: 0.08 * sideLungeDepth, z: 0.12 * sideLungeDepth }, 0.14),
        spineSpec("chest", { x: 0.04, y: 0.06 * sideLungeDepth, z: 0.08 * sideLungeDepth }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "jumping-jack-prep") {
    const jumpingJackDepth = estimateMovementAvatarJumpingJackDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: -0.46 - jumpingJackDepth * 0.16, y: 0, z: -0.72 }, 0.18),
        armSpec("leftUpperArm", { x: -0.46 - jumpingJackDepth * 0.16, y: 0, z: 0.72 }, 0.18),
        armSpec("rightLowerArm", { x: -0.12 - jumpingJackDepth * 0.08, y: 0, z: -0.08 }, 0.16),
        armSpec("leftLowerArm", { x: -0.12 - jumpingJackDepth * 0.08, y: 0, z: 0.08 }, 0.16),
      ],
      owner: "support-presentation-jumping-jack-prep",
      specs: [
        spec("rightUpperLeg", { x: 0.04, y: -0.04, z: -0.24 - jumpingJackDepth * 0.18 }, 0.16),
        spec("leftUpperLeg", { x: 0.04, y: 0.04, z: 0.24 + jumpingJackDepth * 0.18 }, 0.16),
        spec("rightLowerLeg", { x: -0.02, y: 0, z: 0.05 }, 0.14),
        spec("leftLowerLeg", { x: -0.02, y: 0, z: -0.05 }, 0.14),
        spec("rightFoot", { x: 0.02, y: 0.08, z: -0.06 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.08, z: 0.06 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ jumpingJackDepth, key: "jumpingJack" }),
      spineSpecs: [
        spineSpec("hips", { x: 0, y: 0, z: 0 }, 0.12),
        spineSpec("spine", { x: 0.02, y: 0, z: 0 }, 0.12),
        spineSpec("chest", { x: 0.02, y: 0, z: 0 }, 0.12),
      ],
    });
  }

  if (exercisePose.poseKey === "standing-arm-raise") {
    const armRaiseDepth = estimateMovementAvatarStandingArmRaiseDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: -0.5 - armRaiseDepth * 0.2, y: 0, z: -0.18 }, 0.18),
        armSpec("leftUpperArm", { x: -0.5 - armRaiseDepth * 0.2, y: 0, z: 0.18 }, 0.18),
        armSpec("rightLowerArm", { x: -0.12 - armRaiseDepth * 0.12, y: 0, z: -0.04 }, 0.16),
        armSpec("leftLowerArm", { x: -0.12 - armRaiseDepth * 0.12, y: 0, z: 0.04 }, 0.16),
      ],
      owner: "support-presentation-standing-arm-raise",
      specs: [
        spec("rightUpperLeg", { x: 0, y: 0, z: -0.02 }, 0.1),
        spec("leftUpperLeg", { x: 0, y: 0, z: 0.02 }, 0.1),
        spec("rightLowerLeg", { x: 0, y: 0, z: 0 }, 0.1),
        spec("leftLowerLeg", { x: 0, y: 0, z: 0 }, 0.1),
        spec("rightFoot", { x: 0, y: 0, z: 0 }, 0.1),
        spec("leftFoot", { x: 0, y: 0, z: 0 }, 0.1),
      ],
      standingPose: movementAvatarStandingPose({ armRaiseDepth, key: "armRaise" }),
      spineSpecs: [
        spineSpec("hips", { x: 0, y: 0, z: 0 }, 0.12),
        spineSpec("spine", { x: 0.02 + armRaiseDepth * 0.04, y: 0, z: 0 }, 0.12),
        spineSpec("chest", { x: 0.02 + armRaiseDepth * 0.04, y: 0, z: 0 }, 0.12),
      ],
    });
  }

  if (exercisePose.poseKey === "standing-twist") {
    const twistDepth = estimateMovementAvatarStandingTwistDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.02, y: -0.12 * twistDepth, z: -0.86 }, 0.2),
        armSpec("leftUpperArm", { x: 0.02, y: 0.12 * twistDepth, z: 0.86 }, 0.2),
        armSpec("rightLowerArm", { x: 0, y: -0.06 * twistDepth, z: -0.1 }, 0.18),
        armSpec("leftLowerArm", { x: 0, y: 0.06 * twistDepth, z: 0.1 }, 0.18),
      ],
      owner: "support-presentation-standing-twist",
      specs: [
        spec("rightUpperLeg", { x: 0.02, y: -0.02, z: -0.04 }, 0.12),
        spec("leftUpperLeg", { x: 0.02, y: 0.02, z: 0.04 }, 0.12),
        spec("rightLowerLeg", { x: 0, y: 0, z: 0.02 }, 0.1),
        spec("leftLowerLeg", { x: 0, y: 0, z: -0.02 }, 0.1),
        spec("rightFoot", { x: 0, y: 0, z: 0 }, 0.1),
        spec("leftFoot", { x: 0, y: 0, z: 0 }, 0.1),
      ],
      standingPose: movementAvatarStandingPose({ key: "standingTwist", twistDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0, y: 0.08 * twistDepth, z: 0.03 * twistDepth }, 0.16),
        spineSpec("spine", { x: 0.02, y: 0.42 * twistDepth, z: 0.1 * twistDepth }, 0.2),
        spineSpec("chest", { x: 0.02, y: 0.68 * twistDepth, z: 0.12 * twistDepth }, 0.22),
        spineSpec("upperChest", { x: 0, y: 0.48 * twistDepth, z: 0.08 * twistDepth }, 0.2),
      ],
    });
  }

  return null;
}
