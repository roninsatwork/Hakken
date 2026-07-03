export type MovementDebugReplayCamera = {
  aspectRatio?: number;
  deviceLabel?: string;
  frameRate?: number;
  trackHeight?: number;
  trackWidth?: number;
  videoHeight?: number;
  videoWidth?: number;
};

export type MovementDebugReplayPoseBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  outOfFrameCount: number;
};

export type MovementDebugReplayRetarget = {
  appliedLowerBody?: number;
  appliedUpperBody?: number;
  footLockCorrection?: number;
  footLockDrift?: number;
  footLockStrength?: number;
  hipDrop?: number;
  leftFootContact?: boolean;
  leftKneeLift?: number;
  lowerBodySegmentMotion?: number;
  plantedSquatIkDepth?: number;
  rightFootContact?: boolean;
  rightKneeLift?: number;
  solvedSegments?: number;
  sourceQuality?: number;
  squatDepth?: number;
  totalLowerBody?: number;
  totalUpperBody?: number;
  totalSegments?: number;
  visualRootDrop?: number;
};

export type MovementDebugReplayAvatarVisual = {
  averageLowerBodyDirectionError?: number;
  averageUpperBodyDirectionError?: number;
  comparedLowerBodySegments: number;
  comparedUpperBodySegments?: number;
  segments: Record<string, {
    confidence?: number;
    direction: {
      x: number;
      y: number;
      z: number;
    };
    length: number;
    sourceDirection?: {
      x: number;
      y: number;
      z: number;
    };
    sourceError?: number;
  }>;
};

export type MovementDebugReplayLandmark = {
  visibility?: number;
  x: number;
  y: number;
  z?: number;
};

export type MovementDebugReplayFrame = {
  baseline?: string;
  avatarVisual?: MovementDebugReplayAvatarVisual;
  bodyConfidence: Record<string, number>;
  camera?: MovementDebugReplayCamera;
  capturedAt: number;
  fallbacks: Record<string, string>;
  health?: {
    label?: string;
    primaryAction?: string;
    score?: number;
    warnings?: string[];
  };
  poseBounds?: MovementDebugReplayPoseBounds;
  retarget?: MovementDebugReplayRetarget;
  tracking: {
    pose: MovementDebugReplayLandmark[];
    worldPose: MovementDebugReplayLandmark[];
  };
  updatedAt?: number;
};

export type MovementDebugReplaySession = {
  baselineSummary: string;
  createdAt?: number;
  durationMs: number;
  endedAt: number;
  fps?: number;
  id: string;
  movementId: string;
  sampleCount: number;
  samples: MovementDebugReplayFrame[];
  startedAt: number;
  trigger: string;
  warningSummary: string;
};

