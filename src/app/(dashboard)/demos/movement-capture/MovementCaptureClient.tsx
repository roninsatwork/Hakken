"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import Header from "@/src/ui/components/layout/Header";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import MovementCapturePanel from "../movements/_components/MovementCapturePanel";
import MovementSaveDialog from "../movements/_components/MovementSaveDialog";
import { useMediaPipeVision } from "../movements/_hooks/useMediaPipeVision";
import { useMovementCameraDevices } from "../movements/_hooks/useMovementCameraDevices";
import { useMovementCapture } from "../movements/_hooks/useMovementCapture";
import type { MovementDenseCaptureAdapter } from "../movements/_lib/movementDenseCapture";
import {
  MIN_MOVEMENT_CAPTURE_FRAMES,
  buildMovementRecordingRecoveryPacket,
  buildMovementRecordingPacket,
  saveMovementRecording,
} from "../movements/_lib/saveMovementRecording";
import { downloadMovementRecordingLocalBackup } from "../movements/_lib/movementRecordingLocalBackup";
import {
  buildMovementDeepCaptureFrameEnvelope,
  buildMovementFrameEnvelope,
} from "../movements/_lib/movementFrameCodec";
import {
  validateMovementCommissioningEnvelope,
  validateMovementDeepCaptureEnvelope,
  type MovementCommissioningPacketReport,
} from "../movements/_lib/movementRecordingCommissioning";
import type {
  MovementBodyFocus,
  MovementDifficulty,
  MovementSpineGoal,
} from "../movements/_lib/movementTypes";
import {
  resolveMovementStartGateDecision,
  type MovementCameraBodyPart,
  type MovementStartReadiness,
} from "../movements/_lib/movementSourceFrame";

type MovementCaptureStartGateStatus =
  | "idle"
  | "waiting-for-body"
  | "countdown"
  | "blocked";

type MovementCaptureStartGateState = {
  countdownSeconds: number;
  message: string | null;
  status: MovementCaptureStartGateStatus;
};

export function resolveMovementRecordingSaveRequirements({
  commissioningMode,
  deepCaptureMode,
}: {
  commissioningMode: boolean;
  deepCaptureMode: boolean;
}) {
  return {
    proofCommand: deepCaptureMode
      ? "movement:replay-game:deep-commissioning-proof"
      : "movement:replay-game:commissioning-proof",
    proofProfile: deepCaptureMode ? "schema-v3 Deep Capture" : "schema-v2 commissioning",
    requireCommissioningPacket: commissioningMode && !deepCaptureMode,
    requireDeepCapturePacket: deepCaptureMode,
  } as const;
}

export function resolveMovementCaptureRouteMode({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}) {
  const params = new URLSearchParams(search);
  const deepCaptureMode = pathname === "/demos/movement-capture" ||
    pathname === "/demos/movement-capture/deep" ||
    params.get("deepCapture") === "1";
  return {
    commissioningMode: deepCaptureMode || params.get("commissioning") === "1",
    deepCaptureMode,
  };
}

function createIdleCaptureStartGate(): MovementCaptureStartGateState {
  return {
    countdownSeconds: 0,
    message: null,
    status: "idle",
  };
}

const MOVEMENT_CAPTURE_START_COUNTDOWN_SECONDS = 3;
const MOVEMENT_TRACKING_MAX_AUTO_RESTARTS = 2;
// A single lucky frame must not start the countdown: the whole body has to
// stay trustworthily visible for this long first.
const MOVEMENT_CAPTURE_START_STEADY_MS = 1_000;

function getCaptureCountdownMessage(seconds: number) {
  return `Hold still. Recording starts in ${Math.max(seconds, 1)}.`;
}

