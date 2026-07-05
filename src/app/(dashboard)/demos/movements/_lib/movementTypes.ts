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
  | "storage-json-v1";

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
  timestamp?: number;
  pose?: MovementLandmark[];
  landmarks?: MovementLandmark[];
  worldLandmarks?: MovementLandmark[] | null;
  faceLandmarks?: MovementLandmark[] | null;
  blendshapes?: unknown[];
  hands?: Partial<Record<MovementHandSide, MovementHandCapture | null>>;
};

export type MovementFrame = MovementFramePayload | MovementLandmark[];

export type MovementFrameEnvelope = {
  schemaVersion: 1;
  capturedAt?: number;
  captureStartReadiness?: MovementStartReadiness;
  fps?: number;
  frames: MovementFrame[];
};

export type MovementFrameParseResult = {
  frames: MovementFrame[];
  format: MovementDataFormat;
  fps: number;
  captureStartReadiness?: MovementStartReadiness;
  schemaVersion?: number;
};
