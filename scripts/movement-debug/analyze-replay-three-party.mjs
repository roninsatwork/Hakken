#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectReplayTelemetryFrames } from "./lib/replay-proof-identity.mjs";

const SEGMENT_THRESHOLDS = {
  leftFoot: 0.2,
  leftLowerArm: 0.12,
  leftShin: 0.15,
  leftThigh: 0.15,
  leftUpperArm: 0.12,
  rightFoot: 0.2,
  rightLowerArm: 0.12,
  rightShin: 0.15,
  rightThigh: 0.15,
  rightUpperArm: 0.12,
};
const AXIAL_THRESHOLD = 0.12;
const CONFIDENT_SOURCE_THRESHOLD = 0.45;
const PERSISTENT_DIVERGENCE_FRAMES = 3;

function parseArgs(argv) {
  const args = { out: "", strict: false, telemetry: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--telemetry") args.telemetry = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function vectorAngle(left, right) {
  if (!left || !right) return null;
  const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y + left.z * right.z));
  return Math.acos(dot);
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function persistentDivergenceRuns(samples, threshold) {
  const runs = [];
  samples
    .filter((sample) => sample.difference > threshold)
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .forEach((sample) => {
      const currentRun = runs.at(-1);
      if (!currentRun || sample.frameIndex !== currentRun.at(-1).frameIndex + 1) {
        runs.push([sample]);
        return;
      }
      currentRun.push(sample);
    });
  return runs.filter((run) => run.length >= PERSISTENT_DIVERGENCE_FRAMES);
}

function axialDifferences(frame) {
  const instructor = frame.avatars?.instructor;
  const player = frame.avatars?.player;
  if (!instructor || !player) return [];
  const entries = [];
  for (const axis of ["pitch", "roll", "yaw"]) {
    const renderedKey = `appliedWorld${axis[0].toUpperCase()}${axis.slice(1)}`;
    const left = Number.isFinite(instructor.avatarHead?.[renderedKey])
      ? instructor.avatarHead[renderedKey]
      : instructor.headApplied?.[axis];
    const right = Number.isFinite(player.avatarHead?.[renderedKey])
      ? player.avatarHead[renderedKey]
      : player.headApplied?.[axis];
    if (Number.isFinite(left) && Number.isFinite(right)) {
      entries.push({ axis: `head.${axis}`, difference: Math.abs(left - right) });
    }
  }
  for (const bone of ["chest", "upperChest"]) {
    for (const axis of ["x", "y", "z"]) {
      const left = instructor.avatarSpine?.[bone]?.[axis];
      const right = player.avatarSpine?.[bone]?.[axis];
      if (Number.isFinite(left) && Number.isFinite(right)) {
        entries.push({ axis: `${bone}.${axis}`, difference: Math.abs(left - right) });
      }
    }
  }
  return entries;
}

