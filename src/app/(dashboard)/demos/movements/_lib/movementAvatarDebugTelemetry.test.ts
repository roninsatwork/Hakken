import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarFootLockDebugToTrackingState,
  applyMovementAvatarOptionalPostFrameDebugTelemetry,
  applyMovementAvatarPostFrameDebugTelemetry,
  buildMovementAvatarFrameTrackingDebugState,
  buildMovementAvatarSpineVisualTelemetry,
  buildMovementAvatarRootDebug,
  buildMovementAvatarRuntimeRetargetDebug,
  buildMovementAvatarTrackingFallbackContext,
  buildMovementAvatarTrackingDebugState,
  buildMovementAvatarVisualTelemetry,
  mapMovementAvatarVisualSourceDirection,
  writeMovementAvatarRetargetDebugRegistry,
  type MovementAvatarRetargetDebugRegistryWindow,
} from "./movementAvatarDebugTelemetry";
import {
  buildMovementAvatarExpressionVisualTelemetry,
  buildMovementAvatarHandsVisualTelemetry,
} from "./movementAvatarHandsFaceVisualTelemetry";
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
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
        hipDrop: 0.12,
        leftFootContact: true,
        leftKneeLift: 0.45,
        lowerBodySegmentMotion: 0.67,
        plantedSquatIkDepth: 0.23,
        rightFootContact: false,
        rightKneeLift: 0.11,
        solvedSegments: 7,
        sourceQuality: 0.95,
        squatDepth: 0.34,
        totalLowerBody: 6,
        totalSegments: 8,
        totalUpperBody: 5,
        visualRootDrop: 0.21,
      },
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
      retarget: "q0.95 s0.34 hip0.12 seg0.67 knee 0.45/0.11 feet L- bones 7/8 upper 3/5 lower 4/6 drop 0.21 ik 0.23",
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
        appliedLocalRoll: 0.13579,
        appliedLocalYaw: 0.2468,
        bonePitch: 0.23456,
        boneRoll: -0.2468,
        boneYaw: -0.34567,
        trackingPitch: 0.45678,
        trackingRoll: -0.46802,
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
        appliedLocalRoll: 0.1358,
        appliedLocalYaw: 0.2468,
        bonePitch: 0.2346,
        boneRoll: -0.2468,
        boneYaw: -0.3457,
        trackingPitch: 0.4568,
        trackingRoll: -0.468,
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

  it("builds frame tracking debug state outside the renderer", () => {
    const headNode = new THREE.Object3D();
    headNode.rotation.x = 0.12345;
    const state = buildMovementAvatarFrameTrackingDebugState({
      activeCalibrationQuality: 0.88,
      activeSpineDrive: {
        confidence: 0.8,
        forwardLean: 0.1,
        owner: "player-spine-model",
        sideBend: 0.2,
        twist: -0.1,
      } as Parameters<typeof buildMovementAvatarFrameTrackingDebugState>[0]["activeSpineDrive"],
      appliedHead: {
        confidence: 0.9,
        pitch: 0.2,
        roll: 0,
        source: "pose",
        yaw: -0.3,
      },
      armApplicationModes: {
        left: "retargeted" as const,
        right: "retargeted" as const,
      },
      autoCalibrationKind: "upright",
      avatarHead: {
        headNode,
        headTarget: {
          headBonePitch: 0.23456,
          headDecision: {
            headPitch: 0.45678,
            headRoll: -0.2468,
            headYaw: -0.34567,
          },
          rawHeadDecision: {
            rawHead: {
              confidence: 0.9,
              pitch: 0.22,
              roll: 0,
              source: "pose",
              yaw: -0.56789,
            },
          },
        } as unknown as Parameters<typeof buildMovementAvatarFrameTrackingDebugState>[0]["avatarHead"]["headTarget"],
      },
      avatarRole: "player",
      bodyConfidence: {
        leftFoot: 0.9,
        rightFoot: 0.9,
      },
      exercisePose: { label: "standing", status: "ready" } as unknown as NonNullable<MovementTrackingDebugState["exercisePose"]>,
      exerciseTransition: { label: "stable" } as NonNullable<MovementTrackingDebugState["exerciseTransition"]>,
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
      headMotionIntent: {
        confidence: 1,
        depth: 0,
        label: "side-left",
        lateral: 0,
        vertical: 0,
      },
      headOwner: "head-live",
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
        } as Parameters<typeof buildMovementAvatarFrameTrackingDebugState>[0]["legRaise"]["holdDecision"],
        lowerBodyDrive: {
          playerLegRaiseDepth: 0.34,
          playerLegRaiseSide: "left",
        } as Parameters<typeof buildMovementAvatarFrameTrackingDebugState>[0]["legRaise"]["lowerBodyDrive"],
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
      rawHead: {
        confidence: 0.9,
        pitch: 0.22,
        roll: 0,
        source: "pose",
        yaw: -0.56789,
      },
      retarget: {
        appliedLowerBody: 4,
        appliedUpperBody: 3,
        liveSquatDepth: 0.42,
        plantedSquatIkDepth: 0.22,
        retargetFrame: retargetFrame({
          debug: {
            heldSegments: ["leftFoot"],
            solvedSegments: ["leftThigh", "leftShin"],
            sourceQuality: 0.88,
          },
          hipDrop: 0.18,
          kneeLift: {
            left: 0.45,
            right: 0.12,
          },
          squatDepth: 0.51,
        }),
        retargetSourceModel: null,
        visualRootDrop: 0.2,
      },
      rightFootSource: "right-foot-live",
      rightKneeSource: "right-knee-live",
      shouldApplyLowerBody: true,
      support: {
        supportLabel: "standing",
      },
      supportConstraint: { owner: "support", status: "active" } as NonNullable<MovementTrackingDebugState["supportConstraint"]>,
      supportContact: {
        anchorCount: 2,
        correction: 0.12345,
        owner: "support-contact",
      },
      supportIntent: { label: "stand", status: "ready" } as unknown as NonNullable<MovementTrackingDebugState["supportIntent"]>,
      supportPresentation: {
        owner: "support-presentation",
      },
      torsoOwner: "torso-live",
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
        appliedDepth: 0.34,
        expiresInMs: 250,
        holdActive: true,
        rawLeftDepth: 0.45,
        rawRightDepth: 0.12,
        side: "left",
      },
      calibrationQuality: 0.88,
      fallbacks: {
        baseline: "upright-auto-baseline",
        leftArm: "retargeted-arm",
        leftFoot: "left-foot-live",
        lowerBody: "left-knee-raise-auto d0.20 h0.11 k0.22 t0.33 l0.45 r0.12",
        motionFrameInput: "movement-motion-frame",
        owners: "head head-live; torso torso-live; lower player-left-leg-raise; feet player-feet",
        retarget: expect.stringContaining("q0.88"),
        rightArm: "retargeted-arm",
        spine: "player-spine-model",
      },
      profileName: "default",
      retarget: expect.objectContaining({
        appliedLowerBody: 4,
        appliedUpperBody: 3,
        footLockCorrection: 0.12,
        footLockDrift: 0.34,
        footLockStrength: 0.56,
      }),
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

  it("does not reflect the already-mapped player world direction a second time", () => {
    const spine = mapMovementAvatarVisualSourceDirection({
      anatomicalMapping: "opposite",
      direction: new THREE.Vector3(0.6, 0.8, 0),
      segment: "spine",
    });
    const arm = mapMovementAvatarVisualSourceDirection({
      anatomicalMapping: "opposite",
      direction: new THREE.Vector3(0.6, 0.8, 0),
      segment: "rightUpperArm",
    });

    expect(spine.toArray()).toEqual([0.6, 0.8, 0]);
    expect(arm.toArray()).toEqual([0.6, 0.8, 0]);
  });

  it("reads rendered spine bone rotations after application", () => {
    const scene = new THREE.Scene();
    const spine = new THREE.Object3D();
    const chest = new THREE.Object3D();
    spine.rotation.set(0.1, -0.2, 0.3);
    chest.rotation.set(-0.4, 0.5, -0.6);
    scene.add(spine, chest);
    const bones: Record<string, THREE.Object3D> = { chest, spine };
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: (name: string) => bones[name] ?? null,
      },
      scene,
    } as unknown as VRM;

    expect(buildMovementAvatarSpineVisualTelemetry(vrm)).toEqual({
      chest: { x: -0.4, y: 0.5, z: -0.6 },
      spine: { x: 0.1, y: -0.2, z: 0.3 },
    });
  });

  it("reads rendered finger rotations and expression weights after application", () => {
    const scene = new THREE.Scene();
    const leftIndex = new THREE.Object3D();
    const leftMiddle = new THREE.Object3D();
    const leftThumb = new THREE.Object3D();
    leftIndex.rotation.set(0.2, -0.3, 0.4);
    leftMiddle.rotation.set(-0.1, 0.2, -0.3);
    leftThumb.rotation.set(0.5, 0, -0.25);
    const bones: Record<string, THREE.Object3D> = {
      leftIndexProximal: leftIndex,
      leftMiddleProximal: leftMiddle,
      leftThumbProximal: leftThumb,
    };
    const values: Record<string, number> = {
      aa: 0.3,
      blinkLeft: 0.85,
      blinkRight: 0.05,
      happy: 0.4,
    };
    const vrm = {
      expressionManager: {
        getValue: (name: string) => values[name] ?? null,
      },
      humanoid: {
        getNormalizedBoneNode: (name: string) => bones[name] ?? null,
      },
      scene,
    } as unknown as VRM;

    expect(buildMovementAvatarHandsVisualTelemetry(vrm)).toMatchObject({
      left: {
        curlMagnitude: 2.25,
        indexProximal: { x: 0.2, y: -0.3, z: 0.4 },
        middleProximal: { x: -0.1, y: 0.2, z: -0.3 },
        thumbProximal: { x: 0.5, y: 0, z: -0.25 },
      },
      right: { curlMagnitude: 0 },
    });
    expect(buildMovementAvatarExpressionVisualTelemetry(vrm)).toEqual(values);
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

    expect(telemetry).toMatchObject({
      averageLowerBodyDirectionError: undefined,
      averageUpperBodyDirectionError: undefined,
      comparedLowerBodySegments: 0,
      comparedUpperBodySegments: 0,
      segments: {},
    });
    expect(telemetry?.semantic).toMatchObject({
      evidenceVersion: "2026-07-16.v3",
      headChain: { confidence: 0 },
      torso: { confidence: 0 },
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
    expect(registryWindow.__sonaeMovementAvatarDebug?.player).toMatchObject({
      avatarName: "Player",
      avatarVisual: expect.objectContaining({
        comparedUpperBodySegments: 1,
      }),
      frameUpdatedAt: 456,
      headApplied: state.headApplied,
    });
  });

  it("adds avatar foot floor-clearance telemetry from the runtime foot snapshot", () => {
    const scene = new THREE.Scene();
    const vrm = {
      humanoid: {
        getNormalizedBoneNode: () => null,
      },
      scene,
    } as unknown as VRM;

    const telemetry = buildMovementAvatarVisualTelemetry({
      floorY: -2.75,
      footWorldSnapshot: {
        left: new THREE.Vector3(-0.2, -2.62, 0.1),
        lowestFootY: -2.74,
        right: new THREE.Vector3(0.2, -2.74, -0.1),
      },
      retargetFrame: retargetFrame(),
      vrm,
      zScale: 1,
    });

    expect(telemetry?.footing).toMatchObject({
      floorY: -2.75,
      leftFootClearance: 0.13,
      leftFootY: -2.62,
      rightFootClearance: 0.01,
      rightFootY: -2.74,
    });
  });

  it("keeps optional post-frame debug telemetry neutral when state or VRM is unavailable", () => {
    expect(applyMovementAvatarOptionalPostFrameDebugTelemetry({
      avatarName: "Player",
      avatarRole: "player",
      footLock: {
        correction: 0,
        drift: 0,
        strength: 0,
      },
      frameUpdatedAt: 456,
      retargetFrame: retargetFrame(),
      state: null,
      vrm: null,
      zScale: 1,
    })).toBeNull();
  });

  it("applies optional post-frame debug telemetry when state and VRM are available", () => {
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
      profileName: "default",
      retarget: {
        appliedLowerBody: 0,
        appliedUpperBody: 0,
        footLockCorrection: 0,
        footLockDrift: 0,
        footLockStrength: 0,
        hipDrop: 0,
        leftFootContact: false,
        leftKneeLift: 0,
        lowerBodySegmentMotion: 0,
        plantedSquatIkDepth: 0,
        rightFootContact: false,
        rightKneeLift: 0,
        solvedSegments: 0,
        sourceQuality: 0.82,
        squatDepth: 0,
        totalLowerBody: 6,
        totalSegments: 6,
        totalUpperBody: 5,
        visualRootDrop: 0,
      },
      updatedAt: 123,
    };

    const updated = applyMovementAvatarOptionalPostFrameDebugTelemetry({
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

    expect(updated?.avatarVisual?.comparedUpperBodySegments).toBe(1);
    expect(registryWindow.__sonaeMovementRetargetDebug?.player?.avatarName).toBe("Player");
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
