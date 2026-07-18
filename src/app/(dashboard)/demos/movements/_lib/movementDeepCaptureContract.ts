export const MOVEMENT_DEEP_CAPTURE_PROFILE = {
  anchorTarget: {
    maximum: 500,
    minimum: 200,
  },
  channels: [
    "pose",
    "worldPose",
    "leftHand",
    "rightHand",
    "palmWrist",
    "face",
    "eyesGaze",
    "blendshapes",
    "camera",
    "segmentation",
    "denseBody",
    "setupPrefix",
    "readiness",
  ],
  id: "movement-deep-capture-v1",
  privacy: {
    persistRawRgbByDefault: false,
    persistRawVideoByDefault: false,
  },
  schemaVersion: 3,
} as const;

export type MovementDeepCaptureProfileId = typeof MOVEMENT_DEEP_CAPTURE_PROFILE.id;
export type MovementDeepCaptureObservationOrigin =
  | "observed"
  | "model-estimated"
  | "temporally-tracked"
  | "derived";

export type MovementDeepCaptureEvidenceProvenance = {
  ageMs: number;
  confidence: number;
  inferenceTimestampMs: number;
  origin: MovementDeepCaptureObservationOrigin;
  sourceTimestampMs: number;
};

export type MovementDeepCaptureCrop = {
  height: number;
  sourceFrameHeight: number;
  sourceFrameWidth: number;
  width: number;
  x: number;
  y: number;
};

export type MovementDeepCaptureRefinementMetadata = {
  inferenceDurationMs: number;
  inputHeight: number;
  inputWidth: number;
  profileId: "movement-deep-capture-refinement-v1";
  roiSource?: "coarse-hand-landmarker" | "pose-hand-fallback" | "face-landmarker";
  source: "native-roi-second-pass";
};

export type MovementDeepCaptureTrackingStatus = {
  occluded: boolean;
  state: "observed" | "temporally-carried" | "reacquired";
};

export type MovementDeepCaptureHandEvidence = {
  assignment: "detector" | "pose-wrist-reconciled" | "ambiguous";
  crop: MovementDeepCaptureCrop;
  detectorHandedness: {
    label: "Left" | "Right" | "Unknown";
    score: number;
  };
  fingerJointAngles?: Record<string, {
    provenance: MovementDeepCaptureEvidenceProvenance;
    radians: number;
  }>;
  orientation?: {
    facing: "palm-facing-camera" | "palm-facing-away" | "edge-on" | "unknown";
    palmNormal: { x: number; y: number; z: number } | null;
    provenance: MovementDeepCaptureEvidenceProvenance;
    wristRotation: { x: number; y: number; z: number } | null;
  };
  provenance: MovementDeepCaptureEvidenceProvenance;
  refinement?: MovementDeepCaptureRefinementMetadata;
  tracking: MovementDeepCaptureTrackingStatus;
};

export type MovementDeepCaptureFaceEvidence = {
  crop: MovementDeepCaptureCrop;
  facialTransformationMatrix: number[] | null;
  gaze: {
    fused: { x: number; y: number; z: number } | null;
    left: { x: number; y: number; z: number } | null;
    provenance: MovementDeepCaptureEvidenceProvenance;
    right: { x: number; y: number; z: number } | null;
  };
  irisLandmarkCount: number;
  eyeVisibility: {
    eyewear: "unknown";
    left: "visible" | "occluded-or-unresolved";
    right: "visible" | "occluded-or-unresolved";
  };
  provenance: MovementDeepCaptureEvidenceProvenance;
  refinement?: MovementDeepCaptureRefinementMetadata;
  tracking: MovementDeepCaptureTrackingStatus;
};

export type MovementDeepCaptureBodyRegion =
  | "head"
  | "chest"
  | "back"
  | "abdomen"
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "pelvis"
  | "leftThigh"
  | "rightThigh"
  | "leftCalf"
  | "rightCalf"
  | "leftShin"
  | "rightShin"
  | "leftHand"
  | "rightHand"
  | "leftFoot"
  | "rightFoot";

export const MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS = [
  "head",
  "chest",
  "back",
  "abdomen",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "pelvis",
  "leftThigh",
  "rightThigh",
  "leftCalf",
  "rightCalf",
  "leftShin",
  "rightShin",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot",
] as const satisfies readonly MovementDeepCaptureBodyRegion[];

export type MovementDeepCaptureSurfaceAnchor = {
  anatomicalSide: "left" | "right" | "midline";
  depth: number | null;
  id: string;
  image: { x: number; y: number };
  normal: { x: number; y: number; z: number } | null;
  occluded: boolean;
  provenance: MovementDeepCaptureEvidenceProvenance;
  region: MovementDeepCaptureBodyRegion;
  surface: "front" | "back" | "side" | "unknown";
};

export type MovementDeepCaptureBodyEvidence = {
  adapter?: {
    inferenceDurationMs: number;
    inputHeight: number;
    inputWidth: number;
    profileId: "movement-dense-capture-adapter-v1";
    qualityTier: "high" | "medium" | "low";
    runtime: "webgl" | "webgpu" | "wasm";
    targetIntervalMs: number;
  };
  anchors: MovementDeepCaptureSurfaceAnchor[];
  fusion?: MovementDeepCaptureBodyFusion;
  modelHash: string;
  modelId: string;
  segmentation: {
    confidence: number;
    coverage: number;
    encoding: "model-rle" | "derived-contour";
    frameHeight: number;
    frameWidth: number;
    maskHeight: number;
    maskWidth: number;
    payload: string | number[][];
    provenance: MovementDeepCaptureEvidenceProvenance;
  };
};

export type MovementDeepCaptureRegionFusion = {
  anchorCount: number;
  confidence: number;
  currentCount: number;
  derivedCount: number;
  modelEstimatedCount: number;
  observedCount: number;
  occludedCount: number;
  state: "current" | "tracked" | "occluded" | "missing";
  surfaceCounts: Record<"front" | "back" | "side" | "unknown", number>;
  temporallyTrackedCount: number;
};

export type MovementDeepCaptureBodyFusion = {
  contactCandidates: Record<"leftFoot" | "rightFoot", {
    anchorIds: string[];
    confidence: number;
    imageBottom: number | null;
    state: "eligible" | "occluded" | "missing";
  }>;
  profileId: "movement-dense-capture-fusion-v1";
  regionCoverage: Record<MovementDeepCaptureBodyRegion, MovementDeepCaptureRegionFusion>;
  skeleton: {
    poseLandmarkCount: number;
    worldPoseLandmarkCount: number;
  };
  torsoTwist: {
    confidence: number;
    radians: number | null;
    reason: "derived-from-current-surface-normals" | "insufficient-current-surface-normals";
  };
};

export type MovementDeepCaptureFrameEvidence = {
  denseBody?: MovementDeepCaptureBodyEvidence;
  face?: MovementDeepCaptureFaceEvidence;
  hands?: Partial<Record<"left" | "right", MovementDeepCaptureHandEvidence | null>>;
  profileId: MovementDeepCaptureProfileId;
};

export type MovementDeepCaptureChannelSummary = Record<
  "leftHand" | "rightHand" | "palmWrist" | "face" | "eyesGaze" | "segmentation" | "denseBody",
  {
    complete: boolean;
    presentFrames: number;
    totalFrames: number;
  }
>;
