"use client";

import type { VRM } from "@pixiv/three-vrm";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type * as THREE from "three";
import { applyMovementAvatarReadyFrameOrchestrationRuntime } from "../../../_lib/movementAvatarFrameApplication";
import { resolveMovementAvatarFrameEntryRuntime } from "../../../_lib/movementAvatarFrameEntry";
import { movementAvatarSourceAwareApplicationDeltaSeconds } from "../../../_lib/movementAvatarFrameTiming";
import {
  shouldHoldMovementAvatarLastPose,
  shouldWaitForMovementAvatarSourceSync,
} from "../../../_lib/movementAvatarMotionFrameInput";
import {
  getMovementAvatarTrackingProfile,
  getMovementAvatarTrackingProfileName,
} from "../../../_lib/movementAvatarProfiles";
import type { MovementAvatarRuntimeRefs } from "../../../_lib/movementAvatarRuntimeRefs";
import {
  consumeMovementAvatarRuntimeFrameJumpReset,
  shouldResetMovementAvatarRuntimeForFrameSeek,
} from "../../../_lib/movementAvatarRuntimeReset";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import type { MovementRetargetSourceModel } from "../../../_lib/movementRetargeting";
import type { MovementRootMotionFrame } from "../../../_lib/movementRootMotion";
import type {
  MovementCalibration,
  MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import type { VrmMotionRef } from "../../../_lib/vrmRigging";

export type VrmAvatarFrameApplicationProof = {
  currentSourceCapturedAt: number | null;
  lastAppliedSourceCapturedAt: number | null;
  status: "applied" | "duplicate" | "fallback" | "not-ready" | "waiting-motion";
  warmupFrameCount: number;
  warmupFrameIndex: number;
};

export type VrmAvatarFrameWarmup = {
  motionFrame: MovementMotionFrame;
  motionRef: VrmMotionRef;
};

export function useVrmAvatarFrameRuntime({
  avatarBaseY,
  displayRetargetSourceModel,
  externalRootMotionFrameRef,
  fallbackPoseSlerp,
  frameApplicationProofRef,
  frameResetKey,
  frameSeekIndex,
  frameWarmupSequenceRef,
  groupRef,
  holdPoseUntilPlaying = false,
  isPlaying,
  landmarksRef,
  motionFrameRef,
  name,
  positionOffset,
  registryRole,
  runtimeRefs,
  showPausedPose,
  trackingCalibration,
  trackingDebugRef,
  usesPlayerMotionPath,
  vrmRef,
  vrmUrl,
}: {
  avatarBaseY: number;
  displayRetargetSourceModel: MovementRetargetSourceModel | null;
  externalRootMotionFrameRef?: RefObject<MovementRootMotionFrame | null>;
  fallbackPoseSlerp: number;
  frameApplicationProofRef?: MutableRefObject<VrmAvatarFrameApplicationProof>;
  frameResetKey?: number | string;
  frameSeekIndex?: number;
  frameWarmupSequenceRef?: RefObject<ReadonlyArray<VrmAvatarFrameWarmup>>;
  groupRef: RefObject<THREE.Group | null>;
  // Hold the current (rest) pose entirely while not playing, instead of the
  // default standby presentation. Used by the ordinary Game's player avatar so
  // the start gate's partial tracking can never animate it.
  holdPoseUntilPlaying?: boolean;
  isPlaying: boolean;
  landmarksRef: RefObject<VrmMotionRef>;
  motionFrameRef: RefObject<MovementMotionFrame | null | undefined>;
  name: string;
  positionOffset: [number, number, number];
  // Which on-screen avatar this runtime registers as in the debug registry.
  // Distinct from the motion role: the recorded instructor runs the player
  // motion lane but must still be discoverable as "instructor".
  registryRole?: "instructor" | "player";
  runtimeRefs: MovementAvatarRuntimeRefs;
  showPausedPose: boolean;
  trackingCalibration: MovementCalibration | null;
  trackingDebugRef?: MutableRefObject<MovementTrackingDebugState | null>;
  usesPlayerMotionPath: boolean;
  vrmRef: RefObject<VRM | null>;
  vrmUrl: string;
}) {
  const pendingFrameResetRef = useRef(false);
  const frameWarmupIndexRef = useRef(0);
  const previousAppliedMotionRef = useRef<VrmMotionRef>(null);
  const previousFrameSeekIndexRef = useRef<number | null>(null);
  const previousAppliedSourceCapturedAtRef = useRef<number | null>(null);
  const rootCommandYRef = useRef<number | null>(null);
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);
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

  useEffect(() => {
    if (frameResetKey === undefined) return;
    pendingFrameResetRef.current = true;
    frameWarmupIndexRef.current = 0;
    previousAppliedMotionRef.current = null;
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
      previousAppliedMotionRef.current = null;
      previousAppliedSourceCapturedAtRef.current = null;
      rootCommandYRef.current = null;
    }
    previousFrameSeekIndexRef.current = frameSeekIndex;
  }, [frameSeekIndex]);

  useFrame((_, delta) => {
    const warmupFrame = frameWarmupSequenceRef?.current?.[frameWarmupIndexRef.current] ?? null;
    const motionFrame = warmupFrame?.motionFrame ?? motionFrameRef.current ?? null;
    const motionRef = warmupFrame?.motionRef ?? landmarksRef.current;
    const updateProof = (status: VrmAvatarFrameApplicationProof["status"]) => {
      if (!frameApplicationProofRef) return;
      frameApplicationProofRef.current = {
        currentSourceCapturedAt: motionFrame?.source.capturedAt ?? null,
        lastAppliedSourceCapturedAt: trackingDebugRef?.current?.sourceCapturedAt ?? null,
        status,
        warmupFrameCount: frameWarmupSequenceRef?.current?.length ?? 0,
        warmupFrameIndex: frameWarmupIndexRef.current,
      };
    };
    const motionRefCapturedAt = !Array.isArray(motionRef) && motionRef
      ? motionRef.capturedAt
      : undefined;
    const motionRefFrameId = !Array.isArray(motionRef) && motionRef
      ? motionRef.frameId
      : undefined;
    if (shouldWaitForMovementAvatarSourceSync({
      motionFrame,
      motionRefCapturedAt,
      motionRefFrameId,
    })) {
      updateProof("waiting-motion");
      return;
    }
    if (!warmupFrame && motionFrame && motionRef === previousAppliedMotionRef.current) {
      updateProof("duplicate");
      return;
    }
    if (shouldHoldMovementAvatarLastPose({ isPlaying, motionFrame })) {
      updateProof("waiting-motion");
      return;
    }
    // The ordinary Game's player avatar must not chase partial tracking while
    // the start gate ("step back until visible", countdown) is still running —
    // half-visible bodies produce garbage poses. Hold the rest pose entirely
    // until playback actually starts.
    if (holdPoseUntilPlaying && !isPlaying) {
      updateProof("waiting-motion");
      return;
    }

    const frameEntryRuntime = resolveMovementAvatarFrameEntryRuntime({
      avatarRoot: groupRef.current,
      avatarRole: usesPlayerMotionPath ? "player" : "instructor",
      delta,
      isPlaying,
      motionRef,
      showPausedPose,
      usesPlayerMotionPath,
      vrm: vrmRef.current,
    });
    if (frameEntryRuntime.status !== "ready") {
      updateProof("not-ready");
      return;
    }
    const { avatarRoot, vrm } = frameEntryRuntime.context;
    const frameJumpReset = consumeMovementAvatarRuntimeFrameJumpReset({
      pendingResetRef: pendingFrameResetRef,
      refs: resetRefs,
      vrm,
    });
    const sourceCapturedAt = motionFrame?.source.capturedAt;
    const applicationDeltaSeconds = movementAvatarSourceAwareApplicationDeltaSeconds({
      currentSourceCapturedAt: sourceCapturedAt,
      frameJumpReset,
      previousSourceCapturedAt: previousAppliedSourceCapturedAtRef.current,
      renderDeltaSeconds: delta,
    });
    if (Number.isFinite(sourceCapturedAt)) {
      previousAppliedSourceCapturedAtRef.current = sourceCapturedAt!;
    }

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
      rigDeepCapture,
      rigHands,
      targetSolverLandmarks,
    } = frameEntryRuntime.readyFrameRuntime.solvedFrameRuntime;

    const applicationRuntime = applyMovementAvatarReadyFrameOrchestrationRuntime({
      applyDemoFallbackPose,
      avatarBaseY,
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
      fallbackPoseSlerp,
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
      recordedRootMotionFrame: warmupFrame
        ? motionFrame?.rootMotionFrame ?? null
        : externalRootMotionFrameRef?.current ?? rootMotionFrameRef.current ?? motionFrame?.rootMotionFrame ?? null,
      registryRole: registryRole ?? (usesPlayerMotionPath ? "player" : "instructor"),
      retargetAvatarRestRef,
      retargetSourceModelRef,
      rigDeepCapture,
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
    if (applicationRuntime.status !== "ready") {
      updateProof("fallback");
      return;
    }
    if (trackingDebugRef?.current && motionFrame) {
      trackingDebugRef.current.sourceCapturedAt = motionFrame.source.capturedAt;
      trackingDebugRef.current.sourceFrameId = motionFrame.source.frameId;
      const registry = (window as Window & {
        __hakkenMovementAvatarDebug?: Partial<Record<
          "instructor" | "player",
          MovementTrackingDebugState
        >>;
      }).__hakkenMovementAvatarDebug;
      const registryDebug = registry?.[registryRole ?? (usesPlayerMotionPath ? "player" : "instructor")];
      if (registryDebug) {
        registryDebug.sourceCapturedAt = motionFrame.source.capturedAt;
        registryDebug.sourceFrameId = motionFrame.source.frameId;
      }
    }
    previousAppliedMotionRef.current = motionRef;
    if (warmupFrame) frameWarmupIndexRef.current += 1;
    updateProof("applied");
  });
}
