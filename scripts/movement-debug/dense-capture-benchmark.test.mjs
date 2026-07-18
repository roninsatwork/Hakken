import { describe, expect, it } from "vitest";
import {
  DENSE_CAPTURE_REQUIRED_SCENARIOS,
  auditDenseCaptureBenchmarkManifest,
  auditDenseCaptureBenchmarkResults,
} from "./dense-capture-benchmark.mjs";

function manifest() {
  return {
    schemaVersion: 1,
    clips: DENSE_CAPTURE_REQUIRED_SCENARIOS.map((scenario, index) => ({
      consent: { benchmarkUse: true },
      id: `clip-${index}`,
      path: `clips/${scenario}.mp4`,
      scenarios: [scenario],
    })),
  };
}

function candidate(id) {
  return {
    artifactBytes: 10_000_000,
    clipMeasurements: DENSE_CAPTURE_REQUIRED_SCENARIOS.map((_, index) => ({
      clipId: `clip-${index}`,
      coverage: 0.9,
    })),
    id,
    deviceClassMeasurements: [
      { deviceClass: "ipad", passed: true, status: "reviewed" },
      { deviceClass: "older-laptop", passed: true, status: "reviewed" },
    ],
    geometryCapabilities: {
      anatomicalCorrespondence: "persistent-surface-correspondence",
      depth: "camera-space",
      surfaceNormals: "model-estimated",
    },
    inputHeight: 512,
    inputWidth: 512,
    license: "reviewed-test-licence",
    memoryMeasurementStatus: "reviewed",
    medianInferenceMs: 30,
    minimumSupportedDevice: "test-device",
    minimumSupportedDeviceStatus: "reviewed",
    modelHash: `sha256:${"a".repeat(64)}`,
    p95InferenceMs: 45,
    peakMemoryMb: 400,
    runtime: "webgpu",
    thermalNotes: "No throttling during the test window.",
    thermalMeasurementStatus: "reviewed",
    warmupMs: 100,
  };
}

describe("dense capture benchmark gate", () => {
  it("requires real, consented RGB clips across every acceptance scenario", () => {
    const report = auditDenseCaptureBenchmarkManifest(manifest(), {
      fileExists: () => true,
      fileSize: () => 1_000,
      rootDir: "/repo",
    });

    expect(report).toMatchObject({ clipCount: 6, failures: [], passed: true });
    expect(report.scenarioCoverage).toEqual(Object.fromEntries(
      DENSE_CAPTURE_REQUIRED_SCENARIOS.map((scenario) => [scenario, 1]),
    ));
  });

  it("fails closed for missing clips, consent, and scenario coverage", () => {
    const invalid = manifest();
    invalid.clips = [
      { consent: { benchmarkUse: false }, id: "missing", path: "clips/missing.mp4", scenarios: [] },
    ];
    const report = auditDenseCaptureBenchmarkManifest(invalid, {
      fileExists: () => false,
      rootDir: "/repo",
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/is missing/),
      expect.stringMatching(/no explicit benchmark-use consent/),
      expect.stringMatching(/no scenario labels/),
      expect.stringMatching(/No RGB clip covers near-camera/),
    ]));
  });

  it("requires comparable measurements and complete per-clip coverage before selection", () => {
    const sourceManifest = manifest();
    const accepted = auditDenseCaptureBenchmarkResults({
      candidates: [candidate("candidate-a"), candidate("candidate-b")],
      schemaVersion: 1,
      selectedCandidateId: "candidate-a",
    }, sourceManifest);
    expect(accepted).toEqual({ candidateCount: 2, failures: [], passed: true });

    const incompleteCandidate = candidate("candidate-a");
    incompleteCandidate.clipMeasurements = [];
    incompleteCandidate.modelHash = "unverified";
    const rejected = auditDenseCaptureBenchmarkResults({
      candidates: [incompleteCandidate],
      schemaVersion: 1,
      selectedCandidateId: "unknown",
    }, sourceManifest);
    expect(rejected.passed).toBe(false);
    expect(rejected.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/at least two measured/),
      expect.stringMatching(/no model SHA-256/),
      expect.stringMatching(/no measurement for clip clip-0/),
      expect.stringMatching(/selected dense-model candidate is absent or was rejected/),
    ]));
  });

  it("preserves a measured model-load rejection without inventing inference metrics", () => {
    const sourceManifest = manifest();
    const rejectedCandidate = {
      artifactBytes: 50_000_000,
      id: "candidate-b",
      license: "reviewed-test-licence",
      modelHash: `sha256:${"b".repeat(64)}`,
      rejectionReason: "model load exceeded 90000 ms",
      runtime: "webgl",
      status: "rejected",
    };
    expect(auditDenseCaptureBenchmarkResults({
      candidates: [candidate("candidate-a"), rejectedCandidate],
      schemaVersion: 1,
      selectedCandidateId: "candidate-a",
    }, sourceManifest)).toEqual({ candidateCount: 2, failures: [], passed: true });
  });

  it("accepts honestly labelled browser semantic coverage after the device matrix passes", () => {
    const semanticCandidate = candidate("candidate-a");
    semanticCandidate.geometryCapabilities = {
      anatomicalCorrespondence: "semantic-part-lattice",
      depth: "unavailable",
      surfaceNormals: "unavailable",
    };
    const report = auditDenseCaptureBenchmarkResults({
      candidates: [semanticCandidate, candidate("candidate-b")],
      schemaVersion: 1,
      selectedCandidateId: "candidate-a",
    }, manifest());

    expect(report).toEqual({ candidateCount: 2, failures: [], passed: true });
  });

  it("refuses a server runtime or a candidate without reviewed iPad and older-laptop evidence", () => {
    const serverCandidate = candidate("candidate-a");
    serverCandidate.runtime = "server-gpu";
    serverCandidate.deviceClassMeasurements = [];
    const report = auditDenseCaptureBenchmarkResults({
      candidates: [serverCandidate, candidate("candidate-b")],
      schemaVersion: 1,
      selectedCandidateId: "candidate-a",
    }, manifest());

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/does not run in a supported client-browser runtime/),
      expect.stringMatching(/no passing reviewed ipad measurement/),
      expect.stringMatching(/no passing reviewed older-laptop measurement/),
    ]));
  });
});
