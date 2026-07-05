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
import {
  formatMovementAvatarRetargetDebugLabel,
  resolveMovementAvatarBoneEaseOptions,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarLegacyLowerBodyAimOptions,
  resolveMovementAvatarSpineApplyOptions,
  resolveMovementAvatarTrackingFallbackLabels,
  type MovementAvatarLowerBodyVisualState,
  type MovementAvatarPlayerLegRaiseHoldState,
} from "../../../_lib/movementAvatarPipeline";
import { resolveMovementAvatarLowerBodyTarget } from "../../../_lib/movementAvatarTarget";
import {
  applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones,
  applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones,
  applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones,
  applyMovementAvatarLowerBodyRetargetSegmentCounts,
  resolveMovementAvatarLowerBodyApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetAimRequests,
  resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput,
} from "../../../_lib/movementAvatarLowerBodyApplication";
import { resolveMovementAvatarArmTargetComposition } from "../../../_lib/movementAvatarArmTarget";
import { resolveMovementAvatarLowerBodyTargetSelectionComposition } from "../../../_lib/movementAvatarLowerBodyTargetSelection";
import {
  applyMovementAvatarPostFrameDebugTelemetry,
  buildMovementAvatarRootDebug,
  buildMovementAvatarRuntimeRetargetDebug,
  buildMovementAvatarTrackingDebugState,
  buildMovementAvatarTrackingFallbackContext,
  type MovementAvatarRetargetDebugRegistryWindow,
} from "../../../_lib/movementAvatarDebugTelemetry";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
  buildMovementAvatarRetargetRestMap,
  type MovementAvatarRetargetRestMap,
} from "../../../_lib/movementAvatarRestPose";
import { applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones } from "../../../_lib/movementAvatarRetargetSegmentRuntime";
import { applyMovementAvatarPlantedSquatIkRuntimeToVrmBones } from "../../../_lib/movementAvatarPlantedSquatIkRuntime";
import {
  createMovementAvatarFootLockState,
  type MovementAvatarFootLockState,
} from "../../../_lib/movementAvatarFootLock";
import {
  applyMovementAvatarFootLockRuntimeRootCorrection,
  resolveMovementAvatarFootLockRuntimeDecision,
} from "../../../_lib/movementAvatarFootLockRuntime";
import { resolveMovementAvatarFootWorldRuntimeSnapshot } from "../../../_lib/movementAvatarFootWorldRuntime";
import { applyMovementAvatarSupportContactRuntimeLocks } from "../../../_lib/movementAvatarSupportContactRuntime";
import { applyMovementAvatarSupportPresentationRuntimeToVrmBones } from "../../../_lib/movementAvatarSupportPresentationRuntime";
import { applyMovementAvatarHeadRuntimeToVrmBones } from "../../../_lib/movementAvatarHeadRuntime";
import {
  getBalancedPlantedSquatDepth,
  getRecordedSquatPresentationDepth,
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import { resolveMovementAvatarRetargetSourceRuntimeModel } from "../../../_lib/movementAvatarRetargetSourceRuntime";
import {
  type MovementRootMotionFrame,
  type MovementRootMotionInputFrame,
} from "../../../_lib/movementRootMotion";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import { resolveMovementAvatarMotionFrameInput } from "../../../_lib/movementAvatarMotionFrameInput";
import { applyMovementAvatarRootStepRuntimeResponse } from "../../../_lib/movementAvatarRootStepRuntime";
import { applyMovementAvatarRootTransformRuntime } from "../../../_lib/movementAvatarRootTransformRuntime";
import { resolveMovementAvatarRootMotionRuntimeFrame } from "../../../_lib/movementAvatarRootMotionRuntime";
import { resolveMovementAvatarRootTarget } from "../../../_lib/movementAvatarRootTarget";
import {
  createMovementAvatarExerciseTransitionState,
  resolveMovementAvatarExerciseTarget,
  type MovementAvatarExerciseTransitionState,
} from "../../../_lib/movementAvatarExerciseTarget";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
  resolveMovementAvatarLowerBodyRuntimeState,
} from "../../../_lib/movementAvatarRuntimeState";
import {
  getCalibratedFloorCorrection,
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import { resolveMovementAvatarHipsRuntimePosition } from "../../../_lib/movementAvatarHipsRuntime";
import {
  createMovementAvatarSetupState,
  type MovementAvatarSetupState,
} from "../../../_lib/movementAvatarSetup";
import { resolveMovementAvatarSetupRuntimeState } from "../../../_lib/movementAvatarSetupRuntime";
import { applyMovementAvatarEndFrameRuntime } from "../../../_lib/movementAvatarEndFrameRuntime";
import { applyMovementAvatarDemoFallbackRuntimePose } from "../../../_lib/movementAvatarDemoFallbackRuntime";
import { applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones } from "../../../_lib/movementAvatarInactiveLowerBodyRuntime";
import { applyMovementAvatarUpperBodyRuntimeToVrmBones } from "../../../_lib/movementAvatarUpperBodyRuntime";
import {
  createVrmNormalizedBoneLookup,
  createVrmImageSolverLandmarks,
  getVrmMotionLandmarks,
  prepareVrmSolverInput,
  solveVrmPose,
  type VrmMotionRef,
  type VrmRiggedPose,
} from "../../../_lib/vrmRigging";

type LoaderPlugin = ReturnType<Parameters<InstanceType<typeof GLTFLoader>["register"]>[0]>;
type RiggedPose = VrmRiggedPose;

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
  const baseHipsPositionRef = useRef<THREE.Vector3 | null>(null);
  const baseBonePositionRef = useRef<Record<string, THREE.Vector3>>({});
  const setupStateRef = useRef<MovementAvatarSetupState>(createMovementAvatarSetupState());
  const retargetAvatarRestRef = useRef<MovementAvatarRetargetRestMap>({});
  const retargetSourceModelRef = useRef<MovementRetargetSourceModel | null>(null);
  const rootMotionFrameRef = useRef<MovementRootMotionFrame | null>(rootMotionFrame);
  const liveRootMotionHistoryRef = useRef<MovementRootMotionInputFrame[]>([]);
  const exerciseTransitionStateRef = useRef<MovementAvatarExerciseTransitionState>(
    createMovementAvatarExerciseTransitionState(),
  );
  const playerLegRaiseHoldRef = useRef<MovementAvatarPlayerLegRaiseHoldState>(
    createMovementAvatarPlayerLegRaiseHoldState(),
  );
  const plantedFootLockRef = useRef<MovementAvatarFootLockState>(
    createMovementAvatarFootLockState(),
  );
  const playerLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>(
    createMovementAvatarLowerBodyVisualState(),
  );
  const instructorLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>(
    createMovementAvatarLowerBodyVisualState(),
  );
  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);
  const usesPlayerMotionPath = isPlayer && motionMode !== "recorded";

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
      baseHipsPositionRef.current = null;
      baseBonePositionRef.current = {};
      setupStateRef.current = createMovementAvatarSetupState();
      retargetAvatarRestRef.current = buildMovementAvatarRetargetRestMap(loadedVrm);
      retargetSourceModelRef.current = null;
      liveRootMotionHistoryRef.current = [];
      exerciseTransitionStateRef.current = createMovementAvatarExerciseTransitionState();
      playerLegRaiseHoldRef.current = createMovementAvatarPlayerLegRaiseHoldState();
      plantedFootLockRef.current = createMovementAvatarFootLockState();
      playerLowerBodyStabilityRef.current = createMovementAvatarLowerBodyVisualState();
      instructorLowerBodyStabilityRef.current = createMovementAvatarLowerBodyVisualState();
      lastGoodQuatRef.current = {};
    }
  }, [gltf.scene, loadedVrm]);

  useEffect(() => {
    retargetSourceModelRef.current = retargetSourceModel;
  }, [retargetSourceModel]);

  useEffect(() => {
    rootMotionFrameRef.current = rootMotionFrame;
  }, [rootMotionFrame]);

  useEffect(() => {
    if (usesPlayerMotionPath && trackingCalibration && !retargetSourceModel) {
      retargetSourceModelRef.current = null;
    }
  }, [retargetSourceModel, trackingCalibration, usesPlayerMotionPath]);

  useFrame((state, delta) => {
    if (!vrmRef.current || !group.current) return;
    const avatarRoot = group.current;
    vrmRef.current.update(delta);

      const avatarRole = usesPlayerMotionPath ? "player" : "instructor";
      const lookupVrmBone = createVrmNormalizedBoneLookup(() => vrmRef.current);
      const boneEaseOptions = resolveMovementAvatarBoneEaseOptions({
        avatarRole,
      });

      const applyDemoFallbackPose = (factor = boneEaseOptions.demoFallbackSlerp) => {
        applyMovementAvatarDemoFallbackRuntimePose({
          lookupBone: lookupVrmBone,
          slerp: factor,
        });
      };

    const motionRef = landmarksRef.current;
    const payload = motionRef && !Array.isArray(motionRef) ? motionRef : null;
    const raw = getVrmMotionLandmarks(motionRef);
    if (!raw || raw.length < 33) {
      applyDemoFallbackPose();
      return;
    }

    const rawPreparedInput = prepareVrmSolverInput({
      rawLandmarks: raw,
      payload,
      isPlayer: usesPlayerMotionPath,
      isPlaying: isPlaying || showPausedPose,
    });
    const displayPreparedInput = usesPlayerMotionPath
      ? prepareVrmSolverInput({
          rawLandmarks: raw,
          payload,
          isPlayer: true,
          isPlaying: isPlaying || showPausedPose,
          mirrorForDisplay: true,
        })
      : rawPreparedInput;
    const mirrorPlayerDisplay = usesPlayerMotionPath;
    const {
      forceStandby,
      imageLandmarks: imageLms,
      rigHands,
      rigBlendshapes,
    } = displayPreparedInput;
    const {
      solverLandmarks: solverLms,
      kalidokitSolverLandmarks: kdSolverLms,
    } = rawPreparedInput;
    const targetSolverLms = mirrorPlayerDisplay
      ? createVrmImageSolverLandmarks(imageLms)
      : solverLms;

    let riggedPose: RiggedPose | null;
    try {
      riggedPose = solveVrmPose(kdSolverLms, imageLms);
    } catch {
      return;
    }

    if (riggedPose && vrmRef.current.humanoid) {
      const slerpFactor = usesPlayerMotionPath ? 0.5 : 0.3;

      const hipsNode = lookupVrmBone("hips");

      if (hipsNode && !baseHipsPositionRef.current) {
        baseHipsPositionRef.current = hipsNode.position.clone();
      }

      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

      const setupTarget = resolveMovementAvatarSetupRuntimeState({
        faceLandmarks: payload?.faceLandmarks,
        hands: rigHands,
        isLivePlayer: usesPlayerMotionPath,
        manualCalibration: trackingCalibration,
        poseLandmarks: imageLms,
        previousState: setupStateRef.current,
        worldPoseLandmarks: payload?.worldLandmarks ?? undefined,
      });
      setupStateRef.current = setupTarget.nextState;
      const activeCalibration = setupTarget.activeCalibration;
      const autoCalibrationKind = setupTarget.autoCalibrationKind;
      retargetSourceModelRef.current = resolveMovementAvatarRetargetSourceRuntimeModel({
        currentModel: retargetSourceModelRef.current,
        poseLandmarks: imageLms,
        providedModel: retargetSourceModel,
      });
      const motionFrameInput = resolveMovementAvatarMotionFrameInput({
        motionFrame: motionFrameRef.current ?? null,
        requiresMotionFrame: true,
      });
      const avatarDecision = motionFrameInput.decision;
      if (!avatarDecision) {
        applyDemoFallbackPose(0.35);
        return;
      }
      const bodyConfidence = avatarDecision.bodyConfidence;
      const bodyOrientation = avatarDecision.bodyOrientation;
      const bodySupport = avatarDecision.bodySupport;
      const exercisePose = avatarDecision.exercisePose;
      const supportConstraint = avatarDecision.supportConstraint;
      const supportIntent = avatarDecision.supportIntent;
      const exerciseTarget = resolveMovementAvatarExerciseTarget({
        decision: avatarDecision,
        previousState: exerciseTransitionStateRef.current,
      });
      exerciseTransitionStateRef.current = exerciseTarget.nextState;
      const exerciseTransition = exerciseTarget.exerciseTransition;
      const retargetFrame = avatarDecision.retargetFrame;
      const lowerBodyIntent = avatarDecision.lowerBodyIntent;
      let visualRootDrop = 0;
      let footLockCorrection = 0;
      let footLockDrift = 0;
      let supportContactAnchorCount = 0;
      let supportContactCorrection = 0;
      let footOwner = "neutral";
      let lowerBodyOwner = "neutral";
      let retargetAppliedLowerBody = 0;
      let retargetAppliedLegs = 0;
      let retargetAppliedFeet = 0;
      let retargetAppliedUpperBody = 0;
      let plantedSquatIkDepth = 0;
      const rightArmDecision = avatarDecision.rightArm;
      const leftArmDecision = avatarDecision.leftArm;
      const rightArmTrackingReady = rightArmDecision.isTrackingReady;
      const leftArmTrackingReady = leftArmDecision.isTrackingReady;
      const lowerBodyTrackingReady = avatarDecision.lowerBodyTrackingReady;
      const recordedLowerBodySourceReliable = avatarDecision.lowerBodySourceReliable;
      const torsoTrackingReady = avatarDecision.torsoTrackingReady;
      let lowerBodyDrive = avatarDecision.lowerBodyDrive;
      const activeSpineDrive = avatarDecision.spineDrive;
      const rootOrientation = avatarDecision.rootOrientation;
      const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(retargetFrame);
      const lowerBodyRuntimeStateDecision = resolveMovementAvatarLowerBodyRuntimeState({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        instructorLowerBodyVisualState: instructorLowerBodyStabilityRef.current,
        lowerBodyDrive,
        now: performance.now(),
        playerLegRaiseHoldState: playerLegRaiseHoldRef.current,
        playerLowerBodyVisualState: playerLowerBodyStabilityRef.current,
        recordedSquatPresentationDepth,
      });
      lowerBodyDrive = lowerBodyRuntimeStateDecision.lowerBodyDrive;
      playerLegRaiseHoldRef.current = lowerBodyRuntimeStateDecision.nextPlayerLegRaiseHoldState;
      playerLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextPlayerLowerBodyVisualState;
      instructorLowerBodyStabilityRef.current = lowerBodyRuntimeStateDecision.nextInstructorLowerBodyVisualState;
      const legRaiseHoldDecision = lowerBodyRuntimeStateDecision.legRaiseHoldDecision;
      const liveSquatDepth = lowerBodyDrive.liveSquatDepth;
      const shouldApplyLowerBody = lowerBodyDrive.shouldApplyLowerBody;
      const shouldApplySolverTorso = lowerBodyDrive.shouldApplySolverTorso;
      const shouldUseRetargetedUpperBody = avatarDecision.shouldUseRetargetedUpperBody;
      const torsoOwner = avatarDecision.torsoOwner;
      let playerSquatPresentationDepth = lowerBodyDrive.playerSquatPresentationDepth;
      const balancedPlantedSquatDepth = getBalancedPlantedSquatDepth(retargetFrame);
      const recordedLowerBodySegmentMotion = avatarDecision.lowerBodySegmentMotion;
      let instructorSquatPresentationDepth = recordedSquatPresentationDepth;
      visualRootDrop = lowerBodyDrive.visualRootDrop;
      const lowerBodyVisualDecision = lowerBodyRuntimeStateDecision.lowerBodyVisualDecision;
      instructorSquatPresentationDepth = lowerBodyVisualDecision.instructorSquatPresentationDepth;
      playerSquatPresentationDepth = lowerBodyVisualDecision.playerSquatPresentationDepth;
      visualRootDrop = lowerBodyVisualDecision.visualRootDrop;
      const lowerBodyTarget = resolveMovementAvatarLowerBodyTarget({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        decision: avatarDecision,
        lowerBodyVisualState: lowerBodyVisualDecision.state,
      });
      const shouldHoldPlayerSquatPose = lowerBodyTarget.shouldHoldPlayerSquatPose;
      const playerRetargetLowerBodyMotion = lowerBodyTarget.playerSourceOwner.playerRetargetLowerBodyMotion;
      const hipsPositionOptions = resolveMovementAvatarHipsPositionOptions({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        lowerBodyDrive,
        profile: avatarTrackingProfile,
      });
      const currentFloorY = Math.max(
        imageLms[27]?.y ?? 0,
        imageLms[28]?.y ?? 0,
        imageLms[31]?.y ?? 0,
        imageLms[32]?.y ?? 0,
      );
      const floorConfidence = Math.max(
        imageLms[27]?.visibility ?? 0,
        imageLms[28]?.visibility ?? 0,
        imageLms[31]?.visibility ?? 0,
        imageLms[32]?.visibility ?? 0,
      );
      const calibratedFloorCorrection = hipsPositionOptions.shouldUseCalibratedFloorCorrection
        ? getCalibratedFloorCorrection({
            calibration: activeCalibration,
            currentFloorY,
            floorConfidence,
            profile: avatarTrackingProfile,
          })
        : 0;
      const hipsApplication = resolveMovementAvatarHipsApplication({
        hipsPositionOptions,
        lowerBodyTrackingReady,
        playerSquatPresentationDepth,
        shouldApplyLowerBody,
      });

      if (forceStandby) {
        applyDemoFallbackPose(0.35);
        return;
      }

      const rootMotion = resolveMovementAvatarRootMotionRuntimeFrame({
        history: liveRootMotionHistoryRef.current,
        livePose: imageLms,
        liveWorldPose: mirrorPlayerDisplay && payload?.worldLandmarks
          ? displayPreparedInput.solverLandmarks
          : payload?.worldLandmarks ?? null,
        recordedRootMotionFrame: rootMotionFrameRef.current,
      });
      const rootTarget = resolveMovementAvatarRootTarget({
        avatarBaseY: AVATAR_BASE_Y,
        avatarRootVisualLerp: hipsPositionOptions.avatarRootVisualLerp,
        positionOffset,
        rootMotion,
        rootOrientation,
        visualRootDrop,
      });
      const { stepResponse } = rootTarget;

      const rootTransformRuntime = applyMovementAvatarRootTransformRuntime({
        root: avatarRoot,
        rootTarget,
      });
      const rootApplication = rootTransformRuntime.application;
      if (trackingDebugRef?.current && rootApplication) {
        trackingDebugRef.current.avatarRoot = buildMovementAvatarRootDebug({
          orientationOwner: rootOrientation.owner,
          rootApplication,
          rootTarget,
        });
      }

      const armTargetComposition = resolveMovementAvatarArmTargetComposition({
        imageLandmarks: imageLms,
        isPlayer: usesPlayerMotionPath,
        lowerBodyDrive,
        rigHands,
        solverLandmarks: solverLms,
        targetSolverLandmarks: targetSolverLms,
      });
      const {
        armTargets,
        leftElbowTarget,
        leftFrontBodyArmBias,
        leftWristTarget,
        playerArmLandmarks: playerArmLms,
        playerSafeArmZScale,
        rightElbowTarget,
        rightFrontBodyArmBias,
        rightWristTarget,
      } = armTargetComposition;
      const lowerBodyTargetComposition = resolveMovementAvatarLowerBodyTargetSelectionComposition({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        targetSolverLandmarks: targetSolverLms,
      });
      const {
        leftAnkleTarget,
        leftKneeTarget,
        leftToeTarget,
        rightAnkleTarget,
        rightKneeTarget,
        rightToeTarget,
        selections: lowerBodyTargetSelections,
      } = lowerBodyTargetComposition;

      const applyRetargetMappings = (mappings: typeof MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS) => {
        const vrm = vrmRef.current;
        const application = applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          canApply: Boolean(vrm),
          currentRestMap: retargetAvatarRestRef.current,
          hasWorldLandmarks: Boolean(payload?.worldLandmarks),
          instructorSquatPresentationDepth,
          lookupBone: lookupVrmBone,
          lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
          mappings,
          profile: avatarTrackingProfile,
          refreshRestMap: () => buildMovementAvatarRetargetRestMap(vrm!),
          retargetFrame,
          shouldUseRetargetedUpperBody,
          storeLastGood: (lastGoodBoneName, quaternion) => {
            lastGoodQuatRef.current[lastGoodBoneName] = quaternion;
          },
        });
        retargetAvatarRestRef.current = application.restMap;

        return application;
      };

      const applyPlantedSquatIk = (depth: number) => {
        const forward = new THREE.Vector3(0, 0, 1);
        if (group.current) {
          group.current.getWorldDirection(forward).normalize();
        }

        const vrm = vrmRef.current;
        const application = applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          canApply: Boolean(vrm),
          currentRestMap: retargetAvatarRestRef.current,
          depth,
          forward,
          lookupBone: lookupVrmBone,
          refreshRestMap: () => buildMovementAvatarRetargetRestMap(vrm!),
        });
        retargetAvatarRestRef.current = application.restMap;

        return application.appliedDepth;
      };

      const applyPlantedFootLock = ({
        footWorldSnapshot,
      }: {
        footWorldSnapshot: ReturnType<typeof resolveMovementAvatarFootWorldRuntimeSnapshot>;
      }) => {
        const avatarRoot = group.current;

        const footLockRuntimeDecision = resolveMovementAvatarFootLockRuntimeDecision({
          avatarRole,
          currentLeft: footWorldSnapshot.left,
          currentRight: footWorldSnapshot.right,
          hasAvatarRoot: Boolean(avatarRoot),
          lowerBodyDrive,
          lowerBodyTrackingReady,
          previousState: plantedFootLockRef.current,
          retargetFrame,
          shouldApplyLowerBody,
          shouldHoldPlayerSquatPose,
        });
        const footLockDecision = footLockRuntimeDecision.footLockDecision;
        plantedFootLockRef.current = footLockDecision.nextState;
        footLockDrift = footLockDecision.drift;
        footLockCorrection = footLockDecision.appliedCorrection;
        applyMovementAvatarFootLockRuntimeRootCorrection({
          avatarRoot,
          footLockDecision,
          options: footLockRuntimeDecision.options,
        });
      };

      const rp = riggedPose;

      const spineApplyOptions = resolveMovementAvatarSpineApplyOptions({
        avatarRole,
        shouldApplySpine: activeSpineDrive.shouldApplySpine,
      });

      const upperBodyRuntimeApplication = applyMovementAvatarUpperBodyRuntimeToVrmBones({
        activeSpineDrive,
        armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
        armTargets: {
          leftElbowTarget,
          leftFrontBodyArmBias,
          leftWristTarget,
          playerArmLandmarks: playerArmLms,
          playerSafeArmZScale,
          rightElbowTarget,
          rightFrontBodyArmBias,
          rightWristTarget,
        },
        avatarRole,
        fallbackZScale: payload?.worldLandmarks ? 1 : 0.1,
        handNeutralSlerp: boneEaseOptions.handNeutralSlerp,
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
        spineApplyOptions,
        torsoTrackingReady,
      });
      retargetAppliedUpperBody += upperBodyRuntimeApplication.recordedSpineRetargetCount;

      if (shouldUseRetargetedUpperBody) {
        const upperBodyRetargetCounts = applyRetargetMappings(
          MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
        );
        retargetAppliedUpperBody += upperBodyRetargetCounts.applied;
      }

      if ((lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && shouldApplyLowerBody) {
        const lowerBodyAimOptions = resolveMovementAvatarLegacyLowerBodyAimOptions({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          profile: avatarTrackingProfile,
        });
        const lowerBodyAimTargets = {
          leftAnkle: leftAnkleTarget,
          leftKnee: leftKneeTarget,
          leftToe: leftToeTarget,
          rightAnkle: rightAnkleTarget,
          rightKnee: rightKneeTarget,
          rightToe: rightToeTarget,
        };

        const lowerBodyApplicationPlan = resolveMovementAvatarLowerBodyApplicationPlan({
          lowerBodyDrive,
          lowerBodyTarget,
        });

        const nonRetargetLowerBodyApplication = applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
          applyPlantedSquatIk,
          currentFeetOwner: footOwner,
          isPlayer: usesPlayerMotionPath,
          lookupBone: lookupVrmBone,
          lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
          plan: lowerBodyApplicationPlan,
          singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
          squatFlexionBendBoost: avatarTrackingProfile.squatLegBendBoost,
          squatFlexionSlerp: boneEaseOptions.squatFlexionSlerp,
        });
        if (nonRetargetLowerBodyApplication.handled) {
          lowerBodyOwner = nonRetargetLowerBodyApplication.lowerBodyOwner ?? lowerBodyOwner;
          footOwner = nonRetargetLowerBodyApplication.feetOwner ?? footOwner;
          if (nonRetargetLowerBodyApplication.plantedSquatIkDepth !== null) {
            plantedSquatIkDepth = nonRetargetLowerBodyApplication.plantedSquatIkDepth;
          }
        } else if (lowerBodyApplicationPlan.mode === "retarget") {
          vrmRef.current.scene.updateMatrixWorld(true);
          const lowerBodyRetargetCounts = applyRetargetMappings(
            MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
          );
          const retargetCountApplication = applyMovementAvatarLowerBodyRetargetSegmentCounts({
            current: {
              feet: retargetAppliedFeet,
              legs: retargetAppliedLegs,
              lowerBody: retargetAppliedLowerBody,
            },
            segmentCounts: lowerBodyRetargetCounts,
          });
          retargetAppliedLowerBody = retargetCountApplication.lowerBody;
          retargetAppliedLegs = retargetCountApplication.legs;
          retargetAppliedFeet = retargetCountApplication.feet;
          if (retargetCountApplication.footOwnerOverride) {
            footOwner = retargetCountApplication.footOwnerOverride;
          }

          const retargetDecisionApplication = resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput({
            appliedFootSegments: retargetAppliedFeet,
            appliedLegSegments: retargetAppliedLegs,
            appliedLowerBodySegments: retargetAppliedLowerBody,
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            balancedPlantedSquatDepth,
            instructorSquatPresentationDepth,
            lowerBodyDrive,
            lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
            lowerBodyTrackingReady,
            playerRetargetLowerBodyMotion,
            retargetFrame,
            shouldApplyLowerBody,
            shouldHoldPlayerSquatPose,
            playerSquatPresentationDepth,
            stageDecision: lowerBodyApplicationPlan.stageDecision,
          });
          lowerBodyOwner = retargetDecisionApplication.lowerBodyOwner;
          const { retargetApplicationPlan } = retargetDecisionApplication;

          applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones({
            fallbackSlerp: slerpFactor,
            getLastGoodQuaternion: (bone) => lastGoodQuatRef.current[bone] ?? null,
            lookupBone: lookupVrmBone,
            requests: resolveMovementAvatarLowerBodyRetargetAimRequests({
              options: lowerBodyAimOptions,
              retargetApplicationPlan,
              targets: lowerBodyAimTargets,
              targetSolverLandmarks: targetSolverLms,
            }),
            storeLastGoodQuaternion: (bone, quaternion) => {
              lastGoodQuatRef.current[bone] = quaternion;
            },
            zScale: payload?.worldLandmarks ? 1 : 0.1,
          });
          footOwner = retargetDecisionApplication.feetOwner;

          const retargetPostPlanApplication = applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones({
            applyPlantedSquatIk,
            contacts: retargetFrame.contacts,
            currentFeetOwner: footOwner,
            isPlayer: usesPlayerMotionPath,
            lookupBone: lookupVrmBone,
            plan: retargetApplicationPlan,
            singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
            solvedLowerBodySlerp: boneEaseOptions.solvedLowerBodySlerp,
            solvedLowerBodySources: {
              LeftLowerLeg: rp.LeftLowerLeg,
              LeftUpperLeg: rp.LeftUpperLeg,
              RightLowerLeg: rp.RightLowerLeg,
              RightUpperLeg: rp.RightUpperLeg,
            },
            squatFlexionBendBoost: avatarTrackingProfile.squatLegBendBoost,
            squatFlexionSlerp: boneEaseOptions.squatFlexionSlerp,
            storeLastGood: (bone, quaternion) => {
              lastGoodQuatRef.current[bone] = quaternion;
            },
          });
          plantedSquatIkDepth = retargetPostPlanApplication.plantedSquatIkDepth;
          footOwner = retargetPostPlanApplication.feetOwner;
        }
      } else {
        const inactiveLowerBodyApplication = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          lookupBone: lookupVrmBone,
          lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
          lowerBodySourceReliable: recordedLowerBodySourceReliable,
        });
        if (inactiveLowerBodyApplication.lowerBodyOwner) {
          lowerBodyOwner = inactiveLowerBodyApplication.lowerBodyOwner;
        }
        if (inactiveLowerBodyApplication.feetOwner) {
          footOwner = inactiveLowerBodyApplication.feetOwner;
        }
      }

      const supportPresentationApplication = applyMovementAvatarSupportPresentationRuntimeToVrmBones({
        lookupBone: lookupVrmBone,
        supportPresentation: avatarDecision.supportPresentation,
      });
      if (supportPresentationApplication.owner) {
        lowerBodyOwner = supportPresentationApplication.owner;
      }
      const supportContactApplication = applyMovementAvatarSupportContactRuntimeLocks({
        avatarRoot: group.current,
        contactLocks: avatarDecision.supportContactLocks,
        floorY: -2.75 + calibratedFloorCorrection,
        lookupBone: lookupVrmBone,
        scene: vrmRef.current?.scene,
      });
      if (supportContactApplication.applied) {
        supportContactAnchorCount = supportContactApplication.appliedAnchors;
        supportContactCorrection = supportContactApplication.supportContactCorrection;
      }

      const headRuntimeApplication = applyMovementAvatarHeadRuntimeToVrmBones({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        avatarRootYaw: group.current.rotation.y,
        baseHeadPosition: baseBonePositionRef.current.head,
        calibration: activeCalibration,
        faceLandmarks: payload?.faceLandmarks,
        lookupBone: lookupVrmBone,
        neckSlerp: avatarTrackingProfile.neckSlerp,
        poseLandmarks: imageLms,
        profile: avatarTrackingProfile,
        shouldApplyLowerBody,
        shouldApplySpine: activeSpineDrive.shouldApplySpine,
      });

      if (headRuntimeApplication.applied) {
        const { headApplication, headNode, headTarget } = headRuntimeApplication;
        const {
          appliedHead,
          headOwner,
        } = headTarget.headDecision;
        const { headMotionIntent } = headTarget;
        const { rawHead } = headTarget.rawHeadDecision;
        if (headApplication.baseHeadPosition) {
          baseBonePositionRef.current.head = headApplication.baseHeadPosition;
        }

        if (trackingDebugRef) {
          const fallbackLabels = resolveMovementAvatarTrackingFallbackLabels({
            activeSpineOwner: activeSpineDrive.owner,
            armTargets,
            autoCalibrationKind,
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            bodyConfidence,
            feetOwner: footOwner,
            hasActiveCalibration: Boolean(activeCalibration),
            hasManualCalibration: Boolean(trackingCalibration),
            headMotionIntent,
            headOwner,
            leftArmTrackingReady,
            leftFootSource: lowerBodyTargetSelections.leftToe.source,
            leftKneeSource: lowerBodyTargetSelections.leftKnee.source,
            lowerBodyIntent,
            lowerBodyOwner,
            lowerBodyTrackingReady,
            rawHead,
            rightArmTrackingReady,
            rightFootSource: lowerBodyTargetSelections.rightToe.source,
            rightKneeSource: lowerBodyTargetSelections.rightKnee.source,
            shouldApplyLowerBody,
            torsoOwner,
          });

          const retargetDebug = buildMovementAvatarRuntimeRetargetDebug({
            appliedLowerBody: retargetAppliedLowerBody,
            appliedUpperBody: retargetAppliedUpperBody,
            footLock: {
              correction: footLockCorrection,
              drift: footLockDrift,
              strength: plantedFootLockRef.current.strength,
            },
            liveSquatDepth,
            plantedSquatIkDepth,
            retargetFrame,
            retargetSourceModel: retargetSourceModelRef.current,
            totalLowerBody: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.length,
            totalUpperBody: MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS.length,
            visualRootDrop,
          });

          const debugUpdatedAt = performance.now();
          trackingDebugRef.current = buildMovementAvatarTrackingDebugState({
            updatedAt: debugUpdatedAt,
            rawHead,
            appliedHead,
            avatarHead: {
              appliedLocalPitch: headNode.rotation.x,
              boneYaw: headTarget.headDecision.headYaw,
              bonePitch: headTarget.headBonePitch,
              trackingPitch: headTarget.headDecision.headPitch,
              trackingYaw: rawHead.yaw,
            },
            avatarLegRaise: {
              appliedDepth: lowerBodyDrive.playerLegRaiseDepth,
              expiresAt: playerLegRaiseHoldRef.current.expiresAt,
              holdActive: legRaiseHoldDecision.wasHeld,
              now: debugUpdatedAt,
              rawLeftDepth: lowerBodyIntent.leftKneeRaise,
              rawRightDepth: lowerBodyIntent.rightKneeRaise,
              side: lowerBodyDrive.playerLegRaiseSide,
            },
            bodyConfidence,
            exercisePose,
            exerciseTransition,
            supportConstraint,
            supportIntent,
            spineDrive: {
              confidence: activeSpineDrive.confidence,
              forwardLean: activeSpineDrive.forwardLean,
              owner: activeSpineDrive.owner,
              sideBend: activeSpineDrive.sideBend,
              twist: activeSpineDrive.twist,
            },
            fallbackLabels,
            fallbackContext: buildMovementAvatarTrackingFallbackContext({
              exercisePose,
              exerciseTransition,
              motionFrameInput: motionFrameInput.owner,
              orientation: bodyOrientation,
              retarget: formatMovementAvatarRetargetDebugLabel(retargetDebug),
              support: bodySupport,
              supportConstraint,
              supportContact: {
                anchorCount: supportContactAnchorCount,
                correction: supportContactCorrection,
                owner: avatarDecision.supportContactLocks.owner,
              },
              supportIntent,
              supportPresentation: avatarDecision.supportPresentation,
            }),
            retargetDebug,
            profileName: avatarTrackingProfileName,
            calibrationQuality: activeCalibration?.quality,
          });
        }
      }

      const leftFoot = lookupVrmBone("leftFoot");
      const rightFoot = lookupVrmBone("rightFoot");
      const footWorldSnapshot = resolveMovementAvatarFootWorldRuntimeSnapshot({
        avatarRoot: group.current,
        leftFoot,
        rightFoot,
        scene: vrmRef.current.scene,
      });
      if (hipsNode && baseHipsPositionRef.current) {
        const baseHipsY = baseHipsPositionRef.current.y;

        hipsNode.position.y = resolveMovementAvatarHipsRuntimePosition({
          baseHipsY,
          currentHipsY: hipsNode.position.y,
          floorY: -2.75 + calibratedFloorCorrection,
          hipsApplication,
          hipsPositionOptions,
          lowestFootY: footWorldSnapshot.lowestFootY,
        }).nextHipsY;
      }

      applyPlantedFootLock({ footWorldSnapshot });
      applyMovementAvatarRootStepRuntimeResponse({
        leftFoot,
        rightFoot,
        scene: vrmRef.current?.scene,
        stepResponse,
      });
      if (trackingDebugRef?.current && vrmRef.current) {
        trackingDebugRef.current = applyMovementAvatarPostFrameDebugTelemetry({
          avatarName: name,
          avatarRole,
          footLock: {
            correction: footLockCorrection,
            drift: footLockDrift,
            strength: plantedFootLockRef.current.strength,
          },
          frameUpdatedAt: performance.now(),
          registryWindow: typeof window === "undefined"
            ? undefined
            : window as Window & MovementAvatarRetargetDebugRegistryWindow,
          retargetFrame,
          state: trackingDebugRef.current,
          vrm: vrmRef.current,
          zScale: payload?.worldLandmarks ? 1 : 0.18,
        });
      }

      applyMovementAvatarEndFrameRuntime({
        blendshapes: rigBlendshapes,
        expressionManager: vrmRef.current?.expressionManager,
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
