"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Gauge, Share2, ShieldCheck } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { Field } from "@/src/ui/components/screens/Field";
import type { MovementDenseCaptureAdapter } from "../../../movements/_lib/movementDenseCapture";
import {
  MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK,
  summarizeMovementDenseCaptureDeviceBenchmark,
  type MovementDenseCaptureDeviceBenchmarkSample,
  type MovementDenseCaptureDeviceClass,
} from "../../../movements/_lib/movementDenseCaptureDeviceBenchmark";
import {
  MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
  createMovementDenseCaptureQualityState,
  readMovementDenseCaptureDeviceCapabilities,
  resolveInitialMovementDenseCaptureQualityTier,
  updateMovementDenseCaptureQualityState,
} from "../../../movements/_lib/movementDenseCaptureQuality";

type DeviceBenchmarkReport = ReturnType<typeof summarizeMovementDenseCaptureDeviceBenchmark> & {
  device: {
    deviceMemoryGb: number | null;
    hardwareConcurrency: number | null;
    isIpad: boolean;
    userAgent: string;
  };
  generatedAt: string;
  memory: {
    endBytes: number | null;
    endTensorCount: number | null;
    growthBytes: number | null;
    peakBytes: number | null;
    startBytes: number | null;
    startTensorCount: number | null;
  };
  model: {
    loadMs: number;
    modelHash: string;
    modelId: string;
  };
  samples: MovementDenseCaptureDeviceBenchmarkSample[];
  schemaVersion: 1;
  source: {
    byteLength: number;
    mimeType: string;
  };
};

type PhysicalDeviceObservation = {
  note: string;
  observedAt: string;
  outcome: "cool" | "warm-stable" | "hot-or-unstable";
};

type DownloadedDeviceBenchmarkReport = DeviceBenchmarkReport & {
  physicalObservation: PhysicalDeviceObservation;
};

function deviceReportFilename(report: DownloadedDeviceBenchmarkReport) {
  return `sonae-dense-device-${report.deviceClass}-${Date.parse(report.physicalObservation.observedAt)}.json`;
}

function deviceReportFile(report: DownloadedDeviceBenchmarkReport) {
  return new File(
    [JSON.stringify(report, null, 2)],
    deviceReportFilename(report),
    { type: "application/json" },
  );
}

export async function shareDeviceBenchmarkReport(
  report: DownloadedDeviceBenchmarkReport,
  navigatorApi: Pick<Navigator, "canShare" | "share"> = navigator,
) {
  const file = deviceReportFile(report);
  if (!navigatorApi.canShare({ files: [file] })) {
    throw new Error("This browser cannot share JSON report files. Use Download JSON report instead.");
  }
  await navigatorApi.share({
    files: [file],
    text: "Sonae browser Deep Capture device measurements. No video is included.",
    title: `Sonae ${report.deviceClass} Deep Capture report`,
  });
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("This browser could not read the selected local video."));
  });
}

function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("The selected video did not seek in time."));
    }, 5_000);
    video.onseeked = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };
    video.currentTime = time;
  });
}

