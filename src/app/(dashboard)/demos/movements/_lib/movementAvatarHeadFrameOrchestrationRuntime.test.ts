import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarHeadFrameOrchestrationRuntime } from "./movementAvatarHeadFrameOrchestrationRuntime";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { resolveMovementAvatarFrameTargetRuntime } from "./movementAvatarFrameTargetRuntime";
import { buildMovementCalibration, type MovementTrackingDebugState } from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";

function frameInputs() {
  const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
  const calibration = buildMovementCalibration({ poseLandmarks });
  const avatarDecision = resolveMovementAvatarPipelineDecision({
    avatarRole: "player",
    calibration,
    retargetSourceModel: buildMovementRetargetSourceModel({ poseLandmarks }),
    source: {
      poseLandmarks,
    },
    sourceOrigin: "studio",
  });
  const frameTargetRuntime = resolveMovementAvatarFrameTargetRuntime({
    avatarRole: "player",
    imageLandmarks: poseLandmarks,
    lowerBodyDrive: avatarDecision.lowerBodyDrive,
    rigHands: undefined,
    solverLandmarks: poseLandmarks,
    targetSolverLandmarks: poseLandmarks,
  });

  return {
    avatarDecision,
    calibration,
    frameTargetRuntime,
    poseLandmarks,
  };
}

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

describe("movementAvatarHeadFrameOrchestrationRuntime", () => {
  it("applies head runtime and updates tracking/debug refs when debug is enabled", () => {
    const { avatarDecision, calibration, frameTargetRuntime, poseLandmarks } = frameInputs();
    const head = new THREE.Object3D();
    const neck = new THREE.Object3D();
    const upperChest = new THREE.Object3D();
    const bones = new Map([
      ["head", head],
      ["neck", neck],
      ["upperChest", upperChest],
    ]);
    const baseBonePositionRef = {
      current: {
        head: new THREE.Vector3(0, 0, 0),
      },
    };
    const legRaiseHoldState = {
      depth: 0,
      expiresAt: 0,
      side: null,
    };
    const trackingDebugRef: { current: MovementTrackingDebugState | null } = {
      current: null,
    };

    const result = applyMovementAvatarHeadFrameOrchestrationRuntime({
      activeCalibration: calibration,
      autoCalibrationKind: "upright",
      avatarDecision,
      avatarRole: "player",
      avatarRootYaw: 0,
      baseBonePositionRef,
      debugUpdatedAt: 100,
      exerciseTransition: stableUprightTransition,
      faceLandmarks: null,
      footLockCorrection: 0.1,
      footLockDrift: 0.2,
      footLockState: {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0.3,
      },
      footOwner: "neutral",
      frameTargetRuntime,
      hasManualCalibration: false,
      legRaiseHoldDecision: {
        lowerBodyDrive: avatarDecision.lowerBodyDrive,
        state: legRaiseHoldState,
        wasHeld: false,
      },
      liveSquatDepth: 0,
      lookupBone: (boneName) => bones.get(boneName) ?? null,
      lowerBodyDrive: avatarDecision.lowerBodyDrive,
      lowerBodyOwner: "neutral",
      motionFrameInputOwner: "movement-motion-frame",
      neckSlerp: 0.5,
      plantedSquatIkDepth: 0,
      playerLegRaiseHoldState: legRaiseHoldState,
      poseLandmarks,
      profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
      profileName: "default",
      retargetAppliedLowerBody: 0,
      retargetAppliedUpperBody: 0,
      retargetSourceModel: null,
      shouldApplyLowerBody: true,
      supportContactTelemetry: {
        anchorCount: 0,
        correction: 0,
        owner: "support-contact",
      },
      trackingDebugRef,
      visualRootDrop: 0,
    });

    expect(result.headFrameRuntime.headRuntimeApplication.applied).toBe(true);
    expect(result.headFrameRefsRuntime.appliedBaseHeadPosition).toBe(true);
    expect(result.headFrameRefsRuntime.appliedTrackingDebugState).toBe(true);
    expect(trackingDebugRef.current?.updatedAt).toBe(100);
    expect(trackingDebugRef.current?.retarget?.footLockCorrection).toBe(0.1);
    expect(trackingDebugRef.current?.retarget?.footLockDrift).toBe(0.2);
  });

  it("does not require a tracking debug ref to apply head runtime", () => {
    const { avatarDecision, calibration, frameTargetRuntime, poseLandmarks } = frameInputs();
    const head = new THREE.Object3D();

    const result = applyMovementAvatarHeadFrameOrchestrationRuntime({
      activeCalibration: calibration,
      autoCalibrationKind: "upright",
      avatarDecision,
      avatarRole: "player",
      avatarRootYaw: 0,
      baseBonePositionRef: { current: { head: new THREE.Vector3() } },
      debugUpdatedAt: 100,
      exerciseTransition: stableUprightTransition,
      faceLandmarks: null,
      footLockCorrection: 0,
      footLockDrift: 0,
      footLockState: {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0,
      },
      footOwner: "neutral",
      frameTargetRuntime,
      hasManualCalibration: false,
      legRaiseHoldDecision: {
        lowerBodyDrive: avatarDecision.lowerBodyDrive,
        state: {
          depth: 0,
          expiresAt: 0,
          side: null,
        },
        wasHeld: false,
      },
      liveSquatDepth: 0,
      lookupBone: (boneName) => boneName === "head" ? head : null,
      lowerBodyDrive: avatarDecision.lowerBodyDrive,
      lowerBodyOwner: "neutral",
      motionFrameInputOwner: "movement-motion-frame",
      neckSlerp: 0.5,
      plantedSquatIkDepth: 0,
      playerLegRaiseHoldState: {
        depth: 0,
        expiresAt: 0,
        side: null,
      },
      poseLandmarks,
      profile: getMovementAvatarTrackingProfile("/models/VIPE_Hero__1793.vrm"),
      profileName: "default",
      retargetAppliedLowerBody: 0,
      retargetAppliedUpperBody: 0,
      retargetSourceModel: null,
      shouldApplyLowerBody: true,
      supportContactTelemetry: {
        anchorCount: 0,
        correction: 0,
        owner: "support-contact",
      },
      visualRootDrop: 0,
    });

    expect(result.headFrameRuntime.headRuntimeApplication.applied).toBe(true);
    expect(result.headFrameRefsRuntime.appliedTrackingDebugState).toBe(false);
  });
});
