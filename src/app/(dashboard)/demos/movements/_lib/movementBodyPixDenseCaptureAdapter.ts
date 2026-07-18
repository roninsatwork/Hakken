import type { BodyPix } from "@tensorflow-models/body-pix";
import type {
  MovementDeepCaptureBodyRegion,
  MovementDeepCaptureSurfaceAnchor,
} from "./movementDeepCaptureContract";
import type {
  MovementDenseCaptureAdapter,
  MovementDenseCaptureMeasurement,
} from "./movementDenseCapture";
import { MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES } from "./movementDenseCaptureQuality";

export const MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE = {
  approval: "provisional" as const,
  artifactBytes: 2_658_079,
  id: "bodypix-mobilenet-v1-075-q2",
  inputHeight: 1080,
  inputWidth: 1920,
  license: "Apache-2.0 repository; model-weight attribution and product review pending",
  modelHash: "sha256:a897ce4851463babb4af92a49705867acc3a7060bd2b358188b5b9b0cb893cdf" as const,
  modelUrl: "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/model-stride16.json",
  segmentationThreshold: 0.7,
  version: "2.2.1",
} as const;

const BODYPIX_GRID_SIZE = 12;
const BODYPIX_TARGET_ANCHOR_COUNT = 400;

type BodyPixKeypointLike = {
  part: string;
  position: { x: number; y: number };
  score: number;
};

type BodyPixPoseLike = {
  keypoints: BodyPixKeypointLike[];
  score: number;
};

export type MovementBodyPixPartSegmentation = {
  allPoses?: BodyPixPoseLike[];
  data: ArrayLike<number>;
  height: number;
  width: number;
};

type MovementBodyPixModel = Pick<BodyPix, "dispose" | "segmentPersonParts">;

type PartBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
};

type AnchorCandidate = MovementDeepCaptureSurfaceAnchor & {
  priority: number;
};

const BODYPIX_PART_SURFACES = [
  "front",
  "front",
  "front",
  "back",
  "front",
  "back",
  "front",
  "back",
  "front",
  "back",
  "unknown",
  "unknown",
  "front",
  "back",
  "front",
  "back",
  "front",
  "back",
  "front",
  "back",
  "front",
  "back",
  "unknown",
  "unknown",
] as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function partSide(partId: number): MovementDeepCaptureSurfaceAnchor["anatomicalSide"] {
  if ([0, 2, 3, 6, 7, 10, 14, 15, 18, 19, 22].includes(partId)) return "left";
  if ([1, 4, 5, 8, 9, 11, 16, 17, 20, 21, 23].includes(partId)) return "right";
  return "midline";
}

function baseRegion(partId: number): MovementDeepCaptureBodyRegion | null {
  if (partId <= 1) return "head";
  if (partId >= 2 && partId <= 5) return partId <= 3 ? "leftUpperArm" : "rightUpperArm";
  if (partId >= 6 && partId <= 9) return partId <= 7 ? "leftLowerArm" : "rightLowerArm";
  if (partId === 10) return "leftHand";
  if (partId === 11) return "rightHand";
  if (partId === 13) return "back";
  if (partId === 14 || partId === 15) return "leftThigh";
  if (partId === 16 || partId === 17) return "rightThigh";
  if (partId === 18) return "leftShin";
  if (partId === 19) return "leftCalf";
  if (partId === 20) return "rightShin";
  if (partId === 21) return "rightCalf";
  if (partId === 22) return "leftFoot";
  if (partId === 23) return "rightFoot";
  return null;
}

function keypoint(pose: BodyPixPoseLike, name: string) {
  return pose?.keypoints.find((candidate) => candidate.part === name && candidate.score >= 0.2)
    ?.position ?? null;
}

function projectionAlongSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const magnitudeSquared = dx * dx + dy * dy;
  if (magnitudeSquared < 1e-6) return null;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / magnitudeSquared;
}

function fallbackPartProgress(y: number, bounds: PartBounds) {
  return clamp01((y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY));
}

