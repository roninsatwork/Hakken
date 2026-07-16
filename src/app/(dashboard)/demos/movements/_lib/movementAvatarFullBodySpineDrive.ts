import { buildMovementSpineModel } from "./movementSpineMetrics";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementLandmark } from "./movementTypes";
import type { MovementAnatomicalMapping } from "./movementMirrorMapping";
import { applyMovementAnatomicalMappingToPlayerSpineDrive } from "./movementAvatarPlayerSpineDriveMapping";
import {
  movementAvatarForwardPresentationDrive,
  resolveMovementAvatarSourceForwardLean,
} from "./movementAvatarSpineGeometry";
import {
  capRecordedPresentationSideBend,
  capLivePresentationSideBend,
  clamp,
  NEUTRAL_PLAYER_SPINE_DRIVE,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerSpineDriveShared";

export function resolveMovementAvatarFullBodySpineDrive({
  anatomicalMapping = "identity",
  kneeLift,
  ownerRole,
  poseLandmarks,
  retargetCalibration,
  worldPoseLandmarks,
}: {
  anatomicalMapping?: MovementAnatomicalMapping;
  kneeLift?: { left: number; right: number } | null;
  ownerRole: "instructor" | "player";
  poseLandmarks: MovementLandmark[];
  retargetCalibration: MovementRetargetSourceModel;
  worldPoseLandmarks?: MovementLandmark[] | null;
}): MovementAvatarPlayerSpineDrive {
  const spineModel = buildMovementSpineModel(poseLandmarks);
  if (!spineModel || spineModel.confidence < 0.35) {
    return {
      ...NEUTRAL_PLAYER_SPINE_DRIVE,
      confidence: spineModel?.confidence ?? 0,
      owner: ownerRole === "player" ? "player-spine-held" : "recorded-spine-held",
    };
  }

  const neutralSideBend = retargetCalibration.shoulderCenter.x - retargetCalibration.hipCenter.x;
  const sideBend = clamp((spineModel.torsoSideBend - neutralSideBend) / 0.16, -1, 1);
  const worldSpineModel = buildMovementSpineModel(worldPoseLandmarks);
  const semanticNeutralTorso = retargetCalibration.semanticNeutral?.torsoDirection;
  const canUseWorldTorso = Boolean(
    worldSpineModel &&
    worldSpineModel.confidence >= 0.35 &&
    semanticNeutralTorso,
  );
  const forwardLean = clamp(resolveMovementAvatarSourceForwardLean(canUseWorldTorso
    ? {
        // MediaPipe world landmarks use y-down/z-camera coordinates. Convert
        // them to the same avatar space as semanticNeutral before resolving
        // the signed sagittal delta. Image z is only a relative depth hint and
        // can carry the opposite sign during a real forward hinge.
        current: {
          x: worldSpineModel!.torsoSideBend,
          y: -worldSpineModel!.torsoLean,
          z: -worldSpineModel!.torsoDepthLean,
        },
        neutral: semanticNeutralTorso!,
      }
    : {
        current: {
          x: spineModel.torsoSideBend,
          y: spineModel.torsoLean,
          z: spineModel.torsoDepthLean,
        },
        neutral: {
          x: neutralSideBend,
          y: retargetCalibration.shoulderCenter.y - retargetCalibration.hipCenter.y,
          z: retargetCalibration.shoulderCenter.z - retargetCalibration.hipCenter.z,
        },
      }), -1, 1);
  const presentationForwardLean = movementAvatarForwardPresentationDrive(forwardLean);
  const hasSingleLegAsymmetry = kneeLift
    ? Math.abs(kneeLift.left - kneeLift.right) > 0.04
    : false;
  const presentationSideBend = hasSingleLegAsymmetry
    ? capRecordedPresentationSideBend(sideBend, kneeLift)
    : capLivePresentationSideBend(sideBend);
  const twist = clamp(spineModel.shoulderHipRotation / 0.65, -1, 1);
  const activity = Math.max(Math.abs(sideBend), Math.abs(forwardLean), Math.abs(twist));
  const owner = `${ownerRole === "player" ? "player" : "recorded"}-spine-${activity >= 0.06 ? "model" : "neutral"}` as const;

  return applyMovementAnatomicalMappingToPlayerSpineDrive({
    confidence: spineModel.confidence,
    forwardLean,
    owner,
    rotations: {
      hips: { x: -presentationForwardLean * 0.08, y: twist * 0.04, z: 0 },
      spine: { x: -presentationForwardLean * 0.32, y: twist * 0.08, z: presentationSideBend * 1.1 },
      chest: { x: -presentationForwardLean * 0.52, y: twist * 0.12, z: presentationSideBend * 1.55 },
      upperChest: { x: -presentationForwardLean * 0.38, y: twist * 0.1, z: presentationSideBend * 1.3 },
    },
    shouldApplySpine: true,
    sideBend,
    twist,
  }, anatomicalMapping);
}
