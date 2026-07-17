#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runMountedGamePacketCapture } from "./capture-mounted-game-packet.mjs";

const defaultManifest = "tmp/movement-replay-lab/current-nine-recording-proof-final-v3-2026-07-14/manifest.json";
const defaultOutDir = "tmp/movement-replay-lab/mounted-game-nine-proof";

function parseArgs(argv) {
  const args = {
    allowLegacy: false,
    baseUrl: "http://localhost:3000",
    localTestAuth: false,
    manifest: defaultManifest,
    maxRecordings: Number.POSITIVE_INFINITY,
    outDir: defaultOutDir,
    recordingId: "",
    role: "super-admin",
    resumePassed: false,
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    skipPause: false,
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-legacy") args.allowLegacy = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--skip-pause") args.skipPause = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--manifest") args.manifest = argv[++index] || args.manifest;
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--recording-id") args.recordingId = argv[++index] || "";
    else if (arg === "--resume-passed") args.resumePassed = true;
    else if (arg === "--max-recordings") args.maxRecordings = Number(argv[++index] || 0);
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Run every controlling recording sequentially through the mounted Game lifecycle.

Usage:
  npm run movement:game:nine-proof -- --manifest <manifest.json> --out <directory>

Options:
  --base-url <url>          App URL
  --allow-legacy           Report historical packets as lifecycle-only
  --local-test-auth        Authenticate through /local-test-auth
  --secret <secret>        Local auth secret
  --storage-state <file>   Playwright storage state
  --recording-id <id>      Run only one manifest recording
  --max-recordings <n>     Run only the first n selected recordings
  --resume-passed          Reuse complete passing per-recording reports
  --skip-pause             Use uninterrupted playback for Replay/Game parity
`);
}

const BODY_REGIONS = {
  head: [0, 7, 8, 9, 10],
  leftArm: [11, 13, 15, 17, 19, 21],
  leftLeg: [23, 25, 27, 29, 31],
  rightArm: [12, 14, 16, 18, 20, 22],
  rightLeg: [24, 26, 28, 30, 32],
  torso: [11, 12, 23, 24],
};

function frameLandmarkDelta(previous, current, indexes) {
  if (!previous || !current) return 0;
  const deltas = indexes.flatMap((index) => {
    const left = previous[index];
    const right = current[index];
    if (!left || !right) return [];
    return [Math.hypot(
      right.x - left.x,
      right.y - left.y,
      (right.z ?? 0) - (left.z ?? 0),
    )];
  });
  return deltas.length > 0
    ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length
    : 0;
}

export function buildRecordedMovementCoverage(session) {
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  const channelPresentFrames = {
    blendshapes: 0,
    face: 0,
    leftHand: 0,
    pose: 0,
    rightHand: 0,
    worldPose: 0,
  };
  const regions = Object.fromEntries(Object.keys(BODY_REGIONS).map((region) => [region, {
    evaluatedTransitionCount: Math.max(samples.length - 1, 0),
    movementTransitionCount: 0,
    peakMeanLandmarkDelta: 0,
    totalMeanLandmarkDelta: 0,
  }]));

  samples.forEach((sample, frameIndex) => {
    const tracking = sample?.tracking ?? {};
    if (Array.isArray(tracking.pose) && tracking.pose.length >= 33) channelPresentFrames.pose += 1;
    if (Array.isArray(tracking.worldPose) && tracking.worldPose.length >= 33) channelPresentFrames.worldPose += 1;
    if (Array.isArray(tracking.face) && tracking.face.length > 0) channelPresentFrames.face += 1;
    if (Array.isArray(tracking.blendshapes) && tracking.blendshapes.length > 0) channelPresentFrames.blendshapes += 1;
    if ((tracking.hands?.left?.landmarks?.length ?? 0) > 0) channelPresentFrames.leftHand += 1;
    if ((tracking.hands?.right?.landmarks?.length ?? 0) > 0) channelPresentFrames.rightHand += 1;
    if (frameIndex === 0) return;

    const previousPose = samples[frameIndex - 1]?.tracking?.pose;
    for (const [region, indexes] of Object.entries(BODY_REGIONS)) {
      const delta = frameLandmarkDelta(previousPose, tracking.pose, indexes);
      const summary = regions[region];
      summary.totalMeanLandmarkDelta += delta;
      summary.peakMeanLandmarkDelta = Math.max(summary.peakMeanLandmarkDelta, delta);
      if (delta >= 0.002) summary.movementTransitionCount += 1;
    }
  });

  return {
    channelPresentFrames,
    evaluatedFrameCount: samples.length,
    regions: Object.fromEntries(Object.entries(regions).map(([region, summary]) => [region, {
      ...summary,
      peakMeanLandmarkDelta: Number(summary.peakMeanLandmarkDelta.toFixed(6)),
      totalMeanLandmarkDelta: Number(summary.totalMeanLandmarkDelta.toFixed(6)),
    }])),
    unmeasuredFrameCount: Math.max(Number(session?.sampleCount || 0) - samples.length, 0),
  };
}

function mountedCaptureArgs(args, recording, outPath) {
  const values = [
    "--base-url", args.baseUrl,
    "--debug-session-json", recording.session,
    "--out", outPath,
  ];
  if (args.allowLegacy) values.push("--allow-legacy");
  if (args.localTestAuth) values.push("--local-test-auth");
  if (args.secret) values.push("--secret", args.secret);
  if (args.role) values.push("--role", args.role);
  if (args.storageState) values.push("--storage-state", args.storageState);
  if (args.skipPause) values.push("--skip-pause");
  return values;
}

export async function runMountedGameNineProof(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  const manifestPath = path.resolve(args.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  let recordings = Array.isArray(manifest.recordings) ? manifest.recordings : [];
  if (args.recordingId) recordings = recordings.filter((recording) => recording.id === args.recordingId);
  recordings = recordings.slice(0, args.maxRecordings);
  if (recordings.length === 0) throw new Error("The mounted Game manifest did not select any recordings.");

  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const rows = [];
  for (let index = 0; index < recordings.length; index += 1) {
    const recording = recordings[index];
    const session = JSON.parse(await readFile(path.resolve(recording.session), "utf8"));
    const coverage = buildRecordedMovementCoverage(session);
    const reportPath = path.join(outDir, `${recording.id}.mounted-game.json`);
    console.log(`[${index + 1}/${recordings.length}] ${recording.title} (${recording.expectedFrameCount} frame(s))`);
    let error = "";
    let report = null;
    if (args.resumePassed) {
      try {
        const existingReport = JSON.parse(await readFile(reportPath, "utf8"));
        if (
          existingReport.passed === true &&
          existingReport.final?.expectedFrameCount === recording.expectedFrameCount
        ) {
          report = existingReport;
          console.log(`[${index + 1}/${recordings.length}] REUSED PASS`);
        }
      } catch {
        // No reusable completed report exists.
      }
    }
    if (!report) {
      try {
        await runMountedGamePacketCapture(mountedCaptureArgs(args, recording, reportPath));
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
        console.error(`[${index + 1}/${recordings.length}] BLOCKED: ${error.split("\n")[0]}`);
      }
      try {
        report = JSON.parse(await readFile(reportPath, "utf8"));
      } catch {
        // Startup-gate failures intentionally may not have a completed frame report.
      }
    }
    rows.push({
      contractStatus: report?.final?.contractStatus ?? (session.inputContract ? "unknown" : "legacy-missing"),
      coverage,
      error: error || null,
      expectedFrameCount: recording.expectedFrameCount,
      id: recording.id,
      missingRenderedFrameCount: report?.final?.missingRenderedFrameIndexes?.length ?? null,
      missingSourceFrameCount: report?.final?.missingFrameIndexes?.length ?? null,
      passed: report?.passed === true && !error,
      processedFrameCount: report?.final?.processedFrameIndexes?.length ?? 0,
      proofTier: report?.proofTier ?? "blocked-before-completion",
      renderedFrameCount: report?.final?.renderedFrames?.length ?? 0,
      reportPath: report ? path.relative(process.cwd(), reportPath) : null,
      title: recording.title,
    });
    await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({
      completedRecordingCount: rows.length,
      recordingCount: recordings.length,
      recordingSetId: manifest.recordingSetId,
      rows,
    }, null, 2)}\n`);
  }

  const totals = rows.reduce((summary, row) => ({
    expectedFrames: summary.expectedFrames + row.expectedFrameCount,
    processedFrames: summary.processedFrames + row.processedFrameCount,
    renderedFrames: summary.renderedFrames + row.renderedFrameCount,
  }), { expectedFrames: 0, processedFrames: 0, renderedFrames: 0 });
  const summary = {
    generatedAt: new Date().toISOString(),
    manifestPath: path.relative(process.cwd(), manifestPath),
    passed: rows.length === recordings.length && rows.every((row) => row.passed),
    recordingCount: recordings.length,
    recordingSetId: manifest.recordingSetId,
    rows,
    totals,
  };
  const summaryPath = path.join(outDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Mounted Game nine-video result: ${rows.filter((row) => row.passed).length}/${rows.length} passed.`);
  console.log(`Wrote ${summaryPath}`);
  if (!summary.passed) process.exitCode = 1;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runMountedGameNineProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
