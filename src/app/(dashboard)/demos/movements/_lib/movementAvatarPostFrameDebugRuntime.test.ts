import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MovementAvatarRetargetDebugRegistryWindow } from "./movementAvatarDebugTelemetry";
import { applyMovementAvatarPostFrameDebugRuntime } from "./movementAvatarPostFrameDebugRuntime";
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

describe("movementAvatarPostFrameDebugRuntime", () => {
  it("skips when there is no tracking debug ref", () => {
    const result = applyMovementAvatarPostFrameDebugRuntime({
      avatarName: "Player",
      avatarRole: "player",
      footLock: {
        correction: 0.1,
        drift: 0.2,
        strength: 0.3,
      },
      frameUpdatedAt: 10,
      retargetFrame: retargetFrame(),
      vrm: vrm(),
      zScale: 1,
    });

    expect(result).toEqual({
      applied: false,
      trackingDebugState: null,
    });
  });

  it("updates the tracking debug ref and retarget registry when state is available", () => {
    const trackingDebugRef = {
      current: trackingState(),
    };
    const registryWindow = {} as Window & MovementAvatarRetargetDebugRegistryWindow;

    const result = applyMovementAvatarPostFrameDebugRuntime({
      avatarName: "Player",
      avatarRole: "player",
      footLock: {
        correction: 0.1,
        drift: 0.2,
        strength: 0.3,
      },
      frameUpdatedAt: 10,
      registryWindow,
      retargetFrame: retargetFrame(),
      trackingDebugRef,
      vrm: vrm(),
      zScale: 1,
    });

    expect(result.applied).toBe(true);
    expect(trackingDebugRef.current).toBe(result.trackingDebugState);
    expect(trackingDebugRef.current?.avatarVisual).toMatchObject({
      comparedLowerBodySegments: 0,
      segments: {},
    });
    expect(trackingDebugRef.current?.retarget).toMatchObject({
      footLockCorrection: 0.1,
      footLockDrift: 0.2,
      footLockStrength: 0.3,
    });
    expect(registryWindow.__sonaeMovementRetargetDebug).toMatchObject({
      player: {
        avatarName: "Player",
        frameUpdatedAt: 10,
      },
    });
  });
});
