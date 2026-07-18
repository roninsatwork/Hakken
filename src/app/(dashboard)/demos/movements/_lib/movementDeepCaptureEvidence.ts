import type {
  Category,
  FaceLandmarkerResult,
  Landmark,
  NormalizedLandmark,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { resolveHandSideByWrist } from "./handMatching";
import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  type MovementDeepCaptureCrop,
  type MovementDeepCaptureEvidenceProvenance,
  type MovementDeepCaptureFaceEvidence,
  type MovementDeepCaptureHandEvidence,
  type MovementDeepCaptureBodyEvidence,
} from "./movementDeepCaptureContract";
import type { MovementHandSide } from "./movementTypes";

type Point3D = { x: number; y: number; z: number };

const HAND_CROP_PADDING_RATIO = 0.3;
const FACE_CROP_PADDING_RATIO = 0.15;
const PALM_EDGE_ON_THRESHOLD = 0.25;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function subtract(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function magnitude(vector: Point3D) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Point3D): Point3D | null {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot(a: Point3D, b: Point3D) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function point(landmark: Landmark | NormalizedLandmark): Point3D {
  return { x: landmark.x, y: landmark.y, z: landmark.z ?? 0 };
}

function buildCrop(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
  paddingRatio: number,
): MovementDeepCaptureCrop | null {
  if (landmarks.length === 0 || frameWidth <= 0 || frameHeight <= 0) return null;

  const xs = landmarks.map(({ x }) => x).filter(Number.isFinite);
  const ys = landmarks.map(({ y }) => y).filter(Number.isFinite);
  if (xs.length === 0 || ys.length === 0) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const paddingX = Math.max((maxX - minX) * paddingRatio, 4 / frameWidth);
  const paddingY = Math.max((maxY - minY) * paddingRatio, 4 / frameHeight);
  const x = clamp(Math.floor((minX - paddingX) * frameWidth), 0, frameWidth - 1);
  const y = clamp(Math.floor((minY - paddingY) * frameHeight), 0, frameHeight - 1);
  const right = clamp(Math.ceil((maxX + paddingX) * frameWidth), x + 1, frameWidth);
  const bottom = clamp(Math.ceil((maxY + paddingY) * frameHeight), y + 1, frameHeight);

  return {
    height: bottom - y,
    sourceFrameHeight: frameHeight,
    sourceFrameWidth: frameWidth,
    width: right - x,
    x,
    y,
  };
}

function provenance({
  confidence,
  capturedAt,
  sourceTimestampMs,
}: {
  confidence: number;
  capturedAt: number;
  sourceTimestampMs: number;
}): MovementDeepCaptureEvidenceProvenance {
  return {
    ageMs: 0,
    confidence: clamp(confidence, 0, 1),
    inferenceTimestampMs: capturedAt,
    origin: "model-estimated",
    sourceTimestampMs,
  };
}

function detectorHandedness(category: Category | undefined) {
  const rawLabel = category?.categoryName || category?.displayName || "";
  const label = rawLabel.toLowerCase() === "left"
    ? "Left"
    : rawLabel.toLowerCase() === "right"
      ? "Right"
      : "Unknown";
  return {
    label: label as "Left" | "Right" | "Unknown",
    score: clamp(category?.score ?? 0, 0, 1),
  };
}

function trustworthyPoseWrist(landmark: NormalizedLandmark | null | undefined) {
  return landmark &&
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    (landmark.visibility ?? 0) >= 0.35
    ? landmark
    : null;
}

export function resolveMovementDeepCaptureHandAssignment({
  detectorCategory,
  handWrist,
  leftWrist,
  rightWrist,
}: {
  detectorCategory?: Category;
  handWrist?: NormalizedLandmark | null;
  leftWrist?: NormalizedLandmark | null;
  rightWrist?: NormalizedLandmark | null;
}): {
  assignment: MovementDeepCaptureHandEvidence["assignment"];
  detector: ReturnType<typeof detectorHandedness>;
  side: MovementHandSide;
} {
  const detector = detectorHandedness(detectorCategory);
  const detectorSide = detector.label === "Unknown"
    ? null
    : detector.label.toLowerCase() as MovementHandSide;
  const trustworthyLeftWrist = trustworthyPoseWrist(leftWrist);
  const trustworthyRightWrist = trustworthyPoseWrist(rightWrist);
  const hasPoseWristEvidence = Boolean(trustworthyLeftWrist || trustworthyRightWrist);
  const side = resolveHandSideByWrist({
    fallback: detectorSide ?? "right",
    handWrist,
    leftWrist: trustworthyLeftWrist,
    rightWrist: trustworthyRightWrist,
  });

  return {
    assignment: detectorSide === side
      ? "detector"
      : detectorSide && hasPoseWristEvidence
        ? "pose-wrist-reconciled"
        : "ambiguous",
    detector,
    side,
  };
}

function jointAngle(a: Point3D, b: Point3D, c: Point3D) {
  const from = normalize(subtract(a, b));
  const to = normalize(subtract(c, b));
  if (!from || !to) return null;
  return Math.acos(clamp(dot(from, to), -1, 1));
}

function fingerJointAngles(
  landmarks: Array<Landmark | NormalizedLandmark>,
  evidenceProvenance: MovementDeepCaptureEvidenceProvenance,
) {
  const fingers = [
    ["thumb", [0, 1, 2, 3, 4]],
    ["index", [0, 5, 6, 7, 8]],
    ["middle", [0, 9, 10, 11, 12]],
    ["ring", [0, 13, 14, 15, 16]],
    ["pinky", [0, 17, 18, 19, 20]],
  ] as const;
  const result: NonNullable<MovementDeepCaptureHandEvidence["fingerJointAngles"]> = {};

  for (const [finger, indexes] of fingers) {
    for (let jointIndex = 1; jointIndex < indexes.length - 1; jointIndex += 1) {
      const previous = landmarks[indexes[jointIndex - 1]];
      const current = landmarks[indexes[jointIndex]];
      const next = landmarks[indexes[jointIndex + 1]];
      if (!previous || !current || !next) continue;
      const angle = jointAngle(point(previous), point(current), point(next));
      if (angle !== null) {
        result[`${finger}.${jointIndex}`] = {
          provenance: evidenceProvenance,
          radians: angle,
        };
      }
    }
  }

  return result;
}

function handOrientation(
  landmarks: Array<Landmark | NormalizedLandmark>,
  side: MovementHandSide,
  evidenceProvenance: MovementDeepCaptureEvidenceProvenance,
): NonNullable<MovementDeepCaptureHandEvidence["orientation"]> {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];
  if (!wrist || !indexMcp || !middleMcp || !pinkyMcp) {
    return { facing: "unknown", palmNormal: null, provenance: evidenceProvenance, wristRotation: null };
  }

  const wristPoint = point(wrist);
  const indexAxis = subtract(point(indexMcp), wristPoint);
  const pinkyAxis = subtract(point(pinkyMcp), wristPoint);
  const middleAxis = normalize(subtract(point(middleMcp), wristPoint));
  const rawNormal = normalize(cross(indexAxis, pinkyAxis));
  if (!rawNormal || !middleAxis) {
    return { facing: "unknown", palmNormal: null, provenance: evidenceProvenance, wristRotation: null };
  }

  // Correct the cross-product winding so left and right palms share one
  // camera-facing sign without changing anatomical side ownership.
  const handednessMultiplier = side === "left" ? -1 : 1;
  const palmNormal = {
    x: rawNormal.x * handednessMultiplier,
    y: rawNormal.y * handednessMultiplier,
    z: rawNormal.z * handednessMultiplier,
  };
  const facing = Math.abs(palmNormal.z) < PALM_EDGE_ON_THRESHOLD
    ? "edge-on"
    : palmNormal.z < 0
      ? "palm-facing-camera"
      : "palm-facing-away";

  return {
    facing,
    palmNormal,
    provenance: evidenceProvenance,
    wristRotation: {
      x: Math.atan2(middleAxis.z, Math.hypot(middleAxis.x, middleAxis.y)),
      y: Math.atan2(palmNormal.x, -palmNormal.z),
      z: Math.atan2(middleAxis.x, -middleAxis.y),
    },
  };
}

