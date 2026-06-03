import type { Classifications } from "@mediapipe/tasks-vision";
import * as Kalidokit from "kalidokit";
import type { MovementHandSide } from "./movementTypes";

export type VrmBlendshapeCategory = Classifications["categories"][number];

export type VrmLandmarkTuple = [number, number, number?];

export type VrmPoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  isSnapped?: boolean;
};

export type VrmLandmarkInput = VrmPoseLandmark | VrmLandmarkTuple;

export type VrmSolverLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
  isSnapped?: boolean;
};

export type VrmHandCapture = {
  landmarks: VrmPoseLandmark[];
  worldLandmarks?: VrmPoseLandmark[] | null;
};

export type VrmHandsPayload = Partial<Record<MovementHandSide, VrmHandCapture | null>>;

export type VrmMotionPayload = {
  pose?: VrmPoseLandmark[];
  landmarks?: VrmPoseLandmark[];
  worldLandmarks?: VrmPoseLandmark[] | null;
  faceLandmarks?: VrmPoseLandmark[] | null;
  blendshapes?: VrmBlendshapeCategory[];
  hands?: VrmHandsPayload;
};

export type VrmMotionFrame = VrmMotionPayload | VrmPoseLandmark[];

export type VrmMotionRef = VrmMotionFrame | null;

export type VrmRigRotation = {
  x: number;
  y: number;
  z: number;
  rotationOrder?: string;
};

export type VrmRiggedPose = {
  Neck?: VrmRigRotation;
  Head?: VrmRigRotation;
  RightHand?: VrmRigRotation;
  LeftHand?: VrmRigRotation;
  Hips?: {
    position?: unknown;
  };
};

export type VrmHandRig = Record<string, VrmRigRotation | undefined>;

const PLAYER_FINGER_GAIN = 1.35;
const INSTRUCTOR_FINGER_GAIN = 1.15;
const THUMB_GAIN_MULTIPLIER = 0.9;

function clampRotation(value: number, limit = Math.PI) {
  return Math.max(-limit, Math.min(limit, value));
}

export function getVrmMotionLandmarks(value: VrmMotionRef): VrmPoseLandmark[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.pose ?? value.landmarks ?? [];
}

type PrepareVrmSolverInput = {
  rawLandmarks: VrmLandmarkInput[];
  payload: VrmMotionPayload | null;
  isPlayer: boolean;
  isPlaying: boolean;
};

export function normalizeVrmLandmark(landmark: VrmLandmarkInput): VrmSolverLandmark {
  if (Array.isArray(landmark)) {
    return {
      x: landmark[0],
      y: landmark[1],
      z: landmark[2] ?? 0,
      visibility: 0.8,
    };
  }

  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? 0.8,
    isSnapped: landmark.isSnapped,
  };
}

export function mirrorVrmLandmarkArray(
  arr: VrmSolverLandmark[],
  invertX: (x: number) => number,
) {
  const swapPairs = [
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
  ];

  arr.forEach((lm) => {
    lm.x = invertX(lm.x);
  });
  swapPairs.forEach(([leftIndex, rightIndex]) => {
    if (arr[leftIndex] && arr[rightIndex]) {
      const temp = { ...arr[leftIndex] };
      arr[leftIndex] = { ...arr[rightIndex] };
      arr[rightIndex] = temp;
    }
  });
}

function mirrorHandsPayload(hands: VrmHandsPayload): VrmHandsPayload {
  const mirroredHands: VrmHandsPayload = {};

  if (hands.left) {
    mirroredHands.right = { ...hands.left };
    if (mirroredHands.right.worldLandmarks) {
      mirroredHands.right.worldLandmarks = mirroredHands.right.worldLandmarks.map((lm) => ({
        ...lm,
        x: -lm.x,
      }));
    }
  }

  if (hands.right) {
    mirroredHands.left = { ...hands.right };
    if (mirroredHands.left.worldLandmarks) {
      mirroredHands.left.worldLandmarks = mirroredHands.left.worldLandmarks.map((lm) => ({
        ...lm,
        x: -lm.x,
      }));
    }
  }

  return mirroredHands;
}

function mirrorBlendshapeSides(blendshapes: VrmBlendshapeCategory[]) {
  return blendshapes.map((blendshape) => {
    let name = blendshape.categoryName;
    if (name.includes("Left")) name = name.replace("Left", "Right");
    else if (name.includes("Right")) name = name.replace("Right", "Left");
    return { ...blendshape, categoryName: name };
  });
}

