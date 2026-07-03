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
  resolveMovementAvatarRecordedSpineDrive,
  resolveMovementAvatarPlayerSpineDrive,
} from "../../../_lib/movementAvatarPlayerDrive";
import {
  isMovementAvatarLowerBodyTrackingReady,
  resolveMovementAvatarLowerBodyDrive,
} from "../../../_lib/movementAvatarLowerBody";
import {
  buildMovementRetargetSourceModel,
  getBalancedPlantedSquatDepth,
  getRecordedLowerBodySegmentMotionDepth,
  getRecordedSquatPresentationDepth,
  solveMovementRetargetFrame,
  type MovementRetargetSegmentName,
  type MovementRetargetSourceModel,
} from "../../../_lib/movementRetargeting";
import {
  applyHeadCalibration,
  averageMovementCalibrations,
  buildUpperBodyMovementAutoCalibration,
  buildUprightMovementAutoCalibration,
  estimateMovementHeadAngles,
  getCalibratedFloorCorrection,
  getMovementBodyConfidence,
  getMovementHeadMotionIntent,
  getMovementLowerBodyIntent,
  getNeutralMovementHeadAngles,
  selectMovementKneeTarget,
  selectMovementTrackingEndpoint,
  type MovementCalibration,
  type MovementHeadAngles,
  type MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";
import {
  createVrmImageSolverLandmarks,
  getVrmHandWristFallbackTarget,
  getVrmMotionLandmarks,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
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

type PlayerLowerBodyStabilityState = {
  squatPresentationDepth: number;
  visualRootDrop: number;
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
const LOWER_BODY_SOURCE_LANDMARKS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const RECORDED_LOWER_BODY_OUT_OF_FRAME_LIMIT = 3;

function getRecordedLowerBodySourceBounds(landmarks: Array<{ x: number; y: number } | undefined>) {
  let lowerOutOfFrameCount = 0;
  let maxY = 0;

  LOWER_BODY_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    maxY = Math.max(maxY, landmark.y);
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      lowerOutOfFrameCount += 1;
    }
  });

  return {
    lowerOutOfFrameCount,
    maxY,
    reliable:
      lowerOutOfFrameCount < RECORDED_LOWER_BODY_OUT_OF_FRAME_LIMIT &&
      maxY <= 1.08,
  };
}

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
  retargetFrame: ReturnType<typeof solveMovementRetargetFrame>;
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

function smoothPlayerLowerBodyValue(current: number, target: number, rise: number, fall: number) {
  const factor = target > current ? rise : fall;
  const next = THREE.MathUtils.lerp(current, target, factor);
  return target <= 0.001 && next < 0.025 ? 0 : next;
}

function smoothInstructorSquatDepth(current: number, sourceDepth: number) {
  const enterThreshold = current > 0.08 ? 0.08 : 0.2;
  const target = sourceDepth >= enterThreshold ? sourceDepth : 0;
  return smoothPlayerLowerBodyValue(current, target, 0.2, 0.1);
}

function resolveRecordedHeadAngles({
  profile,
  rawHead,
}: {
  profile: ReturnType<typeof getMovementAvatarTrackingProfile>;
  rawHead: MovementHeadAngles;
}): MovementHeadAngles {
  const poseOnlyHeadScale = rawHead.source === "pose"
    ? { pitch: 0.38, roll: 0.22, yaw: 0.28 }
    : { pitch: 0.72, roll: 0.48, yaw: 0.52 };

  return {
    pitch: THREE.MathUtils.clamp(
      rawHead.pitch * poseOnlyHeadScale.pitch + profile.headPitchOffset,
      Math.max(profile.minHeadPitch, -0.18),
      Math.min(profile.maxHeadPitch, 0.24),
    ),
    yaw: THREE.MathUtils.clamp(
      rawHead.yaw * poseOnlyHeadScale.yaw + profile.headYawOffset,
      -Math.min(profile.maxHeadYaw, 0.2),
      Math.min(profile.maxHeadYaw, 0.2),
    ),
    roll: THREE.MathUtils.clamp(
      rawHead.roll * poseOnlyHeadScale.roll + profile.headRollOffset,
      -Math.min(profile.maxHeadRoll, 0.12),
      Math.min(profile.maxHeadRoll, 0.12),
    ),
    confidence: rawHead.confidence,
    source: rawHead.source,
  };
}

