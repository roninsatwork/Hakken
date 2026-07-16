import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameTargetRuntime } from "./movementAvatarBodyFrame";
import type { MovementAvatarHeadFrameDebugInput } from "./movementAvatarHeadFrame";
import {
  applyMovementAvatarHeadRuntimeToVrmBones,
  resolveMovementAvatarHeadApplicationPoseOwnership,
  buildMovementAvatarHeadRuntimeDebugTelemetry,
} from "./movementAvatarHeadFrame";
import {
  resolveMovementAvatarHeadFrameDebugRuntime,
  type MovementAvatarHeadFrameDebugRuntimeInput,
} from "./movementAvatarHeadFrame";
import { applyMovementAvatarHeadFrameOrchestrationRuntime } from "./movementAvatarHeadFrame";
import { applyMovementAvatarHeadFrameRefsRuntime } from "./movementAvatarHeadFrame";
import { applyMovementAvatarHeadFrameRuntime } from "./movementAvatarHeadFrame";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import type {
  MovementCalibration,
  MovementHeadMotionIntent,
  TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementCalibration, type MovementTrackingDebugState } from "./movementTrackingCalibration";

describe("movementAvatarHeadRuntime (merged)", () => {
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

  it("prevents head extras from becoming a second upper-chest owner", () => {
    const pose = {
      headPositionOffset: null,
      neckRotation: null,
      upperChestCompensation: { x: 0.1, y: 0.02, z: -0.03 },
    };

    expect(resolveMovementAvatarHeadApplicationPoseOwnership({
      headApplicationPose: pose,
      shouldApplySpine: true,
    }).upperChestCompensation).toBeNull();
    expect(resolveMovementAvatarHeadApplicationPoseOwnership({
      headApplicationPose: pose,
      shouldApplySpine: false,
    })).toBe(pose);
  });

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

  function faceLandmarks(): TrackingLandmark[] {
    const face = Array.from({ length: 264 }, () => ({
      visibility: 0.9,
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    face[1] = { x: 0.58, y: 0.48, z: 0, visibility: 0.9 };
    face[33] = { x: 0.42, y: 0.45, z: 0, visibility: 0.9 };
    face[263] = { x: 0.58, y: 0.45, z: 0, visibility: 0.9 };
    return face;
  }

  describe("movementAvatarHeadRuntime", () => {
    it("skips when required head landmarks or head bone are unavailable", () => {
      expect(applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "player",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        lookupBone: () => new THREE.Object3D(),
        neckSlerp: 0.25,
        poseLandmarks: [],
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      })).toEqual({
        applied: false,
        reason: "missing-head-landmarks",
      });

      expect(applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "player",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        lookupBone: () => null,
        neckSlerp: 0.25,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      })).toEqual({
        applied: false,
        reason: "missing-head-bone",
      });
    });

    it("resolves and applies player head motion while preserving the stable base position", () => {
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

      const result = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "player",
        avatarRootYaw: Math.PI / 4,
        baseHeadPosition: null,
        calibration: neutralCalibration,
        faceLandmarks: faceLandmarks(),
        headMotionIntent: {
          ...neutralHeadIntent,
          vertical: 0.7,
        },
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });

      expect(result.applied).toBe(true);
      if (!result.applied) throw new Error("expected head runtime to apply");
      expect(result.headTarget.headDecision.shouldApplyPlayerHeadMotion).toBe(true);
      expect(result.headApplication.baseHeadPosition).toEqual(new THREE.Vector3(0.1, 0.2, 0.3));
      expect(head.position.y).not.toBe(0.2);
      expect(head.quaternion.w).toBeLessThan(1);
    });

    it("builds avatar head debug telemetry from the applied head node and target", () => {
      const head = new THREE.Object3D();
      head.rotation.x = 0.1234;

      const result = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "player",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: neutralCalibration,
        headMotionIntent: {
          ...neutralHeadIntent,
          lateral: 0.35,
          vertical: 0.4,
        },
        lookupBone: (boneName) => boneName === "head" ? head : new THREE.Object3D(),
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });

      expect(result.applied).toBe(true);
      if (!result.applied) throw new Error("expected head runtime to apply");

      const telemetry = buildMovementAvatarHeadRuntimeDebugTelemetry({
        headNode: result.headNode,
        headTarget: result.headTarget,
      });
      const worldRotation = new THREE.Euler().setFromQuaternion(
        result.headNode.getWorldQuaternion(new THREE.Quaternion()),
        "YXZ",
      );
      const appliedWorldQuaternion = result.headNode.getWorldQuaternion(new THREE.Quaternion());
      const targetWorldQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        result.headTarget.headBonePitch,
        result.headTarget.headWorldYaw,
        result.headTarget.headDecision.headRoll,
        "YXZ",
      ));

      expect(telemetry).toEqual({
        appliedWorldQuaternion: {
          w: appliedWorldQuaternion.w,
          x: appliedWorldQuaternion.x,
          y: appliedWorldQuaternion.y,
          z: appliedWorldQuaternion.z,
        },
        appliedLocalPitch: result.headNode.rotation.x,
        appliedLocalRoll: result.headNode.rotation.z,
        appliedLocalYaw: result.headNode.rotation.y,
        appliedWorldPitch: worldRotation.x,
        appliedWorldRoll: worldRotation.z,
        appliedWorldYaw: worldRotation.y,
        boneYaw: result.headTarget.headDecision.headYaw,
        bonePitch: result.headTarget.headBonePitch,
        boneRoll: result.headTarget.headDecision.headRoll,
        trackingPitch: result.headTarget.headDecision.headPitch,
        trackingRoll: result.headTarget.rawHeadDecision.rawHead.roll,
        trackingYaw: result.headTarget.rawHeadDecision.rawHead.yaw,
        targetWorldQuaternion: {
          w: targetWorldQuaternion.w,
          x: targetWorldQuaternion.x,
          y: targetWorldQuaternion.y,
          z: targetWorldQuaternion.z,
        },
      });
    });

    it("applies a prepared motion-frame head target against the current avatar root yaw", () => {
      const prepared = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "instructor",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        lookupBone: () => new THREE.Object3D(),
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });
      expect(prepared.applied).toBe(true);
      if (!prepared.applied) throw new Error("expected prepared head target");

      const avatarRootYaw = 0.9;
      const applied = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "player",
        avatarRootYaw,
        baseHeadPosition: null,
        calibration: neutralCalibration,
        lookupBone: () => new THREE.Object3D(),
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        preparedHeadTarget: prepared.headTarget,
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });

      expect(applied.applied).toBe(true);
      if (!applied.applied) throw new Error("expected prepared head target to apply");
      expect(applied.headTarget.headDecision).toBe(prepared.headTarget.headDecision);
      expect(applied.headTarget.headWorldYaw).toBeCloseTo(
        avatarRootYaw + prepared.headTarget.headDecision.headYaw,
      );
    });

    it("recomputes a pose-only prepared target when current face landmarks provide head yaw", () => {
      const prepared = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "instructor",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        lookupBone: () => new THREE.Object3D(),
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });
      expect(prepared.applied).toBe(true);
      if (!prepared.applied) throw new Error("expected prepared head target");

      const faceLandmarks = makeMovementAvatarProofMotionPayload("head-right").faceLandmarks;
      const applied = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: "instructor",
        avatarRootYaw: 0,
        baseHeadPosition: null,
        calibration: null,
        faceLandmarks,
        lookupBone: () => new THREE.Object3D(),
        neckSlerp: 1,
        poseLandmarks: poseLandmarks(),
        preparedHeadTarget: prepared.headTarget,
        shouldApplyLowerBody: false,
        shouldApplySpine: false,
      });

      expect(applied.applied).toBe(true);
      if (!applied.applied) throw new Error("expected face head target to apply");
      expect(applied.headTarget.rawHeadDecision.rawHead.source).toBe("face");
      expect(Math.abs(applied.headTarget.headDecision.headYaw)).toBeGreaterThan(0.3);
    });

    it("renders live face roll and replay pose roll in the same direction", () => {
      const pose = poseLandmarks();
      pose[7] = { ...pose[7]!, y: 0.27 };
      pose[8] = { ...pose[8]!, y: 0.33 };
      const face = faceLandmarks();
      face[1] = { ...face[1]!, x: 0.5, y: 0.27 };
      face[33] = { ...face[33]!, x: 0.42, y: 0.27 };
      face[263] = { ...face[263]!, x: 0.58, y: 0.33 };

      const renderHead = (renderFaceLandmarks?: TrackingLandmark[] | null) => {
        const root = new THREE.Object3D();
        const upperChest = new THREE.Object3D();
        const neck = new THREE.Object3D();
        const head = new THREE.Object3D();
        root.add(upperChest);
        upperChest.add(neck);
        neck.add(head);
        root.updateMatrixWorld(true);
        const bones = new Map<string, THREE.Object3D>([
          ["head", head],
          ["neck", neck],
          ["upperChest", upperChest],
        ]);

        const result = applyMovementAvatarHeadRuntimeToVrmBones({
          avatarRole: "player",
          avatarRootYaw: 0,
          baseHeadPosition: null,
          calibration: neutralCalibration,
          faceLandmarks: renderFaceLandmarks,
          frameDeltaSeconds: 1,
          headMotionIntent: neutralHeadIntent,
          lookupBone: (boneName) => bones.get(boneName) ?? null,
          neckSlerp: 1,
          poseLandmarks: pose,
          shouldApplyLowerBody: false,
          shouldApplySpine: false,
        });

        expect(result.applied).toBe(true);
        if (!result.applied) throw new Error("expected rendered head target");
        root.updateMatrixWorld(true);
        return new THREE.Euler().setFromQuaternion(
          head.getWorldQuaternion(new THREE.Quaternion()),
          "YXZ",
        ).z;
      };

      const replayPoseRoll = renderHead(null);
      const liveFaceRoll = renderHead(face);

      expect(replayPoseRoll).toBeGreaterThan(0);
      expect(liveFaceRoll).toBeGreaterThan(0);
      expect(Math.sign(liveFaceRoll)).toBe(Math.sign(replayPoseRoll));
    });
  });
});

