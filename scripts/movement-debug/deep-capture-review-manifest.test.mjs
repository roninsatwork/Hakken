import { describe, expect, it } from "vitest";
import {
  auditDeepCaptureReviewInputs,
  auditStoredDeepCaptureReviewManifest,
  buildDeepCaptureReviewManifest,
} from "./deep-capture-review-manifest.mjs";

const denseModel = { modelHash: `sha256:${"b".repeat(64)}`, modelId: "dense-a@1" };
const deviceMeasurement = (deviceClass, {
  medianInferenceMs,
  modelLoadMs,
  p95InferenceMs,
  peakTensorMemoryMb,
}) => ({
  deviceClass,
  durationMs: 120_000,
  finalQualityTier: "medium",
  medianInferenceMs,
  memory: {
    endTensorCount: 100,
    growthBytes: 0,
    startTensorCount: 100,
  },
  modelLoadMs,
  p95InferenceMs,
  passed: true,
  peakTensorMemoryMb,
  physicalObservation: {
    note: "stable",
    observedAt: "2026-07-18T12:03:00.000Z",
    outcome: deviceClass === "ipad" ? "cool" : "warm-stable",
  },
  reportHash: `sha256:${(deviceClass === "ipad" ? "1" : "2").repeat(64)}`,
  status: "reviewed",
  sustained: { latencyDriftRatio: 1.1 },
});
const candidate = {
  artifactBytes: 10_000,
  deviceClassMeasurements: [
    deviceMeasurement("ipad", {
      medianInferenceMs: 20,
      modelLoadMs: 50,
      p95InferenceMs: 30,
      peakTensorMemoryMb: 10,
    }),
    deviceMeasurement("older-laptop", {
      medianInferenceMs: 25,
      modelLoadMs: 60,
      p95InferenceMs: 35,
      peakTensorMemoryMb: 12,
    }),
  ],
  id: "dense-a",
  geometryCapabilities: {
    anatomicalCorrespondence: "semantic-part-lattice",
    depth: "unavailable",
    surfaceNormals: "unavailable",
  },
  license: "reviewed",
  memoryMeasurementScope: "tensorflow-tensors-only",
  memoryMeasurementStatus: "reviewed",
  medianInferenceMs: 25,
  minimumSupportedDevice: "device-a",
  minimumSupportedDeviceStatus: "reviewed",
  modelHash: denseModel.modelHash,
  modelId: denseModel.modelId,
  p95InferenceMs: 35,
  peakMemoryMb: 12,
  runtime: "webgpu",
  thermalNotes: "stable",
  thermalMeasurementStatus: "reviewed",
  warmupMs: 60,
};
const tierSummary = (proofTier, recordingCount) => ({
  exactChecksumDivergenceCount: 0,
  passed: true,
  proofProfile: "deep-capture-v1",
  proofTier,
  recordingCount,
});

function inputs() {
  return {
    artifactRecords: [
      "commissioning-packet",
      "capture-reuse-report",
      "dense-benchmark-results",
      "commissioning-summary",
      "targeted-tier-summary",
      "representative-tier-summary",
      "all-nine-tier-summary",
    ].map((name, index) => ({
      name,
      path: `artifact-${index}.json`,
      sha256: `sha256:${String(index).repeat(64)}`,
    })),
    benchmarkResults: { candidates: [candidate], selectedCandidateId: "dense-a" },
    code: {
      commit: "abc123",
      motionPipelineFingerprint: `sha256:${"c".repeat(64)}`,
      workingTreeClean: true,
    },
    commissioningSummary: {
      passed: true,
      proofProfile: "deep-capture-v1",
      recordingId: "packet-a",
    },
    generatedAt: "2026-07-18T10:00:00.000Z",
    packet: {
      id: "packet-a",
      schemaVersion: 3,
      sourcePacketHash: `sha256:${"a".repeat(64)}`,
    },
    reuseReport: {
      current: {
        cameraFingerprint: "fnv1a32:1234abcd",
        deepProfileChecksum: "fnv1a32:2345bcde",
        denseModel,
        inputContractChecksum: "fnv1a32:3456cdef",
      },
      decision: "reuse-recording",
      policyId: "movement-capture-reuse-policy-v1",
      reusable: true,
    },
    reviewedAt: "2026-07-18T10:00:00.000Z",
    reviewer: "Reviewer One",
    tierSummaries: {
      "all-nine": tierSummary("all-nine", 9),
      representative: tierSummary("representative", 3),
      targeted: tierSummary("targeted", 1),
    },
  };
}

