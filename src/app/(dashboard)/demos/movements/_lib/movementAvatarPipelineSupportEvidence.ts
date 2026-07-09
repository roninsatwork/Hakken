import type { TrackingLandmark } from "./movementTrackingCalibration";

function distance2D(a?: { x: number; y: number } | null, b?: { x: number; y: number } | null) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint2D(a?: TrackingLandmark | null, b?: TrackingLandmark | null) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function hasWideSeatedSupportBase(poseLandmarks: TrackingLandmark[]) {
  const shoulderWidth = Math.max(distance2D(poseLandmarks[11], poseLandmarks[12]), 0.08);
  const shoulderCenter = midpoint2D(poseLandmarks[11], poseLandmarks[12]);
  const hipCenter = midpoint2D(poseLandmarks[23], poseLandmarks[24]);
  const kneeSpread = distance2D(poseLandmarks[25], poseLandmarks[26]);
  const ankleSpread = distance2D(poseLandmarks[27], poseLandmarks[28]);
  const torsoHeight = shoulderCenter && hipCenter
    ? Math.max(distance2D(shoulderCenter, hipCenter), 0.08)
    : 0.08;
  const kneeHeightAsymmetry = poseLandmarks[25] && poseLandmarks[26]
    ? Math.abs(poseLandmarks[25].y - poseLandmarks[26].y)
    : Number.POSITIVE_INFINITY;
  const symmetricSeatLine = kneeHeightAsymmetry < torsoHeight * 0.45;

  return symmetricSeatLine && (kneeSpread > shoulderWidth * 1.45 || ankleSpread > shoulderWidth * 1.45);
}

export function hasDeepKneelingSupportBase(poseLandmarks: TrackingLandmark[]) {
  const shoulderCenter = midpoint2D(poseLandmarks[11], poseLandmarks[12]);
  const hipCenter = midpoint2D(poseLandmarks[23], poseLandmarks[24]);
  const kneeCenter = midpoint2D(poseLandmarks[25], poseLandmarks[26]);
  const ankleCenter = midpoint2D(poseLandmarks[27], poseLandmarks[28]);
  if (!shoulderCenter || !hipCenter || !kneeCenter || !ankleCenter) return false;

  const torsoHeight = Math.max(distance2D(shoulderCenter, hipCenter), 0.08);
  const kneeDrop = kneeCenter.y - hipCenter.y;
  const ankleDrop = ankleCenter.y - kneeCenter.y;
  const kneeHeightAsymmetry = poseLandmarks[25] && poseLandmarks[26]
    ? Math.abs(poseLandmarks[25].y - poseLandmarks[26].y)
    : Number.POSITIVE_INFINITY;

  return kneeDrop > torsoHeight * 0.78 &&
    ankleDrop < torsoHeight * 0.45 &&
    kneeHeightAsymmetry < torsoHeight * 0.35;
}
