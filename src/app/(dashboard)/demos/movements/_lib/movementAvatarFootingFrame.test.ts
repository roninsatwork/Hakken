import * as THREE from "three";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  applyMovementAvatarFootingFrameOrchestrationRuntime,
  applyMovementAvatarFootingFrameRefsRuntime,
  applyMovementAvatarFootingFrameRuntime,
  applyMovementAvatarFootLockRuntimeFrame,
  applyMovementAvatarFootLockRuntimeRootCorrection,
  applyMovementAvatarHipsRuntimeToBone,
  applyMovementAvatarRootStepRuntimeResponse,
  buildMovementAvatarFootLockRuntimeDebugTelemetry,
  resolveMovementAvatarFootLockRuntimeDecision,
  resolveMovementAvatarFootWorldRuntimeSnapshot,
  resolveMovementAvatarHipsRuntimePosition,
} from "./movementAvatarFootingFrame";
import { createMovementAvatarFootLockState, resolveMovementAvatarFootLockApplication } from "./movementAvatarFootLock";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
  resolveMovementAvatarFootLockOptions,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

describe("movementAvatarFootLockRuntime (merged)", () => {
  function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral",
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
      ...overrides,
    };
  }

  function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: [],
        sourceQuality: 0.9,
      },
      hipDrop: 0,
      kneeLift: {
        left: 0,
        right: 0,
      },
      segments: {},
      squatDepth: 0.4,
      ...overrides,
    };
  }

  describe("movementAvatarFootLockRuntime", () => {
    it("builds foot-lock debug telemetry from current runtime state", () => {
      expect(buildMovementAvatarFootLockRuntimeDebugTelemetry({
        correction: 0.12,
        drift: 0.34,
        state: {
          correction: new THREE.Vector3(),
          left: null,
          right: null,
          strength: 0.56,
        },
      })).toEqual({
        correction: 0.12,
        drift: 0.34,
        strength: 0.56,
      });
    });

    it("releases the current foot lock when runtime objects are unavailable", () => {
      const state = createMovementAvatarFootLockState();
      state.strength = 0.5;

      const decision = resolveMovementAvatarFootLockRuntimeDecision({
        avatarRole: "player",
        currentLeft: null,
        currentRight: new THREE.Vector3(0.4, -2.7, 0),
        hasAvatarRoot: true,
        lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
        lowerBodyTrackingReady: true,
        previousState: state,
        retargetFrame: retargetFrame(),
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
      });

      expect(decision.shouldLock).toBe(false);
      expect(decision.footLockDecision.shouldApplyCorrection).toBe(false);
      expect(decision.footLockDecision.nextState.strength).toBeLessThan(0.5);
    });

    it("does not lock a neutral player even when feet are available", () => {
      const decision = resolveMovementAvatarFootLockRuntimeDecision({
        avatarRole: "player",
        currentLeft: new THREE.Vector3(-0.4, -2.7, 0),
        currentRight: new THREE.Vector3(0.4, -2.7, 0),
        hasAvatarRoot: true,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        previousState: createMovementAvatarFootLockState(),
        retargetFrame: retargetFrame(),
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
      });

      expect(decision.shouldLock).toBe(false);
      expect(decision.footLockDecision.nextState.left).toBeNull();
      expect(decision.footLockDecision.nextState.right).toBeNull();
    });

    it("initializes foot anchors for a reliable player squat lock", () => {
      const left = new THREE.Vector3(-0.4, -2.7, 0);
      const right = new THREE.Vector3(0.4, -2.7, 0);
      const decision = resolveMovementAvatarFootLockRuntimeDecision({
        avatarRole: "player",
        currentLeft: left,
        currentRight: right,
        hasAvatarRoot: true,
        lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
        lowerBodyTrackingReady: true,
        previousState: createMovementAvatarFootLockState(),
        retargetFrame: retargetFrame(),
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
      });

      expect(decision.shouldLock).toBe(true);
      expect(decision.footLockDecision.nextState.left).toEqual(left);
      expect(decision.footLockDecision.nextState.right).toEqual(right);
      expect(decision.footLockDecision.nextState.strength).toBe(decision.options.initialStrength);
    });

    it("yields legacy foot locking when the shared support-contact constraint applied", () => {
      const decision = resolveMovementAvatarFootLockRuntimeDecision({
        avatarRole: "player",
        currentLeft: new THREE.Vector3(-0.4, -2.7, 0),
        currentRight: new THREE.Vector3(0.4, -2.7, 0),
        hasAvatarRoot: true,
        lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
        lowerBodyTrackingReady: true,
        previousState: createMovementAvatarFootLockState(),
        retargetFrame: retargetFrame(),
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
        shouldYieldToSupportContact: true,
      });

      expect(decision.shouldLock).toBe(false);
      expect(decision.footLockDecision.shouldApplyCorrection).toBe(false);
    });

    it("skips root correction when the avatar root is unavailable", () => {
      const options = resolveMovementAvatarFootLockOptions({ avatarRole: "player" });
      const decision = resolveMovementAvatarFootLockApplication({
        currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
        currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
        options,
        previousState: {
          correction: new THREE.Vector3(),
          left: new THREE.Vector3(-0.4, -2.7, 0),
          right: new THREE.Vector3(0.4, -2.7, 0),
          strength: 0.5,
        },
        shouldLock: true,
      });

      expect(applyMovementAvatarFootLockRuntimeRootCorrection({
        avatarRoot: null,
        footLockDecision: decision,
        options,
      })).toEqual({
        applied: false,
        correctionScale: 0,
        verticalCorrectionScale: 0,
      });
    });

    it("applies foot-lock correction to the avatar root and updates world matrices", () => {
      const options = resolveMovementAvatarFootLockOptions({ avatarRole: "player" });
      const avatarRoot = new THREE.Object3D();
      const decision = resolveMovementAvatarFootLockApplication({
        currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
        currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
        options,
        previousState: {
          correction: new THREE.Vector3(),
          left: new THREE.Vector3(-0.4, -2.7, 0),
          right: new THREE.Vector3(0.4, -2.7, 0),
          strength: 0.5,
        },
        shouldLock: true,
      });

      const result = applyMovementAvatarFootLockRuntimeRootCorrection({
        avatarRoot,
        footLockDecision: decision,
        options,
      });

      expect(result.applied).toBe(true);
      expect(avatarRoot.position.x).toBeCloseTo(
        decision.nextState.correction.x * result.correctionScale,
      );
      expect(avatarRoot.position.y).toBeCloseTo(
        decision.nextState.correction.y * result.verticalCorrectionScale,
      );
      expect(avatarRoot.matrixWorldNeedsUpdate).toBe(false);
    });

    it("applies a full foot-lock runtime frame and returns state telemetry", () => {
      const avatarRoot = new THREE.Object3D();
      const previousState = {
        correction: new THREE.Vector3(),
        left: new THREE.Vector3(-0.4, -2.7, 0),
        right: new THREE.Vector3(0.4, -2.7, 0),
        strength: 0.5,
      };

      const application = applyMovementAvatarFootLockRuntimeFrame({
        avatarRole: "player",
        avatarRoot,
        currentLeft: new THREE.Vector3(-0.5, -2.65, -0.2),
        currentRight: new THREE.Vector3(0.3, -2.65, -0.2),
        lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: true }),
        lowerBodyTrackingReady: true,
        previousState,
        retargetFrame: retargetFrame(),
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
      });

      expect(application.shouldLock).toBe(true);
      expect(application.nextState.strength).toBeGreaterThan(previousState.strength);
      expect(application.appliedCorrection).toBeGreaterThan(0);
      expect(application.rootCorrection.applied).toBe(true);
      expect(avatarRoot.position.length()).toBeGreaterThan(0);
    });
  });
});

