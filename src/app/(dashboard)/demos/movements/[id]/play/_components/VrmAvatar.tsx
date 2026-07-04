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
  resolveMovementAvatarArmTargets,
  resolveMovementAvatarBoneEaseOptions,
  resolveMovementAvatarFootLockOptions,
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadApplyOptions,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarAppliedLowerBodyDecision,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLegacyLowerBodyAimOptions,
  resolveMovementAvatarLowerBodyApplicationStage,
  resolveMovementAvatarLowerBodyTargetSelections,
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlantedFootOwner,
  resolveMovementAvatarPlantedSquatIkPose,
  resolveMovementAvatarPlayerSourceOwnerDecision,
  resolveMovementAvatarRawHeadDecision,
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarRetargetSegmentApplication,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSpineApplyOptions,
  resolveMovementAvatarSquatFlexionPose,
  resolveMovementAvatarStudioDecision,
  resolveMovementAvatarTrackingFallbackLabels,
  type MovementAvatarLowerBodyVisualState,
} from "../../../_lib/movementAvatarPipeline";
import {
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  getRecordedSquatPresentationDepth,
  type MovementRetargetFrame,
  type MovementRetargetSegmentName,
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import {
  getCalibratedFloorCorrection,
  getMovementHeadMotionIntent,
  resolveMovementAutoCalibrationState,
  type MovementAutoCalibrationKind,
  type MovementCalibration,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import {
  getVrmHandWristFallbackTarget,
  getVrmMotionLandmarks,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
  resolveVrmHandRigOptions,
  resolveVrmArmTargetLandmarks,
  solveVrmHand,
  solveVrmPose,
  strengthenVrmHandRotation,
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

type RetargetAvatarRestBone = {
  worldDirection: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
};

type RetargetAvatarRestMap = Partial<Record<VrmBoneName, RetargetAvatarRestBone>>;

type RetargetBoneMapping = {
  bone: VrmBoneName;
  child: VrmBoneName;
  segment: MovementRetargetSegmentName;
  type: "arm" | "foot" | "leg" | "spine";
};

type PlantedFootLockState = {
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  correction: THREE.Vector3;
  strength: number;
};

type MovementRetargetDebugRegistry = Record<
  "instructor" | "player",
  NonNullable<MovementTrackingDebugState["retarget"]> & {
    avatarName: string;
    frameUpdatedAt: number;
  }
>;

const LOWER_BODY_RETARGET_MAPPINGS: RetargetBoneMapping[] = [
  { bone: "rightUpperLeg", child: "rightLowerLeg", segment: "rightThigh", type: "leg" },
  { bone: "rightLowerLeg", child: "rightFoot", segment: "rightShin", type: "leg" },
  { bone: "leftUpperLeg", child: "leftLowerLeg", segment: "leftThigh", type: "leg" },
  { bone: "leftLowerLeg", child: "leftFoot", segment: "leftShin", type: "leg" },
  { bone: "rightFoot", child: "rightToes", segment: "rightFoot", type: "foot" },
  { bone: "leftFoot", child: "leftToes", segment: "leftFoot", type: "foot" },
];

const UPPER_BODY_VISUAL_MAPPINGS: RetargetBoneMapping[] = [
  { bone: "spine", child: "chest", segment: "spine", type: "spine" },
  { bone: "rightUpperArm", child: "rightLowerArm", segment: "rightUpperArm", type: "arm" },
  { bone: "rightLowerArm", child: "rightHand", segment: "rightLowerArm", type: "arm" },
  { bone: "leftUpperArm", child: "leftLowerArm", segment: "leftUpperArm", type: "arm" },
  { bone: "leftLowerArm", child: "leftHand", segment: "leftLowerArm", type: "arm" },
];

const UPPER_BODY_RECORDED_RETARGET_MAPPINGS = UPPER_BODY_VISUAL_MAPPINGS.filter(
  (mapping) => mapping.type !== "spine",
);

const AVATAR_VISUAL_MAPPINGS = [
  ...UPPER_BODY_VISUAL_MAPPINGS,
  ...LOWER_BODY_RETARGET_MAPPINGS,
];

const AVATAR_BASE_Y = -2.8;

function buildAvatarRetargetRestMap(vrm: VRM): RetargetAvatarRestMap {
  const restMap: RetargetAvatarRestMap = {};
  vrm.scene.updateMatrixWorld(true);

  AVATAR_VISUAL_MAPPINGS.forEach(({ bone: boneName, child: childName }) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    const child = vrm.humanoid.getNormalizedBoneNode(childName);
    if (!bone || !child) return;

    const boneWorldPosition = new THREE.Vector3();
    const childWorldPosition = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPosition);
    child.getWorldPosition(childWorldPosition);

    const worldDirection = childWorldPosition.sub(boneWorldPosition);
    if (worldDirection.lengthSq() < 0.000001) return;

    const worldQuaternion = new THREE.Quaternion();
    bone.getWorldQuaternion(worldQuaternion);

    restMap[boneName] = {
      worldDirection: worldDirection.normalize(),
      worldQuaternion,
    };
  });

  return restMap;
}

function sourceSegmentToAvatarWorldDirection(
  direction: { x: number; y: number; z: number },
  zScale: number,
) {
  const worldDirection = new THREE.Vector3(
    direction.x,
    -direction.y,
    -direction.z * zScale,
  );

  return worldDirection.lengthSq() > 0.000001 ? worldDirection.normalize() : null;
}

function compactVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
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
  const segments = AVATAR_VISUAL_MAPPINGS.reduce<
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
      ? sourceSegmentToAvatarWorldDirection(sourceSegment.direction, zScale)
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
  positionOffset: [number, number, number];
  isPlayer?: boolean;
  isPlaying?: boolean;
  motionMode?: "player" | "recorded";
  showPausedPose?: boolean;
  showNameLabel?: boolean;
  trackingCalibration?: MovementCalibration | null;
  trackingDebugRef?: MutableRefObject<MovementTrackingDebugState | null>;
  retargetSourceModel?: MovementRetargetSourceModel | null;
  vrmUrl: string;
  name: string;
};