export type MovementDebugReplaySummary = {
  averageBodyConfidence: Record<string, number>;
  averageOutOfFrameCount: number;
  averageRetargetQuality: number;
  cameraModes: string[];
  durationMs: number;
  failureHintCount: number;
  frameCount: number;
  id: string;
  lowerBodyOwners: string[];
  movementId: string;
  retargetQualityRange: {
    max: number;
    min: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
  );
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function parseCamera(value: unknown): MovementDebugReplayCamera | undefined {
  if (!isRecord(value)) return undefined;

  return {
    aspectRatio: typeof value.aspectRatio === "number" ? value.aspectRatio : undefined,
    deviceLabel: typeof value.deviceLabel === "string" ? value.deviceLabel : undefined,
    frameRate: typeof value.frameRate === "number" ? value.frameRate : undefined,
    trackHeight: typeof value.trackHeight === "number" ? value.trackHeight : undefined,
    trackWidth: typeof value.trackWidth === "number" ? value.trackWidth : undefined,
    videoHeight: typeof value.videoHeight === "number" ? value.videoHeight : undefined,
    videoWidth: typeof value.videoWidth === "number" ? value.videoWidth : undefined,
  };
}

function parsePoseBounds(value: unknown): MovementDebugReplayPoseBounds | undefined {
  if (!isRecord(value)) return undefined;

  return {
    maxX: numberValue(value.maxX),
    maxY: numberValue(value.maxY),
    minX: numberValue(value.minX),
    minY: numberValue(value.minY),
    outOfFrameCount: numberValue(value.outOfFrameCount),
  };
}

function parseRetarget(value: unknown): MovementDebugReplayRetarget | undefined {
  if (!isRecord(value)) return undefined;

  return {
    appliedLowerBody: typeof value.appliedLowerBody === "number" ? value.appliedLowerBody : undefined,
    appliedUpperBody: typeof value.appliedUpperBody === "number" ? value.appliedUpperBody : undefined,
    footLockCorrection: typeof value.footLockCorrection === "number" ? value.footLockCorrection : undefined,
    footLockDrift: typeof value.footLockDrift === "number" ? value.footLockDrift : undefined,
    footLockStrength: typeof value.footLockStrength === "number" ? value.footLockStrength : undefined,
    hipDrop: typeof value.hipDrop === "number" ? value.hipDrop : undefined,
    leftFootContact: booleanValue(value.leftFootContact),
    leftKneeLift: typeof value.leftKneeLift === "number" ? value.leftKneeLift : undefined,
    lowerBodySegmentMotion: typeof value.lowerBodySegmentMotion === "number" ? value.lowerBodySegmentMotion : undefined,
    plantedSquatIkDepth: typeof value.plantedSquatIkDepth === "number" ? value.plantedSquatIkDepth : undefined,
    rightFootContact: booleanValue(value.rightFootContact),
    rightKneeLift: typeof value.rightKneeLift === "number" ? value.rightKneeLift : undefined,
    solvedSegments: typeof value.solvedSegments === "number" ? value.solvedSegments : undefined,
    sourceQuality: typeof value.sourceQuality === "number" ? value.sourceQuality : undefined,
    squatDepth: typeof value.squatDepth === "number" ? value.squatDepth : undefined,
    totalLowerBody: typeof value.totalLowerBody === "number" ? value.totalLowerBody : undefined,
    totalUpperBody: typeof value.totalUpperBody === "number" ? value.totalUpperBody : undefined,
    totalSegments: typeof value.totalSegments === "number" ? value.totalSegments : undefined,
    visualRootDrop: typeof value.visualRootDrop === "number" ? value.visualRootDrop : undefined,
  };
}

function parseReplayVector(value: unknown): { x: number; y: number; z: number } | undefined {
  if (!isRecord(value)) return undefined;

  return {
    x: numberValue(value.x),
    y: numberValue(value.y),
    z: numberValue(value.z),
  };
}

function parseAvatarVisual(value: unknown): MovementDebugReplayAvatarVisual | undefined {
  if (!isRecord(value)) return undefined;

  const rawSegments = isRecord(value.segments) ? value.segments : {};
  const segments: MovementDebugReplayAvatarVisual["segments"] = {};

  Object.entries(rawSegments).forEach(([name, segment]) => {
    if (!isRecord(segment)) return;
    const direction = parseReplayVector(segment.direction);
    if (!direction) return;

    segments[name] = {
      confidence: typeof segment.confidence === "number" ? segment.confidence : undefined,
      direction,
      length: numberValue(segment.length),
      sourceDirection: parseReplayVector(segment.sourceDirection),
      sourceError: typeof segment.sourceError === "number" ? segment.sourceError : undefined,
    };
  });

  return {
    averageLowerBodyDirectionError: typeof value.averageLowerBodyDirectionError === "number"
      ? value.averageLowerBodyDirectionError
      : undefined,
    averageUpperBodyDirectionError: typeof value.averageUpperBodyDirectionError === "number"
      ? value.averageUpperBodyDirectionError
      : undefined,
    comparedLowerBodySegments: numberValue(value.comparedLowerBodySegments),
    comparedUpperBodySegments: typeof value.comparedUpperBodySegments === "number"
      ? value.comparedUpperBodySegments
      : undefined,
    segments,
  };
}

function parseHealth(value: unknown): MovementDebugReplayFrame["health"] {
  if (!isRecord(value)) return undefined;

  return {
    label: typeof value.label === "string" ? value.label : undefined,
    primaryAction: typeof value.primaryAction === "string" ? value.primaryAction : undefined,
    score: typeof value.score === "number" ? value.score : undefined,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === "string")
      : undefined,
  };
}

function parseLandmark(value: unknown): MovementDebugReplayLandmark | null {
  if (!isRecord(value)) return null;

  return {
    visibility: typeof value.visibility === "number"
      ? value.visibility
      : typeof value.v === "number"
        ? value.v
        : undefined,
    x: numberValue(value.x),
    y: numberValue(value.y),
    z: typeof value.z === "number" ? value.z : undefined,
  };
}

function parseLandmarks(value: unknown): MovementDebugReplayLandmark[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(parseLandmark)
    .filter((landmark): landmark is MovementDebugReplayLandmark => Boolean(landmark));
}

