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
import type { MovementDenseCaptureAdapter } from "../movements/_lib/movementDenseCapture";
import {
  MIN_MOVEMENT_CAPTURE_FRAMES,
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
  type MovementStartReadiness,
} from "../movements/_lib/movementSourceFrame";

export const DEEP_CAPTURE_COVERAGE_CHECKLIST = [
  { label: "Head, face and eyes", instruction: "Move your head and eyes naturally in different directions. Include any blinks or expressions you want captured." },
  { label: "Hands and palms", instruction: "Show natural hand movements with palms facing towards, away from and across the camera." },
  { label: "Wrists and fingers", instruction: "Rotate your wrists and include individual or combined finger movements that matter to your recording." },
  { label: "Spine and upper body", instruction: "Include the bends, twists and upper-body movements you want Replay and Game to reproduce." },
  { label: "Lower body", instruction: "Include any squats, leg raises or other lower-body movements relevant to your session." },
  { label: "Whole-body movement", instruction: "Include any steps, jumps or turns you want captured." },
] as const;

type MovementCaptureStartGateStatus =
  | "idle"
  | "waiting-for-body"
  | "blocked";

type MovementCaptureStartGateState = {
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

function createIdleCaptureStartGate(): MovementCaptureStartGateState {
  return {
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
  const [captureModeResolved, setCaptureModeResolved] = useState(false);
  const [commissioningMode, setCommissioningMode] = useState(false);
  const [deepCaptureMode, setDeepCaptureMode] = useState(false);
  const [showAllTrackingPoints, setShowAllTrackingPoints] = useState(false);
  const [denseCaptureAdapter, setDenseCaptureAdapter] =
    useState<MovementDenseCaptureAdapter<HTMLCanvasElement> | null>(null);
  const [denseCaptureAdapterStatus, setDenseCaptureAdapterStatus] =
    useState<"idle" | "loading" | "ready" | "error">("idle");
  const [denseCaptureAdapterError, setDenseCaptureAdapterError] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [cameraError, setCameraError] = useState(false);
  const {
    poseLandmarker,
    faceLandmarker,
    faceRefiner,
    handLandmarker,
    handRefiner,
    status: visionStatus,
    error: visionError,
    retry: retryVision,
    isReady: isVisionReady,
  } = useMediaPipeVision({
    enabled: captureModeResolved,
    enableDeepRefinement: deepCaptureMode,
    enableSegmentation: deepCaptureMode,
  });
  const {
    capturePreflight,
    captureStartReadiness,
    denseCaptureQualityTier,
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
    faceRefiner,
    handLandmarker,
    handRefiner,
    isVisionReady,
    enableDeepCapture: deepCaptureMode,
    denseCaptureAdapter,
    trackingOverlayDetail: showAllTrackingPoints ? "all" : "essential",
  });
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
  const [recordingStartReadiness, setRecordingStartReadiness] =
    useState<MovementStartReadiness | null>(null);

  const createMovement = useMutation(api.movements.create);
  const generateUploadUrl = useMutation(api.movements.generateUploadUrl);
  const router = useRouter();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCommissioningMode(params.get("commissioning") === "1");
    setDeepCaptureMode(params.get("deepCapture") === "1");
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
    if (captureStartGate.status !== "waiting-for-body") {
      return undefined;
    }

    if (deepCaptureMode && denseCaptureAdapterStatus === "error") {
      setCaptureStartGate({
        message: denseCaptureAdapterError ?? "Dense body model failed to initialise.",
        status: "blocked",
      });
      return undefined;
    }
    if (deepCaptureMode && denseCaptureAdapterStatus !== "ready") {
      setCaptureStartGate((current) => current.status === "waiting-for-body"
        ? {
            ...current,
            message: "Preparing capture models. You do not need to time your position.",
          }
        : current);
      return undefined;
    }

    const gateDecision = resolveMovementStartGateDecision({
      readiness: captureStartReadiness,
      target: "recording",
    });
    if (gateDecision.canStart && gateDecision.readiness) {
      setRecordingStartReadiness(gateDecision.readiness);
      startRecording();
      setCaptureStartGate(createIdleCaptureStartGate());
      return undefined;
    }

    setCaptureStartGate((current) => {
      if (current.status !== "waiting-for-body") return current;
      const message = `${getCaptureStartReadinessMessage(gateDecision.readiness)} Recording will start automatically when ready.`;
      return current.message === message ? current : { ...current, message };
    });
    return undefined;
  }, [
    captureStartReadiness,
    captureStartGate.status,
    denseCaptureAdapterError,
    denseCaptureAdapterStatus,
    deepCaptureMode,
    startRecording,
  ]);

  const finishRecording = useCallback(() => {
      const frames = stopRecording();
      if (commissioningMode || deepCaptureMode) {
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
      }
      setCaptureStartGate(createIdleCaptureStartGate());
      setSaveError(null);
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
        message: "Move into your recording position. Recording will start automatically when your whole body is ready.",
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
      const packet = await buildMovementRecordingPacket({
        captureStartReadiness: recordingStartReadiness,
        frames: recordedFrames,
        requireCommissioningPacket: saveRequirements.requireCommissioningPacket,
        requireDeepCapturePacket: saveRequirements.requireDeepCapturePacket,
      });
      const backup = downloadMovementRecordingLocalBackup({ packet, title });
      setBackupMessage(
        `Local packet backup downloaded: ${backup.filename}. Keep this file until the Studio save and Replay/Game proof both pass.`,
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
        {commissioningMode && (
          <div className="rounded-2xl border border-[#f6ccbe]/35 bg-[#f6ccbe]/10 px-5 py-4 text-sm text-foreground">
            <p className="font-semibold">Replay/Game commissioning capture</p>
            <p className="mt-1 text-secondary">
              Saving checks the shared setup prefix, per-frame readiness and packet identity, keeps every
              recorded frame, and requires enough measured pose, hand, face, blendshape, camera and Deep Capture coverage to prove the movements you performed.
            </p>
          </div>
        )}
        {deepCaptureMode && (
          <div className="rounded-2xl border border-sky-400/35 bg-sky-400/10 px-5 py-4 text-sm text-foreground">
            <p className="font-semibold text-base">Optional movement coverage checklist</p>
            <p className="mt-1 font-medium text-sky-100">
              Nothing here is timed or compulsory. Move naturally, in any order, and take as long as you need. The recording stops only when you press Stop.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {DEEP_CAPTURE_COVERAGE_CHECKLIST.map((item) => (
                <li key={item.label} className="rounded-xl border border-sky-200/15 bg-black/15 px-3 py-3">
                  <span className="block text-xs font-bold uppercase tracking-wide text-sky-100">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-secondary">
                    {item.instruction}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-semibold">Before pressing Record</p>
            <p className="mt-1 text-secondary">
              Press Record, then move into your preferred recording position at your own pace. Capture starts automatically when your whole body is ready, and you decide when the session is finished.
            </p>
            <p className="mt-4 font-semibold">Schema-v3 Deep Capture lab</p>
            <p className="mt-1 text-secondary">
              Saving requires measured coverage of both hands, palm/wrist orientation, facial transform,
              bilateral gaze, segmentation, and 200-500 persistent dense-body anchors. Natural temporary
              occlusion is retained and reported instead of deleting frames or invalidating the whole session.
            </p>
            <p className="mt-2 text-xs text-sky-100">
              Browser performance tier: {denseCaptureQualityTier ?? "starting conservatively"}. Dense
              body resolution and cadence adjust automatically; pose, hands, face, and recording controls
              keep their normal capture path.
            </p>
            <Link className="mt-3 inline-flex rounded-full border border-sky-200/25 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-200/10" href="/demos/movement-capture/benchmark">
              Record private benchmark clips
            </Link>
          </div>
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
          visionStatus={visionStatus}
          visionError={visionError}
          isPoseReady={Boolean(poseLandmarker)}
          captureReadinessMessage={captureStartGate.message}
          captureReadinessStatus={captureStartGate.status}
          capturePreflight={capturePreflight}
          frameCount={frameCount}
          trackingQuality={trackingQuality}
          spineQuality={spineQuality}
          onCameraError={() => setCameraError(true)}
          onRetryVision={retryVision}
          onToggleRecording={toggleRecording}
          onToggleTrackingDetail={() => setShowAllTrackingPoints((current) => !current)}
          showAllTrackingPoints={showAllTrackingPoints}
          showTrackingDetailToggle={deepCaptureMode}
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
