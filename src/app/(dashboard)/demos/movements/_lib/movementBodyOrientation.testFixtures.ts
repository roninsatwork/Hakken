import {
  movementAvatarProofLandmark,
} from "./movementAvatarProofFixtures";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export function movementOrientationPoseWith(points: Partial<Record<number, TrackingLandmark>>) {
  const pose: TrackingLandmark[] = Array.from({ length: 33 }, () => movementAvatarProofLandmark(0.5, 0.5, 0, 0.9));
  Object.entries(points).forEach(([index, landmark]) => {
    if (landmark) pose[Number(index)] = landmark;
  });
  return pose;
}

export function seatedPoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5, 0.24),
    7: movementAvatarProofLandmark(0.46, 0.27),
    8: movementAvatarProofLandmark(0.54, 0.27),
    11: movementAvatarProofLandmark(0.39, 0.42),
    12: movementAvatarProofLandmark(0.61, 0.42),
    23: movementAvatarProofLandmark(0.43, 0.66),
    24: movementAvatarProofLandmark(0.57, 0.66),
    25: movementAvatarProofLandmark(0.31, 0.7),
    26: movementAvatarProofLandmark(0.69, 0.7),
    27: movementAvatarProofLandmark(0.3, 0.9),
    28: movementAvatarProofLandmark(0.7, 0.9),
  });
}

export function kneelingPoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5, 0.22),
    7: movementAvatarProofLandmark(0.46, 0.25),
    8: movementAvatarProofLandmark(0.54, 0.25),
    11: movementAvatarProofLandmark(0.39, 0.38),
    12: movementAvatarProofLandmark(0.61, 0.38),
    23: movementAvatarProofLandmark(0.43, 0.62),
    24: movementAvatarProofLandmark(0.57, 0.62),
    25: movementAvatarProofLandmark(0.41, 0.82),
    26: movementAvatarProofLandmark(0.59, 0.82),
    27: movementAvatarProofLandmark(0.4, 0.9),
    28: movementAvatarProofLandmark(0.6, 0.9),
  });
}

export function sideLyingPoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.24, 0.52),
    7: movementAvatarProofLandmark(0.22, 0.49),
    8: movementAvatarProofLandmark(0.25, 0.55),
    11: movementAvatarProofLandmark(0.34, 0.46),
    12: movementAvatarProofLandmark(0.36, 0.58),
    23: movementAvatarProofLandmark(0.62, 0.48),
    24: movementAvatarProofLandmark(0.64, 0.6),
    25: movementAvatarProofLandmark(0.78, 0.47),
    26: movementAvatarProofLandmark(0.8, 0.59),
    27: movementAvatarProofLandmark(0.92, 0.47),
    28: movementAvatarProofLandmark(0.94, 0.59),
  });
}

export function supinePoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.24, 0.52, -0.14),
    7: movementAvatarProofLandmark(0.22, 0.49, 0.02),
    8: movementAvatarProofLandmark(0.25, 0.55, 0.02),
    11: movementAvatarProofLandmark(0.34, 0.46, 0.01),
    12: movementAvatarProofLandmark(0.36, 0.58, 0.01),
    23: movementAvatarProofLandmark(0.62, 0.48, 0.02),
    24: movementAvatarProofLandmark(0.64, 0.6, 0.02),
    25: movementAvatarProofLandmark(0.78, 0.47, 0.03),
    26: movementAvatarProofLandmark(0.8, 0.59, 0.03),
    27: movementAvatarProofLandmark(0.92, 0.47, 0.04),
    28: movementAvatarProofLandmark(0.94, 0.59, 0.04),
  });
}

export function pronePoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.24, 0.52, 0.14),
    7: movementAvatarProofLandmark(0.22, 0.49, -0.02),
    8: movementAvatarProofLandmark(0.25, 0.55, -0.02),
    11: movementAvatarProofLandmark(0.34, 0.46, -0.01),
    12: movementAvatarProofLandmark(0.36, 0.58, -0.01),
    23: movementAvatarProofLandmark(0.62, 0.48, -0.02),
    24: movementAvatarProofLandmark(0.64, 0.6, -0.02),
    25: movementAvatarProofLandmark(0.78, 0.47, -0.03),
    26: movementAvatarProofLandmark(0.8, 0.59, -0.03),
    27: movementAvatarProofLandmark(0.92, 0.47, -0.04),
    28: movementAvatarProofLandmark(0.94, 0.59, -0.04),
  });
}

export function quadrupedPoseFixture() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.32, 0.44),
    7: movementAvatarProofLandmark(0.3, 0.42),
    8: movementAvatarProofLandmark(0.34, 0.46),
    11: movementAvatarProofLandmark(0.42, 0.44),
    12: movementAvatarProofLandmark(0.44, 0.56),
    15: movementAvatarProofLandmark(0.39, 0.72),
    16: movementAvatarProofLandmark(0.47, 0.72),
    23: movementAvatarProofLandmark(0.68, 0.45),
    24: movementAvatarProofLandmark(0.7, 0.57),
    25: movementAvatarProofLandmark(0.7, 0.73),
    26: movementAvatarProofLandmark(0.78, 0.73),
    27: movementAvatarProofLandmark(0.86, 0.74),
    28: movementAvatarProofLandmark(0.9, 0.74),
  });
}
