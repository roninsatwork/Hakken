import {
  buildMovementSourceFrame,
} from "./movementSourceFrame";
import {
  resolveMovementMotionFrame,
  type MovementMotionFrame,
} from "./movementMotionFrame";
import { resolveMovementDisplayLandmarkFrame } from "./movementDisplayLandmarks";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementCalibration, TrackingLandmark } from "./movementTrackingCalibration";
import {
  getVrmMotionLandmarks,
  type VrmMotionPayload,
  type VrmMotionRef,
} from "./vrmRigging";

export type BuildRecordedMovementMotionFrameInput = {
  calibration?: MovementCalibration | null;
  capturedAt?: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function buildRecordedMovementMotionFrame({
  calibration = null,
  capturedAt = Date.now(),
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  retargetSourceModel,
}: BuildRecordedMovementMotionFrameInput): MovementMotionFrame | null {
  const payload = motionRef && !Array.isArray(motionRef) ? motionRef as VrmMotionPayload : null;
  const rawLandmarks = getVrmMotionLandmarks(motionRef);
  if (rawLandmarks.length < 33) return null;

  const displayFrame = resolveMovementDisplayLandmarkFrame({
    isPlaying,
    payload,
    rawLandmarks,
    role: "recorded-instructor",
  });
  const sourceFrame = buildMovementSourceFrame({
    blendshapes: payload?.blendshapes,
    capturedAt,
    hands: payload?.hands,
    poseLandmarks: rawLandmarks as TrackingLandmark[],
    sourceOrigin: "recorded-replay",
    sourceStatus: "decoded",
    worldPoseLandmarks: payload && displayFrame.hasWorldPose
      ? payload.worldLandmarks as TrackingLandmark[]
      : undefined,
  });

  return resolveMovementMotionFrame({
    avatarRole: "instructor",
    calibration,
    displayPoseLandmarks: displayFrame.pose,
    displayWorldPoseLandmarks: displayFrame.worldPose,
    mirrorMode: "facing-player",
    previousMotionFrame,
    retargetSourceModel,
    sourceFrame,
  });
}
