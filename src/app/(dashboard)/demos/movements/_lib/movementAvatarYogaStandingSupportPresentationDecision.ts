import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import {
  estimateMovementAvatarTreePose,
  estimateMovementAvatarTrianglePose,
  estimateMovementAvatarWarriorOneDepth,
  estimateMovementAvatarWarriorTwoDepth,
} from "./movementAvatarSupportPresentationEstimators";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  movementAvatarStandingPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarYogaStandingSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision | null {
  if (exercisePose.poseKey === "yoga-tree-prep") {
    const { depth: treeDepth, side } = estimateMovementAvatarTreePose(poseLandmarks);
    const liftedSide = side ?? "left";
    const plantedSide = liftedSide === "left" ? "right" : "left";
    const liftedSign = liftedSide === "left" ? 1 : -1;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: -0.52 - treeDepth * 0.2, y: 0, z: -0.18 }, 0.18),
        armSpec("leftUpperArm", { x: -0.52 - treeDepth * 0.2, y: 0, z: 0.18 }, 0.18),
        armSpec("rightLowerArm", { x: -0.1 - treeDepth * 0.12, y: 0, z: -0.04 }, 0.16),
        armSpec("leftLowerArm", { x: -0.1 - treeDepth * 0.12, y: 0, z: 0.04 }, 0.16),
      ],
      owner: "support-presentation-yoga-tree",
      specs: [
        spec(`${liftedSide}UpperLeg`, { x: 0.58 + treeDepth * 0.42, y: 0.12 * liftedSign, z: 0.42 * liftedSign }, 0.2),
        spec(`${liftedSide}LowerLeg`, { x: -0.72 - treeDepth * 0.36, y: 0, z: -0.18 * liftedSign }, 0.2),
        spec(`${liftedSide}Foot`, { x: 0.08, y: 0, z: 0.16 * liftedSign }, 0.16),
        spec(`${plantedSide}UpperLeg`, { x: 0, y: 0, z: -0.04 * liftedSign }, 0.12),
        spec(`${plantedSide}LowerLeg`, { x: 0, y: 0, z: 0.02 * liftedSign }, 0.12),
        spec(`${plantedSide}Foot`, { x: 0, y: 0, z: 0 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ key: "tree", treeDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0, y: 0, z: 0.04 * liftedSign * treeDepth }, 0.14),
        spineSpec("spine", { x: 0.03, y: 0, z: -0.03 * liftedSign * treeDepth }, 0.14),
        spineSpec("chest", { x: 0.03, y: 0, z: -0.02 * liftedSign * treeDepth }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "yoga-warrior-one-prep") {
    const warriorOneDepth = estimateMovementAvatarWarriorOneDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: -0.58 - warriorOneDepth * 0.18, y: 0, z: -0.16 }, 0.18),
        armSpec("leftUpperArm", { x: -0.58 - warriorOneDepth * 0.18, y: 0, z: 0.16 }, 0.18),
        armSpec("rightLowerArm", { x: -0.14 - warriorOneDepth * 0.12, y: 0, z: -0.04 }, 0.16),
        armSpec("leftLowerArm", { x: -0.14 - warriorOneDepth * 0.12, y: 0, z: 0.04 }, 0.16),
      ],
      owner: "support-presentation-yoga-warrior-one",
      specs: [
        spec("rightUpperLeg", { x: 0.28 + warriorOneDepth * 0.58, y: -0.04, z: -0.18 }, 0.18),
        spec("leftUpperLeg", { x: 0.12 + warriorOneDepth * 0.22, y: 0.04, z: 0.14 }, 0.18),
        spec("rightLowerLeg", { x: -0.2 - warriorOneDepth * 0.34, y: 0, z: 0.03 }, 0.16),
        spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.03 }, 0.14),
        spec("rightFoot", { x: 0.08, y: 0.08, z: -0.06 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.08, z: 0.06 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ key: "warriorOne", warriorOneDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0.04, y: 0.02, z: 0 }, 0.14),
        spineSpec("spine", { x: 0.08 + warriorOneDepth * 0.08, y: 0.02, z: 0 }, 0.14),
        spineSpec("chest", { x: 0.08 + warriorOneDepth * 0.08, y: 0.02, z: 0 }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "yoga-triangle-prep") {
    const { depth: triangleDepth, side } = estimateMovementAvatarTrianglePose(poseLandmarks);
    const sign = side === "left" ? 1 : -1;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: side === "right" ? -0.62 : 0.42, y: 0, z: -0.74 }, 0.18),
        armSpec("leftUpperArm", { x: side === "left" ? -0.62 : 0.42, y: 0, z: 0.74 }, 0.18),
        armSpec("rightLowerArm", { x: side === "right" ? -0.08 : 0.18, y: 0, z: -0.08 }, 0.16),
        armSpec("leftLowerArm", { x: side === "left" ? -0.08 : 0.18, y: 0, z: 0.08 }, 0.16),
      ],
      owner: "support-presentation-yoga-triangle",
      specs: [
        spec("rightUpperLeg", { x: 0.08 + triangleDepth * 0.14, y: -0.08, z: -0.24 }, 0.18),
        spec("leftUpperLeg", { x: 0.08 + triangleDepth * 0.14, y: 0.08, z: 0.24 }, 0.18),
        spec("rightLowerLeg", { x: -0.04, y: 0, z: 0.06 }, 0.14),
        spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.06 }, 0.14),
        spec("rightFoot", { x: 0.02, y: 0.1, z: -0.1 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.1, z: 0.1 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ key: "triangle", triangleDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0.04, y: 0.08 * sign, z: 0.18 * sign * triangleDepth }, 0.16),
        spineSpec("spine", { x: 0.08, y: 0.14 * sign, z: 0.34 * sign * triangleDepth }, 0.16),
        spineSpec("chest", { x: 0.08, y: 0.16 * sign, z: 0.42 * sign * triangleDepth }, 0.16),
        spineSpec("upperChest", { x: 0.04, y: 0.12 * sign, z: 0.24 * sign * triangleDepth }, 0.14),
      ],
    });
  }

  if (exercisePose.poseKey === "yoga-warrior-two-prep") {
    const warriorDepth = estimateMovementAvatarWarriorTwoDepth(poseLandmarks);

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.02, y: 0, z: -0.92 }, 0.18),
        armSpec("leftUpperArm", { x: 0.02, y: 0, z: 0.92 }, 0.18),
        armSpec("rightLowerArm", { x: 0, y: 0, z: -0.04 }, 0.16),
        armSpec("leftLowerArm", { x: 0, y: 0, z: 0.04 }, 0.16),
      ],
      owner: "support-presentation-yoga-warrior-two",
      specs: [
        spec("rightUpperLeg", { x: 0.22 + warriorDepth * 0.42, y: -0.08, z: -0.28 }, 0.18),
        spec("leftUpperLeg", { x: 0.08 + warriorDepth * 0.18, y: 0.08, z: 0.22 }, 0.18),
        spec("rightLowerLeg", { x: -0.18 - warriorDepth * 0.24, y: 0, z: 0.04 }, 0.16),
        spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.04 }, 0.14),
        spec("rightFoot", { x: 0.08, y: 0.12, z: -0.08 }, 0.12),
        spec("leftFoot", { x: 0.02, y: -0.12, z: 0.08 }, 0.12),
      ],
      standingPose: movementAvatarStandingPose({ key: "warriorTwo", warriorDepth }),
      spineSpecs: [
        spineSpec("hips", { x: 0.02, y: 0.08, z: 0 }, 0.14),
        spineSpec("spine", { x: 0.04, y: 0.12, z: 0 }, 0.14),
        spineSpec("chest", { x: 0.04, y: 0.16, z: 0 }, 0.14),
      ],
    });
  }

  return null;
}
