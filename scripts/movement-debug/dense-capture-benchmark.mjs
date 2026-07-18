import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DENSE_CAPTURE_REQUIRED_SCENARIOS = [
  "near-camera",
  "far-camera",
  "front-back-turn",
  "floor-work",
  "body-occlusion",
  "loose-clothing",
];

const VIDEO_EXTENSION = /\.(m4v|mov|mp4|webm)$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const BROWSER_RUNTIMES = ["webgl", "webgpu", "wasm"];
const REQUIRED_DEVICE_CLASSES = ["ipad", "older-laptop"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function auditDenseCaptureBenchmarkManifest(manifest, {
  fileExists = fs.existsSync,
  fileSize = (filePath) => fs.statSync(filePath).size,
  rootDir = process.cwd(),
} = {}) {
  const failures = [];
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.clips)) {
    return {
      clipCount: 0,
      failures: ["Benchmark manifest must use schemaVersion 1 and contain a clips array."],
      passed: false,
      scenarioCoverage: {},
    };
  }

  const ids = new Set();
  const coverage = Object.fromEntries(DENSE_CAPTURE_REQUIRED_SCENARIOS.map((scenario) => [scenario, 0]));
  manifest.clips.forEach((clip, index) => {
    if (!isRecord(clip) || typeof clip.id !== "string" || !clip.id.trim()) {
      failures.push(`Clip ${index} has no stable id.`);
      return;
    }
    if (ids.has(clip.id)) failures.push(`Clip id ${clip.id} is duplicated.`);
    ids.add(clip.id);
    if (typeof clip.path !== "string" || !clip.path.trim() || !VIDEO_EXTENSION.test(clip.path)) {
      failures.push(`Clip ${clip.id} must reference an RGB video file.`);
    } else {
      const resolved = path.resolve(rootDir, clip.path);
      const relative = path.relative(rootDir, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        failures.push(`Clip ${clip.id} must remain inside the benchmark root.`);
      } else if (!fileExists(resolved)) {
        failures.push(`Clip ${clip.id} is missing: ${clip.path}.`);
      } else if (fileSize(resolved) <= 0) {
        failures.push(`Clip ${clip.id} is empty: ${clip.path}.`);
      }
    }
    if (clip.consent?.benchmarkUse !== true) {
      failures.push(`Clip ${clip.id} has no explicit benchmark-use consent.`);
    }
    if (!Array.isArray(clip.scenarios) || clip.scenarios.length === 0) {
      failures.push(`Clip ${clip.id} has no scenario labels.`);
    } else {
      clip.scenarios.forEach((scenario) => {
        if (scenario in coverage) coverage[scenario] += 1;
      });
    }
  });

  DENSE_CAPTURE_REQUIRED_SCENARIOS.forEach((scenario) => {
    if (coverage[scenario] === 0) failures.push(`No RGB clip covers ${scenario}.`);
  });
  if (manifest.clips.length === 0) failures.push("Benchmark manifest contains no RGB clips.");

  return {
    clipCount: manifest.clips.length,
    failures: Array.from(new Set(failures)),
    passed: failures.length === 0,
    scenarioCoverage: coverage,
  };
}

function validMetric(value) {
  return Number.isFinite(value) && value >= 0;
}

