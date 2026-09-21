"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Webcam from "react-webcam";
import { ArrowLeft, Check, Download, ShieldCheck } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import {
  MOVEMENT_DENSE_BENCHMARK_CAPTURE_COUNTDOWN_MS,
  MOVEMENT_DENSE_BENCHMARK_CAPTURE_DURATION_MS,
  MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS,
  buildMovementDenseBenchmarkCaptureFilename,
  resolveMovementDenseBenchmarkCaptureFormat,
  type MovementDenseBenchmarkCaptureScenarioId,
} from "../../movements/_lib/movementDenseBenchmarkCapture";

type LocalCapture = {
  filename: string;
  size: number;
  url: string;
};

type CaptureState =
  | { phase: "idle" }
  | { phase: "countdown"; remainingMs: number; scenario: MovementDenseBenchmarkCaptureScenarioId }
  | { phase: "recording"; remainingMs: number; scenario: MovementDenseBenchmarkCaptureScenarioId };

function downloadLocalCapture(capture: LocalCapture) {
  const anchor = document.createElement("a");
  anchor.href = capture.url;
  anchor.download = capture.filename;
  anchor.click();
}

export default function DenseBenchmarkCapturePage() {
  const webcamRef = useRef<Webcam>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIdsRef = useRef<number[]>([]);
  const capturesRef = useRef<Partial<Record<MovementDenseBenchmarkCaptureScenarioId, LocalCapture>>>({});
  const [captures, setCaptures] = useState<Partial<Record<MovementDenseBenchmarkCaptureScenarioId, LocalCapture>>>({});
  const [captureState, setCaptureState] = useState<CaptureState>({ phase: "idle" });
  const [consent, setConsent] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    timerIdsRef.current.forEach((timerId) => window.clearInterval(timerId));
    timerIdsRef.current = [];
  }, []);

  const storeCapture = useCallback((scenario: MovementDenseBenchmarkCaptureScenarioId, blob: Blob, extension: string) => {
    const previous = capturesRef.current[scenario];
    if (previous) URL.revokeObjectURL(previous.url);
    const capture = {
      filename: buildMovementDenseBenchmarkCaptureFilename({
        capturedAt: new Date(),
        extension,
        scenario,
      }),
      size: blob.size,
      url: URL.createObjectURL(blob),
    };
    capturesRef.current = { ...capturesRef.current, [scenario]: capture };
    setCaptures(capturesRef.current);
    downloadLocalCapture(capture);
  }, []);

  const beginMediaRecording = useCallback((scenario: MovementDenseBenchmarkCaptureScenarioId) => {
    const video = webcamRef.current?.video;
    const stream = video?.srcObject instanceof MediaStream ? video.srcObject : null;
    if (!stream || typeof MediaRecorder === "undefined") {
      setCaptureError("This browser cannot access a recordable camera stream.");
      setCaptureState({ phase: "idle" });
      return;
    }
    const format = resolveMovementDenseBenchmarkCaptureFormat(MediaRecorder.isTypeSupported);
    if (!format) {
      setCaptureError("This browser does not support an accepted local video recording format.");
      setCaptureState({ phase: "idle" });
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setCaptureError("The browser stopped the local benchmark recording unexpectedly.");
    };
    recorder.onstop = () => {
      clearTimers();
      const blob = new Blob(chunksRef.current, { type: format.mimeType });
      recorderRef.current = null;
      setCaptureState({ phase: "idle" });
      if (blob.size === 0) {
        setCaptureError("The local benchmark recording was empty. Please retry this scenario.");
        return;
      }
      storeCapture(scenario, blob, format.extension);
    };
    recorder.start(250);
    const recordingStartedAt = Date.now();
    setCaptureState({
      phase: "recording",
      remainingMs: MOVEMENT_DENSE_BENCHMARK_CAPTURE_DURATION_MS,
      scenario,
    });
    const progressTimer = window.setInterval(() => {
      const remainingMs = Math.max(
        0,
        MOVEMENT_DENSE_BENCHMARK_CAPTURE_DURATION_MS - (Date.now() - recordingStartedAt),
      );
      setCaptureState((current) => current.phase === "recording" && current.scenario === scenario
        ? { ...current, remainingMs }
        : current);
      if (remainingMs === 0 && recorder.state === "recording") recorder.stop();
    }, 100);
    timerIdsRef.current.push(progressTimer);
  }, [clearTimers, storeCapture]);

  const startScenario = useCallback((scenario: MovementDenseBenchmarkCaptureScenarioId) => {
    if (!consent || captureState.phase !== "idle") return;
    setCaptureError(null);
    const countdownStartedAt = Date.now();
    setCaptureState({
      phase: "countdown",
      remainingMs: MOVEMENT_DENSE_BENCHMARK_CAPTURE_COUNTDOWN_MS,
      scenario,
    });
    const countdownTimer = window.setInterval(() => {
      const remainingMs = Math.max(
        0,
        MOVEMENT_DENSE_BENCHMARK_CAPTURE_COUNTDOWN_MS - (Date.now() - countdownStartedAt),
      );
      setCaptureState((current) => current.phase === "countdown" && current.scenario === scenario
        ? { ...current, remainingMs }
        : current);
      if (remainingMs === 0) {
        clearTimers();
        beginMediaRecording(scenario);
      }
    }, 100);
    timerIdsRef.current.push(countdownTimer);
  }, [beginMediaRecording, captureState.phase, clearTimers, consent]);

  const stopCurrentCapture = useCallback(() => {
    clearTimers();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else setCaptureState({ phase: "idle" });
  }, [clearTimers]);

  useEffect(() => () => {
    clearTimers();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    Object.values(capturesRef.current).forEach((capture) => {
      if (capture) URL.revokeObjectURL(capture.url);
    });
  }, [clearTimers]);

  const capturedCount = Object.keys(captures).length;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        <Link href="/demos/movement-capture/deep" className="flex w-fit items-center gap-2 rounded-[10px] border border-border-dim bg-sidebar/50 px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Deep Capture
        </Link>

        <section className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-200" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Private dense-model benchmark capture</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary">
                Each ten-second clip stays in this browser and downloads directly to your computer. Nothing on this page uploads raw RGB video to Convex or saves it in a movement packet.
              </p>
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-foreground">
            <input
              checked={consent}
              className="mt-1 h-4 w-4"
              disabled={captureState.phase !== "idle"}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            <span>I consent to recording these local RGB clips for Hakken dense-model benchmarking. I understand they are downloaded locally and must be deliberately placed in the private benchmark folder.</span>
          </label>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="relative aspect-video min-h-[320px]">
            <Webcam
              ref={webcamRef}
              audio={false}
              className="h-full w-full object-contain"
              mirrored
              onUserMedia={() => setCameraError(null)}
              onUserMediaError={() => setCameraError("Camera permission is required for local benchmark capture.")}
              videoConstraints={{ facingMode: "user", height: 1080, width: 1920 }}
            />
            {captureState.phase !== "idle" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="rounded-2xl border border-white/15 bg-black/75 px-8 py-5 text-center backdrop-blur-md">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f6ccbe]">
                    {captureState.phase === "countdown" ? "Get into position" : "Recording locally"}
                  </p>
                  <p className="mt-2 text-4xl font-black text-white">
                    {Math.max(1, Math.ceil(captureState.remainingMs / 1_000))}
                  </p>
                  <button className="mt-3 text-xs font-semibold text-white/70 underline" onClick={stopCurrentCapture} type="button">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {(cameraError || captureError) && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {cameraError ?? captureError}
          </div>
        )}

        <section className="grid gap-3 lg:grid-cols-2">
          {MOVEMENT_DENSE_BENCHMARK_CAPTURE_SCENARIOS.map((scenario, index) => {
            const capture = captures[scenario.id];
            const isActive = captureState.phase !== "idle" && captureState.scenario === scenario.id;
            return (
              <article className="rounded-2xl border border-white/10 bg-sidebar/40 p-4" key={scenario.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-secondary">Clip {index + 1} of 6</p>
                    <h2 className="mt-1 font-semibold text-foreground">{scenario.label}</h2>
                  </div>
                  {capture && <Check className="h-5 w-5 text-emerald-300" aria-label="Captured" />}
                </div>
                <p className="mt-2 text-sm leading-5 text-secondary">{scenario.instruction}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-full bg-[#f6ccbe] px-4 py-2 text-xs font-bold text-[#17131d] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!consent || captureState.phase !== "idle"}
                    onClick={() => startScenario(scenario.id)}
                    type="button"
                  >
                    {capture ? "Record again" : isActive ? "Recording" : "Record clip"}
                  </button>
                  {capture && (
                    <button className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-foreground" onClick={() => downloadLocalCapture(capture)} type="button">
                      <Download className="h-3.5 w-3.5" />
                      Download again
                    </button>
                  )}
                </div>
                {capture && <p className="mt-2 break-all text-[11px] text-emerald-200">{capture.filename} · {Math.max(1, Math.round(capture.size / 1024))} KB</p>}
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-white/10 bg-sidebar/40 p-5 text-sm text-secondary">
          <p className="font-semibold text-foreground">Captured {capturedCount}/6</p>
          <p className="mt-2">
            After all downloads complete, run <code className="text-foreground">npm run movement:dense-capture:benchmark:ingest -- --confirm-benchmark-consent</code>. It copies and verifies the clips in <code className="text-foreground">tmp/movement-replay-lab/dense-capture/clips</code> while preserving the originals.
          </p>
          <Link className="mt-4 inline-flex rounded-full border border-sky-200/25 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-200/10" href="/demos/movement-capture/benchmark/device">
            Test an iPad or older laptop
          </Link>
        </section>
      </div>
    </>
  );
}