describe("movementAvatarFootWorldRuntime (merged)", () => {
  describe("movementAvatarFootWorldRuntime", () => {
    it("returns an empty snapshot when feet are missing or reads are disabled", () => {
      expect(resolveMovementAvatarFootWorldRuntimeSnapshot({
        leftFoot: null,
        rightFoot: new THREE.Object3D(),
      })).toEqual({
        left: null,
        lowestFootY: null,
        right: null,
      });

      expect(resolveMovementAvatarFootWorldRuntimeSnapshot({
        leftFoot: new THREE.Object3D(),
        rightFoot: new THREE.Object3D(),
        shouldRead: false,
      })).toEqual({
        left: null,
        lowestFootY: null,
        right: null,
      });
    });

    it("reads cloned world positions and lowest foot height from parented feet", () => {
      const scene = new THREE.Object3D();
      const avatarRoot = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      scene.add(avatarRoot);
      avatarRoot.position.set(1, -2, 0.5);
      avatarRoot.add(leftFoot);
      avatarRoot.add(rightFoot);
      leftFoot.position.set(-0.2, -0.4, 0.1);
      rightFoot.position.set(0.2, -0.6, -0.1);

      const snapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
        avatarRoot,
        leftFoot,
        rightFoot,
        scene,
      });

      expect(snapshot.left?.x).toBeCloseTo(0.8);
      expect(snapshot.left?.y).toBeCloseTo(-2.4);
      expect(snapshot.right?.x).toBeCloseTo(1.2);
      expect(snapshot.right?.y).toBeCloseTo(-2.6);
      expect(snapshot.lowestFootY).toBeCloseTo(-2.6);
      expect(snapshot.left).not.toBe(leftFoot.position);
      expect(snapshot.right).not.toBe(rightFoot.position);
    });
  });
});

