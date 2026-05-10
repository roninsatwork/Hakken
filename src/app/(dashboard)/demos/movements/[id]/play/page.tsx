"use client";
/**
 * Sonae Movement Demo - Gamified Pilates Interface
 * Last Updated: 2026-05-08 - v1.2.0 (Stability & Magnetism)
 */

import React, { useState, useEffect, useRef, use, useMemo } from "react";
import Header from "@/src/ui/components/layout/Header";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Play, Pause, Crosshair, Flame } from "lucide-react";
import Link from "next/link";
import Typography from "@/src/ui/atoms/typography";
import { motion, AnimatePresence } from "framer-motion";
import AvatarSelectorLobby from "./_components/AvatarSelectorLobby";
import { AVATAR_ROSTER } from "@/src/lib/constants/avatars";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useGLTF, Environment, useAnimations, Html, Grid } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, VRM } from "@pixiv/three-vrm";
import * as Kalidokit from "kalidokit";
import { FilesetResolver, PoseLandmarker, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
import Webcam from "react-webcam";

// MediaPipe Skeleton Connections
const POSE_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Right Arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  // Left Arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  // Right Leg
  [24, 26], [26, 28], [28, 30], [28, 32], [32, 30],
  // Left Leg
  [23, 25], [25, 27], [27, 29], [27, 31], [31, 29]
];

