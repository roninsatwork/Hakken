import type {
  Classifications,
  FaceLandmarkerResult,
  HandLandmarkerResult,
  Landmark,
  NormalizedLandmark,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
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
import {
  buildMovementDeepCaptureFaceEvidence,
  buildMovementDeepCaptureHandEvidence,
  buildMovementDeepCaptureSegmentationEvidence,
  createMovementDeepCaptureFrameEvidence,
  resolveMovementDeepCaptureHandAssignment,
} from "./movementDeepCaptureEvidence";
import type {
  MovementDeepCaptureFrameEvidence,
  MovementDeepCaptureProfileId,
} from "./movementDeepCaptureContract";
import { MOVEMENT_START_MIN_CALIBRATION_QUALITY } from "./movementSourceFrame";
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
  deviceFingerprint?: string;
  facingMode: "user";
  frameHeight: number;
  frameWidth: number;
};

export type MovementAcquisitionFrame = {
  acquisitionProfileId: MovementPlayerInputContractId | MovementDeepCaptureProfileId;
  blendshapes?: Classifications["categories"];
  camera: MovementAcquisitionCameraMetadata;
  capturedAt: number;
  deepCapture?: MovementDeepCaptureFrameEvidence;
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
  includeSegmentation = false,
}: {
  camera: MovementAcquisitionCameraMetadata;
  capturedAt: number;
  faceResults: FaceLandmarkerResult;
  filters: MovementAcquisitionFilters;
  handResults: HandLandmarkerResult;
  poseResults: PoseLandmarkerResult;
  sourceTimestampMs: number;
  includeSegmentation?: boolean;
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

  const deepCapture: MovementDeepCaptureFrameEvidence = createMovementDeepCaptureFrameEvidence();
  const faceEvidence = buildMovementDeepCaptureFaceEvidence({
    camera,
    capturedAt,
    faceResults,
    sourceTimestampMs,
  });
  if (faceEvidence) deepCapture.face = faceEvidence;
  if (includeSegmentation) {
    const denseBody = buildMovementDeepCaptureSegmentationEvidence({
      camera,
      capturedAt,
      poseResults,
      sourceTimestampMs,
    });
    if (denseBody) deepCapture.denseBody = denseBody;
  }

  if (handResults.landmarks.length > 0) {
    const hands: Partial<Record<MovementHandSide, MovementAcquisitionHandCapture | null>> = {
      left: null,
      right: null,
    };
    const leftWrist = frame.landmarks?.[15] ?? null;
    const rightWrist = frame.landmarks?.[16] ?? null;

    handResults.landmarks.forEach((landmarks, index) => {
      const assignment = resolveMovementDeepCaptureHandAssignment({
        detectorCategory: handResults.handedness[index]?.[0]
          ?? handResults.handednesses[index]?.[0],
        handWrist: landmarks[0],
        leftWrist,
        rightWrist,
      });
      const { side } = assignment;
      const handFilter = side === "left" ? filters.leftHand : filters.rightHand;
      const worldFilter = side === "left" ? filters.leftHandWorld : filters.rightHandWorld;
      const worldLandmarks = handResults.worldLandmarks[index];
      const evidence = buildMovementDeepCaptureHandEvidence({
        assignment: assignment.assignment,
        camera,
        capturedAt,
        detector: assignment.detector,
        landmarks,
        side,
        sourceTimestampMs,
        worldLandmarks,
      });
      const existingEvidence = deepCapture.hands?.[side];
      if (
        hands[side] &&
        (existingEvidence?.detectorHandedness.score ?? 0) >=
          (evidence?.detectorHandedness.score ?? 0)
      ) return;

      hands[side] = {
        landmarks: handFilter.filter(landmarks, sourceTimestampMs),
        worldLandmarks: worldLandmarks
          ? worldFilter.filter(worldLandmarks, sourceTimestampMs)
          : null,
      };
      if (evidence) {
        deepCapture.hands ??= {};
        deepCapture.hands[side] = evidence;
      }
    });
    frame.hands = hands;
  }

  if (deepCapture.denseBody || deepCapture.face || deepCapture.hands) frame.deepCapture = deepCapture;

  return frame;
}

/**
 * Player motion history begins at the accepted setup window, never before.
 * The live Game physically cannot have temporal state older than its setup
 * window, so Replay must not seed its player chain with earlier frames.
 */
export function getMovementPlayerSetupWindowStartIndex(
  setup: MovementRecordedPlayerSetup | null,
): number {
  return setup?.provenance.windowStartIndex ?? 0;
}

export function isMovementPlayerSetupAcceptable(
  setup: MovementRecordedPlayerSetup | null,
): boolean {
  return Boolean(
    setup?.calibration &&
    setup.retargetSourceModel &&
    setup.calibration.quality >= MOVEMENT_START_MIN_CALIBRATION_QUALITY,
  );
}

/**
 * Builds the setup for one candidate window. `windowFrames` must be exactly
 * the contract's prefix length and `windowStartIndex` is the window's
 * absolute position in the recording. Replay and the live Game both build
 * windows through here so their setup objects are byte-identical.
 */
export function buildMovementPlayerSetupWindow(
  windowFrames: VrmMotionPayload[],
  windowStartIndex: number,
): MovementRecordedPlayerSetup | null {
  const { prefixFrameCount, sampleLimit } = MOVEMENT_PLAYER_INPUT_CONTRACT.setup;
  if (windowFrames.length !== prefixFrameCount) return null;

  const setup = buildMovementRecordedPlayerSetup({
    frameLimit: prefixFrameCount - 1,
    frames: windowFrames,
    sampleLimit,
  });
  return {
    ...setup,
    provenance: {
      ...setup.provenance,
      inputContractId: MOVEMENT_PLAYER_INPUT_CONTRACT.id,
      windowStartIndex,
    },
  };
}

/**
 * Shared sliding setup policy. Starting at the recording head, accept the
 * first prefix-length window whose calibration passes the shared quality
 * bar — the same one-frame-at-a-time advance the live Game setup performs
 * past a weak start. If no window ever qualifies, fall back to the first
 * window so legacy recordings still replay; the mounted Game gate fails
 * such packets visibly instead of silently diverging.
 */
export function buildMovementPlayerSetupFromPrefix(
  frames: VrmMotionPayload[],
): MovementRecordedPlayerSetup | null {
  const { prefixFrameCount } = MOVEMENT_PLAYER_INPUT_CONTRACT.setup;
  if (frames.length < prefixFrameCount) return null;

  let firstWindowFallback: MovementRecordedPlayerSetup | null = null;
  for (let start = 0; start + prefixFrameCount <= frames.length; start += 1) {
    const candidate = buildMovementPlayerSetupWindow(
      frames.slice(start, start + prefixFrameCount),
      start,
    );
    if (isMovementPlayerSetupAcceptable(candidate)) return candidate;
    if (start === 0) firstWindowFallback = candidate;
  }
  return firstWindowFallback;
}