describe("movementAvatarHipsRuntime (merged)", () => {
  const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
    avatarRootVisualLerp: 0.28,
    floorContactCorrectionScale: 0.7,
    rootLerp: 0.5,
    shouldUseCalibratedFloorCorrection: true,
    squatHipDropLimit: 0.88,
    squatHipDropScale: 0.78,
  };

  const neutralHipsApplication: MovementAvatarHipsApplicationDecision = {
    shouldApplyFloorContactCorrection: false,
    shouldApplySquatDrop: false,
    squatDrop: 0,
  };

  describe("movementAvatarHipsRuntime", () => {
    it("eases hips toward the squat-drop target", () => {
      const decision = resolveMovementAvatarHipsRuntimePosition({
        baseHipsY: 1,
        currentHipsY: 1,
        floorY: -2.75,
        hipsApplication: {
          shouldApplyFloorContactCorrection: false,
          shouldApplySquatDrop: true,
          squatDrop: 0.4,
        },
        hipsPositionOptions,
        lowestFootY: null,
      });

      expect(decision.squatTargetY).toBeCloseTo(0.6);
      expect(decision.nextHipsY).toBeCloseTo(0.8);
      expect(decision.floorContactCorrection).toBe(0);
    });

    it("keeps hips moving toward neutral when no lower-body drop is active", () => {
      const decision = resolveMovementAvatarHipsRuntimePosition({
        baseHipsY: 1,
        currentHipsY: 0.6,
        floorY: -2.75,
        hipsApplication: neutralHipsApplication,
        hipsPositionOptions,
        lowestFootY: -3,
      });

      expect(decision.squatTargetY).toBe(1);
      expect(decision.nextHipsY).toBeCloseTo(0.8);
      expect(decision.floorContactCorrection).toBe(0);
    });

    it("applies clamped floor-contact correction after the root lerp", () => {
      const decision = resolveMovementAvatarHipsRuntimePosition({
        baseHipsY: 1,
        currentHipsY: 1,
        floorY: -2.75,
        hipsApplication: {
          shouldApplyFloorContactCorrection: true,
          shouldApplySquatDrop: false,
          squatDrop: 0,
        },
        hipsPositionOptions,
        lowestFootY: -5,
      });

      expect(decision.floorContactCorrection).toBeCloseTo(0.18 * 0.7);
      expect(decision.nextHipsY).toBeCloseTo(1 + 0.18 * 0.7);
    });

    it("captures the base hips position and writes the resolved hips Y to the bone", () => {
      const hipsNode = {
        position: new THREE.Vector3(0, 1, 0),
      };
      const application = applyMovementAvatarHipsRuntimeToBone({
        baseHipsPosition: null,
        floorY: -2.75,
        hipsApplication: {
          shouldApplyFloorContactCorrection: false,
          shouldApplySquatDrop: true,
          squatDrop: 0.4,
        },
        hipsNode,
        hipsPositionOptions,
        lowestFootY: null,
      });

      expect(application.applied).toBe(true);
      expect(application.nextBaseHipsPosition?.y).toBe(1);
      expect(application.positionDecision?.nextHipsY).toBeCloseTo(0.8);
      expect(hipsNode.position.y).toBeCloseTo(0.8);
    });

    it("skips hips writeback when the bone is unavailable", () => {
      const baseHipsPosition = new THREE.Vector3(0, 1, 0);
      const application = applyMovementAvatarHipsRuntimeToBone({
        baseHipsPosition,
        floorY: -2.75,
        hipsApplication: neutralHipsApplication,
        hipsNode: null,
        hipsPositionOptions,
        lowestFootY: null,
      });

      expect(application).toEqual({
        applied: false,
        nextBaseHipsPosition: baseHipsPosition,
        positionDecision: null,
      });
    });
  });
});

