import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarFootLockDebugToTrackingState,
  applyMovementAvatarPostFrameDebugTelemetry,
  buildMovementAvatarRootDebug,
  buildMovementAvatarRuntimeRetargetDebug,
  buildMovementAvatarTrackingFallbackContext,
  buildMovementAvatarTrackingDebugState,
  buildMovementAvatarVisualTelemetry,
  writeMovementAvatarRetargetDebugRegistry,
  type MovementAvatarRetargetDebugRegistryWindow,
} from "./movementAvatarDebugTelemetry";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: false,
      rightFoot: false,
    },
    debug: {
      heldSegments: [],
      solvedSegments: [],
      sourceQuality: 1,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0,
    ...overrides,
  };
}

describe("movement avatar debug telemetry", () => {
  it("builds rounded root debug telemetry from root application results", () => {
    const rootTarget: MovementAvatarRootTargetDecision = {
      jumpResponse: {
        heightOffset: 0.12345,
        landingCompression: 0,
        lift: 0.2,
        owner: "jump-live",
        shouldApply: true,
        slerp: 0.4,
        summary: "jump",
      },
      rootHeadingYaw: -0.34567,
      rootHeightLerp: 0.3,
      rootOrientationSlerp: 0.2,
      source: "world-landmarks",
      stepResponse: {
        footLiftOffset: 0.45678,
        landingCompression: 0,
        owner: "step-live",
        shouldApply: true,
        side: "left",
        slerp: 0.4,
        summary: "step",
      },
      targetHeightDrop: 0.23456,
      targetJumpHeightOffset: 0.12345,
      targetPitch: 0.11115,
      targetRoll: -0.22225,
      targetX: 1.98765,
      targetY: -2.5,
      targetYaw: 2.79592,
      targetZ: -1.23456,
    };

    expect(buildMovementAvatarRootDebug({
      orientationOwner: "torso-live",
      rootApplication: {
        appliedYaw: -0.34567,
        position: {
          x: 1.11115,
          y: -2.22225,
          z: 3.33335,
        },
        rotation: {
          x: 0.12345,
          y: 2.79592,
          z: -0.98765,
        },
      },
      rootTarget,
    })).toEqual({
      appliedPitch: 0.1235,
      appliedRoll: -0.9877,
      appliedYaw: -0.3457,
      appliedX: 1.1112,
      appliedY: -2.2222,
      appliedZ: 3.3333,
      jumpResponseOwner: "jump-live",
      orientationOwner: "torso-live",
      source: "world-landmarks",
      stepResponseOwner: "step-live",
      stepResponseSide: "left",
      targetHeightDrop: 0.2346,
      targetJumpHeightOffset: 0.1235,
      targetPitch: 0.1111,
      targetRoll: -0.2223,
      targetStepFootLiftOffset: 0.4568,
      targetX: 1.9876,
      targetYaw: -0.3457,
      targetZ: -1.2346,
    });
  });

  it("builds runtime retarget debug telemetry with foot-lock and display totals", () => {
    expect(buildMovementAvatarRuntimeRetargetDebug({
      appliedLowerBody: 4,
      appliedUpperBody: 3,
      footLock: {
        correction: 0.12,
        drift: 0.34,
        strength: 0.56,
      },
      liveSquatDepth: 0.42,
      plantedSquatIkDepth: 0.22,
      retargetFrame: retargetFrame({
        contacts: {
          leftFoot: true,
          rightFoot: false,
        },
        debug: {
          heldSegments: ["leftFoot"],
          solvedSegments: ["leftThigh", "leftShin", "rightUpperArm"],
          sourceQuality: 0.88,
        },
        hipDrop: 0.18,
        kneeLift: {
          left: 0.31,
          right: 0.41,
        },
        squatDepth: 0.51,
      }),
      retargetSourceModel: null,
      totalLowerBody: 8,
      totalUpperBody: 7,
      visualRootDrop: 0.2,
    })).toEqual(expect.objectContaining({
      appliedLowerBody: 4,
      appliedUpperBody: 3,
      footLockCorrection: 0.12,
      footLockDrift: 0.34,
      footLockStrength: 0.56,
      hipDrop: 0.18,
      leftFootContact: true,
      leftKneeLift: 0.31,
      plantedSquatIkDepth: 0.22,
      rightFootContact: false,
      rightKneeLift: 0.41,
      solvedSegments: 3,
      sourceQuality: 0.88,
      squatDepth: 0.42,
      totalLowerBody: 8,
      totalSegments: 4,
      totalUpperBody: 7,
      visualRootDrop: 0.2,
    }));
  });

  it("builds tracking fallback context labels outside the renderer", () => {
    expect(buildMovementAvatarTrackingFallbackContext({
      exercisePose: {
        label: "standing",
        status: "ready",
      },
      exerciseTransition: {
        label: "stable",
      },
      motionFrameInput: "movement-motion-frame",
      orientation: {
        orientation: "front",
        status: "ready",
      },
      retarget: "q0.95",
      support: {
        supportLabel: "standing",
      },
      supportConstraint: {
        owner: "support-solver",
        status: "active",
      },
      supportContact: {
        anchorCount: 2,
        correction: 0.12345,
        owner: "support-contact",
      },
      supportIntent: {
        label: "stand",
        status: "ready",
      },
      supportPresentation: {
        owner: "none",
      },
    })).toEqual({
      exercisePose: "standing ready",
      exerciseTransition: "stable",
      motionFrameInput: "movement-motion-frame",
      orientation: "front ready",
      retarget: "q0.95",
      support: "standing",
      supportConstraint: "support-solver active",
      supportContact: "support-contact anchors 2 corr 0.123",
      supportIntent: "stand ready",
      supportPresentation: "none",
    });
  });

  it("builds the composed tracking debug state", () => {
    const retargetDebug: NonNullable<MovementTrackingDebugState["retarget"]> = {
      appliedLowerBody: 4,
      appliedUpperBody: 3,
      footLockCorrection: 0.2,
      footLockDrift: 0.1,
      footLockStrength: 0.8,
      hipDrop: 0.12,
      leftFootContact: true,
      leftKneeLift: 0.4,
      lowerBodySegmentMotion: 0.7,
      plantedSquatIkDepth: 0.3,
      rightFootContact: true,
      rightKneeLift: 0.5,
      solvedSegments: 9,
      sourceQuality: 0.95,
      squatDepth: 0.25,
      totalLowerBody: 6,
      totalSegments: 11,
      totalUpperBody: 5,
      visualRootDrop: 0.15,
    };

    const state = buildMovementAvatarTrackingDebugState({
      appliedHead: {
        confidence: 0.8,
        pitch: 0.2,
        roll: 0,
        source: "pose",
        yaw: -0.3,
      },
      avatarHead: {
        appliedLocalPitch: 0.12345,
        bonePitch: 0.23456,
        boneYaw: -0.34567,
        trackingPitch: 0.45678,
        trackingYaw: -0.56789,
      },
      avatarLegRaise: {
        appliedDepth: 0.34567,
        expiresAt: 1250,
        holdActive: true,
        now: 1000,
        rawLeftDepth: 0.45678,
        rawRightDepth: 0.56789,
        side: "left",
      },
      bodyConfidence: {
        leftKnee: 0.9,
      },
      calibrationQuality: 0.77,
      exercisePose: { label: "standing", status: "ready" } as unknown as NonNullable<MovementTrackingDebugState["exercisePose"]>,
      exerciseTransition: { label: "stable" } as NonNullable<MovementTrackingDebugState["exerciseTransition"]>,
      fallbackContext: {
        exercisePose: "standing ready",
        exerciseTransition: "stable",
        motionFrameInput: "motion-frame",
        orientation: "front ready",
        support: "standing",
        supportConstraint: "support ok",
        supportContact: "support anchors 2 corr 0.100",
        supportIntent: "stand ready",
        supportPresentation: "none",
        retarget: "q0.95",
      },
      fallbackLabels: {
        armDepth: "player-2d-safe-arms",
        baseline: "auto",
        floor: "fixed-floor",
        head: "pose",
        headMotion: "neutral",
        leftArm: "tracked",
        leftFoot: "pose",
        leftKnee: "pose",
        lowerBody: "neutral",
        owners: "head live",
        rightArm: "tracked",
        rightFoot: "pose",
        rightKnee: "pose",
        spine: "live",
      },
      profileName: "default",
      rawHead: {
        confidence: 0.9,
        pitch: 0.22,
        roll: 0,
        source: "pose",
        yaw: -0.33,
      },
      retargetDebug,
      spineDrive: {
        confidence: 0.8,
        forwardLean: 0.1,
        owner: "spine-live",
        sideBend: 0.2,
        twist: -0.1,
      },
      supportConstraint: { owner: "support", status: "ok" } as unknown as NonNullable<MovementTrackingDebugState["supportConstraint"]>,
      supportIntent: { label: "stand", status: "ready" } as unknown as NonNullable<MovementTrackingDebugState["supportIntent"]>,
      updatedAt: 1000,
    });

    expect(state).toMatchObject({
      avatarHead: {
        appliedLocalPitch: 0.1235,
        bonePitch: 0.2346,
        boneYaw: -0.3457,
        trackingPitch: 0.4568,
        trackingYaw: -0.5679,
      },
      avatarLegRaise: {
        appliedDepth: 0.3457,
        expiresInMs: 250,
        holdActive: true,
        rawLeftDepth: 0.4568,
        rawRightDepth: 0.5679,
        side: "left",
      },
      calibrationQuality: 0.77,
      fallbacks: {
        armDepth: "player-2d-safe-arms",
        orientation: "front ready",
        retarget: "q0.95",
      },
      profileName: "default",
      retarget: retargetDebug,
      updatedAt: 1000,
    });
  });

  it("compares avatar bone directions with retarget source directions", () => {
    const scene = new THREE.Scene();
    const rightUpperArm = new THREE.Object3D();
    const rightLowerArm = new THREE.Object3D();
    rightLowerArm.position.set(2, 0, 0);
    scene.add(rightUpperArm);
    rightUpperArm.add(rightLowerArm);
    scene.updateMatrixWorld(true);

    const bones: Record<string, THREE.Object3D> = {
      rightLowerArm,
      rightUpperArm,
    };
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) => bones[name] ?? null,
      },
      scene,
    } as unknown as VRM;

    const telemetry = buildMovementAvatarVisualTelemetry({
      retargetFrame: retargetFrame({
        segments: {
          rightUpperArm: {
            confidence: 0.9,
            direction: {
              x: 1,
              y: 0,
              z: 0,
            },
            length: 2,
          },
        },
      }),
      vrm,
      zScale: 1,
    });

    expect(telemetry).toMatchObject({
      averageUpperBodyDirectionError: 0,
      comparedLowerBodySegments: 0,
      comparedUpperBodySegments: 1,
      segments: {
        rightUpperArm: {
          confidence: 0.9,
          direction: {
            x: 1,
            y: 0,
            z: 0,
          },
          length: 2,
          sourceDirection: {
            x: 1,
            y: 0,
            z: 0,
          },
          sourceError: 0,
        },
      },
    });
  });

  it("skips missing or zero-length avatar segments", () => {
    const scene = new THREE.Scene();
    const rightUpperArm = new THREE.Object3D();
    const rightLowerArm = new THREE.Object3D();
    scene.add(rightUpperArm);
    rightUpperArm.add(rightLowerArm);

    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) => {
          if (name === "rightUpperArm") return rightUpperArm;
          if (name === "rightLowerArm") return rightLowerArm;
          return null;
        },
      },
      scene,
    } as unknown as VRM;

    const telemetry = buildMovementAvatarVisualTelemetry({
      retargetFrame: retargetFrame({
        segments: {
          rightUpperArm: {
            confidence: 0.9,
            direction: {
              x: 1,
              y: 0,
              z: 0,
            },
            length: 2,
          },
        },
      }),
      vrm,
      zScale: 1,
    });

    expect(telemetry).toEqual({
      averageLowerBodyDirectionError: undefined,
      averageUpperBodyDirectionError: undefined,
      comparedLowerBodySegments: 0,
      comparedUpperBodySegments: 0,
      segments: {},
    });
  });

  it("appends foot-lock debug details to the tracking state", () => {
    const state: MovementTrackingDebugState = {
      bodyConfidence: {},
      fallbacks: {
        retarget: "q0.82",
      },
      headApplied: {
        confidence: 1,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0,
      },
      headRaw: {
        confidence: 1,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0,
      },
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
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
        solvedSegments: 8,
        sourceQuality: 1,
        squatDepth: 0,
        totalLowerBody: 6,
        totalSegments: 11,
        totalUpperBody: 5,
        visualRootDrop: 0,
      },
      updatedAt: 123,
    };

    const updated = applyMovementAvatarFootLockDebugToTrackingState({
      footLock: {
        correction: 0.1234,
        drift: 0.5678,
        strength: 0.9,
      },
      state,
    });

    expect(updated.fallbacks.retarget).toBe("q0.82 lock 0.90 corr 0.12 drift 0.57");
    expect(updated.retarget).toMatchObject({
      footLockCorrection: 0.1234,
      footLockDrift: 0.5678,
      footLockStrength: 0.9,
    });
  });

  it("applies post-frame visual and foot-lock debug telemetry", () => {
    const scene = new THREE.Scene();
    const rightUpperArm = new THREE.Object3D();
    const rightLowerArm = new THREE.Object3D();
    rightLowerArm.position.set(2, 0, 0);
    scene.add(rightUpperArm);
    rightUpperArm.add(rightLowerArm);
    scene.updateMatrixWorld(true);

    const bones: Record<string, THREE.Object3D> = {
      rightLowerArm,
      rightUpperArm,
    };
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) => bones[name] ?? null,
      },
      scene,
    } as unknown as VRM;
    const registryWindow: MovementAvatarRetargetDebugRegistryWindow = {};
    const state: MovementTrackingDebugState = {
      bodyConfidence: {},
      fallbacks: {
        retarget: "q0.82",
      },
      headApplied: {
        confidence: 1,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0,
      },
      headRaw: {
        confidence: 1,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0,
      },
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
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
        solvedSegments: 8,
        sourceQuality: 1,
        squatDepth: 0,
        totalLowerBody: 6,
        totalSegments: 11,
        totalUpperBody: 5,
        visualRootDrop: 0,
      },
      updatedAt: 123,
    };

    const updated = applyMovementAvatarPostFrameDebugTelemetry({
      avatarName: "Player",
      avatarRole: "player",
      footLock: {
        correction: 0.1234,
        drift: 0.5678,
        strength: 0.9,
      },
      frameUpdatedAt: 456,
      registryWindow,
      retargetFrame: retargetFrame({
        segments: {
          rightUpperArm: {
            confidence: 0.9,
            direction: {
              x: 1,
              y: 0,
              z: 0,
            },
            length: 2,
          },
        },
      }),
      state,
      vrm,
      zScale: 1,
    });

    expect(updated.avatarVisual?.comparedUpperBodySegments).toBe(1);
    expect(updated.fallbacks.retarget).toBe("q0.82 lock 0.90 corr 0.12 drift 0.57");
    expect(updated.retarget).toMatchObject({
      footLockCorrection: 0.1234,
      footLockDrift: 0.5678,
      footLockStrength: 0.9,
    });
    expect(registryWindow.__sonaeMovementRetargetDebug?.player).toMatchObject({
      avatarName: "Player",
      footLockCorrection: 0.1234,
      frameUpdatedAt: 456,
    });
  });

  it("writes role-keyed retarget debug registry entries", () => {
    const registryWindow: MovementAvatarRetargetDebugRegistryWindow = {
      __sonaeMovementRetargetDebug: {
        instructor: {
          appliedLowerBody: 1,
          appliedUpperBody: 1,
          avatarName: "Guide",
          footLockCorrection: 0,
          footLockDrift: 0,
          footLockStrength: 0,
          frameUpdatedAt: 100,
          hipDrop: 0,
          leftFootContact: false,
          leftKneeLift: 0,
          lowerBodySegmentMotion: 0,
          plantedSquatIkDepth: 0,
          rightFootContact: false,
          rightKneeLift: 0,
          solvedSegments: 2,
          sourceQuality: 1,
          squatDepth: 0,
          totalLowerBody: 6,
          totalSegments: 11,
          totalUpperBody: 5,
          visualRootDrop: 0,
        },
      },
    };

    writeMovementAvatarRetargetDebugRegistry({
      avatarName: "Player",
      avatarRole: "player",
      frameUpdatedAt: 200,
      registryWindow,
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
        footLockCorrection: 0.2,
        footLockDrift: 0.1,
        footLockStrength: 0.8,
        hipDrop: 0.12,
        leftFootContact: true,
        leftKneeLift: 0.4,
        lowerBodySegmentMotion: 0.7,
        plantedSquatIkDepth: 0.3,
        rightFootContact: true,
        rightKneeLift: 0.5,
        solvedSegments: 9,
        sourceQuality: 0.95,
        squatDepth: 0.25,
        totalLowerBody: 6,
        totalSegments: 11,
        totalUpperBody: 5,
        visualRootDrop: 0.15,
      },
    });

    expect(registryWindow.__sonaeMovementRetargetDebug).toMatchObject({
      instructor: {
        avatarName: "Guide",
      },
      player: {
        avatarName: "Player",
        footLockStrength: 0.8,
        frameUpdatedAt: 200,
      },
    });
  });
});
