import type {
  Classifications,
  FaceLandmarkerResult,
  HandLandmarkerResult,
  Landmark,
  NormalizedLandmark,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
import { resolveHandSideByWrist } from "./handMatching";
import {
  MEDIAPIPE_FACE_MODEL_URL,
  MEDIAPIPE_HAND_CONFIDENCE,
  MEDIAPIPE_HAND_MODEL_URL,
  MEDIAPIPE_POSE_CONFIDENCE,
  MEDIAPIPE_POSE_MODEL_URL,
  MEDIAPIPE_VISION_WASM_URL,
} from "./mediaPipeConfig";
import {
  buildMovementRecordedPlayerSetup,
  type MovementRecordedPlayerSetup,
} from "./movementRecordedPlayerSetup";
import type { MovementHandSide } from "./movementTypes";
import type { VrmMotionPayload } from "./vrmRigging";

type MovementFilterDefinition = {
  beta: number;
  frequency: number;
  landmarkCount: number;
  minCutoff: number;
};

export const MOVEMENT_PLAYER_SETUP_POLICY_ID = "movement-player-setup-v1";

export const MOVEMENT_PLAYER_INPUT_CONTRACT = {
  detector: {
    faceModelUrl: MEDIAPIPE_FACE_MODEL_URL,
    handConfidence: MEDIAPIPE_HAND_CONFIDENCE,
    handModelUrl: MEDIAPIPE_HAND_MODEL_URL,
    id: "mediapipe-vision-v1",
    poseConfidence: MEDIAPIPE_POSE_CONFIDENCE,
    poseModelUrl: MEDIAPIPE_POSE_MODEL_URL,
    wasmUrl: MEDIAPIPE_VISION_WASM_URL,
  },
  id: "movement-player-input-v1",
  filters: {
    hand: {
      beta: 0.08,
      frequency: 60,
      landmarkCount: 21,
      minCutoff: 1.6,
    },
    pose: {
      beta: 0.1,
      frequency: 60,
      landmarkCount: 33,
      minCutoff: 0.05,
    },
  },
  setup: {
    id: MOVEMENT_PLAYER_SETUP_POLICY_ID,
    prefixFrameCount: 60,
    sampleLimit: 12,
  },
} as const;

export type MovementPlayerInputContractId = typeof MOVEMENT_PLAYER_INPUT_CONTRACT.id;

export type MovementAcquisitionHandCapture = {
  landmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[] | null;
};

export type MovementAcquisitionCameraMetadata = {
  facingMode: "user";
  frameHeight: number;
  frameWidth: number;
};

export type MovementAcquisitionFrame = {
  acquisitionProfileId: MovementPlayerInputContractId;
  blendshapes?: Classifications["categories"];
  camera: MovementAcquisitionCameraMetadata;
  capturedAt: number;
  faceLandmarks?: NormalizedLandmark[] | null;
  hands?: Partial<Record<MovementHandSide, MovementAcquisitionHandCapture | null>>;
  landmarks?: NormalizedLandmark[];
  sourceTimestampMs: number;
  worldLandmarks?: Landmark[] | null;
};

export type MovementAcquisitionFilters = {
  leftHand: PoseFilterWrapper;
  leftHandWorld: PoseFilterWrapper;
  pose: PoseFilterWrapper;
  rightHand: PoseFilterWrapper;
  rightHandWorld: PoseFilterWrapper;
  worldPose: PoseFilterWrapper;
};

function createFilter(definition: MovementFilterDefinition) {
  return new PoseFilterWrapper(
    definition.landmarkCount,
    definition.frequency,
    definition.minCutoff,
    definition.beta,
  );
}

export function createMovementAcquisitionFilters(): MovementAcquisitionFilters {
  const { hand, pose } = MOVEMENT_PLAYER_INPUT_CONTRACT.filters;
  return {
    leftHand: createFilter(hand),
    leftHandWorld: createFilter(hand),
    pose: createFilter(pose),
    rightHand: createFilter(hand),
    rightHandWorld: createFilter(hand),
    worldPose: createFilter(pose),
  };
}

export function prepareMovementAcquisitionFrame({
  camera,
  capturedAt,
  faceResults,
  filters,
  handResults,
  poseResults,
  sourceTimestampMs,
}: {
  camera: MovementAcquisitionCameraMetadata;
  capturedAt: number;
  faceResults: FaceLandmarkerResult;
  filters: MovementAcquisitionFilters;
  handResults: HandLandmarkerResult;
  poseResults: PoseLandmarkerResult;
  sourceTimestampMs: number;
}): MovementAcquisitionFrame {
  const frame: MovementAcquisitionFrame = {
    acquisitionProfileId: MOVEMENT_PLAYER_INPUT_CONTRACT.id,
    camera,
    capturedAt,
    sourceTimestampMs,
  };
  const rawPose = poseResults.landmarks[0];
  const rawWorldPose = poseResults.worldLandmarks[0];

  if (rawPose) {
    frame.landmarks = filters.pose.filter(rawPose, sourceTimestampMs);
    frame.worldLandmarks = rawWorldPose
      ? filters.worldPose.filter(rawWorldPose, sourceTimestampMs)
      : null;
  }

  if (faceResults.faceLandmarks[0]) {
    frame.faceLandmarks = faceResults.faceLandmarks[0];
  }

  if (faceResults.faceBlendshapes[0]) {
    frame.blendshapes = faceResults.faceBlendshapes[0].categories;
  }

  if (handResults.landmarks.length > 0) {
    const hands: Partial<Record<MovementHandSide, MovementAcquisitionHandCapture | null>> = {
      left: null,
      right: null,
    };
    const leftWrist = frame.landmarks?.[15] ?? null;
    const rightWrist = frame.landmarks?.[16] ?? null;

    handResults.landmarks.forEach((landmarks, index) => {
      const side = resolveHandSideByWrist({
        handWrist: landmarks[0],
        leftWrist,
        rightWrist,
      });
      const handFilter = side === "left" ? filters.leftHand : filters.rightHand;
      const worldFilter = side === "left" ? filters.leftHandWorld : filters.rightHandWorld;
      const worldLandmarks = handResults.worldLandmarks[index];
      hands[side] = {
        landmarks: handFilter.filter(landmarks, sourceTimestampMs),
        worldLandmarks: worldLandmarks
          ? worldFilter.filter(worldLandmarks, sourceTimestampMs)
          : null,
      };
    });
    frame.hands = hands;
  }

  return frame;
}

export function buildMovementPlayerSetupFromPrefix(
  frames: VrmMotionPayload[],
): MovementRecordedPlayerSetup | null {
  const { prefixFrameCount, sampleLimit } = MOVEMENT_PLAYER_INPUT_CONTRACT.setup;
  if (frames.length < prefixFrameCount) return null;

  const setup = buildMovementRecordedPlayerSetup({
    frameLimit: prefixFrameCount - 1,
    frames,
    sampleLimit,
  });
  return {
    ...setup,
    provenance: {
      ...setup.provenance,
      inputContractId: MOVEMENT_PLAYER_INPUT_CONTRACT.id,
    },
  };
}
