import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarSeatedForwardFoldDepth,
  estimateMovementAvatarSeatedLegLift,
} from "./movementAvatarSupportPresentationEstimators";
import {
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarSeatedSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isSeatedForwardFold = exercisePose.poseKey === "seated-forward-fold";
  const isSeatedLegLift = exercisePose.poseKey === "seated-leg-lift";
  const isSeatedTwist = exercisePose.poseKey === "seated-twist";
  const seatedFoldDepth = isSeatedForwardFold
    ? estimateMovementAvatarSeatedForwardFoldDepth(poseLandmarks)
    : 0;
  const { depth: seatedLegLiftDepth, side: seatedLegLiftSide } = estimateMovementAvatarSeatedLegLift(poseLandmarks);
  const liftedSeatedSide = seatedLegLiftSide ?? "right";
  const seatedLegLiftSign = liftedSeatedSide === "left" ? 1 : -1;
  const seatedUpperLegPitch = 1.42 - seatedLegLiftDepth * 0.16;
  const seatedLowerLegPitch = -1.22 + seatedLegLiftDepth * 0.72;

  return decision({
    armSpecs: [
      armSpec("rightUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: -0.86 }, 0.14),
      armSpec("leftUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: 0.86 }, 0.14),
      armSpec("rightLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: -0.1 }, 0.14),
      armSpec("leftLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: 0.1 }, 0.14),
    ],
    owner: isSeatedTwist
      ? "support-presentation-seated-twist"
      : isSeatedForwardFold
        ? "support-presentation-seated-forward-fold"
        : isSeatedLegLift ? "support-presentation-seated-leg-lift" : "support-presentation-seated",
    specs: [
      spec("rightUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedUpperLegPitch : 1.42, y: -0.08, z: isSeatedLegLift ? -0.12 - 0.08 * seatedLegLiftSign : -0.12 }, 0.2),
      spec("leftUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedUpperLegPitch : 1.42, y: 0.08, z: isSeatedLegLift ? 0.12 - 0.08 * seatedLegLiftSign : 0.12 }, 0.2),
      spec("rightLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedLowerLegPitch : -1.22, y: 0, z: 0.05 }, 0.2),
      spec("leftLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedLowerLegPitch : -1.22, y: 0, z: -0.05 }, 0.2),
      spec("rightFoot", { x: isSeatedLegLift && liftedSeatedSide === "right" ? 0.02 : 0.12, y: 0, z: 0 }, 0.16),
      spec("leftFoot", { x: isSeatedLegLift && liftedSeatedSide === "left" ? 0.02 : 0.12, y: 0, z: 0 }, 0.16),
    ],
    spineSpecs: [
      spineSpec("hips", { x: isSeatedForwardFold ? 0.02 + seatedFoldDepth * 0.18 : -0.04, y: 0, z: 0 }, 0.16),
      spineSpec("spine", { x: isSeatedForwardFold ? 0.18 + seatedFoldDepth * 0.34 : 0.08, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.08 : 0 }, 0.16),
      spineSpec("chest", { x: isSeatedForwardFold ? 0.16 + seatedFoldDepth * 0.28 : 0.08, y: isSeatedTwist ? 0.28 : 0, z: isSeatedTwist ? 0.1 : 0 }, 0.16),
      spineSpec("upperChest", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.16 : 0.04, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.06 : 0 }, 0.14),
    ],
  });
}
