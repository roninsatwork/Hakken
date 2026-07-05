import {
  getMovementCoverageEntry,
  type MovementCoverageFamily,
  type MovementSupportStatus,
} from "./movementCoverageRegistry";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementBodyOrientation =
  | "upright"
  | "seated"
  | "kneeling"
  | "quadruped"
  | "supine"
  | "prone"
  | "sideLyingLeft"
  | "sideLyingRight"
  | "transitional"
  | "unknown";

export type MovementBodyOrientationDecision = {
  confidence: number;
  coverageFamily: MovementCoverageFamily;
  reasons: string[];
  status: MovementSupportStatus;
  summary: string;
  orientation: MovementBodyOrientation;
};

const MIN_CORE_CONFIDENCE = 0.35;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function visibility(landmark?: TrackingLandmark | null) {
  return landmark?.visibility ?? 0.8;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function midpoint(a: TrackingLandmark, b: TrackingLandmark) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: average([visibility(a), visibility(b)]),
  };
}

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildDecision({
  confidence,
  coverageFamily,
  orientation,
  reasons,
}: {
  confidence: number;
  coverageFamily: MovementCoverageFamily;
  orientation: MovementBodyOrientation;
  reasons: string[];
}): MovementBodyOrientationDecision {
  const coverage = getMovementCoverageEntry(coverageFamily);
  return {
    confidence: clamp(confidence),
    coverageFamily,
    orientation,
    reasons,
    status: coverage.status,
    summary: coverage.summary,
  };
}

function getHeadCenter(poseLandmarks: TrackingLandmark[]) {
  const nose = poseLandmarks[0];
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];

  if (nose && leftEar && rightEar) {
    return {
      x: average([nose.x, leftEar.x, rightEar.x]),
      y: average([nose.y, leftEar.y, rightEar.y]),
      z: average([nose.z ?? 0, leftEar.z ?? 0, rightEar.z ?? 0]),
      visibility: average([visibility(nose), visibility(leftEar), visibility(rightEar)]),
    };
  }

  if (nose) return nose;
  return null;
}

