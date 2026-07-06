"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  getMovementAvatarTrackingProfile,
  getMovementAvatarTrackingProfileName,
} from "../../../_lib/movementAvatarProfiles";
import { resolveMovementAvatarLegacyLowerBodyAimOptions } from "../../../_lib/movementAvatarPipeline";
import { resolveMovementAvatarLowerBodyFrameStateRuntime } from "../../../_lib/movementAvatarLowerBodyFrameStateRuntime";
import { applyMovementAvatarLowerBodyFrameStateRefsRuntime } from "../../../_lib/movementAvatarLowerBodyFrameStateRefsRuntime";
import { applyMovementAvatarLowerBodyFrameRuntime } from "../../../_lib/movementAvatarLowerBodyFrameRuntime";
import { resolveMovementAvatarFrameTargetRuntime } from "../../../_lib/movementAvatarFrameTargetRuntime";
import {
  applyMovementAvatarOptionalPostFrameDebugTelemetry,
  type MovementAvatarRetargetDebugRegistryWindow,
} from "../../../_lib/movementAvatarDebugTelemetry";
import { createMovementAvatarRetargetFrameRuntimeAdapters } from "../../../_lib/movementAvatarRetargetFrameRuntime";
import { applyMovementAvatarFootingFrameRuntime } from "../../../_lib/movementAvatarFootingFrameRuntime";
import { applyMovementAvatarFootingFrameRefsRuntime } from "../../../_lib/movementAvatarFootingFrameRefsRuntime";
import { applyMovementAvatarSupportFrameRuntime } from "../../../_lib/movementAvatarSupportFrameRuntime";
import { applyMovementAvatarUpperBodyFrameRuntime } from "../../../_lib/movementAvatarUpperBodyFrameRuntime";
import { applyMovementAvatarHeadFrameRuntime } from "../../../_lib/movementAvatarHeadFrameRuntime";
import { applyMovementAvatarHeadFrameRefsRuntime } from "../../../_lib/movementAvatarHeadFrameRefsRuntime";
import {
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import type { MovementRootMotionFrame } from "../../../_lib/movementRootMotion";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import { applyMovementAvatarRootFrameRuntime } from "../../../_lib/movementAvatarRootFrameRuntime";
import { applyMovementAvatarRootFrameRefsRuntime } from "../../../_lib/movementAvatarRootFrameRefsRuntime";
import { resolveMovementAvatarFrameDecisionRuntime } from "../../../_lib/movementAvatarFrameDecisionRuntime";
import { applyMovementAvatarFrameDecisionRefsRuntime } from "../../../_lib/movementAvatarFrameDecisionRefsRuntime";
import {
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import { resolveMovementAvatarHipsFrameRuntime } from "../../../_lib/movementAvatarHipsFrameRuntime";
import {
  useMovementAvatarRuntimeRefs,
  useSyncMovementAvatarRuntimeInputs,
} from "../../../_lib/movementAvatarRuntimeRefs";
import { resetMovementAvatarRuntimeRefs } from "../../../_lib/movementAvatarRuntimeReset";
import { resolveMovementAvatarFrameSetupRuntime } from "../../../_lib/movementAvatarFrameSetupRuntime";
import { applyMovementAvatarFrameSetupRefsRuntime } from "../../../_lib/movementAvatarFrameSetupRefsRuntime";
import { applyMovementAvatarEndFrameRuntime } from "../../../_lib/movementAvatarEndFrameRuntime";
import { createMovementAvatarFrameAccessRuntime } from "../../../_lib/movementAvatarFrameAccessRuntime";
import { resolveMovementAvatarFrameRuntimeContext } from "../../../_lib/movementAvatarFrameRuntimeContext";
import { createMovementAvatarLowerBodyFrameCallbacksRuntime } from "../../../_lib/movementAvatarLowerBodyFrameCallbacksRuntime";
import { resolveMovementAvatarReadyFrameRuntime } from "../../../_lib/movementAvatarReadyFrameRuntime";
import {
  type VrmMotionRef,
} from "../../../_lib/vrmRigging";
import { resolveMovementAvatarSolvedFrameRuntime } from "../../../_lib/movementAvatarSolverRuntime";

type LoaderPlugin = ReturnType<Parameters<InstanceType<typeof GLTFLoader>["register"]>[0]>;

const AVATAR_BASE_Y = -2.8;

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
  const vrmRef = useRef<VRM | null>(null);
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

  const urlToLoad = isPlayer ? `${vrmUrl}?player` : vrmUrl;

  const gltf = useLoader(GLTFLoader, urlToLoad, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as unknown as LoaderPlugin);
  });
  const loadedVrm = gltf.userData.vrm as VRM | undefined;
  const avatarScene = loadedVrm?.scene ?? gltf.scene;
  const nameLabelX = positionOffset[0] < 0 ? 0.95 : -0.95;

  useEffect(() => {
    if (loadedVrm) {
      VRMUtils.combineSkeletons(gltf.scene);
      vrmRef.current = loadedVrm;
      resetMovementAvatarRuntimeRefs({
        refs: resetRefs,
        vrm: loadedVrm,
      });
    }
  }, [gltf.scene, loadedVrm, resetRefs]);

  useFrame((state, delta) => {
    const frameRuntimeContext = resolveMovementAvatarFrameRuntimeContext({
      avatarRoot: group.current,
      delta,
      vrm: vrmRef.current,
    });
    if (!frameRuntimeContext) return;
    const { avatarRoot, vrm } = frameRuntimeContext;

    const {
      applyDemoFallbackPose,
      avatarRole,
      boneEaseOptions,
      lookupBone: lookupVrmBone,
    } = createMovementAvatarFrameAccessRuntime({
      avatarRole: usesPlayerMotionPath ? "player" : "instructor",
      getVrm: () => vrm,
    });

    const solvedFrameRuntime = resolveMovementAvatarSolvedFrameRuntime({
      isPlaying,
      motionRef: landmarksRef.current,
      showPausedPose,
      usesPlayerMotionPath,
    });
    const readyFrameRuntime = resolveMovementAvatarReadyFrameRuntime({
      hasHumanoid: Boolean(vrm.humanoid),
      solvedFrameRuntime,
    });
    if (readyFrameRuntime.status === "fallback-demo-pose") {
      applyDemoFallbackPose();
      return;
    }
    if (readyFrameRuntime.status !== "ready") return;

    const {
      displayPreparedInput,
      forceStandby,
      imageLandmarks: imageLms,
      mirrorPlayerDisplay,
      payload,
      rigBlendshapes,
      riggedPose,
      rigHands,
      solverLandmarks: solverLms,
      targetSolverLandmarks: targetSolverLms,
    } = readyFrameRuntime.solvedFrameRuntime;

    if (riggedPose) {
      const slerpFactor = usesPlayerMotionPath ? 0.5 : 0.3;

      const hipsNode = lookupVrmBone("hips");

      if (vrm.scene) {
        vrm.scene.updateMatrixWorld(true);
      }

      const frameSetupRuntime = resolveMovementAvatarFrameSetupRuntime({
        currentRetargetSourceModel: retargetSourceModelRef.current,
        faceLandmarks: payload?.faceLandmarks,
        hands: rigHands,
        isLivePlayer: usesPlayerMotionPath,
        manualCalibration: trackingCalibration,
        poseLandmarks: imageLms,
        previousSetupState: setupStateRef.current,
        providedRetargetSourceModel: retargetSourceModel,
        worldPoseLandmarks: payload?.worldLandmarks ?? undefined,
      });
      const {
        activeCalibration,
        autoCalibrationKind,
      } = applyMovementAvatarFrameSetupRefsRuntime({
        frameSetupRuntime,
        retargetSourceModelRef,
        setupStateRef,
      });
      const frameDecisionRuntime = resolveMovementAvatarFrameDecisionRuntime({
        motionFrame: motionFrameRef.current ?? null,
        previousExerciseTransitionState: exerciseTransitionStateRef.current,
      });
      const frameDecisionRefsRuntime = applyMovementAvatarFrameDecisionRefsRuntime({
        exerciseTransitionStateRef,
        frameDecisionRuntime,
      });
      if (frameDecisionRefsRuntime.status === "fallback-demo-pose") {
        applyDemoFallbackPose(0.35);
        return;
      }
      const {
        avatarDecision,
        exerciseTransition,
        motionFrameInput,
      } = frameDecisionRefsRuntime;
      const bodyConfidence = avatarDecision.bodyConfidence;
      const bodyOrientation = avatarDecision.bodyOrientation;
      const bodySupport = avatarDecision.bodySupport;
      const exercisePose = avatarDecision.exercisePose;
      const supportConstraint = avatarDecision.supportConstraint;
      const supportIntent = avatarDecision.supportIntent;
      const retargetFrame = avatarDecision.retargetFrame;
      const lowerBodyIntent = avatarDecision.lowerBodyIntent;
      let visualRootDrop = 0;
      let footLockCorrection = 0;
      let footLockDrift = 0;
      let footOwner = "neutral";
      let lowerBodyOwner = "neutral";
      let retargetAppliedLowerBody = 0;
      let retargetAppliedUpperBody = 0;
      let plantedSquatIkDepth = 0;
      const rightArmDecision = avatarDecision.rightArm;
      const leftArmDecision = avatarDecision.leftArm;
      const rightArmTrackingReady = rightArmDecision.isTrackingReady;
      const leftArmTrackingReady = leftArmDecision.isTrackingReady;
      const lowerBodyTrackingReady = avatarDecision.lowerBodyTrackingReady;
      const recordedLowerBodySourceReliable = avatarDecision.lowerBodySourceReliable;
      const torsoTrackingReady = avatarDecision.torsoTrackingReady;
      const activeSpineDrive = avatarDecision.spineDrive;
      const rootOrientation = avatarDecision.rootOrientation;
      const lowerBodyFrameStateRuntime = resolveMovementAvatarLowerBodyFrameStateRuntime({
        avatarDecision,
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        instructorLowerBodyVisualState: instructorLowerBodyStabilityRef.current,
        now: performance.now(),
        playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
        playerLowerBodyVisualState: playerLowerBodyStabilityRef.current,
      });
      const { legRaiseHoldDecision } = applyMovementAvatarLowerBodyFrameStateRefsRuntime({
        instructorLowerBodyStabilityRef,
        lowerBodyFrameStateRuntime,
        playerLegRaiseHoldRef,
        playerLowerBodyStabilityRef,
      });
      const lowerBodyDrive = lowerBodyFrameStateRuntime.lowerBodyDrive;
      const liveSquatDepth = lowerBodyFrameStateRuntime.liveSquatDepth;
      const shouldApplyLowerBody = lowerBodyFrameStateRuntime.shouldApplyLowerBody;
      const shouldApplySolverTorso = lowerBodyFrameStateRuntime.shouldApplySolverTorso;
      const shouldUseRetargetedUpperBody = avatarDecision.shouldUseRetargetedUpperBody;
      const torsoOwner = avatarDecision.torsoOwner;
      const playerSquatPresentationDepth = lowerBodyFrameStateRuntime.playerSquatPresentationDepth;
      const balancedPlantedSquatDepth = lowerBodyFrameStateRuntime.balancedPlantedSquatDepth;
      const recordedLowerBodySegmentMotion = avatarDecision.lowerBodySegmentMotion;
      const instructorSquatPresentationDepth = lowerBodyFrameStateRuntime.instructorSquatPresentationDepth;
      visualRootDrop = lowerBodyFrameStateRuntime.visualRootDrop;
      const lowerBodyTarget = lowerBodyFrameStateRuntime.lowerBodyTarget;
      const shouldHoldPlayerSquatPose = lowerBodyFrameStateRuntime.shouldHoldPlayerSquatPose;
      const playerRetargetLowerBodyMotion = lowerBodyFrameStateRuntime.playerRetargetLowerBodyMotion;
      const hipsFrameRuntime = resolveMovementAvatarHipsFrameRuntime({
        avatarRole,
        calibration: activeCalibration,
        lowerBodyDrive,
        lowerBodyTrackingReady,
        playerSquatPresentationDepth,
        poseLandmarks: imageLms,
        profile: avatarTrackingProfile,
        shouldApplyLowerBody,
      });
      const { calibratedFloorCorrection } = hipsFrameRuntime.floorRuntime;
      const { hipsApplication, hipsPositionOptions } = hipsFrameRuntime;

      if (forceStandby) {
        applyDemoFallbackPose(0.35);
        return;
      }

      const rootFrameRuntime = applyMovementAvatarRootFrameRuntime({
        avatarBaseY: AVATAR_BASE_Y,
        avatarRoot,
        avatarRootVisualLerp: hipsPositionOptions.avatarRootVisualLerp,
        history: liveRootMotionHistoryRef.current,
        livePose: imageLms,
        liveWorldPose: mirrorPlayerDisplay && payload?.worldLandmarks
          ? displayPreparedInput.solverLandmarks
          : payload?.worldLandmarks ?? null,
        positionOffset,
        recordedRootMotionFrame: rootMotionFrameRef.current,
        rootOrientation,
        visualRootDrop,
      });
      const { stepResponse } = rootFrameRuntime;
      applyMovementAvatarRootFrameRefsRuntime({
        rootFrameRuntime,
        trackingDebugRef,
      });

      const frameTargetRuntime = resolveMovementAvatarFrameTargetRuntime({
        avatarRole,
        imageLandmarks: imageLms,
        lowerBodyDrive,
        rigHands,
        solverLandmarks: solverLms,
        targetSolverLandmarks: targetSolverLms,
      });
      const { armTargetComposition } = frameTargetRuntime;
      const { armTargets } = armTargetComposition;
      const { lowerBodyTargetComposition } = frameTargetRuntime;
      const {
        aimTargets: lowerBodyAimTargets,
        selections: lowerBodyTargetSelections,
      } = lowerBodyTargetComposition;

      const retargetFrameRuntimeAdapters = createMovementAvatarRetargetFrameRuntimeAdapters({
        avatarRole,
        avatarRoot,
        currentRestMap: retargetAvatarRestRef.current,
        hasWorldLandmarks: Boolean(payload?.worldLandmarks),
        instructorSquatPresentationDepth,
        lastGood: lastGoodQuatRef.current,
        lookupBone: lookupVrmBone,
        lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
        profile: avatarTrackingProfile,
        retargetFrame,
        shouldUseRetargetedUpperBody,
        vrm,
      });

      const rp = riggedPose;

      const upperBodyFrameRuntime = applyMovementAvatarUpperBodyFrameRuntime({
        activeSpineDrive,
        applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
        armTargetComposition,
        avatarRole,
        boneEaseOptions,
        fallbackZScale: payload?.worldLandmarks ? 1 : 0.1,
        lastGood: lastGoodQuatRef.current,
        leftArmDecision,
        lookupBone: lookupVrmBone,
        profile: avatarTrackingProfile,
        rightArmDecision,
        shouldApplySolverTorso,
        shouldUseRetargetedUpperBody,
        sources: {
          hips: rp.Hips?.rotation,
          spine: rp.Spine,
        },
        torsoTrackingReady,
      });
      retargetAppliedUpperBody = upperBodyFrameRuntime.retargetAppliedUpperBody;
      const lowerBodyFrameCallbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
        lastGoodQuaternionRef: lastGoodQuatRef,
        scene: vrm.scene,
      });

      const lowerBodyFrameRuntime = applyMovementAvatarLowerBodyFrameRuntime({
        applyPlantedSquatIk: retargetFrameRuntimeAdapters.applyPlantedSquatIk,
        applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
        avatarRole,
        balancedPlantedSquatDepth,
        boneEaseOptions,
        currentFeetOwner: footOwner,
        currentLowerBodyOwner: lowerBodyOwner,
        fallbackSlerp: slerpFactor,
        getLastGoodQuaternion: lowerBodyFrameCallbacks.getLastGoodQuaternion,
        instructorSquatPresentationDepth,
        lookupBone: lookupVrmBone,
        lowerBodyAimOptions: resolveMovementAvatarLegacyLowerBodyAimOptions({
          avatarRole,
          profile: avatarTrackingProfile,
        }),
        lowerBodyAimTargets,
        lowerBodyDrive,
        lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
        lowerBodyTarget,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        playerSquatPresentationDepth,
        recordedLowerBodySourceReliable,
        retargetFrame,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedLowerBodySources: {
          LeftLowerLeg: rp.LeftLowerLeg,
          LeftUpperLeg: rp.LeftUpperLeg,
          RightLowerLeg: rp.RightLowerLeg,
          RightUpperLeg: rp.RightUpperLeg,
        },
        squatFlexionBendBoost: avatarTrackingProfile.squatLegBendBoost,
        storeLastGoodQuaternion: lowerBodyFrameCallbacks.storeLastGoodQuaternion,
        targetSolverLandmarks: targetSolverLms,
        updateWorldMatrix: lowerBodyFrameCallbacks.updateWorldMatrix,
        zScale: payload?.worldLandmarks ? 1 : 0.1,
      });
      lowerBodyOwner = lowerBodyFrameRuntime.lowerBodyOwner;
      footOwner = lowerBodyFrameRuntime.footOwner;
      plantedSquatIkDepth = lowerBodyFrameRuntime.plantedSquatIkDepth;
      retargetAppliedLowerBody = lowerBodyFrameRuntime.retargetAppliedLowerBody;
      retargetAvatarRestRef.current = retargetFrameRuntimeAdapters.getRestMap();

      const supportFrameRuntime = applyMovementAvatarSupportFrameRuntime({
        avatarRoot,
        contactLocks: avatarDecision.supportContactLocks,
        currentLowerBodyOwner: lowerBodyOwner,
        floorY: -2.75 + calibratedFloorCorrection,
        lookupBone: lookupVrmBone,
        scene: vrm.scene,
        supportPresentation: avatarDecision.supportPresentation,
      });
      lowerBodyOwner = supportFrameRuntime.nextLowerBodyOwner ?? lowerBodyOwner;
      const supportContactTelemetry = supportFrameRuntime.supportContactTelemetry;

      const debugUpdatedAt = performance.now();
      const headFrameRuntime = applyMovementAvatarHeadFrameRuntime({
        debugUpdatedAt,
        debugInput: trackingDebugRef
          ? {
              activeCalibrationQuality: activeCalibration?.quality,
              activeSpineDrive,
              armTargets,
              autoCalibrationKind,
              avatarRole,
              bodyConfidence,
              exercisePose,
              exerciseTransition,
              feetOwner: footOwner,
              footLock: {
                correction: footLockCorrection,
                drift: footLockDrift,
                state: plantedFootLockRef.current,
              },
              hasActiveCalibration: Boolean(activeCalibration),
              hasManualCalibration: Boolean(trackingCalibration),
              leftArmTrackingReady,
              leftFootSource: lowerBodyTargetSelections.leftToe.source,
              leftKneeSource: lowerBodyTargetSelections.leftKnee.source,
              legRaise: {
                holdDecision: legRaiseHoldDecision,
                lowerBodyDrive,
                lowerBodyIntent,
                now: debugUpdatedAt,
                playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
              },
              lowerBodyIntent,
              lowerBodyOwner,
              lowerBodyTrackingReady,
              motionFrameInputOwner: motionFrameInput.owner,
              orientation: bodyOrientation,
              profileName: avatarTrackingProfileName,
              retarget: {
                appliedLowerBody: retargetAppliedLowerBody,
                appliedUpperBody: retargetAppliedUpperBody,
                liveSquatDepth,
                plantedSquatIkDepth,
                retargetFrame,
                retargetSourceModel: retargetSourceModelRef.current,
                visualRootDrop,
              },
              rightArmTrackingReady,
              rightFootSource: lowerBodyTargetSelections.rightToe.source,
              rightKneeSource: lowerBodyTargetSelections.rightKnee.source,
              shouldApplyLowerBody,
              support: bodySupport,
              supportConstraint,
              supportContact: supportContactTelemetry,
              supportIntent,
              supportPresentation: avatarDecision.supportPresentation,
              torsoOwner,
            }
          : null,
        headInput: {
          avatarRole,
          avatarRootYaw: avatarRoot.rotation.y,
          baseHeadPosition: baseBonePositionRef.current.head,
          calibration: activeCalibration,
          faceLandmarks: payload?.faceLandmarks,
          lookupBone: lookupVrmBone,
          neckSlerp: avatarTrackingProfile.neckSlerp,
          poseLandmarks: imageLms,
          profile: avatarTrackingProfile,
          shouldApplyLowerBody,
          shouldApplySpine: activeSpineDrive.shouldApplySpine,
        },
      });
      applyMovementAvatarHeadFrameRefsRuntime({
        baseBonePositionRef,
        headFrameRuntime,
        trackingDebugRef,
      });

      const leftFoot = lookupVrmBone("leftFoot");
      const rightFoot = lookupVrmBone("rightFoot");
      const footingRuntime = applyMovementAvatarFootingFrameRuntime({
        avatarRole,
        avatarRoot,
        baseHipsPosition: baseHipsPositionRef.current,
        floorY: -2.75 + calibratedFloorCorrection,
        hipsApplication,
        hipsNode,
        hipsPositionOptions,
        leftFoot,
        lowerBodyDrive,
        lowerBodyTrackingReady,
        previousFootLockState: plantedFootLockRef.current,
        retargetFrame,
        rightFoot,
        scene: vrm.scene,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        stepResponse,
      });
      const footingFrameRefsRuntime = applyMovementAvatarFootingFrameRefsRuntime({
        baseHipsPositionRef,
        footingRuntime,
        plantedFootLockRef,
      });
      footLockDrift = footingFrameRefsRuntime.footLockDrift;
      footLockCorrection = footingFrameRefsRuntime.footLockCorrection;
      if (trackingDebugRef) {
        trackingDebugRef.current = applyMovementAvatarOptionalPostFrameDebugTelemetry({
          avatarName: name,
          avatarRole,
          footLock: footingRuntime.footLockDebug,
          frameUpdatedAt: performance.now(),
          registryWindow: typeof window === "undefined"
            ? undefined
            : window as Window & MovementAvatarRetargetDebugRegistryWindow,
          retargetFrame,
          state: trackingDebugRef.current,
          vrm,
          zScale: payload?.worldLandmarks ? 1 : 0.18,
        });
      }

      applyMovementAvatarEndFrameRuntime({
        blendshapes: rigBlendshapes,
        expressionManager: vrm.expressionManager,
        hands: rigHands,
        isPlayer: usesPlayerMotionPath,
        lookupBone: lookupVrmBone,
        mirrorForDisplay: mirrorPlayerDisplay,
      });
    }
  });

  return (
    <group
      ref={group}
      position={[positionOffset[0], AVATAR_BASE_Y, positionOffset[2]]}
      rotation={[0, Math.PI, 0]}
      scale={5.25}
    >
      <primitive object={avatarScene} />

      {showNameLabel ? (
        <Html position={[nameLabelX, -0.38, 0]} center zIndexRange={[100, 0]}>
          <div className="rounded-full border border-white/10 bg-[#111018]/70 px-6 py-1.5 shadow-2xl backdrop-blur-md">
            <span
              className={`text-xs font-black uppercase tracking-[0.2em] ${
                isPlayer ? "text-[#f6ccbe]" : "text-[#a8d5ba]"
              }`}
            >
              {name}
            </span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
