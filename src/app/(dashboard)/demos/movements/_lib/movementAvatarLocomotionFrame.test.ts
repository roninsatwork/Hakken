import * as THREE from "three";
import {
  describe,
  expect,
  it,
} from "vitest";
import {
  applyMovementAvatarLocomotionFrameOrchestrationRuntime,
  applyMovementAvatarRootFrameOrchestrationRuntime,
  applyMovementAvatarRootFrameRefsRuntime,
  applyMovementAvatarRootFrameRuntime,
  applyMovementAvatarRootTransformRuntime,
  resolveMovementAvatarFloorRuntime,
  resolveMovementAvatarHipsFrameRuntime,
  resolveMovementAvatarRootMotionRuntimeFrame,
} from "./movementAvatarLocomotionFrame";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import type { MovementRootMotionFrame, MovementRootMotionInputFrame } from "./movementRootMotion";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

describe("movementAvatarFloorRuntime (merged)", () => {
  function buildSolverPose(overrides: Record<number, Partial<VrmSolverLandmark>> = {}): VrmSolverLandmark[] {
    return Array.from({ length: 33 }, (_, index) => ({
      x: index / 100,
      y: index / 80,
      z: 0,
      visibility: 0.9,
      ...overrides[index],
    }));
  }

  describe("movementAvatarFloorRuntime", () => {
    it("samples the lowest visible foot landmark and applies calibrated floor correction", () => {
      const calibration = buildMovementCalibration({
        poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
      });
      const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
      const decision = resolveMovementAvatarFloorRuntime({
        calibration,
        poseLandmarks: buildSolverPose({
          27: { y: 0.8, visibility: 0.2 },
          28: { y: 1.1, visibility: 0.5 },
          31: { y: 0.9, visibility: 0.4 },
          32: { y: 1.05, visibility: 0.95 },
        }),
        profile,
        rigMeasurements: null,
        shouldUseCalibratedFloorCorrection: true,
      });

      expect(decision.currentFloorY).toBe(1.1);
      expect(decision.floorConfidence).toBe(0.95);
      expect(decision.calibratedFloorCorrection).toBeCloseTo(0.224);
    });

    it("keeps floor correction disabled when hips options do not request it", () => {
      const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
      const decision = resolveMovementAvatarFloorRuntime({
        calibration: null,
        poseLandmarks: buildSolverPose({
          27: { y: 1.1, visibility: 0.9 },
        }),
        profile,
        rigMeasurements: null,
        shouldUseCalibratedFloorCorrection: false,
      });

      expect(decision.currentFloorY).toBeGreaterThan(1);
      expect(decision.calibratedFloorCorrection).toBe(0);
    });

    it("keeps calibrated floor correction at zero when foot confidence is too low", () => {
      const calibration = buildMovementCalibration({
        poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
      });
      const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
      const decision = resolveMovementAvatarFloorRuntime({
        calibration,
        poseLandmarks: buildSolverPose({
          27: { y: 1.1, visibility: 0.1 },
          28: { y: 1.1, visibility: 0.2 },
          31: { y: 1.1, visibility: 0.1 },
          32: { y: 1.1, visibility: 0.2 },
        }),
        profile,
        rigMeasurements: null,
        shouldUseCalibratedFloorCorrection: true,
      });

      expect(decision.floorConfidence).toBe(0.2);
      expect(decision.calibratedFloorCorrection).toBe(0);
    });
  });
});