export function classifyMovementBodyOrientation(
  poseLandmarks: TrackingLandmark[],
): MovementBodyOrientationDecision {
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];
  const nose = poseLandmarks[0];
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  const head = getHeadCenter(poseLandmarks);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return buildDecision({
      confidence: 0,
      coverageFamily: "upright",
      orientation: "unknown",
      reasons: ["core torso landmarks are unavailable"],
    });
  }

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const kneeCenter = leftKnee && rightKnee ? midpoint(leftKnee, rightKnee) : null;
  const ankleCenter = leftAnkle && rightAnkle ? midpoint(leftAnkle, rightAnkle) : null;
  const shoulderWidth = Math.max(distance2D(leftShoulder, rightShoulder), 0.08);
  const torsoHeight = Math.max(distance2D(shoulderCenter, hipCenter), 0.08);
  const coreConfidence = average([
    visibility(leftShoulder),
    visibility(rightShoulder),
    visibility(leftHip),
    visibility(rightHip),
  ]);

  if (coreConfidence < MIN_CORE_CONFIDENCE) {
    return buildDecision({
      confidence: coreConfidence,
      coverageFamily: "upright",
      orientation: "unknown",
      reasons: ["core torso confidence is too weak"],
    });
  }

  const torsoDx = shoulderCenter.x - hipCenter.x;
  const torsoDy = shoulderCenter.y - hipCenter.y;
  const headHipDx = head ? head.x - hipCenter.x : torsoDx;
  const headHipDy = head ? head.y - hipCenter.y : torsoDy;
  const horizontalBodyEvidence =
    Math.abs(headHipDx) > Math.abs(headHipDy) * 1.25 ||
    Math.abs(torsoDx) > Math.abs(torsoDy) * 1.65;
  const flatTorsoEvidence = Math.abs(torsoDy) < torsoHeight * 0.42;
  const handsNearFloorPlane =
    Boolean(leftWrist && rightWrist && ankleCenter) &&
    average([leftWrist!.y, rightWrist!.y]) > shoulderCenter.y + torsoHeight * 0.7 &&
    average([leftWrist!.y, rightWrist!.y]) >= Math.min(ankleCenter!.y, hipCenter.y) - torsoHeight * 0.35;
  const kneesNearHands =
    Boolean(kneeCenter && leftWrist && rightWrist) &&
    Math.abs(kneeCenter!.y - average([leftWrist!.y, rightWrist!.y])) < torsoHeight * 0.9;
  const feetNearHands =
    Boolean(ankleCenter && leftWrist && rightWrist) &&
    Math.abs(ankleCenter!.y - average([leftWrist!.y, rightWrist!.y])) < torsoHeight * 0.9;

  if (
    handsNearFloorPlane &&
    (
      (flatTorsoEvidence && kneesNearHands) ||
      (feetNearHands && (flatTorsoEvidence || horizontalBodyEvidence || hipCenter.y < shoulderCenter.y))
    )
  ) {
    return buildDecision({
      confidence: average([coreConfidence, visibility(leftWrist), visibility(rightWrist), kneeCenter?.visibility ?? 0]),
      coverageFamily: "quadruped",
      orientation: "quadruped",
      reasons: ["torso is floor-oriented with hands and lower-body anchors near the support plane"],
    });
  }

  if (horizontalBodyEvidence) {
    const faceDepthDelta = nose && leftEar && rightEar
      ? (nose.z ?? 0) - average([leftEar.z ?? 0, rightEar.z ?? 0])
      : 0;
    const floorFacingEvidence = Math.abs(faceDepthDelta) > 0.08;

    if (floorFacingEvidence) {
      const orientation = faceDepthDelta < 0 ? "supine" : "prone";
      return buildDecision({
        confidence: average([coreConfidence, head?.visibility ?? coreConfidence, visibility(nose)]),
        coverageFamily: "lying-floor-work",
        orientation,
        reasons: [
          "body axis is horizontal and face depth separates floor-facing from ceiling-facing floor work",
        ],
      });
    }

    const orientation = headHipDx < 0 ? "sideLyingLeft" : "sideLyingRight";
    return buildDecision({
      confidence: average([coreConfidence, head?.visibility ?? coreConfidence]),
      coverageFamily: "lying-floor-work",
      orientation,
      reasons: ["head-to-hip axis is horizontal, so upright spine solving is unsafe"],
    });
  }

  if (kneeCenter && ankleCenter) {
    const thighIsFolded =
      Math.abs(kneeCenter.y - hipCenter.y) < torsoHeight * 0.65 &&
      average([
        Math.abs(leftKnee.x - leftHip.x),
        Math.abs(rightKnee.x - rightHip.x),
      ]) > shoulderWidth * 0.28;
    const feetBelowKnees = ankleCenter.y > kneeCenter.y + torsoHeight * 0.22;
    const asymmetricKnees = Math.abs(leftKnee.y - rightKnee.y) > torsoHeight * 0.45;
    const wideStandingBase = Math.abs(leftAnkle.x - rightAnkle.x) > shoulderWidth * 2.1;
    const hipsAboveKnees = hipCenter.y < kneeCenter.y - torsoHeight * 0.08;

    if (torsoDy < 0 && hipsAboveKnees && thighIsFolded && feetBelowKnees && !asymmetricKnees && !wideStandingBase) {
      return buildDecision({
        confidence: average([coreConfidence, kneeCenter.visibility, ankleCenter.visibility]),
        coverageFamily: "sitting",
        orientation: "seated",
        reasons: ["torso is upright while thighs are folded toward a seated position"],
      });
    }

    const kneesSupportBody =
      kneeCenter.y > hipCenter.y + torsoHeight * 0.55 &&
      Math.abs(ankleCenter.y - kneeCenter.y) < torsoHeight * 0.38;

    if (torsoDy < 0 && kneesSupportBody && !wideStandingBase) {
      return buildDecision({
        confidence: average([coreConfidence, kneeCenter.visibility, ankleCenter.visibility]),
        coverageFamily: "kneeling",
        orientation: "kneeling",
        reasons: ["torso is upright with knees acting as the lower support points"],
      });
    }
  }

  if (torsoDy < 0) {
    return buildDecision({
      confidence: coreConfidence,
      coverageFamily: "upright",
      orientation: "upright",
      reasons: ["torso remains vertically stacked"],
    });
  }

  return buildDecision({
    confidence: coreConfidence,
    coverageFamily: "upright",
    orientation: "transitional",
    reasons: ["body orientation is not stable enough for a supported class"],
  });
}

export function shouldHoldUnsupportedBodyOrientation(
  decision: MovementBodyOrientationDecision,
) {
  return decision.orientation !== "upright" && decision.status !== "supported";
}
