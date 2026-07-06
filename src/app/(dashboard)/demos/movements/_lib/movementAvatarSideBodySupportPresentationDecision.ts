import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarClamDepth,
  estimateMovementAvatarSideLegLiftDepth,
} from "./movementAvatarSupportPresentationEstimators";
import {
  emptyMovementAvatarFloorPose,
  movementAvatarFloorPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarSideBodySupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isClam = exercisePose.poseKey === "pilates-clam-prep";
  const isLegLift = exercisePose.poseKey === "pilates-side-lying-leg-lift";
  const pilatesClamDepth = isClam
    ? estimateMovementAvatarClamDepth(poseLandmarks)
    : 0;
  const sideLegLiftDepth = isLegLift
    ? estimateMovementAvatarSideLegLiftDepth(poseLandmarks)
    : 0;
  const sideLiftUpperLegPitch = -0.02 - sideLegLiftDepth * 0.26;
  const sideLiftUpperLegSide = -0.08 - sideLegLiftDepth * 0.16;
  const sideLiftLowerLegPitch = -0.02 + sideLegLiftDepth * 0.16;
  const sideLiftHipRoll = 0.04 + sideLegLiftDepth * 0.08;
  const sideLiftSpineRoll = 0.05 + sideLegLiftDepth * 0.08;
  const sideLiftChestRoll = 0.04 + sideLegLiftDepth * 0.07;
  const clamUpperLegSide = -0.1 - pilatesClamDepth * 0.28;
  const clamLowerLegSide = 0.02 + pilatesClamDepth * 0.12;

  return decision({
    armSpecs: [
      armSpec("rightUpperArm", { x: 0.1, y: 0, z: -0.32 }, 0.14),
      armSpec("leftUpperArm", { x: 0.1, y: 0, z: 0.68 }, 0.14),
      armSpec("leftLowerArm", { x: 0, y: 0, z: 0.18 }, 0.14),
    ],
    owner: isClam
      ? "support-presentation-clam-prep"
      : isLegLift ? "support-presentation-side-leg-lift" : "support-presentation-side-lying",
    floorPose: isLegLift
      ? movementAvatarFloorPose({ key: "sideLegLift", sideLegLiftDepth })
      : isClam
        ? movementAvatarFloorPose({ key: "pilatesClam", pilatesClamDepth })
        : emptyMovementAvatarFloorPose(),
    specs: [
      spec("rightUpperLeg", { x: isLegLift ? sideLiftUpperLegPitch : 0.02, y: isLegLift ? sideLiftUpperLegSide : isClam ? clamUpperLegSide : -0.12, z: -0.18 }, 0.18),
      spec("leftUpperLeg", { x: 0.04, y: 0.1, z: 0.16 }, 0.18),
      spec("rightLowerLeg", { x: isLegLift ? sideLiftLowerLegPitch : -0.04, y: isClam ? clamLowerLegSide : 0, z: 0.04 }, 0.16),
      spec("leftLowerLeg", { x: -0.06, y: 0, z: -0.04 }, 0.16),
      spec("rightFoot", { x: 0.02, y: 0, z: 0 }, 0.14),
      spec("leftFoot", { x: 0.02, y: 0, z: 0 }, 0.14),
    ],
    spineSpecs: [
      spineSpec("hips", { x: 0, y: 0, z: isLegLift ? sideLiftHipRoll : 0.04 }, 0.16),
      spineSpec("spine", { x: 0.02, y: 0, z: isLegLift ? sideLiftSpineRoll : 0.05 }, 0.16),
      spineSpec("chest", { x: 0.02, y: 0, z: isLegLift ? sideLiftChestRoll : 0.04 }, 0.16),
    ],
  });
}