function parseTracking(value: unknown): MovementDebugReplayFrame["tracking"] {
  if (!isRecord(value)) {
    return {
      pose: [],
      worldPose: [],
    };
  }

  return {
    pose: parseLandmarks(value.pose),
    worldPose: parseLandmarks(value.worldPose),
  };
}

function parseSamplesJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];

  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

export function parseMovementDebugReplayFrame(value: unknown): MovementDebugReplayFrame | null {
  if (!isRecord(value)) return null;

  return {
    baseline: typeof value.baseline === "string" ? value.baseline : undefined,
    avatarVisual: parseAvatarVisual(value.avatarVisual),
    bodyConfidence: numberRecord(value.bodyConfidence),
    camera: parseCamera(value.camera),
    capturedAt: numberValue(value.capturedAt),
    fallbacks: stringRecord(value.fallbacks),
    health: parseHealth(value.health),
    poseBounds: parsePoseBounds(value.poseBounds),
    retarget: parseRetarget(value.retarget),
    tracking: parseTracking(value.tracking),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : undefined,
  };
}

export function parseMovementDebugReplaySession(value: unknown): MovementDebugReplaySession {
  if (!isRecord(value)) throw new Error("Expected a movement debug session object.");

  const samples = parseSamplesJson(value.samplesJson)
    .map(parseMovementDebugReplayFrame)
    .filter((frame): frame is MovementDebugReplayFrame => Boolean(frame));

  return {
    baselineSummary: stringValue(value.baselineSummary, "none"),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : undefined,
    durationMs: numberValue(value.durationMs),
    endedAt: numberValue(value.endedAt),
    fps: typeof value.fps === "number" ? value.fps : undefined,
    id: stringValue(value._id, stringValue(value.id, "unknown")),
    movementId: stringValue(value.movementId, "unknown"),
    sampleCount: numberValue(value.sampleCount, samples.length),
    samples,
    startedAt: numberValue(value.startedAt),
    trigger: stringValue(value.trigger, "unknown"),
    warningSummary: stringValue(value.warningSummary, "none"),
  };
}

export function parseMovementDebugReplaySessions(value: unknown): MovementDebugReplaySession[] {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map(parseMovementDebugReplaySession);
}

export function extractOwner(fallbacks: Record<string, string>, key: "feet" | "head" | "lower" | "torso") {
  const owners = fallbacks.owners ?? "";
  const match = new RegExp(`${key}\\s+([^;]+)`).exec(owners);
  return match?.[1]?.trim() ?? "unknown";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function cameraLabel(camera?: MovementDebugReplayCamera) {
  if (!camera) return "unknown";
  const width = camera.trackWidth ?? camera.videoWidth ?? "?";
  const height = camera.trackHeight ?? camera.videoHeight ?? "?";
  const ratio = camera.aspectRatio ? camera.aspectRatio.toFixed(2) : "?";
  return `${width}x${height} ar${ratio}`;
}

export function summarizeMovementDebugReplaySession(
  session: MovementDebugReplaySession,
  failureHintCount = 0,
): MovementDebugReplaySummary {
  const confidenceKeys = unique(session.samples.flatMap((sample) => Object.keys(sample.bodyConfidence)));
  const averageBodyConfidence = Object.fromEntries(
    confidenceKeys.map((key) => [
      key,
      average(session.samples.map((sample) => sample.bodyConfidence[key] ?? 0)),
    ]),
  );
  const retargetQualities = session.samples
    .map((sample) => sample.retarget?.sourceQuality)
    .filter((quality): quality is number => typeof quality === "number");

  return {
    averageBodyConfidence,
    averageOutOfFrameCount: average(
      session.samples
        .map((sample) => sample.poseBounds?.outOfFrameCount)
        .filter((count): count is number => typeof count === "number"),
    ),
    averageRetargetQuality: average(retargetQualities),
    cameraModes: unique(session.samples.map((sample) => cameraLabel(sample.camera))),
    durationMs: session.durationMs,
    failureHintCount,
    frameCount: session.samples.length,
    id: session.id,
    lowerBodyOwners: unique(session.samples.map((sample) => extractOwner(sample.fallbacks, "lower"))),
    movementId: session.movementId,
    retargetQualityRange: {
      max: retargetQualities.length ? Math.max(...retargetQualities) : 0,
      min: retargetQualities.length ? Math.min(...retargetQualities) : 0,
    },
  };
}
