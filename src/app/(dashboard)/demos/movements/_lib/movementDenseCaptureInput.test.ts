import { describe, expect, it } from "vitest";
import { resolveMovementDenseCaptureContainRect } from "./movementDenseCaptureInput";

describe("dense capture input", () => {
  it("preserves a 4:3 camera frame inside the 16:9 model input", () => {
    expect(resolveMovementDenseCaptureContainRect({
      inputHeight: 360,
      inputWidth: 640,
      sourceHeight: 960,
      sourceWidth: 1280,
    })).toEqual({ height: 360, width: 480, x: 80, y: 0 });
  });

  it("fills the input when the camera and model aspect ratios match", () => {
    expect(resolveMovementDenseCaptureContainRect({
      inputHeight: 540,
      inputWidth: 960,
      sourceHeight: 1080,
      sourceWidth: 1920,
    })).toEqual({ height: 540, width: 960, x: 0, y: 0 });
  });

  it("rejects missing camera dimensions instead of drawing an invented frame", () => {
    expect(resolveMovementDenseCaptureContainRect({
      inputHeight: 360,
      inputWidth: 640,
      sourceHeight: 0,
      sourceWidth: 0,
    })).toBeNull();
  });
});