export function buildMovementDeepCaptureHandEvidence({
  assignment,
  camera,
  capturedAt,
  detector,
  landmarks,
  side,
  sourceTimestampMs,
  worldLandmarks,
}: {
  assignment: MovementDeepCaptureHandEvidence["assignment"];
  camera: { frameHeight: number; frameWidth: number };
  capturedAt: number;
  detector: ReturnType<typeof detectorHandedness>;
  landmarks: NormalizedLandmark[];
  side: MovementHandSide;
  sourceTimestampMs: number;
  worldLandmarks?: Landmark[] | null;
}): MovementDeepCaptureHandEvidence | null {
  const crop = buildCrop(
    landmarks,
    camera.frameWidth,
    camera.frameHeight,
    HAND_CROP_PADDING_RATIO,
  );
  if (!crop || landmarks.length < 21) return null;
  const orientationLandmarks = worldLandmarks?.length === 21 ? worldLandmarks : landmarks;
  const modelProvenance = provenance({
    capturedAt,
    confidence: detector.score,
    sourceTimestampMs,
  });
  const derivedProvenance = {
    ...modelProvenance,
    origin: "derived" as const,
  };

  return {
    assignment,
    crop,
    detectorHandedness: detector,
    fingerJointAngles: fingerJointAngles(orientationLandmarks, derivedProvenance),
    orientation: handOrientation(orientationLandmarks, side, derivedProvenance),
    provenance: modelProvenance,
    tracking: { occluded: false, state: "observed" },
  };
}

function averagePoints(points: Point3D[]): Point3D | null {
  if (points.length === 0) return null;
  return {
    x: points.reduce((sum, value) => sum + value.x, 0) / points.length,
    y: points.reduce((sum, value) => sum + value.y, 0) / points.length,
    z: points.reduce((sum, value) => sum + value.z, 0) / points.length,
  };
}