function downloadReport(report: DownloadedDeviceBenchmarkReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = deviceReportFilename(report);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DenseCaptureDeviceBenchmarkPage() {
  const [consent, setConsent] = useState(false);
  const [deviceClass, setDeviceClass] = useState<MovementDenseCaptureDeviceClass>("ipad");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<DeviceBenchmarkReport | null>(null);
  const [observationNote, setObservationNote] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [shareSupported, setShareSupported] = useState(false);
  const [thermalOutcome, setThermalOutcome] = useState<PhysicalDeviceObservation["outcome"] | "">("");
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "complete" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const busy = status === "loading" || status === "running";
  const canRun = consent && file !== null && !busy;
  const progressPercent = useMemo(() => Math.round(
    Math.min(1, progress / MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumDurationMs) * 100,
  ), [progress]);
  const transferableReport = useMemo<DownloadedDeviceBenchmarkReport | null>(() => (
    report && thermalOutcome && observedAt
      ? {
          ...report,
          physicalObservation: {
            note: observationNote.trim(),
            observedAt,
            outcome: thermalOutcome,
          },
        }
      : null
  ), [observationNote, observedAt, report, thermalOutcome]);

  useEffect(() => {
    setShareSupported(typeof navigator.share === "function" && typeof navigator.canShare === "function");
  }, []);

  const runBenchmark = async () => {
    if (!file || !canRun) return;
    setError(null);
    setReport(null);
    setObservationNote("");
    setObservedAt("");
    setThermalOutcome("");
    setTransferMessage(null);
    setProgress(0);
    setStatus("loading");
    let adapter: MovementDenseCaptureAdapter<HTMLCanvasElement> | null = null;
    let videoUrl: string | null = null;
    try {
      const modelLoadStartedAtMs = performance.now();
      const [{ createMovementBodyPixDenseCaptureAdapter }] = await Promise.all([
        import("../../../movements/_lib/movementBodyPixDenseCaptureAdapter"),
      ]);
      adapter = await createMovementBodyPixDenseCaptureAdapter();
      const modelLoadMs = performance.now() - modelLoadStartedAtMs;
      const tf = await import("@tensorflow/tfjs-core");
      const capabilities = readMovementDenseCaptureDeviceCapabilities();
      const initialQualityTier = resolveInitialMovementDenseCaptureQualityTier({
        ...capabilities,
        isIpad: deviceClass === "ipad" || capabilities.isIpad,
      });
      let qualityState = createMovementDenseCaptureQualityState(initialQualityTier);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      videoUrl = URL.createObjectURL(file);
      const metadataReady = waitForVideoMetadata(video);
      video.src = videoUrl;
      await metadataReady;
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error("The selected local video has no measurable duration.");
      }
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot create a local benchmark canvas.");
      const samples: MovementDenseCaptureDeviceBenchmarkSample[] = [];
      const startMemory = tf.memory();
      let peakBytes = Number.isFinite(startMemory.numBytes) ? startMemory.numBytes : null;
      const benchmarkStartedAtMs = performance.now();
      setStatus("running");

      let sampleIndex = 0;
      while (true) {
        const qualityTier = qualityState.qualityTier;
        const qualityProfile = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[qualityTier];
        canvas.width = qualityProfile.inputWidth;
        canvas.height = qualityProfile.inputHeight;
        const position = ((sampleIndex % 20) + 1) / 21;
        await seekVideo(video, Math.min(Math.max(0, video.duration - 0.05), video.duration * position));
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
        const measurement = await adapter.infer(canvas, {
          frameHeight: video.videoHeight,
          frameWidth: video.videoWidth,
          qualityTier,
          sourceTimestampMs: performance.now(),
        });
        const elapsedMs = performance.now() - benchmarkStartedAtMs;
        samples.push({
          anchorCount: measurement.anchors.length,
          elapsedMs,
          inferenceDurationMs: measurement.adapter.inferenceDurationMs,
          qualityTier,
          sampleIndex,
        });
        qualityState = updateMovementDenseCaptureQualityState(
          qualityState,
          measurement.adapter.inferenceDurationMs,
        );
        const currentMemory = tf.memory();
        if (Number.isFinite(currentMemory.numBytes)) {
          peakBytes = Math.max(peakBytes ?? 0, currentMemory.numBytes);
        }
        sampleIndex += 1;
        setProgress(elapsedMs);
        if (
          elapsedMs >= MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumDurationMs &&
          sampleIndex >= MOVEMENT_DENSE_CAPTURE_DEVICE_BENCHMARK.minimumSampleCount
        ) break;
        const remainingCadenceMs = Math.max(
          0,
          qualityProfile.targetIntervalMs - measurement.adapter.inferenceDurationMs,
        );
        await new Promise<void>((resolve) => window.setTimeout(resolve, remainingCadenceMs));
      }

      const durationMs = samples.at(-1)?.elapsedMs ?? 0;
      const endMemory = tf.memory();
      const summary = summarizeMovementDenseCaptureDeviceBenchmark({ deviceClass, durationMs, samples });
      setReport({
        ...summary,
        device: {
          ...capabilities,
          userAgent: navigator.userAgent,
        },
        generatedAt: new Date().toISOString(),
        memory: {
          endBytes: Number.isFinite(endMemory.numBytes) ? endMemory.numBytes : null,
          endTensorCount: Number.isFinite(endMemory.numTensors) ? endMemory.numTensors : null,
          growthBytes: Number.isFinite(startMemory.numBytes) && Number.isFinite(endMemory.numBytes)
            ? endMemory.numBytes - startMemory.numBytes
            : null,
          peakBytes,
          startBytes: Number.isFinite(startMemory.numBytes) ? startMemory.numBytes : null,
          startTensorCount: Number.isFinite(startMemory.numTensors) ? startMemory.numTensors : null,
        },
        model: {
          loadMs: modelLoadMs,
          modelHash: adapter.descriptor.modelHash,
          modelId: `${adapter.descriptor.id}@${adapter.descriptor.version}`,
        },
        samples,
        schemaVersion: 1,
        source: {
          byteLength: file.size,
          mimeType: file.type || "unknown",
        },
      });
      setStatus("complete");
    } catch (benchmarkError) {
      setStatus("error");
      setError(
        benchmarkError instanceof Error
          ? benchmarkError.message
          : "The local device benchmark failed.",
      );
    } finally {
      adapter?.dispose?.();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6">
        <Link href="/demos/movement-capture/benchmark" className="flex w-fit items-center gap-2 rounded-[10px] border border-border-dim bg-sidebar/50 px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to benchmark recordings
        </Link>

        <section className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-200" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Private iPad and older-laptop benchmark</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary">
                Select one of the recordings you already made. The video stays inside this browser,
                runs a sustained two-minute adaptive dense-capture soak, and is never uploaded to Convex,
                Sonae, or an external GPU service. After the run, record whether the device stayed cool,
                became warm but responsive, or became hot or unstable before downloading its report.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-white/10 bg-sidebar/40 p-5 md:grid-cols-2">
          <label className="text-sm text-foreground">
            <span className="mb-2 block font-semibold">Physical device being tested</span>
            <select
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3"
              disabled={busy}
              onChange={(event) => setDeviceClass(event.target.value as MovementDenseCaptureDeviceClass)}
              value={deviceClass}
            >
              <option value="ipad">iPad</option>
              <option value="older-laptop">Older laptop</option>
            </select>
          </label>
          <label className="text-sm text-foreground">
            <span className="mb-2 block font-semibold">Existing local recording</span>
            <input
              accept="video/mp4,video/quicktime,video/webm,.m4v"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2"
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-foreground md:col-span-2">
            <input
              checked={consent}
              className="mt-1 h-4 w-4"
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            <span>I consent to processing this selected video locally on this physical device for the browser benchmark. The video will not be uploaded or included in the downloaded JSON report.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button
              className="flex items-center gap-2 rounded-full bg-[#f6ccbe] px-5 py-3 text-sm font-bold text-[#17131d] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canRun}
              onClick={() => void runBenchmark()}
              type="button"
            >
              <Gauge className="h-4 w-4" />
              {busy ? `Running ${progressPercent}%` : "Run local device benchmark"}
            </button>
            {report && (
              <button
                className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!transferableReport}
                onClick={() => {
                  if (!transferableReport) return;
                  downloadReport(transferableReport);
                  setTransferMessage("JSON report downloaded. The selected video was not included.");
                }}
                type="button"
              >
                <Download className="h-4 w-4" />
                {thermalOutcome ? "Download JSON report" : "Record device observation first"}
              </button>
            )}
            {report && shareSupported && (
              <button
                className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!transferableReport}
                onClick={() => {
                  if (!transferableReport) return;
                  setTransferMessage(null);
                  void shareDeviceBenchmarkReport(transferableReport)
                    .then(() => setTransferMessage("JSON report shared. The selected video was not included."))
                    .catch((shareError) => setTransferMessage(
                      shareError instanceof Error
                        ? shareError.message
                        : "The report was not shared. Use Download JSON report instead.",
                    ));
                }}
                type="button"
              >
                <Share2 className="h-4 w-4" />
                {thermalOutcome ? "Share or AirDrop JSON report" : "Record device observation first"}
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {transferMessage && (
          <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {transferMessage}
          </div>
        )}

        {report && (
          <section className={`space-y-4 rounded-2xl border p-5 ${report.passed ? "border-emerald-400/30 bg-emerald-400/10" : "border-amber-400/30 bg-amber-400/10"}`}>
            <p className="font-semibold text-foreground">
              {report.passed ? "Measured device run passed" : "Measured device run needs attention"}
            </p>
            <p className="mt-2 text-sm text-secondary">
              Final tier: {report.finalQualityTier ?? "unavailable"} · {report.sampleCount} samples · {Math.round(report.durationMs / 1_000)} seconds · latency drift {report.sustained.latencyDriftRatio.toFixed(2)}.
              This report remains measured-awaiting-review until a reviewer confirms the physical device and sustained behaviour.
            </p>
            {report.failures.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100">
                {report.failures.map((failure) => <li key={failure}>{failure}</li>)}
              </ul>
            )}
            <div className="grid gap-3 rounded-xl border border-white/10 bg-black/15 p-4 md:grid-cols-2">
              <label className="text-sm text-foreground">
                <span className="mb-2 block font-semibold">How did this physical device feel after two minutes?</span>
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3"
                  onChange={(event) => {
                    const outcome = event.target.value as PhysicalDeviceObservation["outcome"] | "";
                    setThermalOutcome(outcome);
                    setObservedAt(outcome ? new Date().toISOString() : "");
                    setTransferMessage(null);
                  }}
                  value={thermalOutcome}
                >
                  <option value="">Select an observation</option>
                  <option value="cool">Stayed cool and responsive</option>
                  <option value="warm-stable">Became warm but stayed responsive</option>
                  <option value="hot-or-unstable">Became hot, slowed down, or became unstable</option>
                </select>
              </label>
              <Field
                label="Optional observation note"
                className="rounded-xl border-white/10 bg-black/25 px-3"
                onChange={(event) => setObservationNote(event.target.value)}
                placeholder="For example: warm near the camera, no slowdown"
                value={observationNote}
              />
              {thermalOutcome === "hot-or-unstable" && (
                <p className="text-sm text-amber-100 md:col-span-2">
                  Download the report, but this device result will correctly block model approval until the browser workload is reduced.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