describe("movementAvatarHeadFrameRuntime (merged)", () => {
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

  function faceLandmarks(): TrackingLandmark[] {
    const face = Array.from({ length: 264 }, () => ({
      visibility: 0.9,
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    face[1] = { x: 0.58, y: 0.48, z: 0, visibility: 0.9 };
    face[33] = { x: 0.42, y: 0.45, z: 0, visibility: 0.9 };
    face[263] = { x: 0.58, y: 0.45, z: 0, visibility: 0.9 };
    return face;
  }

  function positiveYawPoseLandmarks(): TrackingLandmark[] {
    const pose = poseLandmarks();
    pose[7] = { ...pose[7]!, z: 0.1 };
    pose[8] = { ...pose[8]!, z: -0.1 };
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
      armApplicationModes: {
        left: "retargeted" as const,
        right: "retargeted" as const,
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
          faceLandmarks: faceLandmarks(),
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

    it("preserves motion-frame display head yaw sign in tracking debug output", () => {
      const parent = new THREE.Object3D();
      const head = new THREE.Object3D();
      const neck = new THREE.Object3D();
      const upperChest = new THREE.Object3D();
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
          avatarRootYaw: 0,
          baseHeadPosition: null,
          calibration: neutralCalibration,
          lookupBone: (boneName) => bones.get(boneName) ?? null,
          mirrorHeadForDisplay: false,
          neckSlerp: 1,
          poseLandmarks: positiveYawPoseLandmarks(),
          shouldApplyLowerBody: false,
          shouldApplySpine: false,
        },
      });

      expect(result.trackingDebugState?.headRaw.yaw).toBeGreaterThan(0);
      expect(result.trackingDebugState?.headApplied.yaw).toBeGreaterThan(0);
    });
  });
});