// High-performance Stardust/Sparkle particles for high-score feedback
const Sparkles = ({ landmarksRef, jointIndices, syncRef }: { 
  landmarksRef: React.MutableRefObject<any>, 
  jointIndices: number[],
  syncRef: React.MutableRefObject<number>
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 30;
  const positions = useMemo(() => new Float32Array(count * 3 * jointIndices.length), [jointIndices]);
  
  useFrame((state) => {
    if (!pointsRef.current || syncRef.current < 85) {
      if (pointsRef.current) pointsRef.current.visible = false;
      return;
    }
    pointsRef.current.visible = true;
    
    const rawRef = landmarksRef.current;
    const lms = Array.isArray(rawRef) ? rawRef : rawRef?.landmarks || [];
    if (!lms || lms.length < 33) return;

    const time = state.clock.getElapsedTime();
    const posAttr = pointsRef.current.geometry.attributes.position;
    const array = posAttr.array as Float32Array;
    
    jointIndices.forEach((jointIdx, i) => {
      const lm = lms[jointIdx];
      if (!lm) return;
      
      const baseX = (lm.x - 0.5) * -15;
      const baseY = (0.5 - lm.y) * 15;
      const baseZ = (lm.z || 0) * -15 * 0.5;

      for (let j = 0; j < count; j++) {
        const idx = (i * count + j) * 3;
        const angle = j + time * 3;
        const dist = 0.3 + Math.sin(time * 8 + j) * 0.2;
        array[idx] = baseX + Math.cos(angle) * dist;
        array[idx+1] = baseY + Math.sin(angle) * dist;
        array[idx+2] = baseZ + (Math.sin(time * 10 + j) * 0.1);
      }
    });
    
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute 
          attach="attributes-position" 
          args={[positions, 3]} 
        />
      </bufferGeometry>
      <pointsMaterial 
        size={0.15} 
        color="#ffb800" 
        transparent 
        opacity={0.8} 
        blending={THREE.AdditiveBlending} 
        sizeAttenuation 
        depthWrite={false}
      />
    </points>
  );
};

// 3D VRM Avatar powered by Kalidokit Kinematics
const VRMAvatar = ({ 
  landmarksRef, 
  positionOffset,
  isPlayer = false,
  isPlaying = true,
  syncRef,
  vrmUrl,
  name,
}: { 
  landmarksRef: React.MutableRefObject<any>, 
  positionOffset: [number, number, number],
  isPlayer?: boolean,
  isPlaying?: boolean,
  syncRef?: React.MutableRefObject<number>,
  vrmUrl: string,
  name: string,
}) => {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});
  const instructorFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));

  // useLoader cache keys are just the URL, so to load two separate instances:
  const urlToLoad = isPlayer ? `${vrmUrl}?player` : vrmUrl;
  
  const gltf = useLoader(GLTFLoader, urlToLoad, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as any) as any);
  });

  useEffect(() => {
    if (gltf && gltf.userData.vrm) {
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      vrmRef.current = vrm;
    }
  }, [gltf]);

  useFrame((state, delta) => {
    if (!vrmRef.current || !group.current) return;
    vrmRef.current.update(delta);
    
    // 1. Resolve Landmarks Array
    const lms = landmarksRef.current;
    if (!lms) return;
    const raw = Array.isArray(lms) ? lms : (lms?.pose || lms?.landmarks || []);
    if (!raw || raw.length < 33) return;

    // Standby Override: If the match hasn't started, force the instructor into a relaxed standing pose
    // to match the live player's default occlusion state.
    const forceStandby = !isPlayer && !isPlaying;

    // Standard Decoder
    const format = (lm: any) => ({
      x: typeof lm.x === "number" ? lm.x : (Array.isArray(lm) ? lm[0] : 0.5),
      y: typeof lm.y === "number" ? lm.y : (Array.isArray(lm) ? lm[1] : 0.5),
      z: typeof lm.z === "number" ? lm.z : (Array.isArray(lm) ? lm[2] : 0),
      visibility: forceStandby ? 0 : (lm.visibility || 0.8)
    });

    let imageLms = raw.map(format);
    let solverLms;
    
    // Pass raw, perfectly unmirrored data directly into Kalidokit.
    // This allows Kalidokit's heuristics to natively detect 'Facing Camera',
    // which unlocks the spine solver and inherently prevents leg-crossing.
    
    if ((lms as any).worldLandmarks) {
       solverLms = (lms as any).worldLandmarks.map(format);
    } else {
       // Fallback: 2D Projection (Centered & Scaled)
       // This natively mimics the unmirrored physical coordinate space of true 3D data.
       const hipX = (imageLms[23].x + imageLms[24].x) / 2;
       const hipY = (imageLms[23].y + imageLms[24].y) / 2;
       solverLms = imageLms.map((lm: any) => ({
         x: (lm.x - hipX) * 3.0, 
         y: (lm.y - hipY) * 3.0,  
         z: lm.z * 3.0,           
         visibility: lm.visibility || 0
       }));
    }
    
    let kdSolverLms = solverLms.map((lm: any) => ({...lm}));

    if (!isPlayer) {
      // Mirror the raw data computationally so Kalidokit naturally generates a mirrored pose
      // This allows us to avoid negative group scaling which breaks 3D bone physics.
      const swapPairs = [
        [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], // Face
        [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], // Arms
        [23, 24], [25, 26], [27, 28], [29, 30], [31, 32] // Legs
      ];

      const mirrorArray = (arr: any[], invertX: (x: number) => number) => {
        arr.forEach(lm => { if (lm) lm.x = invertX(lm.x); });
        swapPairs.forEach(([l, r]) => {
          if (arr[l] && arr[r]) {
            const temp = { ...arr[l] };
            arr[l] = { ...arr[r] };
            arr[r] = temp;
          }
        });
      };

      mirrorArray(imageLms, (x) => 1 - x);
      mirrorArray(solverLms, (x) => -x); // World/fallback coordinates are zero-centered at hips
      mirrorArray(kdSolverLms, (x) => -x);
      
      // Mirror Hands & Blendshapes
      if ((lms as any).hands) {
          const rawHands = (lms as any).hands;
          const mirroredHands: any = {};
          if (rawHands.left) {
              mirroredHands.right = { ...rawHands.left };
              if (mirroredHands.right.worldLandmarks) {
                  mirroredHands.right.worldLandmarks = mirroredHands.right.worldLandmarks.map((lm: any) => ({ ...lm, x: -lm.x }));
              }
          }
          if (rawHands.right) {
              mirroredHands.left = { ...rawHands.right };
              if (mirroredHands.left.worldLandmarks) {
                  mirroredHands.left.worldLandmarks = mirroredHands.left.worldLandmarks.map((lm: any) => ({ ...lm, x: -lm.x }));
              }
          }
          (lms as any).hands = mirroredHands;
      }
      
      if ((lms as any).blendshapes) {
          (lms as any).blendshapes = (lms as any).blendshapes.map((b: any) => {
              let name = b.categoryName;
              if (name.includes("Left")) name = name.replace("Left", "Right");
              else if (name.includes("Right")) name = name.replace("Right", "Left");
              return { ...b, categoryName: name };
          });
      }
    }

    // Solve IK for core body
    let riggedPose;
    try {
      riggedPose = Kalidokit.Pose.solve(kdSolverLms, imageLms, {
        runtime: "mediapipe",
        video: null,
        imageSize: { width: 640, height: 480 },
      });
    } catch (e) { return; }

    if (riggedPose && vrmRef.current.humanoid) {
      // Dynamic Interpolation: Ghost smoothed to 0.5 to absorb 1-frame AI glitches (preventing jerky snapping), Instructor at 0.3
      const slerpFactor = isPlayer ? 0.5 : 0.3;

      const applyRot = (boneName: string, euler: any, overrideFactor?: number) => {
        if (!euler) return;
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        if (bone) {
          let targetEuler = new THREE.Euler(euler.x, euler.y, euler.z, euler.rotationOrder || "XYZ");
          // Unlocked Hips: allow full 6DOF pelvic tilt for Pilates floor work
          bone.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetEuler), overrideFactor ?? slerpFactor);
        }
      };

      const rp = riggedPose;

      // 1. Kalidokit Purge: We only keep Kalidokit for Head, Neck, and Hands
      applyRot("neck", (rp as any).Neck);
      applyRot("head", (rp as any).Head);
      applyRot("rightHand", rp.RightHand);
      applyRot("leftHand", rp.LeftHand);
      
      // Removed Kalidokit leg physics to prevent the 'leg grouping/locking' heuristic bug
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");
      if (hipsNode && rp.Hips.position) {
         // All Kalidokit root translation (X, Y, Z) is explicitly ignored.
         // Y is handled by the Dynamic Floor Anchor for perfect squats.
         // X and Z are ignored because 2D bounding box depth estimation turns desk-users into giants.
      }

      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

      // 2. Pure Forward Kinematics (FK)
      const aimVector = (boneName: string, targetName: string, vStart: any, vEnd: any, ignoreVisibility = false) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        if (!bone) return;
        
        if (!ignoreVisibility && (!vStart || !vEnd || vStart.visibility < 0.2 || vEnd.visibility < 0.2)) {
            if (lastGoodQuatRef.current[boneName]) {
                // Aggressive Freeze: Lock rotation instantly
                bone.quaternion.copy(lastGoodQuatRef.current[boneName]);
            } else {
                // Graceful Fallback: If we've never seen the limb (e.g. initial load at a desk),
                // don't leave it in the default VRM T-Pose. Drop it into a relaxed A-Pose.
                if (boneName === "rightUpperArm") bone.rotation.set(0, 0, -1.2);
                if (boneName === "leftUpperArm") bone.rotation.set(0, 0, 1.2);
            }
            return;
        }

        const boneW = new THREE.Vector3();
        bone.getWorldPosition(boneW);

        const childNode = vrmRef.current?.humanoid?.getNormalizedBoneNode(targetName as any);
        if (!childNode) return;
        const childW = new THREE.Vector3();
        childNode.getWorldPosition(childW);

        const currentDir = childW.clone().sub(boneW).normalize();
        
        let dz = vEnd.z - vStart.z;
        if (!((lms as any).worldLandmarks)) {
           dz *= 0.1;
        }

        const rawDir = new THREE.Vector3(
          (vEnd.x - vStart.x), 
          -(vEnd.y - vStart.y), 
          -dz
        );
        
        // Safety Net: Prevent NaN corruption during MediaPipe initialization frames (0,0,0)
        if (rawDir.lengthSq() < 0.0001) return;
        
        const desiredDir = rawDir.normalize();
        const qOffset = new THREE.Quaternion().setFromUnitVectors(currentDir, desiredDir);

        const currentWorldQ = new THREE.Quaternion();
        bone.getWorldQuaternion(currentWorldQ);

        const targetWorldQ = qOffset.multiply(currentWorldQ);

        if (bone.parent) {
            const parentWorldQ = new THREE.Quaternion();
            bone.parent.getWorldQuaternion(parentWorldQ);
            const localQ = parentWorldQ.invert().multiply(targetWorldQ);
            bone.quaternion.slerp(localQ, slerpFactor);
            // Only cache highly confident frames to prevent permanently freezing into a mangled state if tracking drops
            if (ignoreVisibility || (vStart.visibility > 0.6 && vEnd.visibility > 0.6)) {
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
          visibility: Math.min(p1.visibility || 1, p2.visibility || 1)
        };
      };

      const mHips = getMidpoint(23, 24);
      const mShoulders = getMidpoint(11, 12);

      // 3. Pure 3D Torso Matrix (Root Rotation)
      // Completely bypasses 2D heuristics by mathematically calculating the exact 3D plane of the torso
      const applyRootRotation = () => {
         const hipsNode = vrmRef.current?.humanoid?.getNormalizedBoneNode("hips");
         if (!hipsNode) return;
         
         const p23 = solverLms[23]; // Left Hip
         const p24 = solverLms[24]; // Right Hip
         const p11 = solverLms[11]; // Left Shoulder
         const p12 = solverLms[12]; // Right Shoulder
         
         // Strict Occlusion Safety Net
         if (!p23 || !p24 || !p11 || !p12 || p23.visibility < 0.2 || p24.visibility < 0.2) {
             if (lastGoodQuatRef.current["hips"]) {
                 hipsNode.quaternion.copy(lastGoodQuatRef.current["hips"]);
                 hipsNode.updateMatrixWorld(true);
             }
             return;
         }
         
         const leftHip = new THREE.Vector3(p23.x, -p23.y, -p23.z);
         const rightHip = new THREE.Vector3(p24.x, -p24.y, -p24.z);
         
         // 1. Force a perfectly upright foundation to prevent 'Matrix Dodge' back-bending
         // MediaPipe Z-depth for desk users is highly corrupted, causing the hips to think they are lying flat.
         const up = new THREE.Vector3(0, 1, 0);
         
         // 2. Calculate true Yaw (turning around) using SHOULDERS instead of HIPS
         // Hip Z-depth is wildly inaccurate for seated/occluded users and causes severe twisting.
         const leftShoulder = new THREE.Vector3(p11.x, -p11.y, -p11.z);
         const rightShoulder = new THREE.Vector3(p12.x, -p12.y, -p12.z);
         
         // Force DX to be NEGATIVE so the avatar can NEVER mathematically cross its shoulders and spin 180 degrees backward.
         // (In unmirrored space, the Right Shoulder is on the left side of the screen, so right.x < left.x).
         const dx = -Math.abs(rightShoulder.x - leftShoulder.x);
         const right = new THREE.Vector3(dx, 0, rightShoulder.z - leftShoulder.z);
         
         if (right.lengthSq() < 0.0001) return;
         right.normalize();
         
         // 3. Calculate Forward
         const forward = new THREE.Vector3().crossVectors(right, up);
         if (forward.lengthSq() < 0.0001) return;
         forward.normalize();
         
         const trueRight = new THREE.Vector3().crossVectors(up, forward);
         if (trueRight.lengthSq() < 0.0001) return;
         trueRight.normalize();
         
         const mat = new THREE.Matrix4().makeBasis(trueRight, up, forward);
         const targetWorldQ = new THREE.Quaternion().setFromRotationMatrix(mat);
         
         if (hipsNode.parent) {
             const parentWorldQ = new THREE.Quaternion();
             hipsNode.parent.getWorldQuaternion(parentWorldQ);
             const localQ = parentWorldQ.clone().invert().multiply(targetWorldQ);
             hipsNode.quaternion.slerp(localQ, slerpFactor);
         } else {
             hipsNode.quaternion.slerp(targetWorldQ, slerpFactor);
         }
         
         lastGoodQuatRef.current["hips"] = hipsNode.quaternion.clone();
         hipsNode.updateMatrixWorld(true);
      };
      
      applyRootRotation();

      // 4. Core Spine FK
      // We pass 'true' to safely bypass visibility checks, relying on MediaPipe's inferred spatial depth 
      // to track torso bending even when seated at a desk.
      if (mHips && mShoulders && !forceStandby) {
        aimVector("spine", "chest", mHips, mShoulders, true);
        aimVector("chest", "upperChest", mHips, mShoulders, true);
      }

      // Arms FK
      if (forceStandby) {
          // Relaxed A-Pose for Lobby (drops arms 70 degrees)
          const rightArm = vrmRef.current.humanoid.getNormalizedBoneNode("rightUpperArm");
          const leftArm = vrmRef.current.humanoid.getNormalizedBoneNode("leftUpperArm");
          const rightLowerArm = vrmRef.current.humanoid.getNormalizedBoneNode("rightLowerArm");
          const leftLowerArm = vrmRef.current.humanoid.getNormalizedBoneNode("leftLowerArm");
          
          if (rightArm) rightArm.rotation.set(0, 0, -1.2); 
          if (leftArm) leftArm.rotation.set(0, 0, 1.2); 
          if (rightLowerArm) rightLowerArm.rotation.set(0, 0, 0);
          if (leftLowerArm) leftLowerArm.rotation.set(0, 0, 0);
          return; // Lock entire body in A-pose during standby
      } else {
          aimVector("rightUpperArm", "rightLowerArm", solverLms[12], solverLms[14]);
          aimVector("rightLowerArm", "rightHand", solverLms[14], solverLms[16]);
          aimVector("leftUpperArm", "leftLowerArm", solverLms[11], solverLms[13]);
          aimVector("leftLowerArm", "leftHand", solverLms[13], solverLms[15]);
      }
      
      // Legs FK
      aimVector("rightUpperLeg", "rightLowerLeg", solverLms[24], solverLms[26]);
      aimVector("rightLowerLeg", "rightFoot", solverLms[26], solverLms[28]);
      aimVector("leftUpperLeg", "leftLowerLeg", solverLms[23], solverLms[25]);
      aimVector("leftLowerLeg", "leftFoot", solverLms[25], solverLms[27]);
      
      // Feet FK (Ankle rotation pointing to toes)
      aimVector("rightFoot", "rightToes", solverLms[30], solverLms[32]);
      aimVector("leftFoot", "leftToes", solverLms[29], solverLms[31]);

      // Head FK (Precise Pitch/Yaw/Roll using Ears and Nose)
      // We MUST use imageLms (2D) for the Face, because MediaPipe's worldLandmarks (3D) for the face are extremely noisy and cause pitch explosions.
      const leftEar = imageLms[7];
      const rightEar = imageLms[8];
      const nose = imageLms[0];
      
      if (leftEar && rightEar && nose && !forceStandby) {
          const headNode = vrmRef.current.humanoid.getNormalizedBoneNode("head");
          if (headNode) {
              // Always treat X distance as positive to avoid atan2 180-degree flips on unmirrored raw camera data
              const dx = Math.abs(rightEar.x - leftEar.x);
              const dy = -(rightEar.y - leftEar.y);
              const dz = leftEar.z - rightEar.z;

              // Safe trig using atan2 (handles dx approaching 0 when head turns 90 degrees)
              // We invert Roll and Pitch to compensate for the 180-degree avatar rotation
              const roll = -Math.atan2(dy, dx);
              const yaw = Math.atan2(dz, dx) * 1.5; 
              
              // True 3D head size (invariant to rotation, prevents pitch explosion when turning)
              const headSize = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.1;
              const mEarsY = (leftEar.y + rightEar.y) / 2;
              const normalizedY = (nose.y - mEarsY) / headSize;
              const pitch = -(normalizedY - 0.2) * 2.0; 

              // Clamp to prevent any extreme physics glitches
              const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
              // Apply Math.PI to Yaw so the Head's "Zero" faces the camera
              const worldEuler = new THREE.Euler(clamp(pitch, 1.0), clamp(yaw, 1.5) + Math.PI, clamp(roll, 1.0), "YXZ");
              const targetWorldQuat = new THREE.Quaternion().setFromEuler(worldEuler);
              
              // Convert the camera-relative target into the bone's local space
              if (headNode.parent) {
                  const parentWorldQ = new THREE.Quaternion();
                  headNode.parent.getWorldQuaternion(parentWorldQ);
                  const targetLocalQuat = parentWorldQ.invert().multiply(targetWorldQuat);
                  headNode.quaternion.slerp(targetLocalQuat, isPlayer ? 0.8 : 0.3);
              } else {
                  headNode.quaternion.slerp(targetWorldQuat, isPlayer ? 0.8 : 0.3);
              }
          }
      }

      // Dynamic Floor Anchor (Bone-based)
      // Unlike SkinnedMesh bounding boxes which lag or fail, this precisely tracks the true 3D world position of the feet.
      // If the knees bend (squat), the feet try to lift off the floor. This anchor instantly forces the hips down to keep them planted.
      const leftFoot = vrmRef.current.humanoid.getNormalizedBoneNode("leftFoot");
      const rightFoot = vrmRef.current.humanoid.getNormalizedBoneNode("rightFoot");
      if (hipsNode && leftFoot && rightFoot) {
          leftFoot.updateMatrixWorld(true);
          rightFoot.updateMatrixWorld(true);
          
          const lfW = new THREE.Vector3(); leftFoot.getWorldPosition(lfW);
          const rfW = new THREE.Vector3(); rightFoot.getWorldPosition(rfW);
          const lowestFootY = Math.min(lfW.y, rfW.y);
          
          // Move the floor down to -2.8 to center the 8-meter-tall avatars in the camera viewport
          // Ankle bone is roughly 0.05 meters above the bottom of the shoe. Floor is at -2.8.
          const diff = -2.75 - lowestFootY;
          const clampedDiff = Math.max(-1.0, Math.min(1.0, diff));
          
          hipsNode.position.y += (clampedDiff / 5.25) * 0.8; 
      }

      // Facial Expressions (Blendshapes)
      const blendshapes = (lms as any).blendshapes;
      if (blendshapes && vrmRef.current.expressionManager && !forceStandby) {
          let smileScore = 0;
          blendshapes.forEach((b: any) => {
              if (b.categoryName === "eyeBlinkLeft") vrmRef.current.expressionManager?.setValue("blinkLeft", b.score);
              if (b.categoryName === "eyeBlinkRight") vrmRef.current.expressionManager?.setValue("blinkRight", b.score);
              if (b.categoryName === "jawOpen") vrmRef.current.expressionManager?.setValue("aa", Math.min(1.0, b.score * 1.5));
              if (b.categoryName === "mouthSmileLeft" || b.categoryName === "mouthSmileRight") smileScore += (b.score / 2);
          });
          vrmRef.current.expressionManager?.setValue("happy", smileScore);
      }

      // Hand & Finger FK
      const hands = (lms as any).hands;
      if (hands && !forceStandby) {
          const mapFingers = (side: "left" | "right") => {
              const handData = hands[side];
              // Kalidokit specifically requires the 2D 'landmarks' array, not worldLandmarks
              if (!handData || !handData.landmarks) return;
              
              const handednessStr = side === "left" ? "Left" : "Right";
              
              // CRITICAL: MediaPipe reads the raw unmirrored webcam, meaning the X-axis is physically backwards.
              // Kalidokit's complex 2D algorithm will violently mangle the rotations if it receives unmirrored coordinates.
              // We MUST deeply clone and mirror the X-axis (1 - x) to restore the true physical shape of the hand.
              const mirroredLandmarks = handData.landmarks.map((lm: any) => ({ ...lm, x: 1 - lm.x }));
              
              const rig = Kalidokit.Hand.solve(mirroredLandmarks, handednessStr);
              if (!rig) return;

              const applyHandRot = (vrmName: string, rigKey: string) => {
                  const bone = vrmRef.current.humanoid?.getNormalizedBoneNode(vrmName);
                  const rot = rig[rigKey];
                  if (bone && rot) {
                      // Smooth the high-frequency finger jitter using slerp instead of hard set
                      const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
                      bone.quaternion.slerp(targetQ, isPlayer ? 0.6 : 0.4);
                  }
              };
              
              // 1. Map Wrist (VRM bone is 'leftHand', Kalidokit output is 'LeftWrist')
              applyHandRot(`${side}Hand`, `${handednessStr}Wrist`);
              
              // 2. Map Fingers natively
              const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"];
              const JOINTS = ["Proximal", "Intermediate", "Distal"];
              
              FINGERS.forEach(finger => {
                  JOINTS.forEach(joint => {
                      const vrmName = `${side}${finger}${joint}`;
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
      <primitive object={vrmRef.current ? vrmRef.current.scene : gltf.scene} />
      
      {/* Dynamic Nameplate */}
      <Html position={[0, -0.45, 0]} center zIndexRange={[100, 0]}>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-6 py-1.5 rounded-full shadow-2xl">
          <span className={`font-black tracking-[0.2em] uppercase text-xs ${isPlayer ? "text-[#CCFF00]" : "text-[#FF3300]"}`}>
            {name}
          </span>
        </div>
      </Html>
    </group>
  );
};

// 3D Cartoon Avatar (Rayman / VR Style using authentic Robot meshes)
// 100% Reliable Procedural Cyberpunk Avatar (Glassmorphism & Neon)
const CartoonAvatar = ({ 
  landmarksRef, 
  positionOffset, 
  isPlayer = false,
  syncRef
}: { 
  landmarksRef: React.MutableRefObject<any>, 
  positionOffset: [number, number, number],
  isPlayer?: boolean,
  baseOpacity?: number,
  syncRef?: React.MutableRefObject<number>
}) => {
  const headRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const limbRefs = useRef<THREE.Group[]>([]);

  // Aesthetic Tokens
  const neonColor = isPlayer ? "#00f2ff" : "#ff0080";
  const glassColor = "#1a1a2e";

  // CLONE MATERIAL for player to enable unique "Power Glow" without breaking instructor
  const limbMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: neonColor,
    emissive: neonColor,
    emissiveIntensity: isPlayer ? 3 : 8,
    transparent: true,
    opacity: isPlayer ? 0.25 : 0.8,
    depthWrite: !isPlayer,
    blending: isPlayer ? THREE.AdditiveBlending : THREE.NormalBlending
  }), [isPlayer, neonColor]);

  useFrame(() => {
    const currentRef = landmarksRef.current;
    const lms = Array.isArray(currentRef) ? currentRef : (currentRef?.landmarks || []);
    
    if (lms && lms.length >= 33) {
      const mirrorX = 1;
      const anchorX = 0.5;
      const anchorY = 0.5;
      const scaleMult = 15;

      const getVec = (idx: number) => {
        const lm = lms[idx];
        if (!lm || (typeof lm.visibility !== 'undefined' && lm.visibility < 0.05)) return null;
        return new THREE.Vector3(
          (lm.x - anchorX) * -scaleMult * mirrorX,
          (anchorY - lm.y) * scaleMult,
          (lm.z || 0) * -scaleMult * 0.5
        );
      };

      // 1. Position Head (Nose)
      const hPos = getVec(0);
      if (headRef.current) {
        if (hPos) {
          // Offset head slightly up from the nose landmark for better appearance
          headRef.current.position.set(hPos.x, hPos.y + 0.3, hPos.z);
          headRef.current.visible = true;
        } else {
          headRef.current.visible = false;
        }
      }

      // 2. Position Torso (Shoulder-Hip midpoint)
      const sL = getVec(11), sR = getVec(12), hL = getVec(23), hR = getVec(24);
      if (torsoRef.current) {
        if (sL && sR && hL && hR) {
          const center = new THREE.Vector3().addVectors(sL, sR).add(hL).add(hR).multiplyScalar(0.25);
          torsoRef.current.position.copy(center);
          torsoRef.current.visible = true;
          
          // Face forward
          const spine = new THREE.Vector3().subVectors(new THREE.Vector3().addVectors(sL, sR).multiplyScalar(0.5), center).normalize();
          const shoulderVec = new THREE.Vector3().subVectors(sR, sL).normalize();
          const forward = new THREE.Vector3().crossVectors(shoulderVec, spine).normalize();
          torsoRef.current.lookAt(new THREE.Vector3().addVectors(center, forward));
        } else {
          torsoRef.current.visible = false;
        }
      }

      // 3. Position Limbs (Segments)
      const segments = [
        [11, 13], [13, 15], // Arm L
        [12, 14], [14, 16], // Arm R
        [23, 25], [25, 27], // Leg L
        [24, 26], [26, 28], // Leg R
        [11, 12], [23, 24]  // Shoulders/Hips
      ];

      segments.forEach((seg, i) => {
        const start = getVec(seg[0]);
        const end = getVec(seg[1]);
        const ref = limbRefs.current[i];
        if (ref && start && end) {
          const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
          const dist = start.distanceTo(end);
          ref.position.copy(mid);
          ref.lookAt(end);
          ref.scale.set(1, 1, dist);
          ref.visible = true;

          // Power Glow logic for Player
          if (isPlayer && syncRef) {
            const syncValue = syncRef.current / 100;
            const isJointSnapped = lms[seg[1]]?.isSnapped;
            const baseCol = new THREE.Color("#00f2ff");
            const peakCol = new THREE.Color(isJointSnapped ? "#ffffff" : "#ffb800"); // White pulse for snap
            limbMaterial.emissive.lerpColors(baseCol, peakCol, isJointSnapped ? 1 : Math.max(0, (syncValue - 0.4) * 1.6));
            limbMaterial.emissiveIntensity = isJointSnapped ? 30 : (3 + (syncValue * 20));
            limbMaterial.opacity = isJointSnapped ? 0.9 : (0.2 + (syncValue * 0.6));
          }
        } else if (ref) {
          ref.visible = false;
        }
      });
    }
  });

  return (
    <group position={positionOffset}>
      {/* Head: Cybernetic Helmet with Visor */}
      <group ref={headRef}>
        <mesh>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshPhysicalMaterial 
            color="#2a2a40" 
            transmission={0.8} 
            thickness={2} 
            roughness={0.1} 
            metalness={0.9}
            transparent={isPlayer}
            opacity={isPlayer ? 0.3 : 1}
            depthWrite={!isPlayer}
          />
        </mesh>
        {/* Digital Visor */}
        <mesh position={[0, 0.05, 0.36]}>
          <boxGeometry args={[0.55, 0.15, 0.05]} />
          <meshStandardMaterial color={neonColor} emissive={neonColor} emissiveIntensity={isPlayer ? 2 : 5} transparent={isPlayer} opacity={isPlayer ? 0.5 : 1} depthWrite={!isPlayer} />
        </mesh>
        {/* Glowing Head Detail */}
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.1]} />
          <meshBasicMaterial color={neonColor} />
        </mesh>
      </group>

      {/* Torso: Heavy Mech-Plate with Core */}
      <group ref={torsoRef}>
        <mesh>
          <boxGeometry args={[1.3, 1.8, 0.7]} />
          <meshPhysicalMaterial 
            color="#1a1a2e" 
            transmission={0.7} 
            thickness={3} 
            roughness={0.2}
            metalness={0.9}
            transparent={isPlayer}
            opacity={isPlayer ? 0.3 : 1}
            depthWrite={!isPlayer}
          />
        </mesh>
        {/* Power Core */}
        <mesh position={[0, 0.2, 0.36]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={neonColor} emissive={neonColor} emissiveIntensity={isPlayer ? 4 : 10} transparent={isPlayer} opacity={isPlayer ? 0.6 : 1} depthWrite={!isPlayer} />
        </mesh>
        <pointLight color={neonColor} intensity={10} distance={3} />
      </group>

      {/* Limbs: Armored Struts */}
      {[...Array(10)].map((_, i) => (
        <group key={i} ref={(el) => { if (el) limbRefs.current[i] = el; }}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={limbMaterial}>
            <cylinderGeometry args={[0.12, 0.12, 1, 8]} />
          </mesh>
          {/* Hydraulic Joints */}
          <mesh position={[0, 0, 0.5]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#ffffff" metalness={1} roughness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

export default function MatchPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const movementId = unwrappedParams.id as Id<"movements">;
  
  const movement = useQuery(api.movements.get, { id: movementId });
  const isStorageId = typeof movement?.poseData === "string" && !movement.poseData.startsWith("[");
  const fileUrl = useQuery(api.movements.getFileUrl, isStorageId ? { storageId: movement.poseData as Id<"_storage"> } : "skip");

  const [isLobby, setIsLobby] = useState(true);
  const [playerAvatarUrl, setPlayerAvatarUrl] = useState("/models/VIPE_Hero__1793.vrm");
  const [instructorAvatarUrl, setInstructorAvatarUrl] = useState("/models/VIPE_Hero__1914.vrm");

  // Helper to get names
  const getAvatarName = (url: string) => AVATAR_ROSTER.find(a => a.path === url)?.name || "Unknown";

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [syncRate, setSyncRate] = useState(100);
  const [feedbackMsg, setFeedbackMsg] = useState<{text: string, id: number} | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Suppress benign MediaPipe C++ info logs that trigger the Next.js Error Overlay
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('XNNPACK delegate')) return;
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    if (feedbackMsg) {
      const t = setTimeout(() => setFeedbackMsg(null), 2000);
      return () => clearTimeout(t);
    }
  }, [feedbackMsg]);

  const instructorFramesRef = useRef<any>([]);
  const instructorCurrentLmRef = useRef<any>([]);
  const playerLiveLmRef = useRef<any>([]);
  const snappedPlayerLmRef = useRef<any>([]);
  const frameIndexRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0); // Add Combo Counter
  const syncRef = useRef(0); // Live sync percentage for 3D materials
  
  const instructorFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const instructorWorldFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const instructorLeftHandFilterRef = useRef(new PoseFilterWrapper(21, 30, 0.01, 0.0));
  const instructorRightHandFilterRef = useRef(new PoseFilterWrapper(21, 30, 0.01, 0.0));
  
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const worldPoseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  
  // Hand Jitter Filters
  const leftHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.0, 0.005));
  const rightHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.0, 0.005));
  const leftHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.0, 0.005));
  const rightHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.0, 0.005));
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);

  // 1. Fetch Data
  useEffect(() => {
    const loadData = async () => {
      if (!movement) return;
      
      let loadedFrames: any[] = [];
      if (isStorageId && fileUrl) {
        try {
          const res = await fetch(fileUrl);
          const data = await res.json();
          loadedFrames = Array.isArray(data) ? data : (data.frames || []);
        } catch (e) {
          console.error("Failed to load pose data from URL", e);
        }
      } else if (!isStorageId && typeof movement.poseData === "string") {
        try {
          const parsed = JSON.parse(movement.poseData);
          loadedFrames = Array.isArray(parsed) ? parsed : (parsed.frames || []);
        } catch (e) {
          console.error("Failed to parse pose data", e);
        }
      }

      if (loadedFrames && loadedFrames.length > 0) {
        instructorFramesRef.current = loadedFrames;
        const firstFrame = loadedFrames[0];
        instructorCurrentLmRef.current = firstFrame.pose ? firstFrame.pose : Array.isArray(firstFrame) ? firstFrame : (firstFrame?.landmarks || []);
      }
      setIsLoading(false);
    };
    loadData();
  }, [movement, fileUrl, isStorageId]);

  // 2. Init MediaPipe Triad
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
        
        const [pose, face, hands] = await Promise.all([
            PoseLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task", delegate: "GPU" },
              runningMode: "VIDEO",
              numPoses: 1,
              minPoseDetectionConfidence: 0.7,
              minPosePresenceConfidence: 0.7,
              minTrackingConfidence: 0.7,
            }),
            FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false,
            }),
            HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate: "GPU" },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            })
        ]);

        if (active) {
            setPoseLandmarker(pose);
            setFaceLandmarker(face);
            setHandLandmarker(hands);
        }
      } catch (err) {
        console.error("MediaPipe Vision Triad failed to initialize", err);
      }
    };
    init();
    return () => { 
        active = false; 
        if (poseLandmarker) poseLandmarker.close(); 
        if (faceLandmarker) faceLandmarker.close();
        if (handLandmarker) handLandmarker.close();
    };
  }, []);

  const webcamRef = useRef<Webcam>(null);

  // 3. Start Player Webcam Tracking
  useEffect(() => {
    let animationFrameId: number;

    const processVideo = () => {
      if (poseLandmarker && faceLandmarker && handLandmarker && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        const video = webcamRef.current.video;
        const startTimeMs = performance.now();
        
        // Run all three models concurrently on the same video frame timestamp
        const poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = handLandmarker.detectForVideo(video, startTimeMs);
        
        const currentData: any = {};

        if (poseResults && poseResults.landmarks && poseResults.landmarks.length > 0) {
          const raw = poseResults.landmarks[0];
          const worldRaw = poseResults.worldLandmarks ? poseResults.worldLandmarks[0] : null;
          
          currentData.landmarks = poseFilterRef.current.filter(raw, startTimeMs);
          currentData.worldLandmarks = worldRaw ? worldPoseFilterRef.current.filter(worldRaw, startTimeMs) : null;
          
          const calElem = document.getElementById("calibration-status");
          if (calElem) {
            calElem.innerText = "READY";
            calElem.className = "text-sm font-semibold tracking-wider text-green-400";
          }
        }
        
        if (faceResults && faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
            currentData.blendshapes = faceResults.faceBlendshapes[0].categories;
        }

        if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
            currentData.hands = { left: null, right: null };
            
            const leftWristPose = currentData.landmarks ? currentData.landmarks[15] : null;
            const rightWristPose = currentData.landmarks ? currentData.landmarks[16] : null;
            
            handResults.landmarks.forEach((handLms: any[], index: number) => {
                const handWrist = handLms[0];
                let side = "right"; 
                
                // Spatial Distance Matching: Stop relying on buggy categoryName, measure physical distance to wrists
                if (leftWristPose && rightWristPose) {
                    const distToLeft = Math.hypot(handWrist.x - leftWristPose.x, handWrist.y - leftWristPose.y);
                    const distToRight = Math.hypot(handWrist.x - rightWristPose.x, handWrist.y - rightWristPose.y);
                    if (distToLeft < distToRight) side = "left";
                } else if (leftWristPose) {
                    side = "left";
                }
                
                // Apply High-Fidelity Jitter Filters
                const filterRef = side === "left" ? leftHandFilterRef.current : rightHandFilterRef.current;
                const worldFilterRef = side === "left" ? leftHandWorldFilterRef.current : rightHandWorldFilterRef.current;
                
                const smoothedHandLms = filterRef.filter(handLms, startTimeMs);
                
                let smoothedHandWorld = null;
                if (handResults.worldLandmarks && handResults.worldLandmarks[index]) {
                    smoothedHandWorld = worldFilterRef.filter(handResults.worldLandmarks[index], startTimeMs);
                }

                currentData.hands[side] = {
                    landmarks: smoothedHandLms,
                    worldLandmarks: smoothedHandWorld
                };
            });
        }
        
        // Store unified payload
        playerLiveLmRef.current = currentData;
      }
      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (poseLandmarker && faceLandmarker && handLandmarker) {
      processVideo();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [poseLandmarker, faceLandmarker, handLandmarker]);

  // 4. Playback Loop & Scoring Engine
  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    const gameLoop = (time: number) => {
      if (!active) return;
      animationFrameId = requestAnimationFrame(gameLoop);
      
      if (!isPlaying) return;

      const frames = instructorFramesRef.current || [];
      const totalFrames = frames.length;
      
      if (totalFrames > 0) {
        if (frameIndexRef.current + 1 >= totalFrames) {
          if (isPlaying) {
            setIsPlaying(false);
            setIsComplete(true);
          }
          return;
        }
        
        frameIndexRef.current += 1;
        const frameData = frames[frameIndexRef.current];
          // Smooth the instructor's core body to absorb frame-skips from the lag compensator
          const now = performance.now();
          let filteredIL = frameData?.landmarks || [];
          filteredIL = instructorFilterRef.current.filter(filteredIL, now);
          
          let filteredIWorld = frameData?.worldLandmarks || [];
          if (filteredIWorld.length > 0) {
              filteredIWorld = instructorWorldFilterRef.current.filter(filteredIWorld, now);
          }
          
          let filteredIHands = frameData?.hands;
          if (filteredIHands) {
              // Deep-clone the hands so we don't accidentally mutate the cached JSON array in memory
              filteredIHands = { 
                  left: filteredIHands.left ? { ...filteredIHands.left, landmarks: [...filteredIHands.left.landmarks] } : null,
                  right: filteredIHands.right ? { ...filteredIHands.right, landmarks: [...filteredIHands.right.landmarks] } : null
              };
              if (filteredIHands.left?.landmarks) {
                  filteredIHands.left.landmarks = instructorLeftHandFilterRef.current.filter(filteredIHands.left.landmarks, now);
              }
              if (filteredIHands.right?.landmarks) {
                  filteredIHands.right.landmarks = instructorRightHandFilterRef.current.filter(filteredIHands.right.landmarks, now);
              }
          }

          instructorCurrentLmRef.current = {
             ...frameData,
             landmarks: filteredIL,
             worldLandmarks: filteredIWorld.length > 0 ? filteredIWorld : frameData.worldLandmarks,
             hands: filteredIHands
          };
        }

        // Calculate Score (3D Angle-Based Engine / Law of Cosines)
        const pData = playerLiveLmRef.current as any;
        const lagCompIndex = Math.max(0, frameIndexRef.current - 6);
        const iData = frames[lagCompIndex] || {};

        let currentPL = pData?.landmarks || [];
        let iL = iData?.landmarks || [];
        
        // Upgrade to True 3D depth angles if both feeds have high-fidelity worldLandmarks
        if (pData?.worldLandmarks?.length === 33 && iData?.worldLandmarks?.length === 33) {
            currentPL = pData.worldLandmarks;
            iL = iData.worldLandmarks;
        }
        
        if (currentPL && currentPL.length >= 33 && iL && iL.length >= 33) {
            const getAngle = (a: any, b: any, c: any) => {
              if (!a || !b || !c || a.visibility < 0.2 || b.visibility < 0.2 || c.visibility < 0.2) return null;
              const ba = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z).normalize();
              const bc = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z).normalize();
              // Safety check for collinear points preventing NaN
              const dot = Math.max(-1.0, Math.min(1.0, ba.dot(bc)));
              return Math.acos(dot) * (180 / Math.PI);
            };

            // Player Left Side maps to Instructor Right Side (Mirror Play)
            const anglesToTrack = [
              { name: "L_Elbow", p: [12, 14, 16], i: [11, 13, 15] },
              { name: "R_Elbow", p: [11, 13, 15], i: [12, 14, 16] },
              { name: "L_Shoulder_Elev", p: [24, 12, 14], i: [23, 11, 13] },
              { name: "R_Shoulder_Elev", p: [23, 11, 13], i: [24, 12, 14] },
              { name: "L_Shoulder_Abd", p: [11, 12, 14], i: [12, 11, 13] },
              { name: "R_Shoulder_Abd", p: [12, 11, 13], i: [11, 12, 14] },
              { name: "L_Knee", p: [24, 26, 28], i: [23, 25, 27] },
              { name: "R_Knee", p: [23, 25, 27], i: [24, 26, 28] },
              { name: "L_Hip_Elev", p: [12, 24, 26], i: [11, 23, 25] },
              { name: "R_Hip_Elev", p: [11, 23, 25], i: [12, 24, 26] },
              { name: "L_Hip_Abd", p: [23, 24, 26], i: [24, 23, 25] },
              { name: "R_Hip_Abd", p: [24, 23, 25], i: [23, 24, 26] }
            ];

            let totalDiff = 0;
            let validAngles = 0;

            anglesToTrack.forEach(angle => {
               const pA = currentPL[angle.p[0]], pB = currentPL[angle.p[1]], pC = currentPL[angle.p[2]];
               const iA = iL[angle.i[0]], iB = iL[angle.i[1]], iC = iL[angle.i[2]];
               
               const pVal = getAngle(pA, pB, pC);
               const iVal = getAngle(iA, iB, iC);
               
               // Dynamic Desktop Occlusion:
               // If the player is at a desk and their knees are hidden, pVal returns null.
               // We safely ignore it and only grade the visible upper body joints!
               if (pVal !== null && iVal !== null) {
                   totalDiff += Math.abs(pVal - iVal);
                   validAngles += 1;
               }
            });

            let currentSync = 0;
            if (validAngles > 0) {
               const avgDiff = totalDiff / validAngles;
               
               // 15-Degree Perfect Tolerance Window
               if (avgDiff <= 15) {
                   currentSync = 100;
               } else {
                   // Linearly decay score down to 0 if they are 45+ degrees off
                   const maxTolerance = 45;
                   currentSync = Math.max(0, 100 * (1 - ((avgDiff - 15) / (maxTolerance - 15))));
               }
            }
            
            // --- 1. Hand Posture Matching (Aperture) ---
            // Highly efficient alternative to measuring 42 finger angles. Measures the spread/curl of the hand.
            const calculateAperture = (handLms: any) => {
                if (!handLms || handLms.length < 21) return null;
                const p0 = handLms[0];
                const tips = [handLms[8], handLms[12], handLms[16], handLms[20]];
                let sumDist = 0;
                tips.forEach(tip => {
                    // Use fast Euclidean distance for spread
                    sumDist += Math.hypot(tip.x - p0.x, tip.y - p0.y, tip.z - p0.z);
                });
                return sumDist / 4;
            };

            // Mirror Play mapping: Player Left vs Instructor Right
            const pLeftHand = pData?.hands?.left?.worldLandmarks || pData?.hands?.left?.landmarks;
            const iRightHand = iData?.hands?.right?.worldLandmarks || iData?.hands?.right?.landmarks;
            const pRightHand = pData?.hands?.right?.worldLandmarks || pData?.hands?.right?.landmarks;
            const iLeftHand = iData?.hands?.left?.worldLandmarks || iData?.hands?.left?.landmarks;

            const pLAperture = calculateAperture(pLeftHand);
            const iRAperture = calculateAperture(iRightHand);
            const pRAperture = calculateAperture(pRightHand);
            const iLAperture = calculateAperture(iLeftHand);

            let apertureBonus = 0;
            // If both hands are tracked and their aperture (e.g. Fist vs Open Palm) matches within a tight 0.08 threshold
            if (pLAperture !== null && iRAperture !== null && Math.abs(pLAperture - iRAperture) < 0.08) apertureBonus += 2.5;
            if (pRAperture !== null && iLAperture !== null && Math.abs(pRAperture - iLAperture) < 0.08) apertureBonus += 2.5;

            currentSync = Math.min(100, currentSync + apertureBonus);

            // --- 2. Facial Expression Bonus (Zen Multiplier) ---
            let isZenActive = false;
            if (pData?.blendshapes) {
                const smileLeft = pData.blendshapes.find((b: any) => b.categoryName === "mouthSmileLeft")?.score || 0;
                const smileRight = pData.blendshapes.find((b: any) => b.categoryName === "mouthSmileRight")?.score || 0;
                // If the player holds a genuine smile during the movement
                if ((smileLeft + smileRight) / 2 > 0.4) {
                    isZenActive = true;
                }
            }
            
            // Maintain legacy array structure to prevent crashes in other components
            snappedPlayerLmRef.current = pData?.landmarks || [];
            syncRef.current = currentSync;

            // Combo & Scoring Math
            if (currentSync > 85) {
              comboRef.current++;
              
              // Pop-up Feedback Triggers (Replaced "Pilates Master" with premium alignment phrases)
              if (comboRef.current === 15) { setFeedbackMsg({ text: "PERFECT ALIGNMENT", id: Date.now() }); }
              if (comboRef.current === 35) { setFeedbackMsg({ text: "BEAUTIFUL FORM", id: Date.now() }); }
              if (comboRef.current === 60) { setFeedbackMsg({ text: "EXQUISITE CONTROL", id: Date.now() }); }
              if (comboRef.current === 90) { setFeedbackMsg({ text: "FLAWLESS SYNCHRONIZATION", id: Date.now() }); }
              if (comboRef.current === 120) { setFeedbackMsg({ text: "INCREDIBLE FLOW", id: Date.now() }); }
              if (comboRef.current === 160) { setFeedbackMsg({ text: "TOTAL BODY HARMONY", id: Date.now() }); }
              if (comboRef.current === 200) { setFeedbackMsg({ text: "UNSTOPPABLE MOMENTUM", id: Date.now() }); }
              if (comboRef.current === 250) { setFeedbackMsg({ text: "PRECISION AND POWER", id: Date.now() }); }
              
              if (isZenActive && comboRef.current % 45 === 0) {
                  setFeedbackMsg({ text: "ZEN BONUS ACTIVE ✨", id: Date.now() });
              }

              const multiplier = Math.floor(comboRef.current / 10) + 1;
              let frameScore = 10 * multiplier;
              if (isZenActive) frameScore += 5; // Flat +5 point injection every frame for maintaining composure
              
              scoreRef.current += frameScore;
            } else if (currentSync < 65) {
              // Break combo
              comboRef.current = 0;
              setFeedbackMsg(null);
            }

            // Update Score UI safely without thrashing React State
            const rateElem = document.getElementById("sync-rate");
            if (rateElem) rateElem.innerText = `${Math.round(currentSync)}%`;

            const scoreElem = document.getElementById("score-display");
            if (scoreElem) scoreElem.innerText = scoreRef.current.toString();
          }
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => { active = false; cancelAnimationFrame(animationFrameId); };
  }, [isPlaying]);


  if (!movement || isLoading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-cyan-500 animate-pulse font-medium">
          Loading 3D Engine & Holograms...
        </div>
      </>
    );
  }

  if (isLobby) {
    return (
      <AvatarSelectorLobby
        playerAvatarUrl={playerAvatarUrl}
        setPlayerAvatarUrl={setPlayerAvatarUrl}
        instructorAvatarUrl={instructorAvatarUrl}
        setInstructorAvatarUrl={setInstructorAvatarUrl}
        onStart={() => setIsLobby(false)}
      />
    );
  }

  return (
    <div className="h-screen w-full bg-black overflow-hidden flex flex-col relative">
      {/* Hidden Webcam for MediaPipe Tracking */}
      <div className="hidden">
        <Webcam 
          ref={webcamRef}
          audio={false}
          mirrored={true}
          videoConstraints={{ facingMode: "user" }}
        />
      </div>

      {/* R3F WebGL Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 2, 25], fov: 45 }}>
          <color attach="background" args={['#050510']} />
          <fog attach="fog" args={['#050510', 35, 65]} />
          
          {/* Studio Lighting Rig */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" castShadow />
          <pointLight position={[-10, 5, 10]} intensity={2} color="#00f2ff" />
          <Environment preset="city" />
          
          <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} />
          
          {/* Cyberpunk Training Grid */}
          <Grid 
            position={[0, -2.8, 0]} 
            args={[50, 50]} 
            cellColor="#ffffff" 
            cellThickness={0.5} 
            sectionColor="#ffffff" 
            sectionThickness={1} 
            sectionSize={3} 
            fadeDistance={30} 
            fadeStrength={1}
            infiniteGrid
          />
          
          
          
          <React.Suspense fallback={null}>
            {/* The Instructor (Core Character) */}
            <VRMAvatar 
              landmarksRef={instructorCurrentLmRef} 
              positionOffset={[-5, 0, 0]} 
              isPlaying={isPlaying}
              vrmUrl={instructorAvatarUrl}
              name={getAvatarName(instructorAvatarUrl)}
            />
            
            {/* The Player (Live) - Reacts directly to raw webcam feed */}
            <VRMAvatar 
              landmarksRef={playerLiveLmRef} 
              positionOffset={[5, 0, 0]} 
              isPlayer={true}
              isPlaying={isPlaying}
              syncRef={syncRef}
              vrmUrl={playerAvatarUrl}
              name={getAvatarName(playerAvatarUrl)}
            />

            {/* Magic Sparkles on high performance */}
            {/* Magic Sparkles on high performance - Use live feed */}
            <Sparkles landmarksRef={playerLiveLmRef} jointIndices={[15, 16, 27, 28]} syncRef={syncRef} />
          </React.Suspense>
        </Canvas>
      </div>

      {/* Cyberpunk HUD Overlay */}
      <div className="relative z-10 p-8 flex flex-col h-full pointer-events-none" style={{ isolation: 'isolate' }}>
        
        {/* Combo Feedback Pop-up */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <AnimatePresence mode="wait">
            {feedbackMsg && (
              <motion.div
                key={feedbackMsg.id}
                initial={{ scale: 0.1, rotate: -20, opacity: 0 }}
                animate={{ scale: 1.5, rotate: 0, opacity: 1 }}
                exit={{ scale: 2, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="text-white font-black italic text-7xl drop-shadow-[0_0_30px_rgba(255,184,0,0.8)]"
                style={{ WebkitBackfaceVisibility: 'hidden' }}
              >
                {feedbackMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Session Complete Modal */}
        {isComplete && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl pointer-events-auto">
            <div className="bg-white/5 border border-white/10 rounded-[32px] p-12 max-w-lg w-full shadow-[0_0_50px_rgba(0,242,255,0.2)] flex flex-col items-center">
              <Typography className="text-[#CCFF00] font-black tracking-[0.3em] uppercase text-sm mb-2">
                Session Complete
              </Typography>
              <Typography className="text-white font-black text-5xl uppercase tracking-tight mb-8 text-center">
                {movement.title}
              </Typography>
              
              <div className="flex flex-col items-center justify-center w-full bg-black/40 rounded-3xl p-8 mb-10 border border-white/5">
                <Typography className="text-white/60 font-bold tracking-[0.2em] uppercase text-xs mb-2">Final Score</Typography>
                <Typography className="text-[#FF3300] font-black text-7xl drop-shadow-[0_0_20px_rgba(255,51,0,0.6)]">
                  {scoreRef.current}
                </Typography>
              </div>

              <div className="flex w-full gap-4">
                <Link href="/demos/movements" className="flex-1 text-center py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold tracking-widest uppercase transition-all">
                  Exit Match
                </Link>
                <button 
                  onClick={() => {
                    scoreRef.current = 0;
                    frameIndexRef.current = 0;
                    comboRef.current = 0;
                    const scoreElem = document.getElementById("score-display");
                    if (scoreElem) scoreElem.innerText = "0";
                    const rateElem = document.getElementById("sync-rate");
                    if (rateElem) rateElem.innerText = "0%";
                    setIsComplete(false);
                    setIsPlaying(true);
                  }}
                  className="flex-1 py-4 rounded-2xl bg-[#CCFF00] text-black hover:bg-white font-black tracking-widest uppercase transition-all hover:scale-105"
                >
                  Rematch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top Bar (Horizontal Cockpit) */}
        <div className="flex justify-between items-center bg-white/5 backdrop-blur-3xl border border-white/10 p-3 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] pointer-events-auto">
          
          <Link href="/demos/movements" className="flex items-center justify-center gap-2 text-[12px] font-bold text-white/70 hover:text-white transition-colors bg-black/40 px-5 py-3 rounded-2xl border border-white/5">
            <ArrowLeft className="w-4 h-4" /> EXIT MATCH
          </Link>
          
          <div className="flex items-center gap-6 px-8">
            <div className="flex flex-col items-end">
              <Typography className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
                Instructor Routine
              </Typography>
              <Typography className="text-xl font-black text-white uppercase tracking-tight leading-none mt-1">
                {movement.title || "Unknown"}
              </Typography>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <span className="px-3 py-1.5 bg-white/10 rounded-md text-[10px] font-bold text-white/90 uppercase tracking-widest">
              {movement.difficulty || "Beginner"}
            </span>
          </div>

          <div className="flex items-center gap-4 bg-black/40 px-6 py-2 rounded-2xl border border-white/5">
            <Flame className="w-6 h-6 text-[#FF3300] drop-shadow-[0_0_15px_rgba(255,51,0,0.8)]" />
            <div className="flex flex-col">
              <Typography className="text-[10px] font-bold tracking-widest text-[#FF3300] uppercase">Total Score</Typography>
              <Typography className="text-3xl font-black text-white leading-none mt-1" id="score-display">0</Typography>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-auto flex justify-between items-end pointer-events-auto">
          
          {/* Playback Controls */}
          <div className="bg-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 p-2 pr-8 rounded-full flex items-center gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-16 h-16 bg-[#CCFF00] hover:bg-white rounded-full flex items-center justify-center text-black transition-all hover:scale-105 active:scale-95"
                >
                  {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
                </button>
                <div className="flex flex-col">
                  <span className="text-white font-bold tracking-wide text-lg">
                    {isPlaying ? "Match Sequence" : "System Ready"}
                  </span>
                  <span className="text-xs font-black tracking-[0.2em] text-[#CCFF00] uppercase" id="calibration-status">
                    {isPlaying ? "Active" : "Ready"}
                  </span>
                </div>
              </div>
          </div>

          {/* Real-time Sync Rate */}
          <div className="flex items-center gap-5 bg-white/5 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 rounded-full pr-10 pl-5 py-4">
            <div className="w-12 h-12 rounded-full bg-[#CCFF00]/20 flex items-center justify-center border border-[#CCFF00]/50">
              <Crosshair className="w-6 h-6 text-[#CCFF00]" />
            </div>
            <div className="flex flex-col">
              <Typography className="text-[11px] font-bold tracking-widest text-[#CCFF00] uppercase">Sync Rate</Typography>
              <Typography className="text-4xl font-black text-white" id="sync-rate">0%</Typography>
            </div>
          </div>
        </div>
        {/* Webcam Picture-in-Picture */}
        <div className="absolute bottom-6 right-6 w-40 h-24 bg-black/50 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md pointer-events-auto">
          <Webcam
            ref={webcamRef}
            audio={false}
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
        </div>
      </div>

      {/* Session Complete Modal */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0B0C10] backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
              className="bg-[#13141C]/80 border border-white/5 rounded-[32px] p-10 overflow-hidden relative shadow-[0_0_100px_rgba(204,255,0,0.05)] w-full max-w-[480px] flex flex-col items-center"
            >
              {/* Radial Glow */}
              <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#CCFF00]/10 rounded-full blur-[80px] pointer-events-none" />

              <h2 className="text-[#CCFF00] font-light tracking-[0.12em] text-sm mb-3 relative z-10">
                SESSION COMPLETE
              </h2>
              <h1 className="text-white font-bold text-xl mb-10 relative z-10 uppercase tracking-widest">
                FULL BODY CAPTURE
              </h1>

              <div className="bg-[#0B0C10] border border-white/5 rounded-[24px] p-10 w-full flex flex-col items-center mb-10 relative z-10 shadow-inner">
                <span className="text-gray-400 font-semibold tracking-[0.2em] text-xs uppercase mb-4">FINAL SCORE</span>
                <span className="text-5xl font-black text-[#FF3300] tracking-tight">{scoreRef.current}</span>
              </div>

              <div className="flex w-full gap-4 relative z-10">
                <button
                  onClick={() => {
                    setIsComplete(false);
                    setIsLobby(true);
                    frameIndexRef.current = 0;
                    scoreRef.current = 0;
                    comboRef.current = 0;
                    syncRef.current = 100;
                  }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold tracking-widest text-sm py-5 rounded-[16px] transition-all duration-300 border border-white/5"
                >
                  EXIT MATCH
                </button>
                <button
                  onClick={() => {
                    setIsComplete(false);
                    frameIndexRef.current = 0;
                    scoreRef.current = 0;
                    comboRef.current = 0;
                    syncRef.current = 100;
                    setIsPlaying(true);
                  }}
                  className="flex-1 bg-[#CCFF00] hover:bg-[#b3ff00] text-black font-black tracking-widest text-sm py-5 rounded-[16px] transition-all duration-300 shadow-[0_0_20px_rgba(204,255,0,0.2)] hover:shadow-[0_0_30px_rgba(204,255,0,0.4)]"
                >
                  REMATCH
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