type VrmAvatarProps = {
  landmarksRef: RefObject<VrmMotionRef>;
  positionOffset: [number, number, number];
  isPlayer?: boolean;
  isPlaying?: boolean;
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
  const autoCalibrationKindRef = useRef<"full-body" | "upper-body" | null>(null);
  const autoCalibrationSamplesRef = useRef<MovementCalibration[]>([]);
  const retargetAvatarRestRef = useRef<RetargetAvatarRestMap>({});
  const retargetSourceModelRef = useRef<MovementRetargetSourceModel | null>(null);
  const plantedFootLockRef = useRef<PlantedFootLockState>({
    correction: new THREE.Vector3(),
    left: null,
    right: null,
    strength: 0,
  });
  const playerLowerBodyStabilityRef = useRef<PlayerLowerBodyStabilityState>({
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  });
  const instructorLowerBodyStabilityRef = useRef<PlayerLowerBodyStabilityState>({
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  });
  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);

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
    if (isPlayer && trackingCalibration && !retargetSourceModel) {
      retargetSourceModelRef.current = null;
    }
  }, [isPlayer, retargetSourceModel, trackingCalibration]);

  useFrame((state, delta) => {
    if (!vrmRef.current || !group.current) return;
    vrmRef.current.update(delta);

      const applyDemoFallbackPose = (factor = isPlayer ? 0.18 : 0.12) => {
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
      isPlayer,
      isPlaying: isPlaying || showPausedPose,
    });

    let riggedPose: RiggedPose | null;
    try {
      riggedPose = solveVrmPose(kdSolverLms, imageLms);
    } catch {
      return;
    }

    if (riggedPose && vrmRef.current.humanoid) {
      const slerpFactor = isPlayer ? 0.5 : 0.3;

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

        const rawDir = new THREE.Vector3(vEnd.x - vStart.x, -(vEnd.y - vStart.y), -dz);
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
        const factor = isPlayer ? 0.12 : 0.08;
        easeBoneToRotation("rightUpperLeg", neutral, factor);
        easeBoneToRotation("rightLowerLeg", neutral, factor);
        easeBoneToRotation("leftUpperLeg", neutral, factor);
        easeBoneToRotation("leftLowerLeg", neutral, factor);
        easeBoneToRotation("rightFoot", neutral, factor);
        easeBoneToRotation("leftFoot", neutral, factor);
      };

      const easeArmToRelaxed = (side: "left" | "right") => {
        const factor = isPlayer ? 0.16 : 0.1;
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

      const easeHandToNeutral = (side: "left" | "right", factor = isPlayer ? 0.48 : 0.32) => {
        easeBoneToRotation(`${side}Hand` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
      };

      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");

      if (hipsNode && !baseHipsPositionRef.current) {
        baseHipsPositionRef.current = hipsNode.position.clone();
      }

      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

      const bodyConfidence = getMovementBodyConfidence(imageLms, rigHands);
      if (trackingCalibration) {
        autoCalibrationRef.current = null;
        autoCalibrationKindRef.current = null;
        autoCalibrationSamplesRef.current = [];
      }

      if (isPlayer && !trackingCalibration && !autoCalibrationRef.current) {
        const fullBodyAutoCalibrationSample = buildUprightMovementAutoCalibration({
          poseLandmarks: imageLms,
          faceLandmarks: payload?.faceLandmarks,
          now: Date.now(),
        });
        const upperBodyAutoCalibrationSample =
          fullBodyAutoCalibrationSample ??
          buildUpperBodyMovementAutoCalibration({
            poseLandmarks: imageLms,
            faceLandmarks: payload?.faceLandmarks,
            now: Date.now(),
          });
        const autoCalibrationSample = fullBodyAutoCalibrationSample ?? upperBodyAutoCalibrationSample;

        if (autoCalibrationSample) {
          autoCalibrationSamplesRef.current = [
            ...autoCalibrationSamplesRef.current,
            autoCalibrationSample,
          ].slice(-10);

          if (autoCalibrationSamplesRef.current.length >= 6) {
            autoCalibrationRef.current = averageMovementCalibrations(autoCalibrationSamplesRef.current);
            autoCalibrationKindRef.current = fullBodyAutoCalibrationSample
              ? "full-body"
              : "upper-body";
          }
        } else {
          autoCalibrationSamplesRef.current = autoCalibrationSamplesRef.current.slice(-3);
          if (autoCalibrationSamplesRef.current.length === 0) {
            autoCalibrationKindRef.current = null;
          }
        }
      }

      const activeCalibration = isPlayer
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
      const retargetFrame = solveMovementRetargetFrame({
        calibration: retargetSourceModelRef.current,
        poseLandmarks: imageLms,
      });
      const lowerBodyIntent = getMovementLowerBodyIntent({
        poseLandmarks: imageLms,
        calibration: activeCalibration,
      });
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
      let retargetAppliedUpperBody = 0;
      let plantedSquatIkDepth = 0;
      const rightArmTrackingReady =
        !isPlayer ||
        (
          bodyConfidence.rightShoulder >= avatarTrackingProfile.armVisibility &&
          bodyConfidence.rightElbow >= avatarTrackingProfile.armVisibility &&
          Math.max(bodyConfidence.rightWrist, bodyConfidence.rightHand) >= avatarTrackingProfile.armStoreVisibility
        );
      const leftArmTrackingReady =
        !isPlayer ||
        (
          bodyConfidence.leftShoulder >= avatarTrackingProfile.armVisibility &&
          bodyConfidence.leftElbow >= avatarTrackingProfile.armVisibility &&
          Math.max(bodyConfidence.leftWrist, bodyConfidence.leftHand) >= avatarTrackingProfile.armStoreVisibility
        );
      const recordedLowerBodySourceBounds = getRecordedLowerBodySourceBounds(imageLms);
      const rawLowerBodyTrackingReady = isMovementAvatarLowerBodyTrackingReady({
        bodyConfidence,
        isPlayer,
        lowerBodyIntent,
      });
      const recordedLowerBodySourceReliable = isPlayer || recordedLowerBodySourceBounds.reliable;
      const lowerBodyTrackingReady = rawLowerBodyTrackingReady && recordedLowerBodySourceReliable;
      const upperBodyTrackingReady =
        bodyConfidence.head >= 0.55 &&
        Math.min(bodyConfidence.leftShoulder, bodyConfidence.rightShoulder) >= 0.55;
      const torsoTrackingReady = !isPlayer || bodyConfidence.torso >= 0.45 || upperBodyTrackingReady;
      const shouldApplyLiveBody = isPlayer
        ? Boolean(activeCalibration)
        : Boolean(retargetSourceModelRef.current);
      const lowerBodyDrive = resolveMovementAvatarLowerBodyDrive({
        hasLiveBodyCalibration: shouldApplyLiveBody,
        isPlayer,
        lowerBodyIntent,
        lowerBodyTrackingReady,
        retargetContactsBothFeet: retargetFrame.contacts.leftFoot && retargetFrame.contacts.rightFoot,
        retargetSquatDepth: retargetFrame.squatDepth,
      });
      const playerSpineDrive = resolveMovementAvatarPlayerSpineDrive({
        calibration: activeCalibration,
        isPlayer,
        poseLandmarks: imageLms,
        torsoTrackingReady,
      });
      const recordedSpineDrive = resolveMovementAvatarRecordedSpineDrive({
        kneeLift: retargetFrame.kneeLift,
        poseLandmarks: imageLms,
        retargetCalibration: retargetSourceModelRef.current,
        torsoTrackingReady,
      });
      const activeSpineDrive = isPlayer ? playerSpineDrive : recordedSpineDrive;
      const liveSquatDepth = lowerBodyDrive.liveSquatDepth;
      const shouldApplyLowerBody = lowerBodyDrive.shouldApplyLowerBody && recordedLowerBodySourceReliable;
      const shouldApplySolverTorso =
        lowerBodyDrive.shouldApplySolverTorso ||
        (!isPlayer && torsoTrackingReady && retargetFrame.debug.sourceQuality >= 0.45);
      const torsoOwner = activeSpineDrive.shouldApplySpine
        ? activeSpineDrive.owner
        : shouldApplySolverTorso
          ? isPlayer ? "player-solver" : "recorded-solver"
          : "neutral";
      let playerSquatPresentationDepth = lowerBodyDrive.playerSquatPresentationDepth;
      const balancedPlantedSquatDepth = getBalancedPlantedSquatDepth(retargetFrame);
      const recordedSquatPresentationDepth = getRecordedSquatPresentationDepth(retargetFrame);
      const recordedLowerBodySegmentMotion = getRecordedLowerBodySegmentMotionDepth({
        calibration: retargetSourceModelRef.current,
        frame: retargetFrame,
      });
      let instructorSquatPresentationDepth = recordedSquatPresentationDepth;
      visualRootDrop = lowerBodyDrive.visualRootDrop;

      if (isPlayer) {
        const stability = playerLowerBodyStabilityRef.current;
        stability.squatPresentationDepth = smoothPlayerLowerBodyValue(
          stability.squatPresentationDepth,
          lowerBodyDrive.playerSquatPresentationDepth,
          lowerBodyDrive.shouldDrivePlayerSquat ? 0.34 : 0.18,
          0.32,
        );
        stability.visualRootDrop = smoothPlayerLowerBodyValue(
          stability.visualRootDrop,
          lowerBodyDrive.visualRootDrop,
          0.3,
          0.34,
        );
        playerSquatPresentationDepth = stability.squatPresentationDepth;
        visualRootDrop = stability.visualRootDrop;
      } else {
        const stability = instructorLowerBodyStabilityRef.current;
        stability.squatPresentationDepth = smoothInstructorSquatDepth(
          stability.squatPresentationDepth,
          recordedSquatPresentationDepth,
        );
        stability.visualRootDrop = smoothPlayerLowerBodyValue(
          stability.visualRootDrop,
          stability.squatPresentationDepth * 0.56,
          0.18,
          0.12,
        );
        instructorSquatPresentationDepth = stability.squatPresentationDepth;
        playerSquatPresentationDepth = instructorSquatPresentationDepth;
        visualRootDrop = stability.visualRootDrop;
      }
      const instructorLowerBodyMotion = Math.max(
        instructorSquatPresentationDepth,
        recordedLowerBodySegmentMotion,
        retargetFrame.kneeLift.left,
        retargetFrame.kneeLift.right,
      );
      const shouldHoldPlayerSquatPose =
        isPlayer &&
        shouldApplyLowerBody &&
        playerSquatPresentationDepth > 0.18;
      const playerRetargetLowerBodyMotion = Math.max(
        playerSquatPresentationDepth,
        retargetFrame.squatDepth,
        retargetFrame.kneeLift.left,
        retargetFrame.kneeLift.right,
      );

      if (forceStandby) {
        applyDemoFallbackPose(0.35);
        return;
      }

      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        AVATAR_BASE_Y - visualRootDrop,
        isPlayer ? 0.28 : 0.34,
      );

      const playerArmLms = isPlayer ? createVrmImageSolverLandmarks(imageLms) : solverLms;
      const rightHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.right, imageLms);
      const leftHandWristFallback = getVrmHandWristFallbackTarget(rigHands?.left, imageLms);
      const rightWristSelection = selectMovementTrackingEndpoint({
        poseTarget: isPlayer ? playerArmLms[16] : solverLms[16],
        secondaryTarget: isPlayer ? rightHandWristFallback : null,
        preferSecondaryWhenPoseBelow: 0.65,
      });
      const leftWristSelection = selectMovementTrackingEndpoint({
        poseTarget: isPlayer ? playerArmLms[15] : solverLms[15],
        secondaryTarget: isPlayer ? leftHandWristFallback : null,
        preferSecondaryWhenPoseBelow: 0.65,
      });
      const rightWristTarget =
        (rightWristSelection.target as VrmSolverLandmark | null) ??
        (isPlayer ? playerArmLms[16] : solverLms[16]);
      const leftWristTarget =
        (leftWristSelection.target as VrmSolverLandmark | null) ??
        (isPlayer ? playerArmLms[15] : solverLms[15]);
      const playerSafeArmZScale = isPlayer
        ? (lowerBodyDrive.shouldDrivePlayerSquat ? 0.32 : 0)
        : undefined;
      const rightKneeSelection = selectMovementKneeTarget({
        hip: solverLms[24],
        knee: solverLms[26],
        ankle: solverLms[28],
        side: "right",
      });
      const leftKneeSelection = selectMovementKneeTarget({
        hip: solverLms[23],
        knee: solverLms[25],
        ankle: solverLms[27],
        side: "left",
      });
      const rightAnkleSelection = selectMovementTrackingEndpoint({
        poseTarget: solverLms[28],
        poseVisibilityThreshold: isPlayer ? 0.18 : 0.2,
      });
      const leftAnkleSelection = selectMovementTrackingEndpoint({
        poseTarget: solverLms[27],
        poseVisibilityThreshold: isPlayer ? 0.18 : 0.2,
      });
      const rightToeSelection = selectMovementTrackingEndpoint({
        poseTarget: solverLms[32],
        poseVisibilityThreshold: isPlayer ? 0.18 : 0.2,
      });
      const leftToeSelection = selectMovementTrackingEndpoint({
        poseTarget: solverLms[31],
        poseVisibilityThreshold: isPlayer ? 0.18 : 0.2,
      });
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
        if (!vrm || !segment || segment.confidence < 0.3) return false;
        const presentationSquatDepth = isPlayer
          ? retargetFrame.squatDepth
          : instructorSquatPresentationDepth;
        const activeFootMotion = Math.max(
          presentationSquatDepth,
          recordedLowerBodySegmentMotion,
          retargetFrame.kneeLift.left,
          retargetFrame.kneeLift.right,
        );
        if (!isPlayer && mapping.type === "foot" && activeFootMotion < 0.22) return false;
        if (!isPlayer && mapping.type === "foot") {
          const isLeftFoot = mapping.segment === "leftFoot";
          const isPlanted = isLeftFoot
            ? retargetFrame.contacts.leftFoot
            : retargetFrame.contacts.rightFoot;
          const kneeLift = isLeftFoot
            ? retargetFrame.kneeLift.left
            : retargetFrame.kneeLift.right;
          if (isPlanted || kneeLift < 0.45) return false;
        }

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
          payload?.worldLandmarks ? 1 : 0.18,
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
        const slerp = mapping.type === "foot"
          ? (isPlayer ? avatarTrackingProfile.footSlerp : 0.36)
          : mapping.type === "arm"
            ? mapping.bone.includes("UpperArm")
              ? (isPlayer ? avatarTrackingProfile.upperArmSlerp : 0.72)
              : (isPlayer ? avatarTrackingProfile.lowerArmSlerp : 0.78)
            : mapping.type === "spine"
              ? (isPlayer ? 0.32 : 0.66)
              : (isPlayer ? avatarTrackingProfile.legSlerp : 0.42);

        bone.quaternion.slerp(targetLocalQuaternion, slerp);
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
        const ikDepth = THREE.MathUtils.smoothstep(depth, 0.16, 0.82);
        if (ikDepth <= 0.001) return 0;

        const down = new THREE.Vector3(0, -1, 0);
        const side = new THREE.Vector3(1, 0, 0);
        const forward = new THREE.Vector3(0, 0, 1);
        if (group.current) {
          group.current.getWorldDirection(forward).normalize();
        }

        const kneeOut = 0.3 * ikDepth;
        const kneeForward = 0.86 * ikDepth;
        const ankleBack = 0.4 * ikDepth;
        const thighDown = 0.72 - ikDepth * 0.2;
        const shinDown = 0.8 - ikDepth * 0.12;
        const footBrace = 0.18 * ikDepth;
        const legSlerp = isPlayer ? 0.76 : 0.66;
        const footSlerp = isPlayer ? 0.42 : 0.34;
        let applied = 0;

        const makeDirection = (
          vertical: number,
          sideAmount: number,
          forwardAmount: number,
        ) => down.clone()
          .multiplyScalar(vertical)
          .add(side.clone().multiplyScalar(sideAmount))
          .add(forward.clone().multiplyScalar(forwardAmount))
          .normalize();

        const rightThigh = makeDirection(thighDown, -kneeOut, kneeForward);
        const leftThigh = makeDirection(thighDown, kneeOut, kneeForward);
        const rightShin = makeDirection(shinDown, kneeOut * 0.38, -ankleBack);
        const leftShin = makeDirection(shinDown, -kneeOut * 0.38, -ankleBack);
        const rightFoot = new THREE.Vector3(-footBrace * 0.2, -0.08, 1).normalize();
        const leftFoot = new THREE.Vector3(footBrace * 0.2, -0.08, 1).normalize();

        if (applyRestMappedWorldDirection("rightUpperLeg", rightThigh, legSlerp)) applied += 1;
        if (applyRestMappedWorldDirection("leftUpperLeg", leftThigh, legSlerp)) applied += 1;
        if (applyRestMappedWorldDirection("rightLowerLeg", rightShin, legSlerp)) applied += 1;
        if (applyRestMappedWorldDirection("leftLowerLeg", leftShin, legSlerp)) applied += 1;
        if (applyRestMappedWorldDirection("rightFoot", rightFoot, footSlerp)) applied += 1;
        if (applyRestMappedWorldDirection("leftFoot", leftFoot, footSlerp)) applied += 1;

        return applied > 0 ? ikDepth : 0;
      };

      const applyPlantedFootLock = ({
        leftFoot,
        rightFoot,
      }: {
        leftFoot: THREE.Object3D | null;
        rightFoot: THREE.Object3D | null;
      }) => {
        const lock = plantedFootLockRef.current;
        const shouldLock = Boolean(
          group.current &&
          leftFoot &&
          rightFoot &&
          lowerBodyTrackingReady &&
          shouldApplyLowerBody &&
          retargetFrame.contacts.leftFoot &&
          retargetFrame.contacts.rightFoot &&
          retargetFrame.debug.sourceQuality >= 0.45,
        );

        if (!shouldLock || !group.current || !leftFoot || !rightFoot) {
          lock.strength = THREE.MathUtils.lerp(lock.strength, 0, 0.28);
          lock.correction.set(0, 0, 0);
          if (lock.strength < 0.04) {
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

        if (!lock.left || !lock.right || lock.strength < 0.12) {
          lock.left = currentLeft.clone();
          lock.right = currentRight.clone();
          lock.strength = 0.25;
          lock.correction.set(0, 0, 0);
          return;
        }

        lock.strength = THREE.MathUtils.lerp(lock.strength, 1, 0.32);

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

        if (footLockDrift > 0.55) {
          lock.left = currentLeft.clone();
          lock.right = currentRight.clone();
          lock.strength = 0.25;
          lock.correction.set(0, 0, 0);
          footLockCorrection = 0;
          return;
        }

        lock.correction.set(
          THREE.MathUtils.clamp(lateralCorrection.x, -0.075, 0.075),
          THREE.MathUtils.clamp(verticalCorrection, -0.05, 0.05),
          THREE.MathUtils.clamp(lateralCorrection.z, -0.075, 0.075),
        );

        const correctionScale = lock.strength * (isPlayer ? 0.4 : 0.5);
        group.current.position.addScaledVector(lock.correction, correctionScale);
        group.current.updateMatrixWorld(true);

        footLockCorrection = lock.correction.length() * correctionScale;
      };

      const easeInstructorFootToPlanted = (side: "left" | "right", factor = 0.62) => {
        if (isPlayer) return;
        easeBoneToRotation(`${side}Foot` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        easeBoneToRotation(`${side}Toes` as VrmBoneName, { x: 0, y: 0, z: 0 }, factor);
        footOwner = footOwner.includes("planted-flat")
          ? footOwner
          : footOwner === "neutral"
            ? "planted-flat"
            : `${footOwner}+planted-flat`;
      };

      const applySquatFlexionPose = (depth: number) => {
        const flexDepth = THREE.MathUtils.smoothstep(depth, 0.1, 0.92);
        if (flexDepth <= 0.001) return;

        const bendBoost = avatarTrackingProfile.squatLegBendBoost ?? 0.32;
        const upperLegPitch = (1.76 + bendBoost * 1.15) * flexDepth;
        const lowerLegPitch = -(2.12 + bendBoost * 1.15) * flexDepth;
        const footPitch = 0.72 * flexDepth;
        const kneeOut = 0.12 * flexDepth;
        const factor = isPlayer ? 0.84 : 0.62;

        easeBoneToRotation(
          "rightUpperLeg",
          { x: upperLegPitch, y: 0, z: -kneeOut },
          factor,
        );
        easeBoneToRotation(
          "leftUpperLeg",
          { x: upperLegPitch, y: 0, z: kneeOut },
          factor,
        );
        easeBoneToRotation(
          "rightLowerLeg",
          { x: lowerLegPitch, y: 0, z: kneeOut * 0.35 },
          factor,
        );
        easeBoneToRotation(
          "leftLowerLeg",
          { x: lowerLegPitch, y: 0, z: -kneeOut * 0.35 },
          factor,
        );
        easeBoneToRotation("rightFoot", { x: footPitch, y: 0, z: 0 }, factor * 0.75);
        easeBoneToRotation("leftFoot", { x: footPitch, y: 0, z: 0 }, factor * 0.75);
      };

      const applySingleLegRaisePose = (side: "left" | "right", depth: number) => {
        const liftDepth = THREE.MathUtils.smoothstep(depth, 0.12, 0.9);
        if (liftDepth <= 0.001) return;

        const raisedUpperLeg = `${side}UpperLeg` as VrmBoneName;
        const raisedLowerLeg = `${side}LowerLeg` as VrmBoneName;
        const raisedFoot = `${side}Foot` as VrmBoneName;
        const plantedSide = side === "left" ? "right" : "left";
        const plantedUpperLeg = `${plantedSide}UpperLeg` as VrmBoneName;
        const plantedLowerLeg = `${plantedSide}LowerLeg` as VrmBoneName;
        const plantedFoot = `${plantedSide}Foot` as VrmBoneName;
        const kneeOut = side === "left" ? 0.08 : -0.08;
        const factor = isPlayer ? 0.72 : 0.58;

        easeBoneToRotation(
          raisedUpperLeg,
          { x: 1.18 * liftDepth, y: 0.05 * liftDepth, z: kneeOut * liftDepth },
          factor,
        );
        easeBoneToRotation(
          raisedLowerLeg,
          { x: -0.72 * liftDepth, y: 0, z: -kneeOut * 0.35 * liftDepth },
          factor,
        );
        easeBoneToRotation(raisedFoot, { x: 0.18 * liftDepth, y: 0, z: 0 }, factor * 0.72);
        easeBoneToRotation(plantedUpperLeg, { x: 0, y: 0, z: 0 }, 0.28);
        easeBoneToRotation(plantedLowerLeg, { x: 0, y: 0, z: 0 }, 0.28);
        easeBoneToRotation(plantedFoot, { x: 0, y: 0, z: 0 }, 0.32);
      };

      const rp = riggedPose;

      const applySolvedLowerBodyPose = (depth: number) => {
        const flexDepth = THREE.MathUtils.smoothstep(depth, 0.08, 0.88);
        if (flexDepth <= 0.001) return;

        const factor = isPlayer ? 0.62 : 0.54;
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

      if (activeSpineDrive.shouldApplySpine) {
        easeBoneToRotation("hips", activeSpineDrive.rotations.hips, isPlayer ? 0.22 : 0.36);
        easeBoneToRotation("spine", activeSpineDrive.rotations.spine, isPlayer ? 0.44 : 0.82);
        easeBoneToRotation("chest", activeSpineDrive.rotations.chest, isPlayer ? 0.42 : 0.78);
        easeBoneToRotation("upperChest", activeSpineDrive.rotations.upperChest, isPlayer ? 0.36 : 0.72);
      } else if (torsoTrackingReady && shouldApplySolverTorso) {
        const solverHipRotation = isPlayer
          ? rp.Hips?.rotation
          : mirrorRecordedTorsoRotation(rp.Hips?.rotation);
        const solverSpineRotation = isPlayer
          ? rp.Spine
          : mirrorRecordedTorsoRotation(rp.Spine);

        applyRot("hips", solverHipRotation, isPlayer ? 0.34 : 0.26, {
          limits: { x: 0.35, y: 0.75, z: 0.45 },
        });
        applyRot("spine", solverSpineRotation, isPlayer ? 0.42 : 0.28, {
          limits: { x: 0.45, y: 0.65, z: 0.45 },
          scale: 0.65,
        });
        applyRot("chest", solverSpineRotation, isPlayer ? 0.36 : 0.24, {
          limits: { x: 0.35, y: 0.5, z: 0.35 },
          scale: 0.35,
        });
        applyRot("upperChest", solverSpineRotation, isPlayer ? 0.32 : 0.22, {
          limits: { x: 0.25, y: 0.35, z: 0.25 },
          scale: 0.2,
        });
      } else {
        easeBoneToRotation("hips", { x: 0, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("spine", { x: 0.02, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("chest", { x: 0.02, y: 0, z: 0 }, 0.14);
        easeBoneToRotation("upperChest", { x: 0.01, y: 0, z: 0 }, 0.14);
      }

      if (rightArmTrackingReady) {
        aimVector("rightUpperArm", "rightLowerArm", playerArmLms[12], playerArmLms[14], {
          minVectorLengthSq: 0.00002,
          slerpOverride: isPlayer ? avatarTrackingProfile.upperArmSlerp : 0.42,
          storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.armStoreVisibility : 0.6,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.armVisibility : 0.2,
          zScale: playerSafeArmZScale,
        });
        aimVector("rightLowerArm", "rightHand", playerArmLms[14], rightWristTarget, {
          minVectorLengthSq: 0.00002,
          slerpOverride: isPlayer ? avatarTrackingProfile.lowerArmSlerp : 0.45,
          storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.armStoreVisibility : 0.6,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.armVisibility : 0.2,
          zScale: playerSafeArmZScale,
        });
        easeHandToNeutral("right");
      } else {
        easeArmToRelaxed("right");
      }

      if (leftArmTrackingReady) {
        aimVector("leftUpperArm", "leftLowerArm", playerArmLms[11], playerArmLms[13], {
          minVectorLengthSq: 0.00002,
          slerpOverride: isPlayer ? avatarTrackingProfile.upperArmSlerp : 0.42,
          storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.armStoreVisibility : 0.6,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.armVisibility : 0.2,
          zScale: playerSafeArmZScale,
        });
        aimVector("leftLowerArm", "leftHand", playerArmLms[13], leftWristTarget, {
          minVectorLengthSq: 0.00002,
          slerpOverride: isPlayer ? avatarTrackingProfile.lowerArmSlerp : 0.45,
          storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.armStoreVisibility : 0.6,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.armVisibility : 0.2,
          zScale: playerSafeArmZScale,
        });
        easeHandToNeutral("left");
      } else {
        easeArmToRelaxed("left");
      }

      if (!isPlayer && activeSpineDrive.shouldApplySpine) {
        retargetAppliedUpperBody += 1;
      }

      if (!isPlayer && retargetFrame.debug.sourceQuality >= 0.45) {
        UPPER_BODY_RECORDED_RETARGET_MAPPINGS.forEach((mapping) => {
          if (!applyRetargetSegment(mapping)) return;
          retargetAppliedUpperBody += 1;
        });
      }

      if ((lowerBodyTrackingReady || shouldHoldPlayerSquatPose) && shouldApplyLowerBody) {
        const legAimOptions: AimVectorOptions = {
          minVectorLengthSq: 0.00002,
          slerpOverride: isPlayer ? avatarTrackingProfile.legSlerp : 0.36,
          storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.legStoreVisibility : 0.6,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.legVisibility : 0.2,
        };
        const footAimOptions: AimVectorOptions = {
          ...legAimOptions,
          slerpOverride: isPlayer ? avatarTrackingProfile.footSlerp : 0.32,
          visibilityThreshold: isPlayer ? avatarTrackingProfile.footVisibility : 0.2,
        };
        const applyLegacyLowerBodyAim = () => {
          aimVector("rightUpperLeg", "rightLowerLeg", solverLms[24], rightKneeTarget, legAimOptions);
          aimVector("rightLowerLeg", "rightFoot", rightKneeTarget, rightAnkleTarget, legAimOptions);
          aimVector("leftUpperLeg", "leftLowerLeg", solverLms[23], leftKneeTarget, legAimOptions);
          aimVector("leftLowerLeg", "leftFoot", leftKneeTarget, leftAnkleTarget, legAimOptions);
          aimVector("rightFoot", "rightToes", solverLms[30], rightToeTarget, footAimOptions);
          aimVector("leftFoot", "leftToes", solverLms[29], leftToeTarget, footAimOptions);
        };

        const playerLegRaiseOwner =
          isPlayer &&
          lowerBodyDrive.shouldDrivePlayerLegRaise &&
          lowerBodyDrive.playerLegRaiseSide
            ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
            : null;
        const canUsePlayerRetargetLegRaise =
          isPlayer &&
          lowerBodyDrive.shouldDrivePlayerLegRaise &&
          retargetFrame.debug.sourceQuality >= 0.65 &&
          retargetFrame.debug.solvedSegments.length >= 8;

        if (
          isPlayer &&
          lowerBodyDrive.shouldDrivePlayerLegRaise &&
          lowerBodyDrive.playerLegRaiseSide &&
          !canUsePlayerRetargetLegRaise
        ) {
          lowerBodyOwner = playerLegRaiseOwner ?? "player-leg-raise";
          applySingleLegRaisePose(
            lowerBodyDrive.playerLegRaiseSide,
            lowerBodyDrive.playerLegRaiseDepth,
          );
        } else if (isPlayer && (lowerBodyDrive.shouldDrivePlayerSquat || shouldHoldPlayerSquatPose)) {
          lowerBodyOwner = lowerBodyDrive.shouldDrivePlayerSquat
            ? "player-stable-squat"
            : "player-stable-squat-held";
          footOwner = "recorded-retarget";
          const stableIkDepth = applyPlantedSquatIk(playerSquatPresentationDepth);
          plantedSquatIkDepth = stableIkDepth;
          applySquatFlexionPose(playerSquatPresentationDepth);
          if (playerSquatPresentationDepth <= 0.16) {
            easeLowerBodyToNeutral();
          }
        } else if (isPlayer && playerRetargetLowerBodyMotion < 0.16) {
          lowerBodyOwner = retargetFrame.debug.sourceQuality >= 0.65
            ? "player-retarget"
            : "player-lower-body-neutral";
          easeLowerBodyToNeutral();
        } else if (!isPlayer && instructorLowerBodyMotion < 0.08) {
          lowerBodyOwner = "recorded-neutral";
          easeLowerBodyToNeutral();
          easeInstructorFootToPlanted("right");
          easeInstructorFootToPlanted("left");
        } else {
          vrmRef.current.scene.updateMatrixWorld(true);
          LOWER_BODY_RETARGET_MAPPINGS.forEach((mapping) => {
            if (!applyRetargetSegment(mapping)) return;
            retargetAppliedLowerBody += 1;
            if (mapping.type === "leg") retargetAppliedLegs += 1;
            if (mapping.type === "foot") footOwner = "recorded-retarget";
          });

          const retargetOwnsLowerBody =
            retargetAppliedLegs >= 4 &&
            retargetFrame.debug.sourceQuality >= 0.45;
          const shouldUseLegacyLowerBody = !retargetOwnsLowerBody;
          const shouldUseRecordedSquatPresentation =
            !isPlayer &&
            instructorSquatPresentationDepth > 0.18 &&
            balancedPlantedSquatDepth === 0;
          lowerBodyOwner = playerLegRaiseOwner ?? (retargetOwnsLowerBody
            ? (isPlayer ? "player-retarget" : "recorded-retarget")
            : retargetAppliedLowerBody > 0
              ? "retarget-legacy-fallback"
              : "legacy-fallback");

          if (retargetAppliedLowerBody < 4) {
            applyLegacyLowerBodyAim();
          }

          if (shouldUseLegacyLowerBody) {
            applySolvedLowerBodyPose(isPlayer ? liveSquatDepth : instructorSquatPresentationDepth);
          }
          plantedSquatIkDepth = isPlayer
            ? applyPlantedSquatIk(playerSquatPresentationDepth)
            : shouldUseLegacyLowerBody && balancedPlantedSquatDepth > 0
              ? applyPlantedSquatIk(instructorSquatPresentationDepth)
              : 0;
          if (shouldUseLegacyLowerBody || shouldUseRecordedSquatPresentation) {
            applySquatFlexionPose(playerSquatPresentationDepth);
          }
          if (!isPlayer && retargetFrame.contacts.rightFoot) {
            easeInstructorFootToPlanted("right");
          }
          if (!isPlayer && retargetFrame.contacts.leftFoot) {
            easeInstructorFootToPlanted("left");
          }
        }
      } else {
        if (!isPlayer && !recordedLowerBodySourceReliable) {
          lowerBodyOwner = "recorded-source-limited";
          footOwner = "recorded-source-limited";
        }
        easeLowerBodyToNeutral();
      }

      const leftEar = imageLms[7];
      const rightEar = imageLms[8];
      const nose = imageLms[0];

      if (leftEar && rightEar && nose) {
        const headNode = vrmRef.current.humanoid.getNormalizedBoneNode("head");
        if (headNode) {
          const rawHead = estimateMovementHeadAngles({
            poseLandmarks: imageLms,
            faceLandmarks: isPlayer ? payload?.faceLandmarks : null,
          });
          const recordedHeadTrackingReady =
            !isPlayer &&
            rawHead.source === "face" &&
            rawHead.confidence >= 0.35;
          const appliedHead = isPlayer && activeCalibration
            ? applyHeadCalibration({
                rawHead,
                calibration: activeCalibration,
                profile: avatarTrackingProfile,
              })
            : recordedHeadTrackingReady
              ? resolveRecordedHeadAngles({
                  profile: avatarTrackingProfile,
                  rawHead,
                })
              : getNeutralMovementHeadAngles(avatarTrackingProfile);
          const shouldApplyPlayerHeadMotion = isPlayer && Boolean(activeCalibration);
          const shouldApplyHeadMotion = shouldApplyPlayerHeadMotion || recordedHeadTrackingReady;
          const headOwner = shouldApplyPlayerHeadMotion
            ? "player-calibrated"
            : recordedHeadTrackingReady
              ? `recorded-${rawHead.source}`
              : "neutral";
          const headPitch = appliedHead.pitch + (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.22 : 0);
          const headYaw = appliedHead.yaw + (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.18 : 0);
          const headRoll = appliedHead.roll + (shouldApplyPlayerHeadMotion ? -headMotionIntent.lateral * 0.16 : 0);
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
              isPlayer ? avatarTrackingProfile.headSlerp : 0.82,
            );
          } else {
            headNode.quaternion.slerp(
              targetWorldQuat,
              isPlayer ? avatarTrackingProfile.headSlerp : 0.82,
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
                0.3,
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
                0.18,
              );
            }
          }

          if (trackingDebugRef) {
            const lowerBodyLabel = isPlayer
              ? activeCalibration === trackingCalibration
                ? lowerBodyIntent.label
                : `${lowerBodyIntent.label}-auto`
              : "recorded";
            const lowerBodyDebugLabel = `${lowerBodyLabel} d${lowerBodyIntent.squatDepth.toFixed(2)} h${lowerBodyIntent.squatSignals.hipDrop.toFixed(2)} k${lowerBodyIntent.squatSignals.kneeBend.toFixed(2)} t${lowerBodyIntent.squatSignals.torsoDrop.toFixed(2)} l${lowerBodyIntent.leftKneeRaise.toFixed(2)} r${lowerBodyIntent.rightKneeRaise.toFixed(2)}`;
            const ownerDebugLabel = `head ${headOwner}; torso ${torsoOwner}; lower ${lowerBodyOwner}; feet ${footOwner}`;

            const totalRetargetSegments =
              retargetFrame.debug.solvedSegments.length + retargetFrame.debug.heldSegments.length;
            const retargetDebug: NonNullable<MovementTrackingDebugState["retarget"]> = {
              appliedLowerBody: retargetAppliedLowerBody,
              appliedUpperBody: retargetAppliedUpperBody,
              footLockCorrection,
              footLockDrift,
              footLockStrength: plantedFootLockRef.current.strength,
              hipDrop: retargetFrame.hipDrop,
              leftFootContact: retargetFrame.contacts.leftFoot,
              leftKneeLift: retargetFrame.kneeLift.left,
              lowerBodySegmentMotion: recordedLowerBodySegmentMotion,
              plantedSquatIkDepth,
              rightFootContact: retargetFrame.contacts.rightFoot,
              rightKneeLift: retargetFrame.kneeLift.right,
              solvedSegments: retargetFrame.debug.solvedSegments.length,
              sourceQuality: retargetFrame.debug.sourceQuality,
              squatDepth: liveSquatDepth,
              totalLowerBody: LOWER_BODY_RETARGET_MAPPINGS.length,
              totalUpperBody: UPPER_BODY_VISUAL_MAPPINGS.length,
              totalSegments: totalRetargetSegments,
              visualRootDrop,
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
                baseline: trackingCalibration
                  ? "manual-calibration"
                  : activeCalibration
                    ? `${autoCalibrationKindRef.current ?? "auto"}-auto-baseline`
                    : "none",
                head: trackingCalibration
                  ? (rawHead.confidence > 0.25 ? rawHead.source : "last-good")
                  : activeCalibration
                    ? `${rawHead.confidence > 0.25 ? rawHead.source : "last-good"}-auto`
                    : "neutral",
                headMotion: activeCalibration ? headMotionIntent.label : "uncalibrated",
                spine: activeSpineDrive.owner,
                armDepth: isPlayer ? "player-2d-safe-arms" : "recorded-depth-arms",
                rightArm: rightArmTrackingReady ? rightWristSelection.source : "relaxed-arm",
                leftArm: leftArmTrackingReady ? leftWristSelection.source : "relaxed-arm",
                rightKnee: lowerBodyTrackingReady && shouldApplyLowerBody ? rightKneeSelection.source : "neutral-stance",
                leftKnee: lowerBodyTrackingReady && shouldApplyLowerBody ? leftKneeSelection.source : "neutral-stance",
                rightFoot: lowerBodyTrackingReady && shouldApplyLowerBody ? rightToeSelection.source : "neutral-stance",
                leftFoot: lowerBodyTrackingReady && shouldApplyLowerBody ? leftToeSelection.source : "neutral-stance",
                floor: lowerBodyTrackingReady && shouldApplyLowerBody && (bodyConfidence.leftFoot > 0.35 || bodyConfidence.rightFoot > 0.35)
                  ? isPlayer
                    ? activeCalibration === trackingCalibration ? "calibrated-floor" : "auto-floor"
                    : "recorded-floor"
                  : "fixed-floor",
                lowerBody: lowerBodyTrackingReady && shouldApplyLowerBody
                  ? lowerBodyDebugLabel
                  : "neutral-stance",
                owners: ownerDebugLabel,
                retarget: `q${retargetDebug.sourceQuality.toFixed(2)} s${retargetDebug.squatDepth.toFixed(2)} hip${retargetDebug.hipDrop.toFixed(2)} seg${retargetDebug.lowerBodySegmentMotion.toFixed(2)} knee ${retargetDebug.leftKneeLift.toFixed(2)}/${retargetDebug.rightKneeLift.toFixed(2)} feet ${retargetDebug.leftFootContact ? "L" : "-"}${retargetDebug.rightFootContact ? "R" : "-"} bones ${retargetDebug.solvedSegments}/${retargetDebug.totalSegments} upper ${retargetDebug.appliedUpperBody}/${retargetDebug.totalUpperBody} lower ${retargetDebug.appliedLowerBody}/${retargetDebug.totalLowerBody} drop ${retargetDebug.visualRootDrop.toFixed(2)} ik ${retargetDebug.plantedSquatIkDepth.toFixed(2)}`,
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
        const calibratedFloorCorrection = isPlayer
          ? getCalibratedFloorCorrection({
              calibration: activeCalibration,
              currentFloorY,
              floorConfidence,
              profile: avatarTrackingProfile,
            })
          : 0;

        if (lowerBodyTrackingReady && shouldApplyLowerBody) {
          const squatHipDropScale = isPlayer && lowerBodyDrive.shouldDrivePlayerSquat
            ? 0.78
            : avatarTrackingProfile.squatHipDropScale ?? 0.38;
          const squatHipDropLimit = isPlayer && lowerBodyDrive.shouldDrivePlayerSquat
            ? 0.88
            : avatarTrackingProfile.squatHipDropLimit ?? 0.42;
          const squatDrop = Math.min(
            squatHipDropLimit,
            playerSquatPresentationDepth * squatHipDropScale,
          );
          targetHipsY -= squatDrop;
        }

        hipsNode.position.y = THREE.MathUtils.lerp(
          hipsNode.position.y,
          targetHipsY,
          isPlayer ? 0.38 : 0.48,
        );

        if (leftFoot && rightFoot && lowerBodyTrackingReady && shouldApplyLowerBody) {
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
          hipsNode.position.y += clampedCorrection * (isPlayer ? 0.7 : 0.86);
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
        trackingDebugRef.current.fallbacks.retarget +=
          ` lock ${plantedFootLockRef.current.strength.toFixed(2)}` +
          ` corr ${footLockCorrection.toFixed(2)}` +
          ` drift ${footLockDrift.toFixed(2)}`;
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
          const handLandmarks = prepareVrmHandLandmarks(handData, { mirrorX: !isPlayer });
          const rig = solveVrmHand(handLandmarks, handednessStr) as HandRig | null;
          if (!rig) return;

          const applyHandRot = (vrmName: VrmBoneName, rigKey: string) => {
            const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(vrmName);
            const rot = rig[rigKey];
            if (bone && rot) {
              const isWrist = rigKey.endsWith("Wrist");
              if (isWrist) return;
              const isThumb = rigKey.includes("Thumb");
              const tunedRot = strengthenVrmHandRotation(rot, { isPlayer, isWrist, isThumb });
              const targetQ = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(tunedRot.x, tunedRot.y, tunedRot.z),
              );
              bone.quaternion.slerp(targetQ, isPlayer ? 0.85 : 0.55);
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