describe("Deep Capture review manifest", () => {
  it("binds human review, code, acquisition, model, device, packet, and tier artifacts", () => {
    const manifest = buildDeepCaptureReviewManifest(inputs());
    expect(manifest).toMatchObject({
      acquisition: { reusePolicyId: "movement-capture-reuse-policy-v1" },
      code: { commit: "abc123", workingTreeClean: true },
      packet: { recordingId: "packet-a", schemaVersion: 3 },
      review: { reviewer: "Reviewer One" },
      schema: "movement-deep-capture-review-manifest-v1",
      status: "accepted",
      supportedDevice: {
        deviceClassMeasurements: [
          { deviceClass: "ipad", durationMs: 120_000, modelLoadMs: 50 },
          { deviceClass: "older-laptop", durationMs: 120_000, modelLoadMs: 60 },
        ],
        memoryMeasurementScope: "tensorflow-tensors-only",
        minimumSupportedDevice: "device-a",
      },
    });
    expect(manifest.artifacts).toHaveLength(7);
  });

  it("refuses missing reviewer, dirty code, model mismatch, or skipped tiers", () => {
    const value = inputs();
    value.reviewer = "";
    value.code.workingTreeClean = false;
    value.reuseReport.current.denseModel = {
      ...denseModel,
      modelHash: `sha256:${"d".repeat(64)}`,
    };
    delete value.tierSummaries.representative;
    const report = auditDeepCaptureReviewInputs(value);
    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "reviewer is missing",
      "working tree is not clean",
      "selected benchmark model does not match the current reuse identity",
      "tier: representative: summary is missing",
    ]));
  });

  it("refuses server processing or missing iPad and older-laptop evidence", () => {
    const value = inputs();
    value.benchmarkResults.candidates[0] = {
      ...value.benchmarkResults.candidates[0],
      deviceClassMeasurements: [],
      runtime: "server-gpu",
    };
    const report = auditDeepCaptureReviewInputs(value);
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("selected dense model has no complete supported-device evidence");
  });

  it("refuses stale physical-device summaries or unbounded sustained drift", () => {
    const value = inputs();
    value.benchmarkResults.candidates[0] = {
      ...value.benchmarkResults.candidates[0],
      deviceClassMeasurements: value.benchmarkResults.candidates[0].deviceClassMeasurements.map(
        (measurement) => measurement.deviceClass === "older-laptop"
          ? { ...measurement, sustained: { latencyDriftRatio: 1.6 } }
          : measurement,
      ),
      p95InferenceMs: 30,
    };
    const report = auditDeepCaptureReviewInputs(value);
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("selected dense model has no complete supported-device evidence");
  });

  it("re-hashes artifacts and rejects stale code or mutated evidence", async () => {
    const manifest = buildDeepCaptureReviewManifest(inputs());
    const report = await auditStoredDeepCaptureReviewManifest(manifest, {
      code: {
        commit: "different",
        motionPipelineFingerprint: manifest.code.motionPipelineFingerprint,
        workingTreeClean: true,
      },
      sha256File: async () => `sha256:${"f".repeat(64)}`,
    });
    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      "review manifest commit is stale",
      expect.stringContaining("artifact changed"),
    ]));
  });

  it("rejects a manifest that substitutes unrelated artifacts", async () => {
    const manifest = buildDeepCaptureReviewManifest(inputs());
    manifest.artifacts[0] = {
      ...manifest.artifacts[0],
      name: "unrelated-artifact",
    };
    const report = await auditStoredDeepCaptureReviewManifest(manifest, {
      code: manifest.code,
      sha256File: async () => manifest.artifacts[0].sha256,
    });
    expect(report.passed).toBe(false);
    expect(report.failures).toContain("required artifact is missing: commissioning-packet");
  });
});
