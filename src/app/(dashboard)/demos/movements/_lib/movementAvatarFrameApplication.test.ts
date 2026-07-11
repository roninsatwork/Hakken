import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resolveMovementAvatarFrameTargetRuntime } from "./movementAvatarBodyFrame";
import type { MovementAvatarRetargetDebugRegistryWindow } from "./movementAvatarDebugTelemetry";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import {
  applyMovementAvatarEndFrameRuntime,
  applyMovementAvatarFinalFrameOrchestrationRuntime,
  applyMovementAvatarFrameCompletionOrchestrationRuntime,
  applyMovementAvatarPostFrameDebugRuntime,
  applyMovementAvatarPreBodyFrameOrchestrationRuntime,
  filterMovementAvatarSupportArmSpecsForRetargetOwners,
  resolveMovementAvatarFrameScenePreparationRuntime,
  resolveMovementAvatarStandingFeetFloorContactLocks,
  resolveMovementAvatarFrameWorldRuntime,
} from "./movementAvatarFrameApplication";
import {
  applyMovementAvatarFramePreparationOrchestrationRuntime,
  applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime,
  resolveMovementAvatarFrameDecisionSnapshotRuntime,
} from "./movementAvatarFramePreparation";
import { applyMovementAvatarLocomotionFrameOrchestrationRuntime } from "./movementAvatarLocomotionFrame";
import {
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
  resolveMovementAvatarPipelineDecision,
} from "./movementAvatarPipeline";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel, type MovementRetargetFrame } from "./movementRetargeting";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

describe("movement avatar standing floor contacts", () => {
  const standingContactLocks = {
    anchors: [],
    boneCorrectionScale: 0,
    maxBoneCorrection: 0,
    maxCorrection: 0,
    owner: "support-contact-locks-standing-foot-lock",
    rootCorrectionScale: 0,
    shouldApply: false,
    slerp: 0,
    status: "inactive" as const,
  };

  it("anchors only the opposite planted foot during a left leg raise", () => {
    const result = resolveMovementAvatarStandingFeetFloorContactLocks({
      contactLocks: standingContactLocks,
      lowerBodyDrive: {
        playerLegRaiseSide: "left",
        shouldDrivePlayerLegRaise: true,
      },
      shouldApply: true,
    });

    expect(result.anchors.map((anchor) => anchor.bone)).toEqual(["rightFoot"]);
    expect(result.shouldApply).toBe(true);
    expect(result.slerp).toBe(1);
  });

  it("anchors both feet for non-leg-raise standing motion", () => {
    const result = resolveMovementAvatarStandingFeetFloorContactLocks({
      contactLocks: standingContactLocks,
      lowerBodyDrive: {
        playerLegRaiseSide: null,
        shouldDrivePlayerLegRaise: false,
      },
      shouldApply: true,
    });

    expect(result.anchors.map((anchor) => anchor.bone)).toEqual(["rightFoot", "leftFoot"]);
  });

  it("anchors only the recorded instructor planted foot during a right leg raise", () => {
    const result = resolveMovementAvatarStandingFeetFloorContactLocks({
      contactLocks: standingContactLocks,
      lowerBodyDrive: {
        playerLegRaiseSide: null,
        shouldDrivePlayerLegRaise: false,
      },
      retargetContacts: {
        leftFoot: true,
        rightFoot: false,
      },
      shouldApply: true,
    } as Parameters<typeof resolveMovementAvatarStandingFeetFloorContactLocks>[0]);

    expect(result.anchors.map((anchor) => anchor.bone)).toEqual(["leftFoot"]);
  });
});

describe("movement avatar support arm ownership", () => {
  it("removes only support arm specs already owned by the retargeter", () => {
    const armSpecs = [
      { bone: "leftUpperArm" as const, rotation: { x: 0, y: 0, z: 1 }, slerp: 0.8 },
      { bone: "rightUpperArm" as const, rotation: { x: 0, y: 0, z: -1 }, slerp: 0.8 },
    ];

    expect(filterMovementAvatarSupportArmSpecsForRetargetOwners({
      armApplicationModes: { left: "retargeted", right: "hold-last-good" },
      armSpecs,
    })).toEqual([armSpecs[1]]);
    expect(filterMovementAvatarSupportArmSpecsForRetargetOwners({
      armApplicationModes: { left: "retargeted", right: "retargeted" },
      armSpecs,
    })).toEqual([]);
  });
});

