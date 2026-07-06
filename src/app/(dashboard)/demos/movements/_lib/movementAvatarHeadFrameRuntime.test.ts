import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarHeadFrameRuntime } from "./movementAvatarHeadFrameRuntime";
import type { MovementAvatarHeadFrameDebugInput } from "./movementAvatarHeadFrameRuntime";
import type {
  MovementCalibration,
  MovementHeadMotionIntent,
  TrackingLandmark,
} from "./movementTrackingCalibration";

const neutralHeadIntent: MovementHeadMotionIntent = {
  confidence: 0.9,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

const neutralCalibration: MovementCalibration = {
  calibratedAt: 1,
  floorY: 0.96,
  headCenter: { x: 0.5, y: 0.28, z: 0 },
  headNeutral: {
    confidence: 0.95,
    pitch: 0,
    roll: 0,
    source: "face",
    yaw: 0,
  },
  hipCenter: { x: 0.5, y: 0.66, z: 0 },
  quality: 0.95,
  shoulderCenter: { x: 0.5, y: 0.42, z: 0 },
  shoulderWidth: 0.22,
  torsoHeight: 0.24,
};

function poseLandmarks(): TrackingLandmark[] {
  const pose = Array.from({ length: 33 }, (_, index) => ({
    visibility: 0.9,
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
  }));
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  return pose;
}

function debugInput(): MovementAvatarHeadFrameDebugInput {
  return {
    activeCalibrationQuality: 0.88,
    activeSpineDrive: {
      confidence: 0.8,
      forwardLean: 0.1,
      owner: "player-spine-model",
      sideBend: 0.2,
      twist: -0.1,
    } as MovementAvatarHeadFrameDebugInput["activeSpineDrive"],
    armTargets: {
      left: {
        elbowTarget: null,
        frontBias: 0,
        wristSource: "left-wrist",
        wristTarget: null,
      },
      right: {
        elbowTarget: null,
        frontBias: 0,
        wristSource: "right-wrist",
        wristTarget: null,
      },
    },
    autoCalibrationKind: "upright",
    avatarRole: "player",
    bodyConfidence: {
      leftFoot: 0.9,
      rightFoot: 0.9,
    },
    exercisePose: { label: "standing", status: "ready" } as unknown as MovementAvatarHeadFrameDebugInput["exercisePose"],
    exerciseTransition: { label: "stable" } as MovementAvatarHeadFrameDebugInput["exerciseTransition"],
    feetOwner: "player-feet",
    footLock: {
      correction: 0.12,
      drift: 0.34,
      state: {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0.56,
      },
    },
    hasActiveCalibration: true,
    hasManualCalibration: false,
    leftArmTrackingReady: true,
    leftFootSource: "left-foot-live",
    leftKneeSource: "left-knee-live",
    legRaise: {
      holdDecision: {
        lowerBodyDrive: {
          playerLegRaiseDepth: 0.34,
          playerLegRaiseSide: "left",
        },
        state: {
          depth: 0.34,
          expiresAt: 1250,
          side: "left",
        },
        wasHeld: true,
      } as MovementAvatarHeadFrameDebugInput["legRaise"]["holdDecision"],
      lowerBodyDrive: {
        playerLegRaiseDepth: 0.34,
        playerLegRaiseSide: "left",
      } as MovementAvatarHeadFrameDebugInput["legRaise"]["lowerBodyDrive"],
      lowerBodyIntent: {
        confidence: 1,
        label: "left-knee-raise",
        leftKneeRaise: 0.45,
        rightKneeRaise: 0.12,
        squatDepth: 0.2,
        squatSignals: {
          headDrop: 0,
          hipDrop: 0.11,
          kneeBend: 0.22,
          torsoDrop: 0.33,
        },
      },
      now: 1000,
      playerLegRaiseHoldState: {
        depth: 0.34,
        expiresAt: 1250,
        side: "left",
      },
    },
    lowerBodyIntent: {
      confidence: 1,
      label: "left-knee-raise",
      leftKneeRaise: 0.45,
      rightKneeRaise: 0.12,
      squatDepth: 0.2,
      squatSignals: {
        headDrop: 0,
        hipDrop: 0.11,
        kneeBend: 0.22,
        torsoDrop: 0.33,
      },
    },
    lowerBodyOwner: "player-left-leg-raise",
    lowerBodyTrackingReady: true,
    motionFrameInputOwner: "movement-motion-frame",
    orientation: {
      orientation: "front",
      status: "ready",
    },
    profileName: "default",
    retarget: {
      appliedLowerBody: 4,
      appliedUpperBody: 3,
      liveSquatDepth: 0.42,
      plantedSquatIkDepth: 0.22,
      retargetFrame: {
        contacts: {
          leftFoot: true,
          rightFoot: true,
        },
        debug: {
          heldSegments: [],
          solvedSegments: ["leftThigh", "rightUpperArm"],
          sourceQuality: 0.88,
        },
        hipDrop: 0.18,
        kneeLift: {
          left: 0.45,
          right: 0.12,
        },
        segments: {},
        squatDepth: 0.51,
      },
      retargetSourceModel: null,
      visualRootDrop: 0.2,
    },
    rightArmTrackingReady: true,
    rightFootSource: "right-foot-live",
    rightKneeSource: "right-knee-live",
    shouldApplyLowerBody: true,
    support: {
      supportLabel: "standing",
    },
    supportConstraint: { owner: "support", status: "active" } as MovementAvatarHeadFrameDebugInput["supportConstraint"],
    supportContact: {
      anchorCount: 2,
      correction: 0.12345,
      owner: "support-contact",
    },
    supportIntent: { label: "stand", status: "ready" } as unknown as MovementAvatarHeadFrameDebugInput["supportIntent"],
    supportPresentation: {
      owner: "support-presentation",
    },
    torsoOwner: "torso-live",
  };
}

describe("movementAvatarHeadFrameRuntime", () => {
  it("returns neutral frame debug output when the head runtime cannot apply", () => {
    const result = applyMovementAvatarHeadFrameRuntime({
      debugInput: debugInput(),
      debugUpdatedAt: 1000,
      headInput: {
        avatarRole: "player",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        lookupBone: () => null,
        neckSlerp: 0.25,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      },
    });

    expect(result.headRuntimeApplication).toEqual({
      applied: false,
      reason: "missing-head-bone",
    });
    expect(result.nextBaseHeadPosition).toBeNull();
    expect(result.trackingDebugState).toBeNull();
  });

  it("applies head runtime and builds tracking debug state when requested", () => {
    const parent = new THREE.Object3D();
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const upperChest = new THREE.Object3D();
    head.position.set(0.1, 0.2, 0.3);
    parent.add(head);
    parent.add(neck);
    parent.add(upperChest);
    parent.updateMatrixWorld(true);
    const bones = new Map<string, THREE.Object3D>([
      ["head", head],
      ["neck", neck],
      ["upperChest", upperChest],
    ]);

    const result = applyMovementAvatarHeadFrameRuntime({
      debugInput: debugInput(),
      debugUpdatedAt: 1000,
      headInput: {
        avatarRole: "player",
        avatarRootYaw: Math.PI / 4,
        baseHeadPosition: null,
        calibration: neutralCalibration,
        headMotionIntent: {
          ...neutralHeadIntent,
          vertical: 0.7,
        },
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      },
    });

    expect(result.headRuntimeApplication.applied).toBe(true);
    expect(result.nextBaseHeadPosition).toEqual(new THREE.Vector3(0.1, 0.2, 0.3));
    expect(result.trackingDebugState).toMatchObject({
      fallbacks: {
        owners: expect.stringContaining("head"),
      },
      profileName: "default",
      updatedAt: 1000,
    });
  });
});
