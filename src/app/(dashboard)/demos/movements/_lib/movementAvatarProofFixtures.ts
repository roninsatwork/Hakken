import type { VrmMotionPayload, VrmPoseLandmark } from "./vrmRigging";

export type MovementAvatarProofMotionLandmark = VrmPoseLandmark & {
  visibility: number;
  z: number;
};

export type MovementAvatarProofMotionPayload = {
  blendshapes?: VrmMotionPayload["blendshapes"];
  faceLandmarks?: MovementAvatarProofMotionLandmark[] | null;
  landmarks: MovementAvatarProofMotionLandmark[];
  pose?: MovementAvatarProofMotionLandmark[];
  worldLandmarks?: MovementAvatarProofMotionLandmark[] | null;
  hands?: {
    left?: { landmarks: MovementAvatarProofMotionLandmark[] } | null;
    right?: { landmarks: MovementAvatarProofMotionLandmark[] } | null;
  };
};

export type MovementAvatarProofMode =
  | "far-left-leg-raise"
  | "far-right-leg-raise"
  | "far-squat"
  | "hands-front"
  | "left-leg-raise"
  | "lower-body-out-of-frame"
  | "right-leg-raise"
  | "side-bend"
  | "squat"
  | "standing"
  | "upper-body-auto"
  | "upper-body-auto-rejected"
  | "weak-feet-standing";

export const MOVEMENT_AVATAR_PROOF_MODES: MovementAvatarProofMode[] = [
  "standing",
  "side-bend",
  "hands-front",
  "squat",
  "far-squat",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "weak-feet-standing",
  "lower-body-out-of-frame",
  "upper-body-auto",
  "upper-body-auto-rejected",
];

export const MOVEMENT_AVATAR_PROOF_LABELS: Record<MovementAvatarProofMode, string> = {
  "far-left-leg-raise": "Far left leg raise",
  "far-right-leg-raise": "Far right leg raise",
  "far-squat": "Far squat",
  "hands-front": "Hands front",
  "left-leg-raise": "Left leg raise",
  "lower-body-out-of-frame": "Lower body out of frame",
  "right-leg-raise": "Right leg raise",
  "side-bend": "Side bend",
  squat: "Squat",
  standing: "Standing",
  "upper-body-auto": "Upper-body auto baseline",
  "upper-body-auto-rejected": "Upper-body auto rejected",
  "weak-feet-standing": "Weak feet standing",
};

export function toMovementAvatarProofMode(value: string | null): MovementAvatarProofMode | null {
  return MOVEMENT_AVATAR_PROOF_MODES.find((mode) => mode === value) ?? null;
}

export function movementAvatarProofLandmark(
  x: number,
  y: number,
  z = 0,
  visibility = 0.92,
): VrmPoseLandmark {
  return { x, y, z, visibility };
}

function makeProofHandLandmarks(wrist: VrmPoseLandmark): VrmPoseLandmark[] {
  return Array.from({ length: 21 }, (_, index) => {
    if (index === 0) return wrist;

    const finger = index % 4;
    const row = Math.floor(index / 4);
    return movementAvatarProofLandmark(
      wrist.x + (finger - 1.5) * 0.006,
      wrist.y - row * 0.006,
      (wrist.z ?? 0) - 0.01,
      wrist.visibility,
    );
  });
}

function getBaseProofMode(mode: MovementAvatarProofMode): MovementAvatarProofMode {
  if (mode === "far-squat") return "squat";
  if (mode === "far-left-leg-raise") return "left-leg-raise";
  if (mode === "far-right-leg-raise") return "right-leg-raise";
  if (mode === "upper-body-auto") return "standing";
  if (mode === "upper-body-auto-rejected") return "side-bend";
  if (mode === "weak-feet-standing" || mode === "lower-body-out-of-frame") return "standing";
  return mode;
}

function isFarProofMode(mode: MovementAvatarProofMode) {
  return mode === "far-squat" || mode === "far-left-leg-raise" || mode === "far-right-leg-raise";
}

export function scaleMovementAvatarProofLandmarkAround(
  point: VrmPoseLandmark,
  centerX: number,
  centerY: number,
  scale: number,
  visibility: number,
): VrmPoseLandmark {
  return movementAvatarProofLandmark(
    centerX + (point.x - centerX) * scale,
    centerY + (point.y - centerY) * scale,
    (point.z ?? 0) * scale,
    visibility,
  );
}

