import type { VRM } from "@pixiv/three-vrm";
import {
  resolveMovementAvatarFrameScenePreparationRuntime,
} from "./movementAvatarFrameScenePreparationRuntime";
import { resolveMovementAvatarFrameWorldRuntime } from "./movementAvatarFrameWorldRuntime";
import {
  applyMovementAvatarReadyFrameApplicationRuntime,
  type MovementAvatarReadyFrameApplicationRuntime,
} from "./movementAvatarReadyFrameApplicationRuntime";
import { applyMovementAvatarPreBodyFrameOrchestrationRuntime } from "./movementAvatarPreBodyFrameOrchestrationRuntime";
import type { MovementMotionFrame } from "./movementMotionFrame";
import type { MovementRootMotionFrame } from "./movementRootMotion";
import type {
  MovementCalibration,
  MovementTrackingDebugState,
} from "./movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "./movementRetargeting";

type MovementAvatarFrameWorldInput = Parameters<typeof resolveMovementAvatarFrameWorldRuntime>[0];
type MovementAvatarFrameScenePreparationInput =
  Parameters<typeof resolveMovementAvatarFrameScenePreparationRuntime>[0];
type MovementAvatarPreBodyInput = Parameters<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>[0];
type MovementAvatarReadyFrameApplicationInput =
  Parameters<typeof applyMovementAvatarReadyFrameApplicationRuntime>[0];

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarReadyFrameOrchestrationRuntime =
  | {
    frameWorldRuntime: ReturnType<typeof resolveMovementAvatarFrameWorldRuntime>;
    preBodyFrameOrchestrationRuntime: ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>;
    scenePreparationRuntime: ReturnType<typeof resolveMovementAvatarFrameScenePreparationRuntime>;
    status: "fallback-demo-pose";
  }
  | {
    bodyFrameOrchestrationRuntime: MovementAvatarReadyFrameApplicationRuntime["bodyFrameOrchestrationRuntime"];
    completionFrameOrchestrationRuntime: MovementAvatarReadyFrameApplicationRuntime["completionFrameOrchestrationRuntime"];
    frameWorldRuntime: ReturnType<typeof resolveMovementAvatarFrameWorldRuntime>;
    preBodyFrameOrchestrationRuntime: Extract<
      ReturnType<typeof applyMovementAvatarPreBodyFrameOrchestrationRuntime>,
      { status: "ready" }
    >;
    scenePreparationRuntime: ReturnType<typeof resolveMovementAvatarFrameScenePreparationRuntime>;
    status: "ready";
  };

