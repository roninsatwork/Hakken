import { describe, expect, it } from "vitest";
import {
  MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
  createMovementDenseCaptureQualityState,
  resolveInitialMovementDenseCaptureQualityTier,
  updateMovementDenseCaptureQualityState,
} from "./movementDenseCaptureQuality";

describe("movement dense capture browser quality tiers", () => {
  it("starts iPads and low-powered laptops conservatively", () => {
    expect(resolveInitialMovementDenseCaptureQualityTier({
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      isIpad: true,
    })).toBe("low");
    expect(resolveInitialMovementDenseCaptureQualityTier({
      deviceMemoryGb: 4,
      hardwareConcurrency: 4,
      isIpad: false,
    })).toBe("low");
    expect(resolveInitialMovementDenseCaptureQualityTier({
      deviceMemoryGb: null,
      hardwareConcurrency: 8,
      isIpad: false,
    })).toBe("medium");
  });

  it("uses smaller inputs and a slower dense cadence without changing other capture channels", () => {
    expect(MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES.high).toMatchObject({
      inputHeight: 540,
      inputWidth: 960,
      targetIntervalMs: 100,
    });
    expect(MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES.low).toMatchObject({
      inputHeight: 216,
      inputWidth: 384,
      targetIntervalMs: 300,
    });
  });

  it("promotes only after sustained fast inference", () => {
    let state = createMovementDenseCaptureQualityState("low");
    for (let sample = 0; sample < 4; sample += 1) {
      state = updateMovementDenseCaptureQualityState(state, 40);
    }
    expect(state.qualityTier).toBe("low");
    state = updateMovementDenseCaptureQualityState(state, 40);
    expect(state).toEqual(createMovementDenseCaptureQualityState("medium"));
  });

  it("demotes after repeated slow inference and avoids one-sample oscillation", () => {
    let state = createMovementDenseCaptureQualityState("high");
    state = updateMovementDenseCaptureQualityState(state, 110);
    expect(state.qualityTier).toBe("high");
    state = updateMovementDenseCaptureQualityState(state, 110);
    expect(state).toEqual(createMovementDenseCaptureQualityState("medium"));
  });
});