describe("movementAvatarRootMotionRuntime (merged)", () => {
  function pose(offset = { x: 0, z: 0 }): TrackingLandmark[] {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.9,
    }));
    const points: Record<number, TrackingLandmark> = {
      0: { x: 0, y: 1.72, z: -0.08, visibility: 0.95 },
      11: { x: -0.22, y: 1.48, z: 0, visibility: 0.95 },
      12: { x: 0.22, y: 1.48, z: 0, visibility: 0.95 },
      23: { x: -0.14, y: 1.02, z: 0, visibility: 0.95 },
      24: { x: 0.14, y: 1.02, z: 0, visibility: 0.95 },
      25: { x: -0.14, y: 0.54, z: 0.02, visibility: 0.9 },
      26: { x: 0.14, y: 0.54, z: 0.02, visibility: 0.9 },
      27: { x: -0.14, y: 0.08, z: 0.04, visibility: 0.9 },
      28: { x: 0.14, y: 0.08, z: 0.04, visibility: 0.9 },
      29: { x: -0.15, y: 0.02, z: -0.06, visibility: 0.9 },
      30: { x: 0.15, y: 0.02, z: -0.06, visibility: 0.9 },
      31: { x: -0.13, y: 0, z: 0.18, visibility: 0.9 },
      32: { x: 0.13, y: 0, z: 0.18, visibility: 0.9 },
    };

    Object.entries(points).forEach(([index, point]) => {
      landmarks[Number(index)] = {
        ...point,
        visibility: point.visibility ?? 0.9,
        x: point.x + offset.x,
        z: (point.z ?? 0) + offset.z,
      };
    });

    return landmarks;
  }

  function rootMotionFrame(overrides: Partial<MovementRootMotionFrame> = {}): MovementRootMotionFrame {
    return {
      debug: {
        reasons: [],
        source: "world-landmarks",
      },
      feet: {
        left: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
        right: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
      },
      floor: {
        confidence: 0.9,
        y: 0,
      },
      frameIndex: 4,
      headingConfidence: 0.9,
      headingYaw: 0.2,
      intent: {
        confidence: 0.9,
        headingDelta: 0,
        key: "root-stationary",
        label: "Root stationary",
        plantedFoot: "both",
        summary: "stationary",
        swingFoot: "none",
        travelDirection: "none",
        travelDistance: 0,
      },
      rootPosition: { x: 0, y: 0, z: 0 },
      rootPositionConfidence: 0.9,
      ...overrides,
    };
  }

  describe("movementAvatarRootMotionRuntime", () => {
    it("uses recorded root motion without mutating live history", () => {
      const history: MovementRootMotionInputFrame[] = [];
      const recordedRootMotionFrame = rootMotionFrame({
        frameIndex: 12,
        rootPosition: { x: 0.4, y: 0, z: 0.2 },
      });

      const result = resolveMovementAvatarRootMotionRuntimeFrame({
        history,
        livePose: pose(),
        liveWorldPose: pose(),
        recordedRootMotionFrame,
      });

      expect(result).toBe(recordedRootMotionFrame);
      expect(history).toHaveLength(0);
    });

    it("appends live player root-motion history when no recorded frame is provided", () => {
      const history: MovementRootMotionInputFrame[] = [];
      const firstPose = pose();
      const secondPose = pose({ x: 0.15, z: 0.05 });

      const first = resolveMovementAvatarRootMotionRuntimeFrame({
        history,
        livePose: firstPose,
        liveWorldPose: firstPose,
        recordedRootMotionFrame: null,
      });
      const second = resolveMovementAvatarRootMotionRuntimeFrame({
        history,
        livePose: secondPose,
        liveWorldPose: secondPose,
        recordedRootMotionFrame: null,
      });

      expect(first?.frameIndex).toBe(0);
      expect(second?.frameIndex).toBe(1);
      expect(history).toHaveLength(2);
      expect(second?.debug.source).toBe("world-landmarks");
    });
  });
});

