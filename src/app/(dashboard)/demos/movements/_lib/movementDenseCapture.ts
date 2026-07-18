import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  type MovementDeepCaptureBodyEvidence,
  type MovementDeepCaptureSurfaceAnchor,
} from "./movementDeepCaptureContract";
import {
  MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
  createMovementDenseCaptureQualityState,
  updateMovementDenseCaptureQualityState,
  type MovementDenseCaptureQualityTier,
} from "./movementDenseCaptureQuality";

export const MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE = {
  id: "movement-dense-capture-adapter-v1",
  maximumBackoffMs: 1_000,
  qualityProfiles: MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
  staleAfterMs: 300,
  targetIntervalMs: 100,
} as const;

export type MovementDenseCaptureModelDescriptor = {
  artifactBytes: number;
  id: string;
  inputHeight: number;
  inputWidth: number;
  license: string;
  modelHash: `sha256:${string}`;
  runtime: "webgl" | "webgpu" | "wasm";
  version: string;
};

export type MovementDenseCaptureMeasurement = {
  adapter: NonNullable<MovementDeepCaptureBodyEvidence["adapter"]>;
  anchors: MovementDeepCaptureSurfaceAnchor[];
  modelHash: string;
  modelId: string;
};

export interface MovementDenseCaptureAdapter<Input = unknown> {
  descriptor: MovementDenseCaptureModelDescriptor;
  dispose?(): void;
  infer(input: Input, context: {
    frameHeight: number;
    frameWidth: number;
    qualityTier: MovementDenseCaptureQualityTier;
    sourceTimestampMs: number;
  }): Promise<MovementDenseCaptureMeasurement>;
}

export type MovementDenseCaptureValidationReport = {
  failures: string[];
  passed: boolean;
};

export function validateMovementDenseCaptureAdapterMeasurement<Input>(
  adapter: MovementDenseCaptureAdapter<Input>,
  measurement: MovementDenseCaptureMeasurement,
): MovementDenseCaptureValidationReport {
  const report = validateMovementDenseCaptureMeasurement(measurement);
  const failures = [...report.failures];
  const { descriptor } = adapter;
  if (!/^sha256:[a-f0-9]{64}$/.test(descriptor.modelHash)) {
    failures.push("Dense adapter descriptor has no immutable model SHA-256 identity.");
  }
  if (!descriptor.id.trim() || !descriptor.version.trim()) {
    failures.push("Dense adapter descriptor has no stable id or version.");
  }
  if (!descriptor.license.trim()) failures.push("Dense adapter descriptor has no licence decision.");
  if (
    descriptor.artifactBytes <= 0 ||
    descriptor.inputWidth <= 0 ||
    descriptor.inputHeight <= 0
  ) {
    failures.push("Dense adapter descriptor has invalid artifact or input dimensions.");
  }
  if (measurement.modelHash !== descriptor.modelHash) {
    failures.push("Dense adapter result model hash does not match its descriptor.");
  }
  if (measurement.modelId !== `${descriptor.id}@${descriptor.version}`) {
    failures.push("Dense adapter result model id does not match its descriptor.");
  }
  if (measurement.adapter.runtime !== descriptor.runtime) {
    failures.push("Dense adapter result runtime does not match its descriptor.");
  }
  if (
    measurement.adapter.inputWidth > descriptor.inputWidth ||
    measurement.adapter.inputHeight > descriptor.inputHeight
  ) {
    failures.push("Dense adapter result input dimensions exceed its descriptor maximum.");
  }
  const qualityProfile = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[measurement.adapter.qualityTier];
  if (
    !qualityProfile ||
    measurement.adapter.inputWidth !== qualityProfile.inputWidth ||
    measurement.adapter.inputHeight !== qualityProfile.inputHeight ||
    measurement.adapter.targetIntervalMs !== qualityProfile.targetIntervalMs
  ) {
    failures.push("Dense adapter result does not match its declared browser quality tier.");
  }
  return { failures: Array.from(new Set(failures)), passed: failures.length === 0 };
}

