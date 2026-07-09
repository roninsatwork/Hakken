import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarLowerBodyFrameOrchestrationRuntime } from "./movementAvatarLowerBodyFrameOrchestrationRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarRetargetFrameRuntimeAdapters } from "./movementAvatarRetargetFrameRuntime";
import type { MovementRetargetFrame } from "./movementRetargeting";

function lowerBodyDrive(): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "neutral",
    playerSquatPresentationDepth: 0,
    shouldApplyLowerBody: false,
    shouldApplySolverTorso: false,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    visualRootDrop: 0,
  };
}

function retargetFrame(): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: false,
      rightFoot: false,
    },
    debug: {
      heldSegments: [],
      solvedSegments: [],
      sourceQuality: 0,
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

describe("movementAvatarLowerBodyFrameOrchestrationRuntime", () => {
  it("applies lower-body runtime and writes the retarget rest-map ref", () => {
    const nextRestMap = {
      rightUpperLeg: {
        worldDirection: new THREE.Vector3(0, -1, 0),
        worldQuaternion: new THREE.Quaternion(),
      },
    };
    const adapters: MovementAvatarRetargetFrameRuntimeAdapters = {
      applyPlantedSquatIk: () => 0,
      applyRetargetMappings: () => ({
        applied: 0,
        arms: 0,
        feet: 0,
        legs: 0,
        restMap: nextRestMap,
        spine: 0,
      }),
      getRestMap: () => nextRestMap,
    };
    const lastGoodQuaternionRef = {
      current: {} as Record<string, THREE.Quaternion>,
    };
    const retargetAvatarRestRef = {
      current: {},
    };

    const result = applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      boneEaseOptions: {
        lowerBodyNeutralSlerp: 0.2,
        singleLegRaiseSlerp: 0.2,
        solvedLowerBodySlerp: 0.2,
        squatFlexionSlerp: 0.2,
      },
      currentFeetOwner: "neutral",
      currentLowerBodyOwner: "neutral",
      instructorSquatPresentationDepth: 0,
      lastGoodQuaternionRef,
      lookupBone: () => null,
      lowerBodyDrive: lowerBodyDrive(),
      lowerBodySegmentMotion: 0,
      lowerBodyTarget: {} as never,
      lowerBodyTrackingReady: false,
      playerRetargetLowerBodyMotion: 0,
      playerSquatPresentationDepth: 0,
      profile: undefined,
      recordedLowerBodySourceReliable: false,
      retargetAvatarRestRef,
      retargetFrame: retargetFrame(),
      retargetFrameRuntimeAdapters: adapters,
      scene: new THREE.Object3D(),
      shouldApplyLowerBody: false,
      shouldHoldPlayerSquatPose: false,
      solvedLowerBodySources: {
        LeftLowerLeg: undefined,
        LeftUpperLeg: undefined,
        RightLowerLeg: undefined,
        RightUpperLeg: undefined,
      },
      squatFlexionBendBoost: 1,
    });

    expect(result.lowerBodyFrameRuntime.retargetAppliedLowerBody).toBe(0);
    expect(result.lowerBodyOwner).toBe(result.lowerBodyFrameRuntime.lowerBodyOwner);
    expect(result.footOwner).toBe(result.lowerBodyFrameRuntime.footOwner);
    expect(retargetAvatarRestRef.current).toBe(nextRestMap);
  });
});
