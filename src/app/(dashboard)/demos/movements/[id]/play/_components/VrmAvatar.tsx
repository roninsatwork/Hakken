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
  appendMovementAvatarFootLockDebugLabel,
  buildMovementAvatarRetargetDebug,
  formatMovementAvatarRetargetDebugLabel,
  resolveMovementAvatarArmAimOptions,
  resolveMovementAvatarBoneEaseOptions,
  resolveMovementAvatarFootLockOptions,
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarAppliedLowerBodyDecision,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLegacyLowerBodyAimOptions,
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlayerLegRaiseHold,
  resolveMovementAvatarPlantedFootOwner,
  resolveMovementAvatarPlantedSquatIkPose,
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarRetargetSegmentApplication,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSpineApplyOptions,
  resolveMovementAvatarSquatFlexionPose,
  resolveMovementAvatarStudioDecision,
  resolveMovementAvatarTrackingFallbackLabels,
  type MovementAvatarLowerBodyVisualState,
  type MovementAvatarPlayerLegRaiseHoldState,
} from "../../../_lib/movementAvatarPipeline";
import { resolveMovementAvatarHeadTarget } from "../../../_lib/movementAvatarHeadTarget";
import { resolveMovementAvatarLowerBodyTarget } from "../../../_lib/movementAvatarTarget";
import { resolveMovementAvatarArmTargetComposition } from "../../../_lib/movementAvatarArmTarget";
import { resolveMovementAvatarLowerBodyTargetSelectionComposition } from "../../../_lib/movementAvatarLowerBodyTargetSelection";
import {
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS,
  MOVEMENT_AVATAR_VISUAL_MAPPINGS,
  buildMovementAvatarRetargetRestMap,
  movementSourceSegmentToAvatarWorldDirection,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetRestMap,
} from "../../../_lib/movementAvatarRestPose";
import {
  resolveMovementAvatarBasisWorldDirection,
  resolveMovementAvatarRestMappedQuaternionTarget,
} from "../../../_lib/movementAvatarSegmentApplication";
import {
  createMovementAvatarFootLockState,
  resolveMovementAvatarFootLockApplication,
  type MovementAvatarFootLockState,
} from "../../../_lib/movementAvatarFootLock";
import {
  movementAvatarHeadOffsetToVector,
  resolveMovementAvatarHeadQuaternionTarget,
  resolveMovementAvatarNeckQuaternionTarget,
} from "../../../_lib/movementAvatarHeadApplication";
import {
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  getRecordedSquatPresentationDepth,
  type MovementRetargetFrame,
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import {
  buildMovementRootMotionAnalysis,
  type MovementRootMotionFrame,
  type MovementRootMotionInputFrame,
} from "../../../_lib/movementRootMotion";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
import { resolveMovementAvatarMotionFrameInput } from "../../../_lib/movementAvatarMotionFrameInput";
import { resolveMovementAvatarRootTarget } from "../../../_lib/movementAvatarRootTarget";
import {
  createMovementAvatarExerciseTransitionState,
  resolveMovementAvatarExerciseTarget,
  type MovementAvatarExerciseTransitionState,
} from "../../../_lib/movementAvatarExerciseTarget";
import {
  getCalibratedFloorCorrection,
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import {
  createMovementAvatarSetupState,
  resolveMovementAvatarSetup,
  type MovementAvatarSetupState,
} from "../../../_lib/movementAvatarSetup";
import {
  createVrmImageSolverLandmarks,
  getVrmMotionLandmarks,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
  resolveVrmHandRigOptions,
  resolveVrmHandRotationTargets,
  solveVrmHand,
  solveVrmPose,
  type VrmHandRig,
  type VrmMotionRef,
  type VrmRiggedPose,
  type VrmRigRotation,
  type VrmSolverLandmark,
} from "../../../_lib/vrmRigging";

type LoaderPlugin = ReturnType<Parameters<InstanceType<typeof GLTFLoader>["register"]>[0]>;
type VrmBoneName = Parameters<VRM["humanoid"]["getNormalizedBoneNode"]>[0];
type RigRotation = VrmRigRotation;
type RiggedPose = VrmRiggedPose;
type HandRig = VrmHandRig;

type AimVectorOptions = {
  frontBias?: number;
  ignoreVisibility?: boolean;
  minVectorLengthSq?: number;
  slerpOverride?: number;
  storeVisibilityThreshold?: number;
  visibilityThreshold?: number;
  zScale?: number;
};

const ROOT_MOTION_POSITION_LERP = 0.18;
const ROOT_MOTION_YAW_LERP = 0.22;
const ROOT_MOTION_LIVE_HISTORY_LIMIT = 180;

type MovementRetargetDebugRegistry = Record<
  "instructor" | "player",
  NonNullable<MovementTrackingDebugState["retarget"]> & {
    avatarName: string;
    frameUpdatedAt: number;
  }
>;

const AVATAR_BASE_Y = -2.8;

function compactVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

function lerpAngle(current: number, target: number, alpha: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function appendLiveRootMotionFrame({
  historyRef,
  pose,
  worldPose,
}: {
  historyRef: MutableRefObject<MovementRootMotionInputFrame[]>;
  pose: MovementRootMotionInputFrame["pose"];
  worldPose?: MovementRootMotionInputFrame["worldPose"];
}) {
  if (pose.length < 33) return null;

  historyRef.current.push({
    pose,
    worldPose: worldPose && worldPose.length >= 33 ? worldPose : null,
  });

  if (historyRef.current.length > ROOT_MOTION_LIVE_HISTORY_LIMIT) {
    historyRef.current.splice(0, historyRef.current.length - ROOT_MOTION_LIVE_HISTORY_LIMIT);
  }

  const analysis = buildMovementRootMotionAnalysis(historyRef.current);
  return analysis.frames.at(-1) ?? null;
}

function buildAvatarVisualTelemetry({
  retargetFrame,
  vrm,
  zScale,
}: {
  retargetFrame: MovementRetargetFrame;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState["avatarVisual"] {
  vrm.scene.updateMatrixWorld(true);

  const lowerBodySourceErrors: number[] = [];
  const upperBodySourceErrors: number[] = [];
  const segments = MOVEMENT_AVATAR_VISUAL_MAPPINGS.reduce<
    NonNullable<MovementTrackingDebugState["avatarVisual"]>["segments"]
  >((telemetry, mapping) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(mapping.bone);
    const child = vrm.humanoid.getNormalizedBoneNode(mapping.child);
    if (!bone || !child) return telemetry;

    const boneWorldPosition = new THREE.Vector3();
    const childWorldPosition = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPosition);
    child.getWorldPosition(childWorldPosition);

    const avatarDirection = childWorldPosition.sub(boneWorldPosition);
    const length = avatarDirection.length();
    if (length <= 0.000001) return telemetry;

    avatarDirection.normalize();
    const sourceSegment = retargetFrame.segments[mapping.segment];
    const sourceDirection = sourceSegment
      ? movementSourceSegmentToAvatarWorldDirection(sourceSegment.direction, zScale)
      : null;
    const sourceError = sourceDirection
      ? 1 - THREE.MathUtils.clamp(avatarDirection.dot(sourceDirection), -1, 1)
      : undefined;

    if (typeof sourceError === "number" && sourceSegment && sourceSegment.confidence >= 0.3) {
      if (mapping.type === "leg" || mapping.type === "foot") {
        lowerBodySourceErrors.push(sourceError);
      } else {
        upperBodySourceErrors.push(sourceError);
      }
    }

    telemetry[mapping.segment] = {
      confidence: sourceSegment?.confidence,
      direction: compactVector(avatarDirection),
      length: Number(length.toFixed(4)),
      sourceDirection: sourceDirection ? compactVector(sourceDirection) : undefined,
      sourceError: typeof sourceError === "number" ? Number(sourceError.toFixed(4)) : undefined,
    };
    return telemetry;
  }, {});

  return {
    averageLowerBodyDirectionError: lowerBodySourceErrors.length
      ? Number((lowerBodySourceErrors.reduce((sum, value) => sum + value, 0) / lowerBodySourceErrors.length).toFixed(4))
      : undefined,
    averageUpperBodyDirectionError: upperBodySourceErrors.length
      ? Number((upperBodySourceErrors.reduce((sum, value) => sum + value, 0) / upperBodySourceErrors.length).toFixed(4))
      : undefined,
    comparedLowerBodySegments: lowerBodySourceErrors.length,
    comparedUpperBodySegments: upperBodySourceErrors.length,
    segments,
  };
}

type VrmAvatarProps = {
  landmarksRef: RefObject<VrmMotionRef>;
  motionFrameRef?: RefObject<MovementMotionFrame | null | undefined>;
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
  const playerLegRaiseHoldRef = useRef<MovementAvatarPlayerLegRaiseHoldState>({
    depth: 0,
    expiresAt: 0,
    side: null,
  });
  const plantedFootLockRef = useRef<MovementAvatarFootLockState>(
    createMovementAvatarFootLockState(),
  );
  const playerLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>({
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  });
  const instructorLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>({
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  });
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
      playerLegRaiseHoldRef.current = {
        depth: 0,
        expiresAt: 0,
        side: null,
      };
      plantedFootLockRef.current = createMovementAvatarFootLockState();
      playerLowerBodyStabilityRef.current = {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      };
      instructorLowerBodyStabilityRef.current = {
        squatPresentationDepth: 0,
        visualRootDrop: 0,
      };
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
    vrmRef.current.update(delta);

      const avatarRole = usesPlayerMotionPath ? "player" : "instructor";
      const boneEaseOptions = resolveMovementAvatarBoneEaseOptions({
        avatarRole,
      });

      const applyDemoFallbackPose = (factor = boneEaseOptions.demoFallbackSlerp) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return;

      const applyFallbackRot = (boneName: VrmBoneName, euler: RigRotation) => {
        const bone = humanoid.getNormalizedBoneNode(boneName);
        if (!bone) return;

        const targetQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            euler.x,
            euler.y,
            euler.z,
            (euler.rotationOrder || "XYZ") as THREE.EulerOrder,
          ),
        );
        bone.quaternion.slerp(targetQ, factor);
      };

      applyFallbackRot("spine", { x: 0.04, y: 0, z: 0 });
      applyFallbackRot("chest", { x: 0.03, y: 0, z: 0 });
      applyFallbackRot("rightUpperArm", { x: 0, y: 0, z: -1.12 });
      applyFallbackRot("leftUpperArm", { x: 0, y: 0, z: 1.12 });
      applyFallbackRot("rightLowerArm", { x: 0, y: 0, z: -0.12 });
      applyFallbackRot("leftLowerArm", { x: 0, y: 0, z: 0.12 });
      applyFallbackRot("rightHand", { x: 0, y: 0, z: 0 });
      applyFallbackRot("leftHand", { x: 0, y: 0, z: 0 });
      applyFallbackRot("hips", { x: 0, y: 0, z: 0 });
      applyFallbackRot("rightUpperLeg", { x: 0, y: 0, z: 0 });
      applyFallbackRot("rightLowerLeg", { x: 0, y: 0, z: 0 });
      applyFallbackRot("leftUpperLeg", { x: 0, y: 0, z: 0 });
      applyFallbackRot("leftLowerLeg", { x: 0, y: 0, z: 0 });
      applyFallbackRot("rightFoot", { x: 0, y: 0, z: 0 });
      applyFallbackRot("leftFoot", { x: 0, y: 0, z: 0 });
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

      const clamp = (value: number, limit: number) =>
        Math.max(-limit, Math.min(limit, value));

      const applyRot = (
        boneName: VrmBoneName,
        euler?: RigRotation,
        overrideFactor?: number,
        options: {
          limits?: Partial<Record<"x" | "y" | "z", number>>;
          remember?: boolean;
          scale?: number;
        } = {},
      ) => {
        if (!euler) return;
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
        if (bone) {
          const rotationOrder = (euler.rotationOrder || "XYZ") as THREE.EulerOrder;
          const scale = options.scale ?? 1;
          const targetEuler = new THREE.Euler(
            options.limits?.x ? clamp(euler.x * scale, options.limits.x) : euler.x * scale,
            options.limits?.y ? clamp(euler.y * scale, options.limits.y) : euler.y * scale,
            options.limits?.z ? clamp(euler.z * scale, options.limits.z) : euler.z * scale,
            rotationOrder,
          );
          bone.quaternion.slerp(
            new THREE.Quaternion().setFromEuler(targetEuler),
            overrideFactor ?? slerpFactor,
          );
          if (options.remember !== false) {
            lastGoodQuatRef.current[boneName] = bone.quaternion.clone();
          }
        }
      };

      const easeBoneToRotation = (
        boneName: VrmBoneName,
        euler: RigRotation,
        factor: number,
      ) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
        if (!bone) return;

        const targetQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            euler.x,
            euler.y,
            euler.z,
            (euler.rotationOrder || "XYZ") as THREE.EulerOrder,
          ),
        );
        bone.quaternion.slerp(targetQ, factor);
      };

      const mirrorRecordedTorsoRotation = (rotation?: RigRotation | null): RigRotation | undefined => {
        if (!rotation) return undefined;

        return {
          ...rotation,
          z: -rotation.z,
        };
      };

      const easeBonePosition = (
        boneName: VrmBoneName,
        offset: THREE.Vector3,
        factor: number,
      ) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
        if (!bone) return;

        if (!baseBonePositionRef.current[boneName]) {
          baseBonePositionRef.current[boneName] = bone.position.clone();
        }

        const basePosition = baseBonePositionRef.current[boneName];
        bone.position.lerp(basePosition.clone().add(offset), factor);
      };

      const aimVector = (
        boneName: VrmBoneName,
        targetName: VrmBoneName,
        vStart?: VrmSolverLandmark | null,
        vEnd?: VrmSolverLandmark | null,
        options: AimVectorOptions = {},
      ) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
        if (!bone || !vStart || !vEnd) return;

        const visibilityThreshold = options.visibilityThreshold ?? 0.2;

        if (
          !options.ignoreVisibility &&
          (vStart.visibility < visibilityThreshold || vEnd.visibility < visibilityThreshold)
        ) {
          if (lastGoodQuatRef.current[boneName]) {
            bone.quaternion.copy(lastGoodQuatRef.current[boneName]);
          } else {
            if (boneName === "rightUpperArm") bone.rotation.set(0, 0, -1.2);
            if (boneName === "leftUpperArm") bone.rotation.set(0, 0, 1.2);
          }
          return;
        }

        const boneW = new THREE.Vector3();
        bone.getWorldPosition(boneW);

        const childNode = vrmRef.current?.humanoid?.getNormalizedBoneNode(targetName);
        if (!childNode) return;
        const childW = new THREE.Vector3();
        childNode.getWorldPosition(childW);

        const currentDir = childW.clone().sub(boneW).normalize();
        let dz = vEnd.z - vStart.z;
        dz *= options.zScale ?? (payload?.worldLandmarks ? 1 : 0.1);

        const rawDir = new THREE.Vector3(
          vEnd.x - vStart.x,
          -(vEnd.y - vStart.y),
          -dz + (options.frontBias ?? 0),
        );
        if (rawDir.lengthSq() < (options.minVectorLengthSq ?? 0.0001)) return;

        const desiredDir = rawDir.normalize();
        const qOffset = new THREE.Quaternion().setFromUnitVectors(currentDir, desiredDir);
        const currentWorldQ = new THREE.Quaternion();
        bone.getWorldQuaternion(currentWorldQ);
        const targetWorldQ = qOffset.multiply(currentWorldQ);

        if (bone.parent) {
          const parentWorldQ = new THREE.Quaternion();
          bone.parent.getWorldQuaternion(parentWorldQ);
          const localQ = parentWorldQ.invert().multiply(targetWorldQ);
          bone.quaternion.slerp(localQ, options.slerpOverride ?? slerpFactor);

          const storeVisibilityThreshold = options.storeVisibilityThreshold ?? 0.6;
          if (
            options.ignoreVisibility ||
            (vStart.visibility > storeVisibilityThreshold &&
              vEnd.visibility > storeVisibilityThreshold)
          ) {
            lastGoodQuatRef.current[boneName] = bone.quaternion.clone();
          }
        }

        bone.updateMatrixWorld(true);
      };

      const easeLowerBodyToNeutral = () => {
        const neutral = { x: 0, y: 0, z: 0 };
        const factor = boneEaseOptions.lowerBodyNeutralSlerp;
        easeBoneToRotation("rightUpperLeg", neutral, factor);
        easeBoneToRotation("rightLowerLeg", neutral, factor);
        easeBoneToRotation("leftUpperLeg", neutral, factor);
        easeBoneToRotation("leftLowerLeg", neutral, factor);
        easeBoneToRotation("rightFoot", neutral, factor);
        easeBoneToRotation("leftFoot", neutral, factor);
      };

      const easeArmToRelaxed = (side: "left" | "right") => {
        const factor = boneEaseOptions.armRelaxedSlerp;
        if (side === "right") {
          easeBoneToRotation("rightUpperArm", { x: 0, y: 0, z: -1.12 }, factor);
          easeBoneToRotation("rightLowerArm", { x: 0, y: 0, z: -0.12 }, factor);
          easeBoneToRotation("rightHand", { x: 0, y: 0, z: 0 }, factor);
          return;
        }

        easeBoneToRotation("leftUpperArm", { x: 0, y: 0, z: 1.12 }, factor);
        easeBoneToRotation("leftLowerArm", { x: 0, y: 0, z: 0.12 }, factor);
        easeBoneToRotation("leftHand", { x: 0, y: 0, z: 0 }, factor);
      };

      const holdArmAtLastGood = (side: "left" | "right") => {
        const upperArm = `${side}UpperArm` as VrmBoneName;
        const lowerArm = `${side}LowerArm` as VrmBoneName;
        const hand = `${side}Hand` as VrmBoneName;

        ([upperArm, lowerArm, hand] as VrmBoneName[]).forEach((boneName) => {
          const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
          const lastGood = lastGoodQuatRef.current[boneName];
          if (bone && lastGood) {
            bone.quaternion.slerp(lastGood, 0.42);
          }
        });
      };

      const easeHandToNeutral = (side: "left" | "right", factor = boneEaseOptions.handNeutralSlerp) => {
        easeBoneToRotation(`${side}Hand` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
      };

      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");

      if (hipsNode && !baseHipsPositionRef.current) {
        baseHipsPositionRef.current = hipsNode.position.clone();
      }

      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

      const setupTarget = resolveMovementAvatarSetup({
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
      if (retargetSourceModel) {
        retargetSourceModelRef.current = retargetSourceModel;
      } else if (!retargetSourceModelRef.current) {
        retargetSourceModelRef.current = buildMovementRetargetSourceModel({
          poseLandmarks: imageLms,
          now: Date.now(),
        });
      }
      const resolveAvatarDecision = usesPlayerMotionPath
        ? resolveMovementAvatarStudioDecision
        : resolveMovementAvatarReplayDecision;
      const rendererFallbackAvatarDecision = resolveAvatarDecision({
        avatarTrackingProfile,
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        calibration: activeCalibration,
        retargetSourceModel: retargetSourceModelRef.current,
        source: {
          hands: rigHands,
          poseLandmarks: imageLms,
        },
      });
      const motionFrameInput = resolveMovementAvatarMotionFrameInput({
        fallbackDecision: rendererFallbackAvatarDecision,
        motionFrame: motionFrameRef?.current ?? null,
      });
      const avatarDecision = motionFrameInput.decision;
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
      const legRaiseHoldDecision = resolveMovementAvatarPlayerLegRaiseHold({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        lowerBodyDrive,
        now: performance.now(),
        previousState: playerLegRaiseHoldRef.current,
      });
      lowerBodyDrive = legRaiseHoldDecision.lowerBodyDrive;
      playerLegRaiseHoldRef.current = legRaiseHoldDecision.state;
      const liveSquatDepth = lowerBodyDrive.liveSquatDepth;
      const shouldApplyLowerBody = lowerBodyDrive.shouldApplyLowerBody;
      const shouldApplySolverTorso = lowerBodyDrive.shouldApplySolverTorso;
      const shouldUseRetargetedUpperBody = avatarDecision.shouldUseRetargetedUpperBody;
      const torsoOwner = avatarDecision.torsoOwner;
      let playerSquatPresentationDepth = lowerBodyDrive.playerSquatPresentationDepth;
      const balancedPlantedSquatDepth = getBalancedPlantedSquatDepth(retargetFrame);
      const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(retargetFrame);
      const recordedLowerBodySegmentMotion = avatarDecision.lowerBodySegmentMotion;
      let instructorSquatPresentationDepth = recordedSquatPresentationDepth;
      visualRootDrop = lowerBodyDrive.visualRootDrop;

      const lowerBodyVisualDecision = resolveMovementAvatarLowerBodyVisualDecision({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        lowerBodyDrive,
        previousState: usesPlayerMotionPath
          ? playerLowerBodyStabilityRef.current
          : instructorLowerBodyStabilityRef.current,
        recordedSquatPresentationDepth,
      });
      if (usesPlayerMotionPath) {
        playerLowerBodyStabilityRef.current = lowerBodyVisualDecision.state;
      } else {
        instructorLowerBodyStabilityRef.current = lowerBodyVisualDecision.state;
      }
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

      const rootMotion = rootMotionFrameRef.current ?? appendLiveRootMotionFrame({
        historyRef: liveRootMotionHistoryRef,
        pose: imageLms,
        worldPose: mirrorPlayerDisplay && payload?.worldLandmarks
          ? displayPreparedInput.solverLandmarks
          : payload?.worldLandmarks ?? null,
      });
      const rootTarget = resolveMovementAvatarRootTarget({
        avatarBaseY: AVATAR_BASE_Y,
        avatarRootVisualLerp: hipsPositionOptions.avatarRootVisualLerp,
        positionOffset,
        rootMotion,
        rootOrientation,
        visualRootDrop,
      });
      const { jumpResponse, stepResponse } = rootTarget;

      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        rootTarget.targetPitch,
        rootTarget.rootOrientationSlerp,
      );
      group.current.rotation.y = lerpAngle(group.current.rotation.y, rootTarget.targetYaw, ROOT_MOTION_YAW_LERP);
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        rootTarget.targetRoll,
        rootTarget.rootOrientationSlerp,
      );
      group.current.position.x = THREE.MathUtils.lerp(
        group.current.position.x,
        rootTarget.targetX,
        ROOT_MOTION_POSITION_LERP,
      );
      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        rootTarget.targetY,
        rootTarget.rootHeightLerp,
      );
      group.current.position.z = THREE.MathUtils.lerp(
        group.current.position.z,
        rootTarget.targetZ,
        ROOT_MOTION_POSITION_LERP,
      );
      if (trackingDebugRef?.current) {
        trackingDebugRef.current.avatarRoot = {
          appliedPitch: Number(group.current.rotation.x.toFixed(4)),
          appliedRoll: Number(group.current.rotation.z.toFixed(4)),
          appliedYaw: Number(normalizeAngle(group.current.rotation.y - Math.PI).toFixed(4)),
          appliedX: Number(group.current.position.x.toFixed(4)),
          appliedY: Number(group.current.position.y.toFixed(4)),
          appliedZ: Number(group.current.position.z.toFixed(4)),
          jumpResponseOwner: jumpResponse.owner,
          orientationOwner: rootOrientation.owner,
          stepResponseOwner: stepResponse.owner,
          stepResponseSide: stepResponse.side ?? "none",
          targetHeightDrop: Number(rootTarget.targetHeightDrop.toFixed(4)),
          targetJumpHeightOffset: Number(rootTarget.targetJumpHeightOffset.toFixed(4)),
          targetStepFootLiftOffset: Number((stepResponse.shouldApply ? stepResponse.footLiftOffset : 0).toFixed(4)),
          targetPitch: Number(rootTarget.targetPitch.toFixed(4)),
          targetRoll: Number(rootTarget.targetRoll.toFixed(4)),
          targetYaw: Number(rootTarget.rootHeadingYaw.toFixed(4)),
          targetX: Number(rootTarget.targetX.toFixed(4)),
          targetZ: Number(rootTarget.targetZ.toFixed(4)),
          source: rootTarget.source,
        };
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

      const applyRetargetSegment = (mapping: MovementAvatarRetargetBoneMapping) => {
        const vrm = vrmRef.current;
        const segment = retargetFrame.segments[mapping.segment];
        const segmentApplicationDecision = resolveMovementAvatarRetargetSegmentApplication({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          hasWorldLandmarks: Boolean(payload?.worldLandmarks),
          instructorSquatPresentationDepth,
          lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
          profile: avatarTrackingProfile,
          retargetFrame,
          segmentName: mapping.segment,
          segmentType: mapping.type,
          shouldUseRetargetedUpperBody,
        });
        if (!vrm || !segment || !segmentApplicationDecision.shouldApply) return false;

        let restPose = retargetAvatarRestRef.current[mapping.bone];
        if (!restPose) {
          retargetAvatarRestRef.current = buildMovementAvatarRetargetRestMap(vrm);
          restPose = retargetAvatarRestRef.current[mapping.bone];
        }
        if (!restPose) return false;

        const bone = vrm.humanoid.getNormalizedBoneNode(mapping.bone);
        if (!bone?.parent) return false;

        const desiredWorldDirection = movementSourceSegmentToAvatarWorldDirection(
          segment.direction,
          segmentApplicationDecision.zScale,
        );
        if (!desiredWorldDirection) return false;

        const parentWorldQuaternion = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(parentWorldQuaternion);
        const target = resolveMovementAvatarRestMappedQuaternionTarget({
          desiredWorldDirection,
          parentWorldQuaternion,
          restPose,
        });
        if (!target) return false;

        bone.quaternion.slerp(target.targetLocalQuaternion, segmentApplicationDecision.slerp);
        lastGoodQuatRef.current[mapping.bone] = bone.quaternion.clone();
        bone.updateMatrixWorld(true);
        return true;
      };

      const applyRestMappedWorldDirection = (
        boneName: VrmBoneName,
        desiredWorldDirection: THREE.Vector3,
        slerp: number,
      ) => {
        const vrm = vrmRef.current;
        if (!vrm || desiredWorldDirection.lengthSq() < 0.000001) return false;

        let restPose = retargetAvatarRestRef.current[boneName];
        if (!restPose) {
          retargetAvatarRestRef.current = buildMovementAvatarRetargetRestMap(vrm);
          restPose = retargetAvatarRestRef.current[boneName];
        }
        if (!restPose) return false;

        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone?.parent) return false;

        const parentWorldQuaternion = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(parentWorldQuaternion);
        const target = resolveMovementAvatarRestMappedQuaternionTarget({
          desiredWorldDirection,
          parentWorldQuaternion,
          restPose,
        });
        if (!target) return false;

        bone.quaternion.slerp(target.targetLocalQuaternion, slerp);
        bone.updateMatrixWorld(true);
        return true;
      };

      const applyPlantedSquatIk = (depth: number) => {
        const plantedSquatIk = resolveMovementAvatarPlantedSquatIkPose({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          depth,
        });
        if (plantedSquatIk.ikDepth <= 0.001) return 0;

        const forward = new THREE.Vector3(0, 0, 1);
        if (group.current) {
          group.current.getWorldDirection(forward).normalize();
        }

        let applied = 0;

        plantedSquatIk.specs.forEach((spec) => {
          const desiredDirection = resolveMovementAvatarBasisWorldDirection({
            basis: spec.direction,
            forward,
          });
          if (!desiredDirection) return;
          if (applyRestMappedWorldDirection(spec.bone as VrmBoneName, desiredDirection, spec.slerp)) {
            applied += 1;
          }
        });

        return applied > 0 ? plantedSquatIk.ikDepth : 0;
      };

      const applyPlantedFootLock = ({
        leftFoot,
        rightFoot,
      }: {
        leftFoot: THREE.Object3D | null;
        rightFoot: THREE.Object3D | null;
      }) => {
        const shouldEngageFootLock = resolveMovementAvatarFootLockEngagement({
          avatarRole,
          lowerBodyDrive,
          lowerBodyTrackingReady,
          retargetFrame,
          shouldApplyLowerBody,
          shouldHoldPlayerSquatPose,
        }).shouldEngage;
        const shouldLock = Boolean(
          group.current &&
          leftFoot &&
          rightFoot &&
          shouldEngageFootLock,
        );
        const footLockOptions = resolveMovementAvatarFootLockOptions({ avatarRole });

        if (!shouldLock || !group.current || !leftFoot || !rightFoot) {
          const footLockDecision = resolveMovementAvatarFootLockApplication({
            currentLeft: null,
            currentRight: null,
            options: footLockOptions,
            previousState: plantedFootLockRef.current,
            shouldLock: false,
          });
          plantedFootLockRef.current = footLockDecision.nextState;
          footLockDrift = footLockDecision.drift;
          footLockCorrection = footLockDecision.appliedCorrection;
          return;
        }

        vrmRef.current?.scene.updateMatrixWorld(true);
        group.current.updateMatrixWorld(true);
        leftFoot.updateMatrixWorld(true);
        rightFoot.updateMatrixWorld(true);

        const currentLeft = new THREE.Vector3();
        const currentRight = new THREE.Vector3();
        leftFoot.getWorldPosition(currentLeft);
        rightFoot.getWorldPosition(currentRight);

        const footLockDecision = resolveMovementAvatarFootLockApplication({
          currentLeft,
          currentRight,
          options: footLockOptions,
          previousState: plantedFootLockRef.current,
          shouldLock,
        });
        plantedFootLockRef.current = footLockDecision.nextState;
        footLockDrift = footLockDecision.drift;
        footLockCorrection = footLockDecision.appliedCorrection;
        if (!footLockDecision.shouldApplyCorrection) return;

        const correctionScale = plantedFootLockRef.current.strength * footLockOptions.correctionScale;
        group.current.position.addScaledVector(plantedFootLockRef.current.correction, correctionScale);
        group.current.updateMatrixWorld(true);
      };

      const applySupportContactLocks = () => {
        const contactLocks = avatarDecision.supportContactLocks;
        const vrm = vrmRef.current;
        if (!group.current || !vrm || !contactLocks.shouldApply) return;

        vrm.scene.updateMatrixWorld(true);
        group.current.updateMatrixWorld(true);

        const floorY = -2.75 + calibratedFloorCorrection;
        let weightedCorrection = 0;
        let totalWeight = 0;
        let appliedAnchors = 0;
        const boneCorrections: Array<{
          bone: THREE.Object3D;
          correction: number;
          weight: number;
        }> = [];

        contactLocks.anchors.forEach((anchor) => {
          const bone = vrm.humanoid.getNormalizedBoneNode(anchor.bone as VrmBoneName);
          if (!bone) return;

          bone.updateMatrixWorld(true);
          const worldPosition = new THREE.Vector3();
          bone.getWorldPosition(worldPosition);
          const targetY = floorY + anchor.targetOffsetFromFloor;
          const correction = THREE.MathUtils.clamp(
            targetY - worldPosition.y,
            -contactLocks.maxCorrection,
            contactLocks.maxCorrection,
          );

          weightedCorrection += correction * anchor.weight;
          totalWeight += anchor.weight;
          appliedAnchors += 1;
          if (contactLocks.boneCorrectionScale > 0 && bone.parent) {
            boneCorrections.push({
              bone,
              correction,
              weight: anchor.weight,
            });
          }
        });

        if (totalWeight <= 0 || appliedAnchors === 0) return;

        const rootCorrection = THREE.MathUtils.clamp(
          weightedCorrection / totalWeight,
          -contactLocks.maxCorrection,
          contactLocks.maxCorrection,
        );
        const appliedCorrection = rootCorrection * contactLocks.slerp * contactLocks.rootCorrectionScale;
        group.current.position.y += appliedCorrection;
        group.current.updateMatrixWorld(true);

        let appliedBoneCorrection = 0;
        if (contactLocks.boneCorrectionScale > 0 && contactLocks.maxBoneCorrection > 0) {
          vrm.scene.updateMatrixWorld(true);
          group.current.updateMatrixWorld(true);

          boneCorrections.forEach(({ bone, correction, weight }) => {
            if (!bone.parent) return;

            bone.updateMatrixWorld(true);
            bone.parent.updateMatrixWorld(true);

            const boneWorldPosition = new THREE.Vector3();
            bone.getWorldPosition(boneWorldPosition);
            const targetWorldPosition = boneWorldPosition.clone();
            const residualCorrection = THREE.MathUtils.clamp(
              correction - appliedCorrection,
              -contactLocks.maxBoneCorrection,
              contactLocks.maxBoneCorrection,
            );
            const weightedBoneCorrection =
              residualCorrection * contactLocks.boneCorrectionScale * Math.min(Math.max(weight, 0), 1);

            if (Math.abs(weightedBoneCorrection) < 0.0001) return;

            targetWorldPosition.y += weightedBoneCorrection;
            const targetLocalPosition = bone.parent.worldToLocal(targetWorldPosition);
            bone.position.lerp(targetLocalPosition, contactLocks.slerp);
            appliedBoneCorrection = Math.max(appliedBoneCorrection, Math.abs(weightedBoneCorrection));
          });
        }

        if (appliedBoneCorrection > 0) {
          group.current.updateMatrixWorld(true);
        }
        supportContactAnchorCount = appliedAnchors;
        supportContactCorrection = Math.max(Math.abs(appliedCorrection), appliedBoneCorrection);
      };

      const easeInstructorFootToPlanted = (side: "left" | "right", factor = 0.62) => {
        if (usesPlayerMotionPath) return;
        easeBoneToRotation(`${side}Foot` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        easeBoneToRotation(`${side}Toes` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        footOwner = resolveMovementAvatarPlantedFootOwner(footOwner);
      };

      const applyRootMotionStepResponse = ({
        leftFoot,
        rightFoot,
      }: {
        leftFoot: THREE.Object3D | null;
        rightFoot: THREE.Object3D | null;
      }) => {
        if (!stepResponse.shouldApply || !stepResponse.side || !vrmRef.current) return;
        const foot = stepResponse.side === "left" ? leftFoot : rightFoot;
        if (!foot?.parent) return;

        vrmRef.current.scene.updateMatrixWorld(true);
        foot.updateMatrixWorld(true);
        foot.parent.updateMatrixWorld(true);

        const footWorldPosition = new THREE.Vector3();
        foot.getWorldPosition(footWorldPosition);
        const targetWorldPosition = footWorldPosition.clone();
        targetWorldPosition.y += stepResponse.footLiftOffset;
        const targetLocalPosition = foot.parent.worldToLocal(targetWorldPosition);
        foot.position.lerp(targetLocalPosition, stepResponse.slerp);
      };

      const applySquatFlexionPose = (depth: number) => {
        resolveMovementAvatarSquatFlexionPose({
          bendBoost: avatarTrackingProfile.squatLegBendBoost,
          depth,
          slerp: boneEaseOptions.squatFlexionSlerp,
        }).forEach((spec) => {
          easeBoneToRotation(spec.bone as VrmBoneName, spec.rotation, spec.slerp);
        });
      };

      const applySingleLegRaisePose = (side: "left" | "right", depth: number) => {
        resolveMovementAvatarSingleLegRaisePose({
          depth,
          side,
          slerp: boneEaseOptions.singleLegRaiseSlerp,
        }).forEach((spec) => {
          easeBoneToRotation(spec.bone as VrmBoneName, spec.rotation, spec.slerp);
        });
      };

      const rp = riggedPose;

      const applySolvedLowerBodyPose = (depth: number) => {
        const flexDepth = THREE.MathUtils.smoothstep(depth, 0.08, 0.88);
        if (flexDepth <= 0.001) return;

        const factor = boneEaseOptions.solvedLowerBodySlerp;
        const scale = 1 + flexDepth * 1.05;
        const upperLegLimit = 1.15 + flexDepth * 0.35;
        const lowerLegLimit = 1.45 + flexDepth * 0.35;

        applyRot("rightUpperLeg", rp.RightUpperLeg, factor, {
          limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
          remember: false,
          scale,
        });
        applyRot("leftUpperLeg", rp.LeftUpperLeg, factor, {
          limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
          remember: false,
          scale,
        });
        applyRot("rightLowerLeg", rp.RightLowerLeg, factor, {
          limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
          remember: false,
          scale,
        });
        applyRot("leftLowerLeg", rp.LeftLowerLeg, factor, {
          limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
          remember: false,
          scale,
        });
      };

      const spineApplyOptions = resolveMovementAvatarSpineApplyOptions({
        avatarRole,
        shouldApplySpine: activeSpineDrive.shouldApplySpine,
      });

      if (activeSpineDrive.shouldApplySpine) {
        easeBoneToRotation("hips", activeSpineDrive.rotations.hips, spineApplyOptions.activeDrive.hips);
        easeBoneToRotation("spine", activeSpineDrive.rotations.spine, spineApplyOptions.activeDrive.spine);
        easeBoneToRotation("chest", activeSpineDrive.rotations.chest, spineApplyOptions.activeDrive.chest);
        easeBoneToRotation("upperChest", activeSpineDrive.rotations.upperChest, spineApplyOptions.activeDrive.upperChest);
      } else if (torsoTrackingReady && shouldApplySolverTorso) {
        const solverHipRotation = usesPlayerMotionPath
          ? rp.Hips?.rotation
          : mirrorRecordedTorsoRotation(rp.Hips?.rotation);
        const solverSpineRotation = usesPlayerMotionPath
          ? rp.Spine
          : mirrorRecordedTorsoRotation(rp.Spine);

        applyRot("hips", solverHipRotation, spineApplyOptions.solver.hips, {
          limits: { x: 0.35, y: 0.75, z: 0.45 },
        });
        applyRot("spine", solverSpineRotation, spineApplyOptions.solver.spine, {
          limits: { x: 0.45, y: 0.65, z: 0.45 },
          scale: 0.65,
        });
        applyRot("chest", solverSpineRotation, spineApplyOptions.solver.chest, {
          limits: { x: 0.35, y: 0.5, z: 0.35 },
          scale: 0.35,
        });
        applyRot("upperChest", solverSpineRotation, spineApplyOptions.solver.upperChest, {
          limits: { x: 0.25, y: 0.35, z: 0.25 },
          scale: 0.2,
        });
      } else {
        easeBoneToRotation("hips", { x: 0, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("spine", { x: 0.02, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("chest", { x: 0.02, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("upperChest", { x: 0.01, y: 0, z: 0 }, 0.14);
      }

      if (!shouldUseRetargetedUpperBody) {
        if (rightArmTrackingReady) {
          const rightArmAimOptions = resolveMovementAvatarArmAimOptions({
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            frontBias: rightFrontBodyArmBias,
            profile: avatarTrackingProfile,
            safeZScale: playerSafeArmZScale,
          });
          aimVector("rightUpperArm", "rightLowerArm", playerArmLms[12], rightElbowTarget, {
            ...rightArmAimOptions.upperArm,
          });
          aimVector("rightLowerArm", "rightHand", rightElbowTarget, rightWristTarget, {
            ...rightArmAimOptions.lowerArm,
          });
          easeHandToNeutral("right");
        } else {
          if (rightArmDecision.unreadyFallback === "hold-last-good") {
            holdArmAtLastGood("right");
          } else {
            easeArmToRelaxed("right");
          }
        }
      }

      if (!shouldUseRetargetedUpperBody) {
        if (leftArmTrackingReady) {
          const leftArmAimOptions = resolveMovementAvatarArmAimOptions({
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            frontBias: leftFrontBodyArmBias,
            profile: avatarTrackingProfile,
            safeZScale: playerSafeArmZScale,
          });
          aimVector("leftUpperArm", "leftLowerArm", playerArmLms[11], leftElbowTarget, {
            ...leftArmAimOptions.upperArm,
          });
          aimVector("leftLowerArm", "leftHand", leftElbowTarget, leftWristTarget, {
            ...leftArmAimOptions.lowerArm,
          });
          easeHandToNeutral("left");
        } else {
          if (leftArmDecision.unreadyFallback === "hold-last-good") {
            holdArmAtLastGood("left");
          } else {
            easeArmToRelaxed("left");
          }
        }
      }

      if (spineApplyOptions.shouldCountRecordedSpineRetarget) {
        retargetAppliedUpperBody += 1;
      }

      if (shouldUseRetargetedUpperBody) {
        MOVEMENT_AVATAR_UPPER_BODY_RECORDED_RETARGET_MAPPINGS.forEach((mapping) => {
          if (!applyRetargetSegment(mapping)) return;
          retargetAppliedUpperBody += 1;
        });
      }

      if ((lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && shouldApplyLowerBody) {
        const lowerBodyAimOptions = resolveMovementAvatarLegacyLowerBodyAimOptions({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          profile: avatarTrackingProfile,
        });
        const applyLegacyLowerBodyAim = () => {
          aimVector("rightUpperLeg", "rightLowerLeg", targetSolverLms[24], rightKneeTarget, lowerBodyAimOptions.leg);
          aimVector("rightLowerLeg", "rightFoot", rightKneeTarget, rightAnkleTarget, lowerBodyAimOptions.leg);
          aimVector("leftUpperLeg", "leftLowerLeg", targetSolverLms[23], leftKneeTarget, lowerBodyAimOptions.leg);
          aimVector("leftLowerLeg", "leftFoot", leftKneeTarget, leftAnkleTarget, lowerBodyAimOptions.leg);
          aimVector("rightFoot", "rightToes", targetSolverLms[30], rightToeTarget, lowerBodyAimOptions.foot);
          aimVector("leftFoot", "leftToes", targetSolverLms[29], leftToeTarget, lowerBodyAimOptions.foot);
        };

        const lowerBodyStageDecision = lowerBodyTarget.stageDecision;

        if (!lowerBodyStageDecision) {
          lowerBodyOwner = lowerBodyTarget.lowerBodyOwner;
          footOwner = lowerBodyTarget.feetOwner;
          easeLowerBodyToNeutral();
        } else if (lowerBodyStageDecision.stage === "player-leg-raise" && lowerBodyStageDecision.anchoredPlayerLegRaiseSide) {
          lowerBodyOwner = lowerBodyStageDecision.lowerBodyOwner;
          footOwner = lowerBodyStageDecision.feetOwner;
          applySingleLegRaisePose(
            lowerBodyStageDecision.anchoredPlayerLegRaiseSide,
            lowerBodyDrive.playerLegRaiseDepth,
          );
        } else if (lowerBodyStageDecision.stage === "player-squat") {
          lowerBodyOwner = lowerBodyStageDecision.lowerBodyOwner;
          footOwner = lowerBodyStageDecision.feetOwner;
          const stableIkDepth = applyPlantedSquatIk(playerSquatPresentationDepth);
          plantedSquatIkDepth = stableIkDepth;
          applySquatFlexionPose(playerSquatPresentationDepth);
          if (playerSquatPresentationDepth <= 0.16) {
            easeLowerBodyToNeutral();
          }
        } else if (lowerBodyStageDecision.stage === "player-neutral") {
          lowerBodyOwner = lowerBodyStageDecision.lowerBodyOwner;
          footOwner = lowerBodyStageDecision.feetOwner;
          easeLowerBodyToNeutral();
        } else if (lowerBodyStageDecision.stage === "recorded-neutral") {
          lowerBodyOwner = lowerBodyStageDecision.lowerBodyOwner;
          easeLowerBodyToNeutral();
          easeInstructorFootToPlanted("right");
          easeInstructorFootToPlanted("left");
        } else {
          vrmRef.current.scene.updateMatrixWorld(true);
          MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.forEach((mapping) => {
            if (!applyRetargetSegment(mapping)) return;
            retargetAppliedLowerBody += 1;
            if (mapping.type === "leg") retargetAppliedLegs += 1;
            if (mapping.type === "foot") {
              retargetAppliedFeet += 1;
              footOwner = "recorded-retarget";
            }
          });

          const appliedLowerBodyDecision = resolveMovementAvatarAppliedLowerBodyDecision({
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
          });
          lowerBodyOwner = appliedLowerBodyDecision.lowerBodyOwner;

          if (retargetAppliedLowerBody < 4 || appliedLowerBodyDecision.shouldUsePlayerFootFallback) {
            applyLegacyLowerBodyAim();
          }
          footOwner = appliedLowerBodyDecision.feetOwner;

          if (appliedLowerBodyDecision.shouldUseLegacyLowerBody) {
            applySolvedLowerBodyPose(usesPlayerMotionPath ? liveSquatDepth : instructorSquatPresentationDepth);
          }
          plantedSquatIkDepth = usesPlayerMotionPath
            ? applyPlantedSquatIk(playerSquatPresentationDepth)
            : appliedLowerBodyDecision.shouldUseLegacyLowerBody && balancedPlantedSquatDepth > 0
              ? applyPlantedSquatIk(instructorSquatPresentationDepth)
              : 0;
          if (appliedLowerBodyDecision.shouldUseLegacyLowerBody || appliedLowerBodyDecision.shouldUseRecordedSquatPresentation) {
            applySquatFlexionPose(playerSquatPresentationDepth);
          }
          if (lowerBodyStageDecision.anchoredPlayerLegRaiseSide) {
            applySingleLegRaisePose(
              lowerBodyStageDecision.anchoredPlayerLegRaiseSide,
              lowerBodyDrive.playerLegRaiseDepth,
            );
          }
          if (!usesPlayerMotionPath && retargetFrame.contacts.rightFoot) {
            easeInstructorFootToPlanted("right");
          }
          if (!usesPlayerMotionPath && retargetFrame.contacts.leftFoot) {
            easeInstructorFootToPlanted("left");
          }
        }
      } else {
        const inactiveLowerBodyDecision = resolveMovementAvatarInactiveLowerBodyDecision({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          lowerBodySourceReliable: recordedLowerBodySourceReliable,
        });
        if (inactiveLowerBodyDecision.lowerBodyOwner) {
          lowerBodyOwner = inactiveLowerBodyDecision.lowerBodyOwner;
        }
        if (inactiveLowerBodyDecision.feetOwner) {
          footOwner = inactiveLowerBodyDecision.feetOwner;
        }
        easeLowerBodyToNeutral();
      }

      if (avatarDecision.supportPresentation.shouldApply) {
        avatarDecision.supportPresentation.specs.forEach((spec) => {
          easeBoneToRotation(spec.bone as VrmBoneName, spec.rotation, spec.slerp);
        });
        avatarDecision.supportPresentation.spineSpecs.forEach((spec) => {
          easeBoneToRotation(spec.bone as VrmBoneName, spec.rotation, spec.slerp);
        });
        avatarDecision.supportPresentation.armSpecs.forEach((spec) => {
          easeBoneToRotation(spec.bone as VrmBoneName, spec.rotation, spec.slerp);
        });
        lowerBodyOwner = avatarDecision.supportPresentation.owner;
      }
      applySupportContactLocks();

      const leftEar = imageLms[7];
      const rightEar = imageLms[8];
      const nose = imageLms[0];

      if (leftEar && rightEar && nose) {
        const headNode = vrmRef.current.humanoid.getNormalizedBoneNode("head");
        if (headNode) {
          const headTarget = resolveMovementAvatarHeadTarget({
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            avatarRootYaw: group.current.rotation.y,
            calibration: activeCalibration,
            faceLandmarks: payload?.faceLandmarks,
            poseLandmarks: imageLms,
            profile: avatarTrackingProfile,
            shouldApplyLowerBody,
            shouldApplySpine: activeSpineDrive.shouldApplySpine,
          });
          const {
            appliedHead,
            headOwner,
            headRoll,
            shouldApplyHeadMotion,
          } = headTarget.headDecision;
          const { headMotionIntent } = headTarget;
          const { rawHead } = headTarget.rawHeadDecision;
          const headApplicationPose = headTarget.applicationPose;
          const headApplyOptions = headTarget.applyOptions;

          if (headNode.parent) {
            const parentWorldQ = new THREE.Quaternion();
            headNode.parent.getWorldQuaternion(parentWorldQ);
            const headQuaternionTarget = resolveMovementAvatarHeadQuaternionTarget({
              headBonePitch: headTarget.headBonePitch,
              headRoll,
              headWorldYaw: headTarget.headWorldYaw,
              parentWorldQuaternion: parentWorldQ,
            });
            headNode.quaternion.slerp(
              headQuaternionTarget.targetLocalQuaternion ?? headQuaternionTarget.targetWorldQuaternion,
              headApplyOptions.headSlerp,
            );
          } else {
            const headQuaternionTarget = resolveMovementAvatarHeadQuaternionTarget({
              headBonePitch: headTarget.headBonePitch,
              headRoll,
              headWorldYaw: headTarget.headWorldYaw,
            });
            headNode.quaternion.slerp(
              headQuaternionTarget.targetWorldQuaternion,
              headApplyOptions.headSlerp,
            );
          }

          const neckNode = vrmRef.current.humanoid.getNormalizedBoneNode("neck");
          if (shouldApplyHeadMotion && neckNode) {
            if (headApplicationPose.neckRotation) {
              const neckTarget = resolveMovementAvatarNeckQuaternionTarget(
                headApplicationPose.neckRotation,
              );
              neckNode.quaternion.slerp(neckTarget, avatarTrackingProfile.neckSlerp);
            }

            if (headApplicationPose.headPositionOffset) {
              easeBonePosition(
                "head",
                movementAvatarHeadOffsetToVector(headApplicationPose.headPositionOffset),
                headApplyOptions.headPositionSlerp,
              );
            }
            if (headApplicationPose.upperChestCompensation) {
              easeBoneToRotation(
                "upperChest",
                {
                  x: headApplicationPose.upperChestCompensation.x,
                  y: headApplicationPose.upperChestCompensation.y,
                  z: headApplicationPose.upperChestCompensation.z,
                },
                headApplyOptions.upperChestCompensationSlerp,
              );
            }
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

            const retargetDebug: NonNullable<MovementTrackingDebugState["retarget"]> = {
              ...buildMovementAvatarRetargetDebug({
                appliedLowerBody: retargetAppliedLowerBody,
                appliedUpperBody: retargetAppliedUpperBody,
                plantedSquatIkDepth,
                retargetFrame,
                retargetSourceModel: retargetSourceModelRef.current,
                visualRootDrop,
              }),
              footLockCorrection,
              footLockDrift,
              footLockStrength: plantedFootLockRef.current.strength,
              squatDepth: liveSquatDepth,
              totalLowerBody: MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.length,
              totalUpperBody: MOVEMENT_AVATAR_UPPER_BODY_VISUAL_MAPPINGS.length,
            };

            trackingDebugRef.current = {
              updatedAt: performance.now(),
              headRaw: rawHead,
              headApplied: appliedHead,
              avatarHead: {
                appliedLocalPitch: Number(headNode.rotation.x.toFixed(4)),
                boneYaw: Number(headTarget.headDecision.headYaw.toFixed(4)),
                bonePitch: Number(headTarget.headBonePitch.toFixed(4)),
                trackingPitch: Number(headTarget.headDecision.headPitch.toFixed(4)),
                trackingYaw: Number(rawHead.yaw.toFixed(4)),
              },
              avatarLegRaise: {
                appliedDepth: Number(lowerBodyDrive.playerLegRaiseDepth.toFixed(4)),
                expiresInMs: Number(Math.max(0, playerLegRaiseHoldRef.current.expiresAt - performance.now()).toFixed(0)),
                holdActive: legRaiseHoldDecision.wasHeld,
                rawLeftDepth: Number(lowerBodyIntent.leftKneeRaise.toFixed(4)),
                rawRightDepth: Number(lowerBodyIntent.rightKneeRaise.toFixed(4)),
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
              fallbacks: {
                baseline: fallbackLabels.baseline,
                head: fallbackLabels.head,
                headMotion: fallbackLabels.headMotion,
                spine: fallbackLabels.spine,
                armDepth: fallbackLabels.armDepth,
                rightArm: fallbackLabels.rightArm,
                leftArm: fallbackLabels.leftArm,
                rightKnee: fallbackLabels.rightKnee,
                leftKnee: fallbackLabels.leftKnee,
                rightFoot: fallbackLabels.rightFoot,
                leftFoot: fallbackLabels.leftFoot,
                floor: fallbackLabels.floor,
                orientation: `${bodyOrientation.orientation} ${bodyOrientation.status}`,
                support: bodySupport.supportLabel,
                supportContact: `${avatarDecision.supportContactLocks.owner} anchors ${supportContactAnchorCount} corr ${supportContactCorrection.toFixed(3)}`,
                supportConstraint: `${supportConstraint.owner} ${supportConstraint.status}`,
                supportIntent: `${supportIntent.label} ${supportIntent.status}`,
                supportPresentation: avatarDecision.supportPresentation.owner,
                exercisePose: `${exercisePose.label} ${exercisePose.status}`,
                exerciseTransition: exerciseTransition.label,
                motionFrameInput: motionFrameInput.owner,
                lowerBody: fallbackLabels.lowerBody,
                owners: fallbackLabels.owners,
                retarget: formatMovementAvatarRetargetDebugLabel(retargetDebug),
              },
              retarget: retargetDebug,
              profileName: avatarTrackingProfileName,
              calibrationQuality: activeCalibration?.quality,
            };

            if (typeof window !== "undefined") {
              const registryWindow = window as Window & {
                __sonaeMovementRetargetDebug?: Partial<MovementRetargetDebugRegistry>;
              };
              registryWindow.__sonaeMovementRetargetDebug = {
                ...registryWindow.__sonaeMovementRetargetDebug,
                [isPlayer ? "player" : "instructor"]: {
                  ...retargetDebug,
                  avatarName: name,
                  frameUpdatedAt: performance.now(),
                },
              };
            }
          }
        }
      }

      const leftFoot = vrmRef.current.humanoid.getNormalizedBoneNode("leftFoot");
      const rightFoot = vrmRef.current.humanoid.getNormalizedBoneNode("rightFoot");
      if (hipsNode && baseHipsPositionRef.current) {
        const baseHipsY = baseHipsPositionRef.current.y;
        let targetHipsY = baseHipsY;

        if (hipsApplication.shouldApplySquatDrop) {
          targetHipsY -= hipsApplication.squatDrop;
        }

        hipsNode.position.y = THREE.MathUtils.lerp(
          hipsNode.position.y,
          targetHipsY,
          hipsPositionOptions.rootLerp,
        );

        if (leftFoot && rightFoot && hipsApplication.shouldApplyFloorContactCorrection) {
          vrmRef.current.scene.updateMatrixWorld(true);
          leftFoot.updateMatrixWorld(true);
          rightFoot.updateMatrixWorld(true);

          const lfW = new THREE.Vector3();
          leftFoot.getWorldPosition(lfW);
          const rfW = new THREE.Vector3();
          rightFoot.getWorldPosition(rfW);
          const lowestFootY = Math.min(lfW.y, rfW.y);
          const diff = (-2.75 + calibratedFloorCorrection) - lowestFootY;
          const clampedCorrection = THREE.MathUtils.clamp(diff / 5.25, -0.18, 0.18);
          hipsNode.position.y += clampedCorrection * hipsPositionOptions.floorContactCorrectionScale;
        }
      }

      applyPlantedFootLock({ leftFoot, rightFoot });
      applyRootMotionStepResponse({ leftFoot, rightFoot });
      if (trackingDebugRef?.current && vrmRef.current) {
        trackingDebugRef.current.avatarVisual = buildAvatarVisualTelemetry({
          retargetFrame,
          vrm: vrmRef.current,
          zScale: payload?.worldLandmarks ? 1 : 0.18,
        });
      }
      if (trackingDebugRef?.current?.fallbacks.retarget) {
        trackingDebugRef.current.fallbacks.retarget = appendMovementAvatarFootLockDebugLabel(
          trackingDebugRef.current.fallbacks.retarget,
          {
            correction: footLockCorrection,
            drift: footLockDrift,
            strength: plantedFootLockRef.current.strength,
          },
        );
        if (trackingDebugRef.current.retarget) {
          trackingDebugRef.current.retarget = {
            ...trackingDebugRef.current.retarget,
            footLockCorrection,
            footLockDrift,
            footLockStrength: plantedFootLockRef.current.strength,
          };

          if (typeof window !== "undefined") {
            const registryWindow = window as Window & {
              __sonaeMovementRetargetDebug?: Partial<MovementRetargetDebugRegistry>;
            };
            registryWindow.__sonaeMovementRetargetDebug = {
              ...registryWindow.__sonaeMovementRetargetDebug,
              [isPlayer ? "player" : "instructor"]: {
                ...trackingDebugRef.current.retarget,
                avatarName: name,
                frameUpdatedAt: performance.now(),
              },
            };
          }
        }
      }

      const expressionManager = vrmRef.current?.expressionManager;
      if (rigBlendshapes && expressionManager) {
        let smileScore = 0;
        rigBlendshapes.forEach((blendshape) => {
          if (blendshape.categoryName === "eyeBlinkLeft") {
            expressionManager.setValue("blinkLeft", blendshape.score);
          }
          if (blendshape.categoryName === "eyeBlinkRight") {
            expressionManager.setValue("blinkRight", blendshape.score);
          }
          if (blendshape.categoryName === "jawOpen") {
            expressionManager.setValue("aa", Math.min(1.0, blendshape.score * 1.5));
          }
          if (
            blendshape.categoryName === "mouthSmileLeft" ||
            blendshape.categoryName === "mouthSmileRight"
          ) {
            smileScore += blendshape.score / 2;
          }
        });
        expressionManager.setValue("happy", smileScore);
      }

      if (rigHands) {
        const mapFingers = (side: "left" | "right") => {
          const handData = rigHands[side];
          if (!handData || !handData.landmarks) return;

          const handednessStr = side === "left" ? "Left" : "Right";
          const handRigOptions = resolveVrmHandRigOptions({
            isPlayer: usesPlayerMotionPath,
            mirrorForDisplay: mirrorPlayerDisplay,
          });
          const handLandmarks = prepareVrmHandLandmarks(handData, {
            mirrorX: handRigOptions.mirrorX,
          });
          const rig = solveVrmHand(handLandmarks, handednessStr) as HandRig | null;
          if (!rig) return;

          resolveVrmHandRotationTargets({
            isPlayer: handRigOptions.isPlayer,
            rig,
            side,
            slerp: handRigOptions.slerp,
          }).forEach((target) => {
            const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(target.vrmName as VrmBoneName);
            if (bone) {
              const targetQ = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z),
              );
              bone.quaternion.slerp(targetQ, target.slerp);
            }
          });
        };

        mapFingers("left");
        mapFingers("right");
      }
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
