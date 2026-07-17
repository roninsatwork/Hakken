import type { MovementStartReadiness } from "./movementSourceFrame";

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
  | "storage-json-v2";

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
  schemaVersion: 1 | 2;
  capturedAt?: number;
  captureStartReadiness?: MovementStartReadiness;
  channelSummary?: MovementRecordingChannelSummary;
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
    setup: { prefixFrameCount: number; sampleLimit: number };
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
  inputContract?: MovementFrameEnvelope["inputContract"];
  schemaVersion?: number;
  setupPrefix?: MovementFrameEnvelope["setupPrefix"];
  sourcePacketHash?: string;
};