export function applyMovementAvatarReadyFrameOrchestrationRuntime({
  applyDemoFallbackPose,
  avatarBaseY,
  avatarName,
  avatarRole,
  avatarRoot,
  baseBonePositionRef,
  baseHipsPositionRef,
  blendshapes,
  boneEaseOptions,
  displayPreparedInput,
  exerciseTransitionStateRef,
  faceLandmarks,
  fallbackPoseSlerp = 0.35,
  forceStandby,
  imageLandmarks,
  instructorLowerBodyStabilityRef,
  isPlayer,
  lastGoodQuaternionRef,
  liveRootMotionHistory,
  lookupBone,
  manualCalibration,
  mirrorPlayerDisplay,
  motionFrame,
  playerLegRaiseHoldRef,
  playerLowerBodyStabilityRef,
  plantedFootLockRef,
  positionOffset,
  profile,
  profileName,
  providedRetargetSourceModel,
  recordedRootMotionFrame,
  retargetAvatarRestRef,
  retargetSourceModelRef,
  rigHands,
  scene,
  setupStateRef,
  targetSolverLandmarks,
  trackingDebugRef,
  vrm,
  worldLandmarks,
}: {
  applyDemoFallbackPose: (factor?: number) => unknown;
  avatarBaseY: MovementAvatarPreBodyInput["avatarBaseY"];
  avatarName: MovementAvatarReadyFrameApplicationInput["avatarName"];
  avatarRole: MovementAvatarReadyFrameApplicationInput["avatarRole"];
  avatarRoot: MovementAvatarReadyFrameApplicationInput["avatarRoot"] & MovementAvatarPreBodyInput["avatarRoot"];
  baseBonePositionRef: MovementAvatarReadyFrameApplicationInput["baseBonePositionRef"];
  baseHipsPositionRef: MovementAvatarReadyFrameApplicationInput["baseHipsPositionRef"];
  blendshapes: MovementAvatarReadyFrameApplicationInput["blendshapes"];
  boneEaseOptions: MovementAvatarReadyFrameApplicationInput["boneEaseOptions"];
  displayPreparedInput: Pick<MovementAvatarPreBodyInput, "displayWorldPose">["displayWorldPose"];
  exerciseTransitionStateRef: MovementAvatarPreBodyInput["exerciseTransitionStateRef"];
  faceLandmarks: MovementAvatarPreBodyInput["faceLandmarks"];
  fallbackPoseSlerp?: number;
  forceStandby: MovementAvatarPreBodyInput["forceStandby"];
  imageLandmarks: MovementAvatarPreBodyInput["poseLandmarks"] &
    MovementAvatarReadyFrameApplicationInput["imageLandmarks"];
  instructorLowerBodyStabilityRef: MovementAvatarPreBodyInput["instructorLowerBodyStabilityRef"];
  isPlayer: boolean;
  lastGoodQuaternionRef: MovementAvatarReadyFrameApplicationInput["lastGoodQuaternionRef"];
  liveRootMotionHistory: MovementAvatarPreBodyInput["history"];
  lookupBone: MovementAvatarReadyFrameApplicationInput["lookupBone"] &
    MovementAvatarFrameScenePreparationInput["lookupBone"];
  manualCalibration: MovementCalibration | null;
  mirrorPlayerDisplay: MovementAvatarPreBodyInput["mirrorPlayerDisplay"];
  motionFrame: MovementMotionFrame | null;
  playerLegRaiseHoldRef: MovementAvatarPreBodyInput["playerLegRaiseHoldRef"];
  playerLowerBodyStabilityRef: MovementAvatarPreBodyInput["playerLowerBodyStabilityRef"];
  plantedFootLockRef: MovementAvatarReadyFrameApplicationInput["plantedFootLockRef"];
  positionOffset: MovementAvatarPreBodyInput["positionOffset"];
  profile: MovementAvatarReadyFrameApplicationInput["profile"] & MovementAvatarPreBodyInput["profile"];
  profileName: MovementAvatarReadyFrameApplicationInput["profileName"];
  providedRetargetSourceModel: MovementRetargetSourceModel | null;
  recordedRootMotionFrame: MovementRootMotionFrame | null;
  retargetAvatarRestRef: MovementAvatarReadyFrameApplicationInput["retargetAvatarRestRef"];
  retargetSourceModelRef: MovementAvatarMutableRef<MovementRetargetSourceModel | null>;
  rigHands: MovementAvatarReadyFrameApplicationInput["rigHands"];
  scene: MovementAvatarFrameScenePreparationInput["scene"] &
    MovementAvatarReadyFrameApplicationInput["scene"];
  setupStateRef: MovementAvatarPreBodyInput["setupStateRef"];
  targetSolverLandmarks: MovementAvatarReadyFrameApplicationInput["targetSolverLandmarks"];
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  worldLandmarks: MovementAvatarFrameWorldInput["worldLandmarks"];
}): MovementAvatarReadyFrameOrchestrationRuntime {
  const frameWorldRuntime = resolveMovementAvatarFrameWorldRuntime({ worldLandmarks });
  const scenePreparationRuntime = resolveMovementAvatarFrameScenePreparationRuntime({
    avatarRole,
    lookupBone,
    scene,
  });
  const preBodyFrameOrchestrationRuntime = applyMovementAvatarPreBodyFrameOrchestrationRuntime({
    avatarBaseY,
    avatarRole,
    avatarRoot,
    displayWorldPose: displayPreparedInput,
    exerciseTransitionStateRef,
    faceLandmarks,
    forceStandby,
    hands: rigHands ?? undefined,
    history: liveRootMotionHistory,
    instructorLowerBodyStabilityRef,
    isLivePlayer: isPlayer,
    manualCalibration,
    mirrorPlayerDisplay,
    motionFrame,
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
    poseLandmarks: imageLandmarks,
    positionOffset,
    profile,
    providedRetargetSourceModel,
    recordedRootMotionFrame,
    retargetSourceModelRef,
    setupStateRef,
    trackingDebugRef,
    worldPoseForLocomotion: frameWorldRuntime.worldPoseForLocomotion,
    worldPoseForSetup: frameWorldRuntime.worldPoseForSetup,
  });

  if (preBodyFrameOrchestrationRuntime.status === "fallback-demo-pose") {
    applyDemoFallbackPose(fallbackPoseSlerp);
    return {
      frameWorldRuntime,
      preBodyFrameOrchestrationRuntime,
      scenePreparationRuntime,
      status: "fallback-demo-pose",
    };
  }

  const {
    bodyFrameOrchestrationRuntime,
    completionFrameOrchestrationRuntime,
  } = applyMovementAvatarReadyFrameApplicationRuntime({
    avatarName,
    avatarRole,
    avatarRoot,
    baseBonePositionRef,
    baseHipsPositionRef,
    blendshapes,
    boneEaseOptions,
    faceLandmarks,
    frameWorldRuntime,
    imageLandmarks,
    isPlayer,
    lastGoodQuaternionRef,
    lookupBone,
    manualCalibration,
    mirrorPlayerDisplay,
    plantedFootLockRef,
    playerLegRaiseHoldRef,
    preBodyFrameOrchestrationRuntime,
    profile,
    profileName,
    retargetAvatarRestRef,
    retargetSourceModelRef,
    rigHands,
    scene,
    scenePreparationRuntime,
    targetSolverLandmarks,
    trackingDebugRef,
    vrm,
  });

  return {
    bodyFrameOrchestrationRuntime,
    completionFrameOrchestrationRuntime,
    frameWorldRuntime,
    preBodyFrameOrchestrationRuntime,
    scenePreparationRuntime,
    status: "ready",
  };
}
