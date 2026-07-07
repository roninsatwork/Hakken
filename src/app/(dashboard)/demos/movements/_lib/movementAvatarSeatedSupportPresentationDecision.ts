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

const SEATED_BODY_PROOF_SLERP = 1;
const SEATED_SPINE_PROOF_SLERP = 1;
const SEATED_ARM_PROOF_SLERP = 0.86;

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
      armSpec("rightUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: -0.86 }, SEATED_ARM_PROOF_SLERP),
      armSpec("leftUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: 0.86 }, SEATED_ARM_PROOF_SLERP),
      armSpec("rightLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: -0.1 }, SEATED_ARM_PROOF_SLERP),
      armSpec("leftLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: 0.1 }, SEATED_ARM_PROOF_SLERP),
    ],
    owner: isSeatedTwist
      ? "support-presentation-seated-twist"
      : isSeatedForwardFold
        ? "support-presentation-seated-forward-fold"
        : isSeatedLegLift ? "support-presentation-seated-leg-lift" : "support-presentation-seated",
    specs: [
      spec("rightUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedUpperLegPitch : 1.42, y: -0.08, z: isSeatedLegLift ? -0.12 - 0.08 * seatedLegLiftSign : -0.12 }, SEATED_BODY_PROOF_SLERP),
      spec("leftUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedUpperLegPitch : 1.42, y: 0.08, z: isSeatedLegLift ? 0.12 - 0.08 * seatedLegLiftSign : 0.12 }, SEATED_BODY_PROOF_SLERP),
      spec("rightLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedLowerLegPitch : -1.22, y: 0, z: 0.05 }, SEATED_BODY_PROOF_SLERP),
      spec("leftLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedLowerLegPitch : -1.22, y: 0, z: -0.05 }, SEATED_BODY_PROOF_SLERP),
      spec("rightFoot", { x: isSeatedLegLift && liftedSeatedSide === "right" ? 0.02 : 0.12, y: 0, z: 0 }, SEATED_BODY_PROOF_SLERP),
      spec("leftFoot", { x: isSeatedLegLift && liftedSeatedSide === "left" ? 0.02 : 0.12, y: 0, z: 0 }, SEATED_BODY_PROOF_SLERP),
    ],
    spineSpecs: [
      spineSpec("hips", { x: isSeatedForwardFold ? 0.02 + seatedFoldDepth * 0.18 : -0.04, y: 0, z: 0 }, SEATED_SPINE_PROOF_SLERP),
      spineSpec("spine", { x: isSeatedForwardFold ? 0.18 + seatedFoldDepth * 0.34 : 0.08, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.08 : 0 }, SEATED_SPINE_PROOF_SLERP),
      spineSpec("chest", { x: isSeatedForwardFold ? 0.16 + seatedFoldDepth * 0.28 : 0.08, y: isSeatedTwist ? 0.28 : 0, z: isSeatedTwist ? 0.1 : 0 }, SEATED_SPINE_PROOF_SLERP),
      spineSpec("upperChest", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.16 : 0.04, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.06 : 0 }, SEATED_SPINE_PROOF_SLERP),
    ],
  });
}