function isFiniteUnit(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateAnchor(
  anchor: MovementDeepCaptureSurfaceAnchor,
  index: number,
  failures: string[],
) {
  if (!anchor.id.trim()) failures.push(`Anchor ${index} has no persistent id.`);
  if (!isFiniteUnit(anchor.image.x) || !isFiniteUnit(anchor.image.y)) {
    failures.push(`Anchor ${anchor.id || index} has out-of-frame image coordinates.`);
  }
  if (anchor.depth !== null && !Number.isFinite(anchor.depth)) {
    failures.push(`Anchor ${anchor.id || index} has invalid depth.`);
  }
  if (anchor.normal && (
    !Number.isFinite(anchor.normal.x) ||
    !Number.isFinite(anchor.normal.y) ||
    !Number.isFinite(anchor.normal.z) ||
    Math.hypot(anchor.normal.x, anchor.normal.y, anchor.normal.z) < 0.5
  )) {
    failures.push(`Anchor ${anchor.id || index} has an invalid surface normal.`);
  }
  if (
    !isFiniteUnit(anchor.provenance.confidence) ||
    anchor.provenance.ageMs < 0 ||
    !Number.isFinite(anchor.provenance.inferenceTimestampMs) ||
    !Number.isFinite(anchor.provenance.sourceTimestampMs)
  ) {
    failures.push(`Anchor ${anchor.id || index} has invalid provenance.`);
  }
}

export function validateMovementDenseCaptureMeasurement(
  measurement: MovementDenseCaptureMeasurement,
): MovementDenseCaptureValidationReport {
  const failures: string[] = [];
  const { anchors } = measurement;
  if (
    anchors.length < MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum ||
    anchors.length > MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.maximum
  ) {
    failures.push(
      `Dense measurement requires ${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum}-${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.maximum} anchors; received ${anchors.length}.`,
    );
  }
  if (new Set(anchors.map((anchor) => anchor.id)).size !== anchors.length) {
    failures.push("Dense measurement contains duplicate persistent anchor ids.");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(measurement.modelHash)) {
    failures.push("Dense measurement has no immutable model SHA-256 identity.");
  }
  if (!measurement.modelId.trim()) failures.push("Dense measurement has no model id.");
  if (measurement.adapter.profileId !== MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.id) {
    failures.push("Dense measurement has the wrong adapter profile.");
  }
  if (
    measurement.adapter.inputWidth <= 0 ||
    measurement.adapter.inputHeight <= 0 ||
    measurement.adapter.inferenceDurationMs < 0 ||
    !Number.isFinite(measurement.adapter.inferenceDurationMs)
  ) {
    failures.push("Dense measurement has invalid adapter dimensions or timing.");
  }
  if (!["webgl", "webgpu", "wasm"].includes(measurement.adapter.runtime)) {
    failures.push("Dense measurement does not use a client-browser runtime.");
  }
  const qualityProfile = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[measurement.adapter.qualityTier];
  if (
    !qualityProfile ||
    measurement.adapter.inputWidth !== qualityProfile.inputWidth ||
    measurement.adapter.inputHeight !== qualityProfile.inputHeight ||
    measurement.adapter.targetIntervalMs !== qualityProfile.targetIntervalMs
  ) {
    failures.push("Dense measurement has invalid browser quality-tier metadata.");
  }
  anchors.forEach((anchor, index) => validateAnchor(anchor, index, failures));

  return { failures: Array.from(new Set(failures)), passed: failures.length === 0 };
}

export function resolveMovementDenseCaptureSchedule({
  inFlight,
  lastCompletedAtMs,
  lastDurationMs,
  nowMs,
  qualityTier = "high",
}: {
  inFlight: boolean;
  lastCompletedAtMs: number | null;
  lastDurationMs: number | null;
  nowMs: number;
  qualityTier?: MovementDenseCaptureQualityTier;
}) {
  if (inFlight) return { reason: "in-flight" as const, run: false };
  const intervalMs = Math.min(
    MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.maximumBackoffMs,
    Math.max(
      MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[qualityTier].targetIntervalMs,
      (lastDurationMs ?? 0) * 3,
    ),
  );
  if (lastCompletedAtMs !== null && nowMs - lastCompletedAtMs < intervalMs) {
    return { reason: "rate-limited" as const, run: false };
  }
  return { reason: "due" as const, run: true };
}

function carryAnchor(anchor: MovementDeepCaptureSurfaceAnchor, nowMs: number) {
  const ageMs = Math.max(0, nowMs - anchor.provenance.inferenceTimestampMs);
  if (ageMs > MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.staleAfterMs) return null;
  return {
    ...anchor,
    occluded: true,
    provenance: {
      ...anchor.provenance,
      ageMs,
      confidence: anchor.provenance.confidence * (
        1 - ageMs / MOVEMENT_DENSE_CAPTURE_ADAPTER_PROFILE.staleAfterMs
      ),
      origin: "temporally-tracked" as const,
    },
  };
}

export function carryMovementDenseCaptureEvidence({
  currentSegmentation,
  nowMs,
  previous,
}: {
  currentSegmentation: MovementDeepCaptureBodyEvidence["segmentation"];
  nowMs: number;
  previous: MovementDeepCaptureBodyEvidence | null;
}): MovementDeepCaptureBodyEvidence | null {
  if (!previous?.adapter || previous.anchors.length === 0) return null;
  const anchors = previous.anchors.flatMap((anchor) => {
    const carried = carryAnchor(anchor, nowMs);
    return carried ? [carried] : [];
  });
  if (anchors.length !== previous.anchors.length) return null;

  return {
    ...previous,
    anchors,
    segmentation: currentSegmentation,
  };
}

export function mergeMovementDenseCaptureMeasurement({
  measurement,
  segmentation,
}: {
  measurement: MovementDenseCaptureMeasurement;
  segmentation: MovementDeepCaptureBodyEvidence["segmentation"];
}): MovementDeepCaptureBodyEvidence | null {
  if (!validateMovementDenseCaptureMeasurement(measurement).passed) return null;
  return {
    adapter: measurement.adapter,
    anchors: measurement.anchors,
    modelHash: measurement.modelHash,
    modelId: measurement.modelId,
    segmentation,
  };
}

export type MovementDenseCaptureRuntime<Input> = ReturnType<
  typeof createMovementDenseCaptureRuntime<Input>
>;

export function createMovementDenseCaptureRuntime<Input>({
  clock = () => (typeof performance === "undefined" ? Date.now() : performance.now()),
  initialQualityTier = "medium",
}: {
  clock?: () => number;
  initialQualityTier?: MovementDenseCaptureQualityTier;
} = {}) {
  let disposed = false;
  let inFlight = false;
  let lastCompletedAtMs: number | null = null;
  let lastDurationMs: number | null = null;
  let lastFailure: string | null = null;
  let latestEvidence: MovementDeepCaptureBodyEvidence | null = null;
  let pending: Promise<void> | null = null;
  let qualityState = createMovementDenseCaptureQualityState(initialQualityTier);

  const schedule = (nowMs: number) => resolveMovementDenseCaptureSchedule({
    inFlight,
    lastCompletedAtMs,
    lastDurationMs,
    nowMs,
    qualityTier: qualityState.qualityTier,
  });

  return {
    dispose() {
      disposed = true;
      latestEvidence = null;
    },
    getState() {
      return {
        inFlight,
        lastCompletedAtMs,
        lastDurationMs,
        lastFailure,
        qualityTier: qualityState.qualityTier,
      };
    },
    read({
      currentSegmentation,
      nowMs,
    }: {
      currentSegmentation: MovementDeepCaptureBodyEvidence["segmentation"];
      nowMs: number;
    }) {
      return carryMovementDenseCaptureEvidence({
        currentSegmentation,
        nowMs,
        previous: latestEvidence,
      });
    },
    request({
      adapter,
      context,
      input,
      nowMs,
      segmentation,
    }: {
      adapter: MovementDenseCaptureAdapter<Input>;
      context: Omit<Parameters<MovementDenseCaptureAdapter<Input>["infer"]>[1], "qualityTier">;
      input: Input;
      nowMs: number;
      segmentation: MovementDeepCaptureBodyEvidence["segmentation"];
    }) {
      if (disposed || !schedule(nowMs).run) return false;
      inFlight = true;
      lastFailure = null;
      const startedAtMs = clock();
      const requestedQualityTier = qualityState.qualityTier;
      pending = adapter.infer(input, {
        ...context,
        qualityTier: requestedQualityTier,
      }).then((measurement) => {
        if (disposed) return;
        const report = validateMovementDenseCaptureAdapterMeasurement(adapter, measurement);
        if (!report.passed) {
          lastFailure = report.failures.join(" ");
          return;
        }
        latestEvidence = mergeMovementDenseCaptureMeasurement({ measurement, segmentation });
      }).catch((error: unknown) => {
        if (!disposed) {
          lastFailure = error instanceof Error ? error.message : "Dense adapter inference failed.";
        }
      }).finally(() => {
        const completedAtMs = clock();
        lastDurationMs = Math.max(0, completedAtMs - startedAtMs);
        qualityState = updateMovementDenseCaptureQualityState(qualityState, lastDurationMs);
        lastCompletedAtMs = nowMs;
        inFlight = false;
        pending = null;
      });
      return true;
    },
    schedule,
    async waitForIdle() {
      await pending;
    },
  };
}