describe("movementAvatarRootTransformRuntime (merged)", () => {
  function rootTarget(overrides: Partial<MovementAvatarRootTargetDecision> = {}): MovementAvatarRootTargetDecision {
    return {
      jumpResponse: {
        heightOffset: 0,
        landingCompression: 0,
        lift: 0,
        owner: "jump-response-none",
        shouldApply: false,
        slerp: 0,
        summary: "none",
      },
      rootHeadingYaw: 0,
      rootHeightLerp: 0.5,
      rootOrientationSlerp: 0.25,
      source: "world-landmarks",
      stepResponse: {
        footLiftOffset: 0,
        landingCompression: 0,
        owner: "step-response-none",
        shouldApply: false,
        side: null,
        slerp: 0,
        summary: "none",
      },
      targetHeightDrop: 0,
      targetJumpHeightOffset: 0,
      targetPitch: 0.4,
      targetRoll: -0.2,
      targetX: 1,
      targetY: -2,
      targetYaw: Math.PI + 0.5,
      targetZ: -1,
      ...overrides,
    };
  }

  describe("movementAvatarRootTransformRuntime", () => {
    it("resolves and applies root transform targets to a Three root", () => {
      const root = new THREE.Object3D();
      root.position.set(0, -3, 0);
      root.rotation.set(0, Math.PI, 0);

      const runtime = applyMovementAvatarRootTransformRuntime({
        root,
        rootTarget: rootTarget(),
      });

      expect(runtime.result).toEqual({ applied: true });
      expect(runtime.application?.rotation.x).toBeCloseTo(0.1);
      expect(runtime.application?.rotation.y).toBeCloseTo(Math.PI + 0.11);
      expect(runtime.application?.position.y).toBeCloseTo(-2.5);
      expect(root.rotation.x).toBeCloseTo(runtime.application!.rotation.x);
      expect(root.position.y).toBeCloseTo(runtime.application!.position.y);
    });

    it("returns a no-op result when root is unavailable", () => {
      expect(applyMovementAvatarRootTransformRuntime({
        root: null,
        rootTarget: rootTarget(),
      })).toEqual({
        application: null,
        result: { applied: false },
      });
    });

    it("keeps support-contact correction out of the next root-height command", () => {
      const root = new THREE.Object3D();
      const rootCommandYRef = { current: -2.5 as number | null };
      // The rendered root includes a +0.9 floor-contact correction.
      root.position.set(0, -1.6, 0);

      const runtime = applyMovementAvatarRootTransformRuntime({
        root,
        rootCommandYRef,
        rootTarget: rootTarget({ targetY: -2 }),
      });

      expect(runtime.application?.position.y).toBeCloseTo(-1.35);
      expect(rootCommandYRef.current).toBeCloseTo(-2.25);
      expect(root.position.y).toBeCloseTo(-1.35);
    });
  });
});

