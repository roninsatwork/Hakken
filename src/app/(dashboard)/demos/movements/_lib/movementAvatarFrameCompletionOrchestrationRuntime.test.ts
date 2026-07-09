import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { applyMovementAvatarFrameCompletionOrchestrationRuntime } from "./movementAvatarFrameCompletionOrchestrationRuntime";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import {
  resolveMovementAvatarFrameTargetRuntime,
} from "./movementAvatarFrameTargetRuntime";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  resolveMovementAvatarPipelineDecision,
  type MovementAvatarHipsApplicationDecision,
  type MovementAvatarHipsPositionOptionsDecision,
} from "./movementAvatarPipeline";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRootMotionStepResponseDecision } from "./movementRootMotion";

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
    const head = new THREE.Object3D();
    const leftFoot = new THREE.Object3D();
    const rightFoot = new THREE.Object3D();
    const bones = new Map([
      ["head", head],
      ["leftFoot", leftFoot],
      ["rightFoot", rightFoot],
    ]);
    scene.add(avatarRoot);
    avatarRoot.add(head);
    avatarRoot.add(leftFoot);
    avatarRoot.add(rightFoot);
    leftFoot.position.set(-0.2, -0.5, 0.1);
    rightFoot.position.set(0.2, -0.5, -0.1);

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
      calibratedFloorCorrection: 0,
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
      hipsNode: {
        position: new THREE.Vector3(0, 1, 0),
      },
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