export function analyzeThreePartyReplay({ telemetry }) {
  const frameInspection = inspectReplayTelemetryFrames({
    frameCount: telemetry.frameCount,
    frames: telemetry.frames,
    hasDebug: () => true,
    isRendered: (frame) => Boolean(
      frame?.avatars?.instructor?.avatarVisual && frame?.avatars?.player?.avatarVisual,
    ),
  });
  const frames = frameInspection.uniqueExpectedFrames;
  const missingRoleFrames = Array.from({ length: frameInspection.frameCount }, (_, frameIndex) => {
    const frame = frames.find((candidate) => candidate.frameIndex === frameIndex);
    return !frame?.avatars?.instructor?.avatarVisual || !frame?.avatars?.player?.avatarVisual
      ? frameIndex
      : null;
  }).filter((frameIndex) => frameIndex !== null);
  const failures = [];
  if (frameInspection.frameCount === 0) {
    failures.push({ code: "three-party-frame-count-invalid", count: 1 });
  }
  if (telemetry.proofMode !== "three-party-mirror") {
    failures.push({ code: "three-party-proof-mode-missing", count: frameInspection.frameCount });
  }
  if (frameInspection.missingFrameIndexes.length > 0) {
    failures.push({ code: "three-party-rendered-frames-missing", count: frameInspection.missingFrameIndexes.length });
  }
  if (frameInspection.duplicateFrameIndexes.length > 0) {
    failures.push({ code: "three-party-frame-index-duplicate", count: frameInspection.duplicateFrameIndexes.length });
  }
  if (frameInspection.unexpectedFrameIndexes.length > 0 || frameInspection.invalidFrameEntries.length > 0) {
    failures.push({
      code: "three-party-frame-index-invalid",
      count: frameInspection.unexpectedFrameIndexes.length + frameInspection.invalidFrameEntries.length,
    });
  }
  if (frameInspection.missingRenderedFrameIndexes.length > 0) {
    failures.push({
      code: "three-party-rendered-frame-telemetry-missing",
      count: frameInspection.missingRenderedFrameIndexes.length,
    });
  }
  if (
    typeof telemetry.missingFrameCount === "number" &&
    telemetry.missingFrameCount !== frameInspection.missingFrameIndexes.length
  ) {
    failures.push({ code: "three-party-frame-accounting-mismatch", count: 1 });
  }
  if (missingRoleFrames.length > 0) {
    failures.push({ code: "three-party-rendered-role-missing", count: missingRoleFrames.length });
  }

  const segments = Object.fromEntries(Object.entries(SEGMENT_THRESHOLDS).map(([segment, threshold]) => {
    const samples = [];
    let confidentSampleCount = 0;
    for (const frame of frames) {
      const instructor = frame.avatars?.instructor?.avatarVisual?.segments?.[segment];
      const player = frame.avatars?.player?.avatarVisual?.segments?.[segment];
      if (!instructor || !player) continue;
      const difference = vectorAngle(instructor.direction, player.direction);
      if (difference === null) continue;
      if (Math.min(instructor.confidence ?? 0, player.confidence ?? 0) >= CONFIDENT_SOURCE_THRESHOLD) {
        confidentSampleCount += 1;
      }
      samples.push({ difference, frameIndex: frame.frameIndex });
    }
    const sortedSamples = [...samples].sort((left, right) => left.difference - right.difference);
    const p95 = percentile(sortedSamples.map((sample) => sample.difference), 0.95);
    const persistentRuns = persistentDivergenceRuns(samples, threshold);
    const missingSampleCount = Math.max(0, frameInspection.frameCount - samples.length);
    if (missingSampleCount > 0) {
      failures.push({ code: "three-party-segment-render-missing", count: missingSampleCount, segment });
    } else if (p95 !== null && p95 > threshold) {
      failures.push({ code: "three-party-segment-diverged", count: samples.filter((sample) => sample.difference > threshold).length, segment });
    }
    if (persistentRuns.length > 0) {
      failures.push({
        code: "three-party-segment-sustained-divergence",
        count: persistentRuns.reduce((sum, run) => sum + run.length, 0),
        segment,
      });
    }
    return [segment, {
      confidentSampleCount,
      maxDifference: round(sortedSamples.at(-1)?.difference),
      meanDifference: round(samples.reduce((sum, sample) => sum + sample.difference, 0) / Math.max(samples.length, 1)),
      missingSampleCount,
      p95Difference: round(p95),
      persistentDivergenceRuns: persistentRuns.slice(0, 10).map((run) => ({
        frameEnd: run.at(-1).frameIndex,
        frameStart: run[0].frameIndex,
        length: run.length,
        maxDifference: round(Math.max(...run.map((sample) => sample.difference))),
      })),
      sampleCount: samples.length,
      threshold,
      worstFrames: sortedSamples.slice(-20).reverse().map((sample) => ({
        difference: round(sample.difference),
        frameIndex: sample.frameIndex,
      })),
    }];
  }));

  const axialSamples = frames.flatMap((frame) => axialDifferences(frame).map((sample) => ({
    ...sample,
    frameIndex: frame.frameIndex,
  })));
  const sortedAxialSamples = [...axialSamples].sort((left, right) => left.difference - right.difference);
  const axialP95 = percentile(sortedAxialSamples.map((sample) => sample.difference), 0.95);
  if (axialP95 !== null && axialP95 > AXIAL_THRESHOLD) {
    failures.push({
      code: "three-party-axial-diverged",
      count: axialSamples.filter((sample) => sample.difference > AXIAL_THRESHOLD).length,
    });
  }
  const axialSamplesByAxis = new Map();
  axialSamples.forEach((sample) => {
    const samples = axialSamplesByAxis.get(sample.axis) ?? [];
    samples.push(sample);
    axialSamplesByAxis.set(sample.axis, samples);
  });
  const persistentAxialRuns = Array.from(axialSamplesByAxis.entries()).flatMap(([axis, samples]) => (
    persistentDivergenceRuns(samples, AXIAL_THRESHOLD).map((run) => ({ axis, run }))
  ));
  if (persistentAxialRuns.length > 0) {
    failures.push({
      code: "three-party-axial-sustained-divergence",
      count: persistentAxialRuns.reduce((sum, entry) => sum + entry.run.length, 0),
    });
  }
  const missingAxialFrameCount = Math.max(0, frameInspection.frameCount - new Set(
    axialSamples.map((sample) => sample.frameIndex),
  ).size);
  if (missingAxialFrameCount > 0) {
    failures.push({ code: "three-party-axial-render-missing", count: missingAxialFrameCount });
  }

  return {
    axial: {
      p95Difference: round(axialP95),
      persistentDivergenceRuns: persistentAxialRuns.slice(0, 20).map(({ axis, run }) => ({
        axis,
        frameEnd: run.at(-1).frameIndex,
        frameStart: run[0].frameIndex,
        length: run.length,
        maxDifference: round(Math.max(...run.map((sample) => sample.difference))),
      })),
      sampleCount: axialSamples.length,
      threshold: AXIAL_THRESHOLD,
      worstFrames: sortedAxialSamples.slice(-20).reverse().map((sample) => ({
        ...sample,
        difference: round(sample.difference),
      })),
    },
    failures,
    frameAccounting: {
      compared: frameInspection.compared,
      complete: frameInspection.complete,
      expected: frameInspection.frameCount,
      missing: frameInspection.missingFrameIndexes.length,
      rendered: frameInspection.rendered,
    },
    frameCount: frameInspection.frameCount,
    frameIntegrity: {
      duplicateFrameIndexes: frameInspection.duplicateFrameIndexes,
      invalidFrameEntries: frameInspection.invalidFrameEntries,
      missingFrameIndexes: frameInspection.missingFrameIndexes,
      missingRenderedFrameIndexes: frameInspection.missingRenderedFrameIndexes,
      unexpectedFrameIndexes: frameInspection.unexpectedFrameIndexes,
    },
    missingFrameCount: frameInspection.missingFrameIndexes.length,
    missingRoleFrameCount: missingRoleFrames.length,
    missingRoleFrames: missingRoleFrames.slice(0, 100),
    proofMode: telemetry.proofMode ?? "unknown",
    segments,
    sessionId: telemetry.sessionId,
    status: failures.length === 0 ? "passed" : "blocked",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Analyze actual instructor/player rendered agreement from a three-party Replay capture.");
    return;
  }
  if (!args.telemetry) throw new Error("Pass --telemetry <file>.");
  const telemetry = JSON.parse(await readFile(path.resolve(args.telemetry), "utf8"));
  const report = analyzeThreePartyReplay({ telemetry });
  if (args.out) await writeFile(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (args.strict && report.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
