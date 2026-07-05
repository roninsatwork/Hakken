import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  parseMovementDebugReplaySessions,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDebugReplay";
import {
  buildMovementReplaySessionFromRecording,
  type MovementReplayRecordingSource,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import {
  isInlinePoseData,
  parseMovementFramePayload,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementFrameCodec";
import {
  analyzeMovementDebugReplaySessions,
  type MovementReplayAnalysis,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer";
import {
  buildMovementRecordedProofManifest,
  summarizeMovementRecordedProofGate,
  type MovementRecordedVisualCaptureFrame,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordedProofManifest";
import type { MovementDataFormat } from "../../src/app/(dashboard)/demos/movements/_lib/movementTypes";

type CliArgs = {
  autoExport: boolean;
  createExport: boolean;
  exportPath: string | null;
  file: string | null;
  limit: string;
  manifestOut: string | null;
  out: string | null;
  source: "debug-sessions" | "recordings";
  strict: boolean;
  strictManifest: boolean;
  visualCapturePaths: string[];
};

const DEFAULT_REPLAY_RUNS_DIR = "tmp/movement-replay-lab/runs";
const LATEST_EXPORT_POINTER = "latest-export-path.txt";
const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/latest-recorded-proof-manifest.json";

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    autoExport: true,
    createExport: false,
    exportPath: null,
    file: null,
    limit: "10",
    manifestOut: null,
    out: null,
    source: "recordings",
    strict: false,
    strictManifest: false,
    visualCapturePaths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      args.file = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--source") {
      const source = argv[index + 1] ?? "recordings";
      if (source !== "recordings" && source !== "debug-sessions") {
        throw new Error("--source must be either recordings or debug-sessions.");
      }
      args.source = source;
      index += 1;
    } else if (arg === "--export") {
      args.exportPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--create-export") {
      args.createExport = true;
    } else if (arg === "--no-auto-export") {
      args.autoExport = false;
    } else if (arg === "--limit") {
      args.limit = argv[index + 1] ?? "10";
      index += 1;
    } else if (arg === "--manifest-out") {
      args.manifestOut = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--visual-captures") {
      args.visualCapturePaths.push(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--strict-manifest") {
      args.strictManifest = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run movement:replay:analyze
  npm run movement:replay:analyze -- --limit 5
  npm run movement:replay:analyze -- --source debug-sessions --limit 5
  npm run movement:replay:analyze -- --file tmp/movement-replay-lab/recordings.json
  npm run movement:replay:analyze -- --out tmp/movement-replay-lab/summary.json

Options:
  --source <kind>    Analyze saved movement recordings (default) or debug-sessions.
  --file <path>      Read Convex data JSON from a local file instead of calling convex data.
  --limit <n>        Number of recent rows to fetch from Convex dev data. Default: 10.
  --export <path>    Convex export ZIP or extracted directory with _storage files.
  --create-export    Create a fresh Convex export with file storage before analyzing recordings.
  --no-auto-export   Do not auto-create/reuse a Convex storage export for storage-backed recordings.
  --out <path>       Write the JSON analysis report.
  --manifest-out <path>
                     Write the recorded proof manifest JSON. Defaults next to --out, or
                     ${DEFAULT_MANIFEST_PATH} when --out is omitted.
  --visual-captures <path>
                     Replay Lab capture manifest file or directory. Can be passed more than once.
  --strict           Exit non-zero when any error-level replay failure is found.
  --strict-manifest  Exit non-zero when the recorded proof manifest has failed,
                     missing-proof, manual-review, or source-data-limitation rows.
`);
}

function convexDataTable(table: string, limit: string): unknown {
  const output = execFileSync(
    "npx",
    [
      "convex",
      "data",
      table,
      "--limit",
      String(limit),
      "--order",
      "desc",
      "--format",
      "json",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SENTRY_DSN: "",
      },
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return JSON.parse(output) as unknown;
}

function readRows(args: CliArgs): unknown {
  if (args.file) {
    return JSON.parse(readFileSync(resolve(args.file), "utf8")) as unknown;
  }

  const table = args.source === "recordings" ? "movements" : "movementDebugSessions";
  return convexDataTable(table, args.limit);
}

function maybeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function captureManifestFiles(inputPath: string): string[] {
  const resolved = resolve(inputPath);
  if (!existsSync(resolved)) return [];

  const stats = statSync(resolved);
  if (stats.isFile()) return [resolved];
  if (!stats.isDirectory()) return [];

  return readdirSync(resolved, { withFileTypes: true }).flatMap((entry) => {
    const child = join(resolved, entry.name);
    if (entry.isDirectory()) return captureManifestFiles(child);
    if (!entry.isFile()) return [];
    return basename(child).startsWith("movement-replay-") &&
      basename(child).endsWith("-manifest.json")
      ? [child]
      : [];
  });
}

function parseVisualCaptureManifest(value: unknown): MovementRecordedVisualCaptureFrame[] {
  if (!value || typeof value !== "object") return [];

  const manifest = value as {
    captures?: Array<{
      avatarPath?: unknown;
      diagnostics?: Record<string, unknown>;
      frame?: unknown;
      sourcePath?: unknown;
    }>;
    sessionId?: unknown;
  };
  const recordingId = maybeString(manifest.sessionId);
  if (!recordingId || !Array.isArray(manifest.captures)) return [];

  return manifest.captures.flatMap((capture) => {
    const frameIndex = maybeNumber(capture.frame);
    if (frameIndex === null) return [];

    return [{
      avatarLowerError: maybeNumber(capture.diagnostics?.avatarLowerError),
      avatarPath: maybeString(capture.avatarPath),
      avatarUpperError: maybeNumber(capture.diagnostics?.avatarUpperError),
      frameIndex,
      recordingId,
      sourcePath: maybeString(capture.sourcePath),
    }];
  });
}

function readVisualCaptures(paths: string[]) {
  return paths.flatMap((inputPath) => (
    captureManifestFiles(inputPath).flatMap((manifestPath) => (
      parseVisualCaptureManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown)
    ))
  ));
}

function createConvexExport(exportPath: string) {
  mkdirSync(dirname(exportPath), { recursive: true });
  const output = execFileSync(
    "npx",
    [
      "convex",
      "export",
      "--include-file-storage",
      "--path",
      exportPath,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SENTRY_DSN: "",
      },
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  if (output.trim()) console.log(output.trim());
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readLatestExportPath() {
  const pointerPath = resolve(DEFAULT_REPLAY_RUNS_DIR, LATEST_EXPORT_POINTER);
  if (!existsSync(pointerPath)) return null;

  const exportPath = readFileSync(pointerPath, "utf8").trim();
  if (!exportPath || !existsSync(exportPath)) return null;
  return exportPath;
}

function writeLatestExportPath(exportPath: string) {
  const pointerPath = resolve(DEFAULT_REPLAY_RUNS_DIR, LATEST_EXPORT_POINTER);
  mkdirSync(dirname(pointerPath), { recursive: true });
  writeFileSync(pointerPath, `${exportPath}\n`);
}

function rowsContainStorageBackedRecordings(rows: unknown) {
  const records = (Array.isArray(rows) ? rows : [rows])
    .map(parseRecordingRow)
    .filter((recording): recording is MovementReplayRecordingSource => Boolean(recording));

  return records.some((recording) => !isInlinePoseData(recording.poseData));
}

function resolveRecordingExportPath(args: CliArgs, rows: unknown) {
  if (args.source !== "recordings") return null;
  if (args.exportPath) return resolve(args.exportPath);
  if (!args.autoExport) return null;
  if (!rowsContainStorageBackedRecordings(rows)) return null;

  return readLatestExportPath() ??
    resolve(DEFAULT_REPLAY_RUNS_DIR, `${timestampForPath()}-movement-recordings.convex-export.zip`);
}

function shouldCreateRecordingExport(args: CliArgs, exportPath: string | null) {
  if (!exportPath) return false;
  if (args.createExport) return true;
  if (args.exportPath) return false;
  return !existsSync(exportPath);
}

function storagePayloadFromDirectory(exportPath: string, storageId: string) {
  for (const extension of [".json", ".txt", ""]) {
    const candidate = resolve(exportPath, "_storage", `${storageId}${extension}`);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }

  return null;
}

function storagePayloadFromZip(exportPath: string, storageId: string) {
  for (const extension of [".json", ".txt", ""]) {
    try {
      return execFileSync("unzip", ["-p", exportPath, `_storage/${storageId}${extension}`], {
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // Try the next file extension from the Convex export.
    }
  }

  return null;
}

function readStoragePayload(exportPath: string | null, storageId: string) {
  if (!exportPath) {
    throw new Error(
      `Recording ${storageId} is stored in Convex file storage. Pass --export <path> or --create-export.`,
    );
  }

  const resolvedExportPath = resolve(exportPath);
  const stats = statSync(resolvedExportPath);
  const payload = stats.isDirectory()
    ? storagePayloadFromDirectory(resolvedExportPath, storageId)
    : storagePayloadFromZip(resolvedExportPath, storageId);

  if (!payload) {
    throw new Error(`Could not find storage payload ${storageId} in ${resolvedExportPath}.`);
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function movementDataFormat(value: unknown): MovementDataFormat | undefined {
  return value === "legacy-inline-json" || value === "legacy-storage-json" || value === "storage-json-v1"
    ? value
    : undefined;
}

function parseRecordingRow(value: unknown): MovementReplayRecordingSource | null {
  if (!isRecord(value)) return null;
  const poseData = stringValue(value.poseData);
  if (!poseData) return null;

  return {
    _id: stringValue(value._id, stringValue(value.id, "unknown")),
    captureFps: numberValue(value.captureFps),
    createdAt: numberValue(value.createdAt),
    durationMs: numberValue(value.durationMs),
    frameCount: numberValue(value.frameCount),
    poseData,
    poseDataFormat: movementDataFormat(value.poseDataFormat),
    title: stringValue(value.title, "Untitled movement"),
  };
}

function parseMovementReplayRecordings(rows: unknown, exportPath: string | null) {
  const records = (Array.isArray(rows) ? rows : [rows])
    .map(parseRecordingRow)
    .filter((recording): recording is MovementReplayRecordingSource => Boolean(recording));

  return records.map((recording) => {
    const storedInFile = !isInlinePoseData(recording.poseData);
    const payload = storedInFile
      ? readStoragePayload(exportPath, recording.poseData)
      : recording.poseData;
    const sourceFormat = recording.poseDataFormat ?? (storedInFile ? "legacy-storage-json" : "legacy-inline-json");
    const parsed = parseMovementFramePayload(payload, sourceFormat);

    return buildMovementReplaySessionFromRecording(
      recording,
      parsed.frames,
      recording.captureFps ?? parsed.fps,
      {
        captureStartReadiness: parsed.captureStartReadiness,
      },
    );
  });
}

function defaultManifestPath(outPath: string | null) {
  if (!outPath) return DEFAULT_MANIFEST_PATH;
  if (outPath.endsWith(".json")) {
    return outPath.replace(/\.json$/, ".proof-manifest.json");
  }
  return `${outPath}.proof-manifest.json`;
}

function printReport(analyses: MovementReplayAnalysis[]) {
  const failed = analyses.filter((analysis) => !analysis.pass).length;
  const warnings = analyses.reduce(
    (sum, analysis) => sum + analysis.failures.filter((failure) => failure.severity === "warning").length,
    0,
  );
  const errors = analyses.reduce(
    (sum, analysis) => sum + analysis.failures.filter((failure) => failure.severity === "error").length,
    0,
  );

  console.log(
    `Movement replay analysis: ${analyses.length} session(s), ${failed} failed, ${errors} error(s), ${warnings} warning(s).`,
  );

  analyses.forEach((analysis) => {
    const errorCount = analysis.failures.filter((failure) => failure.severity === "error").length;
    const warningCount = analysis.failures.filter((failure) => failure.severity === "warning").length;
    const resultLabel = errorCount > 0 ? "FAIL" : warningCount > 0 ? "REVIEW" : "CLEAN";
    const targetStages = Array.from(new Set(
      analysis.gamePath.frames.map((frame) => frame.lowerBodyTargetStage),
    )).sort();
    console.log("");
    console.log(`${resultLabel} ${analysis.sessionId}`);
    console.log(`  samples: ${analysis.summary.frameCount}, duration: ${analysis.summary.durationMs}ms`);
    console.log(
      `  retarget avg: ${analysis.metrics.averageRetargetQuality.toFixed(2)}, strong full-body frames: ${analysis.metrics.strongFullBodyFrameCount}`,
    );
    console.log(
      `  game path: calibration ${analysis.gamePath.calibrationQuality.toFixed(2)}, retarget baseline ${analysis.gamePath.retargetSourceQuality.toFixed(2)}, squat frames ${analysis.gamePath.frames.filter((frame) => frame.shouldDrivePlayerSquat).length}`,
    );
    console.log(
      `  lower-body targets: ${targetStages.join(", ") || "none"}`,
    );
    console.log(
      `  coverage audit: ${analysis.coverage.summary.explicitStatusCount}/${analysis.coverage.summary.familyCount} explicit, user-facing ${analysis.coverage.summary.userFacingCount}, internal-demo-only ${analysis.coverage.summary.internalDemoOnlyCount}, supported ${analysis.coverage.summary.supportedCount}, approximate ${analysis.coverage.summary.approximateCount}, diagnostic ${analysis.coverage.summary.diagnosticOnlyCount}, unsupported ${analysis.coverage.summary.unsupportedCount}, missing-proof ${analysis.coverage.summary.missingProofCount}${analysis.coverage.summary.unsupportedFamilies.length ? ` (${analysis.coverage.summary.unsupportedFamilies.join(", ")})` : ""}`,
    );
    console.log(
      `  exercise classes: lunges ${analysis.metrics.exerciseLungeFrameCount}, roll/crawl ${analysis.metrics.exerciseRollingCrawlingFrameCount}, floor rolls ${analysis.metrics.exerciseFloorRollTransitionCount}, transitions ${analysis.metrics.exerciseTransitionCount}`,
    );
    console.log(
      `  camera confidence: ready ${analysis.metrics.cameraConfidenceReadyFrameCount}, partial ${analysis.metrics.cameraConfidencePartialFrameCount}, uncertain ${analysis.metrics.cameraConfidenceUncertainFrameCount}, lost ${analysis.metrics.cameraConfidenceLostFrameCount}, score allowed ${analysis.metrics.cameraScoreAllowedFrameCount}, help events ${analysis.metrics.cameraHelpEventCount}`,
    );
    console.log(
      `  start readiness: ready ${analysis.metrics.startReadinessReadyFrameCount}, blocked ${analysis.metrics.startReadinessBlockedFrameCount}, can start game ${analysis.metrics.startReadinessCanStartGameFrameCount}, stored ${analysis.metrics.startReadinessStoredFrameCount}, mismatches ${analysis.metrics.startReadinessMismatchFrameCount}, blocked captures ${analysis.metrics.startReadinessCaptureBlockedCount}`,
    );
    console.log(
      `  gameplay events: clear ${analysis.metrics.gameplayClearMovementEventCount}, tracking uncertainty ${analysis.metrics.gameplayTrackingUncertaintyEventCount}, score delta ${analysis.metrics.gameplayScoreDeltaTotal}`,
    );
    console.log(
      `  root motion: world ${analysis.metrics.rootMotionWorldLandmarkFrameCount}/${analysis.summary.frameCount}, limited ${analysis.metrics.rootMotionSourceLimitedFrameCount}, max yaw ${analysis.metrics.maxRootHeadingYaw.toFixed(2)}, max path ${analysis.metrics.maxRootPathDistance.toFixed(2)}, heading q ${analysis.metrics.averageRootHeadingConfidence.toFixed(2)}, path q ${analysis.metrics.averageRootPositionConfidence.toFixed(2)}`,
    );
    console.log(
      `  root intent: travel ${analysis.metrics.rootMotionTravelFrameCount}, turn ${analysis.metrics.rootMotionTurnFrameCount}, pivot ${analysis.metrics.rootMotionPivotFrameCount}, step ${analysis.metrics.rootMotionStepEventFrameCount}, weight ${analysis.metrics.rootMotionWeightTransferFrameCount}, jump ${analysis.metrics.rootMotionJumpFrameCount}`,
    );
    console.log(
      `  head/root: pose ${analysis.metrics.headPoseFrameCount}/${analysis.summary.frameCount}, applied ${analysis.metrics.headAppliedFrameCount}, away body ${analysis.metrics.awayBodyFrameCount}, divergence frames ${analysis.metrics.headRootDivergenceFrameCount}, avg divergence ${analysis.metrics.averageHeadRootDivergence.toFixed(2)}`,
    );
    console.log(
      `  replay/game parity: ${analysis.gamePath.parity.divergenceFrameCount} divergence frame(s)${
        typeof analysis.gamePath.parity.firstDivergenceFrame === "number"
          ? `, first frame ${analysis.gamePath.parity.firstDivergenceFrame}`
          : ""
      }`,
    );
    console.log(
      `  replay/game wrappers: ${analysis.metrics.replayGameWrapperFrameCount} frame(s), ${analysis.metrics.replayGameWrapperDivergenceFrameCount} divergence frame(s)${
        typeof analysis.gamePath.parity.firstWrapperDivergenceFrame === "number"
          ? `, first frame ${analysis.gamePath.parity.firstWrapperDivergenceFrame}`
          : ""
      }`,
    );
    console.log(
      `  visual match: ${Math.round(analysis.metrics.visualMatchScore * 100)}%, reliable frames: ${analysis.metrics.visualReliableFrameCount}/${analysis.summary.frameCount}, motion coverage: ${Math.round(analysis.metrics.visualMotionCoverage * 100)}%`,
    );
    console.log(
      `  avatar output: ${analysis.metrics.avatarVisualFrameCount} frame(s), avg lower-body direction error ${analysis.metrics.averageAvatarLowerBodyDirectionError.toFixed(2)}`,
    );
    console.log(
      `  lower owner transitions: ${analysis.metrics.lowerBodyOwnerTransitions} (${analysis.metrics.ownerTransitionsPerSecond.toFixed(2)}/s)`,
    );
    console.log(
      `  out-of-frame avg/max: ${analysis.metrics.averageOutOfFrameCount.toFixed(2)}/${analysis.metrics.maxOutOfFrameCount}`,
    );
    console.log(`  current lower owners: ${analysis.summary.lowerBodyOwners.join(", ") || "none"}`);

    if (analysis.failures.length === 0) {
      console.log("  failures: none");
      return;
    }

    analysis.failures.forEach((failure) => {
      const frame = typeof failure.frameIndex === "number" ? ` frame ${failure.frameIndex}` : "";
      console.log(`  ${failure.severity.toUpperCase()} ${failure.code}${frame}: ${failure.detail}`);
    });
  });
}

function formatGateCounts(counts: Partial<Record<string, number>>) {
  const entries = Object.entries(counts)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([, leftCount], [, rightCount]) => (rightCount ?? 0) - (leftCount ?? 0));

  if (entries.length === 0) return "none";
  return entries.map(([key, count]) => `${key}:${count}`).join(", ");
}

export async function runMovementReplayAnalyzerCli(argv: string[]) {
  const args = parseArgs(argv);
  const rows = readRows(args);
  const exportPath = resolveRecordingExportPath(args, rows);
  const shouldCreateExport = shouldCreateRecordingExport(args, exportPath);
  if (shouldCreateExport && exportPath) {
    console.log(`Creating Convex storage export: ${exportPath}`);
    createConvexExport(exportPath);
    writeLatestExportPath(exportPath);
  } else if (args.source === "recordings" && exportPath) {
    console.log(`Using Convex storage export: ${exportPath}`);
    if (!args.exportPath) writeLatestExportPath(exportPath);
  }

  const sessions = args.source === "recordings"
    ? parseMovementReplayRecordings(rows, exportPath)
    : parseMovementDebugReplaySessions(rows);
  const analyses = analyzeMovementDebugReplaySessions(sessions);
  const visualCaptures = readVisualCaptures(args.visualCapturePaths);
  const proofManifest = buildMovementRecordedProofManifest(analyses, { visualCaptures });
  const proofGate = summarizeMovementRecordedProofGate(proofManifest);

  printReport(analyses);
  console.log("");
  console.log(
    `Recorded proof manifest: ${proofManifest.summary.totalRows} row(s), ${proofManifest.summary.passedCount} passed, ${proofManifest.summary.failedCount} failed, ${proofManifest.summary.missingProofCount} missing-proof, ${proofManifest.summary.manualReviewCount} manual-review, ${proofManifest.summary.sourceDataLimitationCount} source-data-limitation; automated proof ${proofManifest.summary.automatedPassedCount} passed, ${proofManifest.summary.automatedMissingProofCount} missing-proof, ${proofManifest.summary.automatedFailedCount} failed; visual capture ${proofManifest.summary.visualCaptureRowCount} row(s), ${proofManifest.summary.visualCaptureFrameCount} frame match(es), ${proofManifest.summary.visualCaptureMissingRowCount} row(s) still missing.`,
  );
  if (args.visualCapturePaths.length > 0) {
    console.log(`Replay visual captures: ${visualCaptures.length} frame(s) loaded.`);
  }
  console.log(proofGate.summary);
  if (proofGate.status === "blocked") {
    console.log(`Blocking proof statuses: ${formatGateCounts(proofGate.blockingRowsByStatus)}`);
    console.log(`Blocking proof cases: ${formatGateCounts(proofGate.blockingRowsByProofCase)}`);
    console.log(`Blocking missing layers: ${formatGateCounts(proofGate.blockingRowsByMissingLayer)}`);
  }

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(analyses, null, 2)}\n`);
    console.log("");
    console.log(`Wrote ${outPath}`);
  }

  const manifestPath = resolve(args.manifestOut ?? defaultManifestPath(args.out));
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(proofManifest, null, 2)}\n`);
  console.log(`Wrote ${manifestPath}`);

  if (args.strict && analyses.some((analysis) => !analysis.pass)) {
    process.exit(1);
  }
  if (args.strictManifest && proofGate.status === "blocked") {
    process.exit(1);
  }
}
