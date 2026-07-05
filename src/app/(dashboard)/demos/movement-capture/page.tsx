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
import type {
  MovementBodyFocus,
  MovementDifficulty,
  MovementSpineGoal,
} from "../movements/_lib/movementTypes";
import {
  resolveMovementStartGateDecision,
  type MovementStartReadiness,
} from "../movements/_lib/movementSourceFrame";

const MOVEMENT_CAPTURE_START_COUNTDOWN_MS = 5000;

type MovementCaptureStartGateStatus =
  | "idle"
  | "countdown"
  | "checking-visibility"
  | "blocked";

type MovementCaptureStartGateState = {
  countdownMsRemaining: number;
  endsAt: number | null;
  message: string | null;
  status: MovementCaptureStartGateStatus;
};

function createIdleCaptureStartGate(): MovementCaptureStartGateState {
  return {
    countdownMsRemaining: 0,
    endsAt: null,
    message: null,
    status: "idle",
  };
}

function getCaptureStartReadinessMessage(readiness: MovementStartReadiness | null) {
  if (!readiness) return "Move where I can see you.";
  if (readiness.promptEvents.includes("show-your-whole-body")) return "Show your whole body.";
  if (readiness.promptEvents.includes("show-your-feet")) return "Show your feet.";
  if (readiness.promptEvents.includes("show-your-hands")) return "Show your hands.";
  if (readiness.promptEvents.includes("walk-back-into-frame")) return "Walk back into frame.";
  return "Move where I can see you.";
}

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
    captureStartReadiness,
    isRecording,
    frameCount,
    trackingQuality,
    spineQuality,
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
  const [spineGoal, setSpineGoal] = useState<MovementSpineGoal>("neutralStack");
  const [primaryCue, setPrimaryCue] = useState("");
  const [bodyFocus, setBodyFocus] = useState<MovementBodyFocus[]>(["ribcage", "pelvis"]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [captureStartGate, setCaptureStartGate] = useState<MovementCaptureStartGateState>(
    createIdleCaptureStartGate,
  );
  const [recordingStartReadiness, setRecordingStartReadiness] =
    useState<MovementStartReadiness | null>(null);
  const captureStartReadinessRef = useRef<MovementStartReadiness | null>(null);

  const createMovement = useMutation(api.movements.create);
  const generateUploadUrl = useMutation(api.movements.generateUploadUrl);
  const router = useRouter();

  React.useEffect(() => {
    captureStartReadinessRef.current = captureStartReadiness;
  }, [captureStartReadiness]);

  React.useEffect(() => {
    if (!isVisionReady && captureStartGate.status !== "idle") {
      setCaptureStartGate(createIdleCaptureStartGate());
    }
  }, [captureStartGate.status, isVisionReady]);

  React.useEffect(() => {
    if (captureStartGate.status !== "countdown" || captureStartGate.endsAt === null) {
      return undefined;
    }

    let startCheckTimeoutId: number | null = null;
    const updateCountdown = () => {
      const countdownMsRemaining = Math.max(0, captureStartGate.endsAt! - Date.now());
      if (countdownMsRemaining > 0) {
        setCaptureStartGate((current) => (
          current.status === "countdown" && current.endsAt === captureStartGate.endsAt
            ? { ...current, countdownMsRemaining }
            : current
        ));
        return;
      }

      setCaptureStartGate((current) => (
        current.status === "countdown" && current.endsAt === captureStartGate.endsAt
          ? {
              countdownMsRemaining: 0,
              endsAt: null,
              message: "Checking visibility.",
              status: "checking-visibility",
            }
          : current
      ));
      startCheckTimeoutId = window.setTimeout(() => {
        const readiness = captureStartReadinessRef.current;
        const gateDecision = resolveMovementStartGateDecision({
          readiness,
          target: "recording",
        });
        if (gateDecision.canStart && gateDecision.readiness) {
          setRecordingStartReadiness(gateDecision.readiness);
          startRecording();
          setCaptureStartGate(createIdleCaptureStartGate());
          return;
        }

        setCaptureStartGate({
          countdownMsRemaining: 0,
          endsAt: null,
          message: getCaptureStartReadinessMessage(gateDecision.readiness),
          status: "blocked",
        });
      }, 120);
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 100);

    return () => {
      window.clearInterval(intervalId);
      if (startCheckTimeoutId !== null) {
        window.clearTimeout(startCheckTimeoutId);
      }
    };
  }, [
    captureStartGate.endsAt,
    captureStartGate.status,
    startRecording,
  ]);

  const toggleRecording = useCallback(() => {
    if (!isVisionReady) return;

    if (isRecording) {
      stopRecording();
      setCaptureStartGate(createIdleCaptureStartGate());
      setSaveError(null);
      setShowSaveModal(true);
    } else {
      setRecordingStartReadiness(null);
      setSaveError(null);
      setCaptureStartGate({
        countdownMsRemaining: MOVEMENT_CAPTURE_START_COUNTDOWN_MS,
        endsAt: Date.now() + MOVEMENT_CAPTURE_START_COUNTDOWN_MS,
        message: "Walk back into frame.",
        status: "countdown",
      });
    }
  }, [isRecording, isVisionReady, stopRecording]);

  const handleSave = async () => {
    const recordedFrames = getRecordedFrames();
    if (!title.trim() || isSaving || recordedFrames.length < MIN_MOVEMENT_CAPTURE_FRAMES) return;
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await saveMovementRecording({
        title,
        difficulty,
        spineGoal,
        primaryCue,
        bodyFocus,
        captureStartReadiness: recordingStartReadiness,
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
            Back to Studio Library
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
          captureReadinessCountdownSeconds={Math.ceil(
            captureStartGate.countdownMsRemaining / 1000,
          )}
          captureReadinessMessage={captureStartGate.message}
          captureReadinessStatus={captureStartGate.status}
          frameCount={frameCount}
          trackingQuality={trackingQuality}
          spineQuality={spineQuality}
          onCameraError={() => setCameraError(true)}
          onRetryVision={retryVision}
          onToggleRecording={toggleRecording}
        />
      </div>

      <MovementSaveDialog
        isOpen={showSaveModal}
        title={title}
        difficulty={difficulty}
        spineGoal={spineGoal}
        primaryCue={primaryCue}
        bodyFocus={bodyFocus}
        frameCount={frameCount}
        isSaving={isSaving}
        saveError={saveError}
        onClose={() => setShowSaveModal(false)}
        onTitleChange={setTitle}
        onDifficultyChange={setDifficulty}
        onSpineGoalChange={setSpineGoal}
        onPrimaryCueChange={setPrimaryCue}
        onBodyFocusChange={setBodyFocus}
        onSave={handleSave}
      />
    </>
  );
}