export function auditDenseCaptureBenchmarkResults(results, manifest) {
  const failures = [];
  const clipIds = new Set(Array.isArray(manifest?.clips) ? manifest.clips.map((clip) => clip.id) : []);
  if (!isRecord(results) || results.schemaVersion !== 1 || !Array.isArray(results.candidates)) {
    return {
      candidateCount: 0,
      failures: ["Benchmark results must use schemaVersion 1 and contain a candidates array."],
      passed: false,
    };
  }
  if (results.candidates.length < 2) {
    failures.push("Benchmark results require at least two measured model candidates.");
  }

  results.candidates.forEach((candidate, index) => {
    const label = candidate?.id || `candidate-${index}`;
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id.trim()) {
      failures.push(`Candidate ${index} has no id.`);
      return;
    }
    if (!SHA256.test(candidate.modelHash ?? "")) failures.push(`${label} has no model SHA-256 identity.`);
    if (typeof candidate.license !== "string" || !candidate.license.trim()) failures.push(`${label} has no licence decision.`);
    if (!validMetric(candidate.artifactBytes) || candidate.artifactBytes <= 0) failures.push(`${label} has no artifact size.`);
    if (candidate.status === "rejected") {
      if (typeof candidate.rejectionReason !== "string" || !candidate.rejectionReason.trim()) {
        failures.push(`${label} has no measured rejection reason.`);
      }
      if (!["webgl", "webgpu", "wasm", "server-gpu"].includes(candidate.runtime)) {
        failures.push(`${label} has no rejected runtime identity.`);
      }
      return;
    }
    if (!validMetric(candidate.inputWidth) || candidate.inputWidth <= 0 || !validMetric(candidate.inputHeight) || candidate.inputHeight <= 0) {
      failures.push(`${label} has no measured input dimensions.`);
    }
    if (!BROWSER_RUNTIMES.includes(candidate.runtime)) failures.push(`${label} does not run in a supported client-browser runtime.`);
    if (!validMetric(candidate.warmupMs)) failures.push(`${label} has no warm-up measurement.`);
    if (!validMetric(candidate.medianInferenceMs)) failures.push(`${label} has no median inference measurement.`);
    if (!validMetric(candidate.p95InferenceMs) || candidate.p95InferenceMs < candidate.medianInferenceMs) {
      failures.push(`${label} has an invalid p95 inference measurement.`);
    }
    if (!validMetric(candidate.peakMemoryMb) || candidate.peakMemoryMb <= 0) failures.push(`${label} has no peak-memory measurement.`);
    if (typeof candidate.thermalNotes !== "string" || !candidate.thermalNotes.trim()) failures.push(`${label} has no thermal observation.`);
    if (typeof candidate.minimumSupportedDevice !== "string" || !candidate.minimumSupportedDevice.trim()) {
      failures.push(`${label} has no minimum-supported-device decision.`);
    }
    const measuredClipIds = new Set(Array.isArray(candidate.clipMeasurements)
      ? candidate.clipMeasurements.map((measurement) => measurement.clipId)
      : []);
    clipIds.forEach((clipId) => {
      if (!measuredClipIds.has(clipId)) failures.push(`${label} has no measurement for clip ${clipId}.`);
    });
  });
  if (!results.selectedCandidateId) failures.push("No dense-model candidate has been selected.");
  if (
    results.selectedCandidateId &&
    !results.candidates.some((candidate) => (
      candidate.id === results.selectedCandidateId && candidate.status !== "rejected"
    ))
  ) {
    failures.push("The selected dense-model candidate is absent or was rejected.");
  }
  const selectedCandidate = results.candidates.find((candidate) => candidate.id === results.selectedCandidateId);
  if (selectedCandidate && selectedCandidate.status !== "rejected") {
    if (!selectedCandidate.geometryCapabilities?.anatomicalCorrespondence || selectedCandidate.geometryCapabilities.anatomicalCorrespondence === "unavailable") {
      failures.push("The selected dense-model candidate has no anatomical or semantic body correspondence.");
    }
    if (!selectedCandidate.geometryCapabilities || !("depth" in selectedCandidate.geometryCapabilities)) {
      failures.push("The selected dense-model candidate does not explicitly declare its depth capability.");
    }
    if (!selectedCandidate.geometryCapabilities || !("surfaceNormals" in selectedCandidate.geometryCapabilities)) {
      failures.push("The selected dense-model candidate does not explicitly declare its surface-normal capability.");
    }
    if (selectedCandidate.memoryMeasurementStatus !== "reviewed") {
      failures.push("The selected dense-model candidate has no reviewed full-memory measurement.");
    }
    if (selectedCandidate.thermalMeasurementStatus !== "reviewed") {
      failures.push("The selected dense-model candidate has no reviewed sustained thermal measurement.");
    }
    if (selectedCandidate.minimumSupportedDeviceStatus !== "reviewed") {
      failures.push("The selected dense-model candidate has no reviewed minimum-supported-device decision.");
    }
    const deviceMeasurements = Array.isArray(selectedCandidate.deviceClassMeasurements)
      ? selectedCandidate.deviceClassMeasurements
      : [];
    REQUIRED_DEVICE_CLASSES.forEach((deviceClass) => {
      const measurement = deviceMeasurements.find((entry) => entry?.deviceClass === deviceClass);
      if (!measurement || measurement.status !== "reviewed" || measurement.passed !== true) {
        failures.push(`The selected dense-model candidate has no passing reviewed ${deviceClass} measurement.`);
      }
    });
  }

  return {
    candidateCount: results.candidates.length,
    failures: Array.from(new Set(failures)),
    passed: failures.length === 0,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

export function runDenseCaptureBenchmarkGate({
  manifestPath,
  resultsPath,
  rootDir = process.cwd(),
}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return {
      device: null,
      failures: [`Dense benchmark manifest is missing: ${manifestPath || "not supplied"}.`],
      passed: false,
    };
  }
  const manifest = readJson(manifestPath);
  const manifestReport = auditDenseCaptureBenchmarkManifest(manifest, { rootDir });
  if (!resultsPath || !fs.existsSync(resultsPath)) {
    return {
      device: {
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model ?? "unknown",
        logicalCpuCount: os.cpus().length,
        memoryGb: Math.round(os.totalmem() / 1024 ** 3),
        platform: os.platform(),
      },
      failures: [
        ...manifestReport.failures,
        `Measured benchmark results are missing: ${resultsPath || "not supplied"}.`,
      ],
      manifest: manifestReport,
      passed: false,
    };
  }
  const resultsReport = auditDenseCaptureBenchmarkResults(readJson(resultsPath), manifest);
  return {
    device: {
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1024 ** 3),
      platform: os.platform(),
    },
    failures: [...manifestReport.failures, ...resultsReport.failures],
    manifest: manifestReport,
    passed: manifestReport.passed && resultsReport.passed,
    results: resultsReport,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const manifestPath = path.resolve(
    rootDir,
    argValue("--manifest") ?? "tmp/movement-replay-lab/dense-capture/benchmark-manifest.json",
  );
  const resultsArg = argValue("--results");
  const resultsPath = resultsArg
    ? path.resolve(rootDir, resultsArg)
    : path.resolve(rootDir, "tmp/movement-replay-lab/dense-capture/benchmark-results.json");
  const report = runDenseCaptureBenchmarkGate({ manifestPath, resultsPath, rootDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
