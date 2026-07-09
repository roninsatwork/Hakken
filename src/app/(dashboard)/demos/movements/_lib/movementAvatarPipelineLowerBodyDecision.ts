import {
  isMovementAvatarLowerBodyTrackingReady,
  resolveMovementAvatarLowerBodyDrive,
  resolveMovementAvatarPlayerLowerBodyOwners,
} from "./movementAvatarLowerBody";
import {
  countMovementRetargetSegments,
  FOOT_SEGMENTS,
  LOWER_BODY_SEGMENTS,
} from "./movementAvatarRetargetDebugDecision";
import { getMovementAvatarLowerBodySourceBounds } from "./movementAvatarLowerBodySourceBounds";
import {
  getRecordedLowerBodySegmentMotionDepth,
  solveMovementRetargetFrame,
} from "./movementRetargeting";
import { getMovementLowerBodyIntent } from "./movementTrackingCalibration";
import type {
  MovementAvatarPipelineDecision,
  MovementAvatarPipelineInput,
} from "./movementAvatarPipelineTypes";

export type MovementAvatarPipelineLowerBodyDecision = Pick<
  MovementAvatarPipelineDecision,
  | "lowerBodyDrive"
  | "lowerBodyIntent"
  | "lowerBodyOwnerDecision"
  | "lowerBodySegmentMotion"
  | "lowerBodySourceBounds"
  | "lowerBodySourceReliable"
  | "lowerBodyTrackingReady"
  | "playerRetargetLowerBodyMotion"
  | "rawLowerBodyTrackingReady"
  | "retargetFrame"
  | "retargetSolvedFeet"
  | "retargetSolvedLegs"
  | "shouldApplyLowerBody"
  | "shouldApplySolverTorso"
  | "shouldUseRetargetedUpperBody"
>;

export function resolveMovementAvatarPipelineLowerBodyDecision({
  bodyConfidence,
  calibration,
  isPlayer,
  poseLandmarks,
  retargetSourceModel,
  shouldHoldPlayerSquatPose,
  torsoTrackingReady,
  worldPoseLandmarks,
}: {
  bodyConfidence: MovementAvatarPipelineDecision["bodyConfidence"];
  calibration: MovementAvatarPipelineInput["calibration"];
  isPlayer: boolean;
  poseLandmarks: MovementAvatarPipelineInput["source"]["poseLandmarks"];
  retargetSourceModel: MovementAvatarPipelineInput["retargetSourceModel"];
  shouldHoldPlayerSquatPose: boolean;
  torsoTrackingReady: boolean;
  worldPoseLandmarks?: MovementAvatarPipelineInput["source"]["worldPoseLandmarks"];
}): MovementAvatarPipelineLowerBodyDecision {
  const lowerBodyIntent = getMovementLowerBodyIntent({
    calibration,
    poseLandmarks,
  });
  const retargetFrame = solveMovementRetargetFrame({
    calibration: retargetSourceModel,
    poseLandmarks,
    worldPoseLandmarks,
  });
  const lowerBodySourceBounds = getMovementAvatarLowerBodySourceBounds(poseLandmarks);
  const rawLowerBodyTrackingReady = isMovementAvatarLowerBodyTrackingReady({
    bodyConfidence,
    isPlayer,
    lowerBodyIntent,
  });
  const lowerBodySourceReliable = lowerBodySourceBounds.reliable;
  const lowerBodyTrackingReady = rawLowerBodyTrackingReady && lowerBodySourceReliable;
  const hasBodyCalibration = isPlayer ? Boolean(calibration) : Boolean(retargetSourceModel);
  const lowerBodyDrive = resolveMovementAvatarLowerBodyDrive({
    hasLiveBodyCalibration: hasBodyCalibration,
    isPlayer,
    lowerBodyIntent,
    lowerBodyTrackingReady,
    retargetContactsBothFeet: retargetFrame.contacts.leftFoot && retargetFrame.contacts.rightFoot,
    retargetHipDrop: retargetFrame.hipDrop,
    retargetSquatDepth: retargetFrame.squatDepth,
  });
  const shouldApplyLowerBody = lowerBodyDrive.shouldApplyLowerBody && lowerBodySourceReliable;
  const shouldApplySolverTorso =
    lowerBodyDrive.shouldApplySolverTorso ||
    (!isPlayer && torsoTrackingReady && retargetFrame.debug.sourceQuality >= 0.45);
  const shouldUseRetargetedUpperBody = retargetFrame.debug.sourceQuality >= 0.45;
  const lowerBodySegmentMotion = getRecordedLowerBodySegmentMotionDepth({
    calibration: retargetSourceModel,
    frame: retargetFrame,
  });
  const retargetSolvedLegs = countMovementRetargetSegments(retargetFrame, LOWER_BODY_SEGMENTS);
  const retargetSolvedFeet = countMovementRetargetSegments(retargetFrame, FOOT_SEGMENTS);
  const playerRetargetLowerBodyMotion = Math.max(
    lowerBodyDrive.playerSquatPresentationDepth,
    retargetFrame.squatDepth,
    retargetFrame.kneeLift.left,
    retargetFrame.kneeLift.right,
    lowerBodySegmentMotion,
  );
  const lowerBodyOwnerDecision = isPlayer
    ? resolveMovementAvatarPlayerLowerBodyOwners({
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetSourceQuality: retargetFrame.debug.sourceQuality,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedFootSegments: retargetSolvedFeet,
        solvedLegSegments: retargetSolvedLegs,
        solvedLowerBodySegments: retargetSolvedLegs + retargetSolvedFeet,
        totalSolvedSegments: retargetFrame.debug.solvedSegments.length,
      })
    : null;

  return {
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
  };
}
