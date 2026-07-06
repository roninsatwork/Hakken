import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarBridgeLiftDepth,
  estimateMovementAvatarDeadBugDepth,
  estimateMovementAvatarDeadBugSide,
  estimateMovementAvatarDoubleLegStretchDepth,
  estimateMovementAvatarHollowHoldDepth,
  estimateMovementAvatarPilatesHundredDepth,
  estimateMovementAvatarSingleLegStretchDepth,
  estimateMovementAvatarSingleLegStretchSide,
} from "./movementAvatarSupportPresentationEstimators";
import {
  emptyMovementAvatarFloorPose,
  movementAvatarFloorPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarSupineSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isBridge = exercisePose.poseKey === "pilates-bridge-prep";
  const isDeadBug = exercisePose.poseKey === "pilates-dead-bug-prep";
  const isDoubleLegStretch = exercisePose.poseKey === "pilates-double-leg-stretch-prep";
  const isHollowHold = exercisePose.poseKey === "pilates-hollow-hold-prep";
  const isHundred = exercisePose.poseKey === "pilates-hundred-prep";
  const isSingleLegStretch = exercisePose.poseKey === "pilates-single-leg-stretch-prep";
  const bridgeLiftDepth = isBridge
    ? estimateMovementAvatarBridgeLiftDepth(poseLandmarks)
    : 0;
  const bridgeUpperLegPitch = 0.48 + bridgeLiftDepth * 0.54;
  const bridgeLowerLegPitch = -0.62 - bridgeLiftDepth * 0.68;
  const bridgeHipPitch = -0.12 - bridgeLiftDepth * 0.24;
  const bridgeSpinePitch = -0.05 - bridgeLiftDepth * 0.11;
  const bridgeChestPitch = -0.02 - bridgeLiftDepth * 0.04;
  const pilatesHundredDepth = isHundred
    ? estimateMovementAvatarPilatesHundredDepth(poseLandmarks)
    : 0;
  const hundredUpperArmPitch = 0.02 + pilatesHundredDepth * 0.16;
  const hundredLowerArmPitch = -0.02 - pilatesHundredDepth * 0.08;
  const hundredUpperLegPitch = 0.24 + pilatesHundredDepth * 0.48;
  const hundredLowerLegPitch = -0.08 - pilatesHundredDepth * 0.24;
  const pilatesSingleLegStretchDepth = isSingleLegStretch
    ? estimateMovementAvatarSingleLegStretchDepth(poseLandmarks)
    : 0;
  const pilatesDoubleLegStretchDepth = isDoubleLegStretch
    ? estimateMovementAvatarDoubleLegStretchDepth(poseLandmarks)
    : 0;
  const pilatesDeadBugDepth = isDeadBug
    ? estimateMovementAvatarDeadBugDepth(poseLandmarks)
    : 0;
  const pilatesHollowHoldDepth = isHollowHold
    ? estimateMovementAvatarHollowHoldDepth(poseLandmarks)
    : 0;
  const deadBugLeftReach = estimateMovementAvatarDeadBugSide(poseLandmarks) ?? "leftArmRightLeg";
  const singleSide = estimateMovementAvatarSingleLegStretchSide(poseLandmarks);
  const singleLiftedSide = singleSide ?? "left";
  const singleReachSide = singleLiftedSide === "left" ? "right" : "left";
  const singleSign = singleLiftedSide === "left" ? 1 : -1;
  const singleLiftPitch = 0.46 + pilatesSingleLegStretchDepth * 0.62;
  const singleReachPitch = 0.08 + pilatesSingleLegStretchDepth * 0.08;
  const doubleArmPitch = -0.22 - pilatesDoubleLegStretchDepth * 0.36;
  const doubleLegPitch = 0.34 + pilatesDoubleLegStretchDepth * 0.46;
  const deadBugLiftPitch = 0.28 + pilatesDeadBugDepth * 0.54;
  const deadBugReachPitch = -0.18 - pilatesDeadBugDepth * 0.24;
  const hollowArmPitch = -0.12 - pilatesHollowHoldDepth * 0.28;
  const hollowLegPitch = 0.24 + pilatesHollowHoldDepth * 0.38;

  return decision({
    armSpecs: [
      armSpec("rightUpperArm", { x: isDoubleLegStretch ? doubleArmPitch : isHollowHold ? hollowArmPitch : isDeadBug && deadBugLeftReach === "rightArmLeftLeg" ? deadBugReachPitch : isHundred ? hundredUpperArmPitch : 0.02, y: 0, z: -0.58 }, 0.14),
      armSpec("leftUpperArm", { x: isDoubleLegStretch ? doubleArmPitch : isHollowHold ? hollowArmPitch : isDeadBug && deadBugLeftReach === "leftArmRightLeg" ? deadBugReachPitch : isHundred ? hundredUpperArmPitch : 0.02, y: 0, z: 0.58 }, 0.14),
      armSpec("rightLowerArm", { x: isDoubleLegStretch ? doubleArmPitch * 0.34 : isHollowHold ? hollowArmPitch * 0.35 : isDeadBug && deadBugLeftReach === "rightArmLeftLeg" ? deadBugReachPitch * 0.35 : isHundred ? hundredLowerArmPitch : 0, y: 0, z: -0.08 }, 0.14),
      armSpec("leftLowerArm", { x: isDoubleLegStretch ? doubleArmPitch * 0.34 : isHollowHold ? hollowArmPitch * 0.35 : isDeadBug && deadBugLeftReach === "leftArmRightLeg" ? deadBugReachPitch * 0.35 : isHundred ? hundredLowerArmPitch : 0, y: 0, z: 0.08 }, 0.14),
    ],
    owner: isHundred
      ? "support-presentation-hundred-prep"
      : isBridge
        ? "support-presentation-bridge"
        : isDeadBug
          ? "support-presentation-dead-bug"
          : isHollowHold
            ? "support-presentation-hollow-hold"
            : isSingleLegStretch
              ? "support-presentation-single-leg-stretch"
              : isDoubleLegStretch
                ? "support-presentation-double-leg-stretch"
                : "support-presentation-supine",
    floorPose: isBridge
      ? movementAvatarFloorPose({ bridgeLiftDepth, key: "bridge" })
      : isHundred
        ? movementAvatarFloorPose({ key: "pilatesHundred", pilatesHundredDepth })
        : isDeadBug
          ? movementAvatarFloorPose({ key: "pilatesDeadBug", pilatesDeadBugDepth })
          : isHollowHold
            ? movementAvatarFloorPose({ key: "pilatesHollowHold", pilatesHollowHoldDepth })
            : isSingleLegStretch
              ? movementAvatarFloorPose({ key: "pilatesSingleLegStretch", pilatesSingleLegStretchDepth })
              : isDoubleLegStretch
                ? movementAvatarFloorPose({ key: "pilatesDoubleLegStretch", pilatesDoubleLegStretchDepth })
                : emptyMovementAvatarFloorPose(),
    specs: [
      spec("rightUpperLeg", { x: isDoubleLegStretch ? doubleLegPitch : isHollowHold ? hollowLegPitch : isDeadBug ? (deadBugLeftReach === "leftArmRightLeg" ? deadBugLiftPitch : 0.16) : isSingleLegStretch ? (singleLiftedSide === "right" ? singleLiftPitch : singleReachPitch) : isHundred ? hundredUpperLegPitch : isBridge ? bridgeUpperLegPitch : 0.18, y: isSingleLegStretch ? -0.05 * singleSign : -0.04, z: isSingleLegStretch ? -0.16 * singleSign : -0.1 }, 0.18),
      spec("leftUpperLeg", { x: isDoubleLegStretch ? doubleLegPitch : isHollowHold ? hollowLegPitch : isDeadBug ? (deadBugLeftReach === "rightArmLeftLeg" ? deadBugLiftPitch : 0.16) : isSingleLegStretch ? (singleLiftedSide === "left" ? singleLiftPitch : singleReachPitch) : isHundred ? hundredUpperLegPitch : isBridge ? bridgeUpperLegPitch : 0.18, y: isSingleLegStretch ? 0.05 * singleSign : 0.04, z: isSingleLegStretch ? 0.16 * singleSign : 0.1 }, 0.18),
      spec("rightLowerLeg", { x: isDoubleLegStretch ? -0.2 - pilatesDoubleLegStretchDepth * 0.22 : isHollowHold ? -0.1 - pilatesHollowHoldDepth * 0.12 : isDeadBug ? (deadBugLeftReach === "leftArmRightLeg" ? -0.42 - pilatesDeadBugDepth * 0.22 : -0.08) : isSingleLegStretch ? (singleReachSide === "right" ? -0.06 : -0.52 - pilatesSingleLegStretchDepth * 0.28) : isHundred ? hundredLowerLegPitch : isBridge ? bridgeLowerLegPitch : -0.22, y: 0, z: 0.04 }, 0.18),
      spec("leftLowerLeg", { x: isDoubleLegStretch ? -0.2 - pilatesDoubleLegStretchDepth * 0.22 : isHollowHold ? -0.1 - pilatesHollowHoldDepth * 0.12 : isDeadBug ? (deadBugLeftReach === "rightArmLeftLeg" ? -0.42 - pilatesDeadBugDepth * 0.22 : -0.08) : isSingleLegStretch ? (singleReachSide === "left" ? -0.06 : -0.52 - pilatesSingleLegStretchDepth * 0.28) : isHundred ? hundredLowerLegPitch : isBridge ? bridgeLowerLegPitch : -0.22, y: 0, z: -0.04 }, 0.18),
      spec("rightFoot", { x: isBridge ? 0.08 : 0.02, y: 0, z: 0 }, 0.15),
      spec("leftFoot", { x: isBridge ? 0.08 : 0.02, y: 0, z: 0 }, 0.15),
    ],
    spineSpecs: [
      spineSpec("hips", { x: isBridge ? bridgeHipPitch : 0, y: 0, z: 0 }, 0.18),
      spineSpec("spine", { x: isBridge ? bridgeSpinePitch : (isSingleLegStretch || isDoubleLegStretch || isDeadBug || isHollowHold) ? 0.04 : 0.01, y: 0, z: 0 }, 0.16),
      spineSpec("chest", { x: isBridge ? bridgeChestPitch : (isSingleLegStretch || isDoubleLegStretch || isDeadBug || isHollowHold) ? 0.05 : 0.01, y: 0, z: 0 }, 0.16),
    ],
  });
}
