import {
  resolveMovementAvatarPipelineDecision,
  type MovementAvatarPipelineDecision,
  type MovementAvatarPipelineInput,
} from "./movementAvatarPipeline";
import {
  mapMovementDisplaySide,
  type MovementMirrorMode,
} from "./movementMirrorMapping";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import {
  resolveMovementAvatarHeadTarget,
  type MovementAvatarHeadTargetDecision,
} from "./movementAvatarHeadTarget";
import type { MovementSourceFrame } from "./movementSourceFrame";
import type { TrackingLandmark } from "./movementTrackingCalibration";
import {
  appendMovementRootMotionHistoryFrame,
  type MovementRootMotionFrame,
  type MovementRootMotionInputFrame,
} from "./movementRootMotion";
import {
  buildMovementTruthSkeleton,
  type MovementTruthSkeleton,
} from "./movementTruthSkeleton";
import { stabilizeMovementAvatarPipelineDecision } from "./movementAvatarTemporalStabilization";

export type MovementMotionOwnerMap = {
  feet: string;
  lowerBody: string;
  root: string;
  spine: string;
  support: string;
  torso: string;
};

export type MovementMotionDisplayMapping = {
  mirrorMode: MovementMirrorMode;
  sideMap: {
    sourceLeft: "avatarLeft" | "avatarRight";
    sourceRight: "avatarLeft" | "avatarRight";
  };
};

export type MovementMotionReadabilityState =
  | "active"
  | "held"
  | "lost"
  | "partial"
  | "uncertain";

export type MovementMotionReadabilityTarget = {
  confidence: number;
  displayAmplification: number;
  displayedMovementStrength: number;
  heldFromFrameId?: string;
  holdMsRemaining: number;
  messageEvents: MovementSourceFrame["cameraConfidence"]["messageEvents"];
  readableMovementStrength: number;
  reasons: string[];
  rawMovementStrength: number;
  scoreAllowed: boolean;
  source: "avatar-pipeline";
  state: MovementMotionReadabilityState;
};

export type MovementMotionFrame = {
  avatarDecision: MovementAvatarPipelineDecision;
  avatarDisplayDecision: MovementAvatarPipelineDecision;
  avatarDisplayHeadTarget: MovementAvatarHeadTargetDecision;
  avatarHeadTarget: MovementAvatarHeadTargetDecision;
  bodyOrientation: MovementAvatarPipelineDecision["bodyOrientation"];
  cameraConfidence: MovementSourceFrame["cameraConfidence"];
  clamped: string[];
  confidence: Record<string, number>;
  contacts: MovementAvatarPipelineDecision["bodySupport"]["contacts"];
  display: MovementMotionDisplayMapping;
  displayLandmarks: {
    pose: TrackingLandmark[];
    worldPose: TrackingLandmark[];
  };
  held: string[];
  mirrorMode: MovementMirrorMode;
  owners: MovementMotionOwnerMap;
  readability: MovementMotionReadabilityTarget;
  rejected: string[];
  rootTarget: MovementAvatarPipelineDecision["rootOrientation"];
  rootMotionFrame: MovementRootMotionFrame | null;
  rootMotionHistory: MovementRootMotionInputFrame[];
  source: MovementSourceFrame;
  startReadiness: MovementSourceFrame["startReadiness"];
  support: MovementAvatarPipelineDecision["bodySupport"];
  supportConstraint: MovementAvatarPipelineDecision["supportConstraint"];
  truthSkeleton: MovementTruthSkeleton;
  unsupportedReasons: string[];
};

export type ResolveMovementMotionFrameInput = Omit<MovementAvatarPipelineInput, "source" | "sourceOrigin"> & {
  displayPoseLandmarks?: TrackingLandmark[];
  /** Neutral model expressed in the same coordinate/anatomical space as display landmarks. */
  displayRetargetSourceModel?: MovementRetargetSourceModel | null;
  displayWorldPoseLandmarks?: TrackingLandmark[];
  mirrorMode: MovementMirrorMode;
  previousMotionFrame?: MovementMotionFrame | null;
  sourceFrame: MovementSourceFrame;
};

const MOVEMENT_READABILITY_HOLD_MS = 250;
const MOVEMENT_READABILITY_HOLD_MIN_STRENGTH = 0.1;