function resolveRegion({
  bounds,
  partId,
  point,
  pose,
}: {
  bounds: PartBounds;
  partId: number;
  point: { x: number; y: number };
  pose: NonNullable<MovementBodyPixPartSegmentation["allPoses"]>[number] | null;
}): MovementDeepCaptureBodyRegion | null {
  if (partId >= 2 && partId <= 5) {
    const side = partId <= 3 ? "left" : "right";
    const shoulder = pose ? keypoint(pose, `${side}Shoulder`) : null;
    const elbow = pose ? keypoint(pose, `${side}Elbow`) : null;
    const progress = shoulder && elbow
      ? projectionAlongSegment(point, shoulder, elbow)
      : fallbackPartProgress(point.y, bounds);
    if (progress !== null && progress <= 0.22) {
      return side === "left" ? "leftShoulder" : "rightShoulder";
    }
  }

  if (partId === 12) {
    const leftShoulder = pose ? keypoint(pose, "leftShoulder") : null;
    const rightShoulder = pose ? keypoint(pose, "rightShoulder") : null;
    const leftHip = pose ? keypoint(pose, "leftHip") : null;
    const rightHip = pose ? keypoint(pose, "rightHip") : null;
    const shoulderMidpoint = leftShoulder && rightShoulder
      ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
      : null;
    const hipMidpoint = leftHip && rightHip
      ? { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 }
      : null;
    const progress = shoulderMidpoint && hipMidpoint
      ? projectionAlongSegment(point, shoulderMidpoint, hipMidpoint)
      : fallbackPartProgress(point.y, bounds);
    if (progress !== null && progress <= 0.35) return "chest";
    if (progress !== null && progress <= 0.78) return "abdomen";
    return "pelvis";
  }

  if (partId === 13) {
    const progress = fallbackPartProgress(point.y, bounds);
    return progress >= 0.82 ? "pelvis" : "back";
  }

  return baseRegion(partId);
}

function stablePriority(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function bestPose(segmentation: MovementBodyPixPartSegmentation) {
  return [...(segmentation.allPoses ?? [])].sort((a, b) => b.score - a.score)[0] ?? null;
}

export function buildMovementBodyPixSurfaceAnchors({
  inferenceTimestampMs,
  segmentation,
  sourceTimestampMs,
}: {
  inferenceTimestampMs: number;
  segmentation: MovementBodyPixPartSegmentation;
  sourceTimestampMs: number;
}): MovementDeepCaptureSurfaceAnchor[] {
  const { data, height, width } = segmentation;
  if (width <= 0 || height <= 0 || data.length !== width * height) return [];
  const sampleStride = Math.max(1, Math.ceil(Math.sqrt((width * height) / 300_000)));
  const boundsByPart = new Map<number, PartBounds>();

  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const partId = Number(data[y * width + x]);
      if (!Number.isInteger(partId) || partId < 0 || partId >= BODYPIX_PART_SURFACES.length) continue;
      const bounds = boundsByPart.get(partId);
      if (bounds) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      } else {
        boundsByPart.set(partId, { maxX: x, maxY: y, minX: x, minY: y });
      }
    }
  }

  const pose = bestPose(segmentation);
  const poseConfidence = pose ? clamp01(pose.score) : MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.segmentationThreshold;
  const confidence = Math.min(
    MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.segmentationThreshold,
    poseConfidence,
  );
  const candidates = new Map<string, AnchorCandidate & { distance: number }>();

  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const partId = Number(data[y * width + x]);
      const bounds = boundsByPart.get(partId);
      if (!bounds) continue;
      const region = resolveRegion({ bounds, partId, point: { x, y }, pose });
      if (!region) continue;
      const u = clamp01((x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX));
      const v = clamp01((y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY));
      const gridX = Math.min(BODYPIX_GRID_SIZE - 1, Math.floor(u * BODYPIX_GRID_SIZE));
      const gridY = Math.min(BODYPIX_GRID_SIZE - 1, Math.floor(v * BODYPIX_GRID_SIZE));
      const id = `bodypix-v1-p${partId}-r${region}-u${gridX}-v${gridY}`;
      const cellCenterX = (gridX + 0.5) / BODYPIX_GRID_SIZE;
      const cellCenterY = (gridY + 0.5) / BODYPIX_GRID_SIZE;
      const distance = Math.hypot(u - cellCenterX, v - cellCenterY);
      const existing = candidates.get(id);
      if (existing && existing.distance <= distance) continue;
      candidates.set(id, {
        anatomicalSide: partSide(partId),
        depth: null,
        distance,
        id,
        image: { x: clamp01(x / Math.max(1, width - 1)), y: clamp01(y / Math.max(1, height - 1)) },
        normal: null,
        occluded: false,
        priority: stablePriority(id),
        provenance: {
          ageMs: 0,
          confidence,
          inferenceTimestampMs,
          origin: "model-estimated",
          sourceTimestampMs,
        },
        region,
        surface: BODYPIX_PART_SURFACES[partId] ?? "unknown",
      });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, BODYPIX_TARGET_ANCHOR_COUNT)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ distance, priority, ...anchor }) => {
      void distance;
      void priority;
      return anchor;
    });
}

