import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementMirrorMode = "facing-player" | "same-side";

export type MovementAnatomicalMapping = "identity" | "opposite";

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

export type MovementSideOwnershipProofRow = {
  bodyPart: string;
  mirrorMode: MovementMirrorMode;
  sourceLeftAvatarSide: "avatarLeft" | "avatarRight";
  sourceLeftDisplayIndex: number;
  sourceLeftMatchesDisplay: boolean;
  sourceRightAvatarSide: "avatarLeft" | "avatarRight";
  sourceRightDisplayIndex: number;
  sourceRightMatchesDisplay: boolean;
};

export const MOVEMENT_SIDE_OWNERSHIP_PROOF_PAIRS = [
  { bodyPart: "eye-inner", leftIndex: 1, rightIndex: 4 },
  { bodyPart: "eye", leftIndex: 2, rightIndex: 5 },
  { bodyPart: "eye-outer", leftIndex: 3, rightIndex: 6 },
  { bodyPart: "ear", leftIndex: 7, rightIndex: 8 },
  { bodyPart: "mouth", leftIndex: 9, rightIndex: 10 },
  { bodyPart: "shoulder", leftIndex: 11, rightIndex: 12 },
  { bodyPart: "elbow", leftIndex: 13, rightIndex: 14 },
  { bodyPart: "wrist", leftIndex: 15, rightIndex: 16 },
  { bodyPart: "pinky", leftIndex: 17, rightIndex: 18 },
  { bodyPart: "index", leftIndex: 19, rightIndex: 20 },
  { bodyPart: "thumb", leftIndex: 21, rightIndex: 22 },
  { bodyPart: "hip", leftIndex: 23, rightIndex: 24 },
  { bodyPart: "knee", leftIndex: 25, rightIndex: 26 },
  { bodyPart: "ankle", leftIndex: 27, rightIndex: 28 },
  { bodyPart: "heel", leftIndex: 29, rightIndex: 30 },
  { bodyPart: "foot-index", leftIndex: 31, rightIndex: 32 },
] as const;

function closeEnough(left: number | undefined, right: number | undefined) {
  if (left === undefined || right === undefined) return false;
  return Math.abs(left - right) < 0.0001;
}

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

export function buildMovementSideOwnershipProof({
  displayLandmarks,
  mapX,
  mirrorMode,
  sourceLandmarks,
}: {
  displayLandmarks: TrackingLandmark[];
  mapX?: (x: number) => number;
  mirrorMode: MovementMirrorMode;
  sourceLandmarks: TrackingLandmark[];
}): MovementSideOwnershipProofRow[] {
  const mapDisplayX = mapX ?? ((x: number) => x);

  return MOVEMENT_SIDE_OWNERSHIP_PROOF_PAIRS.map(({ bodyPart, leftIndex, rightIndex }) => {
    const sourceLeftDisplayIndex = mirrorMode === "facing-player" ? rightIndex : leftIndex;
    const sourceRightDisplayIndex = mirrorMode === "facing-player" ? leftIndex : rightIndex;
    const sourceLeft = sourceLandmarks[leftIndex];
    const sourceRight = sourceLandmarks[rightIndex];
    const displayFromSourceLeft = displayLandmarks[sourceLeftDisplayIndex];
    const displayFromSourceRight = displayLandmarks[sourceRightDisplayIndex];

    return {
      bodyPart,
      mirrorMode,
      sourceLeftAvatarSide: mapMovementDisplaySide("left", mirrorMode) === "left" ? "avatarLeft" : "avatarRight",
      sourceLeftDisplayIndex,
      sourceLeftMatchesDisplay: closeEnough(displayFromSourceLeft?.x, sourceLeft ? mapDisplayX(sourceLeft.x) : undefined),
      sourceRightAvatarSide: mapMovementDisplaySide("right", mirrorMode) === "left" ? "avatarLeft" : "avatarRight",
      sourceRightDisplayIndex,
      sourceRightMatchesDisplay: closeEnough(displayFromSourceRight?.x, sourceRight ? mapDisplayX(sourceRight.x) : undefined),
    };
  });
}
