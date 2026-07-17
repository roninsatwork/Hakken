import {
  averageMovementRetargetSourceModels,
  buildMovementRetargetSourceModel,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import {
  averageMovementCalibrations,
  buildMovementCalibration,
  type MovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import type { VrmMotionPayload } from "./vrmRigging";

const DEFAULT_RECORDED_PLAYER_CALIBRATION_SAMPLES = 12;

export type MovementRecordedPlayerSetup = {
  calibration: MovementCalibration | null;
  provenance: {
    builder: "recorded-player-neutral-prefix-v1";
    frameLimit: number;
    inputContractId?: string;
    sampleIndexes: number[];
    sampleLimit: number;
  };
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function scoreMovementNeutralCalibrationPose(landmarks: TrackingLandmark[]) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee) {
    return Number.POSITIVE_INFINITY;
  }

  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };
  const torsoHeight = Math.max(
    Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y),
    0.12,
  );
  const kneeLift = (
    Math.max(0, hipCenter.y + torsoHeight * 0.34 - leftKnee.y) +
    Math.max(0, hipCenter.y + torsoHeight * 0.34 - rightKnee.y)
  ) / torsoHeight;
  const sideBend = Math.abs(shoulderCenter.x - hipCenter.x);

  return kneeLift + sideBend * 2.4;
}

/**
 * Reconstructs the calibration state a live-player lane could have known from
 * the recording prefix. No frame after `frameLimit` contributes evidence.
 */
export function buildMovementRecordedPlayerSetup({
  frameLimit,
  frames,
  sampleLimit = DEFAULT_RECORDED_PLAYER_CALIBRATION_SAMPLES,
}: {
  frameLimit: number;
  frames: VrmMotionPayload[];
  sampleLimit?: number;
}): MovementRecordedPlayerSetup {
  const safeFrameLimit = Math.min(Math.max(Math.trunc(frameLimit), 0), Math.max(frames.length - 1, 0));
  const candidates = frames
    .slice(0, safeFrameLimit + 1)
    .map((frame, index) => ({
      frame,
      index,
      poseLandmarks: frame.landmarks ?? frame.pose ?? [],
    }))
    .filter((candidate) => candidate.poseLandmarks.length >= 33)
    .map((candidate) => ({
      ...candidate,
      score: scoreMovementNeutralCalibrationPose(candidate.poseLandmarks),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, sampleLimit);
  const calibrations = candidates
    .map(({ index, poseLandmarks }) => buildMovementCalibration({
      now: index,
      poseLandmarks,
    }))
    .filter((calibration): calibration is MovementCalibration => Boolean(calibration));
  const retargetSourceModels = candidates
    .map(({ frame, index, poseLandmarks }) => buildMovementRetargetSourceModel({
      now: index,
      poseLandmarks,
      worldPoseLandmarks: frame.worldLandmarks ?? null,
    }))
    .filter((model): model is MovementRetargetSourceModel => Boolean(model));

  return {
    calibration: averageMovementCalibrations(calibrations),
    provenance: {
      builder: "recorded-player-neutral-prefix-v1",
      frameLimit: safeFrameLimit,
      sampleIndexes: candidates.map((candidate) => candidate.index),
      sampleLimit,
    },
    retargetSourceModel: averageMovementRetargetSourceModels(retargetSourceModels),
  };
}
