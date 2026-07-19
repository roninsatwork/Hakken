import {
  averageMovementCalibrations,
  buildMovementCalibration,
  type MovementCalibration,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { scoreMovementNeutralCalibrationPose } from "./movementRecordedPlayerSetup";

const DEFAULT_RECORDED_INSTRUCTOR_CALIBRATION_SAMPLES = 8;

export type MovementRecordedInstructorSetupFrame = {
  landmarks?: TrackingLandmark[];
  pose?: TrackingLandmark[];
};

/**
 * Reconstructs the single recorded-instructor calibration shared by Replay and
 * Game. The whole instructor recording is known before playback, so the most
 * neutral trustworthy samples may be selected without relying on route timing.
 */
export function buildMovementRecordedInstructorCalibration(
  frames: MovementRecordedInstructorSetupFrame[],
  sampleLimit = DEFAULT_RECORDED_INSTRUCTOR_CALIBRATION_SAMPLES,
): MovementCalibration | null {
  const calibrationSamples = frames
    .map((frame, index) => {
      const poseLandmarks = frame.pose ?? frame.landmarks ?? [];
      return {
        calibration: buildMovementCalibration({ now: index, poseLandmarks }),
        score: scoreMovementNeutralCalibrationPose(poseLandmarks),
      };
    })
    .filter((sample): sample is {
      calibration: MovementCalibration;
      score: number;
    } => Boolean(sample.calibration) && Number.isFinite(sample.score))
    .sort((left, right) => (
      left.score - right.score ||
      right.calibration.quality - left.calibration.quality
    ))
    .slice(0, sampleLimit)
    .map((sample) => sample.calibration);

  return averageMovementCalibrations(calibrationSamples);
}