describe("movementAvatarRootStepRuntime (merged)", () => {
  describe("movementAvatarRootStepRuntime", () => {
    it("applies active root step responses to the selected foot", () => {
      const scene = new THREE.Object3D();
      const leftParent = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      scene.add(leftParent);
      leftParent.add(leftFoot);
      scene.add(rightFoot);
      leftFoot.position.set(0.2, -2.1, 0.5);

      const result = applyMovementAvatarRootStepRuntimeResponse({
        leftFoot,
        rightFoot,
        scene,
        stepResponse: {
          footLiftOffset: 0.2,
          landingCompression: 0,
          owner: "step-response-left-release",
          shouldApply: true,
          side: "left",
          slerp: 0.5,
          summary: "left foot lift",
        },
      });

      expect(result).toEqual({ applied: true });
      expect(leftFoot.position.y).toBeCloseTo(-2);
    });

    it("returns a neutral result when the step response is inactive", () => {
      expect(applyMovementAvatarRootStepRuntimeResponse({
        leftFoot: new THREE.Object3D(),
        rightFoot: new THREE.Object3D(),
        scene: new THREE.Object3D(),
        stepResponse: {
          footLiftOffset: 0,
          landingCompression: 0,
          owner: "step-response-none",
          shouldApply: false,
          side: null,
          slerp: 0,
          summary: "none",
        },
      })).toEqual({ applied: false });
    });
  });
});

