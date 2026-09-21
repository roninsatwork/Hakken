import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ingestDenseCaptureDeviceReports,
  planDenseCaptureDeviceReportIngest,
} from "./ingest-dense-capture-device-reports.mjs";

const temporaryDirectories = [];
const modelHash = `sha256:${"a".repeat(64)}`;

function entry(name, modifiedAtMs = 1, size = 1_000) {
  return { isFile: true, modifiedAtMs, name, size };
}

function validReport(deviceClass) {
  const samples = Array.from({ length: 60 }, (_, sampleIndex) => ({
    anchorCount: 400,
    elapsedMs: (sampleIndex / 59) * 120_000,
    inferenceDurationMs: 70,
    qualityTier: "medium",
    sampleIndex,
  }));
  return {
    device: {
      hardwareConcurrency: 4,
      isIpad: deviceClass === "ipad",
      userAgent: deviceClass === "ipad" ? "Mobile Safari iPad" : "Chrome laptop",
    },
    deviceClass,
    durationMs: 120_000,
    failures: [],
    finalQualityTier: "medium",
    generatedAt: "2026-07-18T12:00:00.000Z",
    memory: {
      endBytes: 1_000_000,
      endTensorCount: 100,
      growthBytes: 0,
      peakBytes: 1_100_000,
      startBytes: 1_000_000,
      startTensorCount: 100,
    },
    model: { loadMs: 1_500, modelHash, modelId: "bodypix@1" },
    passed: true,
    physicalObservation: {
      note: "responsive",
      observedAt: "2026-07-18T12:03:00.000Z",
      outcome: deviceClass === "ipad" ? "cool" : "warm-stable",
    },
    profileId: "movement-dense-capture-device-benchmark-v1",
    sampleCount: 60,
    samples,
    schemaVersion: 1,
    source: { byteLength: 1_000, mimeType: "video/webm" },
    status: "measured-awaiting-review",
    sustained: {
      firstWindowMedianInferenceMs: 70,
      latencyDriftRatio: 1,
      lastWindowMedianInferenceMs: 70,
    },
    tierSummaries: {
      medium: {
        maximumInferenceMs: 70,
        medianAnchorCount: 400,
        medianInferenceMs: 70,
        p95InferenceMs: 70,
        sampleCount: 60,
        targetIntervalMs: 180,
      },
    },
  };
}

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hakken-device-ingest-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { force: true, recursive: true }));
});

describe("dense capture device-report ingest", () => {
  it("selects the newest non-empty report for both required device classes", () => {
    const report = planDenseCaptureDeviceReportIngest({
      entries: [
        entry("hakken-dense-device-ipad-1.json", 1),
        entry("hakken-dense-device-ipad-2.json", 2),
        entry("hakken-dense-device-older-laptop-3.json", 3),
        entry("unrelated.json", 4),
      ],
    });

    expect(report).toMatchObject({ failures: [], passed: true });
    expect(report.selected).toEqual(expect.arrayContaining([
      expect.objectContaining({ deviceClass: "ipad", name: "hakken-dense-device-ipad-2.json" }),
      expect.objectContaining({ deviceClass: "older-laptop", name: "hakken-dense-device-older-laptop-3.json" }),
    ]));
  });

  it("copies valid reports without moving or overwriting the originals", () => {
    const sourceDir = temporaryDirectory();
    const destinationDir = path.join(temporaryDirectory(), "private-reports");
    const ipadName = "hakken-dense-device-ipad-1.json";
    const laptopName = "hakken-dense-device-older-laptop-2.json";
    fs.writeFileSync(path.join(sourceDir, ipadName), JSON.stringify(validReport("ipad")));
    fs.writeFileSync(path.join(sourceDir, laptopName), JSON.stringify(validReport("older-laptop")));

    const report = ingestDenseCaptureDeviceReports({
      confirmLocalDeviceReportCopy: true,
      destinationDir,
      sourceDir,
    });

    expect(report).toMatchObject({ failures: [], passed: true });
    expect(report.copied).toHaveLength(2);
    expect(fs.existsSync(path.join(sourceDir, ipadName))).toBe(true);
    expect(fs.existsSync(path.join(sourceDir, laptopName))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, "ipad-report.json"))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, "older-laptop-report.json"))).toBe(true);
  });

  it("rejects missing consent, incomplete packs, and invalid newest evidence", () => {
    const sourceDir = temporaryDirectory();
    const destinationDir = path.join(temporaryDirectory(), "private-reports");
    fs.writeFileSync(path.join(sourceDir, "hakken-dense-device-ipad-1.json"), "{}");

    expect(ingestDenseCaptureDeviceReports({
      confirmLocalDeviceReportCopy: false,
      destinationDir,
      sourceDir,
    }).failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/Explicit --confirm-local-device-report-copy/),
    ]));
    expect(ingestDenseCaptureDeviceReports({
      confirmLocalDeviceReportCopy: true,
      destinationDir,
      sourceDir,
    }).failures).toContain("No downloaded older-laptop device report was found.");
  });
});