describe("movementAvatarRootFrameRuntime (merged)", () => {
  const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
    heightLerp: 0.16,
    owner: "upright-root",
    reason: "upright",
    shouldApply: false,
    shouldApplyHeight: false,
    slerp: 0.16,
    targetHeightDrop: 0,
    targetPitch: 0,
    targetRoll: 0,
  };

  function pose(offset = { x: 0, z: 0 }): TrackingLandmark[] {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.9,
    }));
    const points: Record<number, TrackingLandmark> = {
      0: { x: 0, y: 1.72, z: -0.08, visibility: 0.95 },
      11: { x: -0.22, y: 1.48, z: 0, visibility: 0.95 },
      12: { x: 0.22, y: 1.48, z: 0, visibility: 0.95 },
      23: { x: -0.14, y: 1.02, z: 0, visibility: 0.95 },
      24: { x: 0.14, y: 1.02, z: 0, visibility: 0.95 },
      25: { x: -0.14, y: 0.54, z: 0.02, visibility: 0.9 },
      26: { x: 0.14, y: 0.54, z: 0.02, visibility: 0.9 },
      27: { x: -0.14, y: 0.08, z: 0.04, visibility: 0.9 },
      28: { x: 0.14, y: 0.08, z: 0.04, visibility: 0.9 },
      29: { x: -0.15, y: 0.02, z: -0.06, visibility: 0.9 },
      30: { x: 0.15, y: 0.02, z: -0.06, visibility: 0.9 },
      31: { x: -0.13, y: 0, z: 0.18, visibility: 0.9 },
      32: { x: 0.13, y: 0, z: 0.18, visibility: 0.9 },
    };

    Object.entries(points).forEach(([index, point]) => {
      landmarks[Number(index)] = {
        ...point,
        visibility: point.visibility ?? 0.9,
        x: point.x + offset.x,
        z: (point.z ?? 0) + offset.z,
      };
    });

    return landmarks;
  }

  function rootMotionFrame(overrides: Partial<MovementRootMotionFrame> = {}): MovementRootMotionFrame {
    return {
      debug: {
        reasons: [],
        source: "world-landmarks",
      },
      feet: {
        left: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
        right: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
      },
      floor: {
        confidence: 0.9,
        y: 0,
      },
      frameIndex: 4,
      headingConfidence: 0.9,
      headingYaw: 0.2,
      intent: {
        confidence: 0.9,
        headingDelta: 0,
        key: "root-travel",
        label: "Root travel",
        plantedFoot: "both",
        summary: "travel",
        swingFoot: "none",
        travelDirection: "forward",
        travelDistance: 0.4,
      },
      rootPosition: { x: 0.4, y: 0, z: -0.2 },
      rootPositionConfidence: 0.9,
      ...overrides,
    };
  }

  describe("movementAvatarRootFrameRuntime", () => {
    it("applies recorded root motion and returns root debug telemetry", () => {
      const root = new THREE.Object3D();
      root.position.set(0, -2.8, 0);
      root.rotation.set(0, Math.PI, 0);
      const history: MovementRootMotionInputFrame[] = [];

      const runtime = applyMovementAvatarRootFrameRuntime({
        avatarBaseY: -2.8,
        avatarRoot: root,
        avatarRootVisualLerp: 0.2,
        history,
        livePose: pose(),
        liveWorldPose: pose(),
        positionOffset: [0.2, 0, -0.3],
        recordedRootMotionFrame: rootMotionFrame(),
        rootOrientation: uprightRootOrientation,
        visualRootDrop: 0.1,
      });

      expect(history).toHaveLength(0);
      expect(runtime.rootMotion?.frameIndex).toBe(4);
      expect(runtime.rootTarget.targetX).toBeCloseTo(0.6);
      expect(runtime.rootTarget.targetZ).toBeCloseTo(-0.37);
      expect(runtime.transformRuntime.result).toEqual({ applied: true });
      expect(runtime.rootApplication).not.toBeNull();
      expect(runtime.rootDebug).toMatchObject({
        orientationOwner: "upright-root",
        source: "world-landmarks",
        stepResponseOwner: expect.any(String),
        targetYaw: 0.2,
      });
      expect(root.position.x).toBeCloseTo(runtime.rootApplication!.position.x);
    });

    it("builds live root motion history when no recorded frame is available", () => {
      const history: MovementRootMotionInputFrame[] = [];

      const first = applyMovementAvatarRootFrameRuntime({
        avatarBaseY: -2.8,
        avatarRoot: null,
        avatarRootVisualLerp: 0.2,
        history,
        livePose: pose(),
        liveWorldPose: pose(),
        positionOffset: [0, 0, 0],
        recordedRootMotionFrame: null,
        rootOrientation: uprightRootOrientation,
        visualRootDrop: 0,
      });
      const second = applyMovementAvatarRootFrameRuntime({
        avatarBaseY: -2.8,
        avatarRoot: null,
        avatarRootVisualLerp: 0.2,
        history,
        livePose: pose({ x: 0.15, z: 0.05 }),
        liveWorldPose: pose({ x: 0.15, z: 0.05 }),
        positionOffset: [0, 0, 0],
        recordedRootMotionFrame: null,
        rootOrientation: uprightRootOrientation,
        visualRootDrop: 0,
      });

      expect(first.rootMotion?.frameIndex).toBe(0);
      expect(second.rootMotion?.frameIndex).toBe(1);
      expect(history).toHaveLength(2);
      expect(second.rootDebug).toBeNull();
      expect(second.transformRuntime.result).toEqual({ applied: false });
    });
  });
});