describe("movementAvatarFrameWorldRuntime (merged)", () => {
  describe("movementAvatarFrameWorldRuntime", () => {
    it("returns world-pose inputs and full-depth z-scales when world landmarks are present", () => {
      const worldLandmarks: TrackingLandmark[] = [{
        visibility: 0.9,
        x: 0.1,
        y: 0.2,
        z: 0.3,
      }];

      const runtime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks });

      expect(runtime.hasWorldLandmarks).toBe(true);
      expect(runtime.lowerBodyZScale).toBe(1);
      expect(runtime.visualTelemetryZScale).toBe(1);
      expect(runtime.worldPoseForLocomotion).toBe(worldLandmarks);
      expect(runtime.worldPoseForSetup).toBe(worldLandmarks);
    });

    it("preserves existing fallback values when world landmarks are absent", () => {
      const runtime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks: null });

      expect(runtime.hasWorldLandmarks).toBe(false);
      expect(runtime.lowerBodyZScale).toBe(0.1);
      expect(runtime.visualTelemetryZScale).toBe(0.18);
      expect(runtime.worldPoseForLocomotion).toBeNull();
      expect(runtime.worldPoseForSetup).toBeUndefined();
    });
  });
});

describe("movementAvatarFrameScenePreparationRuntime (merged)", () => {
  describe("movementAvatarFrameScenePreparationRuntime", () => {
    it("updates scene matrices and returns player frame scene values", () => {
      const hipsNode = new THREE.Object3D();
      const updateMatrixWorld = vi.fn();

      const runtime = resolveMovementAvatarFrameScenePreparationRuntime({
        avatarRole: "player",
        lookupBone: (boneName) => boneName === "hips" ? hipsNode : null,
        scene: { updateMatrixWorld },
      });

      expect(updateMatrixWorld).toHaveBeenCalledWith(true);
      expect(runtime.fallbackSlerp).toBe(0.5);
      expect(runtime.hipsNode).toBe(hipsNode);
      expect(runtime.updatedSceneMatrixWorld).toBe(true);
    });

    it("uses instructor fallback and skips missing scenes safely", () => {
      const runtime = resolveMovementAvatarFrameScenePreparationRuntime({
        avatarRole: "instructor",
        lookupBone: () => null,
        scene: null,
      });

      expect(runtime.fallbackSlerp).toBe(0.3);
      expect(runtime.hipsNode).toBeNull();
      expect(runtime.updatedSceneMatrixWorld).toBe(false);
    });
  });
});

describe("movementAvatarEndFrameRuntime (merged)", () => {
  describe("movementAvatarEndFrameRuntime", () => {
    it("applies blendshape expressions and hand rotations through one runtime boundary", () => {
      const expressionWrites: Array<{ name: string; value: number }> = [];
      const handBone = new THREE.Object3D();

      const result = applyMovementAvatarEndFrameRuntime({
        blendshapes: [
          { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.2 },
          { categoryName: "jawOpen", displayName: "jawOpen", index: 1, score: 0.8 },
        ],
        expressionManager: {
          setValue: (name, value) => {
            expressionWrites.push({ name, value });
          },
        },
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
      });

      expect(result.appliedExpressions).toBe(3);
      expect(result.appliedHandRotations).toBeGreaterThanOrEqual(1);
      expect(expressionWrites).toEqual([
        { name: "blinkLeft", value: 0.2 },
        { name: "aa", value: 1 },
        { name: "happy", value: 0 },
      ]);
    });

    it("stays neutral when no expression manager or hands are available", () => {
      expect(applyMovementAvatarEndFrameRuntime({
        blendshapes: null,
        expressionManager: null,
        hands: null,
        isPlayer: true,
        lookupBone: () => null,
        mirrorForDisplay: false,
      })).toEqual({
        appliedExpressions: 0,
        appliedHandRotations: 0,
      });
    });
  });
});

describe("movementAvatarPostFrameDebugRuntime (merged)", () => {
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
});

describe("movementAvatarFinalFrameOrchestrationRuntime (merged)", () => {
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
});