describe("movementAvatarFootingFrameRuntime (merged)", () => {
  const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
    avatarRootVisualLerp: 0.28,
    floorContactCorrectionScale: 0.7,
    rootLerp: 0.5,
    shouldUseCalibratedFloorCorrection: true,
    squatHipDropLimit: 0.88,
    squatHipDropScale: 0.78,
  };

  const neutralHipsApplication: MovementAvatarHipsApplicationDecision = {
    shouldApplyFloorContactCorrection: false,
    shouldApplySquatDrop: false,
    squatDrop: 0,
  };

  function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0.4,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "planted-squat",
      playerSquatPresentationDepth: 0.4,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: true,
      visualRootDrop: 0.2,
      ...overrides,
    };
  }

  function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: [],
        sourceQuality: 0.9,
      },
      hipDrop: 0.2,
      kneeLift: {
        left: 0,
        right: 0,
      },
      segments: {},
      squatDepth: 0.4,
      ...overrides,
    };
  }

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

  describe("movementAvatarFootingFrameRuntime", () => {
    it("composes foot reads, hips writeback, foot lock, and step response", () => {
      const scene = new THREE.Object3D();
      const avatarRoot = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      const hipsNode = {
        position: new THREE.Vector3(0, 1, 0),
      };
      scene.add(avatarRoot);
      avatarRoot.position.set(1, -2, 0.5);
      avatarRoot.add(leftFoot);
      avatarRoot.add(rightFoot);
      leftFoot.position.set(-0.2, -0.4, 0.1);
      rightFoot.position.set(0.2, -0.6, -0.1);

      const result = applyMovementAvatarFootingFrameRuntime({
        avatarRole: "player",
        avatarRoot,
        baseHipsPosition: null,
        floorY: -2.75,
        hipsApplication: {
          shouldApplyFloorContactCorrection: true,
          shouldApplySquatDrop: true,
          squatDrop: 0.4,
        },
        hipsNode,
        hipsPositionOptions,
        leftFoot,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        previousFootLockState: createMovementAvatarFootLockState(),
        retargetFrame: retargetFrame(),
        rightFoot,
        scene,
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
        stepResponse: {
          footLiftOffset: 0.2,
          landingCompression: 0,
          owner: "step-response-left-release",
          shouldApply: true,
          side: "left",
          slerp: 0.5,
          summary: "left foot lift",
        },
      });

      expect(result.footWorldSnapshot.left?.x).toBeCloseTo(0.8);
      expect(result.footWorldSnapshot.lowestFootY).toBeCloseTo(-2.6);
      expect(result.hipsRuntimeApplication.applied).toBe(true);
      expect(result.nextBaseHipsPosition?.y).toBe(1);
      expect(hipsNode.position.y).toBeLessThan(1);
      expect(result.footLockRuntimeApplication.shouldLock).toBe(true);
      expect(result.nextFootLockState.strength).toBeGreaterThan(0);
      expect(result.footLockDebug.strength).toBe(result.nextFootLockState.strength);
      expect(result.rootStepApplication.applied).toBe(true);
      expect(leftFoot.position.y).toBeGreaterThan(-0.4);
    });

    it("measures planted-foot drift after the hips move within the frame", () => {
      const scene = new THREE.Object3D();
      const avatarRoot = new THREE.Object3D();
      const hipsNode = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      scene.add(avatarRoot);
      avatarRoot.add(hipsNode);
      hipsNode.position.set(0, 1, 0);
      hipsNode.add(leftFoot);
      hipsNode.add(rightFoot);
      leftFoot.position.set(-0.4, -1, 0);
      rightFoot.position.set(0.4, -1, 0);
      scene.updateMatrixWorld(true);
      const anchoredLeft = leftFoot.getWorldPosition(new THREE.Vector3());
      const anchoredRight = rightFoot.getWorldPosition(new THREE.Vector3());

      const result = applyMovementAvatarFootingFrameRuntime({
        avatarRole: "player",
        avatarRoot,
        baseHipsPosition: hipsNode.position.clone(),
        floorY: 0,
        hipsApplication: {
          shouldApplyFloorContactCorrection: false,
          shouldApplySquatDrop: true,
          squatDrop: 0.4,
        },
        hipsNode,
        hipsPositionOptions,
        leftFoot,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        previousFootLockState: {
          correction: new THREE.Vector3(),
          left: anchoredLeft,
          right: anchoredRight,
          strength: 1,
        },
        retargetFrame: retargetFrame(),
        rightFoot,
        scene,
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
        stepResponse: inactiveStepResponse(),
      });

      expect(result.hipsRuntimeApplication.positionDecision?.nextHipsY).toBeCloseTo(0.8);
      expect(result.footLockRuntimeApplication.appliedCorrection).toBeGreaterThan(0.15);
      expect(result.footWorldSnapshot.left?.y).toBeCloseTo(anchoredLeft.y, 4);
      expect(result.footWorldSnapshot.right?.y).toBeCloseTo(anchoredRight.y, 4);
    });

    it("returns neutral applications when runtime objects are unavailable", () => {
      const previousFootLockState = createMovementAvatarFootLockState();

      const result = applyMovementAvatarFootingFrameRuntime({
        avatarRole: "player",
        avatarRoot: null,
        baseHipsPosition: new THREE.Vector3(0, 1, 0),
        floorY: -2.75,
        hipsApplication: neutralHipsApplication,
        hipsNode: null,
        hipsPositionOptions,
        leftFoot: null,
        lowerBodyDrive: lowerBodyDrive({ shouldDrivePlayerSquat: false }),
        lowerBodyTrackingReady: false,
        previousFootLockState,
        retargetFrame: retargetFrame({
          contacts: {
            leftFoot: false,
            rightFoot: false,
          },
        }),
        rightFoot: null,
        scene: null,
        shouldApplyLowerBody: false,
        shouldHoldPlayerSquatPose: false,
        stepResponse: inactiveStepResponse(),
      });

      expect(result.footWorldSnapshot).toEqual({
        left: null,
        lowestFootY: null,
        right: null,
      });
      expect(result.hipsRuntimeApplication.applied).toBe(false);
      expect(result.footLockRuntimeApplication.shouldLock).toBe(false);
      expect(result.nextFootLockState.strength).toBe(0);
      expect(result.rootStepApplication).toEqual({ applied: false });
    });
  });
});

describe("movementAvatarFootingFrameRefsRuntime (merged)", () => {
  describe("movementAvatarFootingFrameRefsRuntime", () => {
    it("applies base hips and planted foot-lock refs while returning drift telemetry", () => {
      const nextBaseHipsPosition = new THREE.Vector3(1, 2, 3);
      const nextFootLockState = {
        correction: new THREE.Vector3(0.1, 0, -0.1),
        left: null,
        right: null,
        strength: 0.8,
      };
      const baseHipsPositionRef = {
        current: null,
      };
      const plantedFootLockRef = {
        current: {
          correction: new THREE.Vector3(),
          left: null,
          right: null,
          strength: 0,
        },
      };

      const result = applyMovementAvatarFootingFrameRefsRuntime({
        baseHipsPositionRef,
        footingRuntime: {
          footLockRuntimeApplication: {
            appliedCorrection: 0.24,
            drift: 0.42,
          },
          nextBaseHipsPosition,
          nextFootLockState,
        } as never,
        plantedFootLockRef,
      });

      expect(baseHipsPositionRef.current).toBe(nextBaseHipsPosition);
      expect(plantedFootLockRef.current).toBe(nextFootLockState);
      expect(result).toEqual({
        footLockCorrection: 0.24,
        footLockDrift: 0.42,
        footLockState: nextFootLockState,
      });
    });

    it("allows the next base hips position to clear", () => {
      const baseHipsPositionRef = {
        current: new THREE.Vector3(1, 2, 3),
      };
      const nextFootLockState = {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0,
      };
      const plantedFootLockRef = {
        current: nextFootLockState,
      };

      applyMovementAvatarFootingFrameRefsRuntime({
        baseHipsPositionRef,
        footingRuntime: {
          footLockRuntimeApplication: {
            appliedCorrection: 0,
            drift: 0,
          },
          nextBaseHipsPosition: null,
          nextFootLockState,
        } as never,
        plantedFootLockRef,
      });

      expect(baseHipsPositionRef.current).toBeNull();
    });
  });
});

