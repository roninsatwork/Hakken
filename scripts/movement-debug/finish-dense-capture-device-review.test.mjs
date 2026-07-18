import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finishDenseCaptureDeviceReview } from "./finish-dense-capture-device-review.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sonae-device-finish-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { force: true, recursive: true }));
});

function options() {
  const directory = temporaryDirectory();
  const benchmarkResultsPath = path.join(directory, "benchmark.json");
  fs.writeFileSync(benchmarkResultsPath, "{}");
  return {
    benchmarkResultsPath,
    confirmLocalDeviceReportCopy: true,
    confirmPhysicalDeviceReview: true,
    destinationDir: path.join(directory, "reports"),
    outPath: path.join(directory, "reviewed.json"),
    reviewedAt: "2026-07-18T14:00:00.000Z",
    reviewer: "Reviewer One",
    sourceDir: path.join(directory, "downloads"),
  };
}

describe("dense capture device finish command", () => {
  it("routes copied hashes and reports into one reviewed benchmark result", () => {
    const value = options();
    const writeJson = vi.fn();
    const buildReview = vi.fn(() => ({
      failures: [],
      passed: true,
      results: { selectedCandidateId: "bodypix" },
    }));
    const report = finishDenseCaptureDeviceReview({
      ...value,
      dependencies: {
        buildReview,
        ingest: () => ({
          copied: [
            { destinationPath: "ipad.json", deviceClass: "ipad", hash: `sha256:${"a".repeat(64)}` },
            { destinationPath: "laptop.json", deviceClass: "older-laptop", hash: `sha256:${"b".repeat(64)}` },
          ],
          failures: [],
          passed: true,
        }),
        readJson: (filePath) => ({ filePath }),
        writeJson,
      },
    });

    expect(report).toMatchObject({ failures: [], passed: true, selectedCandidateId: "bodypix" });
    expect(buildReview).toHaveBeenCalledWith(expect.objectContaining({
      reportHashes: {
        ipad: `sha256:${"a".repeat(64)}`,
        "older-laptop": `sha256:${"b".repeat(64)}`,
      },
      reviewer: "Reviewer One",
    }));
    expect(writeJson).toHaveBeenCalledWith(value.outPath, { selectedCandidateId: "bodypix" });
  });

  it("does not ingest when consent, review identity, or source benchmark evidence is missing", () => {
    const value = options();
    const ingest = vi.fn();
    fs.rmSync(value.benchmarkResultsPath);
    const report = finishDenseCaptureDeviceReview({
      ...value,
      confirmLocalDeviceReportCopy: false,
      confirmPhysicalDeviceReview: false,
      dependencies: { ingest },
      reviewedAt: "",
      reviewer: "",
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/confirm-local-device-report-copy/),
      expect.stringMatching(/confirm-physical-device-review/),
      "reviewer is required",
      "reviewedAt must be an ISO date",
      expect.stringMatching(/Benchmark results are missing/),
    ]));
    expect(ingest).not.toHaveBeenCalled();
  });

  it("preserves copied private evidence when strict review blocks promotion", () => {
    const value = options();
    const writeJson = vi.fn();
    const report = finishDenseCaptureDeviceReview({
      ...value,
      dependencies: {
        buildReview: () => ({ failures: ["model mismatch"], passed: false, results: null }),
        ingest: () => ({
          copied: [
            { destinationPath: "ipad.json", deviceClass: "ipad", hash: `sha256:${"a".repeat(64)}` },
            { destinationPath: "laptop.json", deviceClass: "older-laptop", hash: `sha256:${"b".repeat(64)}` },
          ],
          failures: [],
          passed: true,
        }),
        readJson: () => ({}),
        writeJson,
      },
    });

    expect(report).toMatchObject({ failures: ["model mismatch"], passed: false, resultPath: null });
    expect(report.ingest.copied).toHaveLength(2);
    expect(writeJson).not.toHaveBeenCalled();
  });
});