function getCaptureStartReadinessMessage(
  readiness: MovementStartReadiness | null,
  strictMissingBodyParts: MovementCameraBodyPart[] = [],
) {
  if (strictMissingBodyParts.some((part) => (
    part === "leftFoot" || part === "rightFoot" || part === "leftLeg" || part === "rightLeg"
  ))) {
    return "Walk back until your feet are visible.";
  }
  if (strictMissingBodyParts.length > 0) {
    return "Walk back until your full body is in view.";
  }
  if (!readiness) return "Walk back until your full body is in view.";
  if (readiness.promptEvents.includes("show-your-whole-body")) {
    return "Walk back until your full body is in view.";
  }
  if (readiness.promptEvents.includes("show-your-feet")) {
    return "Walk back until your feet are visible.";
  }
  if (readiness.promptEvents.includes("show-your-hands")) {
    return "Keep your hands in view.";
  }
  if (readiness.promptEvents.includes("walk-back-into-frame")) {
    return "Walk back into the camera view.";
  }
  return "Walk back until your full body is in view.";
}

export default function MovementCapturePage() {
  const [captureModeResolved, setCaptureModeResolved] = useState(false);
  const [commissioningMode, setCommissioningMode] = useState(false);
  const [deepCaptureMode, setDeepCaptureMode] = useState(false);
  const [showAllTrackingPoints, setShowAllTrackingPoints] = useState(true);
  const [denseCaptureAdapter, setDenseCaptureAdapter] =
    useState<MovementDenseCaptureAdapter<HTMLCanvasElement> | null>(null);
  const [, setDenseCaptureAdapterStatus] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const [, setDenseCaptureAdapterError] = useState<string | null>(null);
  const [forceCpuTracking, setForceCpuTracking] = useState(false);
  const [disableSegmentationTracking, setDisableSegmentationTracking] = useState(false);
  const [trackingRecoveryToken, setTrackingRecoveryToken] = useState(0);
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [cameraError, setCameraError] = useState(false);
  const {
    devices: cameras,
    activeDeviceId: activeCameraId,
    selectDevice: selectCamera,
    refreshDevices: refreshCameras,
  } = useMovementCameraDevices();
  const {
    poseLandmarker,
    faceLandmarker,
    faceRefiner,
    handLandmarker,
    handRefiner,
    status: visionStatus,
    error: visionError,
    errorDetail: visionErrorDetail,
    loadedDelegate: visionLoadedDelegate,
    retry: retryVision,
    isReady: isVisionReady,
  } = useMediaPipeVision({
    enabled: captureModeResolved,
    enableDeepRefinement: deepCaptureMode,
    enableSegmentation: deepCaptureMode && !disableSegmentationTracking,
    forceCpu: forceCpuTracking,
  });
  const autoTrackingRestartAttemptsRef = useRef(0);
  const recoverTrackingOnCpu = useCallback(() => {
    if (!forceCpuTracking) {
      setForceCpuTracking(true);
      setTrackingRecoveryToken((current) => current + 1);
      retryVision();
      return;
    }
    if (!disableSegmentationTracking) {
      setDisableSegmentationTracking(true);
      setTrackingRecoveryToken((current) => current + 1);
      retryVision();
      return;
    }
    // Both fallbacks are already engaged. A further runtime abort must not
    // strand the page in a dead failed state with no tracking loop: rebuild
    // the models a bounded number of times, then leave the visible error and
    // manual Retry as the last resort.
    if (autoTrackingRestartAttemptsRef.current >= MOVEMENT_TRACKING_MAX_AUTO_RESTARTS) return;
    autoTrackingRestartAttemptsRef.current += 1;
    setTrackingRecoveryToken((current) => current + 1);
    retryVision();
  }, [disableSegmentationTracking, forceCpuTracking, retryVision]);
  useEffect(() => {
    if (isVisionReady) autoTrackingRestartAttemptsRef.current = 0;
  }, [isVisionReady]);
  const {
    capturePreflight,
    captureStartReadiness,
    captureStartWholeBody,
    denseCaptureFailure,
    trackingFailure,
    trackingFailureDetail,
    isRecording,
    frameCount,
    trackingQuality,
    spineQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
    resetTrackingFailure,
  } = useMovementCapture({
    webcamRef,
    canvasRef,
    poseLandmarker,
    faceLandmarker,
    faceRefiner,
    handLandmarker,
    handRefiner,
    isVisionReady,
    enableDeepCapture: deepCaptureMode,
    denseCaptureAdapter,
    trackingOverlayDetail: showAllTrackingPoints ? "all" : "essential",
    trackingRecoveryToken,
    onTrackingRuntimeFailure: recoverTrackingOnCpu,
  });
  const trackingError = visionError ?? trackingFailure;
  const trackingStatus = trackingFailure ? "failed" : visionStatus;
  const trackingErrorDetail = visionErrorDetail ?? trackingFailureDetail;
  const trackingEngineSummary = [
    `engine ${visionLoadedDelegate ?? "starting"}${forceCpuTracking ? " (CPU fallback)" : ""}`,
    `segmentation ${deepCaptureMode && !disableSegmentationTracking ? "on" : "off"}`,
    trackingErrorDetail ? `last error: ${trackingErrorDetail}` : null,
  ].filter(Boolean).join(" · ");
  const retryTracking = useCallback(() => {
    autoTrackingRestartAttemptsRef.current = 0;
    resetTrackingFailure();
    setTrackingRecoveryToken((current) => current + 1);
    retryVision();
  }, [resetTrackingFailure, retryVision]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<MovementDifficulty>("Beginner");
  const [spineGoal, setSpineGoal] = useState<MovementSpineGoal>("neutralStack");
  const [primaryCue, setPrimaryCue] = useState("");
  const [bodyFocus, setBodyFocus] = useState<MovementBodyFocus[]>(["ribcage", "pelvis"]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupCommand, setBackupCommand] = useState<string | null>(null);
  const [commissioningReport, setCommissioningReport] =
    useState<MovementCommissioningPacketReport | null>(null);
  const [savedCommissioningRecording, setSavedCommissioningRecording] = useState<{
    id: string;
    proofCommand: string;
    proofProfile: string;
    title: string;
  } | null>(null);
  const [captureStartGate, setCaptureStartGate] = useState<MovementCaptureStartGateState>(
    createIdleCaptureStartGate,
  );
  const [captureGateRecheckToken, setCaptureGateRecheckToken] = useState(0);
  const captureSteadySinceRef = useRef<number | null>(null);
  const [recordingStartReadiness, setRecordingStartReadiness] =
    useState<MovementStartReadiness | null>(null);

  const createMovement = useMutation(api.movements.create);
  const generateUploadUrl = useMutation(api.movements.generateUploadUrl);
  const router = useRouter();

  React.useEffect(() => {
    const mode = resolveMovementCaptureRouteMode({
      pathname: window.location.pathname,
      search: window.location.search,
    });
    setCommissioningMode(mode.commissioningMode);
    setDeepCaptureMode(mode.deepCaptureMode);
    setCaptureModeResolved(true);
  }, []);

  React.useEffect(() => {
    if (!deepCaptureMode) {
      setDenseCaptureAdapter(null);
      setDenseCaptureAdapterStatus("idle");
      setDenseCaptureAdapterError(null);
      return undefined;
    }

    let cancelled = false;
    let createdAdapter: MovementDenseCaptureAdapter<HTMLCanvasElement> | null = null;
    setDenseCaptureAdapter(null);
    setDenseCaptureAdapterStatus("loading");
    setDenseCaptureAdapterError(null);
    void import("../movements/_lib/movementBodyPixDenseCaptureAdapter")
      .then(({ createMovementBodyPixDenseCaptureAdapter }) => (
        createMovementBodyPixDenseCaptureAdapter()
      ))
      .then((adapter) => {
        createdAdapter = adapter;
        if (cancelled) {
          adapter.dispose?.();
          return;
        }
        setDenseCaptureAdapter(adapter);
        setDenseCaptureAdapterStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDenseCaptureAdapterStatus("error");
        setDenseCaptureAdapterError(
          error instanceof Error ? error.message : "Dense body model failed to initialise.",
        );
      });

    return () => {
      cancelled = true;
      createdAdapter?.dispose?.();
    };
  }, [deepCaptureMode]);

  React.useEffect(() => {
    if (!isVisionReady && captureStartGate.status !== "idle") {
      setCaptureStartGate(createIdleCaptureStartGate());
    }
  }, [captureStartGate.status, isVisionReady]);

  React.useEffect(() => {
    if (
      captureStartGate.status !== "waiting-for-body" &&
      captureStartGate.status !== "countdown"
    ) {
      captureSteadySinceRef.current = null;
      return undefined;
    }

    const gateDecision = resolveMovementStartGateDecision({
      readiness: captureStartReadiness,
      target: "recording",
    });
    // The recorded readiness gate alone is not enough: the pose model invents
    // in-frame guesses for hidden legs/feet, so the countdown additionally
    // requires every body part to carry real visibility confidence.
    const wholeBodyTrustworthy = Boolean(captureStartWholeBody?.wholeBodyVisible);
    if (gateDecision.canStart && gateDecision.readiness && wholeBodyTrustworthy) {
      if (captureStartGate.status === "countdown") return undefined;
      if (captureSteadySinceRef.current === null) {
        captureSteadySinceRef.current = Date.now();
      }
      const heldMs = Date.now() - captureSteadySinceRef.current;
      if (heldMs >= MOVEMENT_CAPTURE_START_STEADY_MS) {
        setRecordingStartReadiness(gateDecision.readiness);
        setCaptureStartGate({
          countdownSeconds: MOVEMENT_CAPTURE_START_COUNTDOWN_SECONDS,
          message: getCaptureCountdownMessage(MOVEMENT_CAPTURE_START_COUNTDOWN_SECONDS),
          status: "countdown",
        });
        return undefined;
      }
      setCaptureStartGate((current) => {
        const message = "Perfect — hold still.";
        return current.status === "waiting-for-body" && current.message === message
          ? current
          : { countdownSeconds: 0, message, status: "waiting-for-body" };
      });
      const recheck = window.setTimeout(() => {
        setCaptureGateRecheckToken((current) => current + 1);
      }, MOVEMENT_CAPTURE_START_STEADY_MS - heldMs + 20);
      return () => window.clearTimeout(recheck);
    }

    captureSteadySinceRef.current = null;
    setCaptureStartGate((current) => {
      if (current.status !== "waiting-for-body" && current.status !== "countdown") return current;
      const message = `${getCaptureStartReadinessMessage(
        gateDecision.readiness,
        captureStartWholeBody?.missingBodyParts ?? [],
      )} The countdown starts when you are fully detected.`;
      return current.message === message && current.status === "waiting-for-body"
        ? current
        : {
            ...current,
            countdownSeconds: 0,
            message,
            status: "waiting-for-body",
          };
    });
    return undefined;
  }, [
    captureStartReadiness,
    captureStartWholeBody,
    captureGateRecheckToken,
    captureStartGate.status,
    captureStartGate.message,
    startRecording,
  ]);

  React.useEffect(() => {
    if (captureStartGate.status !== "countdown") return undefined;
    const seconds = Math.max(captureStartGate.countdownSeconds, 1);
    const timeout = window.setTimeout(() => {
      if (seconds <= 1) {
        if (recordingStartReadiness) startRecording();
        setCaptureStartGate(createIdleCaptureStartGate());
        return;
      }
      const nextSeconds = seconds - 1;
      setCaptureStartGate((current) => current.status === "countdown"
        ? {
            ...current,
            countdownSeconds: nextSeconds,
            message: getCaptureCountdownMessage(nextSeconds),
          }
        : current);
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [
    captureStartGate.countdownSeconds,
    captureStartGate.status,
    recordingStartReadiness,
    startRecording,
  ]);

  const finishRecording = useCallback(() => {
      const frames = stopRecording();
      setSaveError(null);
      if (commissioningMode || deepCaptureMode) {
        try {
          const envelope = deepCaptureMode
            ? buildMovementDeepCaptureFrameEnvelope(frames, 30, {
                captureStartReadiness: recordingStartReadiness,
              })
            : buildMovementFrameEnvelope(frames, 30, {
                captureStartReadiness: recordingStartReadiness,
              });
          setCommissioningReport(deepCaptureMode
            ? validateMovementDeepCaptureEnvelope(envelope, { requireSourceHash: false })
            : validateMovementCommissioningEnvelope(envelope, {
              requireSourceHash: false,
            }));
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : "Capture validation failed unexpectedly.";
          setCommissioningReport({
            failures: [`Capture validation could not complete: ${message}`],
            passed: false,
          });
          setSaveError(
            `Your captured frames are still retained in this page. Download the recovery packet below. ${message}`,
          );
        }
      }
      setCaptureStartGate(createIdleCaptureStartGate());
      setBackupMessage(null);
      setBackupCommand(null);
      setShowSaveModal(true);
  }, [commissioningMode, deepCaptureMode, recordingStartReadiness, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (!isVisionReady) return;

    if (isRecording) {
      finishRecording();
    } else {
      setRecordingStartReadiness(null);
      setCommissioningReport(null);
      setSavedCommissioningRecording(null);
      setSaveError(null);
      setBackupMessage(null);
      setBackupCommand(null);
      setCaptureStartGate({
        countdownSeconds: 0,
        message: "Walk back until your full body is in view. The countdown starts when you are fully detected.",
        status: "waiting-for-body",
      });
    }
  }, [finishRecording, isRecording, isVisionReady]);

  const handleSave = async () => {
    const recordedFrames = getRecordedFrames();
    if (!title.trim() || isSaving || recordedFrames.length < MIN_MOVEMENT_CAPTURE_FRAMES) return;
    setIsSaving(true);
    setSaveError(null);
    const saveRequirements = resolveMovementRecordingSaveRequirements({
      commissioningMode,
      deepCaptureMode,
    });
    
    try {
      const movementId = await saveMovementRecording({
        title,
        difficulty,
        spineGoal,
        primaryCue,
        bodyFocus,
        captureStartReadiness: recordingStartReadiness,
        frames: recordedFrames,
        generateUploadUrl,
        createMovement,
        requireCommissioningPacket: saveRequirements.requireCommissioningPacket,
        requireDeepCapturePacket: saveRequirements.requireDeepCapturePacket,
      });
      
      setShowSaveModal(false);
      if ((commissioningMode || deepCaptureMode) && typeof movementId === "string") {
        setSavedCommissioningRecording({
          id: movementId,
          proofCommand: saveRequirements.proofCommand,
          proofProfile: saveRequirements.proofProfile,
          title: title.trim(),
        });
      } else {
        router.push("/demos/movements");
      }
    } catch (e) {
      console.error("Failed to save movement:", e);
      setSaveError(e instanceof Error ? e.message : "Failed to save movement. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    const recordedFrames = getRecordedFrames();
    if (!title.trim() || isDownloadingBackup ||
      recordedFrames.length < MIN_MOVEMENT_CAPTURE_FRAMES) return;
    setIsDownloadingBackup(true);
    setBackupMessage(null);
    setBackupCommand(null);
    const saveRequirements = resolveMovementRecordingSaveRequirements({
      commissioningMode,
      deepCaptureMode,
    });

    try {
      const packet = commissioningReport?.passed
        ? await buildMovementRecordingPacket({
            captureStartReadiness: recordingStartReadiness,
            frames: recordedFrames,
            requireCommissioningPacket: saveRequirements.requireCommissioningPacket,
            requireDeepCapturePacket: saveRequirements.requireDeepCapturePacket,
          })
        : await buildMovementRecordingRecoveryPacket({
            captureStartReadiness: recordingStartReadiness,
            frames: recordedFrames,
            requireDeepCapturePacket: saveRequirements.requireDeepCapturePacket,
          });
      const backup = downloadMovementRecordingLocalBackup({ packet, title });
      setBackupMessage(
        commissioningReport?.passed
          ? `Local packet backup downloaded: ${backup.filename}. Keep this file until the Studio save and Replay/Game proof both pass.`
          : `Recovery packet downloaded: ${backup.filename}. It preserves the derived tracking take but does not claim Deep Capture proof readiness.`,
      );
      setBackupCommand(deepCaptureMode
        ? `npm run movement:replay-game:deep-local-proof -- --packet ~/Downloads/${backup.filename} --preflight-only`
        : `npm run movement:replay:recover-local-packet -- --packet ~/Downloads/${backup.filename} --out tmp/movement-replay-lab/recovered-session.json`);
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "Could not prepare the local packet backup.",
      );
    } finally {
      setIsDownloadingBackup(false);
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
        {captureModeResolved && deepCaptureMode && (
          <span className="sr-only" data-capture-profile="schema-v3-deep-capture" data-testid="capture-profile-mode">
            Latest capture format active
          </span>
        )}
        {savedCommissioningRecording && (
          <div className="rounded-2xl border border-emerald-400/35 bg-emerald-400/10 px-5 py-4 text-sm text-foreground">
            <p className="font-semibold">Proof-ready {savedCommissioningRecording.proofProfile} recording saved</p>
            <p className="mt-1 text-secondary">
              {savedCommissioningRecording.title} · recording ID
            </p>
            <code className="mt-2 block select-all break-all rounded-lg bg-black/25 px-3 py-2 text-xs text-emerald-100">
              {savedCommissioningRecording.id}
            </code>
            <p className="mt-2 text-xs text-secondary">
              The recording reached storage. Keep this ID; Replay and Game can now use the same immutable packet without another live take.
            </p>
            <code className="mt-3 block select-all break-all rounded-lg bg-black/25 px-3 py-2 text-xs text-emerald-100">
              npm run {savedCommissioningRecording.proofCommand} -- --recording-id {savedCommissioningRecording.id}
            </code>
          </div>
        )}
        
        <MovementCapturePanel
          webcamRef={webcamRef}
          canvasRef={canvasRef}
          cameraError={cameraError}
          isRecording={isRecording}
          isVisionReady={isVisionReady}
          visionStatus={trackingStatus}
          visionError={trackingError}
          isPoseReady={Boolean(poseLandmarker)}
          captureReadinessCountdownSeconds={captureStartGate.countdownSeconds}
          captureReadinessMessage={captureStartGate.message}
          captureReadinessStatus={captureStartGate.status}
          capturePreflight={capturePreflight}
          cameras={cameras}
          selectedCameraId={activeCameraId}
          onSelectCamera={selectCamera}
          // Camera names are blank until permission is granted, so the list is
          // read again the moment a picture actually starts.
          onCameraStreamStart={refreshCameras}
          captureTechnicalError={denseCaptureFailure}
          frameCount={frameCount}
          trackingQuality={trackingQuality}
          spineQuality={spineQuality}
          onCameraError={() => setCameraError(true)}
          onRetryVision={retryTracking}
          onToggleRecording={toggleRecording}
          onToggleTrackingDetail={() => setShowAllTrackingPoints((current) => !current)}
          showAllTrackingPoints={showAllTrackingPoints}
          showTrackingOverlay
          showTrackingDetailToggle={deepCaptureMode}
          trackingEngineSummary={trackingEngineSummary}
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
        isDownloadingBackup={isDownloadingBackup}
        saveError={saveError}
        backupMessage={backupMessage}
        backupCommand={backupCommand}
        commissioningFailures={commissioningMode || deepCaptureMode
          ? commissioningReport?.failures ?? []
          : undefined}
        onClose={() => setShowSaveModal(false)}
        onTitleChange={setTitle}
        onDifficultyChange={setDifficulty}
        onSpineGoalChange={setSpineGoal}
        onPrimaryCueChange={setPrimaryCue}
        onBodyFocusChange={setBodyFocus}
        onSave={handleSave}
        onDownloadBackup={commissioningMode || deepCaptureMode
          ? handleDownloadBackup
          : undefined}
      />
    </>
  );
}
