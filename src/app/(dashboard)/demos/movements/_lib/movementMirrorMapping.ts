import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementMirrorMode = "facing-player" | "same-side";

export type MovementBodySide = "left" | "right";

export type MovementDisplayMapping = {
  avatarSide: MovementBodySide;
  mirrorMode: MovementMirrorMode;
  sourceSide: MovementBodySide;
};

export const MOVEMENT_LANDMARK_MIRROR_PAIRS = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
] as const;

export function mapMovementDisplaySide(
  sourceSide: MovementBodySide,
  mirrorMode: MovementMirrorMode,
): MovementBodySide {
  if (mirrorMode === "same-side") return sourceSide;
  return sourceSide === "left" ? "right" : "left";
}

export function getMovementDisplayMapping(
  sourceSide: MovementBodySide,
  mirrorMode: MovementMirrorMode,
): MovementDisplayMapping {
  return {
    avatarSide: mapMovementDisplaySide(sourceSide, mirrorMode),
    mirrorMode,
    sourceSide,
  };
}

export function mirrorMovementLandmarksForDisplay(
  landmarks: TrackingLandmark[],
  {
    mirrorMode,
    mapX,
  }: {
    mapX: (x: number) => number;
    mirrorMode: MovementMirrorMode;
  },
): TrackingLandmark[] {
  if (mirrorMode === "same-side") {
    return landmarks.map((landmark) => ({ ...landmark }));
  }

  const mirrored = landmarks.map((landmark) => ({
    ...landmark,
    x: mapX(landmark.x),
  }));

  MOVEMENT_LANDMARK_MIRROR_PAIRS.forEach(([leftIndex, rightIndex]) => {
    if (!mirrored[leftIndex] || !mirrored[rightIndex]) return;
    const left = mirrored[leftIndex]!;
    mirrored[leftIndex] = mirrored[rightIndex]!;
    mirrored[rightIndex] = left;
  });

  return mirrored;
}
