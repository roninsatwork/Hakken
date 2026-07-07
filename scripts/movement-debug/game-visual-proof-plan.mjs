#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultAnalysisPath = "tmp/movement-replay-lab/latest-current-analysis.json";
const defaultBaseUrl = "http://localhost:3000";
const defaultOutPath = "tmp/movement-replay-lab/latest-game-visual-proof-plan.json";

function printHelp() {
  console.log(`Write a Game Studio visual proof target plan from movement replay analysis.

Usage:
  npm run movement:game-visual-plan -- --analysis tmp/movement-replay-lab/latest-current-analysis.json

Options:
  --analysis <file>               Analysis JSON from movement:replay:analyze. Defaults to ${defaultAnalysisPath}
  --out <file>                    Output JSON path. Defaults to ${defaultOutPath}
  --base-url <url>                App URL for route hints. Defaults to ${defaultBaseUrl}
  --max-sessions <n>              Limit selected sessions. Defaults to all sessions with targets.
  --max-frames-per-session <n>    Limit visual target frames per selected session. Defaults to all target frames.
  --proof-case <case>             Keep only frames matching this proof case. Can repeat.
  --help                          Show this help.
`);
}

function parsePositiveInteger(value, fallback = Number.POSITIVE_INFINITY) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseGameVisualProofPlanArgs(argv) {
  const args = {
    analysisPath: defaultAnalysisPath,
    baseUrl: defaultBaseUrl,
    help: false,
    maxFramesPerSession: Number.POSITIVE_INFINITY,
    maxSessions: Number.POSITIVE_INFINITY,
    outPath: defaultOutPath,
    proofCases: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--max-sessions") {
      args.maxSessions = parsePositiveInteger(argv[++index], args.maxSessions);
    } else if (arg === "--max-frames-per-session") {
      args.maxFramesPerSession = parsePositiveInteger(argv[++index], args.maxFramesPerSession);
    } else if (arg === "--proof-case") {
      args.proofCases.push(argv[++index] || "");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function numberValue(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function countBy(values) {
  return values.reduce((counts, value) => {
    if (!value) return counts;
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function routeHint(baseUrl, movementId) {
  if (!movementId) return null;
  return `${baseUrl.replace(/\/$/, "")}/demos/movements/${movementId}/play?debugTracking=1&guidedPreview=1`;
}

function frameRouteHint(baseUrl, movementId, frameIndex) {
  const baseRoute = routeHint(baseUrl, movementId);
  if (!baseRoute) return null;
  return `${baseRoute}&debugGameFrame=${frameIndex}`;
}

function normalizeFrame(frame, options = {}) {
  const frameIndex = numberValue(frame?.frameIndex);
  const movementId = stringValue(options.movementId, "");

  return {
    cases: uniqueSorted(Array.isArray(frame?.cases) ? frame.cases : []),
    displayLowerLabel: stringValue(frame?.displayLowerLabel, "unknown"),
    displayedMovementStrength: numberValue(frame?.displayedMovementStrength),
    frameIndex,
    playRouteHint: frameRouteHint(options.baseUrl || defaultBaseUrl, movementId, frameIndex),
    rawMovementStrength: numberValue(frame?.rawMovementStrength),
    readableMovementStrength: numberValue(frame?.readableMovementStrength),
    reasons: uniqueSorted(Array.isArray(frame?.reasons) ? frame.reasons : []),
    rootHeadingYaw: numberValue(frame?.rootHeadingYaw),
    rootTravelDistance: numberValue(frame?.rootTravelDistance),
    scoreAllowed: Boolean(frame?.scoreAllowed),
    sourceLowerLabel: stringValue(frame?.sourceLowerLabel, "unknown"),
    squatDepth: numberValue(frame?.squatDepth),
  };
}

function visualFramesForAnalysis(analysis, options = {}) {
  const frames = Array.isArray(analysis?.gamePath?.visualProofFrames)
    ? analysis.gamePath.visualProofFrames
    : [];
  const movementId = stringValue(analysis?.summary?.movementId, "");
  const requestedProofCases = new Set(options.proofCases ?? []);

  return frames
    .map((frame) => normalizeFrame(frame, { baseUrl: analysis?.baseUrl, movementId }))
    .filter((frame) => (
      requestedProofCases.size === 0 ||
      frame.cases.some((proofCase) => requestedProofCases.has(proofCase))
    ))
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .slice(0, options.maxFramesPerSession ?? Number.POSITIVE_INFINITY);
}

export function gameVisualProofPlanForAnalyses(analyses, options = {}) {
  if (!Array.isArray(analyses)) {
    throw new Error("Expected analysis JSON to contain an array of replay analyses.");
  }

  const baseUrl = options.baseUrl || defaultBaseUrl;
  const maxFramesPerSession = options.maxFramesPerSession ?? Number.POSITIVE_INFINITY;
  const maxSessions = options.maxSessions ?? Number.POSITIVE_INFINITY;
  const requestedProofCases = uniqueSorted(options.proofCases ?? []);
  const analysisWithVisualProofFrameFieldCount = analyses.filter((analysis) => (
    Array.isArray(analysis?.gamePath?.visualProofFrames)
  )).length;
  const candidateSessions = analyses
    .map((analysis) => {
      const sessionId = stringValue(analysis?.sessionId || analysis?.summary?.id, "unknown-session");
      const movementId = stringValue(analysis?.summary?.movementId, "");
      const frames = visualFramesForAnalysis(
        { ...analysis, baseUrl },
        { maxFramesPerSession, proofCases: requestedProofCases },
      );
      if (frames.length === 0) return null;
      const sessionProofCases = uniqueSorted(frames.flatMap((frame) => frame.cases));

      return {
        captureMode: "game-studio-recorded-frame-injection-needed",
        frameCount: numberValue(analysis?.summary?.frameCount),
        frames,
        movementId: movementId || null,
        nextAction: "Use these target frames to drive a focused Game Studio visual capture harness. Do not count them as visual proof until screenshots are attached and reviewed.",
        playRouteHint: routeHint(baseUrl, movementId, sessionId),
        proofCases: sessionProofCases,
        recordingId: sessionId,
        targetFrameCount: frames.length,
      };
    })
    .filter(Boolean)
    .slice(0, maxSessions);
  const allCases = candidateSessions.flatMap((session) => session.proofCases);

  return {
    baseUrl,
    captureMode: "game-studio-recorded-frame-injection-needed",
    sessions: candidateSessions,
    summary: {
      byProofCase: countBy(allCases),
      maxFramesPerSession: Number.isFinite(maxFramesPerSession) ? maxFramesPerSession : null,
      maxSessions: Number.isFinite(maxSessions) ? maxSessions : null,
      movementIds: uniqueSorted(candidateSessions.map((session) => session.movementId).filter(Boolean)),
      proofCases: uniqueSorted(allCases),
      requestedProofCases,
      recordingIds: candidateSessions.map((session) => session.recordingId),
      analysisWithVisualProofFrameFieldCount,
      selectedSessionCount: candidateSessions.length,
      targetFrameCount: candidateSessions.reduce((total, session) => total + session.targetFrameCount, 0),
      totalAnalysisCount: analyses.length,
    },
  };
}

async function main() {
  const args = parseGameVisualProofPlanArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const analyses = JSON.parse(await readFile(path.resolve(args.analysisPath), "utf8"));
  const plan = {
    ...gameVisualProofPlanForAnalyses(analyses, {
      baseUrl: args.baseUrl,
      maxFramesPerSession: args.maxFramesPerSession,
      maxSessions: args.maxSessions,
      proofCases: args.proofCases,
    }),
    analysisPath: path.resolve(args.analysisPath),
    generatedAt: new Date().toISOString(),
  };

  await writeFile(path.resolve(args.outPath), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(
    `Game visual proof plan: ${plan.summary.selectedSessionCount} session(s), ${plan.summary.targetFrameCount} target frame(s), cases ${plan.summary.proofCases.join(", ") || "none"}.`,
  );
  if (plan.summary.totalAnalysisCount > 0 && plan.summary.analysisWithVisualProofFrameFieldCount === 0) {
    console.log("No analyses contained gamePath.visualProofFrames. Rerun movement:replay:analyze with current code before generating the Game visual proof plan.");
  }
  console.log(`Wrote ${path.resolve(args.outPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