describe("movementAvatarFrameCompletionOrchestrationRuntime (merged)", () => {
  const stableUprightTransition = {
    confidence: 1,
    fromBand: null,
    fromPoseKey: null,
    isTransition: false,
    key: "stable-upright",
    label: "Stable upright",
    summary: "The current movement pose remains upright.",
    toBand: "upright",
    toPoseKey: "standing-neutral",
  } as const;

  const hipsApplication: MovementAvatarHipsApplicationDecision = {
    shouldApplyFloorContactCorrection: true,
    shouldApplySquatDrop: true,
    squatDrop: 0.3,
  };

  const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
    avatarRootVisualLerp: 0.28,
    floorContactCorrectionScale: 0.7,
    rootLerp: 0.5,
    shouldUseCalibratedFloorCorrection: true,
    squatHipDropLimit: 0.88,
    squatHipDropScale: 0.78,
  };

  function inactiveStepResponse(): MovementRootMotionStepResponseDecision {
    return {
      footLiftOffset: 0,
      landingCompression: 0,
      owner: "step-response-none",
      shouldApply: false,
      side: null,
      slerp: 0,
      summary: "none",
    };
  }

  function vrm(): VRM {
    return {
      expressionManager: null,
      humanoid: {
        getNormalizedBoneNode: () => null,
      },
      scene: new THREE.Object3D(),
    } as unknown as VRM;
  }

  describe("movementAvatarFrameCompletionOrchestrationRuntime", () => {
    it("owns support, footing, head debug, and final-frame handoffs", () => {
      const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
      const calibration = buildMovementCalibration({ poseLandmarks });
      const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks });
      const avatarDecision = resolveMovementAvatarPipelineDecision({
        avatarRole: "player",
        calibration,
        retargetSourceModel,
        source: {
          poseLandmarks,
        },
        sourceOrigin: "studio",
      });
      const frameTargetRuntime = resolveMovementAvatarFrameTargetRuntime({
        avatarRole: "player",
        targetSolverLandmarks: poseLandmarks,
      });
      const scene = new THREE.Object3D();
      const avatarRoot = new THREE.Object3D();
      const hips = new THREE.Object3D();
      const head = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      const bones = new Map([
        ["head", head],
        ["leftFoot", leftFoot],
        ["rightFoot", rightFoot],
      ]);
      scene.add(avatarRoot);
      avatarRoot.add(hips);
      avatarRoot.add(head);
      hips.add(leftFoot);
      hips.add(rightFoot);
      hips.position.y = 1;
      leftFoot.position.set(-0.2, 0, 0.1);
      rightFoot.position.set(0.2, 0, -0.1);

      const trackingDebugRef: { current: MovementTrackingDebugState | null } = {
        current: null,
      };
      const legRaiseHoldState = {
        depth: 0,
        expiresAt: 0,
        side: null,
      };
      const getNow = vi.fn()
        .mockReturnValueOnce(101)
        .mockReturnValueOnce(202);

      const result = applyMovementAvatarFrameCompletionOrchestrationRuntime({
        activeCalibration: calibration,
        armApplicationModes: { left: "retargeted" as const, right: "retargeted" as const },
        autoCalibrationKind: "upright",
        avatarDecision,
        avatarName: "Player",
        avatarRole: "player",
        avatarRoot,
        avatarRootYaw: avatarRoot.rotation.y,
        baseBonePositionRef: {
          current: {
            head: new THREE.Vector3(),
          },
        },
        baseHipsPositionRef: {
          current: null,
        },
        blendshapes: null,
        calibratedFloorCorrection: 3.75,
        contactLocks: avatarDecision.supportContactLocks,
        currentLowerBodyOwner: "retarget-lower-body",
        exerciseTransition: stableUprightTransition,
        expressionManager: null,
        faceLandmarks: null,
        footOwner: "retarget-feet",
        frameTargetRuntime,
        getNow,
        hands: null,
        hasManualCalibration: false,
        hipsApplication,
        hipsNode: hips,
        hipsPositionOptions,
        isPlayer: true,
        legRaiseHoldDecision: {
          lowerBodyDrive: avatarDecision.lowerBodyDrive,
          state: legRaiseHoldState,
          wasHeld: false,
        },
        liveSquatDepth: 0,
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        lowerBodyDrive: avatarDecision.lowerBodyDrive,
        lowerBodyTrackingReady: true,
        mirrorForDisplay: false,
        motionFrameInputOwner: "movement-motion-frame",
        neckSlerp: 0.5,
        plantedFootLockRef: {
          current: createMovementAvatarFootLockState(),
        },
        plantedSquatIkDepth: 0,
        playerLegRaiseHoldState: legRaiseHoldState,
        poseLandmarks,
        profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
        profileName: "default",
        retargetAppliedLowerBody: 0,
        retargetAppliedUpperBody: 0,
        retargetFrame: avatarDecision.retargetFrame,
        retargetSourceModel: null,
        scene,
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
        stepResponse: inactiveStepResponse(),
        supportPresentation: avatarDecision.supportPresentation,
        trackingDebugRef,
        visualRootDrop: 0,
        vrm: vrm(),
        zScale: 1,
      });

      expect(result.supportFrameOrchestrationRuntime.supportContactTelemetry.owner).toContain("support-contact");
      expect(result.footingFrameOrchestrationRuntime.footingRuntime.footWorldSnapshot.left).not.toBeNull();
      expect(result.footingFrameOrchestrationRuntime.footingRuntime.footWorldSnapshot.left?.y).toBeCloseTo(1, 4);
      expect(result.footingFrameOrchestrationRuntime.footingRuntime.footWorldSnapshot.right?.y).toBeCloseTo(1, 4);
      expect(result.headFrameOrchestrationRuntime.headFrameRefsRuntime.appliedTrackingDebugState).toBe(true);
      expect(result.finalFrameOrchestrationRuntime.postFrameDebugRuntime.applied).toBe(true);
      expect(getNow).toHaveBeenCalledTimes(2);
      expect(trackingDebugRef.current?.updatedAt).toBe(101);
      expect(trackingDebugRef.current?.retarget?.footLockCorrection).toBe(
        result.footingFrameOrchestrationRuntime.footLockCorrection,
      );
      expect(trackingDebugRef.current?.retarget?.footLockDrift).toBe(
        result.footingFrameOrchestrationRuntime.footLockDrift,
      );
    });
  });
});

