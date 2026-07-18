import type {
  Category,
  HandLandmarkerResult,
  Landmark,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type {
  MovementDeepCaptureCrop,
  MovementDeepCaptureEvidenceProvenance,
  MovementDeepCaptureFaceEvidence,
  MovementDeepCaptureHandEvidence,
} from "./movementDeepCaptureContract";
import type { MovementHandSide } from "./movementTypes";
import { resolveMovementDeepCaptureHandAssignment } from "./movementDeepCaptureEvidence";

export const MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE = {
  id: "movement-deep-capture-refinement-v1",
  maximumBackoffMs: 500,
  maximumInputEdgePixels: 512,
  minimumFaceInputPixels: 256,
  minimumHandInputPixels: 192,
  staleAfterMs: 150,
  targetIntervalMs: 66,
} as const;

export type MovementDeepCaptureRefinementSchedule = {
  reason: "due" | "in-flight" | "no-roi" | "rate-limited";
  run: boolean;
};

export type MovementDeepCaptureHandRefinementRegion = {
  crop: MovementDeepCaptureCrop;
  source: "coarse-hand-landmarker" | "pose-hand-fallback";
};

export type MovementDeepCaptureHandRefinementCandidate = {
  assignment: ReturnType<typeof resolveMovementDeepCaptureHandAssignment>;
  mappedLandmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[];
};

const POSE_HAND_INDEXES = {
  left: { anchors: [17, 19, 21], wrist: 15 },
  right: { anchors: [18, 20, 22], wrist: 16 },
} as const satisfies Record<MovementHandSide, {
  anchors: readonly number[];
  wrist: number;
}>;

const POSE_HAND_WRIST_VISIBILITY = 0.35;
const POSE_HAND_ANCHOR_VISIBILITY = 0.25;

function finitePosePoint(landmark: NormalizedLandmark | null | undefined) {
  return Boolean(
    landmark &&
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    landmark.x >= -0.1 &&
    landmark.x <= 1.1 &&
    landmark.y >= -0.1 &&
    landmark.y <= 1.1
  );
}

function buildPoseHandFallbackCrop({
  frameHeight,
  frameWidth,
  poseLandmarks,
  side,
}: {
  frameHeight: number;
  frameWidth: number;
  poseLandmarks: NormalizedLandmark[];
  side: MovementHandSide;
}): MovementDeepCaptureCrop | null {
  if (frameHeight <= 0 || frameWidth <= 0) return null;
  const definition = POSE_HAND_INDEXES[side];
  const wrist = poseLandmarks[definition.wrist];
  if (
    !finitePosePoint(wrist) ||
    (wrist?.visibility ?? 0) < POSE_HAND_WRIST_VISIBILITY
  ) return null;

  const anchors = definition.anchors
    .map((index) => poseLandmarks[index])
    .filter((landmark): landmark is NormalizedLandmark => (
      finitePosePoint(landmark) &&
      (landmark.visibility ?? 0) >= POSE_HAND_ANCHOR_VISIBILITY
    ));
  // One wrist plus one coarse anchor is too ambiguous to identify a hand ROI.
  // Require at least two of Pose's pinky/index/thumb anchors and let the real
  // Hand Landmarker decide whether genuine 21-point evidence exists inside it.
  if (anchors.length < 2 || !wrist) return null;

  const wristPx = { x: wrist.x * frameWidth, y: wrist.y * frameHeight };
  const anchorPoints = anchors.map((landmark) => ({
    x: landmark.x * frameWidth,
    y: landmark.y * frameHeight,
  }));
  const palmCentre = {
    x: anchorPoints.reduce((sum, point) => sum + point.x, 0) / anchorPoints.length,
    y: anchorPoints.reduce((sum, point) => sum + point.y, 0) / anchorPoints.length,
  };
  const palmVector = {
    x: palmCentre.x - wristPx.x,
    y: palmCentre.y - wristPx.y,
  };
  const wristToPalm = Math.hypot(palmVector.x, palmVector.y);
  const anchorSpread = Math.max(...anchorPoints.flatMap((point, index) => (
    anchorPoints.slice(index + 1).map((other) => Math.hypot(
      point.x - other.x,
      point.y - other.y,
    ))
  )), 0);
  if (wristToPalm < 2 && anchorSpread < 2) return null;

  // Pose's hand anchors stop around the palm. Extend the square beyond them in
  // the wrist-to-palm direction so close fingers remain inside the fallback ROI.
  const centre = {
    x: wristPx.x + palmVector.x * 0.9,
    y: wristPx.y + palmVector.y * 0.9,
  };
  const minimumHalfExtent = Math.max(48, Math.min(frameWidth, frameHeight) * 0.065);
  const maximumHalfExtent = Math.min(frameWidth, frameHeight) * 0.46;
  const halfExtent = Math.min(
    maximumHalfExtent,
    // Pose's thumb/index/pinky anchors can collapse into a small cluster when
    // a palm is very close to the lens even though the real fingers fill most
    // of the frame. Use that cluster only to size a conservative search ROI;
    // the Hand Landmarker remains the sole source of finger evidence.
    Math.max(minimumHalfExtent, wristToPalm * 5.5, anchorSpread * 4.5),
  );
  const cropSize = Math.max(2, Math.min(
    frameWidth,
    frameHeight,
    Math.ceil(halfExtent * 2),
  ));
  // Shift the full square back inside the source frame at an edge instead of
  // clipping away the very area the fallback is trying to recover.
  const left = Math.min(
    Math.max(0, Math.floor(centre.x - cropSize / 2)),
    frameWidth - cropSize,
  );
  const top = Math.min(
    Math.max(0, Math.floor(centre.y - cropSize / 2)),
    frameHeight - cropSize,
  );
  const right = left + cropSize;
  const bottom = top + cropSize;
  if (right - left < 2 || bottom - top < 2) return null;

  return {
    height: bottom - top,
    sourceFrameHeight: frameHeight,
    sourceFrameWidth: frameWidth,
    width: right - left,
    x: left,
    y: top,
  };
}

export function resolveMovementDeepCaptureHandRefinementRegion({
  camera,
  poseLandmarks,
  primaryCrop,
  side,
}: {
  camera: { frameHeight: number; frameWidth: number };
  poseLandmarks: NormalizedLandmark[];
  primaryCrop?: MovementDeepCaptureCrop | null;
  side: MovementHandSide;
}): MovementDeepCaptureHandRefinementRegion | null {
  if (primaryCrop) {
    return { crop: primaryCrop, source: "coarse-hand-landmarker" };
  }
  const crop = buildPoseHandFallbackCrop({
    frameHeight: camera.frameHeight,
    frameWidth: camera.frameWidth,
    poseLandmarks,
    side,
  });
  return crop ? { crop, source: "pose-hand-fallback" } : null;
}

function trustworthyPoseWrist(landmark: NormalizedLandmark | null | undefined) {
  return finitePosePoint(landmark) && (landmark?.visibility ?? 0) >= POSE_HAND_WRIST_VISIBILITY
    ? landmark
    : null;
}

function completeDetectorHand(
  landmarks: NormalizedLandmark[] | null | undefined,
  worldLandmarks: Landmark[] | null | undefined,
) {
  return Boolean(
    landmarks?.length === 21 &&
    worldLandmarks?.length === 21 &&
    landmarks.every((landmark) => finitePosePoint(landmark)) &&
    worldLandmarks.every((landmark) => (
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      Number.isFinite(landmark.z)
    )),
  );
}

export function selectMovementDeepCaptureHandRefinementCandidate({
  poseLandmarks,
  refinementRegion,
  result,
  side,
}: {
  poseLandmarks: NormalizedLandmark[];
  refinementRegion: MovementDeepCaptureHandRefinementRegion;
  result: Pick<HandLandmarkerResult, "handedness" | "handednesses" | "landmarks" | "worldLandmarks">;
  side: MovementHandSide;
}): MovementDeepCaptureHandRefinementCandidate | null {
  const leftWrist = trustworthyPoseWrist(poseLandmarks[15]);
  const rightWrist = trustworthyPoseWrist(poseLandmarks[16]);
  const targetWrist = side === "left" ? leftWrist : rightWrist;

  const candidates = result.landmarks.flatMap((cropLandmarks, index) => {
    const worldLandmarks = result.worldLandmarks[index];
    if (!completeDetectorHand(cropLandmarks, worldLandmarks)) return [];
    const mappedLandmarks = mapMovementDeepCaptureCropLandmarksToSourceFrame(
      cropLandmarks,
      refinementRegion.crop,
    );
    const assignment = resolveMovementDeepCaptureHandAssignment({
      detectorCategory:
        result.handedness[index]?.[0] ?? result.handednesses[index]?.[0] as Category | undefined,
      handWrist: mappedLandmarks[0],
      leftWrist,
      rightWrist,
    });
    if (assignment.side !== side) return [];
    const wristDistance = targetWrist && mappedLandmarks[0]
      ? Math.hypot(mappedLandmarks[0].x - targetWrist.x, mappedLandmarks[0].y - targetWrist.y)
      : Number.POSITIVE_INFINITY;
    return [{
      assignment,
      mappedLandmarks,
      worldLandmarks: worldLandmarks!,
      wristDistance,
    }];
  });

  const selected = candidates.sort((left, right) => left.wristDistance - right.wristDistance)[0];
  if (!selected) return null;
  return {
    assignment: selected.assignment,
    mappedLandmarks: selected.mappedLandmarks,
    worldLandmarks: selected.worldLandmarks,
  };
}

export function resolveMovementDeepCaptureObservationState(wasOccluded: boolean) {
  return wasOccluded ? "reacquired" as const : "observed" as const;
}

export function resolveMovementDeepCaptureRefinementSchedule({
  hasRegionOfInterest,
  inFlight,
  lastCompletedAtMs,
  lastDurationMs,
  nowMs,
}: {
  hasRegionOfInterest: boolean;
  inFlight: boolean;
  lastCompletedAtMs: number | null;
  lastDurationMs: number | null;
  nowMs: number;
}): MovementDeepCaptureRefinementSchedule {
  if (!hasRegionOfInterest) return { reason: "no-roi", run: false };
  if (inFlight) return { reason: "in-flight", run: false };

  const dynamicIntervalMs = Math.min(
    MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.maximumBackoffMs,
    Math.max(
      MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.targetIntervalMs,
      (lastDurationMs ?? 0) * 3,
    ),
  );
  if (lastCompletedAtMs !== null && nowMs - lastCompletedAtMs < dynamicIntervalMs) {
    return { reason: "rate-limited", run: false };
  }
  return { reason: "due", run: true };
}

export function resolveMovementDeepCaptureRefinementInputSize({
  crop,
  minimumShortEdgePixels,
}: {
  crop: MovementDeepCaptureCrop;
  minimumShortEdgePixels: number;
}) {
  const shortEdge = Math.max(1, Math.min(crop.width, crop.height));
  const longEdge = Math.max(crop.width, crop.height);
  const scaleForMinimum = Math.max(1, minimumShortEdgePixels / shortEdge);
  const scaleForMaximum = Math.min(
    1,
    MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.maximumInputEdgePixels / longEdge,
  );
  const scale = scaleForMinimum > 1 ? scaleForMinimum : scaleForMaximum;

  return {
    height: Math.max(1, Math.round(crop.height * scale)),
    width: Math.max(1, Math.round(crop.width * scale)),
  };
}

export function mapMovementDeepCaptureCropLandmarksToSourceFrame(
  landmarks: NormalizedLandmark[],
  crop: MovementDeepCaptureCrop,
): NormalizedLandmark[] {
  const sourceWidth = Math.max(1, crop.sourceFrameWidth);
  const sourceHeight = Math.max(1, crop.sourceFrameHeight);

  return landmarks.map((landmark) => ({
    ...landmark,
    x: (crop.x + landmark.x * crop.width) / sourceWidth,
    y: (crop.y + landmark.y * crop.height) / sourceHeight,
    // MediaPipe normalized z uses approximately the same scale as x. Keep that
    // convention when moving from crop space back into full-frame space.
    z: (landmark.z ?? 0) * (crop.width / sourceWidth),
  }));
}

export function ageMovementDeepCaptureProvenance({
  nowMs,
  provenance,
}: {
  nowMs: number;
  provenance: MovementDeepCaptureEvidenceProvenance;
}): MovementDeepCaptureEvidenceProvenance | null {
  const ageMs = Math.max(0, nowMs - provenance.inferenceTimestampMs);
  if (ageMs > MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.staleAfterMs) return null;

  return {
    ...provenance,
    ageMs,
    confidence: provenance.confidence * (
      1 - ageMs / MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.staleAfterMs
    ),
    origin: "temporally-tracked",
  };
}

function ageDerivedProvenance(
  provenance: MovementDeepCaptureEvidenceProvenance,
  nowMs: number,
) {
  const aged = ageMovementDeepCaptureProvenance({ nowMs, provenance });
  return aged ? { ...aged, origin: "derived" as const } : null;
}

export function carryMovementDeepCaptureHandEvidence({
  evidence,
  nowMs,
  occluded = true,
}: {
  evidence: MovementDeepCaptureHandEvidence;
  nowMs: number;
  occluded?: boolean;
}): MovementDeepCaptureHandEvidence | null {
  const provenance = ageMovementDeepCaptureProvenance({
    nowMs,
    provenance: evidence.provenance,
  });
  if (!provenance) return null;
  const orientationProvenance = evidence.orientation
    ? ageDerivedProvenance(evidence.orientation.provenance, nowMs)
    : null;
  const fingerJointAngles = Object.fromEntries(
    Object.entries(evidence.fingerJointAngles ?? {}).flatMap(([key, value]) => {
      const jointProvenance = ageDerivedProvenance(value.provenance, nowMs);
      return jointProvenance
        ? [[key, { ...value, provenance: jointProvenance }]]
        : [];
    }),
  );

  return {
    ...evidence,
    fingerJointAngles,
    orientation: evidence.orientation && orientationProvenance
      ? { ...evidence.orientation, provenance: orientationProvenance }
      : undefined,
    provenance,
    tracking: { occluded, state: "temporally-carried" },
  };
}

export function carryMovementDeepCaptureFaceEvidence({
  evidence,
  nowMs,
  occluded = true,
}: {
  evidence: MovementDeepCaptureFaceEvidence;
  nowMs: number;
  occluded?: boolean;
}): MovementDeepCaptureFaceEvidence | null {
  const provenance = ageMovementDeepCaptureProvenance({
    nowMs,
    provenance: evidence.provenance,
  });
  const gazeProvenance = ageDerivedProvenance(evidence.gaze.provenance, nowMs);
  if (!provenance || !gazeProvenance) return null;

  return {
    ...evidence,
    gaze: { ...evidence.gaze, provenance: gazeProvenance },
    provenance,
    tracking: { occluded, state: "temporally-carried" },
  };
}
