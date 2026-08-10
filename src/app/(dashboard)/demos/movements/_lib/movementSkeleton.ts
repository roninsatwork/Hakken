import type { MovementFrame, MovementLandmark } from "./movementTypes";
import type { MovementDeepCaptureSurfaceAnchor } from "./movementDeepCaptureContract";
import { getFrameLandmarks } from "./movementFrameCodec";
import { buildMovementSpineModel, type MovementSpinePoint } from "./movementSpineMetrics";
import {
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
} from "./movementPalette";

export const MOVEMENT_POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [15, 17], [15, 19], [15, 21], [17, 19],
  [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
] as const;

export const MOVEMENT_HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
] as const;

// A readable 97-point diagnostic subset of MediaPipe's fixed 478-point face
// output: oval, eyes, brows, lips, nose, and all ten iris landmarks. The full
// mesh remains available through the explicit debug toggle.
export const MOVEMENT_ESSENTIAL_FACE_LANDMARK_INDEXES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
  263, 249, 374, 381, 362, 388, 386, 384,
  33, 7, 145, 154, 133, 157, 159, 161,
  276, 282, 285, 293, 296,
  46, 52, 55, 63, 66,
  61, 91, 84, 314, 321, 291, 324, 402, 14, 178,
  95, 78, 80, 82, 13, 312, 310, 415, 308, 88,
  1, 2, 98, 327, 168,
  468, 469, 470, 471, 472, 473, 474, 475, 476, 477,
] as const;

export type MovementTrackingOverlayDetail = "essential" | "all";

const MOVEMENT_FACE_LANDMARK_COUNT = 478;
const MOVEMENT_ESSENTIAL_DENSE_ANCHORS_PER_REGION = 4;

type MovementHandOverlayInput = Partial<Record<"left" | "right", {
  landmarks: MovementLandmark[];
} | null>>;

function finiteImagePoint(point: { x: number; y: number } | null | undefined) {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 &&
    point.y >= 0 && point.y <= 1
  );
}

function drawBatchedPoints(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  width: number,
  height: number,
  radius: number,
) {
  if (points.length === 0) return;
  ctx.beginPath();
  points.forEach((point) => {
    ctx.moveTo((1 - point.x) * width + radius, point.y * height);
    ctx.arc((1 - point.x) * width, point.y * height, radius, 0, 2 * Math.PI);
  });
  ctx.fill();
}

export function selectMovementDenseBodyOverlayAnchors(
  anchors: MovementDeepCaptureSurfaceAnchor[] | null | undefined,
  detail: MovementTrackingOverlayDetail,
) {
  const valid = (anchors ?? []).filter((anchor) => finiteImagePoint(anchor.image));
  if (detail === "all") return valid;

  const byRegion = new Map<string, MovementDeepCaptureSurfaceAnchor[]>();
  valid.forEach((anchor) => {
    const group = byRegion.get(anchor.region) ?? [];
    group.push(anchor);
    byRegion.set(anchor.region, group);
  });

  return [...byRegion.values()].flatMap((group) => {
    if (group.length <= MOVEMENT_ESSENTIAL_DENSE_ANCHORS_PER_REGION) return group;
    return Array.from(
      { length: MOVEMENT_ESSENTIAL_DENSE_ANCHORS_PER_REGION },
      (_, index) => group[Math.floor(
        (index + 0.5) * group.length / MOVEMENT_ESSENTIAL_DENSE_ANCHORS_PER_REGION,
      )]!,
    );
  });
}

function toCanvasPoint(point: MovementSpinePoint, width: number, height: number) {
  return {
    x: (1 - point.x) * width,
    y: point.y * height,
  };
}

function getSpineColor(score: number) {
  if (score >= 75) return MOVEMENT_MINT;
  if (score >= 50) return MOVEMENT_SALMON;
  return "#f28b82";
}

export function drawMovementSpineGuide(
  ctx: CanvasRenderingContext2D,
  landmarks: MovementLandmark[],
  width: number,
  height: number,
) {
  const spine = buildMovementSpineModel(landmarks);
  if (!spine || spine.confidence < 0.25) return;

  const head = toCanvasPoint(spine.headCenter, width, height);
  const shoulders = toCanvasPoint(spine.shoulderCenter, width, height);
  const ribs = toCanvasPoint(spine.ribcageCenter, width, height);
  const pelvis = toCanvasPoint(spine.pelvisCenter, width, height);
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const spineColor = getSpineColor(spine.neutralStackScore);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = spineColor;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = spineColor;
  ctx.fillStyle = spineColor;
  ctx.globalAlpha = 0.92;

  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.quadraticCurveTo(shoulders.x, shoulders.y, ribs.x, ribs.y);
  ctx.quadraticCurveTo(ribs.x, ribs.y, pelvis.x, pelvis.y);
  ctx.stroke();

  ctx.shadowBlur = 10;
  ctx.lineWidth = 5;
  if (leftShoulder && rightShoulder) {
    ctx.beginPath();
    ctx.moveTo((1 - leftShoulder.x) * width, leftShoulder.y * height);
    ctx.lineTo((1 - rightShoulder.x) * width, rightShoulder.y * height);
    ctx.stroke();
  }
  if (leftHip && rightHip) {
    ctx.beginPath();
    ctx.moveTo((1 - leftHip.x) * width, leftHip.y * height);
    ctx.lineTo((1 - rightHip.x) * width, rightHip.y * height);
    ctx.stroke();
  }

  [head, shoulders, ribs, pelvis].forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.restore();
}

