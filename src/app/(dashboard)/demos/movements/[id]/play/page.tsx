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

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";
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
    
    const lms = landmarksRef.current || [];
    if (lms.length < 33) return;

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

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [syncRate, setSyncRate] = useState(100);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const instructorFramesRef = useRef<any>([]);
  const instructorCurrentLmRef = useRef<any>([]);
  const playerLiveLmRef = useRef<any>([]);
  const snappedPlayerLmRef = useRef<any>([]);
  const frameIndexRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0); // Add Combo Counter
  const syncRef = useRef(0); // Live sync percentage for 3D materials
  
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 30, 0.05, 0.1));
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
          const smoothed = poseFilterRef.current.filter(raw, startTimeMs);
          playerLiveLmRef.current = smoothed;

          // Mirror Phase Calibration UI update
          const calElem = document.getElementById("calibration-status");
          if (calElem) {
             const isCalib = raw[11]?.visibility > 0.3 && raw[12]?.visibility > 0.3 && raw[23]?.visibility > 0.3 && raw[24]?.visibility > 0.3;
             if (isCalib) {
                calElem.innerText = "CALIBRATED - READY";
                calElem.className = "text-sm font-semibold tracking-wider text-green-400";
             } else {
                calElem.innerText = "STAND IN FRAME...";
                calElem.className = "text-sm font-semibold tracking-wider text-yellow-500 animate-pulse";
             }
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
          const iL = frameData.pose ? frameData.pose : Array.isArray(frameData) ? frameData : (frameData?.landmarks || []);
          instructorCurrentLmRef.current = iL;
        }

        // Calculate Score (Basic Distance Math)
        const currentPL = playerLiveLmRef.current;
        
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
              if (comboRef.current === 10) setFeedbackMsg("GREAT!");
              if (comboRef.current === 25) setFeedbackMsg("AMAZING!");
              if (comboRef.current === 45) setFeedbackMsg("PILATES MASTER!");

              const multiplier = Math.floor(comboRef.current / 10) + 1;
              const frameScore = 10 * multiplier;
              scoreRef.current += frameScore;
            } else if (currentSync < 65) {
              // Break combo
              comboRef.current = 0;
              if (feedbackMsg) setFeedbackMsg("");
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
          
          {/* Studio Lighting Rig */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={1} color="#ffffff" castShadow />
          <pointLight position={[-10, 5, 10]} intensity={2} color="#00f2ff" />
          <Environment preset="city" />
          
          <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} />
          
          {/* Floor grid for depth */}
          <gridHelper args={[50, 50, '#112233', '#0a0a1a']} position={[0, -8, 0]} />
          
          <React.Suspense fallback={null}>
            {/* The Instructor (Core Character) */}
            <CartoonAvatar 
              landmarksRef={instructorCurrentLmRef} 
              positionOffset={[0, 0, 0]} 
              baseOpacity={1} 
            />
            
            {/* The Player (Live) - Snapped for visual satisfaction */}
            <CartoonAvatar 
              landmarksRef={snappedPlayerLmRef} 
              positionOffset={[0, 0, 0]} 
              isPlayer={true}
              syncRef={syncRef}
            />

            {/* Magic Sparkles on high performance */}
            <Sparkles landmarksRef={snappedPlayerLmRef} jointIndices={[15, 16, 27, 28]} syncRef={syncRef} />
          </React.Suspense>
        </Canvas>
      </div>

      {/* Cyberpunk HUD Overlay */}
      <div className="relative z-10 p-8 flex flex-col h-full pointer-events-none" style={{ isolation: 'isolate' }}>
        
        {/* Combo Feedback Pop-up */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <AnimatePresence>
            {feedbackMsg && (
              <motion.div
                initial={{ scale: 0.1, rotate: -20, opacity: 0 }}
                animate={{ scale: 1.5, rotate: 0, opacity: 1 }}
                exit={{ scale: 2, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="text-white font-black italic text-7xl drop-shadow-[0_0_30px_rgba(255,184,0,0.8)]"
                style={{ WebkitBackfaceVisibility: 'hidden' }}
              >
                {feedbackMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Top Bar */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-4 pointer-events-auto">
            <Link href="/demos/movements" className="flex items-center gap-2 text-[13px] font-medium text-white/70 hover:text-white transition-colors bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 w-fit">
              <ArrowLeft className="w-4 h-4" /> Exit Match
            </Link>
            
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-5 rounded-2xl flex flex-col gap-1 min-w-[240px]">
              <Typography className="text-[11px] font-bold tracking-widest text-cyan-400 uppercase">
                Instructor Routine
              </Typography>
              <Typography className="text-xl font-medium text-white">
                {movement.title || "Unknown"}
              </Typography>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-1 bg-white/10 rounded text-[10px] font-bold text-white/70 uppercase">
                  {movement.difficulty || "Beginner"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-6 rounded-3xl flex flex-col items-center min-w-[140px] shadow-2xl">
            <Flame className="w-6 h-6 text-fuchsia-500 mb-2 drop-shadow-[0_0_15px_rgba(217,70,239,0.8)]" />
            <Typography className="text-[11px] font-bold tracking-widest text-fuchsia-400 uppercase mb-1">Total Score</Typography>
            <Typography className="text-4xl font-black text-white drop-shadow-md" id="score-display">0</Typography>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-auto flex justify-between items-end pointer-events-auto">
          
          {/* Playback Controls */}
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-2 pr-6 rounded-full flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-14 h-14 bg-cyan-400 hover:bg-cyan-300 rounded-2xl flex items-center justify-center text-black transition-all hover:scale-105 active:scale-95"
                >
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
                <div className="flex flex-col">
                  <span className="text-white font-medium text-lg">
                    {isPlaying ? "Match Sequence" : "Standby Mode"}
                  </span>
                  <span className="text-sm font-semibold tracking-wider text-zinc-500" id="calibration-status">
                    {isPlaying ? "STATUS: ACTIVE" : "AWAITING CALIBRATION..."}
                  </span>
                </div>
              </div>
          </div>

          {/* Real-time Sync Rate */}
          <div className="flex items-center gap-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full pr-8 pl-4 py-3">
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Crosshair className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex flex-col">
              <Typography className="text-[11px] font-bold tracking-widest text-cyan-400 uppercase">Sync Rate</Typography>
              <Typography className="text-3xl font-black text-white" id="sync-rate">0%</Typography>
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
