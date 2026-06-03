"use client";

import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import Header from "@/src/ui/components/layout/Header";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MovementCapturePanel from "../movements/_components/MovementCapturePanel";
import MovementSaveDialog from "../movements/_components/MovementSaveDialog";
import { useMediaPipeVision } from "../movements/_hooks/useMediaPipeVision";
import { useMovementCapture } from "../movements/_hooks/useMovementCapture";
import {
  MIN_MOVEMENT_CAPTURE_FRAMES,
  saveMovementRecording,
} from "../movements/_lib/saveMovementRecording";
import type { MovementDifficulty } from "../movements/_lib/movementTypes";

export default function MovementCapturePage() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [cameraError, setCameraError] = useState(false);
  const {
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    status: visionStatus,
    error: visionError,
    retry: retryVision,
    isReady: isVisionReady,
  } = useMediaPipeVision();
  const {
    isRecording,
    frameCount,
    trackingQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
  } = useMovementCapture({
    webcamRef,
    canvasRef,
    poseLandmarker,
    faceLandmarker,
    handLandmarker,
    isVisionReady,
  });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<MovementDifficulty>("Beginner");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createMovement = useMutation(api.movements.create);
  const generateUploadUrl = useMutation(api.movements.generateUploadUrl);
  const router = useRouter();

  const toggleRecording = useCallback(() => {
    if (!isVisionReady) return;

    if (isRecording) {
      stopRecording();
      setSaveError(null);
      setShowSaveModal(true);
    } else {
      setSaveError(null);
      startRecording();
    }
  }, [isRecording, isVisionReady, startRecording, stopRecording]);

  const handleSave = async () => {
    const recordedFrames = getRecordedFrames();
    if (!title.trim() || isSaving || recordedFrames.length < MIN_MOVEMENT_CAPTURE_FRAMES) return;
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await saveMovementRecording({
        title,
        difficulty,
        frames: recordedFrames,
        generateUploadUrl,
        createMovement,
      });
      
      setShowSaveModal(false);
      router.push("/demos/movements");
    } catch (e) {
      console.error("Failed to save movement:", e);
      setSaveError(e instanceof Error ? e.message : "Failed to save movement. Please try again.");
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
        
        <MovementCapturePanel
          webcamRef={webcamRef}
          canvasRef={canvasRef}
          cameraError={cameraError}
          isRecording={isRecording}
          isVisionReady={isVisionReady}
          visionStatus={visionStatus}
          visionError={visionError}
          isPoseReady={Boolean(poseLandmarker)}
          frameCount={frameCount}
          trackingQuality={trackingQuality}
          onCameraError={() => setCameraError(true)}
          onRetryVision={retryVision}
          onToggleRecording={toggleRecording}
        />
      </div>

      <MovementSaveDialog
        isOpen={showSaveModal}
        title={title}
        difficulty={difficulty}
        frameCount={frameCount}
        isSaving={isSaving}
        saveError={saveError}
        onClose={() => setShowSaveModal(false)}
        onTitleChange={setTitle}
        onDifficultyChange={setDifficulty}
        onSave={handleSave}
      />
    </>
  );
}