export function makeMovementAvatarProofPose(mode: MovementAvatarProofMode): VrmPoseLandmark[] {
  const pose = Array.from({ length: 33 }, () => movementAvatarProofLandmark(0.5, 0.5, 0, 0.9));
  const baseMode = getBaseProofMode(mode);
  const isSquatMode = baseMode === "squat";

  pose[0] = movementAvatarProofLandmark(0.5, isSquatMode ? 0.3 : 0.24);
  pose[7] = movementAvatarProofLandmark(0.46, isSquatMode ? 0.32 : 0.27);
  pose[8] = movementAvatarProofLandmark(0.54, isSquatMode ? 0.32 : 0.27);
  pose[11] = movementAvatarProofLandmark(0.38, isSquatMode ? 0.46 : 0.42);
  pose[12] = movementAvatarProofLandmark(0.62, isSquatMode ? 0.46 : 0.42);
  pose[13] = movementAvatarProofLandmark(0.32, isSquatMode ? 0.58 : 0.56);
  pose[14] = movementAvatarProofLandmark(0.68, isSquatMode ? 0.58 : 0.56);
  pose[15] = movementAvatarProofLandmark(0.3, isSquatMode ? 0.72 : 0.7);
  pose[16] = movementAvatarProofLandmark(0.7, isSquatMode ? 0.72 : 0.7);

  if (baseMode === "side-bend") {
    pose[0] = movementAvatarProofLandmark(0.66, 0.25);
    pose[7] = movementAvatarProofLandmark(0.62, 0.27);
    pose[8] = movementAvatarProofLandmark(0.7, 0.27);
    pose[11] = movementAvatarProofLandmark(0.54, 0.42);
    pose[12] = movementAvatarProofLandmark(0.76, 0.42);
    pose[13] = movementAvatarProofLandmark(0.58, 0.56);
    pose[14] = movementAvatarProofLandmark(0.8, 0.56);
    pose[15] = movementAvatarProofLandmark(0.62, 0.7);
    pose[16] = movementAvatarProofLandmark(0.84, 0.7);
  }

  if (baseMode === "hands-front") {
    pose[13] = movementAvatarProofLandmark(0.37, 0.5, -0.08);
    pose[14] = movementAvatarProofLandmark(0.63, 0.5, -0.08);
    pose[15] = movementAvatarProofLandmark(0.46, 0.48, -0.16);
    pose[16] = movementAvatarProofLandmark(0.54, 0.48, -0.16);
  }

  if (isSquatMode) {
    pose[0] = movementAvatarProofLandmark(0.5, 0.34);
    pose[7] = movementAvatarProofLandmark(0.46, 0.35);
    pose[8] = movementAvatarProofLandmark(0.54, 0.35);
    pose[11] = movementAvatarProofLandmark(0.38, 0.5);
    pose[12] = movementAvatarProofLandmark(0.62, 0.5);
    pose[13] = movementAvatarProofLandmark(0.35, 0.56, -0.08);
    pose[14] = movementAvatarProofLandmark(0.65, 0.56, -0.08);
    pose[15] = movementAvatarProofLandmark(0.43, 0.5, -0.18, 0.42);
    pose[16] = movementAvatarProofLandmark(0.57, 0.52, -0.18, 0.42);
    pose[23] = movementAvatarProofLandmark(0.42, 0.78);
    pose[24] = movementAvatarProofLandmark(0.58, 0.78);
    pose[25] = movementAvatarProofLandmark(0.34, 0.76);
    pose[26] = movementAvatarProofLandmark(0.66, 0.76);
    pose[27] = movementAvatarProofLandmark(0.42, 0.96);
    pose[28] = movementAvatarProofLandmark(0.58, 0.96);
    pose[29] = movementAvatarProofLandmark(0.4, 0.97);
    pose[30] = movementAvatarProofLandmark(0.6, 0.97);
    pose[31] = movementAvatarProofLandmark(0.36, 0.98);
    pose[32] = movementAvatarProofLandmark(0.64, 0.98);
  } else if (baseMode === "left-leg-raise") {
    pose[23] = movementAvatarProofLandmark(0.42, 0.66);
    pose[24] = movementAvatarProofLandmark(0.58, 0.66);
    pose[25] = movementAvatarProofLandmark(0.42, 0.52);
    pose[26] = movementAvatarProofLandmark(0.56, 0.8);
    pose[27] = movementAvatarProofLandmark(0.38, 0.66);
    pose[28] = movementAvatarProofLandmark(0.56, 0.94);
    pose[29] = movementAvatarProofLandmark(0.38, 0.67);
    pose[30] = movementAvatarProofLandmark(0.57, 0.95);
    pose[31] = movementAvatarProofLandmark(0.36, 0.68);
    pose[32] = movementAvatarProofLandmark(0.58, 0.96);
  } else if (baseMode === "right-leg-raise") {
    pose[23] = movementAvatarProofLandmark(0.42, 0.66);
    pose[24] = movementAvatarProofLandmark(0.58, 0.66);
    pose[25] = movementAvatarProofLandmark(0.44, 0.8);
    pose[26] = movementAvatarProofLandmark(0.58, 0.52);
    pose[27] = movementAvatarProofLandmark(0.44, 0.94);
    pose[28] = movementAvatarProofLandmark(0.62, 0.66);
    pose[29] = movementAvatarProofLandmark(0.43, 0.95);
    pose[30] = movementAvatarProofLandmark(0.62, 0.67);
    pose[31] = movementAvatarProofLandmark(0.42, 0.96);
    pose[32] = movementAvatarProofLandmark(0.64, 0.68);
  } else {
    pose[23] = movementAvatarProofLandmark(0.42, 0.66);
    pose[24] = movementAvatarProofLandmark(0.58, 0.66);
    pose[25] = movementAvatarProofLandmark(0.44, 0.8);
    pose[26] = movementAvatarProofLandmark(0.56, 0.8);
    pose[27] = movementAvatarProofLandmark(0.44, 0.94);
    pose[28] = movementAvatarProofLandmark(0.56, 0.94);
    pose[29] = movementAvatarProofLandmark(0.43, 0.95);
    pose[30] = movementAvatarProofLandmark(0.57, 0.95);
    pose[31] = movementAvatarProofLandmark(0.42, 0.96);
    pose[32] = movementAvatarProofLandmark(0.58, 0.96);
  }

  if (isFarProofMode(mode)) {
    return pose.map((point, index) => {
      const lowerBodyPoint = index >= 23 && index <= 32;
      const visibility = lowerBodyPoint ? 0.4 : 0.56;

      return scaleMovementAvatarProofLandmarkAround(point, 0.5, 0.62, 0.78, visibility);
    });
  }

  if (mode === "weak-feet-standing") {
    return pose.map((point, index) => (
      index >= 27 && index <= 32
        ? { ...point, visibility: 0.12 }
        : point
    ));
  }

  if (mode === "lower-body-out-of-frame") {
    return pose.map((point, index) => (
      index >= 23 && index <= 32
        ? {
          ...point,
          y: point.y + 0.32,
          visibility: index >= 27 ? 0.1 : 0.22,
        }
        : point
    ));
  }

  if (mode === "upper-body-auto" || mode === "upper-body-auto-rejected") {
    return pose.map((point, index) => {
      const lowerBodyPoint = index >= 25 && index <= 32;
      return lowerBodyPoint ? { ...point, visibility: 0.1 } : point;
    });
  }

  return pose;
}

