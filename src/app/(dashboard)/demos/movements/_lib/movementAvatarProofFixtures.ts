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
  | "bear-crawl"
  | "far-left-leg-raise"
  | "far-right-leg-raise"
  | "far-squat"
  | "forward-lunge"
  | "hands-front"
  | "half-kneeling"
  | "head-down"
  | "head-left"
  | "head-right"
  | "head-up"
  | "left-leg-raise"
  | "jumping-jack"
  | "lower-body-out-of-frame"
  | "low-lunge"
  | "right-leg-raise"
  | "root-travel-back"
  | "root-travel-forward"
  | "root-travel-left"
  | "root-travel-right"
  | "root-turn-right"
  | "root-turn-left"
  | "root-turn-travel"
  | "quadruped"
  | "quadruped-bird-dog"
  | "prone"
  | "prone-cobra"
  | "seated"
  | "seated-forward-fold"
  | "seated-leg-lift"
  | "seated-twist"
  | "side-bend"
  | "side-lunge"
  | "side-lying"
  | "side-lying-leg-lift"
  | "squat"
  | "standing-arm-raise"
  | "standing"
  | "standing-twist"
  | "supine"
  | "supine-bridge"
  | "pilates-clam"
  | "pilates-dead-bug"
  | "pilates-double-leg-stretch"
  | "pilates-hollow-hold"
  | "pilates-hundred"
  | "pilates-single-leg-stretch"
  | "pilates-swimming"
  | "yoga-chair"
  | "yoga-cat"
  | "yoga-child-pose"
  | "yoga-cow"
  | "yoga-down-dog"
  | "yoga-forward-fold"
  | "yoga-half-lift"
  | "yoga-plank"
  | "yoga-tree"
  | "yoga-triangle"
  | "yoga-warrior-one"
  | "yoga-warrior-two"
  | "kneeling"
  | "upper-body-auto"
  | "upper-body-auto-rejected"
  | "weak-feet-standing";

export const MOVEMENT_AVATAR_PROOF_MODES: MovementAvatarProofMode[] = [
  "standing",
  "side-bend",
  "hands-front",
  "standing-arm-raise",
  "standing-twist",
  "yoga-half-lift",
  "yoga-forward-fold",
  "yoga-chair",
  "yoga-warrior-one",
  "yoga-warrior-two",
  "yoga-triangle",
  "yoga-tree",
  "head-up",
  "head-down",
  "head-left",
  "head-right",
  "squat",
  "far-squat",
  "forward-lunge",
  "side-lunge",
  "jumping-jack",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "root-turn-left",
  "root-turn-right",
  "root-travel-left",
  "root-travel-right",
  "root-travel-forward",
  "root-travel-back",
  "root-turn-travel",
  "seated",
  "seated-twist",
  "seated-forward-fold",
  "seated-leg-lift",
  "kneeling",
  "half-kneeling",
  "low-lunge",
  "quadruped",
  "bear-crawl",
  "quadruped-bird-dog",
  "yoga-child-pose",
  "yoga-cat",
  "yoga-cow",
  "yoga-plank",
  "yoga-down-dog",
  "side-lying",
  "side-lying-leg-lift",
  "supine",
  "supine-bridge",
  "pilates-single-leg-stretch",
  "pilates-dead-bug",
  "pilates-hollow-hold",
  "pilates-double-leg-stretch",
  "pilates-hundred",
  "pilates-clam",
  "prone",
  "prone-cobra",
  "pilates-swimming",
  "weak-feet-standing",
  "lower-body-out-of-frame",
  "upper-body-auto",
  "upper-body-auto-rejected",
];

