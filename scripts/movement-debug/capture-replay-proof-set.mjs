#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultAnalysisPath = "tmp/movement-replay-lab/root-motion-proof-analysis.json";
const defaultBaseUrl = "http://localhost:3000";
const defaultOutDir = "tmp/movement-replay-lab/captures/root-motion-proof-set";
const rootReviewCodes = new Set(["root_turn_detected", "root_path_detected"]);
const visualCaptureLayer = "recorded replay visual capture";

function printHelp() {
  console.log(`Capture a Movement Replay Lab proof set from an analysis JSON.

Usage:
  npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/root-motion-proof-analysis.json

Options:
  --analysis <file>      Analysis JSON from movement:replay:analyze. Defaults to ${defaultAnalysisPath}
  --manifest <file>      Recorded proof manifest JSON from movement:replay:analyze.
  --base-url <url>       App URL. Defaults to ${defaultBaseUrl}
  --out <dir>            Output directory. Defaults to ${defaultOutDir}
  --debug-session-json <file>
                         Serve one exported Replay Lab session fixture while capturing.
  --max-sessions <n>     Limit selected proof sessions. Defaults to all selected sessions.
  --root-only            Capture the legacy root-turn/root-path proof set instead of manifest visual-proof rows.
  --dry-run              Print selected capture jobs without opening a browser.
  --no-baseline          Do not add a stable baseline session with no root review warning.
  --storage-state <file> Playwright storage state to reuse for auth.
  --local-test-auth      Sign in through /local-test-auth before capture.
  --role <role>          Local-test-auth role. Defaults to super-admin.
  --secret <secret>      Local-test-auth secret. Defaults to LOCAL_TEST_AUTH_SECRET.
  --headed               Show the browser while capturing.
  --help                 Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    analysisPath: defaultAnalysisPath,
    baseUrl: defaultBaseUrl,
    debugSessionJson: "",
    dryRun: false,
    headed: false,
    includeBaseline: true,
    localTestAuth: false,
    manifestPath: "",
    maxSessions: Number.POSITIVE_INFINITY,
    outDir: defaultOutDir,
    role: "super-admin",
    rootOnly: false,
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--headed") {
      args.headed = true;
    } else if (arg === "--local-test-auth") {
      args.localTestAuth = true;
    } else if (arg === "--root-only") {
      args.rootOnly = true;
    } else if (arg === "--no-baseline") {
      args.includeBaseline = false;
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--out") {
      args.outDir = argv[++index] || args.outDir;
    } else if (arg === "--debug-session-json") {
      args.debugSessionJson = argv[++index] || "";
    } else if (arg === "--max-sessions") {
      const parsed = Number.parseInt(argv[++index] || "", 10);
      args.maxSessions = Number.isFinite(parsed) && parsed > 0 ? parsed : args.maxSessions;
    } else if (arg === "--storage-state") {
      args.storageState = argv[++index] || "";
    } else if (arg === "--role") {
      args.role = argv[++index] || args.role;
    } else if (arg === "--secret") {
      args.secret = argv[++index] || "";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function sanitizeFilePart(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

function uniqueSortedFrames(frames, frameCount) {
  return Array.from(new Set(
    frames
      .filter((frame) => Number.isFinite(frame))
      .map((frame) => Math.max(0, Math.min(Math.round(frame), Math.max(0, frameCount - 1)))),
  )).sort((left, right) => left - right);
}

function hasRootReview(analysis) {
  return analysis.failures.some((failure) => rootReviewCodes.has(failure.code));
}

function proofFramesForAnalysis(analysis) {
  const frameCount = Number(analysis.summary?.frameCount || 0);
  const reviewFrames = analysis.failures
    .filter((failure) => rootReviewCodes.has(failure.code))
    .map((failure) => failure.frameIndex)
    .filter((frame) => typeof frame === "number");
  const gameFrames = Array.isArray(analysis.gamePath?.frames) ? analysis.gamePath.frames : [];
  const maxYawFrame = gameFrames.reduce((best, frame) => {
    const yaw = Math.abs(Number(frame.rootHeadingYaw || 0));
    return yaw > best.value ? { frameIndex: frame.frameIndex, value: yaw } : best;
  }, { frameIndex: undefined, value: 0 });
  const maxPathFrame = gameFrames.reduce((best, frame) => {
    const pathDistance = Math.abs(Number(frame.rootPathDistance || 0));
    return pathDistance > best.value ? { frameIndex: frame.frameIndex, value: pathDistance } : best;
  }, { frameIndex: undefined, value: 0 });

  return uniqueSortedFrames([
    0,
    ...reviewFrames,
    maxYawFrame.frameIndex,
    maxPathFrame.frameIndex,
    Math.floor(Math.max(0, frameCount - 1) / 2),
    Math.max(0, frameCount - 1),
  ], frameCount);
}

function selectProofAnalyses(analyses, includeBaseline) {
  const selected = analyses.filter(hasRootReview);
  if (!includeBaseline) return selected;

  const baseline = analyses.find((analysis) => !hasRootReview(analysis));
  return baseline ? [baseline, ...selected] : selected;
}

function manifestRowsForAnalysis(manifest, analysis) {
  if (!manifest || !Array.isArray(manifest.rows)) return [];

  return manifest.rows.filter((row) => row.recordingId === analysis.sessionId);
}

function visualProofRowsForAnalysis(manifest, analysis) {
  return manifestRowsForAnalysis(manifest, analysis).filter((row) => (
    row.automatedStatus === "passed" &&
    row.status === "manual-review" &&
    Array.isArray(row.missingLayers) &&
    row.missingLayers.includes(visualCaptureLayer)
  ));
}

function gameVisualProofFramesForManifestRows(rows, analysis) {
  const visualProofFrames = Array.isArray(analysis.gamePath?.visualProofFrames)
    ? analysis.gamePath.visualProofFrames
    : [];
  const requestedCases = new Set(rows.map((row) => row.proofCase).filter(Boolean));
  const caseAliases = new Map([
    ["standing-arm-raise", "strongest-standing-arm-raise"],
    ["standing-reach", "strongest-standing-reach"],
    ["standing-twist", "strongest-standing-twist"],
  ]);

  return visualProofFrames.flatMap((frame) => {
    const frameCases = Array.isArray(frame.cases) ? frame.cases : [];
    const matches = Array.from(requestedCases).some((proofCase) => (
      frameCases.includes(proofCase) ||
      frameCases.includes(caseAliases.get(proofCase))
    ));
    return matches && Number.isFinite(frame.frameIndex) ? [frame.frameIndex] : [];
  });
}

function proofFramesForManifestRows(rows, frameCount, analysis) {
  const frames = rows.flatMap((row) => {
    const start = row.expectedFrameWindow?.startFrame;
    const end = row.expectedFrameWindow?.endFrame;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const middle = Math.floor((Number(start) + Number(end)) / 2);
    return [start, middle, end];
  });

  return uniqueSortedFrames([
    ...frames,
    ...gameVisualProofFramesForManifestRows(rows, analysis),
  ], frameCount);
}

function proofKindForManifestRows(rows) {
  const cases = Array.from(new Set(rows.map((row) => row.proofCase).filter(Boolean)));
  return cases.length > 0 ? `visual-${cases.slice(0, 4).join("-")}` : "visual-proof";
}

function selectManifestProofAnalyses(analyses, manifest) {
  return analyses
    .map((analysis) => ({
      analysis,
      rows: visualProofRowsForAnalysis(manifest, analysis),
    }))
    .filter((entry) => entry.rows.length > 0);
}

function runCapture({
  args,
  frames,
  outDir,
  sessionId,
}) {
  const captureArgs = [
    "scripts/movement-debug/capture-replay-lab.mjs",
    "--base-url",
    args.baseUrl,
    "--session",
    sessionId,
    "--frames",
    frames.join(","),
    "--out",
    outDir,
  ];

  if (args.storageState) captureArgs.push("--storage-state", args.storageState);
  if (args.debugSessionJson) captureArgs.push("--debug-session-json", args.debugSessionJson);
  if (args.localTestAuth) captureArgs.push("--local-test-auth");
  if (args.role) captureArgs.push("--role", args.role);
  if (args.secret) captureArgs.push("--secret", args.secret);
  if (args.headed) captureArgs.push("--headed");

  execFileSync(process.execPath, captureArgs, {
    env: {
      ...process.env,
      SENTRY_DSN: "",
    },
    stdio: "inherit",
  });
}

function coverageProductTruthForAnalyses(analyses) {
  const summary = analyses[0]?.coverage?.summary;
  return {
    internalDemoOnlyCount: summary?.internalDemoOnlyCount ?? 0,
    internalDemoOnlyFamilies: summary?.internalDemoOnlyFamilies ?? [],
    missingProofCount: summary?.missingProofCount ?? 0,
    userFacingCount: summary?.userFacingCount ?? 0,
    userFacingFamilies: summary?.userFacingFamilies ?? [],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const analyses = JSON.parse(await readFile(path.resolve(args.analysisPath), "utf8"));
  if (!Array.isArray(analyses)) {
    throw new Error("--analysis must point to an array of replay analyses.");
  }

  const manifest = args.manifestPath
    ? JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"))
    : null;
  const manifestSelections = !args.rootOnly && manifest
    ? selectManifestProofAnalyses(analyses, manifest)
    : [];
  const rootSelections = manifestSelections.length > 0
    ? []
    : selectProofAnalyses(analyses, args.includeBaseline).map((analysis) => ({ analysis, rows: [] }));
  const selected = [...manifestSelections, ...rootSelections].slice(0, args.maxSessions);
  if (selected.length === 0) {
    throw new Error("No proof sessions selected from analysis JSON.");
  }

  await mkdir(args.outDir, { recursive: true });

  const jobs = selected.map((selection, index) => {
    const { analysis, rows } = selection;
    const frameCount = Number(analysis.summary?.frameCount || 0);
    const frames = rows.length > 0
      ? proofFramesForManifestRows(rows, frameCount, analysis)
      : proofFramesForAnalysis(analysis);
    const rootCodes = Array.from(new Set(
      analysis.failures
        .filter((failure) => rootReviewCodes.has(failure.code))
        .map((failure) => failure.code),
    ));
    const kind = rows.length > 0
      ? proofKindForManifestRows(rows)
      : rootCodes.length > 0 ? rootCodes.join("-") : "baseline";
    const outDir = path.join(
      args.outDir,
      `${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(kind)}-${sanitizeFilePart(String(analysis.sessionId).slice(-8))}`,
    );

    return {
      frameCount,
      frames,
      kind,
      outDir,
      proofCases: rows.map((row) => row.proofCase),
      rootCodes,
      sessionId: analysis.sessionId,
    };
  });

  for (const job of jobs) {
    console.log("");
    console.log(`Capturing ${job.kind} proof for ${job.sessionId}: frames ${job.frames.join(", ")}`);
    await mkdir(job.outDir, { recursive: true });
    if (args.dryRun) continue;
    runCapture({
      args,
      frames: job.frames,
      outDir: job.outDir,
      sessionId: job.sessionId,
    });
  }

  const captureManifest = {
    analysisPath: path.resolve(args.analysisPath),
    baseUrl: args.baseUrl,
    capturedAt: new Date().toISOString(),
    coverageProductTruth: coverageProductTruthForAnalyses(analyses),
    jobs,
  };
  const manifestPath = path.join(args.outDir, "movement-replay-proof-set-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(captureManifest, null, 2)}\n`);

  console.log("");
  console.log(`Captured ${jobs.length} proof session(s).`);
  console.log(`Wrote ${path.resolve(args.outDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
