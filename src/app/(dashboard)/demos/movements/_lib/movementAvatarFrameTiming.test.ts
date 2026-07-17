import { describe, expect, it } from "vitest";
import {
  movementAvatarApplicationDeltaSeconds,
  movementAvatarFrameRateAdjustedAngleStep,
  movementAvatarFrameRateAdjustedSlerp,
  movementAvatarSourceAwareApplicationDeltaSeconds,
} from "./movementAvatarFrameTiming";

describe("movement avatar frame timing", () => {
  it("preserves the established application at 60 fps", () => {
    expect(movementAvatarFrameRateAdjustedAngleStep(0.06, 1 / 60)).toBeCloseTo(0.06, 8);
    expect(movementAvatarFrameRateAdjustedSlerp(0.76, 1 / 60)).toBeCloseTo(0.76, 8);
  });

  it("gives a low-rate render the equivalent elapsed-time application budget", () => {
    expect(movementAvatarFrameRateAdjustedAngleStep(0.06, 1 / 20)).toBeCloseTo(0.18, 8);
    expect(movementAvatarFrameRateAdjustedSlerp(0.76, 1 / 20)).toBeCloseTo(0.986176, 6);
  });

  it("caps tab-resume deltas before they can create a giant pose jump", () => {
    expect(movementAvatarApplicationDeltaSeconds(2)).toBe(0.1);
    expect(movementAvatarFrameRateAdjustedAngleStep(0.06, 2)).toBeCloseTo(0.36, 8);
  });

  it("uses the 60 fps contract for invalid or missing deltas", () => {
    expect(movementAvatarFrameRateAdjustedAngleStep(0.06, undefined)).toBeCloseTo(0.06, 8);
    expect(movementAvatarFrameRateAdjustedSlerp(0.76, Number.NaN)).toBeCloseTo(0.76, 8);
  });

  it("budgets final application for sequential source time skipped between renders", () => {
    expect(movementAvatarSourceAwareApplicationDeltaSeconds({
      currentSourceCapturedAt: 1120,
      previousSourceCapturedAt: 1000,
      renderDeltaSeconds: 1 / 30,
    })).toBe(0.1);
  });

  it("keeps valid source time authoritative when rendering is slower", () => {
    expect(movementAvatarSourceAwareApplicationDeltaSeconds({
      currentSourceCapturedAt: 1027,
      previousSourceCapturedAt: 1000,
      renderDeltaSeconds: 0.1,
    })).toBeCloseTo(0.027, 8);
  });

  it("falls back to render time when source time repeats or seeks backward", () => {
    expect(movementAvatarSourceAwareApplicationDeltaSeconds({
      currentSourceCapturedAt: 900,
      previousSourceCapturedAt: 1000,
      renderDeltaSeconds: 1 / 30,
    })).toBeCloseTo(1 / 30, 8);
  });
});
