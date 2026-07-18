#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DENSE_CAPTURE_SOAK_POLICY = {
  candidateId: "bodypix-mobilenet-v1-075-q2",
  maximumLatencyDriftRatio: 1.25,
  maximumTensorMemoryGrowthMb: 5,
  minimumCycles: 3,
  minimumSamples: 90,
};

export function auditDenseCaptureSoakResults(results) {
  const failures = [];
  const candidate = results?.candidates?.find(
    (entry) => entry?.id === DENSE_CAPTURE_SOAK_POLICY.candidateId,
  );
  if (results?.evidenceType !== "sustained-performance") {
    failures.push("Dense soak results must use sustained-performance evidence type.");
  }
  if (!Number.isSafeInteger(results?.cycles) || results.cycles < DENSE_CAPTURE_SOAK_POLICY.minimumCycles) {
    failures.push(`Dense soak requires at least ${DENSE_CAPTURE_SOAK_POLICY.minimumCycles} cycles.`);
  }
  if (!candidate || candidate.status !== "measured") {
    failures.push(`Dense soak has no measured ${DENSE_CAPTURE_SOAK_POLICY.candidateId} candidate.`);
  } else {
    if (candidate.sampleCount < DENSE_CAPTURE_SOAK_POLICY.minimumSamples) {
      failures.push(`Dense soak requires at least ${DENSE_CAPTURE_SOAK_POLICY.minimumSamples} samples.`);
    }
    if (
      !Number.isFinite(candidate.sustainedPerformance?.latencyDriftRatio) ||
      candidate.sustainedPerformance.latencyDriftRatio > DENSE_CAPTURE_SOAK_POLICY.maximumLatencyDriftRatio
    ) {
      failures.push(`Dense soak latency drift exceeds ${DENSE_CAPTURE_SOAK_POLICY.maximumLatencyDriftRatio}.`);
    }
    if (
      !Number.isFinite(candidate.sustainedPerformance?.tensorMemoryGrowthMb) ||
      candidate.sustainedPerformance.tensorMemoryGrowthMb >
        DENSE_CAPTURE_SOAK_POLICY.maximumTensorMemoryGrowthMb
    ) {
      failures.push(
        `Dense soak tensor-memory growth exceeds ${DENSE_CAPTURE_SOAK_POLICY.maximumTensorMemoryGrowthMb} MB.`,
      );
    }
    if (candidate.thermalMeasurementStatus !== "automated-soak-complete") {
      failures.push("Dense soak is missing its automated sustained-performance status.");
    }
  }
  return { failures, passed: failures.length === 0 };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const resultPath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "tmp/movement-replay-lab/dense-capture/benchmark-soak-results.json",
  );
  if (!fs.existsSync(resultPath)) {
    console.error(`Dense soak results are missing: ${resultPath}`);
    process.exitCode = 1;
  } else {
    const report = auditDenseCaptureSoakResults(JSON.parse(fs.readFileSync(resultPath, "utf8")));
    console.log(JSON.stringify({ ...report, resultPath }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
