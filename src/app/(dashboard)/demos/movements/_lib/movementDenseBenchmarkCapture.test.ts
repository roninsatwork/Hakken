import { describe, expect, it } from "vitest";
import {
  MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS,
  buildMovementDenseBenchmarkCaptureFilename,
  resolveMovementDenseBenchmarkCaptureFormat,
} from "./movementDenseBenchmarkCapture";

describe("movement dense benchmark capture", () => {
  it("owns all six required benchmark scenario filename labels", () => {
    expect(MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS.map(({ id }) => id)).toEqual([
      "near-camera",
      "far-camera",
      "front-back-turn",
      "floor-work",
      "body-occlusion",
      "loose-clothing",
    ]);
  });

  it("selects a supported browser format without claiming unsupported output", () => {
    expect(resolveMovementDenseBenchmarkCaptureFormat((mimeType) => mimeType.includes("vp8")))
      .toEqual({ extension: "webm", mimeType: "video/webm;codecs=vp8" });
    expect(resolveMovementDenseBenchmarkCaptureFormat(() => false)).toBeNull();
  });

  it("produces scenario-labelled filenames accepted by benchmark preparation", () => {
    expect(buildMovementDenseBenchmarkCaptureFilename({
      capturedAt: new Date("2026-07-18T09:30:45.123Z"),
      extension: "webm",
      scenario: "body-occlusion",
    })).toBe("body-occlusion-2026-07-18T09-30-45Z.webm");
  });
});