async function sha256(parts: Uint8Array[]) {
  const totalBytes = parts.reduce((total, part) => total + part.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  parts.forEach((part) => {
    combined.set(part, offset);
    offset += part.byteLength;
  });
  const digest = await crypto.subtle.digest("SHA-256", combined);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { artifactBytes: totalBytes, modelHash: `sha256:${hex}` };
}

export async function verifyMovementBodyPixModelArtifacts(
  fetchImpl: typeof fetch = fetch,
) {
  const modelResponse = await fetchImpl(MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelUrl, {
    cache: "force-cache",
  });
  if (!modelResponse.ok) throw new Error(`BodyPix model manifest failed to load (${modelResponse.status}).`);
  const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
  const manifest = JSON.parse(new TextDecoder().decode(modelBytes)) as {
    weightsManifest?: Array<{ paths?: string[] }>;
  };
  const shardPaths = Array.from(new Set(
    (manifest.weightsManifest ?? []).flatMap((group) => group.paths ?? []),
  ));
  const shardBytes = await Promise.all(shardPaths.map(async (shardPath) => {
    const response = await fetchImpl(
      new URL(shardPath, MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelUrl).toString(),
      { cache: "force-cache" },
    );
    if (!response.ok) throw new Error(`BodyPix model shard failed to load (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }));
  const identity = await sha256([modelBytes, ...shardBytes]);
  if (
    identity.artifactBytes !== MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.artifactBytes ||
    identity.modelHash !== MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelHash
  ) {
    throw new Error("BodyPix model artifacts do not match the measured benchmark identity.");
  }
  return identity;
}

export function createMovementBodyPixDenseCaptureAdapterFromModel(
  model: MovementBodyPixModel,
  clock: () => number = () => Date.now(),
): MovementDenseCaptureAdapter<HTMLCanvasElement> {
  return {
    descriptor: {
      artifactBytes: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.artifactBytes,
      id: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.id,
      inputHeight: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.inputHeight,
      inputWidth: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.inputWidth,
      license: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.license,
      modelHash: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelHash,
      runtime: "webgl",
      version: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.version,
    },
    dispose: () => model.dispose(),
    async infer(input, context): Promise<MovementDenseCaptureMeasurement> {
      const qualityProfile = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[context.qualityTier];
      const startedAtMs = typeof performance === "undefined" ? clock() : performance.now();
      const segmentation = await model.segmentPersonParts(input, {
        flipHorizontal: false,
        internalResolution: qualityProfile.internalResolution,
        maxDetections: 1,
        nmsRadius: 20,
        scoreThreshold: 0.3,
        segmentationThreshold: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.segmentationThreshold,
      });
      const completedAtMs = typeof performance === "undefined" ? clock() : performance.now();
      const inferenceTimestampMs = clock();
      return {
        adapter: {
          inferenceDurationMs: Math.max(0, completedAtMs - startedAtMs),
          inputHeight: input.height,
          inputWidth: input.width,
          profileId: "movement-dense-capture-adapter-v1",
          qualityTier: context.qualityTier,
          runtime: "webgl",
          targetIntervalMs: qualityProfile.targetIntervalMs,
        },
        anchors: buildMovementBodyPixSurfaceAnchors({
          inferenceTimestampMs,
          segmentation,
          sourceTimestampMs: context.sourceTimestampMs,
        }),
        modelHash: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelHash,
        modelId: `${MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.id}@${MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.version}`,
      };
    },
  };
}

export async function createMovementBodyPixDenseCaptureAdapter() {
  await verifyMovementBodyPixModelArtifacts();
  const tf = await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-backend-webgl");
  const bodyPix = await import("@tensorflow-models/body-pix");
  if (!(await tf.setBackend("webgl"))) throw new Error("WebGL is unavailable for the Deep Capture model.");
  await tf.ready();
  const model = await bodyPix.load({
    architecture: "MobileNetV1",
    modelUrl: MOVEMENT_BODYPIX_DENSE_CAPTURE_CANDIDATE.modelUrl,
    multiplier: 0.75,
    outputStride: 16,
    quantBytes: 2,
  });
  return createMovementBodyPixDenseCaptureAdapterFromModel(model);
}
