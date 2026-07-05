import {
  buildLiveMovementSourceFrame,
  type MovementSourceFrameRequirements,
} from "./movementSourceFrame";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "./movementMotionFrame";
import { resolveMovementDisplayLandmarkFrame } from "./movementDisplayLandmarks";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
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

export type BuildLiveMovementMotionFrameInput = {
  calibration: MovementCalibration | null;
  capturedAt?: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  retargetSourceModel: MovementRetargetSourceModel | null;
  requirements?: MovementSourceFrameRequirements;
};

export function buildLiveMovementMotionFrame({
  calibration,
  capturedAt = Date.now(),
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  requirements,
  retargetSourceModel,
}: BuildLiveMovementMotionFrameInput): MovementMotionFrame | null {
  const payload = motionRef && !Array.isArray(motionRef) ? motionRef as VrmMotionPayload : null;
  const rawLandmarks = getVrmMotionLandmarks(motionRef);
  if (rawLandmarks.length < 33) return null;

  const displayFrame = resolveMovementDisplayLandmarkFrame({
    isPlaying,
    payload,
    rawLandmarks,
    role: "live-player",
  });
  const sourceFrame = buildLiveMovementSourceFrame({
    blendshapes: payload?.blendshapes,
    capturedAt,
    hands: payload?.hands as MovementHandsForConfidence | undefined,
    poseLandmarks: rawLandmarks as TrackingLandmark[],
    requirements: {
      calibrationQuality: calibration?.quality ?? null,
      ...requirements,
    },
    sourceStatus: "smoothed",
    worldPoseLandmarks: payload && displayFrame.hasWorldPose
      ? payload.worldLandmarks as TrackingLandmark[]
      : undefined,
  });

  return resolveMovementMotionFrame({
    avatarRole: "player",
    calibration,
    displayPoseLandmarks: displayFrame.pose,
    displayWorldPoseLandmarks: displayFrame.worldPose,
    mirrorMode: "facing-player",
    previousMotionFrame,
    retargetSourceModel,
    sourceFrame,
  });
}