export const MOVEMENT_AVATAR_PROOF_LABELS: Record<MovementAvatarProofMode, string> = {
  "bear-crawl": "Bear crawl prep",
  "far-left-leg-raise": "Far left leg raise",
  "far-right-leg-raise": "Far right leg raise",
  "far-squat": "Far squat",
  "forward-lunge": "Forward lunge prep",
  "hands-front": "Hands front",
  "half-kneeling": "Half kneeling",
  "head-down": "Head down",
  "head-left": "Head left",
  "head-right": "Head right",
  "head-up": "Head up",
  "left-leg-raise": "Left leg raise",
  "jumping-jack": "Jumping jack prep",
  "lower-body-out-of-frame": "Lower body out of frame",
  "low-lunge": "Low lunge",
  "right-leg-raise": "Right leg raise",
  "root-travel-back": "Root travel back",
  "root-travel-forward": "Root travel forward",
  "root-travel-left": "Root travel left",
  "root-travel-right": "Root travel right",
  "root-turn-left": "Root turn left",
  "root-turn-right": "Root turn right",
  "root-turn-travel": "Root turn and travel",
  quadruped: "Quadruped",
  "quadruped-bird-dog": "Quadruped bird dog",
  prone: "Prone",
  "prone-cobra": "Prone cobra",
  seated: "Seated",
  "seated-forward-fold": "Seated forward fold",
  "seated-leg-lift": "Seated leg lift",
  "seated-twist": "Seated twist",
  kneeling: "Kneeling",
  "side-bend": "Side bend",
  "side-lunge": "Side lunge prep",
  "side-lying": "Side lying",
  "side-lying-leg-lift": "Side-lying leg lift",
  squat: "Squat",
  "standing-arm-raise": "Standing arm raise",
  standing: "Standing",
  "standing-twist": "Standing twist",
  supine: "Supine",
  "supine-bridge": "Supine bridge",
  "pilates-clam": "Pilates clam prep",
  "pilates-dead-bug": "Pilates dead bug prep",
  "pilates-double-leg-stretch": "Pilates double-leg stretch prep",
  "pilates-hollow-hold": "Pilates hollow hold prep",
  "pilates-hundred": "Pilates hundred prep",
  "pilates-single-leg-stretch": "Pilates single-leg stretch prep",
  "pilates-swimming": "Pilates swimming prep",
  "yoga-chair": "Yoga chair prep",
  "yoga-cat": "Yoga cat prep",
  "yoga-child-pose": "Yoga child pose prep",
  "yoga-cow": "Yoga cow prep",
  "yoga-down-dog": "Yoga down dog prep",
  "yoga-forward-fold": "Yoga forward fold prep",
  "yoga-half-lift": "Yoga half lift prep",
  "yoga-plank": "Yoga plank prep",
  "yoga-tree": "Yoga tree prep",
  "yoga-triangle": "Yoga triangle prep",
  "yoga-warrior-one": "Yoga warrior I prep",
  "yoga-warrior-two": "Yoga warrior II prep",
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

export function makeMovementAvatarProofFaceLandmarks(
  mode: MovementAvatarProofMode,
): MovementAvatarProofMotionLandmark[] {
  const landmarks = Array.from({ length: 264 }, () => movementAvatarProofLandmark(0.5, 0.5, 0, 0.92));
  const eyeY = 0.24;
  const leftEye = movementAvatarProofLandmark(0.45, eyeY, 0, 0.95);
  const rightEye = movementAvatarProofLandmark(0.55, eyeY, 0, 0.95);
  const noseY = mode === "head-up"
    ? 0.3
    : mode === "head-down"
      ? 0.2
      : 0.258;
  const noseX = mode === "head-left"
    ? 0.44
    : mode === "head-right"
      ? 0.56
      : 0.5;

  landmarks[1] = movementAvatarProofLandmark(noseX, noseY, -0.02, 0.95);
  landmarks[4] = landmarks[1]!;
  landmarks[33] = leftEye;
  landmarks[263] = rightEye;

  return toMovementAvatarProofMotionLandmarks(landmarks);
}

function getBaseProofMode(mode: MovementAvatarProofMode): MovementAvatarProofMode {
  if (mode === "far-squat") return "squat";
  if (mode === "forward-lunge" || mode === "jumping-jack" || mode === "side-lunge") return "standing";
  if (mode === "standing-arm-raise" || mode === "standing-twist") return "standing";
  if (
    mode === "yoga-chair" ||
    mode === "yoga-forward-fold" ||
    mode === "yoga-half-lift" ||
    mode === "yoga-tree" ||
    mode === "yoga-triangle" ||
    mode === "yoga-warrior-one" ||
    mode === "yoga-warrior-two"
  ) return "standing";
  if (mode === "head-up" || mode === "head-down" || mode === "head-left" || mode === "head-right") return "standing";
  if (mode === "far-left-leg-raise") return "left-leg-raise";
  if (mode === "far-right-leg-raise") return "right-leg-raise";
  if (mode === "upper-body-auto") return "standing";
  if (mode === "upper-body-auto-rejected") return "side-bend";
  if (
    mode === "root-turn-left" ||
    mode === "root-turn-right" ||
    mode === "root-travel-left" ||
    mode === "root-travel-right" ||
    mode === "root-travel-forward" ||
    mode === "root-travel-back" ||
    mode === "root-turn-travel"
  ) return "standing";
  if (mode === "weak-feet-standing" || mode === "lower-body-out-of-frame") return "standing";
  if (mode === "low-lunge") return "kneeling";
  if (mode === "bear-crawl") return "quadruped";
  if (mode === "quadruped-bird-dog") return "quadruped";
  if (
    mode === "yoga-cat" ||
    mode === "yoga-child-pose" ||
    mode === "yoga-cow" ||
    mode === "yoga-plank" ||
    mode === "yoga-down-dog"
  ) return "quadruped";
  if (mode === "side-lying-leg-lift" || mode === "pilates-clam") return "side-lying";
  if (
    mode === "supine-bridge" ||
    mode === "pilates-dead-bug" ||
    mode === "pilates-double-leg-stretch" ||
    mode === "pilates-hollow-hold" ||
    mode === "pilates-hundred" ||
    mode === "pilates-single-leg-stretch"
  ) return "supine";
  if (mode === "prone-cobra" || mode === "pilates-swimming") return "prone";
  if (mode === "seated-forward-fold" || mode === "seated-leg-lift" || mode === "seated-twist") return "seated";
  if (mode === "half-kneeling") return "kneeling";
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

  if (mode === "standing-arm-raise") {
    pose[13] = movementAvatarProofLandmark(0.43, 0.31);
    pose[14] = movementAvatarProofLandmark(0.57, 0.31);
    pose[15] = movementAvatarProofLandmark(0.46, 0.2);
    pose[16] = movementAvatarProofLandmark(0.54, 0.2);
  }

  if (mode === "standing-twist") {
    pose[11] = movementAvatarProofLandmark(0.36, 0.38, -0.05);
    pose[12] = movementAvatarProofLandmark(0.64, 0.46, 0.05);
    pose[13] = movementAvatarProofLandmark(0.3, 0.54, -0.04);
    pose[14] = movementAvatarProofLandmark(0.7, 0.58, 0.04);
    pose[15] = movementAvatarProofLandmark(0.28, 0.62, -0.04);
    pose[16] = movementAvatarProofLandmark(0.72, 0.64, 0.04);
  }

  if (mode === "yoga-forward-fold") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.66);
    pose[7] = movementAvatarProofLandmark(0.46, 0.62);
    pose[8] = movementAvatarProofLandmark(0.54, 0.62);
    pose[11] = movementAvatarProofLandmark(0.4, 0.56);
    pose[12] = movementAvatarProofLandmark(0.6, 0.56);
    pose[13] = movementAvatarProofLandmark(0.38, 0.72);
    pose[14] = movementAvatarProofLandmark(0.62, 0.72);
    pose[15] = movementAvatarProofLandmark(0.36, 0.86);
    pose[16] = movementAvatarProofLandmark(0.64, 0.86);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.42, 0.78);
    pose[26] = movementAvatarProofLandmark(0.58, 0.78);
    pose[27] = movementAvatarProofLandmark(0.38, 0.9);
    pose[28] = movementAvatarProofLandmark(0.62, 0.9);
    pose[29] = movementAvatarProofLandmark(0.37, 0.91);
    pose[30] = movementAvatarProofLandmark(0.63, 0.91);
    pose[31] = movementAvatarProofLandmark(0.36, 0.92);
    pose[32] = movementAvatarProofLandmark(0.64, 0.92);
  }

  if (mode === "yoga-half-lift") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.46);
    pose[7] = movementAvatarProofLandmark(0.46, 0.45);
    pose[8] = movementAvatarProofLandmark(0.54, 0.45);
    pose[11] = movementAvatarProofLandmark(0.4, 0.5);
    pose[12] = movementAvatarProofLandmark(0.6, 0.5);
    pose[13] = movementAvatarProofLandmark(0.39, 0.62);
    pose[14] = movementAvatarProofLandmark(0.61, 0.62);
    pose[15] = movementAvatarProofLandmark(0.37, 0.76);
    pose[16] = movementAvatarProofLandmark(0.63, 0.76);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.42, 0.78);
    pose[26] = movementAvatarProofLandmark(0.58, 0.78);
    pose[27] = movementAvatarProofLandmark(0.38, 0.9);
    pose[28] = movementAvatarProofLandmark(0.62, 0.9);
    pose[29] = movementAvatarProofLandmark(0.37, 0.91);
    pose[30] = movementAvatarProofLandmark(0.63, 0.91);
    pose[31] = movementAvatarProofLandmark(0.36, 0.92);
    pose[32] = movementAvatarProofLandmark(0.64, 0.92);
  }

  if (mode === "yoga-chair") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.24);
    pose[7] = movementAvatarProofLandmark(0.46, 0.27);
    pose[8] = movementAvatarProofLandmark(0.54, 0.27);
    pose[11] = movementAvatarProofLandmark(0.39, 0.43);
    pose[12] = movementAvatarProofLandmark(0.61, 0.43);
    pose[13] = movementAvatarProofLandmark(0.43, 0.31);
    pose[14] = movementAvatarProofLandmark(0.57, 0.31);
    pose[15] = movementAvatarProofLandmark(0.46, 0.2);
    pose[16] = movementAvatarProofLandmark(0.54, 0.2);
    pose[23] = movementAvatarProofLandmark(0.43, 0.62);
    pose[24] = movementAvatarProofLandmark(0.57, 0.62);
    pose[25] = movementAvatarProofLandmark(0.38, 0.78);
    pose[26] = movementAvatarProofLandmark(0.62, 0.78);
    pose[27] = movementAvatarProofLandmark(0.36, 0.9);
    pose[28] = movementAvatarProofLandmark(0.64, 0.9);
    pose[29] = movementAvatarProofLandmark(0.35, 0.91);
    pose[30] = movementAvatarProofLandmark(0.65, 0.91);
    pose[31] = movementAvatarProofLandmark(0.34, 0.92);
    pose[32] = movementAvatarProofLandmark(0.66, 0.92);
  }

  if (mode === "yoga-warrior-one") {
    pose[11] = movementAvatarProofLandmark(0.39, 0.42);
    pose[12] = movementAvatarProofLandmark(0.61, 0.42);
    pose[13] = movementAvatarProofLandmark(0.43, 0.31);
    pose[14] = movementAvatarProofLandmark(0.57, 0.31);
    pose[15] = movementAvatarProofLandmark(0.46, 0.2);
    pose[16] = movementAvatarProofLandmark(0.54, 0.2);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.28, 0.74);
    pose[26] = movementAvatarProofLandmark(0.72, 0.82);
    pose[27] = movementAvatarProofLandmark(0.16, 0.9);
    pose[28] = movementAvatarProofLandmark(0.86, 0.9);
    pose[29] = movementAvatarProofLandmark(0.15, 0.91);
    pose[30] = movementAvatarProofLandmark(0.87, 0.91);
    pose[31] = movementAvatarProofLandmark(0.14, 0.92);
    pose[32] = movementAvatarProofLandmark(0.88, 0.92);
  }

  if (mode === "yoga-warrior-two") {
    pose[11] = movementAvatarProofLandmark(0.36, 0.42);
    pose[12] = movementAvatarProofLandmark(0.64, 0.42);
    pose[13] = movementAvatarProofLandmark(0.24, 0.42);
    pose[14] = movementAvatarProofLandmark(0.76, 0.42);
    pose[15] = movementAvatarProofLandmark(0.1, 0.43);
    pose[16] = movementAvatarProofLandmark(0.9, 0.43);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.28, 0.74);
    pose[26] = movementAvatarProofLandmark(0.72, 0.82);
    pose[27] = movementAvatarProofLandmark(0.16, 0.9);
    pose[28] = movementAvatarProofLandmark(0.86, 0.9);
    pose[29] = movementAvatarProofLandmark(0.15, 0.91);
    pose[30] = movementAvatarProofLandmark(0.87, 0.91);
    pose[31] = movementAvatarProofLandmark(0.14, 0.92);
    pose[32] = movementAvatarProofLandmark(0.88, 0.92);
  }

  if (mode === "yoga-triangle") {
    pose[0] = movementAvatarProofLandmark(0.48, 0.3);
    pose[7] = movementAvatarProofLandmark(0.44, 0.32);
    pose[8] = movementAvatarProofLandmark(0.52, 0.28);
    pose[11] = movementAvatarProofLandmark(0.36, 0.48);
    pose[12] = movementAvatarProofLandmark(0.64, 0.36);
    pose[13] = movementAvatarProofLandmark(0.3, 0.64);
    pose[14] = movementAvatarProofLandmark(0.7, 0.28);
    pose[15] = movementAvatarProofLandmark(0.26, 0.84);
    pose[16] = movementAvatarProofLandmark(0.78, 0.18);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.32, 0.82);
    pose[26] = movementAvatarProofLandmark(0.74, 0.82);
    pose[27] = movementAvatarProofLandmark(0.18, 0.9);
    pose[28] = movementAvatarProofLandmark(0.86, 0.9);
    pose[29] = movementAvatarProofLandmark(0.17, 0.91);
    pose[30] = movementAvatarProofLandmark(0.87, 0.91);
    pose[31] = movementAvatarProofLandmark(0.16, 0.92);
    pose[32] = movementAvatarProofLandmark(0.88, 0.92);
  }

  if (mode === "yoga-tree") {
    pose[13] = movementAvatarProofLandmark(0.43, 0.31);
    pose[14] = movementAvatarProofLandmark(0.57, 0.31);
    pose[15] = movementAvatarProofLandmark(0.46, 0.2);
    pose[16] = movementAvatarProofLandmark(0.54, 0.2);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.43, 0.64);
    pose[26] = movementAvatarProofLandmark(0.6, 0.78);
    pose[27] = movementAvatarProofLandmark(0.56, 0.62);
    pose[28] = movementAvatarProofLandmark(0.64, 0.9);
    pose[29] = movementAvatarProofLandmark(0.56, 0.63);
    pose[30] = movementAvatarProofLandmark(0.65, 0.91);
    pose[31] = movementAvatarProofLandmark(0.57, 0.64);
    pose[32] = movementAvatarProofLandmark(0.66, 0.92);
  }

  if (mode === "forward-lunge") {
    pose[11] = movementAvatarProofLandmark(0.39, 0.42);
    pose[12] = movementAvatarProofLandmark(0.61, 0.42);
    pose[13] = movementAvatarProofLandmark(0.34, 0.56);
    pose[14] = movementAvatarProofLandmark(0.66, 0.56);
    pose[15] = movementAvatarProofLandmark(0.32, 0.64);
    pose[16] = movementAvatarProofLandmark(0.68, 0.64);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.28, 0.72);
    pose[26] = movementAvatarProofLandmark(0.72, 0.84);
    pose[27] = movementAvatarProofLandmark(0.16, 0.9);
    pose[28] = movementAvatarProofLandmark(0.86, 0.9);
    pose[29] = movementAvatarProofLandmark(0.15, 0.91);
    pose[30] = movementAvatarProofLandmark(0.87, 0.91);
    pose[31] = movementAvatarProofLandmark(0.14, 0.92);
    pose[32] = movementAvatarProofLandmark(0.88, 0.92);
  }

  if (mode === "side-lunge") {
    pose[11] = movementAvatarProofLandmark(0.38, 0.44);
    pose[12] = movementAvatarProofLandmark(0.62, 0.44);
    pose[13] = movementAvatarProofLandmark(0.34, 0.56);
    pose[14] = movementAvatarProofLandmark(0.66, 0.56);
    pose[15] = movementAvatarProofLandmark(0.3, 0.68);
    pose[16] = movementAvatarProofLandmark(0.7, 0.68);
    pose[23] = movementAvatarProofLandmark(0.4, 0.66);
    pose[24] = movementAvatarProofLandmark(0.6, 0.66);
    pose[25] = movementAvatarProofLandmark(0.26, 0.74);
    pose[26] = movementAvatarProofLandmark(0.76, 0.86);
    pose[27] = movementAvatarProofLandmark(0.12, 0.9);
    pose[28] = movementAvatarProofLandmark(0.9, 0.9);
    pose[29] = movementAvatarProofLandmark(0.11, 0.91);
    pose[30] = movementAvatarProofLandmark(0.91, 0.91);
    pose[31] = movementAvatarProofLandmark(0.1, 0.92);
    pose[32] = movementAvatarProofLandmark(0.92, 0.92);
  }

  if (mode === "jumping-jack") {
    pose[11] = movementAvatarProofLandmark(0.38, 0.42);
    pose[12] = movementAvatarProofLandmark(0.62, 0.42);
    pose[13] = movementAvatarProofLandmark(0.3, 0.3);
    pose[14] = movementAvatarProofLandmark(0.7, 0.3);
    pose[15] = movementAvatarProofLandmark(0.22, 0.18);
    pose[16] = movementAvatarProofLandmark(0.78, 0.18);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.34, 0.78);
    pose[26] = movementAvatarProofLandmark(0.66, 0.78);
    pose[27] = movementAvatarProofLandmark(0.18, 0.9);
    pose[28] = movementAvatarProofLandmark(0.82, 0.9);
    pose[29] = movementAvatarProofLandmark(0.17, 0.91);
    pose[30] = movementAvatarProofLandmark(0.83, 0.91);
    pose[31] = movementAvatarProofLandmark(0.16, 0.92);
    pose[32] = movementAvatarProofLandmark(0.84, 0.92);
  }

  if (
    mode === "yoga-chair" ||
    mode === "forward-lunge" ||
    mode === "jumping-jack" ||
    mode === "side-lunge" ||
    mode === "yoga-forward-fold" ||
    mode === "yoga-half-lift" ||
    mode === "yoga-tree" ||
    mode === "yoga-triangle" ||
    mode === "yoga-warrior-one" ||
    mode === "yoga-warrior-two"
  ) return pose;

  if (mode === "head-up") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.18);
    pose[7] = movementAvatarProofLandmark(0.46, 0.29);
    pose[8] = movementAvatarProofLandmark(0.54, 0.29);
  }

  if (mode === "head-down") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.34);
    pose[7] = movementAvatarProofLandmark(0.46, 0.25);
    pose[8] = movementAvatarProofLandmark(0.54, 0.25);
  }

  if (baseMode === "seated") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.24);
    pose[7] = movementAvatarProofLandmark(0.46, 0.27);
    pose[8] = movementAvatarProofLandmark(0.54, 0.27);
    pose[11] = movementAvatarProofLandmark(0.39, 0.42);
    pose[12] = movementAvatarProofLandmark(0.61, 0.42);
    pose[13] = movementAvatarProofLandmark(0.34, 0.56);
    pose[14] = movementAvatarProofLandmark(0.66, 0.56);
    pose[15] = movementAvatarProofLandmark(0.32, 0.7);
    pose[16] = movementAvatarProofLandmark(0.68, 0.7);
    pose[23] = movementAvatarProofLandmark(0.43, 0.66);
    pose[24] = movementAvatarProofLandmark(0.57, 0.66);
    pose[25] = movementAvatarProofLandmark(0.31, 0.7);
    pose[26] = movementAvatarProofLandmark(0.69, 0.7);
    pose[27] = movementAvatarProofLandmark(0.3, 0.9);
    pose[28] = movementAvatarProofLandmark(0.7, 0.9);
    pose[29] = movementAvatarProofLandmark(0.29, 0.91);
    pose[30] = movementAvatarProofLandmark(0.71, 0.91);
    pose[31] = movementAvatarProofLandmark(0.28, 0.92);
    pose[32] = movementAvatarProofLandmark(0.72, 0.92);
    if (mode === "seated-twist") {
      pose[11] = movementAvatarProofLandmark(0.36, 0.38, -0.04);
      pose[12] = movementAvatarProofLandmark(0.63, 0.46, 0.05);
      pose[13] = movementAvatarProofLandmark(0.28, 0.52, -0.04);
      pose[14] = movementAvatarProofLandmark(0.7, 0.58, 0.04);
      pose[15] = movementAvatarProofLandmark(0.27, 0.66, -0.04);
      pose[16] = movementAvatarProofLandmark(0.7, 0.68, 0.04);
    }
    if (mode === "seated-forward-fold") {
      pose[0] = movementAvatarProofLandmark(0.5, 0.64);
      pose[7] = movementAvatarProofLandmark(0.46, 0.6);
      pose[8] = movementAvatarProofLandmark(0.54, 0.62);
      pose[11] = movementAvatarProofLandmark(0.39, 0.54);
      pose[12] = movementAvatarProofLandmark(0.61, 0.54);
      pose[13] = movementAvatarProofLandmark(0.34, 0.66);
      pose[14] = movementAvatarProofLandmark(0.66, 0.66);
      pose[15] = movementAvatarProofLandmark(0.32, 0.78);
      pose[16] = movementAvatarProofLandmark(0.68, 0.78);
    }
    if (mode === "seated-leg-lift") {
      pose[26] = movementAvatarProofLandmark(0.66, 0.68);
      pose[28] = movementAvatarProofLandmark(0.72, 0.64);
      pose[30] = movementAvatarProofLandmark(0.73, 0.65);
      pose[32] = movementAvatarProofLandmark(0.74, 0.66);
    }
    return pose;
  }

  if (baseMode === "kneeling") {
    pose[0] = movementAvatarProofLandmark(0.5, 0.22);
    pose[7] = movementAvatarProofLandmark(0.46, 0.25);
    pose[8] = movementAvatarProofLandmark(0.54, 0.25);
    pose[11] = movementAvatarProofLandmark(0.39, 0.38);
    pose[12] = movementAvatarProofLandmark(0.61, 0.38);
    pose[13] = movementAvatarProofLandmark(0.34, 0.53);
    pose[14] = movementAvatarProofLandmark(0.66, 0.53);
    pose[15] = movementAvatarProofLandmark(0.32, 0.66);
    pose[16] = movementAvatarProofLandmark(0.68, 0.66);
    pose[23] = movementAvatarProofLandmark(0.43, 0.62);
    pose[24] = movementAvatarProofLandmark(0.57, 0.62);
    pose[25] = movementAvatarProofLandmark(0.41, 0.82);
    pose[26] = movementAvatarProofLandmark(0.59, 0.82);
    pose[27] = movementAvatarProofLandmark(0.4, 0.9);
    pose[28] = movementAvatarProofLandmark(0.6, 0.9);
    pose[29] = movementAvatarProofLandmark(0.39, 0.91);
    pose[30] = movementAvatarProofLandmark(0.61, 0.91);
    pose[31] = movementAvatarProofLandmark(0.38, 0.92);
    pose[32] = movementAvatarProofLandmark(0.62, 0.92);
    if (mode === "half-kneeling") {
      pose[25] = movementAvatarProofLandmark(0.38, 0.86);
      pose[26] = movementAvatarProofLandmark(0.66, 0.68);
      pose[27] = movementAvatarProofLandmark(0.38, 0.84);
      pose[28] = movementAvatarProofLandmark(0.7, 0.84);
      pose[29] = movementAvatarProofLandmark(0.37, 0.85);
      pose[30] = movementAvatarProofLandmark(0.72, 0.85);
      pose[31] = movementAvatarProofLandmark(0.36, 0.86);
      pose[32] = movementAvatarProofLandmark(0.74, 0.86);
    }
    if (mode === "low-lunge") {
      pose[13] = movementAvatarProofLandmark(0.35, 0.66);
      pose[14] = movementAvatarProofLandmark(0.65, 0.66);
      pose[15] = movementAvatarProofLandmark(0.33, 0.86);
      pose[16] = movementAvatarProofLandmark(0.67, 0.86);
      pose[25] = movementAvatarProofLandmark(0.38, 0.86);
      pose[26] = movementAvatarProofLandmark(0.66, 0.68);
      pose[27] = movementAvatarProofLandmark(0.38, 0.84);
      pose[28] = movementAvatarProofLandmark(0.72, 0.86);
      pose[29] = movementAvatarProofLandmark(0.37, 0.85);
      pose[30] = movementAvatarProofLandmark(0.73, 0.87);
      pose[31] = movementAvatarProofLandmark(0.36, 0.86);
      pose[32] = movementAvatarProofLandmark(0.74, 0.88);
    }
    return pose;
  }

  if (baseMode === "quadruped") {
    pose[0] = movementAvatarProofLandmark(0.32, 0.44);
    pose[7] = movementAvatarProofLandmark(0.3, 0.42);
    pose[8] = movementAvatarProofLandmark(0.34, 0.46);
    pose[11] = movementAvatarProofLandmark(0.42, 0.44);
    pose[12] = movementAvatarProofLandmark(0.44, 0.56);
    pose[13] = movementAvatarProofLandmark(0.4, 0.58);
    pose[14] = movementAvatarProofLandmark(0.46, 0.66);
    pose[15] = movementAvatarProofLandmark(0.39, 0.72);
    pose[16] = movementAvatarProofLandmark(0.47, 0.72);
    pose[23] = movementAvatarProofLandmark(0.68, 0.45);
    pose[24] = movementAvatarProofLandmark(0.7, 0.57);
    pose[25] = movementAvatarProofLandmark(0.7, 0.73);
    pose[26] = movementAvatarProofLandmark(0.78, 0.73);
    pose[27] = movementAvatarProofLandmark(0.86, 0.74);
    pose[28] = movementAvatarProofLandmark(0.9, 0.74);
    pose[29] = movementAvatarProofLandmark(0.86, 0.75);
    pose[30] = movementAvatarProofLandmark(0.9, 0.75);
    pose[31] = movementAvatarProofLandmark(0.87, 0.76);
    pose[32] = movementAvatarProofLandmark(0.91, 0.76);
    if (mode === "quadruped-bird-dog") {
      pose[15] = movementAvatarProofLandmark(0.27, 0.7);
      pose[16] = movementAvatarProofLandmark(0.47, 0.72);
      pose[27] = movementAvatarProofLandmark(0.86, 0.74);
      pose[28] = movementAvatarProofLandmark(1.04, 0.57);
      pose[29] = movementAvatarProofLandmark(0.86, 0.75);
      pose[30] = movementAvatarProofLandmark(1.04, 0.58);
      pose[31] = movementAvatarProofLandmark(0.87, 0.76);
      pose[32] = movementAvatarProofLandmark(1.05, 0.59);
    }
    if (mode === "bear-crawl") {
      pose[0] = movementAvatarProofLandmark(0.32, 0.52);
      pose[11] = movementAvatarProofLandmark(0.42, 0.54);
      pose[12] = movementAvatarProofLandmark(0.44, 0.64);
      pose[15] = movementAvatarProofLandmark(0.38, 0.84);
      pose[16] = movementAvatarProofLandmark(0.46, 0.84);
      pose[23] = movementAvatarProofLandmark(0.68, 0.62);
      pose[24] = movementAvatarProofLandmark(0.7, 0.72);
      pose[25] = movementAvatarProofLandmark(0.74, 0.66);
      pose[26] = movementAvatarProofLandmark(0.78, 0.72);
      pose[27] = movementAvatarProofLandmark(0.88, 0.84);
      pose[28] = movementAvatarProofLandmark(0.92, 0.84);
      pose[29] = movementAvatarProofLandmark(0.88, 0.85);
      pose[30] = movementAvatarProofLandmark(0.92, 0.85);
      pose[31] = movementAvatarProofLandmark(0.89, 0.86);
      pose[32] = movementAvatarProofLandmark(0.93, 0.86);
    }
    if (mode === "yoga-child-pose") {
      pose[0] = movementAvatarProofLandmark(0.34, 0.74);
      pose[7] = movementAvatarProofLandmark(0.32, 0.71);
      pose[8] = movementAvatarProofLandmark(0.36, 0.76);
      pose[11] = movementAvatarProofLandmark(0.43, 0.58);
      pose[12] = movementAvatarProofLandmark(0.45, 0.68);
      pose[13] = movementAvatarProofLandmark(0.32, 0.66);
      pose[14] = movementAvatarProofLandmark(0.34, 0.74);
      pose[15] = movementAvatarProofLandmark(0.24, 0.86);
      pose[16] = movementAvatarProofLandmark(0.28, 0.88);
      pose[23] = movementAvatarProofLandmark(0.72, 0.52);
      pose[24] = movementAvatarProofLandmark(0.74, 0.64);
      pose[25] = movementAvatarProofLandmark(0.76, 0.86);
      pose[26] = movementAvatarProofLandmark(0.82, 0.86);
      pose[27] = movementAvatarProofLandmark(0.86, 0.88);
      pose[28] = movementAvatarProofLandmark(0.9, 0.88);
    }
    if (mode === "yoga-cat") {
      pose[0] = movementAvatarProofLandmark(0.32, 0.66);
      pose[7] = movementAvatarProofLandmark(0.3, 0.62);
      pose[8] = movementAvatarProofLandmark(0.34, 0.68);
      pose[11] = movementAvatarProofLandmark(0.42, 0.44);
      pose[12] = movementAvatarProofLandmark(0.44, 0.56);
      pose[23] = movementAvatarProofLandmark(0.68, 0.43);
      pose[24] = movementAvatarProofLandmark(0.7, 0.55);
    }
    if (mode === "yoga-cow") {
      pose[0] = movementAvatarProofLandmark(0.3, 0.34);
      pose[7] = movementAvatarProofLandmark(0.29, 0.32);
      pose[8] = movementAvatarProofLandmark(0.33, 0.36);
      pose[11] = movementAvatarProofLandmark(0.42, 0.44);
      pose[12] = movementAvatarProofLandmark(0.44, 0.56);
      pose[23] = movementAvatarProofLandmark(0.68, 0.56);
      pose[24] = movementAvatarProofLandmark(0.7, 0.68);
    }
    if (mode === "yoga-plank" || mode === "yoga-down-dog") {
      const downDog = mode === "yoga-down-dog";
      pose[0] = movementAvatarProofLandmark(0.32, downDog ? 0.5 : 0.46);
      pose[7] = movementAvatarProofLandmark(0.3, downDog ? 0.48 : 0.44);
      pose[8] = movementAvatarProofLandmark(0.34, downDog ? 0.52 : 0.48);
      pose[11] = movementAvatarProofLandmark(0.42, downDog ? 0.54 : 0.52);
      pose[12] = movementAvatarProofLandmark(0.44, downDog ? 0.64 : 0.6);
      pose[13] = movementAvatarProofLandmark(0.39, downDog ? 0.66 : 0.62);
      pose[14] = movementAvatarProofLandmark(0.45, downDog ? 0.72 : 0.68);
      pose[15] = movementAvatarProofLandmark(0.38, downDog ? 0.84 : 0.78);
      pose[16] = movementAvatarProofLandmark(0.46, downDog ? 0.84 : 0.78);
      pose[23] = movementAvatarProofLandmark(0.68, downDog ? 0.34 : 0.54);
      pose[24] = movementAvatarProofLandmark(0.7, downDog ? 0.46 : 0.58);
      pose[25] = movementAvatarProofLandmark(0.76, downDog ? 0.56 : 0.58);
      pose[26] = movementAvatarProofLandmark(0.78, downDog ? 0.66 : 0.68);
      pose[27] = movementAvatarProofLandmark(0.9, 0.78);
      pose[28] = movementAvatarProofLandmark(0.94, 0.78);
      pose[29] = movementAvatarProofLandmark(0.9, 0.79);
      pose[30] = movementAvatarProofLandmark(0.94, 0.79);
      pose[31] = movementAvatarProofLandmark(0.91, 0.8);
      pose[32] = movementAvatarProofLandmark(0.95, 0.8);
    }
    return pose;
  }

  if (baseMode === "side-lying") {
    pose[0] = movementAvatarProofLandmark(0.24, 0.52);
    pose[7] = movementAvatarProofLandmark(0.22, 0.49);
    pose[8] = movementAvatarProofLandmark(0.25, 0.55);
    pose[11] = movementAvatarProofLandmark(0.34, 0.46);
    pose[12] = movementAvatarProofLandmark(0.36, 0.58);
    pose[13] = movementAvatarProofLandmark(0.46, 0.44);
    pose[14] = movementAvatarProofLandmark(0.48, 0.6);
    pose[15] = movementAvatarProofLandmark(0.54, 0.44);
    pose[16] = movementAvatarProofLandmark(0.56, 0.6);
    pose[23] = movementAvatarProofLandmark(0.62, 0.48);
    pose[24] = movementAvatarProofLandmark(0.64, 0.6);
    pose[25] = movementAvatarProofLandmark(0.78, 0.47);
    pose[26] = movementAvatarProofLandmark(0.8, 0.59);
    pose[27] = movementAvatarProofLandmark(0.92, 0.47);
    pose[28] = movementAvatarProofLandmark(0.94, 0.59);
    pose[29] = movementAvatarProofLandmark(0.92, 0.48);
    pose[30] = movementAvatarProofLandmark(0.94, 0.6);
    pose[31] = movementAvatarProofLandmark(0.93, 0.49);
    pose[32] = movementAvatarProofLandmark(0.95, 0.61);
    if (mode === "side-lying-leg-lift") {
      pose[26] = movementAvatarProofLandmark(0.78, 0.39);
      pose[28] = movementAvatarProofLandmark(0.93, 0.32);
      pose[30] = movementAvatarProofLandmark(0.93, 0.33);
      pose[32] = movementAvatarProofLandmark(0.94, 0.34);
    }
    if (mode === "pilates-clam") {
      pose[26] = movementAvatarProofLandmark(0.78, 0.39);
      pose[28] = movementAvatarProofLandmark(0.94, 0.53);
      pose[30] = movementAvatarProofLandmark(0.94, 0.54);
      pose[32] = movementAvatarProofLandmark(0.95, 0.55);
    }
    return pose;
  }

  if (baseMode === "supine" || baseMode === "prone") {
    const faceZ = baseMode === "supine" ? -0.14 : 0.14;
    const earZ = baseMode === "supine" ? 0.02 : -0.02;
    const coreZ = baseMode === "supine" ? 0.01 : -0.01;
    const limbZ = baseMode === "supine" ? 0.03 : -0.03;

    pose[0] = movementAvatarProofLandmark(0.24, 0.52, faceZ);
    pose[7] = movementAvatarProofLandmark(0.22, 0.49, earZ);
    pose[8] = movementAvatarProofLandmark(0.25, 0.55, earZ);
    pose[11] = movementAvatarProofLandmark(0.34, 0.46, coreZ);
    pose[12] = movementAvatarProofLandmark(0.36, 0.58, coreZ);
    pose[13] = movementAvatarProofLandmark(0.46, 0.44, coreZ);
    pose[14] = movementAvatarProofLandmark(0.48, 0.6, coreZ);
    pose[15] = movementAvatarProofLandmark(0.54, 0.44, limbZ);
    pose[16] = movementAvatarProofLandmark(0.56, 0.6, limbZ);
    pose[23] = movementAvatarProofLandmark(0.62, 0.48, coreZ);
    pose[24] = movementAvatarProofLandmark(0.64, 0.6, coreZ);
    pose[25] = movementAvatarProofLandmark(0.78, 0.47, limbZ);
    pose[26] = movementAvatarProofLandmark(0.8, 0.59, limbZ);
    pose[27] = movementAvatarProofLandmark(0.92, 0.47, limbZ);
    pose[28] = movementAvatarProofLandmark(0.94, 0.59, limbZ);
    pose[29] = movementAvatarProofLandmark(0.92, 0.48, limbZ);
    pose[30] = movementAvatarProofLandmark(0.94, 0.6, limbZ);
    pose[31] = movementAvatarProofLandmark(0.93, 0.49, limbZ);
    pose[32] = movementAvatarProofLandmark(0.95, 0.61, limbZ);
    if (mode === "supine-bridge") {
      pose[23] = movementAvatarProofLandmark(0.62, 0.39, coreZ);
      pose[24] = movementAvatarProofLandmark(0.64, 0.51, coreZ);
      pose[25] = movementAvatarProofLandmark(0.76, 0.5, limbZ);
      pose[26] = movementAvatarProofLandmark(0.78, 0.62, limbZ);
      pose[27] = movementAvatarProofLandmark(0.86, 0.49, limbZ);
      pose[28] = movementAvatarProofLandmark(0.88, 0.61, limbZ);
      pose[29] = movementAvatarProofLandmark(0.86, 0.5, limbZ);
      pose[30] = movementAvatarProofLandmark(0.88, 0.62, limbZ);
      pose[31] = movementAvatarProofLandmark(0.87, 0.51, limbZ);
      pose[32] = movementAvatarProofLandmark(0.89, 0.63, limbZ);
    }
    if (mode === "pilates-hundred") {
      pose[13] = movementAvatarProofLandmark(0.44, 0.42, coreZ);
      pose[14] = movementAvatarProofLandmark(0.46, 0.56, coreZ);
      pose[15] = movementAvatarProofLandmark(0.56, 0.4, limbZ);
      pose[16] = movementAvatarProofLandmark(0.58, 0.54, limbZ);
      pose[25] = movementAvatarProofLandmark(0.74, 0.42, limbZ);
      pose[26] = movementAvatarProofLandmark(0.76, 0.54, limbZ);
      pose[27] = movementAvatarProofLandmark(0.88, 0.4, limbZ);
      pose[28] = movementAvatarProofLandmark(0.9, 0.52, limbZ);
      pose[29] = movementAvatarProofLandmark(0.88, 0.41, limbZ);
      pose[30] = movementAvatarProofLandmark(0.9, 0.53, limbZ);
      pose[31] = movementAvatarProofLandmark(0.89, 0.42, limbZ);
      pose[32] = movementAvatarProofLandmark(0.91, 0.54, limbZ);
    }
    if (mode === "pilates-dead-bug") {
      pose[13] = movementAvatarProofLandmark(0.26, 0.42, coreZ);
      pose[14] = movementAvatarProofLandmark(0.48, 0.6, coreZ);
      pose[15] = movementAvatarProofLandmark(0.14, 0.38, limbZ);
      pose[16] = movementAvatarProofLandmark(0.56, 0.62, limbZ);
      pose[25] = movementAvatarProofLandmark(0.76, 0.48, limbZ);
      pose[26] = movementAvatarProofLandmark(0.74, 0.48, limbZ);
      pose[27] = movementAvatarProofLandmark(0.9, 0.48, limbZ);
      pose[28] = movementAvatarProofLandmark(0.84, 0.38, limbZ);
      pose[29] = movementAvatarProofLandmark(0.9, 0.49, limbZ);
      pose[30] = movementAvatarProofLandmark(0.84, 0.39, limbZ);
      pose[31] = movementAvatarProofLandmark(0.91, 0.5, limbZ);
      pose[32] = movementAvatarProofLandmark(0.85, 0.4, limbZ);
    }
    if (mode === "pilates-hollow-hold") {
      pose[13] = movementAvatarProofLandmark(0.32, 0.36, coreZ);
      pose[14] = movementAvatarProofLandmark(0.34, 0.5, coreZ);
      pose[15] = movementAvatarProofLandmark(0.28, 0.3, limbZ);
      pose[16] = movementAvatarProofLandmark(0.3, 0.44, limbZ);
      pose[25] = movementAvatarProofLandmark(0.76, 0.4, limbZ);
      pose[26] = movementAvatarProofLandmark(0.78, 0.52, limbZ);
      pose[27] = movementAvatarProofLandmark(0.9, 0.34, limbZ);
      pose[28] = movementAvatarProofLandmark(0.92, 0.46, limbZ);
      pose[29] = movementAvatarProofLandmark(0.9, 0.35, limbZ);
      pose[30] = movementAvatarProofLandmark(0.92, 0.47, limbZ);
      pose[31] = movementAvatarProofLandmark(0.91, 0.36, limbZ);
      pose[32] = movementAvatarProofLandmark(0.93, 0.48, limbZ);
    }
    if (mode === "pilates-single-leg-stretch") {
      pose[13] = movementAvatarProofLandmark(0.42, 0.43, coreZ);
      pose[14] = movementAvatarProofLandmark(0.48, 0.58, coreZ);
      pose[15] = movementAvatarProofLandmark(0.6, 0.44, limbZ);
      pose[16] = movementAvatarProofLandmark(0.6, 0.58, limbZ);
      pose[25] = movementAvatarProofLandmark(0.72, 0.4, limbZ);
      pose[26] = movementAvatarProofLandmark(0.82, 0.6, limbZ);
      pose[27] = movementAvatarProofLandmark(0.82, 0.36, limbZ);
      pose[28] = movementAvatarProofLandmark(0.98, 0.62, limbZ);
      pose[29] = movementAvatarProofLandmark(0.82, 0.37, limbZ);
      pose[30] = movementAvatarProofLandmark(0.98, 0.63, limbZ);
      pose[31] = movementAvatarProofLandmark(0.83, 0.38, limbZ);
      pose[32] = movementAvatarProofLandmark(0.99, 0.64, limbZ);
    }
    if (mode === "pilates-double-leg-stretch") {
      pose[13] = movementAvatarProofLandmark(0.2, 0.42, coreZ);
      pose[14] = movementAvatarProofLandmark(0.22, 0.56, coreZ);
      pose[15] = movementAvatarProofLandmark(0.1, 0.4, limbZ);
      pose[16] = movementAvatarProofLandmark(0.12, 0.54, limbZ);
      pose[25] = movementAvatarProofLandmark(0.74, 0.42, limbZ);
      pose[26] = movementAvatarProofLandmark(0.76, 0.54, limbZ);
      pose[27] = movementAvatarProofLandmark(0.88, 0.38, limbZ);
      pose[28] = movementAvatarProofLandmark(0.9, 0.5, limbZ);
      pose[29] = movementAvatarProofLandmark(0.88, 0.39, limbZ);
      pose[30] = movementAvatarProofLandmark(0.9, 0.51, limbZ);
      pose[31] = movementAvatarProofLandmark(0.89, 0.4, limbZ);
      pose[32] = movementAvatarProofLandmark(0.91, 0.52, limbZ);
    }
    if (mode === "prone-cobra") {
      pose[0] = movementAvatarProofLandmark(0.18, 0.38, faceZ);
      pose[7] = movementAvatarProofLandmark(0.18, 0.35, earZ);
      pose[8] = movementAvatarProofLandmark(0.2, 0.42, earZ);
      pose[11] = movementAvatarProofLandmark(0.3, 0.38, coreZ);
      pose[12] = movementAvatarProofLandmark(0.32, 0.5, coreZ);
      pose[13] = movementAvatarProofLandmark(0.42, 0.52, coreZ);
      pose[14] = movementAvatarProofLandmark(0.42, 0.62, coreZ);
      pose[15] = movementAvatarProofLandmark(0.5, 0.53, limbZ);
      pose[16] = movementAvatarProofLandmark(0.5, 0.63, limbZ);
    }
    if (mode === "pilates-swimming") {
      pose[13] = movementAvatarProofLandmark(0.38, 0.42, coreZ);
      pose[14] = movementAvatarProofLandmark(0.48, 0.62, coreZ);
      pose[15] = movementAvatarProofLandmark(0.16, 0.34, limbZ);
      pose[16] = movementAvatarProofLandmark(0.56, 0.62, limbZ);
      pose[25] = movementAvatarProofLandmark(0.76, 0.5, limbZ);
      pose[26] = movementAvatarProofLandmark(0.72, 0.5, limbZ);
      pose[27] = movementAvatarProofLandmark(0.9, 0.5, limbZ);
      pose[28] = movementAvatarProofLandmark(1.08, 0.38, limbZ);
      pose[29] = movementAvatarProofLandmark(0.9, 0.51, limbZ);
      pose[30] = movementAvatarProofLandmark(1.08, 0.39, limbZ);
      pose[31] = movementAvatarProofLandmark(0.91, 0.52, limbZ);
      pose[32] = movementAvatarProofLandmark(1.09, 0.4, limbZ);
    }
    return pose;
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

function rotateProofWorldLandmarks(
  landmarks: MovementAvatarProofMotionLandmark[],
  yaw: number,
) {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const centerX = leftHip && rightHip ? (leftHip.x + rightHip.x) / 2 : 0.5;
  const centerZ = leftHip && rightHip ? (leftHip.z + rightHip.z) / 2 : 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);

  return landmarks.map((landmark) => {
    const x = landmark.x - centerX;
    const z = landmark.z - centerZ;

    return {
      ...landmark,
      x: centerX + x * cos - z * sin,
      z: centerZ + x * sin + z * cos,
    };
  });
}

