"use client";

import { useRef, type MutableRefObject, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  getMovementAvatarTrackingProfile,
  getMovementAvatarTrackingProfileName,
} from "../../../_lib/movementAvatarProfiles";
import {
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import type { MovementRootMotionFrame } from "../../../_lib/movementRootMotion";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import {
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import {
  useMovementAvatarRuntimeRefs,
  useSyncMovementAvatarRuntimeInputs,
} from "../../../_lib/movementAvatarRuntimeRefs";
import { useMovementAvatarVrmAssetRuntime } from "../../../_lib/movementAvatarVrmAssetRuntime";
import {
  type VrmMotionRef,
} from "../../../_lib/vrmRigging";
import { resolveMovementAvatarFrameEntryRuntime } from "../../../_lib/movementAvatarFrameEntryRuntime";
import { VrmAvatarPresentation } from "./VrmAvatarPresentation";
import { applyMovementAvatarReadyFrameOrchestrationRuntime } from "../../../_lib/movementAvatarReadyFrameOrchestrationRuntime";

const AVATAR_BASE_Y = -2.8;
const AVATAR_FRAME_FALLBACK_SLERP = 0.35;

type VrmAvatarProps = {
  landmarksRef: RefObject<VrmMotionRef>;
  motionFrameRef: RefObject<MovementMotionFrame | null | undefined>;
  positionOffset: [number, number, number];
  isPlayer?: boolean;
  isPlaying?: boolean;
  motionMode?: "player" | "recorded";
  showPausedPose?: boolean;
  showNameLabel?: boolean;
  trackingCalibration?: MovementCalibration | null;
  trackingDebugRef?: MutableRefObject<MovementTrackingDebugState | null>;
  retargetSourceModel?: MovementRetargetSourceModel | null;
  rootMotionFrame?: MovementRootMotionFrame | null;
  vrmUrl: string;
  name: string;
};

export default function VrmAvatar({
  landmarksRef,
  motionFrameRef,
  positionOffset,
  isPlayer = false,
  isPlaying = true,
  motionMode,
  showPausedPose = false,
  showNameLabel = true,
  trackingCalibration = null,
  trackingDebugRef,
  retargetSourceModel = null,
  rootMotionFrame = null,
  vrmUrl,
  name,
}: VrmAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const runtimeRefs = useMovementAvatarRuntimeRefs(rootMotionFrame);
  const {
    baseBonePositionRef,
    baseHipsPositionRef,
    exerciseTransitionStateRef,
    instructorLowerBodyStabilityRef,
    lastGoodQuatRef,
    liveRootMotionHistoryRef,
    plantedFootLockRef,
    playerLegRaiseHoldRef,
    playerLowerBodyStabilityRef,
    resetRefs,
    retargetAvatarRestRef,
    retargetSourceModelRef,
    rootMotionFrameRef,
    setupStateRef,
  } = runtimeRefs;
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);
  const usesPlayerMotionPath = isPlayer && motionMode !== "recorded";

  useSyncMovementAvatarRuntimeInputs({
    refs: runtimeRefs,
    retargetSourceModel,
    rootMotionFrame,
    shouldClearRetargetSourceModel: usesPlayerMotionPath && Boolean(trackingCalibration) && !retargetSourceModel,
  });

  const { avatarScene, vrmRef } = useMovementAvatarVrmAssetRuntime({
    isPlayer,
    resetRefs,
    vrmUrl,
  });

  useFrame((_, delta) => {
    const frameEntryRuntime = resolveMovementAvatarFrameEntryRuntime({
      avatarRoot: group.current,
      avatarRole: usesPlayerMotionPath ? "player" : "instructor",
      delta,
      isPlaying,
      motionRef: landmarksRef.current,
      showPausedPose,
      usesPlayerMotionPath,
      vrm: vrmRef.current,
    });
    if (frameEntryRuntime.status !== "ready") return;
    const { avatarRoot, vrm } = frameEntryRuntime.context;

    const {
      avatarRole,
      boneEaseOptions,
      lookupBone: lookupVrmBone,
      applyDemoFallbackPose,
    } = frameEntryRuntime.accessRuntime;

    const {
      displayPreparedInput,
      faceLandmarks,
      forceStandby,
      imageLandmarks,
      mirrorPlayerDisplay,
      payload,
      rigBlendshapes,
      rigHands,
      targetSolverLandmarks,
    } = frameEntryRuntime.readyFrameRuntime.solvedFrameRuntime;

    applyMovementAvatarReadyFrameOrchestrationRuntime({
        applyDemoFallbackPose,
        avatarBaseY: AVATAR_BASE_Y,
        avatarName: name,
        avatarRole,
        avatarRoot,
        baseBonePositionRef,
        baseHipsPositionRef,
        blendshapes: rigBlendshapes,
        boneEaseOptions,
        displayPreparedInput: displayPreparedInput.solverLandmarks,
        exerciseTransitionStateRef,
        faceLandmarks,
        fallbackPoseSlerp: AVATAR_FRAME_FALLBACK_SLERP,
        forceStandby,
        imageLandmarks,
        instructorLowerBodyStabilityRef,
        isPlayer: usesPlayerMotionPath,
        lastGoodQuaternionRef: lastGoodQuatRef,
        liveRootMotionHistory: liveRootMotionHistoryRef.current,
        lookupBone: lookupVrmBone,
        manualCalibration: trackingCalibration,
        mirrorPlayerDisplay,
        motionFrame: motionFrameRef.current ?? null,
        playerLegRaiseHoldRef,
        playerLowerBodyStabilityRef,
        plantedFootLockRef,
        positionOffset,
        profile: avatarTrackingProfile,
        profileName: avatarTrackingProfileName,
        providedRetargetSourceModel: retargetSourceModel,
        recordedRootMotionFrame: rootMotionFrameRef.current,
        retargetAvatarRestRef,
        retargetSourceModelRef,
        rigHands,
        scene: vrm.scene,
        setupStateRef,
        targetSolverLandmarks,
        trackingDebugRef,
        vrm,
        worldLandmarks: payload?.worldLandmarks,
    });
  });

  return (
    <VrmAvatarPresentation
      avatarBaseY={AVATAR_BASE_Y}
      avatarScene={avatarScene}
      groupRef={group}
      isPlayer={isPlayer}
      name={name}
      positionOffset={positionOffset}
      showNameLabel={showNameLabel}
    />
  );
}
