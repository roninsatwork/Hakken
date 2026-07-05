import { describe, expect, it } from "vitest";
import { resolveMovementAvatarRetargetSourceRuntimeModel } from "./movementAvatarRetargetSourceRuntime";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function corePose(): TrackingLandmark[] {
  const pose = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  pose[0] = { x: 0.5, y: 0.12, z: 0, visibility: 0.95 };
  pose[11] = { x: 0.38, y: 0.3, z: 0, visibility: 0.95 };
  pose[12] = { x: 0.62, y: 0.3, z: 0, visibility: 0.95 };
  pose[23] = { x: 0.42, y: 0.55, z: 0, visibility: 0.95 };
  pose[24] = { x: 0.58, y: 0.55, z: 0, visibility: 0.95 };
  pose[25] = { x: 0.42, y: 0.72, z: 0, visibility: 0.9 };
  pose[26] = { x: 0.58, y: 0.72, z: 0, visibility: 0.9 };
  pose[27] = { x: 0.42, y: 0.92, z: 0, visibility: 0.9 };
  pose[28] = { x: 0.58, y: 0.92, z: 0, visibility: 0.9 };
  pose[29] = { x: 0.41, y: 0.94, z: 0.02, visibility: 0.9 };
  pose[30] = { x: 0.59, y: 0.94, z: 0.02, visibility: 0.9 };
  pose[31] = { x: 0.41, y: 0.96, z: 0, visibility: 0.9 };
  pose[32] = { x: 0.59, y: 0.96, z: 0, visibility: 0.9 };
  return pose;
}

function sourceModel(now = 100): MovementRetargetSourceModel {
  const model = buildMovementRetargetSourceModel({
    now,
    poseLandmarks: corePose(),
  });

  if (!model) {
    throw new Error("Expected test pose to produce a retarget source model.");
  }

  return model;
}

describe("movementAvatarRetargetSourceRuntime", () => {
  it("uses a provided recorded/replay model before cached or live fallback models", () => {
    const providedModel = sourceModel(200);
    const cachedModel = sourceModel(100);

    const result = resolveMovementAvatarRetargetSourceRuntimeModel({
      currentModel: cachedModel,
      poseLandmarks: corePose(),
      providedModel,
    });

    expect(result).toBe(providedModel);
  });

  it("keeps the cached runtime model when no provided model exists", () => {
    const cachedModel = sourceModel(100);

    const result = resolveMovementAvatarRetargetSourceRuntimeModel({
      currentModel: cachedModel,
      poseLandmarks: corePose(),
      providedModel: null,
    });

    expect(result).toBe(cachedModel);
  });

  it("builds a live fallback model only when no provided or cached model exists", () => {
    const result = resolveMovementAvatarRetargetSourceRuntimeModel({
      currentModel: null,
      now: 300,
      poseLandmarks: corePose(),
      providedModel: null,
    });

    expect(result?.calibratedAt).toBe(300);
    expect(result?.quality).toBeGreaterThan(0.55);
  });
});
