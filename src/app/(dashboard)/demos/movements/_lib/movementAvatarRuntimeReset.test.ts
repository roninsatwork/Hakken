import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  resetMovementAvatarRuntimeRefs,
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
      squatPresentationDepth: 0,
      visualRootDrop: 0,
    });
    expect(refs.instructorLowerBodyStabilityRef.current).toEqual({
      squatPresentationDepth: 0,
      visualRootDrop: 0,
    });
    expect(refs.lastGoodQuatRef.current).toEqual({});
  });
});
