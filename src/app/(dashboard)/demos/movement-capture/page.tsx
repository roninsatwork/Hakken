"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import Header from "@/src/ui/components/layout/Header";
import { FilesetResolver, PoseLandmarker, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, NormalizedLandmark, Classifications } from "@mediapipe/tasks-vision";
import Typography from "@/src/ui/atoms/typography";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type HandSide = "left" | "right";

type HandCapture = {
  landmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[] | null;
};

type MovementCaptureFrame = {
  timestamp: number;
  landmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[] | null;
  blendshapes?: Classifications["categories"];
  hands?: Record<HandSide, HandCapture | null>;
};

export default function MovementCapturePage() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [cameraError, setCameraError] = useState(false);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recordedFramesRef = useRef<MovementCaptureFrame[]>([]);
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const worldPoseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  
  // Hand Jitter Filters
  const leftHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 0.05, 0.1));
  const rightHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 0.05, 0.1));
  const leftHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 0.05, 0.1));
  const rightHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 0.05, 0.1));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [isSaving, setIsSaving] = useState(false);

  const createMovement = useMutation(api.movements.create);
  const generateUploadUrl = useMutation(api.movements.generateUploadUrl);
  const router = useRouter();

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

  // Initialize MediaPipe Triad
  useEffect(() => {
    let active = true;
    let createdPose: PoseLandmarker | null = null;
    let createdFace: FaceLandmarker | null = null;
    let createdHands: HandLandmarker | null = null;

    const initModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
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
        createdPose = pose;
        createdFace = face;
        createdHands = hands;
        if (active) {
          setPoseLandmarker(pose);
          setFaceLandmarker(face);
          setHandLandmarker(hands);
        }
      } catch (err) {
        console.error("Failed to load MediaPipe Vision Triad", err);
      }
    };
    initModel();
    return () => {
      active = false;
      createdPose?.close();
      createdFace?.close();
      createdHands?.close();
    };
  }, []);

  // Frame processing loop
  useEffect(() => {
    let animationFrameId: number;

    const processVideo = () => {
      if (
        poseLandmarker && faceLandmarker && handLandmarker &&
        webcamRef.current &&
        webcamRef.current.video &&
        webcamRef.current.video.readyState === 4 &&
        canvasRef.current
      ) {
        const video = webcamRef.current.video;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Match canvas dimensions to video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Perform concurrent multi-model inference
        const startTimeMs = performance.now();
        const poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = handLandmarker.detectForVideo(video, startTimeMs);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (poseResults.landmarks && poseResults.landmarks.length > 0) {
            // Apply 1€ Filter to smooth out stationary jitter
            const smoothedLandmarks = poseFilterRef.current.filter(poseResults.landmarks[0], startTimeMs);
            
            // Extract and smooth worldLandmarks (3D Depth) if available
            const rawWorld = poseResults.worldLandmarks ? poseResults.worldLandmarks[0] : null;
            const smoothedWorld = rawWorld ? worldPoseFilterRef.current.filter(rawWorld, startTimeMs) : null;

            // Visibility Gate: Guarantee 60% confidence on core anchors to prevent baking mangled AI hallucinations into the JSON
            const p11 = smoothedLandmarks[11];
            const p12 = smoothedLandmarks[12];
            const p23 = smoothedLandmarks[23];
            const p24 = smoothedLandmarks[24];
            const avgCoreVis = ((p11?.visibility || 0) + (p12?.visibility || 0) + (p23?.visibility || 0) + (p24?.visibility || 0)) / 4;

            if (avgCoreVis >= 0.6) {
                // Construct unified payload
                const currentData: MovementCaptureFrame = {
                    timestamp: startTimeMs,
                    landmarks: smoothedLandmarks,
                    worldLandmarks: smoothedWorld
                };

                if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
                    currentData.blendshapes = faceResults.faceBlendshapes[0].categories;
                }

                if (handResults.landmarks && handResults.landmarks.length > 0) {
                    const handsPayload: Record<HandSide, HandCapture | null> = { left: null, right: null };
                    currentData.hands = handsPayload;
                    
                    const leftWristPose = smoothedLandmarks[15];
                    const rightWristPose = smoothedLandmarks[16];
                    
                    handResults.landmarks.forEach((handLms, index) => {
                        const handWrist = handLms[0];
                        let side: HandSide = "right";
                        
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

                        handsPayload[side] = {
                            landmarks: smoothedHandLms,
                            worldLandmarks: smoothedHandWorld
                        };
                    });
                }

                // Record if active
                if (isRecording) {
                  recordedFramesRef.current.push(currentData);
                }

                // Draw Neon Skeleton
                drawCyberZenSkeleton(ctx, smoothedLandmarks, canvas.width, canvas.height);
            }


          }
        }
      }
      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (poseLandmarker && faceLandmarker && handLandmarker) {
      processVideo();
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [poseLandmarker, faceLandmarker, handLandmarker, isRecording]);

  const drawCyberZenSkeleton = (ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) => {
    ctx.strokeStyle = "#0ff"; // Cyan neon
    ctx.lineWidth = 4;
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = 15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Standard POSE_CONNECTIONS indices for MediaPipe
    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Upper body arms
      [11, 23], [12, 24], [23, 24], // Torso
      [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30] // Legs
    ];

    // Draw connections
    ctx.beginPath();
    connections.forEach(([start, end]) => {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
        ctx.moveTo((1 - p1.x) * width, p1.y * height);
        ctx.lineTo((1 - p2.x) * width, p2.y * height);
      }
    });
    ctx.stroke();

    // Draw joints
    ctx.fillStyle = "#f0f"; // Magenta nodes
    ctx.shadowColor = "#f0f";
    landmarks.forEach((landmark) => {
      if (landmark.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc((1 - landmark.x) * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  };

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      setShowSaveModal(true);
    } else {
      recordedFramesRef.current = [];
      setIsRecording(true);
    }
  }, [isRecording]);

  const handleSave = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordedFramesRef.current),
      });
      const { storageId } = await result.json();

      await createMovement({
        title,
        difficulty,
        poseData: storageId,
      });
      
      setShowSaveModal(false);
      router.push("/demos/movements");
    } catch (e) {
      console.error("Failed to save movement:", e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        <div className="w-full flex justify-start">
          <Link href="/demos/movements" className="flex items-center gap-2 text-[13px] font-medium text-secondary hover:text-foreground transition-colors px-4 py-2 bg-sidebar/50 rounded-[10px] border border-border-dim w-fit shadow-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </Link>
        </div>
        
        {cameraError ? (
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 w-full text-center backdrop-blur-3xl shadow-2xl">
            <Typography className="text-white text-xl font-light tracking-wide mb-4">
              Camera Access Denied
            </Typography>
            <Typography className="text-gray-400">
              We need access to your camera to demonstrate the movement capture. Please allow camera access in your browser settings and refresh the page.
            </Typography>
          </div>
        ) : (
          <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-gray-900 border border-gray-800 shadow-[0_0_50px_rgba(0,255,255,0.1)]">
            <Webcam
              ref={webcamRef}
              onUserMediaError={() => setCameraError(true)}
              className="absolute inset-0 w-full h-full object-contain"
              mirrored={true}
              videoConstraints={{
                facingMode: "user"
              }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
            />

            {/* Overlays */}
            <div className="absolute top-4 left-4 z-20">
              <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${poseLandmarker ? 'bg-cyan-400 shadow-[0_0_10px_#0ff]' : 'bg-red-500 animate-pulse'}`} />
                <Typography className="text-white text-sm font-medium">
                  {poseLandmarker ? "AI Vision: Active" : "Initializing Model..."}
                </Typography>
              </div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-20">
              <button 
                onClick={toggleRecording}
                className={`px-8 py-3 rounded-full font-bold text-white transition-all ${isRecording ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_#ef4444]' : 'bg-cyan-500 hover:bg-cyan-600 shadow-[0_0_20px_#06b6d4]'}`}
              >
                {isRecording ? "Stop & Export Data" : "Start Capture"}
              </button>
            </div>
          </div>
        )}
      </div>

      <SonaeModal isOpen={showSaveModal} onClose={() => setShowSaveModal(false)} title="Save Movement">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground tracking-wide uppercase">Routine Name</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Squats" 
              className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground tracking-wide uppercase">Difficulty</label>
            <select 
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>
          </div>
          <button 
            onClick={handleSave}
            disabled={!title.trim() || isSaving}
            className="w-full mt-4 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-xl shadow-[0_0_20px_#06b6d4] transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {isSaving ? "Saving..." : "Save to Library"}
          </button>
        </div>
      </SonaeModal>
    </>
  );
}
