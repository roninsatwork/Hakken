#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  movementCodeCommit,
  movementPipelineFingerprint,
} from "./lib/movementPipelineFingerprint.mjs";
import { auditDeepCaptureTieredFinishGate } from "./deep-capture-tiered-finish-gate.mjs";

export const DEEP_CAPTURE_REVIEW_MANIFEST_SCHEMA = "movement-deep-capture-review-manifest-v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const FNV1A32 = /^fnv1a32:[a-f0-9]{8}$/;
const REQUIRED_ARTIFACT_NAMES = [
  "commissioning-packet",
  "capture-reuse-report",
  "dense-benchmark-results",
  "commissioning-summary",
  "targeted-tier-summary",
  "representative-tier-summary",
  "all-nine-tier-summary",
];

function parseArgs(argv) {
  const args = {
    benchmarkResults: "",
    commissioningSummary: "",
    out: "tmp/movement-replay-lab/current-deep-capture-review-manifest.json",
    packet: "",
    reuseReport: "",
    reviewedAt: "",
    reviewer: "",
    tierSummaries: {},
    verify: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark-results") args.benchmarkResults = argv[++index] || "";
    else if (arg === "--commissioning-summary") args.commissioningSummary = argv[++index] || "";
    else if (arg === "--packet") args.packet = argv[++index] || "";
    else if (arg === "--reuse-report") args.reuseReport = argv[++index] || "";
    else if (arg === "--reviewed-at") args.reviewedAt = argv[++index] || "";
    else if (arg === "--reviewer") args.reviewer = argv[++index] || "";
    else if (arg === "--targeted-summary") args.tierSummaries.targeted = argv[++index] || "";
    else if (arg === "--representative-summary") args.tierSummaries.representative = argv[++index] || "";
    else if (arg === "--all-nine-summary") args.tierSummaries["all-nine"] = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || args.out;
    else if (arg === "--verify") args.verify = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Create or verify the final Deep Capture reviewer acceptance manifest.

Create:
  npm run movement:replay-game:deep-review-manifest -- \\
    --reviewer <name> --reviewed-at <ISO date> --packet <session.json> \\
    --reuse-report <reuse.json> --benchmark-results <results.json> \\
    --commissioning-summary <summary.json> --targeted-summary <summary.json> \\
    --representative-summary <summary.json> --all-nine-summary <summary.json>

Verify:
  npm run movement:replay-game:deep-review-manifest-gate
`);
}

function currentWorkingTreeClean() {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "";
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const content = await readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function sha256Value(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function selectedBenchmarkCandidate(results) {
  return Array.isArray(results?.candidates)
    ? results.candidates.find((candidate) => candidate?.id === results.selectedCandidateId)
    : null;
}

function completeSupportedDeviceProfile(candidate) {
  const deviceMeasurements = Array.isArray(candidate?.deviceClassMeasurements)
    ? candidate.deviceClassMeasurements
    : [];
  const reviewedDeviceMeasurement = (deviceClass) => deviceMeasurements.find((measurement) => (
    measurement?.deviceClass === deviceClass &&
    measurement.status === "reviewed" &&
    measurement.passed === true &&
    ["high", "medium", "low"].includes(measurement.finalQualityTier) &&
    SHA256.test(measurement.reportHash ?? "") &&
    Number.isFinite(measurement.durationMs) && measurement.durationMs >= 120_000 &&
    Number.isFinite(measurement.modelLoadMs) && measurement.modelLoadMs > 0 &&
    Number.isFinite(measurement.medianInferenceMs) &&
    Number.isFinite(measurement.p95InferenceMs) &&
    Number.isFinite(measurement.peakTensorMemoryMb) && measurement.peakTensorMemoryMb > 0 &&
    ["cool", "warm-stable"].includes(measurement.physicalObservation?.outcome) &&
    typeof measurement.physicalObservation?.note === "string" &&
    !Number.isNaN(Date.parse(measurement.physicalObservation?.observedAt)) &&
    Number.isFinite(measurement.sustained?.latencyDriftRatio) &&
    measurement.sustained.latencyDriftRatio <= 1.5 &&
    Number.isFinite(measurement.memory?.growthBytes) &&
    measurement.memory.growthBytes <= 5 * 1024 * 1024 &&
    Number.isSafeInteger(measurement.memory?.startTensorCount) &&
    Number.isSafeInteger(measurement.memory?.endTensorCount) &&
    measurement.memory.endTensorCount - measurement.memory.startTensorCount <= 2
  ));
  const ipad = reviewedDeviceMeasurement("ipad");
  const olderLaptop = reviewedDeviceMeasurement("older-laptop");
  const worst = ipad && olderLaptop ? {
    medianInferenceMs: Math.max(ipad.medianInferenceMs, olderLaptop.medianInferenceMs),
    modelLoadMs: Math.max(ipad.modelLoadMs, olderLaptop.modelLoadMs),
    p95InferenceMs: Math.max(ipad.p95InferenceMs, olderLaptop.p95InferenceMs),
    peakTensorMemoryMb: Math.max(ipad.peakTensorMemoryMb, olderLaptop.peakTensorMemoryMb),
  } : null;
  return Boolean(
    candidate &&
    typeof candidate.license === "string" && candidate.license.trim() &&
    Number.isFinite(candidate.artifactBytes) && candidate.artifactBytes > 0 &&
    Number.isFinite(candidate.warmupMs) &&
    Number.isFinite(candidate.medianInferenceMs) &&
    Number.isFinite(candidate.p95InferenceMs) &&
    Number.isFinite(candidate.peakMemoryMb) && candidate.peakMemoryMb > 0 &&
    typeof candidate.thermalNotes === "string" && candidate.thermalNotes.trim() &&
    typeof candidate.minimumSupportedDevice === "string" && candidate.minimumSupportedDevice.trim() &&
    candidate.memoryMeasurementStatus === "reviewed" &&
    candidate.memoryMeasurementScope === "tensorflow-tensors-only" &&
    candidate.thermalMeasurementStatus === "reviewed" &&
    candidate.minimumSupportedDeviceStatus === "reviewed" &&
    candidate.geometryCapabilities?.anatomicalCorrespondence &&
    candidate.geometryCapabilities.anatomicalCorrespondence !== "unavailable" &&
    Object.hasOwn(candidate.geometryCapabilities, "depth") &&
    Object.hasOwn(candidate.geometryCapabilities, "surfaceNormals") &&
    ipad && olderLaptop && worst &&
    candidate.medianInferenceMs === worst.medianInferenceMs &&
    candidate.p95InferenceMs === worst.p95InferenceMs &&
    candidate.peakMemoryMb === worst.peakTensorMemoryMb &&
    candidate.warmupMs === worst.modelLoadMs &&
    ["webgl", "webgpu", "wasm"].includes(candidate.runtime),
  );
}

export function auditDeepCaptureReviewInputs({
  benchmarkResults,
  code,
  commissioningSummary,
  packet,
  reuseReport,
  reviewedAt,
  reviewer,
  tierSummaries,
}) {
  const failures = [];
  const candidate = selectedBenchmarkCandidate(benchmarkResults);
  if (!reviewer?.trim()) failures.push("reviewer is missing");
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) failures.push("reviewedAt is not an ISO date");
  if (!code?.workingTreeClean) failures.push("working tree is not clean");
  if (!code?.commit || code.commit === "unknown") failures.push("current commit is missing");
  if (!SHA256.test(code?.motionPipelineFingerprint ?? "")) failures.push("runtime fingerprint is missing");
  if (packet?.schemaVersion !== 3) failures.push("commissioning packet is not schema v3");
  if (!SHA256.test(packet?.sourcePacketHash ?? "")) failures.push("packet SHA-256 is missing");
  if (reuseReport?.decision !== "reuse-recording" || reuseReport?.reusable !== true) {
    failures.push("capture reuse report is not reusable against current acquisition identity");
  }
  // Deep/input semantic checksums are FNV boundary ids. Their presence is
  // required here; the combined acquisition fingerprint below is SHA-256.
  if (!FNV1A32.test(reuseReport?.current?.deepProfileChecksum ?? "")) {
    failures.push("current Deep Capture semantic checksum is missing");
  }
  if (!FNV1A32.test(reuseReport?.current?.inputContractChecksum ?? "")) {
    failures.push("current input-contract semantic checksum is missing");
  }
  if (!FNV1A32.test(reuseReport?.current?.cameraFingerprint ?? "")) {
    failures.push("current camera fingerprint is missing");
  }
  if (!candidate || !completeSupportedDeviceProfile(candidate)) {
    failures.push("selected dense model has no complete supported-device evidence");
  }
  if (
    candidate && (
      candidate.modelHash !== reuseReport?.current?.denseModel?.modelHash ||
      (candidate.modelId ?? (candidate.version ? `${candidate.id}@${candidate.version}` : candidate.id)) !==
        reuseReport?.current?.denseModel?.modelId
    )
  ) {
    failures.push("selected benchmark model does not match the current reuse identity");
  }
  if (
    commissioningSummary?.passed !== true ||
    commissioningSummary?.proofProfile !== "deep-capture-v1"
  ) {
    failures.push("Deep Capture commissioning proof did not pass");
  }
  if (
    commissioningSummary?.recordingId &&
    packet?.id &&
    commissioningSummary.recordingId !== packet.id
  ) {
    failures.push("commissioning summary and packet recording ids differ");
  }
  const tierReport = auditDeepCaptureTieredFinishGate({
    summaries: tierSummaries,
    through: "all-nine",
  });
  failures.push(...tierReport.failures.map((failure) => `tier: ${failure}`));
  return { candidate, failures, passed: failures.length === 0, tierReport };
}

export function buildDeepCaptureReviewManifest({
  artifactRecords,
  benchmarkResults,
  code,
  commissioningSummary,
  generatedAt,
  packet,
  reuseReport,
  reviewedAt,
  reviewer,
  tierSummaries,
}) {
  const audit = auditDeepCaptureReviewInputs({
    benchmarkResults,
    code,
    commissioningSummary,
    packet,
    reuseReport,
    reviewedAt,
    reviewer,
    tierSummaries,
  });
  if (!audit.passed) throw new Error(`Deep Capture review manifest blocked: ${audit.failures.join("; ")}`);
  const candidate = audit.candidate;
  return {
    acquisition: {
      cameraFingerprint: reuseReport.current.cameraFingerprint,
      combinedFingerprint: sha256Value(reuseReport.current),
      deepProfileChecksum: reuseReport.current.deepProfileChecksum,
      inputContractChecksum: reuseReport.current.inputContractChecksum,
      reusePolicyId: reuseReport.policyId,
    },
    artifacts: artifactRecords,
    code: {
      commit: code.commit,
      motionPipelineFingerprint: code.motionPipelineFingerprint,
      workingTreeClean: true,
    },
    denseModel: {
      artifactBytes: candidate.artifactBytes,
      id: reuseReport.current.denseModel.modelId,
      license: candidate.license,
      modelHash: candidate.modelHash,
      runtime: candidate.runtime,
    },
    generatedAt,
    packet: {
      recordingId: packet.id ?? packet.recordingId,
      schemaVersion: packet.schemaVersion,
      sourcePacketHash: packet.sourcePacketHash,
    },
    proof: {
      commissioningPassed: true,
      tiers: audit.tierReport.requiredTiers,
    },
    review: { reviewedAt, reviewer: reviewer.trim() },
    schema: DEEP_CAPTURE_REVIEW_MANIFEST_SCHEMA,
    status: "accepted",
    supportedDevice: {
      deviceClassMeasurements: candidate.deviceClassMeasurements.map((measurement) => ({
        deviceClass: measurement.deviceClass,
        durationMs: measurement.durationMs,
        finalQualityTier: measurement.finalQualityTier,
        medianInferenceMs: measurement.medianInferenceMs,
        modelLoadMs: measurement.modelLoadMs,
        p95InferenceMs: measurement.p95InferenceMs,
        peakTensorMemoryMb: measurement.peakTensorMemoryMb,
        physicalObservation: measurement.physicalObservation,
        reportHash: measurement.reportHash,
        sustained: measurement.sustained,
      })),
      memoryMeasurementScope: candidate.memoryMeasurementScope,
      medianInferenceMs: candidate.medianInferenceMs,
      minimumSupportedDevice: candidate.minimumSupportedDevice,
      p95InferenceMs: candidate.p95InferenceMs,
      peakMemoryMb: candidate.peakMemoryMb,
      thermalNotes: candidate.thermalNotes,
      warmupMs: candidate.warmupMs,
    },
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function artifactRecord(name, filePath) {
  const resolvedPath = path.resolve(filePath);
  return {
    name,
    path: path.relative(process.cwd(), resolvedPath),
    sha256: await sha256File(resolvedPath),
  };
}

export async function auditStoredDeepCaptureReviewManifest(manifest, options = {}) {
  const failures = [];
  const code = options.code ?? {
    commit: movementCodeCommit(),
    motionPipelineFingerprint: movementPipelineFingerprint(),
    workingTreeClean: currentWorkingTreeClean(),
  };
  if (manifest?.schema !== DEEP_CAPTURE_REVIEW_MANIFEST_SCHEMA) failures.push("review manifest schema is invalid");
  if (manifest?.status !== "accepted") failures.push("review manifest is not accepted");
  if (!manifest?.review?.reviewer || Number.isNaN(Date.parse(manifest?.review?.reviewedAt))) {
    failures.push("review identity is incomplete");
  }
  if (!code.workingTreeClean) failures.push("working tree is not clean");
  if (manifest?.code?.commit !== code.commit) failures.push("review manifest commit is stale");
  if (manifest?.code?.motionPipelineFingerprint !== code.motionPipelineFingerprint) {
    failures.push("review manifest runtime fingerprint is stale");
  }
  if (!SHA256.test(manifest?.acquisition?.combinedFingerprint ?? "")) {
    failures.push("review manifest acquisition fingerprint is invalid");
  }
  if (!SHA256.test(manifest?.denseModel?.modelHash ?? "")) {
    failures.push("review manifest model hash is invalid");
  }
  if (!SHA256.test(manifest?.packet?.sourcePacketHash ?? "")) {
    failures.push("review manifest packet hash is invalid");
  }
  const hashFile = options.sha256File ?? sha256File;
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const artifactNames = new Set(artifacts.map((artifact) => artifact?.name));
  for (const requiredName of REQUIRED_ARTIFACT_NAMES) {
    if (!artifactNames.has(requiredName)) failures.push(`required artifact is missing: ${requiredName}`);
  }
  for (const artifact of artifacts) {
    if (!SHA256.test(artifact?.sha256 ?? "")) {
      failures.push(`artifact hash is invalid: ${artifact?.name ?? "unknown"}`);
      continue;
    }
    try {
      const actualHash = await hashFile(path.resolve(artifact.path));
      if (actualHash !== artifact.sha256) failures.push(`artifact changed: ${artifact.name}`);
    } catch {
      failures.push(`artifact is missing: ${artifact.name}`);
    }
  }
  if (artifacts.length !== REQUIRED_ARTIFACT_NAMES.length) {
    failures.push("review manifest does not bind every required artifact");
  }
  return { failures, passed: failures.length === 0 };
}

export async function runDeepCaptureReviewManifest(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (args.verify) {
    const manifest = await readJson(args.verify);
    const report = await auditStoredDeepCaptureReviewManifest(manifest);
    console.log(`Deep Capture review manifest gate: ${report.passed ? "passed" : "blocked"}.`);
    if (!report.passed) {
      report.failures.forEach((failure) => console.error(`- ${failure}`));
      process.exitCode = 1;
    }
    return report;
  }
  const required = [
    ["--reviewer", args.reviewer],
    ["--reviewed-at", args.reviewedAt],
    ["--packet", args.packet],
    ["--reuse-report", args.reuseReport],
    ["--benchmark-results", args.benchmarkResults],
    ["--commissioning-summary", args.commissioningSummary],
    ["--targeted-summary", args.tierSummaries.targeted],
    ["--representative-summary", args.tierSummaries.representative],
    ["--all-nine-summary", args.tierSummaries["all-nine"]],
  ];
  const missing = required.filter(([, value]) => !value).map(([flag]) => flag);
  if (missing.length > 0) throw new Error(`Missing required options: ${missing.join(", ")}.`);
  const packet = await readJson(args.packet);
  const reuseReport = await readJson(args.reuseReport);
  const benchmarkResults = await readJson(args.benchmarkResults);
  const commissioningSummary = await readJson(args.commissioningSummary);
  const tierSummaries = {
    targeted: await readJson(args.tierSummaries.targeted),
    representative: await readJson(args.tierSummaries.representative),
    "all-nine": await readJson(args.tierSummaries["all-nine"]),
  };
  const artifactRecords = await Promise.all([
    artifactRecord("commissioning-packet", args.packet),
    artifactRecord("capture-reuse-report", args.reuseReport),
    artifactRecord("dense-benchmark-results", args.benchmarkResults),
    artifactRecord("commissioning-summary", args.commissioningSummary),
    artifactRecord("targeted-tier-summary", args.tierSummaries.targeted),
    artifactRecord("representative-tier-summary", args.tierSummaries.representative),
    artifactRecord("all-nine-tier-summary", args.tierSummaries["all-nine"]),
  ]);
  const code = {
    commit: movementCodeCommit(),
    motionPipelineFingerprint: movementPipelineFingerprint(),
    workingTreeClean: currentWorkingTreeClean(),
  };
  const manifest = buildDeepCaptureReviewManifest({
    artifactRecords,
    benchmarkResults,
    code,
    commissioningSummary,
    generatedAt: new Date().toISOString(),
    packet,
    reuseReport,
    reviewedAt: args.reviewedAt,
    reviewer: args.reviewer,
    tierSummaries,
  });
  const outPath = path.resolve(args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Deep Capture review manifest accepted and written to ${outPath}.`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDeepCaptureReviewManifest(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
