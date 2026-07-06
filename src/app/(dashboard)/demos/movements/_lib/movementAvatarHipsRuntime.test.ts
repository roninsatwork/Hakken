import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyMovementAvatarHipsRuntimeToBone,
  resolveMovementAvatarHipsRuntimePosition,
} from "./movementAvatarHipsRuntime";
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

  it("captures the base hips position and writes the resolved hips Y to the bone", () => {
    const hipsNode = {
      position: new THREE.Vector3(0, 1, 0),
    };
    const application = applyMovementAvatarHipsRuntimeToBone({
      baseHipsPosition: null,
      floorY: -2.75,
      hipsApplication: {
        shouldApplyFloorContactCorrection: false,
        shouldApplySquatDrop: true,
        squatDrop: 0.4,
      },
      hipsNode,
      hipsPositionOptions,
      lowestFootY: null,
    });

    expect(application.applied).toBe(true);
    expect(application.nextBaseHipsPosition?.y).toBe(1);
    expect(application.positionDecision?.nextHipsY).toBeCloseTo(0.8);
    expect(hipsNode.position.y).toBeCloseTo(0.8);
  });

  it("skips hips writeback when the bone is unavailable", () => {
    const baseHipsPosition = new THREE.Vector3(0, 1, 0);
    const application = applyMovementAvatarHipsRuntimeToBone({
      baseHipsPosition,
      floorY: -2.75,
      hipsApplication: neutralHipsApplication,
      hipsNode: null,
      hipsPositionOptions,
      lowestFootY: null,
    });

    expect(application).toEqual({
      applied: false,
      nextBaseHipsPosition: baseHipsPosition,
      positionDecision: null,
    });
  });
});
