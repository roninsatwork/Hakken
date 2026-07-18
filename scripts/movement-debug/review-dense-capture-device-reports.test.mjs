import { describe, expect, it } from "vitest";
import {
  auditDenseCaptureDeviceReport,
  buildReviewedDenseCaptureBenchmarkResults,
} from "./review-dense-capture-device-reports.mjs";

const modelHash = `sha256:${"a".repeat(64)}`;
const modelId = "bodypix@1";

function report(deviceClass) {
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
    model: { loadMs: 1_500, modelHash, modelId },
    memory: {
      endBytes: 1_000_000,
      endTensorCount: 100,
      growthBytes: 0,
      peakBytes: 1_100_000,
      startBytes: 1_000_000,
      startTensorCount: 100,
    },
    passed: true,
    physicalObservation: {
      note: deviceClass === "ipad" ? "no slowdown" : "warm near the camera",
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

function benchmarkResults() {
  return {
    candidates: [{ id: "bodypix", modelHash, runtime: "webgl", status: "measured", version: "1" }],
    schemaVersion: 1,
    selectedCandidateId: null,
  };
}

describe("dense capture physical-device report review", () => {
  it("recomputes and accepts a clean local-only report", () => {
    expect(auditDenseCaptureDeviceReport(report("ipad"), {
      expectedDeviceClass: "ipad",
      expectedModelHash: modelHash,
      expectedModelId: modelId,
    })).toMatchObject({ failures: [], passed: true });
  });

  it("rejects raw video fields, altered summaries, and incomplete samples", () => {
    const invalid = report("ipad");
    invalid.video = "base64-private-video";
    invalid.samples.pop();
    invalid.tierSummaries.medium.p95InferenceMs = 1;
    const audit = auditDenseCaptureDeviceReport(invalid, {
      expectedDeviceClass: "ipad",
      expectedModelHash: modelHash,
      expectedModelId: modelId,
    });

    expect(audit.passed).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/forbidden raw-video field report.video/),
      expect.stringMatching(/at least 60 samples/),
      expect.stringMatching(/summary does not match/),
    ]));
  });

  it("rejects short, drifting, or memory-growing physical runs", () => {
    const invalid = report("ipad");
    invalid.durationMs = 60_000;
    invalid.samples.at(-1).elapsedMs = 60_000;
    invalid.samples.slice(-12).forEach((sample) => { sample.inferenceDurationMs = 120; });
    invalid.memory.endBytes = invalid.memory.startBytes + 6 * 1024 * 1024;
    invalid.memory.growthBytes = 6 * 1024 * 1024;
    invalid.memory.peakBytes = invalid.memory.endBytes;
    invalid.memory.endTensorCount = invalid.memory.startTensorCount + 3;

    const audit = auditDenseCaptureDeviceReport(invalid, {
      expectedDeviceClass: "ipad",
      expectedModelHash: modelHash,
      expectedModelId: modelId,
    });

    expect(audit.passed).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/sustained two-minute/),
      expect.stringMatching(/sustained summary does not match/),
      expect.stringMatching(/memory growth exceeds 5 MB/),
      expect.stringMatching(/tensor-count growth exceeds 2/),
    ]));
  });

  it("binds both reviewed device classes to the exact measured candidate", () => {
    const result = buildReviewedDenseCaptureBenchmarkResults({
      benchmarkResults: benchmarkResults(),
      reportHashes: { ipad: `sha256:${"b".repeat(64)}`, "older-laptop": `sha256:${"c".repeat(64)}` },
      reports: { ipad: report("ipad"), "older-laptop": report("older-laptop") },
      reviewedAt: "2026-07-18T13:00:00.000Z",
      reviewer: "Reviewer One",
    });

    expect(result).toMatchObject({
      failures: [],
      passed: true,
      results: {
        candidates: [{
          deviceClassMeasurements: [
            { deviceClass: "ipad", modelLoadMs: 1_500, passed: true, status: "reviewed" },
            { deviceClass: "older-laptop", modelLoadMs: 1_500, passed: true, status: "reviewed" },
          ],
          memoryMeasurementScope: "tensorflow-tensors-only",
          memoryMeasurementStatus: "reviewed",
          minimumSupportedDeviceStatus: "reviewed",
          thermalMeasurementStatus: "reviewed",
          thermalNotes: expect.stringMatching(/iPad: stayed cool.*Older laptop: became warm/),
          warmupMs: 1_500,
        }],
        selectedCandidateId: "bodypix",
      },
    });
  });

  it("rejects a missing, pre-run, hot, or unstable physical observation", () => {
    const missing = report("ipad");
    delete missing.physicalObservation;
    expect(auditDenseCaptureDeviceReport(missing, { expectedDeviceClass: "ipad" }).failures)
      .toContain("device report has no valid post-run physical observation");

    const hot = report("older-laptop");
    hot.physicalObservation.outcome = "hot-or-unstable";
    expect(auditDenseCaptureDeviceReport(hot, { expectedDeviceClass: "older-laptop" }).failures)
      .toContain("device report says the browser became hot, slow, or unstable");

    const beforeRun = report("ipad");
    beforeRun.physicalObservation.observedAt = "2026-07-18T11:59:00.000Z";
    expect(auditDenseCaptureDeviceReport(beforeRun, { expectedDeviceClass: "ipad" }).failures)
      .toContain("device report has no valid post-run physical observation");
  });

  it("refuses mismatched models or missing explicit review identity", () => {
    const laptop = report("older-laptop");
    laptop.model.modelHash = `sha256:${"d".repeat(64)}`;
    const result = buildReviewedDenseCaptureBenchmarkResults({
      benchmarkResults: benchmarkResults(),
      reportHashes: { ipad: "missing", "older-laptop": "missing" },
      reports: { ipad: report("ipad"), "older-laptop": laptop },
      reviewedAt: "",
      reviewer: "",
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      "reviewer is required",
      "reviewedAt must be an ISO date",
      "iPad and older-laptop reports use different model identities",
      "ipad: report SHA-256 is missing",
    ]));
  });
});