export function prepareVrmSolverInput({
  rawLandmarks,
  payload,
  isPlayer,
  isPlaying,
}: PrepareVrmSolverInput) {
  const forceStandby = !isPlayer && !isPlaying;
  const format = (landmark: VrmLandmarkInput) => {
    const normalized = normalizeVrmLandmark(landmark);
    return {
      ...normalized,
      visibility: forceStandby ? 0 : normalized.visibility,
    };
  };

  const imageLandmarks = rawLandmarks.map(format);
  let solverLandmarks: VrmSolverLandmark[];
  let rigHands = payload?.hands;
  let rigBlendshapes = payload?.blendshapes;

  if (payload?.worldLandmarks) {
    solverLandmarks = payload.worldLandmarks.map(format);
  } else {
    solverLandmarks = createVrmImageSolverLandmarks(imageLandmarks);
  }

  const kalidokitSolverLandmarks = solverLandmarks.map((lm) => ({ ...lm }));

  if (!isPlayer) {
    mirrorVrmLandmarkArray(imageLandmarks, (x) => 1 - x);
    mirrorVrmLandmarkArray(solverLandmarks, (x) => -x);
    mirrorVrmLandmarkArray(kalidokitSolverLandmarks, (x) => -x);

    if (payload?.hands) {
      rigHands = mirrorHandsPayload(payload.hands);
    }

    if (payload?.blendshapes) {
      rigBlendshapes = mirrorBlendshapeSides(payload.blendshapes);
    }
  }

  return {
    forceStandby,
    imageLandmarks,
    solverLandmarks,
    kalidokitSolverLandmarks,
    rigHands,
    rigBlendshapes,
  };
}

export function createVrmImageSolverLandmarks(
  imageLandmarks: VrmSolverLandmark[],
): VrmSolverLandmark[] {
  const leftHip = imageLandmarks[23];
  const rightHip = imageLandmarks[24];

  if (!leftHip || !rightHip) return imageLandmarks.map((lm) => ({ ...lm }));

  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;

  return imageLandmarks.map((lm) => ({
    x: (lm.x - hipX) * 3.0,
    y: (lm.y - hipY) * 3.0,
    z: lm.z * 3.0,
    visibility: lm.visibility || 0,
    isSnapped: lm.isSnapped,
  }));
}

export function getVrmHandWristFallbackTarget(
  handData: VrmHandCapture | null | undefined,
  imageLandmarks: VrmSolverLandmark[],
): VrmSolverLandmark | null {
  const handWrist = handData?.landmarks?.[0];
  const leftHip = imageLandmarks[23];
  const rightHip = imageLandmarks[24];

  if (!handWrist || !leftHip || !rightHip) return null;
  if (handWrist.visibility !== undefined && handWrist.visibility < 0.15) return null;

  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;

  return {
    x: (handWrist.x - hipX) * 3.0,
    y: (handWrist.y - hipY) * 3.0,
    z: (handWrist.z ?? 0) * 3.0,
    visibility: handWrist.visibility ?? 0.95,
    isSnapped: handWrist.isSnapped,
  };
}

export function solveVrmPose(
  kalidokitSolverLandmarks: VrmSolverLandmark[],
  imageLandmarks: VrmSolverLandmark[],
): VrmRiggedPose | null {
  return Kalidokit.Pose.solve(kalidokitSolverLandmarks, imageLandmarks, {
    runtime: "mediapipe",
    video: null,
    imageSize: { width: 640, height: 480 },
  }) as VrmRiggedPose | null;
}

export function solveVrmHand(
  landmarks: VrmPoseLandmark[],
  handedness: "Left" | "Right",
): VrmHandRig | null {
  const solverLandmarks = landmarks.map((landmark) => ({
    ...landmark,
    z: landmark.z ?? 0,
  }));

  return Kalidokit.Hand.solve(solverLandmarks, handedness) as VrmHandRig | null;
}

export function prepareVrmHandLandmarks(
  handData: VrmHandCapture,
  options: { mirrorX?: boolean } = {},
): VrmPoseLandmark[] {
  const sourceLandmarks = handData.landmarks;

  return sourceLandmarks.map((landmark) => ({
    ...landmark,
    x: options.mirrorX ? 1 - landmark.x : landmark.x,
  }));
}

export function strengthenVrmHandRotation(
  rotation: VrmRigRotation,
  options: { isPlayer: boolean; isWrist: boolean; isThumb: boolean },
): VrmRigRotation {
  if (options.isWrist) return rotation;

  const baseGain = options.isPlayer ? PLAYER_FINGER_GAIN : INSTRUCTOR_FINGER_GAIN;
  const gain = options.isThumb ? baseGain * THUMB_GAIN_MULTIPLIER : baseGain;

  return {
    ...rotation,
    x: clampRotation(rotation.x * gain),
    y: clampRotation(rotation.y * gain),
    z: clampRotation(rotation.z * gain),
  };
}
