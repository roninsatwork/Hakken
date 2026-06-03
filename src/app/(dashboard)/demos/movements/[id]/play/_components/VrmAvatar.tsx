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
  applyHeadCalibration,
  estimateMovementHeadAngles,
  getCalibratedFloorCorrection,
  getMovementBodyConfidence,
  getNeutralMovementHeadAngles,
  selectMovementKneeTarget,
  selectMovementTrackingEndpoint,
  type MovementCalibration,
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

type VrmAvatarProps = {
  landmarksRef: RefObject<VrmMotionRef>;
  positionOffset: [number, number, number];
  isPlayer?: boolean;
  isPlaying?: boolean;
  trackingCalibration?: MovementCalibration | null;
  trackingDebugRef?: MutableRefObject<MovementTrackingDebugState | null>;
  vrmUrl: string;
  name: string;
};

export default function VrmAvatar({
  landmarksRef,
  positionOffset,
  isPlayer = false,
  isPlaying = true,
  trackingCalibration = null,
  trackingDebugRef,
  vrmUrl,
  name,
}: VrmAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});
  const avatarTrackingProfile = getMovementAvatarTrackingProfile(vrmUrl);
  const avatarTrackingProfileName = getMovementAvatarTrackingProfileName(vrmUrl);

  const urlToLoad = isPlayer ? `${vrmUrl}?player` : vrmUrl;

  const gltf = useLoader(GLTFLoader, urlToLoad, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as unknown as LoaderPlugin);
  });
  const loadedVrm = gltf.userData.vrm as VRM | undefined;
  const avatarScene = loadedVrm?.scene ?? gltf.scene;

  useEffect(() => {
    if (loadedVrm) {
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      vrmRef.current = loadedVrm;
    }
  }, [gltf.scene, loadedVrm]);

  useFrame((state, delta) => {
    if (!vrmRef.current || !group.current) return;
    vrmRef.current.update(delta);

    const motionRef = landmarksRef.current;
    const payload = motionRef && !Array.isArray(motionRef) ? motionRef : null;
    const raw = getVrmMotionLandmarks(motionRef);
    if (!raw || raw.length < 33) return;

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
      isPlaying,
    });

    let riggedPose: RiggedPose | null;
    try {
      riggedPose = solveVrmPose(kdSolverLms, imageLms);
    } catch {
      return;
    }

    if (riggedPose && vrmRef.current.humanoid) {
      const slerpFactor = isPlayer ? 0.5 : 0.3;

      const applyRot = (boneName: VrmBoneName, euler?: RigRotation, overrideFactor?: number) => {
        if (!euler) return;
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);
        if (bone) {
          const rotationOrder = (euler.rotationOrder || "XYZ") as THREE.EulerOrder;
          const targetEuler = new THREE.Euler(euler.x, euler.y, euler.z, rotationOrder);
          bone.quaternion.slerp(
            new THREE.Quaternion().setFromEuler(targetEuler),
            overrideFactor ?? slerpFactor,
          );
        }
      };

      const rp = riggedPose;

      if (!isPlayer) {
        applyRot("neck", rp.Neck);
        applyRot("head", rp.Head);
      }
      applyRot("rightHand", rp.RightHand);
      applyRot("leftHand", rp.LeftHand);

      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");

      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

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

      const getMidpoint = (idx1: number, idx2: number) => {
        const p1 = solverLms[idx1];
        const p2 = solverLms[idx2];
        if (!p1 || !p2) return null;
        return {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          z: (p1.z + p2.z) / 2,
          visibility: Math.min(p1.visibility || 1, p2.visibility || 1),
        };
      };

      const mHips = getMidpoint(23, 24);
      const mShoulders = getMidpoint(11, 12);
      const bodyConfidence = getMovementBodyConfidence(imageLms, rigHands);
      const lowerBodyTrackingReady =
        !isPlayer ||
        (
          bodyConfidence.hips >= 0.45 &&
          Math.max(
            bodyConfidence.leftKnee,
            bodyConfidence.rightKnee,
            bodyConfidence.leftFoot,
            bodyConfidence.rightFoot,
          ) >= 0.35
        );
      const torsoTrackingReady = !isPlayer || bodyConfidence.torso >= 0.45;

      const applyRootRotation = () => {
        const hips = vrmRef.current?.humanoid?.getNormalizedBoneNode("hips");
        if (!hips) return;

        if (!lowerBodyTrackingReady) {
          if (lastGoodQuatRef.current["hips"]) {
            hips.quaternion.copy(lastGoodQuatRef.current["hips"]);
            hips.updateMatrixWorld(true);
          }
          return;
        }

        const p23 = solverLms[23];
        const p24 = solverLms[24];
        const p11 = solverLms[11];
        const p12 = solverLms[12];

        if (!p23 || !p24 || !p11 || !p12 || p23.visibility < 0.2 || p24.visibility < 0.2) {
          if (lastGoodQuatRef.current["hips"]) {
            hips.quaternion.copy(lastGoodQuatRef.current["hips"]);
            hips.updateMatrixWorld(true);
          }
          return;
        }

        const up = new THREE.Vector3(0, 1, 0);
        const leftShoulder = new THREE.Vector3(p11.x, -p11.y, -p11.z);
        const rightShoulder = new THREE.Vector3(p12.x, -p12.y, -p12.z);
        const dx = -Math.abs(rightShoulder.x - leftShoulder.x);
        const right = new THREE.Vector3(dx, 0, rightShoulder.z - leftShoulder.z);

        if (right.lengthSq() < 0.0001) return;
        right.normalize();

        const forward = new THREE.Vector3().crossVectors(right, up);
        if (forward.lengthSq() < 0.0001) return;
        forward.normalize();

        const trueRight = new THREE.Vector3().crossVectors(up, forward);
        if (trueRight.lengthSq() < 0.0001) return;
        trueRight.normalize();

        const mat = new THREE.Matrix4().makeBasis(trueRight, up, forward);
        const targetWorldQ = new THREE.Quaternion().setFromRotationMatrix(mat);

        if (hips.parent) {
          const parentWorldQ = new THREE.Quaternion();
          hips.parent.getWorldQuaternion(parentWorldQ);
          const localQ = parentWorldQ.clone().invert().multiply(targetWorldQ);
          hips.quaternion.slerp(localQ, slerpFactor);
        } else {
          hips.quaternion.slerp(targetWorldQ, slerpFactor);
        }

        lastGoodQuatRef.current["hips"] = hips.quaternion.clone();
        hips.updateMatrixWorld(true);
      };

      applyRootRotation();

      if (mHips && mShoulders && !forceStandby && torsoTrackingReady) {
        aimVector("spine", "chest", mHips, mShoulders, { ignoreVisibility: true });
        aimVector("chest", "upperChest", mHips, mShoulders, { ignoreVisibility: true });
      }

      if (forceStandby) {
        const rightArm = vrmRef.current.humanoid.getNormalizedBoneNode("rightUpperArm");
        const leftArm = vrmRef.current.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightLowerArm = vrmRef.current.humanoid.getNormalizedBoneNode("rightLowerArm");
        const leftLowerArm = vrmRef.current.humanoid.getNormalizedBoneNode("leftLowerArm");

        if (rightArm) rightArm.rotation.set(0, 0, -1.2);
        if (leftArm) leftArm.rotation.set(0, 0, 1.2);
        if (rightLowerArm) rightLowerArm.rotation.set(0, 0, 0);
        if (leftLowerArm) leftLowerArm.rotation.set(0, 0, 0);
        return;
      }

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
      const upperArmAimOptions: AimVectorOptions = {
        minVectorLengthSq: 0.00002,
        slerpOverride: isPlayer ? avatarTrackingProfile.upperArmSlerp : 0.42,
        storeVisibilityThreshold: isPlayer ? avatarTrackingProfile.armStoreVisibility : 0.6,
        visibilityThreshold: isPlayer ? avatarTrackingProfile.armVisibility : 0.2,
        zScale: isPlayer ? 0.1 : undefined,
      };
      const lowerArmAimOptions: AimVectorOptions = {
        ...upperArmAimOptions,
        slerpOverride: isPlayer ? avatarTrackingProfile.lowerArmSlerp : 0.45,
      };
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

      aimVector("rightUpperArm", "rightLowerArm", playerArmLms[12], playerArmLms[14], upperArmAimOptions);
      aimVector("rightLowerArm", "rightHand", playerArmLms[14], rightWristTarget, lowerArmAimOptions);
      aimVector("leftUpperArm", "leftLowerArm", playerArmLms[11], playerArmLms[13], upperArmAimOptions);
      aimVector("leftLowerArm", "leftHand", playerArmLms[13], leftWristTarget, lowerArmAimOptions);
      if (lowerBodyTrackingReady) {
        aimVector("rightUpperLeg", "rightLowerLeg", solverLms[24], rightKneeTarget, legAimOptions);
        aimVector("rightLowerLeg", "rightFoot", rightKneeTarget, rightAnkleTarget, legAimOptions);
        aimVector("leftUpperLeg", "leftLowerLeg", solverLms[23], leftKneeTarget, legAimOptions);
        aimVector("leftLowerLeg", "leftFoot", leftKneeTarget, leftAnkleTarget, legAimOptions);
        aimVector("rightFoot", "rightToes", solverLms[30], rightToeTarget, footAimOptions);
        aimVector("leftFoot", "leftToes", solverLms[29], leftToeTarget, footAimOptions);
      }

      const leftEar = imageLms[7];
      const rightEar = imageLms[8];
      const nose = imageLms[0];

      if (leftEar && rightEar && nose) {
        const headNode = vrmRef.current.humanoid.getNormalizedBoneNode("head");
        if (headNode) {
          const rawHead = estimateMovementHeadAngles({
            poseLandmarks: imageLms,
            faceLandmarks: payload?.faceLandmarks,
          });
          const appliedHead = isPlayer
            ? trackingCalibration
              ? applyHeadCalibration({
                  rawHead,
                  calibration: trackingCalibration,
                  profile: avatarTrackingProfile,
                })
              : getNeutralMovementHeadAngles(avatarTrackingProfile)
            : rawHead;
          const worldEuler = new THREE.Euler(
            appliedHead.pitch,
            appliedHead.yaw + Math.PI,
            appliedHead.roll,
            "YXZ",
          );
          const targetWorldQuat = new THREE.Quaternion().setFromEuler(worldEuler);

          if (headNode.parent) {
            const parentWorldQ = new THREE.Quaternion();
            headNode.parent.getWorldQuaternion(parentWorldQ);
            const targetLocalQuat = parentWorldQ.invert().multiply(targetWorldQuat);
            headNode.quaternion.slerp(
              targetLocalQuat,
              isPlayer ? avatarTrackingProfile.headSlerp : 0.3,
            );
          } else {
            headNode.quaternion.slerp(
              targetWorldQuat,
              isPlayer ? avatarTrackingProfile.headSlerp : 0.3,
            );
          }

          const neckNode = vrmRef.current.humanoid.getNormalizedBoneNode("neck");
          if (isPlayer && neckNode) {
            const neckTarget = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                appliedHead.pitch * avatarTrackingProfile.neckPitchShare,
                appliedHead.yaw * avatarTrackingProfile.neckYawShare,
                appliedHead.roll * avatarTrackingProfile.neckRollShare,
                "YXZ",
              ),
            );
            neckNode.quaternion.slerp(neckTarget, avatarTrackingProfile.neckSlerp);
          }

          if (isPlayer && trackingDebugRef) {
            trackingDebugRef.current = {
              updatedAt: performance.now(),
              headRaw: rawHead,
              headApplied: appliedHead,
              bodyConfidence,
              fallbacks: {
                head: trackingCalibration
                  ? (rawHead.confidence > 0.25 ? rawHead.source : "last-good")
                  : "neutral",
                rightArm: rightWristSelection.source,
                leftArm: leftWristSelection.source,
                rightKnee: lowerBodyTrackingReady ? rightKneeSelection.source : "upper-body",
                leftKnee: lowerBodyTrackingReady ? leftKneeSelection.source : "upper-body",
                rightFoot: lowerBodyTrackingReady ? rightToeSelection.source : "upper-body",
                leftFoot: lowerBodyTrackingReady ? leftToeSelection.source : "upper-body",
                floor: lowerBodyTrackingReady && (bodyConfidence.leftFoot > 0.35 || bodyConfidence.rightFoot > 0.35)
                  ? "calibrated-floor"
                  : "fixed-floor",
              },
              profileName: avatarTrackingProfileName,
              calibrationQuality: trackingCalibration?.quality,
            };
          }
        }
      }

      const leftFoot = vrmRef.current.humanoid.getNormalizedBoneNode("leftFoot");
      const rightFoot = vrmRef.current.humanoid.getNormalizedBoneNode("rightFoot");
      if (hipsNode && leftFoot && rightFoot && lowerBodyTrackingReady) {
        leftFoot.updateMatrixWorld(true);
        rightFoot.updateMatrixWorld(true);

        const lfW = new THREE.Vector3();
        leftFoot.getWorldPosition(lfW);
        const rfW = new THREE.Vector3();
        rightFoot.getWorldPosition(rfW);
        const lowestFootY = Math.min(lfW.y, rfW.y);
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
              calibration: trackingCalibration,
              currentFloorY,
              floorConfidence,
              profile: avatarTrackingProfile,
            })
          : 0;
        const diff = (-2.75 + calibratedFloorCorrection) - lowestFootY;
        const clampedDiff = Math.max(-1.0, Math.min(1.0, diff));

        hipsNode.position.y += (clampedDiff / 5.25) * 0.8;
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
      position={[positionOffset[0], -2.8, positionOffset[2]]}
      rotation={[0, Math.PI, 0]}
      scale={5.25}
    >
      <primitive object={avatarScene} />

      <Html position={[0, -0.45, 0]} center zIndexRange={[100, 0]}>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-6 py-1.5 rounded-full shadow-2xl">
          <span
            className={`font-black tracking-[0.2em] uppercase text-xs ${
              isPlayer ? "text-[#CCFF00]" : "text-[#FF3300]"
            }`}
          >
            {name}
          </span>
        </div>
      </Html>
    </group>
  );
}