describe("movementAvatarPreBodyFrameOrchestrationRuntime (merged)", () => {
  vi.mock("./movementAvatarFramePreparation", () => ({
    applyMovementAvatarFramePreparationOrchestrationRuntime: vi.fn(),
    applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime: vi.fn(),
    resolveMovementAvatarFrameDecisionSnapshotRuntime: vi.fn(),
  }));

  vi.mock("./movementAvatarLocomotionFrame", () => ({
    applyMovementAvatarLocomotionFrameOrchestrationRuntime: vi.fn(),
  }));

  function input() {
    return {
      avatarBaseY: -2.8,
      avatarRole: "player",
      avatarRoot: "avatar-root",
      displayWorldPose: "display-world-pose",
      exerciseTransitionStateRef: { current: "exercise-transition" },
      faceLandmarks: "face-landmarks",
      forceStandby: false,
      hands: "hands",
      history: "history",
      instructorLowerBodyStabilityRef: { current: "instructor-stability" },
      isLivePlayer: true,
      manualCalibration: "manual-calibration",
      mirrorPlayerDisplay: true,
      motionFrame: "motion-frame",
      now: () => 123,
      playerLegRaiseHoldRef: { current: "leg-raise-hold" },
      playerLowerBodyStabilityRef: { current: "player-stability" },
      poseLandmarks: "pose-landmarks",
      positionOffset: [0, 0, 0],
      profile: "profile",
      providedRetargetSourceModel: "retarget-source-model",
      recordedRootMotionFrame: "recorded-root-motion",
      retargetSourceModelRef: { current: "retarget-source-ref" },
      setupStateRef: { current: "setup-state" },
      trackingDebugRef: { current: null },
      worldPoseForLocomotion: "world-pose-locomotion",
      worldPoseForSetup: "world-pose-setup",
    } as never;
  }

  describe("movementAvatarPreBodyFrameOrchestrationRuntime", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns fallback when frame preparation cannot produce a decision", () => {
      const framePreparationRuntime = {
        activeCalibration: null,
        autoCalibrationKind: "none",
        status: "fallback-demo-pose",
      };
      vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);

      expect(applyMovementAvatarPreBodyFrameOrchestrationRuntime(input())).toEqual({
        framePreparationRuntime,
        status: "fallback-demo-pose",
      });
      expect(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime).not.toHaveBeenCalled();
      expect(applyMovementAvatarLocomotionFrameOrchestrationRuntime).not.toHaveBeenCalled();
    });

    it("returns fallback after locomotion standby while preserving prep and locomotion results", () => {
      const framePreparationRuntime = {
        activeCalibration: "active-calibration",
        avatarDecision: "avatar-decision",
        autoCalibrationKind: "upright",
        exerciseTransition: "exercise-transition",
        motionFrameInput: "motion-frame-input",
        status: "ready",
      };
      const lowerBodyFrameStateOrchestrationRuntime = {
        legRaiseHoldDecision: "leg-raise-hold-decision",
        lowerBodyFrameStateRuntime: "lower-body-frame-state",
      };
      const decisionSnapshotRuntime = {
        lowerBodyDrive: "lower-body-drive",
        lowerBodyTrackingReady: true,
        playerSquatPresentationDepth: 0.4,
        rootOrientation: "root-orientation",
        shouldApplyLowerBody: true,
        visualRootDrop: 0.2,
      };
      const locomotionFrameOrchestrationRuntime = {
        calibratedFloorCorrection: 0,
        hipsFrameRuntime: "hips-frame",
        status: "fallback-demo-pose",
      };
      vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);
      vi.mocked(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime)
        .mockReturnValue(lowerBodyFrameStateOrchestrationRuntime as never);
      vi.mocked(resolveMovementAvatarFrameDecisionSnapshotRuntime).mockReturnValue(decisionSnapshotRuntime as never);
      vi.mocked(applyMovementAvatarLocomotionFrameOrchestrationRuntime)
        .mockReturnValue(locomotionFrameOrchestrationRuntime as never);

      const result = applyMovementAvatarPreBodyFrameOrchestrationRuntime(input());

      expect(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
        avatarDecision: "avatar-decision",
        now: 123,
      }));
      expect(applyMovementAvatarLocomotionFrameOrchestrationRuntime).toHaveBeenCalledWith(expect.objectContaining({
        calibration: "active-calibration",
        lowerBodyDrive: "lower-body-drive",
        rootOrientation: "root-orientation",
        worldPose: "world-pose-locomotion",
      }));
      expect(result).toEqual({
        framePreparationRuntime,
        locomotionFrameOrchestrationRuntime,
        status: "fallback-demo-pose",
      });
    });

    it("returns ready frame handoffs for body and completion orchestration", () => {
      const framePreparationRuntime = {
        activeCalibration: "active-calibration",
        avatarDecision: "avatar-decision",
        autoCalibrationKind: "upright",
        exerciseTransition: "exercise-transition",
        motionFrameInput: "motion-frame-input",
        status: "ready",
      };
      const lowerBodyFrameStateOrchestrationRuntime = {
        legRaiseHoldDecision: "leg-raise-hold-decision",
        lowerBodyFrameStateRuntime: "lower-body-frame-state",
      };
      const decisionSnapshotRuntime = {
        lowerBodyDrive: "lower-body-drive",
        lowerBodyTrackingReady: true,
        playerSquatPresentationDepth: 0.4,
        rootOrientation: "root-orientation",
        shouldApplyLowerBody: true,
        visualRootDrop: 0.2,
      };
      const locomotionFrameOrchestrationRuntime = {
        calibratedFloorCorrection: 0.12,
        hipsFrameRuntime: {
          hipsApplication: "hips-application",
          hipsPositionOptions: "hips-position-options",
        },
        status: "ready",
        stepResponse: "step-response",
      };
      vi.mocked(applyMovementAvatarFramePreparationOrchestrationRuntime).mockReturnValue(framePreparationRuntime as never);
      vi.mocked(applyMovementAvatarLowerBodyFrameStateOrchestrationRuntime)
        .mockReturnValue(lowerBodyFrameStateOrchestrationRuntime as never);
      vi.mocked(resolveMovementAvatarFrameDecisionSnapshotRuntime).mockReturnValue(decisionSnapshotRuntime as never);
      vi.mocked(applyMovementAvatarLocomotionFrameOrchestrationRuntime)
        .mockReturnValue(locomotionFrameOrchestrationRuntime as never);

      expect(applyMovementAvatarPreBodyFrameOrchestrationRuntime(input())).toEqual({
        decisionSnapshotRuntime,
        framePreparationRuntime,
        locomotionFrameOrchestrationRuntime,
        lowerBodyFrameStateOrchestrationRuntime,
        status: "ready",
      });
    });
  });
});
