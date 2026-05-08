"use client";

import React, { useState, useEffect, useRef } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface PreviewModalProps {
  movement: any;
  onClose: () => void;
}

export default function PreviewModal({ movement, onClose }: PreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // If poseData is an array string, it's old legacy format before we switched to Storage.
  // If it's a storage ID string, we fetch it.
  const isStorageId = typeof movement?.poseData === "string" && !movement.poseData.startsWith("[");
  const fileUrl = useQuery(api.movements.getFileUrl, isStorageId ? { storageId: movement.poseData as Id<"_storage"> } : "skip");

  useEffect(() => {
    const loadData = async () => {
      if (!movement) return;
      setIsLoading(true);
      
      try {
        if (!isStorageId) {
          // Legacy direct JSON
          setFrames(JSON.parse(movement.poseData));
          setIsLoading(false);
        } else if (fileUrl) {
          // Fetch from Blob storage
          const res = await fetch(fileUrl);
          const data = await res.json();
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

  // Drawing logic matches movement-capture perfectly
  const drawCyberZenSkeleton = (ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    ctx.strokeStyle = "#0ff"; // Cyan neon
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
    
    let currentFrame = 0;
    let animationFrameId: number;
    let lastDrawTime = performance.now();
    const fpsInterval = 1000 / 30; // 30 fps

    const renderLoop = (time: number) => {
      animationFrameId = requestAnimationFrame(renderLoop);

      const elapsed = time - lastDrawTime;
      if (elapsed > fpsInterval) {
        lastDrawTime = time - (elapsed % fpsInterval);

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            drawCyberZenSkeleton(ctx, frames[currentFrame], canvas.width, canvas.height);
          }
        }

        currentFrame++;
        if (frames && currentFrame >= frames.length) {
          // Loop playback
          currentFrame = 0;
        }
      }
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, frames]);

  // Initial draw frame 0
  useEffect(() => {
    if (frames && frames.length > 0 && !isPlaying && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) drawCyberZenSkeleton(ctx, frames[0], canvasRef.current.width, canvasRef.current.height);
    }
  }, [frames, isPlaying]);

  return (
    <SonaeModal isOpen={!!movement} onClose={onClose} title={`Preview: ${movement?.title}`}>
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-full aspect-video bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,255,255,0.05)]">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-cyan-500 animate-pulse font-medium tracking-wide">
              Downloading 3D Pose Data...
            </div>
          ) : !frames || frames.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-red-400">
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
        
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={isLoading || !frames || frames.length === 0}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-xl shadow-[0_0_15px_#06b6d4] transition-all disabled:opacity-50"
        >
          {isPlaying ? "Pause Visualizer" : "Play Sequence"}
        </button>
      </div>
    </SonaeModal>
  );
}
