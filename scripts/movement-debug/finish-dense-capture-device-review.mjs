import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestDenseCaptureDeviceReports } from "./ingest-dense-capture-device-reports.mjs";
import { buildReviewedDenseCaptureBenchmarkResults } from "./review-dense-capture-device-reports.mjs";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

export function finishDenseCaptureDeviceReview({
  benchmarkResultsPath,
  confirmLocalDeviceReportCopy,
  confirmPhysicalDeviceReview,
  dependencies = {},
  destinationDir,
  outPath,
  reviewedAt,
  reviewer,
  sourceDir,
}) {
  const readJson = dependencies.readJson ?? ((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")));
  const ingest = dependencies.ingest ?? ingestDenseCaptureDeviceReports;
  const buildReview = dependencies.buildReview ?? buildReviewedDenseCaptureBenchmarkResults;
  const writeJson = dependencies.writeJson ?? ((filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  });
  const failures = [];
  if (!confirmLocalDeviceReportCopy) failures.push("Explicit --confirm-local-device-report-copy is required.");
  if (!confirmPhysicalDeviceReview) failures.push("Explicit --confirm-physical-device-review is required.");
  if (!reviewer?.trim()) failures.push("reviewer is required");
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) failures.push("reviewedAt must be an ISO date");
  if (!fs.existsSync(benchmarkResultsPath)) failures.push(`Benchmark results are missing: ${benchmarkResultsPath}.`);
  if (fs.existsSync(outPath)) failures.push(`Reviewed result already exists and will not be overwritten: ${outPath}.`);
  if (failures.length > 0) return { failures, passed: false, resultPath: null };

  let benchmarkResults;
  try {
    benchmarkResults = readJson(benchmarkResultsPath);
  } catch {
    return { failures: [`Benchmark results are not valid JSON: ${benchmarkResultsPath}.`], passed: false, resultPath: null };
  }
  const ingestReport = ingest({ confirmLocalDeviceReportCopy, destinationDir, sourceDir });
  if (!ingestReport.passed) {
    return { failures: ingestReport.failures, ingest: ingestReport, passed: false, resultPath: null };
  }
  const copiedByClass = Object.fromEntries(ingestReport.copied.map((item) => [item.deviceClass, item]));
  const reports = Object.fromEntries(Object.entries(copiedByClass).map(([deviceClass, item]) => [
    deviceClass,
    readJson(item.destinationPath),
  ]));
  const review = buildReview({
    benchmarkResults,
    reportHashes: Object.fromEntries(Object.entries(copiedByClass).map(([deviceClass, item]) => [
      deviceClass,
      item.hash,
    ])),
    reports,
    reviewedAt,
    reviewer,
  });
  if (!review.passed) {
    return { failures: review.failures, ingest: ingestReport, passed: false, resultPath: null };
  }
  writeJson(outPath, review.results);
  return {
    failures: [],
    ingest: ingestReport,
    passed: true,
    resultPath: outPath,
    selectedCandidateId: review.results.selectedCandidateId,
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const result = finishDenseCaptureDeviceReview({
    benchmarkResultsPath: path.resolve(
      rootDir,
      argValue("--benchmark-results") ?? "tmp/movement-replay-lab/dense-capture/benchmark-results.json",
    ),
    confirmLocalDeviceReportCopy: process.argv.includes("--confirm-local-device-report-copy"),
    confirmPhysicalDeviceReview: process.argv.includes("--confirm-physical-device-review"),
    destinationDir: path.resolve(
      rootDir,
      argValue("--destination-dir") ?? "tmp/movement-replay-lab/dense-capture/device-reports",
    ),
    outPath: path.resolve(
      rootDir,
      argValue("--out") ?? "tmp/movement-replay-lab/dense-capture/benchmark-device-reviewed-results.json",
    ),
    reviewedAt: argValue("--reviewed-at") ?? "",
    reviewer: argValue("--reviewer") ?? "",
    sourceDir: path.resolve(argValue("--source-dir") ?? path.join(os.homedir(), "Downloads")),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
