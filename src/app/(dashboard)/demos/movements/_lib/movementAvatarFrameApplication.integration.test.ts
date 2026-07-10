import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { VRM } from "@pixiv/three-vrm";
import { createMovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import { applyMovementAvatarReadyFrameOrchestrationRuntime } from "./movementAvatarFrameApplication";
import { resolveMovementAvatarFrameEntryRuntime } from "./movementAvatarFrameEntry";
import { getMovementAvatarTrackingProfile } from "./movementAvatarProfiles";
import {
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  toMovementAvatarProofMotionLandmarks,
} from "./movementAvatarProofFixtures";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarRuntimeState";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import { resolveMovementMotionFrame } from "./movementMotionFrame";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementSourceFrame } from "./movementSourceFrame";
import {
  buildMovementCalibration,
  type MovementTrackingDebugState,
} from "./movementTrackingCalibration";

const VRM_PROFILE_URL = "/models/VIPE_Hero__1793.vrm";

const VRM_BONES: Array<[name: string, parent: string | null, y: number]> = [
  ["hips", null, 0.9],
  ["spine", "hips", 1.05],
  ["chest", "spine", 1.2],
  ["upperChest", "chest", 1.3],
  ["neck", "upperChest", 1.45],
  ["head", "neck", 1.55],
  ["leftShoulder", "upperChest", 1.4],
  ["leftUpperArm", "leftShoulder", 1.38],
  ["leftLowerArm", "leftUpperArm", 1.1],
  ["leftHand", "leftLowerArm", 0.85],
  ["rightShoulder", "upperChest", 1.4],
  ["rightUpperArm", "rightShoulder", 1.38],
  ["rightLowerArm", "rightUpperArm", 1.1],
  ["rightHand", "rightLowerArm", 0.85],
  ["leftUpperLeg", "hips", 0.85],
  ["leftLowerLeg", "leftUpperLeg", 0.45],
  ["leftFoot", "leftLowerLeg", 0.08],
  ["leftToes", "leftFoot", 0.02],
  ["rightUpperLeg", "hips", 0.85],
  ["rightLowerLeg", "rightUpperLeg", 0.45],
  ["rightFoot", "rightLowerLeg", 0.08],
  ["rightToes", "rightFoot", 0.02],
];

function buildRig() {
  const avatarRoot = new THREE.Group();
  const scene = new THREE.Object3D();
  avatarRoot.add(scene);
  const bones = new Map<string, THREE.Object3D>();
  for (const [name, parentName, y] of VRM_BONES) {
    const bone = new THREE.Object3D();
    bone.name = name;
    bone.position.y = y;
    (parentName ? bones.get(parentName)! : scene).add(bone);
    bones.set(name, bone);
  }
  scene.updateMatrixWorld(true);
  const vrm = {
    expressionManager: null,
    humanoid: {
      getNormalizedBoneNode: (name: string) => bones.get(name) ?? null,
    },
    scene,
    update: () => undefined,
  } as unknown as VRM;
  return { avatarRoot, bones, scene, vrm };
}

function buildRefs() {
  return {
    baseBonePositionRef: { current: {} as Record<string, THREE.Vector3> },
    baseHipsPositionRef: { current: null as THREE.Vector3 | null },
    exerciseTransitionStateRef: { current: createMovementAvatarExerciseTransitionState() },
    instructorLowerBodyStabilityRef: { current: createMovementAvatarLowerBodyVisualState() },
    lastGoodQuaternionRef: { current: {} as Record<string, THREE.Quaternion> },
    plantedFootLockRef: { current: createMovementAvatarFootLockState() },
    playerLegRaiseHoldRef: { current: createMovementAvatarPlayerLegRaiseHoldState() },
    playerLowerBodyStabilityRef: { current: createMovementAvatarLowerBodyVisualState() },
    retargetAvatarRestRef: { current: {} },
    retargetSourceModelRef: { current: null },
    setupStateRef: { current: createMovementAvatarSetupState() },
    trackingDebugRef: { current: null as MovementTrackingDebugState | null },
  };
}

function runFrame({
  applyDemoFallbackPose,
  forceStandbyOverride,
}: {
  applyDemoFallbackPose?: () => void;
  forceStandbyOverride?: boolean;
} = {}) {
  const { avatarRoot, vrm } = buildRig();
  const poseLandmarks = makeMovementAvatarProofMotionPayload("standing").landmarks;
  const entry = resolveMovementAvatarFrameEntryRuntime({
    avatarRole: "player",
    avatarRoot,
    delta: 1 / 60,
    isPlaying: true,
    motionRef: poseLandmarks,
    showPausedPose: false,
    usesPlayerMotionPath: true,
    vrm,
  });
  expect(entry.status).toBe("ready");
  if (entry.status !== "ready") throw new Error("frame entry did not become ready");

  const { accessRuntime, context } = entry;
  const solvedFrame = entry.readyFrameRuntime.solvedFrameRuntime;
  const calibration = buildMovementCalibration({ poseLandmarks });
  const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks });
  const motionFrame = resolveMovementMotionFrame({
    avatarRole: "player",
    calibration,
    mirrorMode: "facing-player",
    retargetSourceModel,
    sourceFrame: buildMovementSourceFrame({
      poseLandmarks,
      sourceOrigin: "live-webcam",
      sourceStatus: "raw",
    }),
  });
  const refs = buildRefs();

  const result = applyMovementAvatarReadyFrameOrchestrationRuntime({
    applyDemoFallbackPose: applyDemoFallbackPose ?? accessRuntime.applyDemoFallbackPose,
    avatarBaseY: -2.8,
    avatarName: "integration-player",
    avatarRole: accessRuntime.avatarRole,
    avatarRoot: context.avatarRoot,
    blendshapes: solvedFrame.rigBlendshapes,
    boneEaseOptions: accessRuntime.boneEaseOptions,
    displayPreparedInput: solvedFrame.displayPreparedInput.solverLandmarks,
    faceLandmarks: solvedFrame.faceLandmarks,
    forceStandby: forceStandbyOverride ?? solvedFrame.forceStandby,
    imageLandmarks: solvedFrame.imageLandmarks,
    isPlayer: true,
    liveRootMotionHistory: [],
    lookupBone: accessRuntime.lookupBone,
    manualCalibration: calibration,
    mirrorPlayerDisplay: solvedFrame.mirrorPlayerDisplay,
    motionFrame,
    positionOffset: [0, 0, 0],
    profile: getMovementAvatarTrackingProfile(VRM_PROFILE_URL),
    profileName: VRM_PROFILE_URL,
    providedRetargetSourceModel: retargetSourceModel,
    recordedRootMotionFrame: null,
    rigHands: solvedFrame.rigHands,
    rigMeasurements: null,
    scene: context.vrm.scene,
    targetSolverLandmarks: solvedFrame.targetSolverLandmarks,
    vrm: context.vrm,
    worldLandmarks: toMovementAvatarProofMotionLandmarks(makeMovementAvatarProofPose("standing")),
    ...refs,
  });

  return { refs, result };
}