describe("movementAvatarFootingFrameOrchestrationRuntime (merged)", () => {
  const hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision = {
    avatarRootVisualLerp: 0.28,
    floorContactCorrectionScale: 0.7,
    rootLerp: 0.5,
    shouldUseCalibratedFloorCorrection: true,
    squatHipDropLimit: 0.88,
    squatHipDropScale: 0.78,
  };

  const hipsApplication: MovementAvatarHipsApplicationDecision = {
    shouldApplyFloorContactCorrection: true,
    shouldApplySquatDrop: true,
    squatDrop: 0.4,
  };

  function lowerBodyDrive(): MovementAvatarLowerBodyDrive {
    return {
      groundedSquatDepth: 0,
      liveSquatDepth: 0.4,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "planted-squat",
      playerSquatPresentationDepth: 0.4,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: true,
      visualRootDrop: 0.2,
    };
  }

  function retargetFrame(): MovementRetargetFrame {
    return {
      contacts: {
        leftFoot: true,
        rightFoot: true,
      },
      debug: {
        heldSegments: [],
        solvedSegments: [],
        sourceQuality: 0.9,
      },
      hipDrop: 0.2,
      kneeLift: {
        left: 0,
        right: 0,
      },
      segments: {},
      squatDepth: 0.4,
    };
  }

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

  describe("movementAvatarFootingFrameOrchestrationRuntime", () => {
    it("looks up foot bones, applies footing, and threads refs", () => {
      const scene = new THREE.Object3D();
      const avatarRoot = new THREE.Object3D();
      const leftFoot = new THREE.Object3D();
      const rightFoot = new THREE.Object3D();
      const hipsNode = {
        position: new THREE.Vector3(0, 1, 0),
      };
      scene.add(avatarRoot);
      avatarRoot.position.set(1, -2, 0.5);
      avatarRoot.add(leftFoot);
      avatarRoot.add(rightFoot);
      leftFoot.position.set(-0.2, -0.4, 0.1);
      rightFoot.position.set(0.2, -0.6, -0.1);
      const baseHipsPositionRef = {
        current: null as THREE.Vector3 | null,
      };
      const plantedFootLockRef = {
        current: createMovementAvatarFootLockState(),
      };
      const lookups: string[] = [];

      const result = applyMovementAvatarFootingFrameOrchestrationRuntime({
        avatarRole: "player",
        avatarRoot,
        baseHipsPositionRef,
        floorY: -2.75,
        hipsApplication,
        hipsNode,
        hipsPositionOptions,
        lookupBone: (bone) => {
          lookups.push(bone);
          if (bone === "leftFoot") return leftFoot;
          if (bone === "rightFoot") return rightFoot;
          return null;
        },
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        plantedFootLockRef,
        retargetFrame: retargetFrame(),
        scene,
        shouldApplyLowerBody: true,
        shouldHoldPlayerSquatPose: false,
        stepResponse: inactiveStepResponse(),
      });

      expect(lookups).toEqual(["leftFoot", "rightFoot"]);
      expect(result.footingRuntime.footWorldSnapshot.left?.x).toBeCloseTo(0.8);
      expect(baseHipsPositionRef.current?.y).toBe(1);
      expect(plantedFootLockRef.current.strength).toBeGreaterThan(0);
      expect(result.footLockCorrection).toBe(result.footingRuntime.footLockRuntimeApplication.appliedCorrection);
      expect(result.footLockDrift).toBe(result.footingRuntime.footLockRuntimeApplication.drift);
      expect(result.footLockState).toBe(result.footingRuntime.nextFootLockState);
    });
  });
});
