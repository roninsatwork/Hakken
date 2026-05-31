"use client";

import React, { useState, useEffect, useRef, use } from "react";
import Header from "@/src/ui/components/layout/Header";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Pause, Trash2, Activity, Database, Clock } from "lucide-react";
import Typography from "@/src/ui/atoms/typography";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type PoseLandmark = {
  x: number;
  y: number;
  visibility: number;
};

type PoseFrame = PoseLandmark[] | { landmarks: PoseLandmark[] };

const getFrameLandmarks = (frame: PoseFrame | undefined) => Array.isArray(frame) ? frame : frame?.landmarks;

export default function MovementDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const movementId = unwrappedParams.id as Id<"movements">;

  const movement = useQuery(api.movements.get, { id: movementId });
  const removeMovement = useMutation(api.movements.remove);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndexRef = useRef(0);
  const [frames, setFrames] = useState<PoseFrame[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isStorageId = typeof movement?.poseData === "string" && !movement.poseData.startsWith("[");
  const fileUrl = useQuery(api.movements.getFileUrl, isStorageId ? { storageId: movement.poseData as Id<"_storage"> } : "skip");

  useEffect(() => {
    const loadData = async () => {
      if (!movement) return;
      setIsLoading(true);
      
      try {
        if (!isStorageId) {
          setFrames(JSON.parse(movement.poseData) as PoseFrame[]);
          setIsLoading(false);
        } else if (fileUrl) {
          const res = await fetch(fileUrl);
          const data = await res.json() as PoseFrame[];
          setFrames(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load frames", err);
        setIsLoading(false);
      }
    };
    loadData();
  }, [movement, isStorageId, fileUrl]);

  const drawCyberZenSkeleton = (ctx: CanvasRenderingContext2D, landmarks: PoseFrame | null | undefined, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    if (!landmarks || !Array.isArray(landmarks)) return;
    
    ctx.strokeStyle = "#0ff";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = 15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const connections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30]
    ];

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

    ctx.fillStyle = "#f0f";
    ctx.shadowColor = "#f0f";
    landmarks.forEach((landmark) => {
      if (landmark.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc((1 - landmark.x) * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  };

  useEffect(() => {
    if (!isPlaying || !frames || frames.length === 0) return;
    
    let animationFrameId: number;
    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 30; // 30 fps

    const renderLoop = (time: number) => {
      animationFrameId = requestAnimationFrame(renderLoop);

      const elapsed = time - lastDrawTime;
      if (elapsed > fpsInterval) {
        lastDrawTime = time - (elapsed % fpsInterval);

        frameIndexRef.current = frames && frameIndexRef.current + 1 >= frames.length ? 0 : frameIndexRef.current + 1;
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const frameData = frames[frameIndexRef.current];
            const landmarks = getFrameLandmarks(frameData);
            drawCyberZenSkeleton(ctx, landmarks, canvas.width, canvas.height);
          }
        }
        
        // Update DOM directly to avoid 30fps React re-renders
        const scrubber = document.getElementById("movement-scrubber") as HTMLInputElement;
        if (scrubber) scrubber.value = frameIndexRef.current.toString();
        const scrubberLabel = document.getElementById("movement-scrubber-label");
        if (scrubberLabel && frames) scrubberLabel.innerText = `${frameIndexRef.current} / ${frames.length}`;
      }
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, frames]);

  // Initial draw or manual scrub draw
  useEffect(() => {
    if (frames && frames.length > 0 && !isPlaying && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      const frameData = frames[frameIndexRef.current];
      const landmarks = getFrameLandmarks(frameData);
      if (ctx && frameData) {
        drawCyberZenSkeleton(ctx, landmarks, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, [frames, isPlaying]);

  const confirmDelete = () => {
    setDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    await removeMovement({ id: movementId });
    setDeleteModalOpen(false);
    router.push("/demos/movements");
  };

  if (movement === undefined) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-cyan-500 animate-pulse font-medium">
          Loading movement data...
        </div>
      </>
    );
  }

  if (movement === null) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-24 text-red-500 font-medium">
          Movement not found.
        </div>
      </>
    );
  }

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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Activity className="w-7 h-7 text-brand" />
              {movement.title}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
              movement.difficulty === 'Beginner' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              movement.difficulty === 'Intermediate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {movement.difficulty}
            </span>
          </div>
          <Typography className="text-muted-foreground text-sm mt-1">
            Recorded on {new Date(movement.createdAt).toLocaleDateString()} at {new Date(movement.createdAt).toLocaleTimeString()}
          </Typography>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 w-full mt-4">
          {/* Left Column: Visualizer */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="relative w-full aspect-video bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,255,255,0.05)]">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center text-cyan-500 animate-pulse font-medium tracking-wide">
                  Downloading 3D Pose Data...
                </div>
              ) : !frames || frames.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 font-medium">
                  Corrupted or Empty Data
                </div>
              ) : (
                <canvas 
                  ref={canvasRef} 
                  width={1280} 
                  height={720} 
                  className="absolute inset-0 w-full h-full object-contain" 
                />
              )}
            </div>
            
            {frames && frames.length > 0 && (
              <div className="flex items-center gap-4 bg-sidebar/50 border border-border-dim rounded-2xl p-4 backdrop-blur-md">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-3 rounded-full bg-cyan-500 hover:bg-cyan-600 text-white transition-colors shadow-[0_0_15px_rgba(6,182,212,0.5)] flex-shrink-0"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                </button>
                <input 
                  id="movement-scrubber"
                  type="range" 
                  min="0" 
                  max={frames ? frames.length - 1 : 0} 
                  defaultValue={0}
                  onChange={(e) => {
                    setIsPlaying(false);
                    frameIndexRef.current = parseInt(e.target.value);
                    const scrubberLabel = document.getElementById("movement-scrubber-label");
                    if (scrubberLabel && frames) scrubberLabel.innerText = `${frameIndexRef.current} / ${frames.length}`;
                    
                    // Manually redraw frame when scrubbing
                    const canvas = canvasRef.current;
                    if (canvas) {
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        const frameData = frames[frameIndexRef.current];
                        drawCyberZenSkeleton(ctx, getFrameLandmarks(frameData), canvas.width, canvas.height);
                      }
                    }
                  }}
                  className="w-full accent-cyan-500"
                />
                <span id="movement-scrubber-label" className="text-xs text-muted-foreground font-mono min-w-[60px] text-right">
                  0 / {frames ? frames.length : 0}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: Telemetry */}
          <div className="w-full lg:w-80 flex flex-col gap-4">
            <div className="bg-sidebar/40 border border-border-dim rounded-3xl p-6 flex flex-col gap-6 shadow-sm backdrop-blur-xl">
              <div>
                <Typography className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Telemetry Data</Typography>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Database className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Blob Storage</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {isStorageId ? "Connected & Verified" : "Legacy DB String"}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Duration</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${(frames.length / 30).toFixed(1)} Seconds` : "Calculating..."}
                      </Typography>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Activity className="w-5 h-5 text-cyan-500 mt-0.5" />
                    <div className="flex flex-col">
                      <Typography className="text-sm font-medium text-foreground block">Frame Count</Typography>
                      <Typography className="text-xs text-muted-foreground mt-0.5 block">
                        {frames && frames.length > 0 ? `${frames.length} Captures` : "Loading..."}
                      </Typography>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-dim pt-6">
                <Typography className="text-xs font-bold text-red-500/80 uppercase tracking-widest mb-4">Danger Zone</Typography>
                <button 
                  onClick={confirmDelete}
                  className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-medium py-2.5 rounded-xl transition-all text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Routine
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SonaeModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Routine">
        <div className="flex flex-col gap-6">
          <p className="text-secondary text-sm">
            Are you sure you want to delete <strong className="text-foreground">{movement?.title}</strong>? This action cannot be undone.
          </p>
          <div className="flex items-center gap-3 w-full mt-2">
            <button 
              onClick={() => setDeleteModalOpen(false)}
              className="flex-1 bg-foreground/5 hover:bg-foreground/10 text-foreground py-3 rounded-xl transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button 
              onClick={executeDelete}
              className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-3 rounded-xl transition-colors font-medium text-sm flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Routine
            </button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
