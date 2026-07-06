import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  estimateMovementAvatarBearCrawlDepth,
  estimateMovementAvatarDownDogPikeDepth,
  estimateMovementAvatarPlankLineDepth,
} from "./movementAvatarSupportPresentationEstimators";
import {
  movementAvatarFloorPose,
  movementAvatarSupportPresentationArmSpec as armSpec,
  movementAvatarSupportPresentationDecision as decision,
  movementAvatarSupportPresentationSpec as spec,
  movementAvatarSupportPresentationSpineSpec as spineSpec,
} from "./movementAvatarSupportPresentationDecisionBuilders";

export function resolveMovementAvatarHandsFeetSupportPresentationPose({
  exercisePose,
  poseLandmarks,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
}): MovementAvatarSupportPresentationDecision {
  const isDownDog = exercisePose.poseKey === "yoga-down-dog-prep";
  const isBearCrawl = exercisePose.poseKey === "bear-crawl-prep";
  const plankLineDepth = !isDownDog && !isBearCrawl
    ? estimateMovementAvatarPlankLineDepth(poseLandmarks)
    : 0;
  const downDogPikeDepth = isDownDog
    ? estimateMovementAvatarDownDogPikeDepth(poseLandmarks)
    : 0;
  const bearCrawlDepth = isBearCrawl
    ? estimateMovementAvatarBearCrawlDepth(poseLandmarks)
    : 0;
  const armReachDepth = Math.max(plankLineDepth, downDogPikeDepth, bearCrawlDepth);
  const upperArmPitch = isDownDog
    ? 0.58 + downDogPikeDepth * 0.48
    : isBearCrawl ? 0.38 + bearCrawlDepth * 0.3 : 0.46 + plankLineDepth * 0.32;
  const lowerArmPitch = isDownDog
    ? 0.04 + downDogPikeDepth * 0.12
    : 0.08 + armReachDepth * 0.12;
  const upperLegPitch = isDownDog
    ? -0.08 - downDogPikeDepth * 0.32
    : isBearCrawl ? 0.18 + bearCrawlDepth * 0.38 : -0.04 - plankLineDepth * 0.08;
  const lowerLegPitch = isDownDog
    ? 0.08 + downDogPikeDepth * 0.24
    : isBearCrawl ? -0.38 - bearCrawlDepth * 0.56 : 0.02 + plankLineDepth * 0.06;
  const footPitch = isDownDog
    ? -0.08 - downDogPikeDepth * 0.16
    : 0.02;
  const hipPitch = isDownDog
    ? -0.08 - downDogPikeDepth * 0.24
    : isBearCrawl ? -0.02 + bearCrawlDepth * 0.06 : -0.04 - plankLineDepth * 0.06;
  const spinePitch = isDownDog
    ? 0.03 + downDogPikeDepth * 0.08
    : 0.02 + armReachDepth * 0.02;
  const chestPitch = isDownDog
    ? 0.04 + downDogPikeDepth * 0.09
    : 0.02 + armReachDepth * 0.03;

  return decision({
    armSpecs: [
      armSpec("rightUpperArm", { x: upperArmPitch, y: 0, z: -0.36 }, 0.18),
      armSpec("rightLowerArm", { x: lowerArmPitch, y: 0, z: -0.08 }, 0.16),
      armSpec("leftUpperArm", { x: upperArmPitch, y: 0, z: 0.36 }, 0.18),
      armSpec("leftLowerArm", { x: lowerArmPitch, y: 0, z: 0.08 }, 0.16),
    ],
    owner: isDownDog
      ? "support-presentation-down-dog"
      : isBearCrawl ? "support-presentation-bear-crawl" : "support-presentation-plank",
    floorPose: isDownDog
      ? movementAvatarFloorPose({ downDogPikeDepth, key: "downDog" })
      : isBearCrawl
        ? movementAvatarFloorPose({ bearCrawlDepth, key: "bearCrawl" })
        : movementAvatarFloorPose({ key: "plank", plankLineDepth }),
    specs: [
      spec("rightUpperLeg", { x: upperLegPitch, y: -0.04, z: -0.04 }, 0.18),
      spec("leftUpperLeg", { x: upperLegPitch, y: 0.04, z: 0.04 }, 0.18),
      spec("rightLowerLeg", { x: lowerLegPitch, y: 0, z: 0.02 }, 0.16),
      spec("leftLowerLeg", { x: lowerLegPitch, y: 0, z: -0.02 }, 0.16),
      spec("rightFoot", { x: footPitch, y: 0, z: 0 }, 0.14),
      spec("leftFoot", { x: footPitch, y: 0, z: 0 }, 0.14),
    ],
    spineSpecs: [
      spineSpec("hips", { x: hipPitch, y: 0, z: 0 }, 0.16),
      spineSpec("spine", { x: spinePitch, y: 0, z: 0 }, 0.16),
      spineSpec("chest", { x: chestPitch, y: 0, z: 0 }, 0.16),
    ],
  });
}