export default function VrmAvatar({
  landmarksRef,
  positionOffset,
  isPlayer = false,
  isPlaying = true,
  motionMode,
  showPausedPose = false,
  showNameLabel = true,
  trackingCalibration = null,
  trackingDebugRef,
  retargetSourceModel = null,
  vrmUrl,
  name,
}: VrmAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const baseHipsPositionRef = useRef<THREE.Vector3 | null>(null);
  const baseBonePositionRef = useRef<Record<string, THREE.Vector3>>({});
  const autoCalibrationRef = useRef<MovementCalibration | null>(null);
  const autoCalibrationKindRef = useRef<MovementAutoCalibrationKind | null>(null);
  const autoCalibrationSamplesRef = useRef<MovementCalibration[]>([]);
  const retargetAvatarRestRef = useRef<RetargetAvatarRestMap>({});
  const retargetSourceModelRef = useRef<MovementRetargetSourceModel | null>(null);
  const plantedFootLockRef = useRef<PlantedFootLockState>({
    correction: new THREE.Vector3(),
    left: null,
    right: null,
    strength: 0,
  });
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
      autoCalibrationRef.current = null;
      autoCalibrationKindRef.current = null;
      autoCalibrationSamplesRef.current = [];
      retargetAvatarRestRef.current = buildAvatarRetargetRestMap(loadedVrm);
      retargetSourceModelRef.current = null;
      plantedFootLockRef.current = {
        correction: new THREE.Vector3(),
        left: null,
        right: null,
        strength: 0,
      };
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

    const {
      forceStandby,
      imageLandmarks: imageLms,
      solverLandmarks: solverLms,
      kalidokitSolverLandmarks: kdSolverLms,
      rigHands,
      rigBlendshapes,
    } = prepareVrmSolverInput({
      rawLandmarks: raw,
      payload,
      isPlayer: usesPlayerMotionPath,
      isPlaying: isPlaying || showPausedPose,
    });

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

      if (trackingCalibration) {
        autoCalibrationRef.current = null;
        autoCalibrationKindRef.current = null;
        autoCalibrationSamplesRef.current = [];
      }

      if (usesPlayerMotionPath && !trackingCalibration && !autoCalibrationRef.current) {
        const autoCalibrationState = resolveMovementAutoCalibrationState({
          poseLandmarks: imageLms,
          faceLandmarks: payload?.faceLandmarks,
          state: {
            calibration: autoCalibrationRef.current,
            kind: autoCalibrationKindRef.current,
            samples: autoCalibrationSamplesRef.current,
          },
        });
        autoCalibrationRef.current = autoCalibrationState.calibration;
        autoCalibrationKindRef.current = autoCalibrationState.kind;
        autoCalibrationSamplesRef.current = autoCalibrationState.samples;
      }

      const activeCalibration = usesPlayerMotionPath
        ? trackingCalibration ?? autoCalibrationRef.current
        : null;
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
      const avatarDecision = resolveAvatarDecision({
        avatarTrackingProfile,
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        calibration: activeCalibration,
        retargetSourceModel: retargetSourceModelRef.current,
        source: {
          hands: rigHands,
          poseLandmarks: imageLms,
        },
      });
      const bodyConfidence = avatarDecision.bodyConfidence;
      const retargetFrame = avatarDecision.retargetFrame;
      const lowerBodyIntent = avatarDecision.lowerBodyIntent;
      const headMotionIntent = getMovementHeadMotionIntent({
        poseLandmarks: imageLms,
        faceLandmarks: payload?.faceLandmarks,
        calibration: activeCalibration,
      });
      let visualRootDrop = 0;
      let footLockCorrection = 0;
      let footLockDrift = 0;
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
      const lowerBodyDrive = avatarDecision.lowerBodyDrive;
      const activeSpineDrive = avatarDecision.spineDrive;
      const liveSquatDepth = lowerBodyDrive.liveSquatDepth;
      const shouldApplyLowerBody = avatarDecision.shouldApplyLowerBody;
      const shouldApplySolverTorso = avatarDecision.shouldApplySolverTorso;
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
      const instructorLowerBodyMotion = Math.max(
        instructorSquatPresentationDepth,
        recordedLowerBodySegmentMotion,
        retargetFrame.kneeLift.left,
        retargetFrame.kneeLift.right,
      );
      const shouldHoldPlayerSquatPose =
        usesPlayerMotionPath &&
        shouldApplyLowerBody &&
        playerSquatPresentationDepth > 0.18;
      const playerSourceOwner = resolveMovementAvatarPlayerSourceOwnerDecision({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        decision: avatarDecision,
        playerSquatPresentationDepth,
        shouldHoldPlayerSquatPose,
      });
      const playerRetargetLowerBodyMotion = playerSourceOwner.playerRetargetLowerBodyMotion;
      const retargetSolvedLegs = avatarDecision.retargetSolvedLegs;
      const retargetSolvedFeet = avatarDecision.retargetSolvedFeet;
      const playerSourceOwnerDecision = playerSourceOwner.lowerBodyOwnerDecision;
      const hipsPositionOptions = resolveMovementAvatarHipsPositionOptions({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        lowerBodyDrive,
        profile: avatarTrackingProfile,
      });
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

      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        AVATAR_BASE_Y - visualRootDrop,
        hipsPositionOptions.avatarRootVisualLerp,
      );

      const playerArmLms = resolveVrmArmTargetLandmarks({
        imageLandmarks: imageLms,
        isPlayer: usesPlayerMotionPath,
        solverLandmarks: solverLms,
      });
      const rightHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.right, imageLms);
      const leftHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.left, imageLms);
      const armTargets = resolveMovementAvatarArmTargets({
        handWristFallbacks: {
          left: leftHandWristFallback,
          right: rightHandWristFallback,
        },
        isPlayer: usesPlayerMotionPath,
        lowerBodyDrive,
        playerLandmarks: playerArmLms,
        solverLandmarks: solverLms,
      });
      const rightWristTarget =
        (armTargets.right.wristTarget as VrmSolverLandmark | null) ??
        (usesPlayerMotionPath ? playerArmLms[16] : solverLms[16]);
      const leftWristTarget =
        (armTargets.left.wristTarget as VrmSolverLandmark | null) ??
        (usesPlayerMotionPath ? playerArmLms[15] : solverLms[15]);
      const playerSafeArmZScale = armTargets.right.safeZScale;
      const rightFrontBodyArmBias = armTargets.right.frontBias;
      const leftFrontBodyArmBias = armTargets.left.frontBias;
      const rightElbowTarget = (armTargets.right.elbowTarget as VrmSolverLandmark | null) ?? playerArmLms[14];
      const leftElbowTarget = (armTargets.left.elbowTarget as VrmSolverLandmark | null) ?? playerArmLms[13];
      const lowerBodyTargetSelections = resolveMovementAvatarLowerBodyTargetSelections({
        avatarRole: usesPlayerMotionPath ? "player" : "instructor",
        landmarks: solverLms,
      });
      const rightKneeSelection = lowerBodyTargetSelections.rightKnee;
      const leftKneeSelection = lowerBodyTargetSelections.leftKnee;
      const rightAnkleSelection = lowerBodyTargetSelections.rightAnkle;
      const leftAnkleSelection = lowerBodyTargetSelections.leftAnkle;
      const rightToeSelection = lowerBodyTargetSelections.rightToe;
      const leftToeSelection = lowerBodyTargetSelections.leftToe;
      const rightKneeTarget =
        (rightKneeSelection.target as VrmSolverLandmark | null) ?? solverLms[26];
      const leftKneeTarget =
        (leftKneeSelection.target as VrmSolverLandmark | null) ?? solverLms[25];
      const rightAnkleTarget =
        (rightAnkleSelection.target as VrmSolverLandmark | null) ?? solverLms[28];
      const leftAnkleTarget =
        (leftAnkleSelection.target as VrmSolverLandmark | null) ?? solverLms[27];
      const rightToeTarget =
        (rightToeSelection.target as VrmSolverLandmark | null) ?? solverLms[32];
      const leftToeTarget =
        (leftToeSelection.target as VrmSolverLandmark | null) ?? solverLms[31];

      const applyRetargetSegment = (mapping: RetargetBoneMapping) => {
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
          retargetAvatarRestRef.current = buildAvatarRetargetRestMap(vrm);
          restPose = retargetAvatarRestRef.current[mapping.bone];
        }
        if (!restPose) return false;

        const bone = vrm.humanoid.getNormalizedBoneNode(mapping.bone);
        if (!bone?.parent) return false;

        const desiredWorldDirection = sourceSegmentToAvatarWorldDirection(
          segment.direction,
          segmentApplicationDecision.zScale,
        );
        if (!desiredWorldDirection) return false;

        const retargetOffset = new THREE.Quaternion().setFromUnitVectors(
          restPose.worldDirection,
          desiredWorldDirection,
        );
        const targetWorldQuaternion = retargetOffset.multiply(
          restPose.worldQuaternion.clone(),
        );
        const parentWorldQuaternion = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(parentWorldQuaternion);
        const targetLocalQuaternion = parentWorldQuaternion
          .invert()
          .multiply(targetWorldQuaternion);
        bone.quaternion.slerp(targetLocalQuaternion, segmentApplicationDecision.slerp);
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
          retargetAvatarRestRef.current = buildAvatarRetargetRestMap(vrm);
          restPose = retargetAvatarRestRef.current[boneName];
        }
        if (!restPose) return false;

        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone?.parent) return false;

        const targetWorldOffset = new THREE.Quaternion().setFromUnitVectors(
          restPose.worldDirection,
          desiredWorldDirection.normalize(),
        );
        const targetWorldQuaternion = targetWorldOffset.multiply(
          restPose.worldQuaternion.clone(),
        );
        const parentWorldQuaternion = new THREE.Quaternion();
        bone.parent.getWorldQuaternion(parentWorldQuaternion);
        const targetLocalQuaternion = parentWorldQuaternion
          .invert()
          .multiply(targetWorldQuaternion);

        bone.quaternion.slerp(targetLocalQuaternion, slerp);
        bone.updateMatrixWorld(true);
        return true;
      };

      const applyPlantedSquatIk = (depth: number) => {
        const plantedSquatIk = resolveMovementAvatarPlantedSquatIkPose({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          depth,
        });
        if (plantedSquatIk.ikDepth <= 0.001) return 0;

        const down = new THREE.Vector3(0, -1, 0);
        const side = new THREE.Vector3(1, 0, 0);
        const forward = new THREE.Vector3(0, 0, 1);
        if (group.current) {
          group.current.getWorldDirection(forward).normalize();
        }

        let applied = 0;

        const makeDirection = (
          downAmount: number,
          sideAmount: number,
          forwardAmount: number,
        ) => down.clone()
          .multiplyScalar(downAmount)
          .add(side.clone().multiplyScalar(sideAmount))
          .add(forward.clone().multiplyScalar(forwardAmount))
          .normalize();

        plantedSquatIk.specs.forEach((spec) => {
          const desiredDirection = makeDirection(
            spec.direction.down,
            spec.direction.side,
            spec.direction.forward,
          );
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
        const lock = plantedFootLockRef.current;
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

        if (!shouldLock || !group.current || !leftFoot || !rightFoot) {
          const footLockOptions = resolveMovementAvatarFootLockOptions({ avatarRole });
          lock.strength = THREE.MathUtils.lerp(lock.strength, 0, footLockOptions.releaseSlerp);
          lock.correction.set(0, 0, 0);
          if (lock.strength < footLockOptions.minStrengthBeforeClear) {
            lock.left = null;
            lock.right = null;
          }
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

        const footLockOptions = resolveMovementAvatarFootLockOptions({ avatarRole });
        if (!lock.left || !lock.right || lock.strength < 0.12) {
          lock.left = currentLeft.clone();
          lock.right = currentRight.clone();
          lock.strength = footLockOptions.initialStrength;
          lock.correction.set(0, 0, 0);
          return;
        }

        lock.strength = THREE.MathUtils.lerp(lock.strength, 1, footLockOptions.engageSlerp);

        const targetMidpoint = lock.left.clone().add(lock.right).multiplyScalar(0.5);
        const currentMidpoint = currentLeft.clone().add(currentRight).multiplyScalar(0.5);
        const lateralCorrection = targetMidpoint.sub(currentMidpoint);
        const targetFloorY = Math.min(lock.left.y, lock.right.y);
        const currentFloorY = Math.min(currentLeft.y, currentRight.y);
        const verticalCorrection = targetFloorY - currentFloorY;
        footLockDrift = Math.max(
          currentLeft.distanceTo(lock.left),
          currentRight.distanceTo(lock.right),
        );

        if (footLockDrift > footLockOptions.maxDriftBeforeReset) {
          lock.left = currentLeft.clone();
          lock.right = currentRight.clone();
          lock.strength = footLockOptions.initialStrength;
          lock.correction.set(0, 0, 0);
          footLockCorrection = 0;
          return;
        }

        lock.correction.set(
          THREE.MathUtils.clamp(lateralCorrection.x, -0.075, 0.075),
          THREE.MathUtils.clamp(verticalCorrection, -0.05, 0.05),
          THREE.MathUtils.clamp(lateralCorrection.z, -0.075, 0.075),
        );

        const correctionScale = lock.strength * footLockOptions.correctionScale;
        group.current.position.addScaledVector(lock.correction, correctionScale);
        group.current.updateMatrixWorld(true);

        footLockCorrection = lock.correction.length() * correctionScale;
      };

      const easeInstructorFootToPlanted = (side: "left" | "right", factor = 0.62) => {
        if (usesPlayerMotionPath) return;
        easeBoneToRotation(`${side}Foot` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        easeBoneToRotation(`${side}Toes` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        footOwner = resolveMovementAvatarPlantedFootOwner(footOwner);
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
        UPPER_BODY_RECORDED_RETARGET_MAPPINGS.forEach((mapping) => {
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
          aimVector("rightUpperLeg", "rightLowerLeg", solverLms[24], rightKneeTarget, lowerBodyAimOptions.leg);
          aimVector("rightLowerLeg", "rightFoot", rightKneeTarget, rightAnkleTarget, lowerBodyAimOptions.leg);
          aimVector("leftUpperLeg", "leftLowerLeg", solverLms[23], leftKneeTarget, lowerBodyAimOptions.leg);
          aimVector("leftLowerLeg", "leftFoot", leftKneeTarget, leftAnkleTarget, lowerBodyAimOptions.leg);
          aimVector("rightFoot", "rightToes", solverLms[30], rightToeTarget, lowerBodyAimOptions.foot);
          aimVector("leftFoot", "leftToes", solverLms[29], leftToeTarget, lowerBodyAimOptions.foot);
        };

        const lowerBodyStageDecision = resolveMovementAvatarLowerBodyApplicationStage({
          avatarRole: usesPlayerMotionPath ? "player" : "instructor",
          instructorLowerBodyMotion,
          lowerBodyDrive,
          playerRetargetLowerBodyMotion,
          retargetSourceQuality: retargetFrame.debug.sourceQuality,
          sourceOwnerDecision: playerSourceOwnerDecision,
          shouldHoldPlayerSquatPose,
        });

        if (lowerBodyStageDecision.stage === "player-leg-raise" && lowerBodyStageDecision.anchoredPlayerLegRaiseSide) {
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
          LOWER_BODY_RETARGET_MAPPINGS.forEach((mapping) => {
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

      const leftEar = imageLms[7];
      const rightEar = imageLms[8];
      const nose = imageLms[0];

      if (leftEar && rightEar && nose) {
        const headNode = vrmRef.current.humanoid.getNormalizedBoneNode("head");
        if (headNode) {
          const { rawHead } = resolveMovementAvatarRawHeadDecision({
            poseLandmarks: imageLms,
            faceLandmarks: payload?.faceLandmarks,
          });
          const headDecision = resolveMovementAvatarHeadDecision({
            avatarRole: usesPlayerMotionPath ? "player" : "instructor",
            calibration: activeCalibration,
            headMotionIntent,
            profile: avatarTrackingProfile,
            rawHead,
          });
          const {
            appliedHead,
            headOwner,
            headPitch,
            headRoll,
            headYaw,
            shouldApplyHeadMotion,
            shouldApplyPlayerHeadMotion,
          } = headDecision;
          const headApplyOptions = resolveMovementAvatarHeadApplyOptions({
            avatarRole,
            profile: avatarTrackingProfile,
          });
          const worldEuler = new THREE.Euler(
            headPitch,
            headYaw + Math.PI,
            headRoll,
            "YXZ",
          );
          const targetWorldQuat = new THREE.Quaternion().setFromEuler(worldEuler);

          if (headNode.parent) {
            const parentWorldQ = new THREE.Quaternion();
            headNode.parent.getWorldQuaternion(parentWorldQ);
            const targetLocalQuat = parentWorldQ.invert().multiply(targetWorldQuat);
            headNode.quaternion.slerp(
              targetLocalQuat,
              headApplyOptions.headSlerp,
            );
          } else {
            headNode.quaternion.slerp(
              targetWorldQuat,
              headApplyOptions.headSlerp,
            );
          }

          const neckNode = vrmRef.current.humanoid.getNormalizedBoneNode("neck");
          if (shouldApplyHeadMotion && neckNode) {
            const neckTarget = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                headPitch * avatarTrackingProfile.neckPitchShare +
                  (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.12 : 0),
                headYaw * avatarTrackingProfile.neckYawShare +
                  (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
                headRoll * avatarTrackingProfile.neckRollShare -
                  (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
                "YXZ",
              ),
            );
            neckNode.quaternion.slerp(neckTarget, avatarTrackingProfile.neckSlerp);

            if (shouldApplyPlayerHeadMotion) {
              easeBonePosition(
                "head",
                new THREE.Vector3(
                  headMotionIntent.lateral * 0.025,
                  -headMotionIntent.vertical * 0.012,
                  -headMotionIntent.depth * 0.018,
                ),
                headApplyOptions.headPositionSlerp,
              );
            }
            if (shouldApplyPlayerHeadMotion && !shouldApplyLowerBody && !activeSpineDrive.shouldApplySpine) {
              easeBoneToRotation(
                "upperChest",
                {
                  x: headMotionIntent.depth * 0.1,
                  y: headMotionIntent.lateral * 0.06,
                  z: -headMotionIntent.lateral * 0.08,
                },
                headApplyOptions.upperChestCompensationSlerp,
              );
            }
          }

          if (trackingDebugRef) {
            const fallbackLabels = resolveMovementAvatarTrackingFallbackLabels({
              activeSpineOwner: activeSpineDrive.owner,
              armTargets,
              autoCalibrationKind: autoCalibrationKindRef.current,
              avatarRole: usesPlayerMotionPath ? "player" : "instructor",
              bodyConfidence,
              feetOwner: footOwner,
              hasActiveCalibration: Boolean(activeCalibration),
              hasManualCalibration: Boolean(trackingCalibration),
              headMotionIntent,
              headOwner,
              leftArmTrackingReady,
              leftFootSource: leftToeSelection.source,
              leftKneeSource: leftKneeSelection.source,
              lowerBodyIntent,
              lowerBodyOwner,
              lowerBodyTrackingReady,
              rawHead,
              rightArmTrackingReady,
              rightFootSource: rightToeSelection.source,
              rightKneeSource: rightKneeSelection.source,
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
              totalLowerBody: LOWER_BODY_RETARGET_MAPPINGS.length,
              totalUpperBody: UPPER_BODY_VISUAL_MAPPINGS.length,
            };

            trackingDebugRef.current = {
              updatedAt: performance.now(),
              headRaw: rawHead,
              headApplied: appliedHead,
              bodyConfidence,
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
          const handRigOptions = resolveVrmHandRigOptions({ isPlayer: usesPlayerMotionPath });
          const handLandmarks = prepareVrmHandLandmarks(handData, {
            mirrorX: handRigOptions.mirrorX,
          });
          const rig = solveVrmHand(handLandmarks, handednessStr) as HandRig | null;
          if (!rig) return;

          const applyHandRot = (vrmName: VrmBoneName, rigKey: string) => {
            const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(vrmName);
            const rot = rig[rigKey];
            if (bone && rot) {
              const isWrist = rigKey.endsWith("Wrist");
              if (isWrist) return;
              const isThumb = rigKey.includes("Thumb");
              const tunedRot = strengthenVrmHandRotation(rot, {
                isPlayer: handRigOptions.isPlayer,
                isWrist,
                isThumb,
              });
              const targetQ = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(tunedRot.x, tunedRot.y, tunedRot.z),
              );
              bone.quaternion.slerp(targetQ, handRigOptions.slerp);
            }
          };

          applyHandRot(`${side}Hand`, `${handednessStr}Wrist`);

          const fingers = ["Thumb", "Index", "Middle", "Ring", "Little"];
          const joints = ["Proximal", "Intermediate", "Distal"];

          fingers.forEach((finger) => {
            joints.forEach((joint) => {
              const vrmName = `${side}${finger}${joint}` as VrmBoneName;
              const rigKey = `${handednessStr}${finger}${joint}`;
              applyHandRot(vrmName, rigKey);
            });
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