function eyeGaze(
  landmarks: NormalizedLandmark[],
  irisIndexes: number[],
  cornerIndexes: [number, number],
): Point3D | null {
  const iris = averagePoints(irisIndexes.flatMap((index) => (
    landmarks[index] ? [point(landmarks[index])] : []
  )));
  const firstCorner = landmarks[cornerIndexes[0]];
  const secondCorner = landmarks[cornerIndexes[1]];
  if (!iris || !firstCorner || !secondCorner) return null;
  const first = point(firstCorner);
  const second = point(secondCorner);
  const centre = averagePoints([first, second]);
  const width = magnitude(subtract(first, second));
  if (!centre || width < 1e-6) return null;

  return normalize({
    x: (iris.x - centre.x) / width,
    y: (iris.y - centre.y) / width,
    z: -1,
  });
}

export function buildMovementDeepCaptureFaceEvidence({
  camera,
  capturedAt,
  faceResults,
  sourceTimestampMs,
}: {
  camera: { frameHeight: number; frameWidth: number };
  capturedAt: number;
  faceResults: FaceLandmarkerResult;
  sourceTimestampMs: number;
}): MovementDeepCaptureFaceEvidence | null {
  const landmarks = faceResults.faceLandmarks[0];
  if (!landmarks) return null;
  const crop = buildCrop(
    landmarks,
    camera.frameWidth,
    camera.frameHeight,
    FACE_CROP_PADDING_RATIO,
  );
  if (!crop) return null;

  const left = eyeGaze(landmarks, [468, 469, 470, 471, 472], [33, 133]);
  const right = eyeGaze(landmarks, [473, 474, 475, 476, 477], [362, 263]);
  const fused = left && right ? normalize({
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  }) : left ?? right;
  const matrix = faceResults.facialTransformationMatrixes[0];
  const irisLandmarkCount = Array.from({ length: 10 }, (_, index) => 468 + index)
    .filter((index) => Boolean(landmarks[index]))
    .length;
  const landmarkConfidence = landmarks.reduce(
    (sum, landmark) => sum + (landmark.visibility ?? 1),
    0,
  ) / Math.max(1, landmarks.length);
  const modelProvenance = provenance({
    capturedAt,
    confidence: landmarkConfidence,
    sourceTimestampMs,
  });

  return {
    crop,
    eyeVisibility: {
      eyewear: "unknown",
      left: left ? "visible" : "occluded-or-unresolved",
      right: right ? "visible" : "occluded-or-unresolved",
    },
    facialTransformationMatrix: matrix?.data.length === 16 ? [...matrix.data] : null,
    gaze: {
      fused,
      left,
      provenance: { ...modelProvenance, origin: "derived" },
      right,
    },
    irisLandmarkCount,
    provenance: modelProvenance,
    tracking: { occluded: false, state: "observed" },
  };
}

function encodeMaskRle(mask: Float32Array, threshold: number) {
  const runs: number[][] = [];
  if (mask.length === 0) return runs;
  let current = mask[0] >= threshold ? 1 : 0;
  let count = 0;

  mask.forEach((confidence) => {
    const value = confidence >= threshold ? 1 : 0;
    if (value === current) {
      count += 1;
      return;
    }
    runs.push([current, count]);
    current = value;
    count = 1;
  });
  runs.push([current, count]);
  return runs;
}

export function buildMovementDeepCaptureSegmentationEvidence({
  camera,
  capturedAt,
  poseResults,
  sourceTimestampMs,
  threshold = 0.5,
}: {
  camera: { frameHeight: number; frameWidth: number };
  capturedAt: number;
  poseResults: PoseLandmarkerResult;
  sourceTimestampMs: number;
  threshold?: number;
}): MovementDeepCaptureBodyEvidence | null {
  const mask = poseResults.segmentationMasks?.[0];
  if (!mask || mask.width <= 0 || mask.height <= 0) return null;
  const confidenceMask = mask.getAsFloat32Array();
  if (confidenceMask.length === 0) return null;
  let bodyPixelCount = 0;
  let bodyConfidenceTotal = 0;
  confidenceMask.forEach((confidence) => {
    if (confidence < threshold) return;
    bodyPixelCount += 1;
    bodyConfidenceTotal += confidence;
  });
  const segmentationProvenance = provenance({
    capturedAt,
    confidence: bodyPixelCount > 0 ? bodyConfidenceTotal / bodyPixelCount : 0,
    sourceTimestampMs,
  });

  return {
    anchors: [],
    modelHash: "unverified:mediapipe-pose-landmarker",
    modelId: "mediapipe-pose-segmentation-v1",
    segmentation: {
      confidence: segmentationProvenance.confidence,
      coverage: bodyPixelCount / confidenceMask.length,
      encoding: "model-rle",
      frameHeight: camera.frameHeight,
      frameWidth: camera.frameWidth,
      maskHeight: mask.height,
      maskWidth: mask.width,
      payload: encodeMaskRle(confidenceMask, threshold),
      provenance: segmentationProvenance,
    },
  };
}

export function createMovementDeepCaptureFrameEvidence() {
  return {
    profileId: MOVEMENT_DEEP_CAPTURE_PROFILE.id,
  } as const;
}
