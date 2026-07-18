import {
  MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
  type MovementDenseCaptureQualityTier,
} from "./movementDenseCaptureQuality";

export const MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK = {
  id: "movement-dense-capture-device-benchmark-v1",
  maximumLatencyDriftRatio: 1.5,
  minimumAnchorCount: 200,
  minimumDurationMs: 120_000,
  minimumSampleCount: 60,
} as const;

export type MovementDenseCaptureDeviceClass = "ipad" | "older-laptop";

export type MovementDenseCaptureDeviceBenchmarkSample = {
  anchorCount: number;
  elapsedMs: number;
  inferenceDurationMs: number;
  qualityTier: MovementDenseCaptureQualityTier;
  sampleIndex: number;
};

export type MovementDenseCaptureDeviceTierSummary = {
  maximumInferenceMs: number;
  medianAnchorCount: number;
  medianInferenceMs: number;
  p95InferenceMs: number;
  sampleCount: number;
  targetIntervalMs: number;
};

export type MovementDenseCaptureDeviceBenchmarkSummary = {
  deviceClass: MovementDenseCaptureDeviceClass;
  durationMs: number;
  failures: string[];
  finalQualityTier: MovementDenseCaptureQualityTier | null;
  passed: boolean;
  profileId: typeof MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.id;
  sampleCount: number;
  status: "measured-awaiting-review";
  sustained: {
    firstWindowMedianInferenceMs: number;
    latencyDriftRatio: number;
    lastWindowMedianInferenceMs: number;
  };
  tierSummaries: Partial<Record<MovementDenseCaptureQualityTier, MovementDenseCaptureDeviceTierSummary>>;
};

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))] ?? 0;
}

function summarizeTier(
  qualityTier: MovementDenseCaptureQualityTier,
  samples: MovementDenseCaptureDeviceBenchmarkSample[],
): MovementDenseCaptureDeviceTierSummary | null {
  const tierSamples = samples.filter((sample) => sample.qualityTier === qualityTier);
  if (tierSamples.length === 0) return null;
  return {
    maximumInferenceMs: Math.max(...tierSamples.map((sample) => sample.inferenceDurationMs)),
    medianAnchorCount: percentile(tierSamples.map((sample) => sample.anchorCount), 0.5),
    medianInferenceMs: percentile(tierSamples.map((sample) => sample.inferenceDurationMs), 0.5),
    p95InferenceMs: percentile(tierSamples.map((sample) => sample.inferenceDurationMs), 0.95),
    sampleCount: tierSamples.length,
    targetIntervalMs: MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[qualityTier].targetIntervalMs,
  };
}

export function summarizeMovementDenseCaptureDeviceBenchmark({
  deviceClass,
  durationMs,
  samples,
}: {
  deviceClass: MovementDenseCaptureDeviceClass;
  durationMs: number;
  samples: MovementDenseCaptureDeviceBenchmarkSample[];
}): MovementDenseCaptureDeviceBenchmarkSummary {
  const failures: string[] = [];
  const tierSummaries = Object.fromEntries(
    (["high", "medium", "low"] as const).flatMap((qualityTier) => {
      const summary = summarizeTier(qualityTier, samples);
      return summary ? [[qualityTier, summary]] : [];
    }),
  ) as MovementDenseCaptureDeviceBenchmarkSummary["tierSummaries"];
  const finalQualityTier = samples.at(-1)?.qualityTier ?? null;
  const finalTierSummary = finalQualityTier ? tierSummaries[finalQualityTier] : null;
  const windowSize = Math.max(1, Math.floor(samples.length * 0.2));
  const firstWindowMedianInferenceMs = percentile(
    samples.slice(0, windowSize).map((sample) => sample.inferenceDurationMs),
    0.5,
  );
  const lastWindowMedianInferenceMs = percentile(
    samples.slice(-windowSize).map((sample) => sample.inferenceDurationMs),
    0.5,
  );
  const latencyDriftRatio = firstWindowMedianInferenceMs > 0
    ? lastWindowMedianInferenceMs / firstWindowMedianInferenceMs
    : Number.POSITIVE_INFINITY;

  if (samples.length < MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumSampleCount) {
    failures.push(
      `Device benchmark requires at least ${MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumSampleCount} samples; received ${samples.length}.`,
    );
  }
  if (!Number.isFinite(durationMs) || durationMs < MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumDurationMs) {
    failures.push("Device benchmark did not complete the sustained two-minute window.");
  }
  if (samples.length > 0 && samples.at(-1)?.elapsedMs !== durationMs) {
    failures.push("Device benchmark duration does not match its raw sample timeline.");
  }
  if (!finalQualityTier || !finalTierSummary) {
    failures.push("Device benchmark has no final adaptive browser quality tier.");
  } else {
    if (finalTierSummary.p95InferenceMs > finalTierSummary.targetIntervalMs) {
      failures.push(
        `Final ${finalQualityTier} tier p95 ${Math.round(finalTierSummary.p95InferenceMs)}ms exceeds its ${finalTierSummary.targetIntervalMs}ms cadence.`,
      );
    }
    if (finalTierSummary.medianAnchorCount < MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumAnchorCount) {
      failures.push(
        `Final ${finalQualityTier} tier median anchor count ${finalTierSummary.medianAnchorCount} is below ${MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumAnchorCount}.`,
      );
    }
  }
  if (samples.some((sample) => (
    !Number.isFinite(sample.elapsedMs) ||
    sample.elapsedMs < 0 ||
    !Number.isFinite(sample.inferenceDurationMs) ||
    sample.inferenceDurationMs < 0 ||
    sample.inferenceDurationMs > 1_000
  ))) {
    failures.push("Device benchmark contains an invalid or UI-blocking inference sample.");
  }
  if (samples.some((sample, index) => (
    index > 0 && sample.elapsedMs <= (samples[index - 1]?.elapsedMs ?? -1)
  ))) {
    failures.push("Device benchmark sample times are not strictly increasing.");
  }
  if (
    !Number.isFinite(latencyDriftRatio) ||
    latencyDriftRatio > MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.maximumLatencyDriftRatio
  ) {
    failures.push(
      `Device benchmark latency drift ${latencyDriftRatio.toFixed(2)} exceeds ${MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.maximumLatencyDriftRatio.toFixed(2)}.`,
    );
  }

  return {
    deviceClass,
    durationMs,
    failures,
    finalQualityTier,
    passed: failures.length === 0,
    profileId: MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.id,
    sampleCount: samples.length,
    status: "measured-awaiting-review",
    sustained: {
      firstWindowMedianInferenceMs,
      latencyDriftRatio,
      lastWindowMedianInferenceMs,
    },
    tierSummaries,
  };
}
