import type { MovementStartReadiness } from "./movementSourceFrame";
import type {
  MovementDeepCaptureChannelSummary,
  MovementDeepCaptureFrameEvidence,
  MovementDeepCaptureProfileId,
} from "./movementDeepCaptureContract";

export type MovementDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type MovementSpineGoal =
  | "neutralStack"
  | "hipHinge"
  | "rollDown"
  | "thoracicRotation"
  | "sideBend"
  | "extension"
  | "squatWithStack";

export type MovementBodyFocus =
  | "neck"
  | "shoulders"
  | "ribcage"
  | "pelvis"
  | "hips"
  | "feet";

export type MovementDataFormat =
  | "legacy-inline-json"
  | "legacy-storage-json"
  | "storage-json-v1"
  | "storage-json-v2"
  | "storage-json-v3";

export type MovementLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type MovementHandSide = "left" | "right";

export type MovementHandCapture = {
  landmarks: MovementLandmark[];
  worldLandmarks?: MovementLandmark[] | null;
};

export type MovementFramePayload = {
  acquisitionProfileId?: string;
  camera?: {
    deviceFingerprint?: string;
    facingMode?: string;
    frameHeight?: number;
    frameWidth?: number;
  };
  capturedAt?: number;
  timestamp?: number;
  sourceTimestampMs?: number;
  pose?: MovementLandmark[];
  landmarks?: MovementLandmark[];
  worldLandmarks?: MovementLandmark[] | null;
  faceLandmarks?: MovementLandmark[] | null;
  blendshapes?: unknown[];
  deepCapture?: MovementDeepCaptureFrameEvidence;
  hands?: Partial<Record<MovementHandSide, MovementHandCapture | null>>;
  startReadiness?: MovementStartReadiness;
};

export type MovementFrame = MovementFramePayload | MovementLandmark[];

export type MovementRecordingChannelSummary = Record<
  "blendshapes" | "camera" | "face" | "hands" | "pose" | "worldPose",
  {
    complete: boolean;
    presentFrames: number;
    totalFrames: number;
  }
>;

export type MovementFrameEnvelope = {
  schemaVersion: 1 | 2 | 3;
  capturedAt?: number;
  captureStartReadiness?: MovementStartReadiness;
  channelSummary?: MovementRecordingChannelSummary;
  deepCaptureChannelSummary?: MovementDeepCaptureChannelSummary;
  deepCaptureProfile?: {
    anchorTarget: { maximum: number; minimum: number };
    channels: readonly string[];
    id: MovementDeepCaptureProfileId;
    privacy: {
      persistRawRgbByDefault: boolean;
      persistRawVideoByDefault: boolean;
    };
    denseAdapter: {
      id: "movement-dense-capture-adapter-v1";
      maximumBackoffMs: number;
      qualityProfiles: Record<"high" | "medium" | "low", {
        inputHeight: number;
        inputWidth: number;
        internalResolution: "medium" | "low";
        targetIntervalMs: number;
      }>;
      staleAfterMs: number;
      targetIntervalMs: number;
    };
    refinement: {
      id: "movement-deep-capture-refinement-v1";
      maximumBackoffMs: number;
      maximumInputEdgePixels: number;
      minimumFaceInputPixels: number;
      minimumHandInputPixels: number;
      staleAfterMs: number;
      targetIntervalMs: number;
    };
    schemaVersion: 3;
  };
  fps?: number;
  frames: MovementFrame[];
  inputContract?: {
    detector: {
      faceModelUrl: string;
      handConfidence: number;
      handModelUrl: string;
      id: string;
      poseConfidence: number;
      poseModelUrl: string;
      wasmUrl: string;
    };
    filters: {
      hand: { beta: number; frequency: number; landmarkCount: number; minCutoff: number };
      pose: { beta: number; frequency: number; landmarkCount: number; minCutoff: number };
    };
    id: string;
    setup: { id?: string; prefixFrameCount: number; sampleLimit: number };
  };
  setupPrefix?: {
    complete: boolean;
    frameIndexes: number[];
    requiredFrameCount: number;
  };
  sourcePacketHash?: string;
};

export type MovementFrameParseResult = {
  frames: MovementFrame[];
  format: MovementDataFormat;
  fps: number;
  captureStartReadiness?: MovementStartReadiness;
  channelSummary?: MovementRecordingChannelSummary;
  deepCaptureChannelSummary?: MovementDeepCaptureChannelSummary;
  deepCaptureProfile?: MovementFrameEnvelope["deepCaptureProfile"];
  inputContract?: MovementFrameEnvelope["inputContract"];
  schemaVersion?: number;
  setupPrefix?: MovementFrameEnvelope["setupPrefix"];
  sourcePacketHash?: string;
};