function resolveMotionDisplayMapping(mirrorMode: MovementMirrorMode): MovementMotionDisplayMapping {
  return {
    mirrorMode,
    sideMap: {
      sourceLeft: mapMovementDisplaySide("left", mirrorMode) === "left" ? "avatarLeft" : "avatarRight",
      sourceRight: mapMovementDisplaySide("right", mirrorMode) === "left" ? "avatarLeft" : "avatarRight",
    },
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function resolveReadableMovementStrength(decision: MovementAvatarPipelineDecision) {
  return clamp01(Math.max(
    decision.lowerBodyDrive.playerSquatPresentationDepth,
    decision.lowerBodyDrive.playerLegRaiseDepth,
    decision.lowerBodyDrive.liveSquatDepth,
    Math.abs(decision.spineDrive.sideBend),
    Math.abs(decision.spineDrive.forwardLean),
    Math.abs(decision.spineDrive.twist),
    decision.retargetFrame.squatDepth,
    decision.retargetFrame.kneeLift.left,
    decision.retargetFrame.kneeLift.right,
  ));
}

function resolveMotionOwners(decision: MovementAvatarPipelineDecision): MovementMotionOwnerMap {
  return {
    feet: decision.feetOwner,
    lowerBody: decision.lowerOwner,
    root: decision.rootOrientation.owner,
    spine: decision.spineDrive.owner,
    support: decision.supportConstraint.owner,
    torso: decision.torsoOwner,
  };
}

function resolveUnsupportedReasons(decision: MovementAvatarPipelineDecision) {
  const reasons: string[] = [];

  if (decision.bodyOrientation.status === "unsupported") {
    reasons.push(...decision.bodyOrientation.reasons);
  }
  if (decision.supportConstraint.status === "missing") {
    reasons.push(...decision.supportConstraint.missingLayers);
  }

  return Array.from(new Set(reasons));
}

function resolveReadabilityState(
  cameraState: MovementSourceFrame["cameraConfidence"]["state"],
): MovementMotionReadabilityState {
  if (cameraState === "ready") return "active";
  return cameraState;
}

function resolveMotionReadability({
  displayDecision,
  previousMotionFrame,
  sourceDecision,
  sourceFrame,
}: {
  displayDecision: MovementAvatarPipelineDecision;
  previousMotionFrame?: MovementMotionFrame | null;
  sourceDecision: MovementAvatarPipelineDecision;
  sourceFrame: MovementSourceFrame;
}): MovementMotionReadabilityTarget {
  const rawMovementStrength = resolveReadableMovementStrength(sourceDecision);
  const displayedMovementStrength = resolveReadableMovementStrength(displayDecision);
  const displayAmplification = rawMovementStrength > 0.001
    ? displayedMovementStrength / rawMovementStrength
    : displayedMovementStrength > 0
      ? Number.POSITIVE_INFINITY
      : 1;
  const reasons = Array.from(new Set([
    ...sourceFrame.cameraConfidence.reasons,
    ...resolveUnsupportedReasons(sourceDecision),
  ]));
  const previousReadability = previousMotionFrame?.readability;
  const previousAgeMs = previousMotionFrame
    ? sourceFrame.capturedAt - previousMotionFrame.source.capturedAt
    : Number.POSITIVE_INFINITY;
  const canHoldPreviousReadableMotion = Boolean(
    previousReadability &&
      previousAgeMs >= 0 &&
      previousAgeMs <= MOVEMENT_READABILITY_HOLD_MS &&
      previousReadability.readableMovementStrength >= MOVEMENT_READABILITY_HOLD_MIN_STRENGTH &&
      (sourceFrame.cameraConfidence.state === "uncertain" || sourceFrame.cameraConfidence.state === "lost"),
  );

  if (canHoldPreviousReadableMotion && previousReadability) {
    return {
      confidence: sourceFrame.cameraConfidence.frameVisibility,
      displayAmplification: previousReadability.displayAmplification,
      displayedMovementStrength: previousReadability.displayedMovementStrength,
      heldFromFrameId: previousMotionFrame?.source.frameId,
      holdMsRemaining: Math.max(0, MOVEMENT_READABILITY_HOLD_MS - previousAgeMs),
      messageEvents: sourceFrame.cameraConfidence.messageEvents,
      rawMovementStrength,
      readableMovementStrength: previousReadability.readableMovementStrength,
      reasons: Array.from(new Set([...reasons, "held-last-readable-motion"])),
      scoreAllowed: false,
      source: "avatar-pipeline",
      state: "held",
    };
  }

  return {
    confidence: sourceFrame.cameraConfidence.frameVisibility,
    displayAmplification,
    displayedMovementStrength,
    holdMsRemaining: 0,
    messageEvents: sourceFrame.cameraConfidence.messageEvents,
    rawMovementStrength,
    readableMovementStrength: displayedMovementStrength,
    reasons,
    scoreAllowed: sourceFrame.cameraConfidence.scoreAllowed,
    source: "avatar-pipeline",
    state: resolveReadabilityState(sourceFrame.cameraConfidence.state),
  };
}

export function resolveMovementMotionFrame({
  displayPoseLandmarks,
  displayRetargetSourceModel,
  displayWorldPoseLandmarks,
  mirrorMode,
  previousMotionFrame,
  sourceFrame,
  ...pipelineInput
}: ResolveMovementMotionFrameInput): MovementMotionFrame {
  const sourcePoseLandmarks = sourceFrame.landmarks.pose;
  const poseLandmarks = displayPoseLandmarks ?? sourcePoseLandmarks;
  const worldPoseLandmarks = displayWorldPoseLandmarks ?? sourceFrame.landmarks.worldPose;
  const sourceDeltaMs = previousMotionFrame
    ? sourceFrame.capturedAt - previousMotionFrame.source.capturedAt
    : 0;
  const rootMotionHistory = [...(previousMotionFrame?.rootMotionHistory ?? [])];
  const rootMotionFrame = appendMovementRootMotionHistoryFrame({
    history: rootMotionHistory,
    pose: poseLandmarks,
    worldPose: worldPoseLandmarks,
  });
  const rawAvatarDecision = resolveMovementAvatarPipelineDecision({
    ...pipelineInput,
    anatomicalMapping: "identity",
    source: {
      hands: sourceFrame.landmarks.hands,
      poseLandmarks: sourcePoseLandmarks,
      worldPoseLandmarks: sourceFrame.landmarks.worldPose,
    },
    sourceOrigin: sourceFrame.sourceOrigin === "recorded-replay" ? "replay" : "studio",
  });
  // The display decision runs on mirrored landmarks; only pass world landmarks that
  // were mirrored alongside them, never the unmirrored source world pose.
  const avatarDecision = stabilizeMovementAvatarPipelineDecision({
    current: rawAvatarDecision,
    previous: previousMotionFrame?.avatarDecision,
    sourceDeltaMs,
  });
  const avatarDisplayDecision = poseLandmarks === sourcePoseLandmarks && mirrorMode === "same-side"
    ? avatarDecision
    : stabilizeMovementAvatarPipelineDecision({
        current: resolveMovementAvatarPipelineDecision({
        ...pipelineInput,
        // Display preparation has already reflected coordinates and exchanged
        // bilateral landmark ownership for a facing player. Applying an
        // additional anatomical inversion here reverses the player spine a
        // second time, making its rendered side bend/twist oppose the
        // instructor despite matched display landmarks.
        anatomicalMapping: "identity",
        source: {
          hands: sourceFrame.landmarks.hands,
          poseLandmarks,
          worldPoseLandmarks: displayWorldPoseLandmarks,
        },
        sourceOrigin: sourceFrame.sourceOrigin === "recorded-replay" ? "replay" : "studio",
          retargetSourceModel: displayRetargetSourceModel ?? pipelineInput.retargetSourceModel,
        }),
        previous: previousMotionFrame?.avatarDisplayDecision,
        sourceDeltaMs,
      });
  // Replay is the accepted player-avatar reference. Player head behaviour must
  // not change merely because the same player frame came from a live camera
  // instead of a recording.
  const usesReplayReferencePlayerHead = pipelineInput.avatarRole === "player";
  const headAvatarRole = usesReplayReferencePlayerHead
    ? "instructor"
    : pipelineInput.avatarRole;
  const headCalibration = usesReplayReferencePlayerHead
    ? null
    : pipelineInput.calibration;
  const avatarHeadTarget = resolveMovementAvatarHeadTarget({
    avatarRole: headAvatarRole,
    avatarRootYaw: 0,
    calibration: headCalibration,
    poseLandmarks: sourcePoseLandmarks,
    profile: pipelineInput.avatarTrackingProfile,
    shouldApplyLowerBody: avatarDecision.shouldApplyLowerBody,
    shouldApplySpine: avatarDecision.spineDrive.shouldApplySpine,
  });
  const avatarDisplayHeadTarget = poseLandmarks === sourcePoseLandmarks
    ? avatarHeadTarget
    : resolveMovementAvatarHeadTarget({
      avatarRole: headAvatarRole,
      avatarRootYaw: 0,
      calibration: headCalibration,
      mirrorHeadForDisplay: mirrorMode === "facing-player",
      poseLandmarks,
      profile: pipelineInput.avatarTrackingProfile,
        shouldApplyLowerBody: avatarDisplayDecision.shouldApplyLowerBody,
        shouldApplySpine: avatarDisplayDecision.spineDrive.shouldApplySpine,
      });
  const readability = resolveMotionReadability({
    displayDecision: avatarDisplayDecision,
    previousMotionFrame,
    sourceDecision: avatarDecision,
    sourceFrame,
  });

  return {
    avatarDecision,
    avatarDisplayDecision,
    avatarDisplayHeadTarget,
    avatarHeadTarget,
    bodyOrientation: avatarDecision.bodyOrientation,
    cameraConfidence: sourceFrame.cameraConfidence,
    clamped: [],
    confidence: avatarDecision.bodyConfidence,
    contacts: avatarDecision.bodySupport.contacts,
    display: resolveMotionDisplayMapping(mirrorMode),
    displayLandmarks: {
      pose: poseLandmarks,
      worldPose: worldPoseLandmarks,
    },
    held: readability.state === "held" ? ["readability"] : [],
    mirrorMode,
    owners: resolveMotionOwners(avatarDecision),
    readability,
    rejected: [],
    rootTarget: avatarDecision.rootOrientation,
    rootMotionFrame,
    rootMotionHistory,
    source: sourceFrame,
    startReadiness: sourceFrame.startReadiness,
    support: avatarDecision.bodySupport,
    supportConstraint: avatarDecision.supportConstraint,
    truthSkeleton: buildMovementTruthSkeleton(sourceFrame),
    unsupportedReasons: resolveUnsupportedReasons(avatarDecision),
  };
}
