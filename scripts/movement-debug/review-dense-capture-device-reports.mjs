#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DENSE_CAPTURE_DEVICE_REPORT_PROFILE = "movement-dense-capture-device-benchmark-v1";
export const DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES = ["ipad", "older-laptop"];
const QUALITY_PROFILES = {
  high: { targetIntervalMs: 100 },
  medium: { targetIntervalMs: 180 },
  low: { targetIntervalMs: 300 },
};
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const FORBIDDEN_RAW_VIDEO_KEYS = /^(base64|blob|contents|dataUrl|fileName|filePath|path|payload|rawVideo|url|video)$/i;
const MINIMUM_DURATION_MS = 120_000;
const MINIMUM_SAMPLE_COUNT = 60;
const MAXIMUM_LATENCY_DRIFT_RATIO = 1.5;
const MAXIMUM_TENSOR_MEMORY_GROWTH_BYTES = 5 * 1024 * 1024;
const MAXIMUM_TENSOR_COUNT_GROWTH = 2;

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))] ?? 0;
}

function findForbiddenRawVideoKey(value, currentPath = "report") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenRawVideoKey(value[index], `${currentPath}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_RAW_VIDEO_KEYS.test(key)) return `${currentPath}.${key}`;
    const nested = findForbiddenRawVideoKey(nestedValue, `${currentPath}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function summarizeFinalTier(samples) {
  const finalQualityTier = samples.at(-1)?.qualityTier ?? null;
  const profile = QUALITY_PROFILES[finalQualityTier];
  const finalSamples = finalQualityTier
    ? samples.filter((sample) => sample.qualityTier === finalQualityTier)
    : [];
  return {
    finalQualityTier,
    medianAnchorCount: percentile(finalSamples.map((sample) => sample.anchorCount), 0.5),
    medianInferenceMs: percentile(finalSamples.map((sample) => sample.inferenceDurationMs), 0.5),
    p95InferenceMs: percentile(finalSamples.map((sample) => sample.inferenceDurationMs), 0.95),
    targetIntervalMs: profile?.targetIntervalMs ?? null,
  };
}

function summarizeSustained(samples) {
  const windowSize = Math.max(1, Math.floor(samples.length * 0.2));
  const firstWindowMedianInferenceMs = percentile(
    samples.slice(0, windowSize).map((sample) => sample.inferenceDurationMs),
    0.5,
  );
  const lastWindowMedianInferenceMs = percentile(
    samples.slice(-windowSize).map((sample) => sample.inferenceDurationMs),
    0.5,
  );
  return {
    firstWindowMedianInferenceMs,
    latencyDriftRatio: firstWindowMedianInferenceMs > 0
      ? lastWindowMedianInferenceMs / firstWindowMedianInferenceMs
      : Number.POSITIVE_INFINITY,
    lastWindowMedianInferenceMs,
  };
}

export function auditDenseCaptureDeviceReport(report, {
  expectedDeviceClass,
  expectedModelHash = null,
  expectedModelId = null,
} = {}) {
  const failures = [];
  if (report?.schemaVersion !== 1) failures.push("device report schemaVersion must be 1");
  if (report?.profileId !== DENSE_CAPTURE_DEVICE_REPORT_PROFILE) {
    failures.push(`device report profile must be ${DENSE_CAPTURE_DEVICE_REPORT_PROFILE}`);
  }
  if (report?.status !== "measured-awaiting-review") {
    failures.push("device report must remain measured-awaiting-review before human review");
  }
  if (report?.deviceClass !== expectedDeviceClass) failures.push(`device report class must be ${expectedDeviceClass}`);
  if (report?.passed !== true || !Array.isArray(report?.failures) || report.failures.length > 0) {
    failures.push("device report did not pass its browser benchmark");
  }
  if (!SHA256.test(report?.model?.modelHash ?? "") || !report?.model?.modelId) {
    failures.push("device report has no immutable model identity");
  }
  if (!Number.isFinite(report?.model?.loadMs) || report.model.loadMs <= 0) {
    failures.push("device report has no browser model startup measurement");
  }
  if (expectedModelHash && report?.model?.modelHash !== expectedModelHash) {
    failures.push("device report model hash does not match the selected benchmark model");
  }
  if (expectedModelId && report?.model?.modelId !== expectedModelId) {
    failures.push("device report model id does not match the selected benchmark model");
  }
  if (!report?.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) {
    failures.push("device report has no valid generatedAt timestamp");
  }
  const observation = report?.physicalObservation;
  if (
    !["cool", "warm-stable", "hot-or-unstable"].includes(observation?.outcome) ||
    typeof observation?.note !== "string" ||
    !observation?.observedAt ||
    Number.isNaN(Date.parse(observation.observedAt)) ||
    Date.parse(observation.observedAt) < Date.parse(report?.generatedAt)
  ) failures.push("device report has no valid post-run physical observation");
  if (observation?.outcome === "hot-or-unstable") {
    failures.push("device report says the browser became hot, slow, or unstable");
  }
  if (!Number.isFinite(report?.source?.byteLength) || report.source.byteLength <= 0) {
    failures.push("device report has no local source byte count");
  }
  if (typeof report?.source?.mimeType !== "string" || !report.source.mimeType.trim()) {
    failures.push("device report has no local source MIME type");
  }
  if (typeof report?.device?.userAgent !== "string" || !report.device.userAgent.trim()) {
    failures.push("device report has no browser user agent");
  }
  if (expectedDeviceClass === "ipad" && report?.device?.isIpad !== true) {
    failures.push("iPad report was not measured by an iPad browser");
  }
  if (expectedDeviceClass === "older-laptop" && report?.device?.isIpad !== false) {
    failures.push("older-laptop report was not measured by a laptop browser");
  }
  const forbiddenPath = findForbiddenRawVideoKey(report);
  if (forbiddenPath) failures.push(`device report contains forbidden raw-video field ${forbiddenPath}`);

  const samples = Array.isArray(report?.samples) ? report.samples : [];
  if (samples.length < MINIMUM_SAMPLE_COUNT || report?.sampleCount !== samples.length) {
    failures.push(`device report must contain at least ${MINIMUM_SAMPLE_COUNT} samples with a matching sample count`);
  }
  const indexes = new Set();
  samples.forEach((sample, index) => {
    indexes.add(sample?.sampleIndex);
    if (
      sample?.sampleIndex !== index ||
      !QUALITY_PROFILES[sample?.qualityTier] ||
      !Number.isFinite(sample?.elapsedMs) ||
      sample.elapsedMs < 0 ||
      (index > 0 && sample.elapsedMs <= samples[index - 1].elapsedMs) ||
      !Number.isFinite(sample?.inferenceDurationMs) ||
      sample.inferenceDurationMs < 0 ||
      sample.inferenceDurationMs > 1_000 ||
      !Number.isFinite(sample?.anchorCount) ||
      sample.anchorCount < 0
    ) failures.push(`device report sample ${index} is invalid`);
  });
  if (indexes.size !== samples.length) failures.push("device report sample indexes are duplicated");
  const measuredDurationMs = samples.at(-1)?.elapsedMs ?? 0;
  if (
    !Number.isFinite(report?.durationMs) ||
    report.durationMs !== measuredDurationMs ||
    measuredDurationMs < MINIMUM_DURATION_MS
  ) failures.push("device report does not prove a sustained two-minute sample window");

  const recomputed = summarizeFinalTier(samples);
  const sustained = summarizeSustained(samples);
  if (!recomputed.finalQualityTier || recomputed.targetIntervalMs === null) {
    failures.push("device report has no final adaptive quality tier");
  } else {
    const claimed = report?.tierSummaries?.[recomputed.finalQualityTier];
    if (
      report?.finalQualityTier !== recomputed.finalQualityTier ||
      claimed?.medianAnchorCount !== recomputed.medianAnchorCount ||
      claimed?.medianInferenceMs !== recomputed.medianInferenceMs ||
      claimed?.p95InferenceMs !== recomputed.p95InferenceMs ||
      claimed?.targetIntervalMs !== recomputed.targetIntervalMs
    ) failures.push("device report summary does not match its raw samples");
    if (recomputed.p95InferenceMs > recomputed.targetIntervalMs) {
      failures.push("device report final-tier p95 exceeds its browser cadence");
    }
    if (recomputed.medianAnchorCount < 200) {
      failures.push("device report final-tier median anchor count is below 200");
    }
  }

  if (
    report?.sustained?.firstWindowMedianInferenceMs !== sustained.firstWindowMedianInferenceMs ||
    report?.sustained?.lastWindowMedianInferenceMs !== sustained.lastWindowMedianInferenceMs ||
    report?.sustained?.latencyDriftRatio !== sustained.latencyDriftRatio
  ) failures.push("device report sustained summary does not match its raw samples");
  if (!Number.isFinite(sustained.latencyDriftRatio) || sustained.latencyDriftRatio > MAXIMUM_LATENCY_DRIFT_RATIO) {
    failures.push(`device report latency drift exceeds ${MAXIMUM_LATENCY_DRIFT_RATIO}`);
  }

  const memory = report?.memory;
  if (
    !Number.isFinite(memory?.startBytes) || memory.startBytes < 0 ||
    !Number.isFinite(memory?.endBytes) || memory.endBytes < 0 ||
    !Number.isFinite(memory?.peakBytes) || memory.peakBytes < Math.max(memory.startBytes, memory.endBytes) ||
    !Number.isSafeInteger(memory?.startTensorCount) || memory.startTensorCount < 0 ||
    !Number.isSafeInteger(memory?.endTensorCount) || memory.endTensorCount < 0 ||
    memory?.growthBytes !== memory.endBytes - memory.startBytes
  ) failures.push("device report has invalid TensorFlow memory evidence");
  if (Number.isFinite(memory?.growthBytes) && memory.growthBytes > MAXIMUM_TENSOR_MEMORY_GROWTH_BYTES) {
    failures.push("device report TensorFlow memory growth exceeds 5 MB");
  }
  if (
    Number.isSafeInteger(memory?.startTensorCount) &&
    Number.isSafeInteger(memory?.endTensorCount) &&
    memory.endTensorCount - memory.startTensorCount > MAXIMUM_TENSOR_COUNT_GROWTH
  ) failures.push("device report TensorFlow tensor-count growth exceeds 2");

  return {
    failures: Array.from(new Set(failures)),
    passed: failures.length === 0,
    recomputed: { ...recomputed, durationMs: measuredDurationMs, memory, sustained },
  };
}

function candidateModelId(candidate) {
  return candidate?.modelId ?? (
    candidate?.id && candidate?.version ? `${candidate.id}@${candidate.version}` : candidate?.id
  );
}

export function buildReviewedDenseCaptureBenchmarkResults({
  benchmarkResults,
  reports,
  reportHashes,
  reviewedAt,
  reviewer,
}) {
  const failures = [];
  if (!reviewer?.trim()) failures.push("reviewer is required");
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) failures.push("reviewedAt must be an ISO date");
  const candidates = Array.isArray(benchmarkResults?.candidates) ? benchmarkResults.candidates : [];
  const modelHash = reports.ipad?.model?.modelHash;
  const modelId = reports.ipad?.model?.modelId;
  const candidate = candidates.find((entry) => (
    entry?.modelHash === modelHash && candidateModelId(entry) === modelId && entry.status !== "rejected"
  ));
  if (!candidate) failures.push("no measured browser candidate matches the physical-device reports");

  const audits = Object.fromEntries(DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES.map((deviceClass) => {
    const audit = auditDenseCaptureDeviceReport(reports[deviceClass], {
      expectedDeviceClass: deviceClass,
      expectedModelHash: modelHash,
      expectedModelId: modelId,
    });
    failures.push(...audit.failures.map((failure) => `${deviceClass}: ${failure}`));
    return [deviceClass, audit];
  }));
  if (reports["older-laptop"]?.model?.modelHash !== modelHash || reports["older-laptop"]?.model?.modelId !== modelId) {
    failures.push("iPad and older-laptop reports use different model identities");
  }
  DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES.forEach((deviceClass) => {
    if (!SHA256.test(reportHashes?.[deviceClass] ?? "")) failures.push(`${deviceClass}: report SHA-256 is missing`);
  });
  if (failures.length > 0) return { failures: Array.from(new Set(failures)), passed: false, results: null };

  const deviceClassMeasurements = DENSE_CAPTURE_REQUIRED_DEVICE_CLASSES.map((deviceClass) => {
    const report = reports[deviceClass];
    const recomputed = audits[deviceClass].recomputed;
    return {
      deviceClass,
      durationMs: recomputed.durationMs,
      finalQualityTier: recomputed.finalQualityTier,
      hardwareConcurrency: report.device?.hardwareConcurrency ?? null,
      medianAnchorCount: recomputed.medianAnchorCount,
      medianInferenceMs: recomputed.medianInferenceMs,
      memory: recomputed.memory,
      modelLoadMs: report.model.loadMs,
      peakTensorMemoryMb: recomputed.memory.peakBytes / 1024 ** 2,
      physicalObservation: report.physicalObservation,
      modelHash,
      p95InferenceMs: recomputed.p95InferenceMs,
      passed: true,
      reportHash: reportHashes[deviceClass],
      reviewedAt,
      reviewer: reviewer.trim(),
      status: "reviewed",
      sustained: recomputed.sustained,
      targetIntervalMs: recomputed.targetIntervalMs,
    };
  });
  const olderLaptop = deviceClassMeasurements.find((measurement) => measurement.deviceClass === "older-laptop");
  const worstMedianInferenceMs = Math.max(...deviceClassMeasurements.map((measurement) => measurement.medianInferenceMs));
  const worstP95InferenceMs = Math.max(...deviceClassMeasurements.map((measurement) => measurement.p95InferenceMs));
  const worstModelLoadMs = Math.max(...deviceClassMeasurements.map((measurement) => measurement.modelLoadMs));
  const peakMemoryMb = Math.max(...deviceClassMeasurements.map((measurement) => measurement.peakTensorMemoryMb));
  const observationText = (deviceClass) => {
    const observation = reports[deviceClass].physicalObservation;
    const label = observation.outcome === "cool" ? "stayed cool and responsive" : "became warm but stayed responsive";
    return `${label}${observation.note ? ` (${observation.note})` : ""}`;
  };
  return {
    failures: [],
    passed: true,
    results: {
      ...benchmarkResults,
      candidates: candidates.map((entry) => entry === candidate ? {
        ...entry,
        deviceClassMeasurements,
        memoryMeasurementScope: "tensorflow-tensors-only",
        memoryMeasurementStatus: "reviewed",
        medianInferenceMs: worstMedianInferenceMs,
        minimumSupportedDevice: `reviewed older laptop at ${olderLaptop.finalQualityTier} tier`,
        minimumSupportedDeviceStatus: "reviewed",
        p95InferenceMs: worstP95InferenceMs,
        peakMemoryMb,
        thermalMeasurementStatus: "reviewed",
        thermalNotes: `iPad: ${observationText("ipad")}. Older laptop: ${observationText("older-laptop")}.`,
        warmupMs: worstModelLoadMs,
      } : entry),
      deviceReview: { reviewedAt, reviewer: reviewer.trim(), schema: "movement-dense-capture-device-review-v1" },
      selectedCandidateId: candidate.id,
    },
  };
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  const args = { benchmarkResults: "", confirm: false, ipad: "", olderLaptop: "", out: "tmp/movement-replay-lab/dense-capture/benchmark-device-reviewed-results.json", reviewedAt: "", reviewer: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark-results") args.benchmarkResults = argv[++index] ?? "";
    else if (arg === "--ipad") args.ipad = argv[++index] ?? "";
    else if (arg === "--older-laptop") args.olderLaptop = argv[++index] ?? "";
    else if (arg === "--reviewer") args.reviewer = argv[++index] ?? "";
    else if (arg === "--reviewed-at") args.reviewedAt = argv[++index] ?? "";
    else if (arg === "--out") args.out = argv[++index] ?? args.out;
    else if (arg === "--confirm-physical-device-review") args.confirm = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Review the exact local iPad and older-laptop browser reports and bind them to benchmark results.

  npm run movement:dense-capture:device-review -- \\
    --benchmark-results <results.json> --ipad <ipad.json> --older-laptop <laptop.json> \\
    --reviewer <name> --reviewed-at <ISO date> --confirm-physical-device-review
`);
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.confirm) throw new Error("Pass --confirm-physical-device-review after checking both physical devices.");
  for (const [label, filePath] of Object.entries({ "benchmark results": args.benchmarkResults, "iPad report": args.ipad, "older-laptop report": args.olderLaptop })) {
    if (!filePath) throw new Error(`${label} path is required.`);
  }
  const [benchmarkResults, ipad, olderLaptop] = await Promise.all([
    readFile(args.benchmarkResults, "utf8").then(JSON.parse),
    readFile(args.ipad, "utf8").then(JSON.parse),
    readFile(args.olderLaptop, "utf8").then(JSON.parse),
  ]);
  const result = buildReviewedDenseCaptureBenchmarkResults({
    benchmarkResults,
    reportHashes: { ipad: await sha256File(args.ipad), "older-laptop": await sha256File(args.olderLaptop) },
    reports: { ipad, "older-laptop": olderLaptop },
    reviewedAt: args.reviewedAt,
    reviewer: args.reviewer,
  });
  if (!result.passed) throw new Error(`Physical-device review blocked: ${result.failures.join("; ")}`);
  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(result.results, null, 2)}\n`, "utf8");
  console.log(`Reviewed physical-device benchmark results: ${args.out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
