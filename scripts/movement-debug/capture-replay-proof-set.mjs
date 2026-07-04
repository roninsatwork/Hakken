#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultAnalysisPath = "tmp/movement-replay-lab/root-motion-proof-analysis.json";
const defaultBaseUrl = "http://localhost:3000";
const defaultOutDir = "tmp/movement-replay-lab/captures/root-motion-proof-set";
const rootReviewCodes = new Set(["root_turn_detected", "root_path_detected"]);

function printHelp() {
  console.log(`Capture a Movement Replay Lab proof set from an analysis JSON.

Usage:
  npm run movement:replay:proof-set -- --analysis tmp/movement-replay-lab/root-motion-proof-analysis.json

Options:
  --analysis <file>      Analysis JSON from movement:replay:analyze. Defaults to ${defaultAnalysisPath}
  --base-url <url>       App URL. Defaults to ${defaultBaseUrl}
  --out <dir>            Output directory. Defaults to ${defaultOutDir}
  --max-sessions <n>     Limit selected proof sessions. Defaults to all selected sessions.
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
    headed: false,
    includeBaseline: true,
    localTestAuth: false,
    maxSessions: Number.POSITIVE_INFINITY,
    outDir: defaultOutDir,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--headed") {
      args.headed = true;
    } else if (arg === "--local-test-auth") {
      args.localTestAuth = true;
    } else if (arg === "--no-baseline") {
      args.includeBaseline = false;
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--out") {
      args.outDir = argv[++index] || args.outDir;
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

  const selected = selectProofAnalyses(analyses, args.includeBaseline).slice(0, args.maxSessions);
  if (selected.length === 0) {
    throw new Error("No proof sessions selected from analysis JSON.");
  }

  await mkdir(args.outDir, { recursive: true });

  const jobs = selected.map((analysis, index) => {
    const frameCount = Number(analysis.summary?.frameCount || 0);
    const frames = proofFramesForAnalysis(analysis);
    const rootCodes = Array.from(new Set(
      analysis.failures
        .filter((failure) => rootReviewCodes.has(failure.code))
        .map((failure) => failure.code),
    ));
    const kind = rootCodes.length > 0 ? rootCodes.join("-") : "baseline";
    const outDir = path.join(
      args.outDir,
      `${String(index + 1).padStart(2, "0")}-${sanitizeFilePart(kind)}-${sanitizeFilePart(String(analysis.sessionId).slice(-8))}`,
    );

    return {
      frameCount,
      frames,
      kind,
      outDir,
      rootCodes,
      sessionId: analysis.sessionId,
    };
  });

  for (const job of jobs) {
    console.log("");
    console.log(`Capturing ${job.kind} proof for ${job.sessionId}: frames ${job.frames.join(", ")}`);
    await mkdir(job.outDir, { recursive: true });
    runCapture({
      args,
      frames: job.frames,
      outDir: job.outDir,
      sessionId: job.sessionId,
    });
  }

  const manifest = {
    analysisPath: path.resolve(args.analysisPath),
    baseUrl: args.baseUrl,
    capturedAt: new Date().toISOString(),
    jobs,
  };
  const manifestPath = path.join(args.outDir, "movement-replay-proof-set-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("");
  console.log(`Captured ${jobs.length} proof session(s).`);
  console.log(`Wrote ${path.resolve(args.outDir)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
