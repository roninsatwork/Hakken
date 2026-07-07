import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarHeadFrameDebugRuntime,
  type MovementAvatarHeadFrameDebugRuntimeInput,
} from "./movementAvatarHeadFrameDebugRuntime";

function input(
  overrides: Partial<MovementAvatarHeadFrameDebugRuntimeInput> = {},
): MovementAvatarHeadFrameDebugRuntimeInput {
  const lowerBodyIntent = {
    confidence: 0.8,
    label: "left-knee-raise",
    leftKneeRaise: 0.4,
    rightKneeRaise: 0.1,
    squatDepth: 0.2,
    squatSignals: {
      headDrop: 0,
      hipDrop: 0.1,
      kneeBend: 0.2,
      torsoDrop: 0.3,
    },
  } as MovementAvatarHeadFrameDebugRuntimeInput["lowerBodyIntent"];

  return {
    activeCalibrationQuality: 0.9,
    activeSpineDrive: {
      confidence: 0.8,
      forwardLean: 0.1,
      owner: "player-spine-model",
      sideBend: 0.2,
      twist: -0.1,
    } as MovementAvatarHeadFrameDebugRuntimeInput["activeSpineDrive"],
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
      leftFoot: 0.8,
      rightFoot: 0.9,
    },
    exercisePose: { label: "standing", status: "ready" } as unknown as MovementAvatarHeadFrameDebugRuntimeInput["exercisePose"],
    exerciseTransition: { label: "stable" } as MovementAvatarHeadFrameDebugRuntimeInput["exerciseTransition"],
    footLockCorrection: 0.12,
    footLockDrift: 0.34,
    footLockState: {
      correction: new THREE.Vector3(1, 2, 3),
      left: null,
      right: null,
      strength: 0.56,
    },
    footOwner: "player-feet",
    hasActiveCalibration: true,
    hasManualCalibration: false,
    isEnabled: true,
    leftArmTrackingReady: true,
    leftFootSource: "left-foot-live",
    leftKneeSource: "left-knee-live",
    legRaiseHoldDecision: {
      lowerBodyDrive: {
        playerLegRaiseDepth: 0.4,
        playerLegRaiseSide: "left",
      },
      state: {
        depth: 0.4,
        expiresAt: 1250,
        side: "left",
      },
      wasHeld: true,
    } as MovementAvatarHeadFrameDebugRuntimeInput["legRaiseHoldDecision"],
    liveSquatDepth: 0.42,
    lowerBodyDrive: {
      playerLegRaiseDepth: 0.4,
      playerLegRaiseSide: "left",
    } as MovementAvatarHeadFrameDebugRuntimeInput["lowerBodyDrive"],
    lowerBodyIntent,
    lowerBodyOwner: "player-left-leg-raise",
    lowerBodyTrackingReady: true,
    motionFrameInputOwner: "movement-motion-frame",
    now: 1000,
    orientation: {
      orientation: "front",
      status: "ready",
    },
    plantedSquatIkDepth: 0.22,
    playerLegRaiseHoldState: {
      depth: 0.4,
      expiresAt: 1250,
      side: "left",
    },
    profileName: "default",
    retargetAppliedLowerBody: 4,
    retargetAppliedUpperBody: 3,
    retargetFrame: {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: ["leftThigh"],
        sourceQuality: 0.88,
      },
      hipDrop: 0.18,
      kneeLift: {
        left: 0.4,
        right: 0.1,
      },
      segments: {},
      squatDepth: 0.5,
    },
    retargetSourceModel: null,
    rightArmTrackingReady: true,
    rightFootSource: "right-foot-live",
    rightKneeSource: "right-knee-live",
    shouldApplyLowerBody: true,
    support: {
      supportLabel: "standing",
    },
    supportConstraint: { owner: "support", status: "active" } as MovementAvatarHeadFrameDebugRuntimeInput["supportConstraint"],
    supportContact: {
      anchorCount: 2,
      correction: 0.123,
      owner: "support-contact",
    },
    supportIntent: { label: "stand", status: "ready" } as unknown as MovementAvatarHeadFrameDebugRuntimeInput["supportIntent"],
    supportPresentation: {
      owner: "support-presentation",
    },
    torsoOwner: "torso-live",
    visualRootDrop: 0.2,
    ...overrides,
  };
}

describe("movementAvatarHeadFrameDebugRuntime", () => {
  it("returns null when tracking debug is disabled", () => {
    expect(resolveMovementAvatarHeadFrameDebugRuntime(input({ isEnabled: false }))).toBeNull();
  });

  it("composes the head-frame debug input without changing domain values", () => {
    const debugInput = resolveMovementAvatarHeadFrameDebugRuntime(input());

    expect(debugInput).toMatchObject({
      activeCalibrationQuality: 0.9,
      avatarRole: "player",
      feetOwner: "player-feet",
      footLock: {
        correction: 0.12,
        drift: 0.34,
        state: {
          strength: 0.56,
        },
      },
      legRaise: {
        now: 1000,
        lowerBodyIntent: {
          label: "left-knee-raise",
        },
      },
      lowerBodyOwner: "player-left-leg-raise",
      motionFrameInputOwner: "movement-motion-frame",
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
        liveSquatDepth: 0.42,
        plantedSquatIkDepth: 0.22,
        visualRootDrop: 0.2,
      },
      supportContact: {
        anchorCount: 2,
        correction: 0.123,
        owner: "support-contact",
      },
    });
  });
});