export function drawMovementSkeleton(
  ctx: CanvasRenderingContext2D,
  frameOrLandmarks: MovementFrame | MovementLandmark[] | null | undefined,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : getFrameLandmarks(frameOrLandmarks ?? undefined);

  if (landmarks.length === 0) return;

  drawMovementSpineGuide(ctx, landmarks, width, height);

  ctx.strokeStyle = "#0ff";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#0ff";
  ctx.shadowBlur = 15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  MOVEMENT_POSE_CONNECTIONS.forEach(([start, end]) => {
    const p1 = landmarks[start];
    const p2 = landmarks[end];
    if (p1 && p2 && (p1.visibility ?? 0) > 0.5 && (p2.visibility ?? 0) > 0.5) {
      ctx.moveTo((1 - p1.x) * width, p1.y * height);
      ctx.lineTo((1 - p2.x) * width, p2.y * height);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#f0f";
  ctx.shadowColor = "#f0f";
  landmarks.forEach((landmark) => {
    if ((landmark.visibility ?? 0) > 0.5) {
      ctx.beginPath();
      ctx.arc((1 - landmark.x) * width, landmark.y * height, 6, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}

export function drawMovementFaceOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: MovementLandmark[] | null | undefined,
  width: number,
  height: number,
  detail: MovementTrackingOverlayDetail = "essential",
) {
  // Do not turn a partial/coarse payload into a dense face display. The fixed
  // Face Landmarker contract supplies 478 points, including ten iris points.
  if (!landmarks || landmarks.length < MOVEMENT_FACE_LANDMARK_COUNT) return;
  const completeFace = landmarks.slice(0, MOVEMENT_FACE_LANDMARK_COUNT);
  if (!completeFace.every((landmark) => finiteImagePoint(landmark))) return;

  const indexes = detail === "all"
    ? Array.from({ length: MOVEMENT_FACE_LANDMARK_COUNT }, (_, index) => index)
    : MOVEMENT_ESSENTIAL_FACE_LANDMARK_INDEXES;
  const facePoints = indexes
    .filter((index) => index < 468)
    .map((index) => completeFace[index]!);
  const irisPoints = indexes
    .filter((index) => index >= 468)
    .map((index) => completeFace[index]!);

  ctx.save();
  ctx.globalAlpha = detail === "all" ? 0.58 : 0.82;
  ctx.fillStyle = "#c4b5fd";
  drawBatchedPoints(ctx, facePoints, width, height, detail === "all" ? 1.05 : 1.55);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#34d399";
  drawBatchedPoints(ctx, irisPoints, width, height, detail === "all" ? 1.8 : 2.4);
  ctx.restore();
}

export function drawMovementDenseBodyOverlay(
  ctx: CanvasRenderingContext2D,
  anchors: MovementDeepCaptureSurfaceAnchor[] | null | undefined,
  width: number,
  height: number,
  detail: MovementTrackingOverlayDetail = "essential",
) {
  const selected = selectMovementDenseBodyOverlayAnchors(anchors, detail);
  if (selected.length === 0) return;

  const groups = new Map<string, MovementDeepCaptureSurfaceAnchor[]>();
  selected.forEach((anchor) => {
    const freshness = anchor.occluded || anchor.provenance.origin === "temporally-tracked"
      ? "tracked"
      : "current";
    const key = `${anchor.anatomicalSide}:${freshness}`;
    const group = groups.get(key) ?? [];
    group.push(anchor);
    groups.set(key, group);
  });

  const colors = {
    left: "#38bdf8",
    midline: "#a3e635",
    right: "#fb7185",
  } as const;
  ctx.save();
  ctx.shadowBlur = 0;
  groups.forEach((group, key) => {
    const [side, freshness] = key.split(":") as [keyof typeof colors, "current" | "tracked"];
    ctx.globalAlpha = freshness === "tracked" ? 0.3 : detail === "all" ? 0.52 : 0.78;
    ctx.fillStyle = colors[side];
    drawBatchedPoints(
      ctx,
      group.map((anchor) => anchor.image),
      width,
      height,
      detail === "all" ? 1.25 : 2.1,
    );
  });
  ctx.restore();
}

export function drawMovementHandOverlay(
  ctx: CanvasRenderingContext2D,
  hands: MovementHandOverlayInput | null | undefined,
  width: number,
  height: number,
) {
  if (!hands) return;

  (["left", "right"] as const).forEach((side) => {
    const landmarks = hands[side]?.landmarks;
    // The four Pose hand anchors are not finger evidence. Draw a finger
    // skeleton only when a detector supplied the complete 21-point payload.
    if (
      !landmarks ||
      landmarks.length !== 21 ||
      !landmarks.every((landmark) => finiteImagePoint(landmark))
    ) return;

    const color = side === "left" ? "#7dd3fc" : "#fbbf24";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.beginPath();
    MOVEMENT_HAND_CONNECTIONS.forEach(([start, end]) => {
      const from = landmarks[start];
      const to = landmarks[end];
      if (!from || !to) return;
      ctx.moveTo((1 - from.x) * width, from.y * height);
      ctx.lineTo((1 - to.x) * width, to.y * height);
    });
    ctx.stroke();

    landmarks.forEach((landmark) => {
      ctx.beginPath();
      ctx.arc((1 - landmark.x) * width, landmark.y * height, 4.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.restore();
  });
}
