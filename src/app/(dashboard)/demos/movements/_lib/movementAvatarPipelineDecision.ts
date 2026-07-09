import {
  resolveMovementAvatarPlayerSpineDrive,
  resolveMovementAvatarRecordedSpineDrive,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerDrive";
import {
  classifyMovementBodyOrientation,
  shouldHoldUnsupportedBodyOrientation,
  type MovementBodyOrientationDecision,
} from "./movementBodyOrientation";
import { resolveMovementAvatarRootOrientation } from "./movementAvatarRootOrientationDecision";
import { resolveMovementAvatarArmDecision } from "./movementAvatarArmTargetDecision";
import { resolveMovementAvatarPipelineLowerBodyDecision } from "./movementAvatarPipelineLowerBodyDecision";
import { resolveMovementAvatarPipelineSupportDecision } from "./movementAvatarPipelineSupportDecision";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  getMovementBodyConfidence,
} from "./movementTrackingCalibration";
import type {
  MovementAvatarPipelineDecision,
  MovementAvatarPipelineInput,
} from "./movementAvatarPipelineTypes";

function buildUnsupportedOrientationSpineDrive(
  bodyOrientation: MovementBodyOrientationDecision,
): MovementAvatarPlayerSpineDrive {
  return {
    confidence: bodyOrientation.confidence,
    forwardLean: 0,
    owner: "player-spine-held",
    rotations: {
      chest: { x: 0, y: 0, z: 0 },
      hips: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      upperChest: { x: 0, y: 0, z: 0 },
    },
    shouldApplySpine: false,
    sideBend: 0,
    twist: 0,
  };
}

export function resolveMovementAvatarPipelineDecision({
  avatarTrackingProfile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  avatarRole,
  calibration,
  retargetSourceModel,
  shouldHoldPlayerSquatPose = false,
  source,
}: MovementAvatarPipelineInput): MovementAvatarPipelineDecision {
  const isPlayer = avatarRole === "player";
  const bodyConfidence = getMovementBodyConfidence(source.poseLandmarks, source.hands);
  const bodyOrientation = classifyMovementBodyOrientation(source.poseLandmarks);
  const rootOrientation = resolveMovementAvatarRootOrientation({ bodyOrientation });
  const upperBodyTrackingReady =
    bodyConfidence.head >= 0.55 &&
    Math.min(bodyConfidence.leftShoulder, bodyConfidence.rightShoulder) >= 0.55;
  const torsoTrackingReady = !isPlayer || bodyConfidence.torso >= 0.45 || upperBodyTrackingReady;
  const {
    lowerBodyDrive,
    lowerBodyIntent,
    lowerBodyOwnerDecision,
    lowerBodySegmentMotion,
    lowerBodySourceBounds,
    lowerBodySourceReliable,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    rawLowerBodyTrackingReady,
    retargetFrame,
    retargetSolvedFeet,
    retargetSolvedLegs,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldUseRetargetedUpperBody,
  } = resolveMovementAvatarPipelineLowerBodyDecision({
    bodyConfidence,
    calibration,
    isPlayer,
    poseLandmarks: source.poseLandmarks,
    retargetSourceModel,
    shouldHoldPlayerSquatPose,
    torsoTrackingReady,
    worldPoseLandmarks: source.worldPoseLandmarks,
  });
  const {
    bodySupport,
    exercisePose,
    supportConstraint,
    supportContactLocks,
    supportIntent,
    supportPresentation,
  } = resolveMovementAvatarPipelineSupportDecision({
    bodyOrientation,
    preferFeetFloorForActiveLowerBody:
      isPlayer &&
      (
        lowerBodyDrive.shouldDrivePlayerSquat ||
        lowerBodyDrive.shouldDrivePlayerLegRaise ||
        playerRetargetLowerBodyMotion >= 0.16
      ),
    poseLandmarks: source.poseLandmarks,
  });
  const leftArm = resolveMovementAvatarArmDecision({
    bodyConfidence,
    isPlayer,
    profile: avatarTrackingProfile,
    side: "left",
  });
  const rightArm = resolveMovementAvatarArmDecision({
    bodyConfidence,
    isPlayer,
    profile: avatarTrackingProfile,
    side: "right",
  });
  const playerSpineDrive = resolveMovementAvatarPlayerSpineDrive({
    calibration,
    isPlayer,
    poseLandmarks: source.poseLandmarks,
    torsoTrackingReady,
  });
  const recordedSpineDrive = resolveMovementAvatarRecordedSpineDrive({
    kneeLift: retargetFrame.kneeLift,
    poseLandmarks: source.poseLandmarks,
    retargetCalibration: retargetSourceModel,
    torsoTrackingReady,
  });
  const spineDrive = shouldHoldUnsupportedBodyOrientation(bodyOrientation)
    ? buildUnsupportedOrientationSpineDrive(bodyOrientation)
    : isPlayer ? playerSpineDrive : recordedSpineDrive;
  const torsoOwner = spineDrive.shouldApplySpine
    ? spineDrive.owner
    : shouldApplySolverTorso
      ? isPlayer ? "player-solver" : "recorded-solver"
      : "neutral";

  return {
    bodyOrientation,
    bodySupport,
    exercisePose,
    supportConstraint,
    supportContactLocks,
    supportIntent,
    supportPresentation,
    bodyConfidence,
    feetOwner: lowerBodyOwnerDecision?.feetOwner ?? "neutral",
    leftArm,
    lowerBodyDrive,
    lowerBodyIntent,
    lowerBodyOwnerDecision,
    lowerBodySegmentMotion,
    lowerBodySourceBounds,
    lowerBodySourceReliable,
    lowerBodyTrackingReady,
    lowerLabel: lowerBodyIntent.label,
    lowerOwner: lowerBodyOwnerDecision?.lowerBodyOwner ?? "neutral",
    playerRetargetLowerBodyMotion,
    rawLowerBodyTrackingReady,
    retargetFrame,
    retargetSolvedFeet,
    retargetSolvedLegs,
    rootOrientation,
    rightArm,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldUseRetargetedUpperBody,
    spineDrive,
    torsoOwner,
    torsoTrackingReady,
    upperBodyTrackingReady,
  };
}