export function makeMovementAvatarProofHands(mode: MovementAvatarProofMode) {
  if (mode !== "squat" && mode !== "far-squat") return undefined;

  const leftWrist = mode === "far-squat"
    ? scaleMovementAvatarProofLandmarkAround(
      movementAvatarProofLandmark(0.44, 0.42, -0.2),
      0.5,
      0.62,
      0.78,
      0.68,
    )
    : movementAvatarProofLandmark(0.44, 0.42, -0.2, 0.94);
  const rightWrist = mode === "far-squat"
    ? scaleMovementAvatarProofLandmarkAround(
      movementAvatarProofLandmark(0.56, 0.44, -0.2),
      0.5,
      0.62,
      0.78,
      0.68,
    )
    : movementAvatarProofLandmark(0.56, 0.44, -0.2, 0.94);

  return {
    left: { landmarks: makeProofHandLandmarks(leftWrist) },
    right: { landmarks: makeProofHandLandmarks(rightWrist) },
  };
}

export function toMovementAvatarProofMotionLandmarks(
  landmarks: VrmPoseLandmark[],
): MovementAvatarProofMotionLandmark[] {
  return landmarks.map((landmark) => ({
    ...landmark,
    visibility: landmark.visibility ?? 0.9,
    z: landmark.z ?? 0,
  }));
}

export function makeMovementAvatarProofMotionPayload(
  mode: MovementAvatarProofMode,
): MovementAvatarProofMotionPayload {
  const hands = makeMovementAvatarProofHands(mode);

  return {
    landmarks: toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose(mode)),
    hands: hands
      ? {
          left: hands.left
            ? { landmarks: toMovementAvatarProofMotionLandmarks(hands.left.landmarks) }
            : null,
          right: hands.right
            ? { landmarks: toMovementAvatarProofMotionLandmarks(hands.right.landmarks) }
            : null,
        }
      : undefined,
  };
}