function translateProofWorldLandmarks(
  landmarks: MovementAvatarProofMotionLandmark[],
  offset: { x: number; z: number },
) {
  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x + offset.x,
    z: landmark.z + offset.z,
  }));
}

export function makeMovementAvatarProofWorldLandmarks(
  mode: MovementAvatarProofMode,
): MovementAvatarProofMotionLandmark[] | null {
  if (mode === "root-turn-left") {
    return rotateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      Math.PI,
    );
  }

  if (mode === "root-turn-right") {
    return rotateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      -Math.PI / 2,
    );
  }

  if (mode === "root-travel-right") {
    return translateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      { x: 0.58, z: 0.22 },
    );
  }

  if (mode === "root-travel-left") {
    return translateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      { x: -0.58, z: 0 },
    );
  }

  if (mode === "root-travel-forward") {
    return translateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      { x: 0, z: 0.58 },
    );
  }

  if (mode === "root-travel-back") {
    return translateProofWorldLandmarks(
      toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
      { x: 0, z: -0.58 },
    );
  }

  if (mode === "root-turn-travel") {
    return translateProofWorldLandmarks(
      rotateProofWorldLandmarks(
        toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
        Math.PI / 2,
      ),
      { x: 0.58, z: 0.22 },
    );
  }

  return null;
}

export function makeMovementAvatarProofRootBaselinePayload(): MovementAvatarProofMotionPayload {
  const landmarks = toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing"));

  return {
    faceLandmarks: makeMovementAvatarProofFaceLandmarks("standing"),
    landmarks,
    worldLandmarks: landmarks,
  };
}

export function makeMovementAvatarProofMotionPayload(
  mode: MovementAvatarProofMode,
): MovementAvatarProofMotionPayload {
  const hands = makeMovementAvatarProofHands(mode);
  const landmarks = toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose(mode));
  const worldLandmarks = makeMovementAvatarProofWorldLandmarks(mode);

  return {
    faceLandmarks: makeMovementAvatarProofFaceLandmarks(mode),
    landmarks,
    worldLandmarks,
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
