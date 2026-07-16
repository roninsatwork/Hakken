import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  consumeMovementAvatarRuntimeFrameJumpReset,
  resetMovementAvatarRuntimeForFrameJump,
  resetMovementAvatarRuntimeRefs,
  shouldResetMovementAvatarRuntimeForFrameSeek,
  type MovementAvatarRuntimeResetRefs,
} from "./movementAvatarRuntimeReset";

function ref<T>(current: T) {
  return { current };
}

function buildRefs(): MovementAvatarRuntimeResetRefs {
  return {
    baseBonePositionRef: ref({ head: new THREE.Vector3(1, 2, 3) }),
    baseHipsPositionRef: ref(new THREE.Vector3(1, 1, 1)),
    exerciseTransitionStateRef: ref({
      previousPose: null,
    }),
    instructorLowerBodyStabilityRef: ref({
      squatPresentationDepth: 0.4,
      visualRootDrop: 0.2,
    }),
    lastGoodQuatRef: ref({ spine: new THREE.Quaternion() }),
    liveRootMotionHistoryRef: ref([
      {
        pose: [],
      },
    ]),
    plantedFootLockRef: ref({
      correction: new THREE.Vector3(1, 0, 0),
      left: new THREE.Vector3(),
      right: new THREE.Vector3(),
      strength: 1,
    }),
    playerLegRaiseHoldRef: ref({
      depth: 0.4,
      expiresAt: 20,
      side: "left" as const,
    }),
    playerLowerBodyStabilityRef: ref({
      squatPresentationDepth: 0.6,
      visualRootDrop: 0.3,
    }),
    retargetAvatarRestRef: ref({
      spine: {
        worldDirection: new THREE.Vector3(0, 1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    }),
    rigMeasurementsRef: ref<MovementAvatarRuntimeResetRefs["rigMeasurementsRef"]["current"]>({
      armLength: 0.5,
      hipHeight: 0.9,
      legLength: 0.8,
      torsoLength: 0.6,
    }),
    retargetSourceModelRef: ref({
      calibratedAt: 1,
      floorY: 0,
      hipCenter: { x: 0, y: 0, z: 0 },
      neutralKneeLift: {
        left: 0,
        right: 0,
      },
      quality: 1,
      segments: {},
      shoulderCenter: { x: 0, y: 1, z: 0 },
      torsoHeight: 1,
    }),
    setupStateRef: ref({
      autoCalibration: {
        calibration: {
          calibratedAt: 1,
          floorY: 0,
          headNeutral: {
            confidence: 1,
            pitch: 0,
            roll: 0,
            source: "pose",
            yaw: 0,
          },
          hipCenter: { x: 0, y: 0, z: 0 },
          quality: 1,
          shoulderCenter: { x: 0, y: 0, z: 0 },
          shoulderWidth: 1,
          torsoHeight: 1,
        },
        kind: "full-body",
        samples: [],
      },
    }),
  };
}

describe("movementAvatarRuntimeReset", () => {
  it("preserves temporal continuity for adjacent Replay frames", () => {
    expect(shouldResetMovementAvatarRuntimeForFrameSeek({
      nextFrameIndex: 281,
      previousFrameIndex: 280,
    })).toBe(false);
    expect(shouldResetMovementAvatarRuntimeForFrameSeek({
      nextFrameIndex: 280,
      previousFrameIndex: 281,
    })).toBe(false);
    expect(shouldResetMovementAvatarRuntimeForFrameSeek({
      nextFrameIndex: 281,
      previousFrameIndex: null,
    })).toBe(false);
  });

  it("clears temporal history for discontinuous Replay seeks", () => {
    expect(shouldResetMovementAvatarRuntimeForFrameSeek({
      nextFrameIndex: 281,
      previousFrameIndex: 12,
    })).toBe(true);
  });

  it("clears temporal frame-jump state without resetting the visible rig", () => {
    const refs = buildRefs();
    const resetNormalizedPose = vi.fn();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn(() => null),
        resetNormalizedPose,
      },
      scene: {
        updateMatrixWorld: vi.fn(),
      },
    } as unknown as VRM;

    resetMovementAvatarRuntimeForFrameJump({ refs, vrm });

    expect(resetNormalizedPose).not.toHaveBeenCalled();
    expect(refs.baseHipsPositionRef.current).toEqual(new THREE.Vector3(1, 1, 1));
    expect(refs.baseBonePositionRef.current).toHaveProperty("head");
    expect(refs.retargetSourceModelRef.current).not.toBeNull();
    expect(refs.rigMeasurementsRef.current).not.toBeNull();
    expect(refs.setupStateRef.current.autoCalibration.calibration).not.toBeNull();
    expect(refs.liveRootMotionHistoryRef.current).toEqual([]);
    expect(refs.plantedFootLockRef.current).toMatchObject({
      left: null,
      right: null,
      strength: 0,
    });
    expect(refs.lastGoodQuatRef.current).toEqual({});
  });

  it("consumes a queued frame jump once when the new pose is ready to apply", () => {
    const refs = buildRefs();
    const pendingResetRef = ref(true);
    const resetNormalizedPose = vi.fn();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn(() => null),
        resetNormalizedPose,
      },
      scene: {
        updateMatrixWorld: vi.fn(),
      },
    } as unknown as VRM;

    expect(consumeMovementAvatarRuntimeFrameJumpReset({ pendingResetRef, refs, vrm })).toBe(true);
    expect(pendingResetRef.current).toBe(false);
    expect(resetNormalizedPose).not.toHaveBeenCalled();
    expect(consumeMovementAvatarRuntimeFrameJumpReset({ pendingResetRef, refs, vrm })).toBe(false);
    expect(resetNormalizedPose).not.toHaveBeenCalled();
  });

  it("resets avatar runtime refs when a new VRM is loaded", () => {
    const refs = buildRefs();
    const updateMatrixWorld = vi.fn();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: vi.fn(() => null),
      },
      scene: {
        updateMatrixWorld,
      },
    } as unknown as VRM;

    resetMovementAvatarRuntimeRefs({ refs, vrm });

    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    expect(refs.baseHipsPositionRef.current).toBeNull();
    expect(refs.rigMeasurementsRef.current).toBeNull();
    expect(refs.baseBonePositionRef.current).toEqual({});
    expect(refs.setupStateRef.current.autoCalibration).toEqual({
      calibration: null,
      kind: null,
      samples: [],
    });
    expect(refs.retargetAvatarRestRef.current).toEqual({});
    expect(refs.retargetSourceModelRef.current).toBeNull();
    expect(refs.liveRootMotionHistoryRef.current).toEqual([]);
    expect(refs.exerciseTransitionStateRef.current).toEqual({
      previousPose: null,
    });
    expect(refs.playerLegRaiseHoldRef.current).toEqual({
      depth: 0,
      expiresAt: 0,
      side: null,
    });
    expect(refs.plantedFootLockRef.current).toMatchObject({
      left: null,
      right: null,
      strength: 0,
    });
    expect(refs.playerLowerBodyStabilityRef.current).toEqual({
      hasEstablishedLegRetarget: false,
      squatPresentationDepth: 0,
      visualRootDrop: 0,
    });
    expect(refs.instructorLowerBodyStabilityRef.current).toEqual({
      hasEstablishedLegRetarget: false,
      squatPresentationDepth: 0,
      visualRootDrop: 0,
    });
    expect(refs.lastGoodQuatRef.current).toEqual({});
  });
});
