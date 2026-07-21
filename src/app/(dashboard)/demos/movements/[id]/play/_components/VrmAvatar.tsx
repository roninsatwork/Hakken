"use client";

import { useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import {
  mapMovementRetargetSourceModelForDisplay,
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import type { MovementRootMotionFrame } from "../../../_lib/movementRootMotion";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import type { MovementCalibration, MovementTrackingDebugState } from "../../../_lib/movementTrackingCalibration";
import {
  useMovementAvatarRuntimeRefs,
  useSyncMovementAvatarRuntimeInputs,
} from "../../../_lib/movementAvatarRuntimeRefs";
import { useMovementAvatarVrmAssetRuntime } from "../../../_lib/movementAvatarVrmAssetRuntime";
import {
  type VrmMotionRef,
} from "../../../_lib/vrmRigging";
import { VrmAvatarPresentation } from "./VrmAvatarPresentation";
import {
  useVrmAvatarFrameRuntime,
  type VrmAvatarFrameApplicationProof,
  type VrmAvatarFrameWarmup,
} from "./useVrmAvatarFrameRuntime";

const AVATAR_BASE_Y = -2.8;
const AVATAR_FRAME_FALLBACK_SLERP = 0.35;

type VrmAvatarProps = {
  assetVariant?: string;
  debugRegistryRole?: "instructor" | "player";
  holdPoseUntilPlaying?: boolean;
  frameApplicationProofRef?: MutableRefObject<VrmAvatarFrameApplicationProof>;
  frameWarmupSequenceRef?: RefObject<ReadonlyArray<VrmAvatarFrameWarmup>>;
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
  assetVariant,
  debugRegistryRole,
  holdPoseUntilPlaying = false,
  frameApplicationProofRef,
  frameWarmupSequenceRef,
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
  const runtimeRefs = useMovementAvatarRuntimeRefs(rootMotionFrame);
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
    assetVariant,
    isPlayer,
    resetRefs: runtimeRefs.resetRefs,
    vrmUrl,
  });

  useVrmAvatarFrameRuntime({
    avatarBaseY: AVATAR_BASE_Y,
    displayRetargetSourceModel,
    externalRootMotionFrameRef,
    fallbackPoseSlerp: AVATAR_FRAME_FALLBACK_SLERP,
    frameApplicationProofRef,
    frameResetKey,
    frameSeekIndex,
    frameWarmupSequenceRef,
    groupRef: group,
    holdPoseUntilPlaying,
    isPlaying,
    landmarksRef,
    motionFrameRef,
    name,
    positionOffset,
    registryRole: debugRegistryRole,
    runtimeRefs,
    showPausedPose,
    trackingCalibration,
    trackingDebugRef,
    usesPlayerMotionPath,
    vrmRef,
    vrmUrl,
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
