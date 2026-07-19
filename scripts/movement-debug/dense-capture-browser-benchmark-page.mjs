/* global document, performance, window */

import * as bodyPix from "@tensorflow-models/body-pix";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import {
  buildMovementBodyPixSurfaceAnchors,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementBodyPixDenseCaptureAdapter";
import {
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureContract";
import { renderMovementDenseCaptureInput } from "../../src/app/(dashboard)/demos/movements/_lib/movementDenseCaptureInput";

function reportProgress(message) {
  window.reportDenseProgress?.(message);
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms.`)), timeoutMs);
    }),
  ]);
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function waitForVideo(video) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", resolveReady);
      video.removeEventListener("error", rejectError);
    };
    const resolveReady = () => {
      cleanup();
      resolve();
    };
    const rejectError = () => {
      cleanup();
      reject(new Error(`Could not decode benchmark clip ${video.src}.`));
    };
    video.addEventListener("loadedmetadata", resolveReady, { once: true });
    video.addEventListener("error", rejectError, { once: true });
    video.load();
  });
}

function seekVideo(video, timeSeconds) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", resolveSeek);
      video.removeEventListener("error", rejectSeek);
    };
    const resolveSeek = () => {
      cleanup();
      resolve();
    };
    const rejectSeek = () => {
      cleanup();
      reject(new Error(`Could not seek benchmark clip ${video.src}.`));
    };
    video.addEventListener("seeked", resolveSeek, { once: true });
    video.addEventListener("error", rejectSeek, { once: true });
    video.currentTime = timeSeconds;
  });
}

function advanceVideo(video, timeSeconds) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("ended", rejectEnded);
      video.removeEventListener("error", rejectPlayback);
      video.removeEventListener("timeupdate", resolveAtTarget);
    };
    const resolveAtTarget = () => {
      if (video.currentTime + 0.02 < timeSeconds) return;
      video.pause();
      cleanup();
      resolve();
    };
    const rejectEnded = () => {
      cleanup();
      reject(new Error(`Benchmark clip ended before ${timeSeconds}s: ${video.src}.`));
    };
    const rejectPlayback = () => {
      cleanup();
      reject(new Error(`Could not play benchmark clip ${video.src}.`));
    };
    video.addEventListener("ended", rejectEnded, { once: true });
    video.addEventListener("error", rejectPlayback, { once: true });
    video.addEventListener("timeupdate", resolveAtTarget);
    if (video.currentTime + 0.02 >= timeSeconds) {
      resolveAtTarget();
      return;
    }
    video.play().catch(rejectPlayback);
  });
}

function sampledTimes(duration) {
  const last = Math.max(0, duration - 0.15);
  return [0.5, 2.5, 4.5, 6.5, 8.5]
    .map((value) => Math.min(last, value))
    .filter((value, index, values) => index === 0 || value > values[index - 1] + 0.05);
}

function segmentationCoverage(segmentation) {
  const parts = new Set();
  let personPixelCount = 0;
  for (const part of segmentation.data) {
    if (part >= 0 && part <= 23) {
      personPixelCount += 1;
      parts.add(part);
    }
  }
  return {
    bodyPartCount: parts.size,
    personPixelRatio: segmentation.data.length > 0
      ? personPixelCount / segmentation.data.length
      : 0,
  };
}

async function runCandidate(config) {
  reportProgress(`initialising ${config.candidateId}`);
  await tf.setBackend("webgl");
  await tf.ready();
  reportProgress(`loading ${config.candidateId}`);
  const loadStartedAt = performance.now();
  const model = await withTimeout(
    bodyPix.load({ ...config.model, modelUrl: config.modelUrl }),
    90_000,
    `${config.candidateId} model load`,
  );
  const modelLoadMs = performance.now() - loadStartedAt;
  reportProgress(`loaded ${config.candidateId} in ${Math.round(modelLoadMs)} ms`);
  const inferenceTimes = [];
  const clipMeasurements = [];
  const cycleMedianInferenceMs = [];
  let inputHeight = 0;
  let inputWidth = 0;
  let peakTensorMemoryMb = tf.memory().numBytes / (1024 * 1024);
  const tensorMemoryMbBeforeCycles = peakTensorMemoryMb;
  let tensorMemoryMbAfterCycles = peakTensorMemoryMb;

  try {
    for (let cycleIndex = 0; cycleIndex < (config.cycles ?? 1); cycleIndex += 1) {
      const cycleTimes = [];
      reportProgress(`starting cycle ${cycleIndex + 1}/${config.cycles ?? 1}`);
      for (const clip of config.clips) {
      reportProgress(`decoding ${config.candidateId} ${clip.id}`);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = clip.url;
      await withTimeout(waitForVideo(video), 30_000, `${clip.id} metadata`);
      reportProgress(`decoded ${clip.id} ${video.videoWidth}x${video.videoHeight} ${video.duration}s`);
      inputHeight = Math.max(inputHeight, video.videoHeight);
      inputWidth = Math.max(inputWidth, video.videoWidth);
      const clipTimes = [];
      const coverages = [];
      const anchorMeasurements = [];
      let previousAnchorIds = null;
      const modelCanvas = document.createElement("canvas");
      for (const timeSeconds of sampledTimes(video.duration)) {
        const canSeek = Number.isFinite(video.duration);
        reportProgress(`${canSeek ? "seeking" : "advancing"} ${clip.id} ${timeSeconds.toFixed(2)}s`);
        await withTimeout(
          canSeek ? seekVideo(video, timeSeconds) : advanceVideo(video, timeSeconds),
          30_000,
          `${clip.id} ${canSeek ? "seek" : "playback"} ${timeSeconds}`,
        );
        const modelInput = config.inputMode === "canvas"
          ? (renderMovementDenseCaptureInput({
              canvas: modelCanvas,
              qualityTier: config.qualityTier ?? "high",
              video,
            }) ? modelCanvas : video)
          : video;
        const startedAt = performance.now();
        const segmentation = await withTimeout(
          model.segmentPersonParts(modelInput, {
            flipHorizontal: false,
            internalResolution: config.qualityTier === "low" ? "low" : "medium",
            maxDetections: 1,
            nmsRadius: 20,
            scoreThreshold: 0.3,
            segmentationThreshold: 0.7,
          }),
          90_000,
          `${config.candidateId} inference ${clip.id} ${timeSeconds}`,
        );
        const inferenceMs = performance.now() - startedAt;
        reportProgress(`measured ${clip.id} ${timeSeconds.toFixed(2)}s in ${Math.round(inferenceMs)} ms`);
        inferenceTimes.push(inferenceMs);
        cycleTimes.push(inferenceMs);
        clipTimes.push(inferenceMs);
        coverages.push(segmentationCoverage(segmentation));
        const anchors = buildMovementBodyPixSurfaceAnchors({
          inferenceTimestampMs: timeSeconds * 1_000,
          segmentation,
          sourceTimestampMs: timeSeconds * 1_000,
        });
        const anchorIds = new Set(anchors.map((anchor) => anchor.id));
        const coveredRegions = new Set(anchors.map((anchor) => anchor.region));
        const missingRegions = MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.filter(
          (region) => !coveredRegions.has(region),
        );
        const retainedAnchorCount = previousAnchorIds
          ? [...anchorIds].filter((id) => previousAnchorIds.has(id)).length
          : null;
        anchorMeasurements.push({
          anchorCount: anchors.length,
          missingRegions,
          regionCount: coveredRegions.size,
          stableIdRetention: retainedAnchorCount === null
            ? null
            : retainedAnchorCount / Math.max(1, Math.min(anchorIds.size, previousAnchorIds.size)),
        });
        previousAnchorIds = anchorIds;
        peakTensorMemoryMb = Math.max(peakTensorMemoryMb, tf.memory().numBytes / (1024 * 1024));
      }
      clipMeasurements.push({
        anchorCountMax: Math.max(...anchorMeasurements.map((measurement) => measurement.anchorCount)),
        anchorCountMedian: percentile(
          anchorMeasurements.map((measurement) => measurement.anchorCount),
          0.5,
        ),
        anchorCountMin: Math.min(...anchorMeasurements.map((measurement) => measurement.anchorCount)),
        bodyPartCountMax: Math.max(...coverages.map((coverage) => coverage.bodyPartCount)),
        clipId: clip.id,
        cycleIndex,
        completeRegionFrameCount: anchorMeasurements.filter(
          (measurement) => measurement.missingRegions.length === 0,
        ).length,
        frameCount: clipTimes.length,
        medianInferenceMs: percentile(clipTimes, 0.5),
        missingRegions: Array.from(new Set(
          anchorMeasurements.flatMap((measurement) => measurement.missingRegions),
        )).sort(),
        p95InferenceMs: percentile(clipTimes, 0.95),
        personPixelRatioMedian: percentile(
          coverages.map((coverage) => coverage.personPixelRatio),
          0.5,
        ),
        stableIdRetentionMedian: percentile(
          anchorMeasurements.flatMap((measurement) => (
            measurement.stableIdRetention === null ? [] : [measurement.stableIdRetention]
          )),
          0.5,
        ),
      });
      video.removeAttribute("src");
      video.load();
      reportProgress(`completed ${config.candidateId} ${clip.id}`);
      }
      cycleMedianInferenceMs.push(percentile(
        cycleIndex === 0 ? cycleTimes.slice(1) : cycleTimes,
        0.5,
      ));
      tensorMemoryMbAfterCycles = tf.memory().numBytes / (1024 * 1024);
      reportProgress(`completed cycle ${cycleIndex + 1}/${config.cycles ?? 1}`);
    }
  } finally {
    model.dispose();
  }

  return {
    backend: tf.getBackend(),
    clipMeasurements,
    cycleMedianInferenceMs,
    cycles: config.cycles ?? 1,
    inputHeight,
    inputWidth,
    medianInferenceMs: percentile(inferenceTimes.slice(1), 0.5),
    modelLoadMs,
    p95InferenceMs: percentile(inferenceTimes.slice(1), 0.95),
    peakTensorMemoryMb,
    sampleCount: inferenceTimes.length,
    sustainedPerformance: {
      firstCycleMedianMs: cycleMedianInferenceMs[0] ?? 0,
      lastCycleMedianMs: cycleMedianInferenceMs.at(-1) ?? 0,
      latencyDriftRatio: cycleMedianInferenceMs[0]
        ? (cycleMedianInferenceMs.at(-1) ?? 0) / cycleMedianInferenceMs[0]
        : 0,
      maximumCycleMedianMs: Math.max(...cycleMedianInferenceMs, 0),
      tensorMemoryGrowthMb: Math.max(0, tensorMemoryMbAfterCycles - tensorMemoryMbBeforeCycles),
    },
    warmupMs: inferenceTimes[0] ?? 0,
  };
}

async function main() {
  try {
    window.__denseCaptureBenchmarkResult = await runCandidate(window.__denseCaptureBenchmarkConfig);
  } catch (error) {
    window.__denseCaptureBenchmarkError = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    window.__denseCaptureBenchmarkDone = true;
  }
}

void main();