describe("movementAvatarFrameApplication (integration)", () => {
  it("drives a standing frame from entry through body solve and completion", () => {
    const { refs, result } = runFrame();

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    expect(result.preBodyFrameOrchestrationRuntime.status).toBe("ready");
    expect(result.frameWorldRuntime.hasWorldLandmarks).toBe(true);

    const body = result.bodyFrameOrchestrationRuntime;
    expect(body.lowerBodyOwner).toBeTruthy();
    expect(body.footOwner).toBeTruthy();
    expect(body.retargetAppliedUpperBody).toBeGreaterThan(0);
    expect(body.retargetAppliedLowerBody).toBeGreaterThanOrEqual(0);
    expect(body.frameTargetRuntime.lowerBodyTargetComposition.selections.leftKnee.source).toBeTruthy();

    const completion = result.completionFrameOrchestrationRuntime;
    expect(completion).toBeTruthy();

    expect(refs.trackingDebugRef.current).not.toBeNull();
    expect(refs.trackingDebugRef.current?.retarget?.appliedUpperBody).toBe(body.retargetAppliedUpperBody);
    expect(Object.keys(refs.lastGoodQuaternionRef.current).length).toBeGreaterThan(0);
  });

  it("falls back to the demo pose when the frame cannot produce a decision", () => {
    const applyDemoFallbackPose = vi.fn();
    const { result } = runFrame({ applyDemoFallbackPose, forceStandbyOverride: true });

    expect(result.status).toBe("fallback-demo-pose");
    expect(applyDemoFallbackPose).toHaveBeenCalled();
  });
});
