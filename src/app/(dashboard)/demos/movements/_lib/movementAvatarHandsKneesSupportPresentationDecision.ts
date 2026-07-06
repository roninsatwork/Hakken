import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarCatDepth,
  estimateMovementAvatarChildFoldDepth,
  estimateMovementAvatarCowDepth,
} from "./movementAvatarSupportPresentationEstimators";
import {
  emptyMovementAvatarFloorPose,
  movementAvatarFloorPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarHandsKneesSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isBirdDog = exercisePose.poseKey === "quadruped-bird-dog-prep";
  const isCat = exercisePose.poseKey === "yoga-cat-prep";
  const isChildPose = exercisePose.poseKey === "yoga-child-pose-prep";
  const isCow = exercisePose.poseKey === "yoga-cow-prep";
  const childFoldDepth = isChildPose
    ? estimateMovementAvatarChildFoldDepth(poseLandmarks)
    : 0;
  const catDepth = isCat ? estimateMovementAvatarCatDepth(poseLandmarks) : 0;
  const cowDepth = isCow ? estimateMovementAvatarCowDepth(poseLandmarks) : 0;
  const childUpperLegPitch = 0.72 + childFoldDepth * 0.58;
  const childLowerLegPitch = -1.12 - childFoldDepth * 0.68;
  const childHipPitch = 0.04 + childFoldDepth * 0.24;
  const childSpinePitch = 0.1 + childFoldDepth * 0.28;
  const childChestPitch = 0.08 + childFoldDepth * 0.22;
  const quadrupedUpperArmPitch = isChildPose
    ? 0.48 + childFoldDepth * 0.28
    : isCat ? 0.62 + catDepth * 0.08 : isCow ? 0.7 - cowDepth * 0.06 : 0.68;
  const quadrupedLowerArmPitch = isChildPose
    ? 0.12 + childFoldDepth * 0.12
    : isCat ? 0.2 + catDepth * 0.08 : isCow ? 0.14 : 0.18;
  const quadrupedHipPitch = isChildPose
    ? childHipPitch
    : isCat ? 0.08 + catDepth * 0.18 : isCow ? -0.12 - cowDepth * 0.14 : -0.06;
  const quadrupedSpinePitch = isChildPose
    ? childSpinePitch
    : isCat ? 0.16 + catDepth * 0.36 : isCow ? -0.08 - cowDepth * 0.28 : isBirdDog ? 0.08 : 0.04;
  const quadrupedChestPitch = isChildPose
    ? childChestPitch
    : isCat ? 0.14 + catDepth * 0.32 : isCow ? -0.12 - cowDepth * 0.34 : isBirdDog ? 0.1 : 0.05;

  return decision({
    armSpecs: isBirdDog
      ? [
          armSpec("rightUpperArm", { x: 0.62, y: 0, z: -0.42 }, 0.18),
          armSpec("rightLowerArm", { x: 0.16, y: 0, z: -0.1 }, 0.16),
          armSpec("leftUpperArm", { x: -0.82, y: 0.06, z: 0.18 }, 0.2),
          armSpec("leftLowerArm", { x: -0.18, y: 0, z: 0.04 }, 0.18),
          armSpec("leftHand", { x: 0, y: 0, z: 0 }, 0.14),
        ]
      : [
          armSpec("rightUpperArm", { x: quadrupedUpperArmPitch, y: 0, z: -0.44 }, 0.18),
          armSpec("rightLowerArm", { x: quadrupedLowerArmPitch, y: 0, z: -0.1 }, 0.16),
          armSpec("leftUpperArm", { x: quadrupedUpperArmPitch, y: 0, z: 0.44 }, 0.18),
          armSpec("leftLowerArm", { x: quadrupedLowerArmPitch, y: 0, z: 0.1 }, 0.16),
        ],
    owner: isChildPose
      ? "support-presentation-child-pose"
      : isCat
        ? "support-presentation-yoga-cat"
        : isCow ? "support-presentation-yoga-cow" : isBirdDog ? "support-presentation-bird-dog" : "support-presentation-all-fours",
    floorPose: isChildPose
      ? movementAvatarFloorPose({ childFoldDepth, key: "childPose" })
      : isCat
        ? movementAvatarFloorPose({ catDepth, key: "cat" })
        : isCow
          ? movementAvatarFloorPose({ cowDepth, key: "cow" })
          : emptyMovementAvatarFloorPose(),
    specs: [
      spec("rightUpperLeg", { x: isChildPose ? childUpperLegPitch : isBirdDog ? -0.18 : 0.72, y: -0.08, z: -0.1 }, 0.2),
      spec("leftUpperLeg", { x: isChildPose ? childUpperLegPitch : 0.76, y: 0.08, z: 0.1 }, 0.2),
      spec("rightLowerLeg", { x: isChildPose ? childLowerLegPitch : isBirdDog ? 0.18 : -1.38, y: 0, z: 0.04 }, 0.2),
      spec("leftLowerLeg", { x: isChildPose ? childLowerLegPitch : -1.38, y: 0, z: -0.04 }, 0.2),
      spec("rightFoot", { x: isBirdDog ? 0.08 : -0.28, y: 0, z: 0 }, 0.16),
      spec("leftFoot", { x: -0.28, y: 0, z: 0 }, 0.16),
    ],
    spineSpecs: [
      spineSpec("hips", { x: quadrupedHipPitch, y: 0, z: 0 }, 0.16),
      spineSpec("spine", { x: quadrupedSpinePitch, y: 0, z: 0 }, 0.16),
      spineSpec("chest", { x: quadrupedChestPitch, y: 0, z: 0 }, 0.16),
    ],
  });
}
