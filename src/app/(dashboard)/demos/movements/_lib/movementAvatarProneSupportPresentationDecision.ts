import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarProneExtensionDepth,
  estimateMovementAvatarSwimmingDepth,
} from "./movementAvatarSupportPresentationEstimators";
import {
  emptyMovementAvatarFloorPose,
  movementAvatarFloorPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarProneSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isExtension = exercisePose.poseKey === "prone-back-extension-prep";
  const isSwimming = exercisePose.poseKey === "pilates-swimming-prep";
  const proneExtensionDepth = isExtension
    ? estimateMovementAvatarProneExtensionDepth(poseLandmarks)
    : 0;
  const pilatesSwimmingDepth = isSwimming
    ? estimateMovementAvatarSwimmingDepth(poseLandmarks)
    : 0;
  const extensionUpperArmPitch = 0.24 + proneExtensionDepth * 0.34;
  const extensionLowerArmPitch = -0.34 - proneExtensionDepth * 0.5;
  const extensionUpperLegPitch = -0.04 - proneExtensionDepth * 0.12;
  const extensionLowerLegPitch = 0.04 + proneExtensionDepth * 0.18;
  const extensionHipPitch = -0.02 - proneExtensionDepth * 0.08;
  const extensionSpinePitch = -0.06 - proneExtensionDepth * 0.16;
  const extensionChestPitch = -0.08 - proneExtensionDepth * 0.22;
  const extensionUpperChestPitch = -0.06 - proneExtensionDepth * 0.15;
  const swimmingReachPitch = 0.2 + pilatesSwimmingDepth * 0.38;
  const swimmingLegPitch = -0.04 - pilatesSwimmingDepth * 0.16;

  return decision({
    armSpecs: isExtension
      ? [
          armSpec("rightUpperArm", { x: extensionUpperArmPitch, y: 0, z: -0.35 }, 0.18),
          armSpec("rightLowerArm", { x: extensionLowerArmPitch, y: 0, z: -0.08 }, 0.18),
          armSpec("leftUpperArm", { x: extensionUpperArmPitch, y: 0, z: 0.35 }, 0.18),
          armSpec("leftLowerArm", { x: extensionLowerArmPitch, y: 0, z: 0.08 }, 0.18),
        ]
      : isSwimming
        ? [
            armSpec("rightUpperArm", { x: 0.18, y: 0, z: -0.32 }, 0.16),
            armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
            armSpec("leftUpperArm", { x: swimmingReachPitch, y: 0, z: 0.24 }, 0.18),
            armSpec("leftLowerArm", { x: 0.04 + pilatesSwimmingDepth * 0.08, y: 0, z: 0.04 }, 0.14),
          ]
        : [
            armSpec("rightUpperArm", { x: 0.2, y: 0, z: -0.42 }, 0.14),
            armSpec("leftUpperArm", { x: 0.2, y: 0, z: 0.42 }, 0.14),
          ],
    owner: isExtension
      ? "support-presentation-prone-extension"
      : isSwimming ? "support-presentation-swimming-prep" : "support-presentation-prone",
    floorPose: isExtension
      ? movementAvatarFloorPose({ key: "proneExtension", proneExtensionDepth })
      : isSwimming
        ? movementAvatarFloorPose({ key: "pilatesSwimming", pilatesSwimmingDepth })
        : emptyMovementAvatarFloorPose(),
    specs: [
      spec("rightUpperLeg", { x: isSwimming ? swimmingLegPitch : isExtension ? extensionUpperLegPitch : -0.04, y: -0.02, z: -0.05 }, 0.16),
      spec("leftUpperLeg", { x: isSwimming ? -0.02 : isExtension ? extensionUpperLegPitch : -0.04, y: 0.02, z: 0.05 }, 0.16),
      spec("rightLowerLeg", { x: isSwimming ? 0.08 + pilatesSwimmingDepth * 0.16 : isExtension ? extensionLowerLegPitch : 0.04, y: 0, z: 0.03 }, 0.16),
      spec("leftLowerLeg", { x: isExtension ? extensionLowerLegPitch : 0.04, y: 0, z: -0.03 }, 0.16),
      spec("rightFoot", { x: -0.08, y: 0, z: 0 }, 0.14),
      spec("leftFoot", { x: -0.08, y: 0, z: 0 }, 0.14),
    ],
    spineSpecs: [
      spineSpec("hips", { x: isExtension ? extensionHipPitch : 0, y: 0, z: 0 }, 0.16),
      spineSpec("spine", { x: isExtension ? extensionSpinePitch : 0.01, y: 0, z: 0 }, 0.18),
      spineSpec("chest", { x: isExtension ? extensionChestPitch : 0.01, y: 0, z: 0 }, 0.18),
      spineSpec("upperChest", { x: isExtension ? extensionUpperChestPitch : 0.01, y: 0, z: 0 }, 0.16),
    ],
  });
}
