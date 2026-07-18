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
  mapMovementRetargetSourceModelForDisplay,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import type {
  MovementCalibration,
  MovementHandsForConfidence,
  TrackingLandmark,
} from "./movementTrackingCalibration";
import {
  getVrmMotionLandmarks,
  type VrmMotionPayload,
  type VrmMotionRef,
} from "./vrmRigging";

export type MovementPlayerMotionSource = "live-webcam" | "recorded-replay";

export type BuildPlayerMovementMotionFrameInput = {
  calibration: MovementCalibration | null;
  capturedAt?: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  requirements?: MovementSourceFrameRequirements;
  retargetSourceModel: MovementRetargetSourceModel | null;
  source: MovementPlayerMotionSource;
};

/**
 * Canonical adapter for motion that drives the player-avatar path.
 *
 * Replay and Game intentionally retain different source provenance, but they
 * share display preparation, anatomical side mapping, calibration input and
 * the final player-avatar pipeline decision.
 */
export function buildPlayerMovementMotionFrame({
  calibration,
  capturedAt,
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  requirements,
  retargetSourceModel,
  source,
}: BuildPlayerMovementMotionFrameInput): MovementMotionFrame | null {
  const payload = motionRef && !Array.isArray(motionRef) ? motionRef as VrmMotionPayload : null;
  const rawLandmarks = getVrmMotionLandmarks(motionRef);
  if (rawLandmarks.length < 33) return null;
  const resolvedCapturedAt = capturedAt ?? payload?.capturedAt ?? Date.now();

  const sourceWorldPoseLandmarks = payload?.worldLandmarks?.length === 33
    ? payload.worldLandmarks as TrackingLandmark[]
    : undefined;
  const sourceFrame = buildMovementSourceFrame({
    blendshapes: payload?.blendshapes,
    capturedAt: resolvedCapturedAt,
    deepCapture: payload?.deepCapture,
    frameId: payload?.frameId,
    hands: payload?.hands as MovementHandsForConfidence | undefined,
    poseLandmarks: rawLandmarks as TrackingLandmark[],
    requirements: {
      calibrationQuality: calibration?.quality ?? null,
      ...requirements,
    },
    sourceOrigin: source,
    sourceStatus: source === "live-webcam" ? "smoothed" : "decoded",
    worldPoseLandmarks: sourceWorldPoseLandmarks,
  });
  const displayFrame = resolveMovementDisplayLandmarkFrame({
    isPlaying,
    payload,
    rawLandmarks,
    role: "live-player",
  });

  return resolveMovementMotionFrame({
    avatarRole: "player",
    calibration,
    displayPoseLandmarks: displayFrame.pose,
    displayRetargetSourceModel: mapMovementRetargetSourceModelForDisplay({
      mirrorMode: "facing-player",
      sourceModel: retargetSourceModel,
    }),
    displayWorldPoseLandmarks: displayFrame.worldPose,
    mirrorMode: "facing-player",
    previousMotionFrame,
    retargetSourceModel,
    sourceFrame,
  });
}
