import { describe, expect, it } from "vitest";
import { prepareDenseCaptureBenchmarkManifest } from "./prepare-dense-capture-benchmark.mjs";

const completeFiles = [
  "near-camera-hands.mp4",
  "far-camera-full-body.mp4",
  "front-back-turn.mp4",
  "floor-work.mov",
  "body-occlusion.webm",
  "loose-clothing.m4v",
];

describe("prepare dense capture benchmark", () => {
  it("creates a deterministic consented manifest from scenario-labelled RGB clips", () => {
    const report = prepareDenseCaptureBenchmarkManifest({
      clipsDir: "/repo/tmp/clips",
      confirmBenchmarkConsent: true,
      files: completeFiles,
      rootDir: "/repo",
    });

    expect(report).toMatchObject({ failures: [], passed: true });
    expect(report.manifest.clips).toHaveLength(6);
    expect(report.manifest.clips[0]).toMatchObject({
      consent: { benchmarkUse: true },
      path: "tmp/clips/body-occlusion.webm",
      scenarios: ["body-occlusion"],
    });
  });

  it("refuses to create a raw-video manifest without explicit consent", () => {
    const report = prepareDenseCaptureBenchmarkManifest({
      clipsDir: "/repo/tmp/clips",
      files: completeFiles,
      rootDir: "/repo",
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toContain(
      "Explicit --confirm-benchmark-consent is required before preparing an RGB benchmark manifest.",
    );
    expect(report.manifest.clips.every((clip) => clip.consent.benchmarkUse === false)).toBe(true);
  });

  it("lists exact missing and unrecognised scenarios", () => {
    const report = prepareDenseCaptureBenchmarkManifest({
      clipsDir: "/repo/tmp/clips",
      confirmBenchmarkConsent: true,
      files: ["random-motion.mp4", "notes.txt"],
      rootDir: "/repo",
    });

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/random-motion.mp4 has no recognised scenario label/),
      "Benchmark pack is missing a near-camera clip.",
      "Benchmark pack is missing a loose-clothing clip.",
    ]));
  });
});
