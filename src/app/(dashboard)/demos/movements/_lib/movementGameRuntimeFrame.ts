import {
  buildMovementSourceFrame,
  type MovementSourceFrameRequirements,
} from "./movementSourceFrame";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "./movementMotionFrame";
import { resolveMovementDisplayLandmarkFrame } from "./movementDisplayLandmarks";
import {
  buildPlayerMovementMotionFrame,
  type MovementPlayerMotionSource,
} from "./movementPlayerMotionFrame";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementCalibration, TrackingLandmark } from "./movementTrackingCalibration";
import {
  getVrmMotionLandmarks,
  type VrmMotionPayload,
  type VrmMotionRef,
} from "./vrmRigging";

export const MOVEMENT_GAME_RUNTIME_CONTRACT_VERSION = "movement-game-runtime-v1" as const;
export const MOVEMENT_REPLAY_GAME_PARITY_PROOF_MODE = "replay-mounted-game-player-v1" as const;

export type BuildMovementGamePlayerRuntimeFrameInput = {
  calibration: MovementCalibration | null;
  capturedAt?: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  requirements?: MovementSourceFrameRequirements;
  retargetSourceModel: MovementRetargetSourceModel | null;
  source: MovementPlayerMotionSource;
};

export type BuildMovementGameInstructorRuntimeFrameInput = {
  calibration?: MovementCalibration | null;
  capturedAt?: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

/**
 * The canonical Game player-avatar adapter. Replay substitutes recorded data
 * only at the source boundary and calls this same runtime.
 */
export function buildMovementGamePlayerRuntimeFrame({
  calibration,
  capturedAt,
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  requirements,
  retargetSourceModel,
  source,
}: BuildMovementGamePlayerRuntimeFrameInput): MovementMotionFrame | null {
  return buildPlayerMovementMotionFrame({
    calibration,
    capturedAt,
    isPlaying,
    motionRef,
    previousMotionFrame,
    requirements,
    retargetSourceModel,
    source,
  });
}

/** The canonical Game recorded-instructor adapter, also exercised by Replay. */
export function buildMovementGameInstructorRuntimeFrame({
  calibration = null,
  capturedAt,
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  retargetSourceModel,
}: BuildMovementGameInstructorRuntimeFrameInput): MovementMotionFrame | null {
  const payload = motionRef && !Array.isArray(motionRef) ? motionRef as VrmMotionPayload : null;
  const rawLandmarks = getVrmMotionLandmarks(motionRef);
  if (rawLandmarks.length < 33) return null;

  const sourceWorldPoseLandmarks = payload?.worldLandmarks?.length === 33
    ? payload.worldLandmarks as TrackingLandmark[]
    : undefined;
  const sourceFrame = buildMovementSourceFrame({
    blendshapes: payload?.blendshapes,
    capturedAt: capturedAt ?? payload?.capturedAt ?? Date.now(),
    frameId: payload?.frameId,
    hands: payload?.hands,
    poseLandmarks: rawLandmarks as TrackingLandmark[],
    sourceOrigin: "recorded-replay",
    sourceStatus: "decoded",
    worldPoseLandmarks: sourceWorldPoseLandmarks,
  });
  const displayFrame = resolveMovementDisplayLandmarkFrame({
    isPlaying,
    payload,
    rawLandmarks,
    role: "recorded-instructor",
  });

  return resolveMovementMotionFrame({
    avatarRole: "instructor",
    calibration,
    displayPoseLandmarks: displayFrame.pose,
    displayWorldPoseLandmarks: displayFrame.worldPose,
    mirrorMode: "same-side",
    previousMotionFrame,
    retargetSourceModel,
    sourceFrame,
  });
}
