import { describe, expect, it } from "vitest";
import { resolveMovementAvatarHipsRuntimePosition } from "./movementAvatarHipsRuntime";
import type {
  MovementAvatarHipsApplicationDecision,
  MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";

const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
  avatarRootVisualLerp: 0.28,
  floorContactCorrectionScale: 0.7,
  rootLerp: 0.5,
  shouldUseCalibratedFloorCorrection: true,
  squatHipDropLimit: 0.88,
  squatHipDropScale: 0.78,
};

const neutralHipsApplication: MovementAvatarHipsApplicationDecision = {
  shouldApplyFloorContactCorrection: false,
  shouldApplySquatDrop: false,
  squatDrop: 0,
};

describe("movementAvatarHipsRuntime", () => {
  it("eases hips toward the squat-drop target", () => {
    const decision = resolveMovementAvatarHipsRuntimePosition({
      baseHipsY: 1,
      currentHipsY: 1,
      floorY: -2.75,
      hipsApplication: {
        shouldApplyFloorContactCorrection: false,
        shouldApplySquatDrop: true,
        squatDrop: 0.4,
      },
      hipsPositionOptions,
      lowestFootY: null,
    });

    expect(decision.squatTargetY).toBeCloseTo(0.6);
    expect(decision.nextHipsY).toBeCloseTo(0.8);
    expect(decision.floorContactCorrection).toBe(0);
  });

  it("keeps hips moving toward neutral when no lower-body drop is active", () => {
    const decision = resolveMovementAvatarHipsRuntimePosition({
      baseHipsY: 1,
      currentHipsY: 0.6,
      floorY: -2.75,
      hipsApplication: neutralHipsApplication,
      hipsPositionOptions,
      lowestFootY: -3,
    });

    expect(decision.squatTargetY).toBe(1);
    expect(decision.nextHipsY).toBeCloseTo(0.8);
    expect(decision.floorContactCorrection).toBe(0);
  });

  it("applies clamped floor-contact correction after the root lerp", () => {
    const decision = resolveMovementAvatarHipsRuntimePosition({
      baseHipsY: 1,
      currentHipsY: 1,
      floorY: -2.75,
      hipsApplication: {
        shouldApplyFloorContactCorrection: true,
        shouldApplySquatDrop: false,
        squatDrop: 0,
      },
      hipsPositionOptions,
      lowestFootY: -5,
    });

    expect(decision.floorContactCorrection).toBeCloseTo(0.18 * 0.7);
    expect(decision.nextHipsY).toBeCloseTo(1 + 0.18 * 0.7);
  });
});
