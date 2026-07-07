import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarFinalFrameOrchestrationRuntime } from "./movementAvatarFinalFrameOrchestrationRuntime";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

function retargetFrame(): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: true,
      rightFoot: true,
    },
    debug: {
      heldSegments: [],
      solvedSegments: [],
      sourceQuality: 0.8,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0,
  };
}

function trackingState(): MovementTrackingDebugState {
  return {
    bodyConfidence: {},
    fallbacks: {
      retarget: "retarget-source",
    },
    headApplied: {
      confidence: 1,
      pitch: 0,
      roll: 0,
      source: "face",
      yaw: 0,
    },
    headRaw: {
      confidence: 1,
      pitch: 0,
      roll: 0,
      source: "face",
      yaw: 0,
    },
    retarget: {
      appliedLowerBody: 0,
      appliedUpperBody: 0,
      footLockCorrection: 0,
      footLockDrift: 0,
      footLockStrength: 0,
      hipDrop: 0,
      leftFootContact: true,
      leftKneeLift: 0,
      lowerBodySegmentMotion: 0,
      plantedSquatIkDepth: 0,
      rightFootContact: true,
      rightKneeLift: 0,
      solvedSegments: 0,
      sourceQuality: 0.8,
      squatDepth: 0,
      totalLowerBody: 0,
      totalSegments: 0,
      totalUpperBody: 0,
      visualRootDrop: 0,
    },
    updatedAt: 1,
  };
}

function vrm(): VRM {
  return {
    humanoid: {
      getNormalizedBoneNode: () => null,
    },
    scene: new THREE.Object3D(),
  } as unknown as VRM;
}

describe("movementAvatarFinalFrameOrchestrationRuntime", () => {
  it("applies end-frame writes even when post-frame debug is disabled", () => {
    const expressionWrites: Array<{ name: string; value: number }> = [];
    const handBone = new THREE.Object3D();

    const result = applyMovementAvatarFinalFrameOrchestrationRuntime({
      avatarName: "Player",
      avatarRole: "player",
      blendshapes: [
        { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.2 },
      ],
      expressionManager: {
        setValue: (name, value) => {
          expressionWrites.push({ name, value });
        },
      },
      footLock: {
        correction: 0,
        drift: 0,
        strength: 0,
      },
      frameUpdatedAt: 10,
      hands: {
        left: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.2 + index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
      },
      isPlayer: true,
      lookupBone: () => handBone,
      mirrorForDisplay: false,
      retargetFrame: retargetFrame(),
      vrm: vrm(),
      zScale: 1,
    });

    expect(result.postFrameDebugRuntime).toEqual({
      applied: false,
      trackingDebugState: null,
    });
    expect(result.endFrameRuntime.appliedExpressions).toBe(2);
    expect(result.endFrameRuntime.appliedHandRotations).toBeGreaterThanOrEqual(1);
    expect(expressionWrites).toEqual([
      { name: "blinkLeft", value: 0.2 },
      { name: "happy", value: 0 },
    ]);
  });

  it("updates post-frame debug telemetry before returning end-frame results", () => {
    const trackingDebugRef = {
      current: trackingState(),
    };

    const result = applyMovementAvatarFinalFrameOrchestrationRuntime({
      avatarName: "Instructor",
      avatarRole: "instructor",
      blendshapes: null,
      expressionManager: null,
      footLock: {
        correction: 0.1,
        drift: 0.2,
        strength: 0.3,
      },
      frameUpdatedAt: 20,
      hands: null,
      isPlayer: false,
      lookupBone: () => null,
      mirrorForDisplay: false,
      retargetFrame: retargetFrame(),
      trackingDebugRef,
      vrm: vrm(),
      zScale: 0.18,
    });

    expect(result.postFrameDebugRuntime.applied).toBe(true);
    expect(trackingDebugRef.current).toBe(result.postFrameDebugRuntime.trackingDebugState);
    expect(trackingDebugRef.current?.retarget).toMatchObject({
      footLockCorrection: 0.1,
      footLockDrift: 0.2,
      footLockStrength: 0.3,
    });
    expect(result.endFrameRuntime).toEqual({
      appliedExpressions: 0,
      appliedHandRotations: 0,
    });
  });
});
