"use client";

import { useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  getMovementAvatarTrackingProfile,
  getMovementAvatarTrackingProfileName,
} from "../../../_lib/movementAvatarProfiles";
import {
  mapMovementRetargetSourceModelForDisplay,
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
import { resolveMovementAvatarFrameEntryRuntime } from "../../../_lib/movementAvatarFrameEntry";
import { VrmAvatarPresentation } from "./VrmAvatarPresentation";
import { applyMovementAvatarReadyFrameOrchestrationRuntime } from "../../../_lib/movementAvatarFrameApplication";
import {
  consumeMovementAvatarRuntimeFrameJumpReset,
  shouldResetMovementAvatarRuntimeForFrameSeek,
} from "../../../_lib/movementAvatarRuntimeReset";
import { shouldHoldMovementAvatarLastPose } from "../../../_lib/movementAvatarMotionFrameInput";
import { movementAvatarSourceAwareApplicationDeltaSeconds } from "../../../_lib/movementAvatarFrameTiming";

const AVATAR_BASE_Y = -2.8;
const AVATAR_FRAME_FALLBACK_SLERP = 0.35;

type VrmAvatarProps = {
  frameSeekIndex?: number;
  frameResetKey?: number | string;
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
  rootMotionFrameRef?: RefObject<MovementRootMotionFrame | null>;
  vrmUrl: string;
  name: string;
};

export default function VrmAvatar({
  frameSeekIndex,
  frameResetKey,
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
  rootMotionFrameRef: externalRootMotionFrameRef,
  vrmUrl,
  name,
}: VrmAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const pendingFrameResetRef = useRef(false);
  const previousFrameSeekIndexRef = useRef<number | null>(null);
  const previousAppliedSourceCapturedAtRef = useRef<number | null>(null);
  // Floor/support contact applies a correction after the root command. Keep
  // the command history separate so that correction cannot feed back into the
  // next frame's height interpolation and make the two controllers oscillate.
  const rootCommandYRef = useRef<number | null>(null);
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
    rigMeasurementsRef,
    rootMotionFrameRef,
    setupStateRef,
  } = runtimeRefs;
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);
  const usesPlayerMotionPath = isPlayer && motionMode !== "recorded";
  const displayRetargetSourceModel = useMemo(() => (
    usesPlayerMotionPath
      ? mapMovementRetargetSourceModelForDisplay({
          mirrorMode: "facing-player",
          sourceModel: retargetSourceModel,
        })
      : retargetSourceModel
  ), [retargetSourceModel, usesPlayerMotionPath]);

  useSyncMovementAvatarRuntimeInputs({
    refs: runtimeRefs,
    retargetSourceModel: displayRetargetSourceModel,
    rootMotionFrame,
    shouldClearRetargetSourceModel: usesPlayerMotionPath && Boolean(trackingCalibration) && !displayRetargetSourceModel,
  });

  const { avatarScene, vrmRef } = useMovementAvatarVrmAssetRuntime({
    isPlayer,
    resetRefs,
    vrmUrl,
  });

  useEffect(() => {
    if (frameResetKey === undefined) return;
    pendingFrameResetRef.current = true;
    previousAppliedSourceCapturedAtRef.current = null;
    rootCommandYRef.current = null;
  }, [frameResetKey]);

  useEffect(() => {
    if (frameSeekIndex === undefined) {
      previousFrameSeekIndexRef.current = null;
      previousAppliedSourceCapturedAtRef.current = null;
      return;
    }
    if (shouldResetMovementAvatarRuntimeForFrameSeek({
      nextFrameIndex: frameSeekIndex,
      previousFrameIndex: previousFrameSeekIndexRef.current,
    })) {
      pendingFrameResetRef.current = true;
      previousAppliedSourceCapturedAtRef.current = null;
      rootCommandYRef.current = null;
    }
    previousFrameSeekIndexRef.current = frameSeekIndex;
  }, [frameSeekIndex]);

  useFrame((_, delta) => {
    const motionFrame = motionFrameRef.current ?? null;
    if (shouldHoldMovementAvatarLastPose({ isPlaying, motionFrame })) return;

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
    const sourceCapturedAt = motionFrame?.source.capturedAt;
    const applicationDeltaSeconds = movementAvatarSourceAwareApplicationDeltaSeconds({
      currentSourceCapturedAt: sourceCapturedAt,
      previousSourceCapturedAt: previousAppliedSourceCapturedAtRef.current,
      renderDeltaSeconds: delta,
    });
    if (Number.isFinite(sourceCapturedAt)) {
      previousAppliedSourceCapturedAtRef.current = sourceCapturedAt!;
    }

    // Queue frame-jump resets until a solved pose is ready. The seek reset
    // clears only temporal history; it deliberately preserves visible bones
    // and rig calibration so Replay cannot flash through normalized standing.
    consumeMovementAvatarRuntimeFrameJumpReset({
      pendingResetRef: pendingFrameResetRef,
      refs: resetRefs,
      vrm,
    });

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
        frameDeltaSeconds: applicationDeltaSeconds,
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
        motionFrame,
        playerLegRaiseHoldRef,
        playerLowerBodyStabilityRef,
        plantedFootLockRef,
        positionOffset,
        profile: avatarTrackingProfile,
        profileName: avatarTrackingProfileName,
        providedRetargetSourceModel: displayRetargetSourceModel,
        recordedRootMotionFrame: externalRootMotionFrameRef?.current ?? rootMotionFrameRef.current,
        retargetAvatarRestRef,
        retargetSourceModelRef,
        rigHands,
        rigMeasurements: rigMeasurementsRef.current,
        rootCommandYRef,
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
