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
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
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
  syncRef,
  vrmUrl,
  name,
}: { 
  landmarksRef: React.MutableRefObject<any>, 
  positionOffset: [number, number, number],
  isPlayer?: boolean,
  syncRef?: React.MutableRefObject<number>,
  vrmUrl: string,
  name: string,
}) => {
  const group = useRef<THREE.Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const instructorFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));

  // useLoader cache keys are just the URL, so to load two separate instances:
  const urlToLoad = isPlayer ? `${vrmUrl}?player` : vrmUrl;
  
  const gltf = useLoader(GLTFLoader, urlToLoad, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser as any) as any);
  });

  useEffect(() => {
    if (gltf && gltf.userData.vrm) {
      const vrm = gltf.userData.vrm;
      vrmRef.current = vrm;
      // Note: We rotate the parent Group, not the internal scene, to keep bone math stable.
      // Both the Instructor and the Player now render using their native 3D materials.
    }
  }, [gltf, isPlayer]);

  useFrame((state, delta) => {
    if (!vrmRef.current || !group.current) return;
    vrmRef.current.update(delta);
    
    // 1. Resolve Landmarks Array
    const lms = landmarksRef.current;
    if (!lms) return;
    const raw = Array.isArray(lms) ? lms : (lms?.pose || lms?.landmarks || []);
    if (!raw || raw.length < 33) return;

    // Standard Decoder
    const format = (lm: any) => ({
      x: typeof lm.x === "number" ? lm.x : (Array.isArray(lm) ? lm[0] : 0.5),
      y: typeof lm.y === "number" ? lm.y : (Array.isArray(lm) ? lm[1] : 0.5),
      z: typeof lm.z === "number" ? lm.z : (Array.isArray(lm) ? lm[2] : 0),
      visibility: lm.visibility || 0.8
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
         visibility: 0.9
       }));
    }

    // Solve IK for core body
    let riggedPose;
    try {
      riggedPose = Kalidokit.Pose.solve(solverLms, imageLms, {
        runtime: "mediapipe",
        video: null,
        imageSize: { width: 640, height: 480 },
      });
    } catch (e) { return; }

    if (riggedPose && vrmRef.current.humanoid) {
      // Dynamic Interpolation: Ghost needs instant snap (0.95), Instructor needs smooth 30fps bridging (0.3)
      const slerpFactor = isPlayer ? 0.95 : 0.3;

      const applyRot = (boneName: string, euler: any, overrideFactor?: number) => {
        if (!euler) return;
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        if (bone) {
          let targetEuler = new THREE.Euler(euler.x, euler.y, euler.z, euler.rotationOrder || "XYZ");
          if (boneName === "hips") { targetEuler.y = 0; targetEuler.z = 0; }
          bone.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetEuler), overrideFactor ?? slerpFactor);
        }
      };

      const rp = riggedPose;

      // 1. Core Physics Path: Body, Legs, Head
      if (rp.Hips) applyRot("hips", rp.Hips.rotation);
      applyRot("spine", rp.Spine);
      applyRot("chest", (rp as any).Chest);
      applyRot("upperChest", (rp as any).UpperChest);
      applyRot("neck", (rp as any).Neck);
      applyRot("head", (rp as any).Head);
      
      // Only apply Kalidokit collarbone physics if we have true 3D depth. 
      // Faked 2D depth causes collarbones to twist inward, making arms look short.
      if ((lms as any).worldLandmarks) {
        applyRot("rightShoulder", (rp as any).RightShoulder);
        applyRot("leftShoulder", (rp as any).LeftShoulder);
      }
      
      applyRot("rightUpperArm", rp.RightUpperArm);
      applyRot("rightLowerArm", rp.RightLowerArm);
      applyRot("rightHand", rp.RightHand);
      
      applyRot("leftUpperArm", rp.LeftUpperArm);
      applyRot("leftLowerArm", rp.LeftLowerArm);
      applyRot("leftHand", rp.LeftHand);
      
      // Because we passed pure data, Kalidokit natively handles the 180-degree reflection
      // without needing custom manual swaps or euler inversions.
      applyRot("rightUpperLeg", rp.RightUpperLeg);
      applyRot("rightLowerLeg", rp.RightLowerLeg);
      applyRot("rightFoot", (rp as any).RightFoot);
      
      applyRot("leftUpperLeg", rp.LeftUpperLeg);
      applyRot("leftLowerLeg", rp.LeftLowerLeg);
      applyRot("leftFoot", (rp as any).LeftFoot);
      
      const hips = vrmRef.current.humanoid.getNormalizedBoneNode("hips");
      if (hips && rp.Hips.position) {
         hips.position.y = rp.Hips.position.y * 0.1;
      }

      // Ensure matrices are updated after Kalidokit applies the base pose
      if (vrmRef.current.scene) {
        vrmRef.current.scene.updateMatrixWorld(true);
      }

      // 2. Vector-Based Forward Kinematics (FK) for Arms
      // This forces the mesh arms to perfectly match the directional vectors of the raw 'sticks'
      const aimBone = (boneName: string, childName: string, p1Idx: number, p2Idx: number) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        const child = vrmRef.current?.humanoid?.getNormalizedBoneNode(childName as any);
        if (!bone || !child) return;

        // Ensure matrices are fresh to read accurate world positions
        bone.updateWorldMatrix(true, false);
        child.updateWorldMatrix(true, false);

        const boneW = new THREE.Vector3();
        bone.getWorldPosition(boneW);

        const childW = new THREE.Vector3();
        child.getWorldPosition(childW);

        // Current bone direction
        const currentDir = childW.clone().sub(boneW).normalize();

        // Target stick direction
        const p1 = solverLms[p1Idx];
        const p2 = solverLms[p2Idx];
        
        let dz = p2.z - p1.z;
        // If using 2D fallback, the estimated Z-depth is wildly inaccurate for extreme poses like raised arms.
        // It causes the arms to point forward (foreshortening) instead of up. 
        // We heavily flatten the Z-axis to force the arms to stay parallel to the screen's X/Y plane.
        if (!((lms as any).worldLandmarks)) {
           dz *= 0.1;
        }

        // MediaPipe Y is down, Three.js Y is up. MediaPipe Z is away, Three.js Z is towards.
        // We removed the manual -(X) inversion because the avatar's root group is now 
        // rotated 180 degrees, natively mirroring the physical geometry.
        const desiredDir = new THREE.Vector3(
          (p2.x - p1.x), 
          -(p2.y - p1.y), 
          -dz
        ).normalize();

        // Calculate absolute world rotation needed
        const qOffset = new THREE.Quaternion().setFromUnitVectors(currentDir, desiredDir);

        const currentWorldQ = new THREE.Quaternion();
        bone.getWorldQuaternion(currentWorldQ);

        const targetWorldQ = qOffset.multiply(currentWorldQ);

        // Convert world rotation back to bone's local parent space
        if (bone.parent) {
            const parentWorldQ = new THREE.Quaternion();
            bone.parent.getWorldQuaternion(parentWorldQ);
            const localQ = parentWorldQ.invert().multiply(targetWorldQ);
            bone.quaternion.slerp(localQ, slerpFactor);
        }
        
        // Commit rotation so the next bone in the chain reads correctly
        bone.updateMatrixWorld(true);
      };

      // Force arm bones to perfectly match MediaPipe sticks using raw unmirrored assignments
      // 11 = Physical Left Arm -> Maps to leftUpperArm (Avatar's Physical Left, visually Screen Right)
      // 12 = Physical Right Arm -> Maps to rightUpperArm (Avatar's Physical Right, visually Screen Left)
      
      // Shoulders
      aimBone("rightShoulder", "rightUpperArm", 12, 14); 
      aimBone("leftShoulder", "leftUpperArm", 11, 13);
      // Arms
      aimBone("rightUpperArm", "rightLowerArm", 12, 14);
      aimBone("rightLowerArm", "rightHand", 14, 16);
      aimBone("leftUpperArm", "leftLowerArm", 11, 13);
      aimBone("leftLowerArm", "leftHand", 13, 15);
    }
  });

  return (
    <group 
      ref={group} 
      position={[positionOffset[0], -1, positionOffset[2]]} 
      rotation={[0, Math.PI, 0]}
      scale={3.5}
    >
      <primitive object={vrmRef.current ? vrmRef.current.scene : gltf.scene} />
      
      {/* Dynamic Nameplate */}
      <Html position={[0, 1.85, 0]} center zIndexRange={[100, 0]}>
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
  const [playerAvatarUrl, setPlayerAvatarUrl] = useState("/models/VIPE_Hero__949.vrm");
  const [instructorAvatarUrl, setInstructorAvatarUrl] = useState("/models/Eugenia.vrm");

  // Helper to get names
  const getAvatarName = (url: string) => AVATAR_ROSTER.find(a => a.path === url)?.name || "Unknown";

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [syncRate, setSyncRate] = useState(100);
  const [feedbackMsg, setFeedbackMsg] = useState<{text: string, id: number} | null>(null);

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
  
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const worldPoseFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);

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

  // 2. Init MediaPipe
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        if (active) setPoseLandmarker(landmarker);
      } catch (err) {
        console.error("PoseLandmarker failed", err);
      }
    };
    init();
    return () => { active = false; if (poseLandmarker) poseLandmarker.close(); };
  }, []);

  const webcamRef = useRef<Webcam>(null);

  // 3. Start Player Webcam Tracking
  useEffect(() => {
    let animationFrameId: number;

    const processVideo = () => {
      if (poseLandmarker && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
        const video = webcamRef.current.video;
        const startTimeMs = performance.now();
        const results = poseLandmarker.detectForVideo(video, startTimeMs);
        if (results && results.landmarks && results.landmarks.length > 0) {
          // Smooth the live tracking
          const raw = results.landmarks[0];
          const worldRaw = results.worldLandmarks ? results.worldLandmarks[0] : null;
          
          const smoothed = poseFilterRef.current.filter(raw, startTimeMs);
          const smoothedWorld = worldRaw ? worldPoseFilterRef.current.filter(worldRaw, startTimeMs) : null;
          
          // Store both normalized for UI and world for 3D physics
          playerLiveLmRef.current = {
            landmarks: smoothed,
            worldLandmarks: smoothedWorld
          };

          // Calibration UI update - simplified for seated use
          const calElem = document.getElementById("calibration-status");
          if (calElem) {
            calElem.innerText = "READY";
            calElem.className = "text-sm font-semibold tracking-wider text-green-400";
          }
        }
      }
      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (poseLandmarker) {
      processVideo();
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [poseLandmarker]);

  // 4. Playback Loop & Scoring Engine
  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 30; // 30 fps

    const gameLoop = (time: number) => {
      if (!active) return;
      animationFrameId = requestAnimationFrame(gameLoop);
      
      if (!isPlaying) return;

      const elapsed = time - lastDrawTime;
      
      if (elapsed > fpsInterval) {
        lastDrawTime = time - (elapsed % fpsInterval);

        const frames = instructorFramesRef.current || [];
        const totalFrames = frames.length;
        
        if (totalFrames > 0) {
          frameIndexRef.current = frameIndexRef.current + 1 >= totalFrames ? 0 : frameIndexRef.current + 1;
          
          const frameData = frames[frameIndexRef.current];
          // Pass the complete object so VRMAvatar can extract the high-fidelity worldLandmarks
          instructorCurrentLmRef.current = frameData;
        }

        // Calculate Score (Basic Distance Math)
        const plRef = playerLiveLmRef.current;
        const currentPL = Array.isArray(plRef) ? plRef : plRef?.landmarks || [];
        
        if (currentPL && currentPL.length >= 33) {
          // 1. Get Reaction-Compensated Instructor Frame (Temporal Slack)
          // Look back ~200ms (6 frames at 30fps) to account for human reaction time
          const frames = instructorFramesRef.current || [];
          const lagCompIndex = Math.max(0, frameIndexRef.current - 6);
          const lagFrameData = frames[lagCompIndex];
          const iL = lagFrameData.pose ? lagFrameData.pose : Array.isArray(lagFrameData) ? lagFrameData : (lagFrameData?.landmarks || []);

          if (iL && iL.length >= 33) {
            // 2. Calculate Scale Factor (Height) for both
            const getH = (lms: any) => {
              const head = lms[0];
              const ankleL = lms[27], ankleR = lms[28];
              const ankleY = (ankleL.y + ankleR.y) / 2;
              return Math.abs(ankleY - head.y);
            };
            
            const pHeight = getH(currentPL) || 0.5;
            const iHeight = getH(iL) || 0.5;
            
            // 3. Hip Center (Reference Point)
            const getHip = (lms: any) => ({
              x: (lms[23].x + lms[24].x) / 2,
              y: (lms[23].y + lms[24].y) / 2
            });
            
            const pHip = getHip(currentPL);
            const iHip = getHip(iL);

            // 4. Compare Wrists and Ankles (Normalized)
            let delta = 0;
            const snappedLM = currentPL.map((lm: any) => ({ ...lm })); // Clone for Magnetism

            [15, 16, 27, 28].forEach(idx => {
               if (currentPL[idx] && iL[idx]) {
                 // Offset to hip and scale to match instructor's height
                 const px = (currentPL[idx].x - pHip.x) * (iHeight / pHeight);
                 const py = (currentPL[idx].y - pHip.y) * (iHeight / pHeight);
                 
                 const ix = iL[idx].x - iHip.x;
                 const iy = iL[idx].y - iHip.y;
                 
                 const dx = px - ix;
                 const dy = py - iy;
                 const jointDist = Math.sqrt(dx*dx + dy*dy);
                 delta += jointDist;

                 // STICKY SNAP: If close enough, lock the ghost to the instructor
                 if (jointDist < 0.12) {
                   const targetX = pHip.x + (ix * pHeight / iHeight);
                   const targetY = pHip.y + (iy * pHeight / iHeight);
                   snappedLM[idx].x = THREE.MathUtils.lerp(currentPL[idx].x, targetX, 0.8);
                   snappedLM[idx].y = THREE.MathUtils.lerp(currentPL[idx].y, targetY, 0.8);
                   snappedLM[idx].isSnapped = true;
                 }
               }
            });
            
            snappedPlayerLmRef.current = snappedLM;

            const avgDelta = delta / 4;
            // Comfort Math: Gaussian/Exponential decay for forgiving scores
            let currentSync = 100 * Math.exp(-avgDelta * 3.5);
            if (currentSync < 5) currentSync = 0;
            if (currentSync > 100) currentSync = 100;

            syncRef.current = currentSync;

            // Combo & Scoring Math
            if (currentSync > 85) {
              comboRef.current++;
              
              // Pop-up Feedback Triggers
              if (comboRef.current === 10) { setFeedbackMsg({ text: "GREAT!", id: Date.now() }); }
              if (comboRef.current === 25) { setFeedbackMsg({ text: "AMAZING!", id: Date.now() }); }
              if (comboRef.current === 45) { setFeedbackMsg({ text: "PILATES MASTER!", id: Date.now() }); }

              const multiplier = Math.floor(comboRef.current / 10) + 1;
              const frameScore = 10 * multiplier;
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
        }
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
              vrmUrl={instructorAvatarUrl}
              name={getAvatarName(instructorAvatarUrl)}
            />
            
            {/* The Player (Live) - Reacts directly to raw webcam feed */}
            <VRMAvatar 
              landmarksRef={playerLiveLmRef} 
              positionOffset={[5, 0, 0]} 
              isPlayer={true}
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
        <div className="absolute bottom-6 right-6 w-80 h-48 bg-black/50 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md pointer-events-auto">
          <Webcam
            ref={webcamRef}
            audio={false}
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
        </div>
      </div>
    </div>
  );
}