describe("movementAvatarRootFrameRefsRuntime (merged)", () => {
  function makeTrackingDebugState(): MovementTrackingDebugState {
    return {
      bodyConfidence: {},
      fallbacks: {},
      headApplied: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      updatedAt: 10,
    };
  }

  describe("movementAvatarRootFrameRefsRuntime", () => {
    it("applies root debug telemetry to an existing tracking debug state", () => {
      const rootDebug = {
        appliedYaw: 0.1,
        appliedX: 0.2,
        appliedZ: -0.3,
        source: "world-landmarks",
        targetYaw: 0.4,
        targetX: 0.5,
        targetZ: -0.6,
      };
      const trackingDebugRef: { current: MovementTrackingDebugState | null } = {
        current: makeTrackingDebugState(),
      };

      const result = applyMovementAvatarRootFrameRefsRuntime({
        rootFrameRuntime: {
          rootDebug,
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(trackingDebugRef.current?.avatarRoot).toBe(rootDebug);
      expect(result).toEqual({
        appliedRootDebug: true,
      });
    });

    it("does not create a tracking debug state when the ref is empty", () => {
      const trackingDebugRef = {
        current: null,
      };

      const result = applyMovementAvatarRootFrameRefsRuntime({
        rootFrameRuntime: {
          rootDebug: {
            appliedYaw: 0,
            appliedX: 0,
            appliedZ: 0,
            source: "world-landmarks",
            targetYaw: 0,
            targetX: 0,
            targetZ: 0,
          },
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(trackingDebugRef.current).toBeNull();
      expect(result).toEqual({
        appliedRootDebug: false,
      });
    });

    it("leaves existing debug state unchanged when root debug is missing", () => {
      const trackingDebugState = makeTrackingDebugState();
      const trackingDebugRef = {
        current: trackingDebugState,
      };

      const result = applyMovementAvatarRootFrameRefsRuntime({
        rootFrameRuntime: {
          rootDebug: null,
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(trackingDebugRef.current).toBe(trackingDebugState);
      expect(trackingDebugRef.current.avatarRoot).toBeUndefined();
      expect(result).toEqual({
        appliedRootDebug: false,
      });
    });

    it("does not require a tracking debug ref", () => {
      expect(applyMovementAvatarRootFrameRefsRuntime({
        rootFrameRuntime: {
          rootDebug: null,
        } as never,
      })).toEqual({
        appliedRootDebug: false,
      });
    });
  });
});

describe("movementAvatarRootFrameOrchestrationRuntime (merged)", () => {
  const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
    heightLerp: 0.16,
    owner: "upright-root",
    reason: "upright",
    shouldApply: false,
    shouldApplyHeight: false,
    slerp: 0.16,
    targetHeightDrop: 0,
    targetPitch: 0,
    targetRoll: 0,
  };

  function pose(): TrackingLandmark[] {
    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0,
      y: 0,
      z: 0,
      visibility: 0.9,
    }));
    landmarks[23] = { x: -0.14, y: 1.02, z: 0, visibility: 0.95 };
    landmarks[24] = { x: 0.14, y: 1.02, z: 0, visibility: 0.95 };
    return landmarks;
  }

  function rootMotionFrame(): MovementRootMotionFrame {
    return {
      debug: {
        reasons: [],
        source: "world-landmarks",
      },
      feet: {
        left: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
        right: {
          contact: true,
          confidence: 1,
          stepPhase: "planted",
          worldPosition: null,
        },
      },
      floor: {
        confidence: 0.9,
        y: 0,
      },
      frameIndex: 4,
      headingConfidence: 0.9,
      headingYaw: 0.2,
      intent: {
        confidence: 0.9,
        headingDelta: 0,
        key: "root-travel",
        label: "Root travel",
        plantedFoot: "both",
        summary: "travel",
        swingFoot: "none",
        travelDirection: "forward",
        travelDistance: 0.4,
      },
      rootPosition: { x: 0.4, y: 0, z: -0.2 },
      rootPositionConfidence: 0.9,
    };
  }

  function trackingDebugState(): MovementTrackingDebugState {
    return {
      bodyConfidence: {},
      fallbacks: {},
      headApplied: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      headRaw: { confidence: 1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      updatedAt: 10,
    };
  }

  describe("movementAvatarRootFrameOrchestrationRuntime", () => {
    it("applies root runtime, writes root debug, and exposes step response", () => {
      const root = new THREE.Object3D();
      const trackingDebugRef = {
        current: trackingDebugState(),
      };

      const result = applyMovementAvatarRootFrameOrchestrationRuntime({
        avatarBaseY: -2.8,
        avatarRoot: root,
        avatarRootVisualLerp: 0.2,
        history: [],
        livePose: pose(),
        liveWorldPose: pose(),
        positionOffset: [0.2, 0, -0.3],
        recordedRootMotionFrame: rootMotionFrame(),
        rootOrientation: uprightRootOrientation,
        trackingDebugRef,
        visualRootDrop: 0.1,
      });

      expect(result.rootFrameRuntime.rootDebug).not.toBeNull();
      expect(trackingDebugRef.current.avatarRoot).toBe(result.rootFrameRuntime.rootDebug);
      expect(result.stepResponse).toBe(result.rootFrameRuntime.stepResponse);
    });
  });
});

describe("movementAvatarHipsFrameRuntime (merged)", () => {
  function buildSolverPose(overrides: Record<number, Partial<VrmSolverLandmark>> = {}): VrmSolverLandmark[] {
    return Array.from({ length: 33 }, (_, index) => ({
      x: index / 100,
      y: index / 80,
      z: 0,
      visibility: 0.9,
      ...overrides[index],
    }));
  }

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

  describe("movementAvatarHipsFrameRuntime", () => {
    it("resolves player squat hips and calibrated floor correction together", () => {
      const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
      const runtime = resolveMovementAvatarHipsFrameRuntime({
        avatarRole: "player",
        calibration: buildMovementCalibration({
          poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
        }),
        lowerBodyDrive: lowerBodyDrive({
          shouldDrivePlayerSquat: true,
        }),
        lowerBodyTrackingReady: true,
        playerSquatPresentationDepth: 0.5,
        poseLandmarks: buildSolverPose({
          27: { y: 0.8, visibility: 0.2 },
          28: { y: 1.1, visibility: 0.5 },
          31: { y: 0.9, visibility: 0.4 },
          32: { y: 1.05, visibility: 0.95 },
        }),
        profile,
        rigMeasurements: null,
        shouldApplyLowerBody: true,
      });

      expect(runtime.hipsPositionOptions.shouldUseCalibratedFloorCorrection).toBe(true);
      expect(runtime.floorRuntime.calibratedFloorCorrection).toBeCloseTo(0.224);
      expect(runtime.hipsApplication.shouldApplySquatDrop).toBe(true);
      expect(runtime.hipsApplication.squatDrop).toBeCloseTo(0.39);
    });

    it("keeps instructor floor correction disabled while still resolving hips options", () => {
      const profile = getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm");
      const runtime = resolveMovementAvatarHipsFrameRuntime({
        avatarRole: "instructor",
        calibration: null,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        playerSquatPresentationDepth: 0.5,
        poseLandmarks: buildSolverPose({
          27: { y: 1.1, visibility: 0.9 },
        }),
        profile,
        rigMeasurements: null,
        shouldApplyLowerBody: true,
      });

      expect(runtime.hipsPositionOptions.shouldUseCalibratedFloorCorrection).toBe(false);
      expect(runtime.floorRuntime.calibratedFloorCorrection).toBe(0);
      expect(runtime.hipsApplication.shouldApplyFloorContactCorrection).toBe(true);
    });
  });
});

describe("movementAvatarLocomotionFrameOrchestrationRuntime (merged)", () => {
  const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
    heightLerp: 0.16,
    owner: "upright-root",
    reason: "upright",
    shouldApply: false,
    shouldApplyHeight: false,
    slerp: 0.16,
    targetHeightDrop: 0,
    targetPitch: 0,
    targetRoll: 0,
  };

  function pose(): VrmSolverLandmark[] {
    const landmarks = Array.from({ length: 33 }, () => ({
      visibility: 0.9,
      x: 0,
      y: 0,
      z: 0,
    }));
    landmarks[23] = { visibility: 0.95, x: -0.14, y: 1.02, z: 0 };
    landmarks[24] = { visibility: 0.95, x: 0.14, y: 1.02, z: 0 };
    landmarks[27] = { visibility: 0.9, x: -0.14, y: 0.08, z: 0.04 };
    landmarks[28] = { visibility: 0.9, x: 0.14, y: 0.08, z: 0.04 };
    landmarks[31] = { visibility: 0.9, x: -0.13, y: 0, z: 0.18 };
    landmarks[32] = { visibility: 0.9, x: 0.13, y: 0, z: 0.18 };
    return landmarks;
  }

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

  describe("movementAvatarLocomotionFrameOrchestrationRuntime", () => {
    it("resolves hips and returns fallback without applying root motion when forced standby", () => {
      const root = new THREE.Object3D();
      const history: MovementRootMotionInputFrame[] = [];
      const result = applyMovementAvatarLocomotionFrameOrchestrationRuntime({
        avatarBaseY: -2.8,
        avatarRole: "player",
        avatarRoot: root,
        calibration: buildMovementCalibration({
          poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
        }),
        displayWorldPose: pose(),
        forceStandby: true,
        history,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        mirrorPlayerDisplay: false,
        playerSquatPresentationDepth: 0,
        poseLandmarks: pose(),
        positionOffset: [0, 0, 0],
        profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
        rigMeasurements: null,
        recordedRootMotionFrame: null,
        rootOrientation: uprightRootOrientation,
        shouldApplyLowerBody: true,
        visualRootDrop: 0,
        worldPose: pose(),
      });

      expect(result.status).toBe("fallback-demo-pose");
      expect(result.hipsFrameRuntime.hipsPositionOptions.avatarRootVisualLerp).toBeGreaterThan(0);
      expect(history).toHaveLength(0);
    });

    it("applies root orchestration and exposes step response when ready", () => {
      const root = new THREE.Object3D();
      const history: MovementRootMotionInputFrame[] = [];
      const result = applyMovementAvatarLocomotionFrameOrchestrationRuntime({
        avatarBaseY: -2.8,
        avatarRole: "player",
        avatarRoot: root,
        calibration: null,
        displayWorldPose: pose(),
        forceStandby: false,
        history,
        lowerBodyDrive: lowerBodyDrive(),
        lowerBodyTrackingReady: true,
        mirrorPlayerDisplay: false,
        playerSquatPresentationDepth: 0,
        poseLandmarks: pose(),
        positionOffset: [0.2, 0, -0.3],
        profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
        rigMeasurements: null,
        recordedRootMotionFrame: null,
        rootOrientation: uprightRootOrientation,
        shouldApplyLowerBody: true,
        visualRootDrop: 0,
        worldPose: pose(),
      });

      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.stepResponse).toBe(result.rootFrameOrchestrationRuntime.stepResponse);
      expect(result.hipsFrameRuntime.hipsPositionOptions.avatarRootVisualLerp).toBeGreaterThan(0);
      expect(history).toHaveLength(1);
    });
  });
});