describe("movementAvatarHeadFrameRefsRuntime (merged)", () => {
  describe("movementAvatarHeadFrameRefsRuntime", () => {
    it("applies the next base head position", () => {
      const nextBaseHeadPosition = new THREE.Vector3(1, 2, 3);
      const baseBonePositionRef = {
        current: {
          head: new THREE.Vector3(0, 0, 0),
        },
      };

      const result = applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef,
        headFrameRuntime: {
          nextBaseHeadPosition,
          trackingDebugState: null,
        } as never,
      });

      expect(baseBonePositionRef.current.head).toBe(nextBaseHeadPosition);
      expect(result).toEqual({
        appliedBaseHeadPosition: true,
        appliedTrackingDebugState: false,
      });
    });

    it("applies the next tracking debug state when a ref is present", () => {
      const trackingDebugState = {
        updatedAt: 123,
      };
      const trackingDebugRef = {
        current: null,
      };

      const result = applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef: { current: {} },
        headFrameRuntime: {
          nextBaseHeadPosition: null,
          trackingDebugState,
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(trackingDebugRef.current).toBe(trackingDebugState);
      expect(result).toEqual({
        appliedBaseHeadPosition: false,
        appliedTrackingDebugState: true,
      });
    });

    it("preserves root telemetry written earlier in the same rendered frame", () => {
      const avatarRoot = {
        appliedX: 0.58,
        appliedYaw: 0,
        appliedZ: 0,
        source: "world-landmarks",
        targetX: 0.58,
        targetYaw: 0,
        targetZ: 0,
      };
      const trackingDebugRef = {
        current: {
          avatarRoot,
          updatedAt: 100,
        },
      };

      applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef: { current: {} },
        headFrameRuntime: {
          nextBaseHeadPosition: null,
          trackingDebugState: { updatedAt: 200 },
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(trackingDebugRef.current).toEqual({
        avatarRoot,
        updatedAt: 200,
      });
    });

    it("leaves refs unchanged when runtime values are missing", () => {
      const baseHeadPosition = new THREE.Vector3(4, 5, 6);
      const trackingDebugState = {
        updatedAt: 100,
      };
      const baseBonePositionRef = {
        current: {
          head: baseHeadPosition,
        },
      };
      const trackingDebugRef = {
        current: trackingDebugState,
      };

      const result = applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef,
        headFrameRuntime: {
          nextBaseHeadPosition: null,
          trackingDebugState: null,
        } as never,
        trackingDebugRef: trackingDebugRef as never,
      });

      expect(baseBonePositionRef.current.head).toBe(baseHeadPosition);
      expect(trackingDebugRef.current).toBe(trackingDebugState);
      expect(result).toEqual({
        appliedBaseHeadPosition: false,
        appliedTrackingDebugState: false,
      });
    });

    it("does not require a tracking debug ref", () => {
      const result = applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef: { current: {} },
        headFrameRuntime: {
          nextBaseHeadPosition: null,
          trackingDebugState: { updatedAt: 456 },
        } as never,
      });

      expect(result).toEqual({
        appliedBaseHeadPosition: false,
        appliedTrackingDebugState: false,
      });
    });
  });
});

describe("movementAvatarHeadFrameDebugRuntime (merged)", () => {
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
      armApplicationModes: {
        left: "retargeted" as const,
        right: "retargeted" as const,
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
});

describe("movementAvatarHeadFrameOrchestrationRuntime (merged)", () => {
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
        armApplicationModes: { left: "retargeted" as const, right: "retargeted" as const },
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
        armApplicationModes: { left: "retargeted" as const, right: "retargeted" as const },
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
});
