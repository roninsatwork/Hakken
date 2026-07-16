import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parseMovementDebugReplaySessions,
  type MovementDebugReplaySession,
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
import type { MovementDataFormat } from "../../src/app/(dashboard)/demos/movements/_lib/movementTypes";
import { sourceHashForReplaySession } from "../../src/app/(dashboard)/demos/movements/_lib/movementReplaySourceIdentity";
import {
  buildReplayStudioRepairPacket,
  compareReplayStudioRepairPackets,
  formatReplayStudioRepairPacketMarkdown,
  stableReplayStudioSourceHash,
  type ReplayStudioRepairPacketArtifact,
  type ReplayStudioRepairPacket,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementReplayStudioRepairPacket";

type CliArgs = {
  analysisPath: string | null;
  beforePath: string | null;
  fixture: string | null;
  fixtureId: string | null;
  frameIndex: number | null;
  json: boolean;
  listFixtures: boolean;
  mdOutPath: string | null;
  outPath: string;
  recordingId: string | null;
  renderedTelemetryPath: string | null;
  refreshArtifact: boolean;
  requireFreshArtifact: boolean;
  sessionPath: string | null;
  strict: boolean;
};

type DiagnoseRuntime = {
  motionPipelineFingerprint?: string;
};

type ReplayStudioFixtureRegistryEntry = {
  analysis?: string;
  expected?: unknown;
  frame?: number;
  id: string;
  recordingId?: string;
  session?: string;
  title?: string;
};

type ReplayStudioDiagnoseFailureKind = "harness-error" | "missing-input" | "stale-input";

type ResolvedAnalysisArtifact = {
  checkedPaths: string[];
  kind: Extract<ReplayStudioRepairPacketArtifact["kind"], "default-analysis" | "explicit-analysis">;
  path: string;
};

type ReplayStudioArtifactFreshness = NonNullable<ReplayStudioRepairPacketArtifact["freshness"]>;

type ConfiguredRecordingSource = {
  artifact: ReplayStudioRepairPacketArtifact;
  sessionPath: string;
};

export type ReplayStudioDiagnoseFailure = {
  availableFixtureIds?: string[];
  availableRecordingIds?: string[];
  checkedPaths?: string[];
  command: "movement:diagnose";
  detail?: string;
  message: string;
  outcome: ReplayStudioDiagnoseFailureKind;
  path?: string;
  recovery: string;
  refreshCommand?: string;
  requestedRecordingId?: string | null;
  schemaVersion: 1;
  sourcePriority?: string[];
};

class ReplayStudioDiagnoseCliError extends Error {
  exitCode: number;
  failure: ReplayStudioDiagnoseFailure;

  constructor(failure: Omit<ReplayStudioDiagnoseFailure, "command" | "schemaVersion">, exitCode = 2) {
    super(failure.message);
    this.name = "ReplayStudioDiagnoseCliError";
    this.exitCode = exitCode;
    this.failure = {
      command: "movement:diagnose",
      schemaVersion: 1,
      ...failure,
    };
  }
}

const DEFAULT_ANALYSIS_PATHS = [
  "tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json",
  "tmp/movement-replay-lab/current-analysis-with-captures.json",
  "tmp/movement-replay-lab/current-analysis.json",
];
const DEFAULT_PACKET_PATH = "tmp/movement-replay-lab/current-repair-packet.json";
const DEFAULT_PACKET_MARKDOWN_PATH = "tmp/movement-replay-lab/current-repair-packet.md";
const FIXTURE_REGISTRY_PATH = "scripts/movement-debug/fixtures/replay-studio/registry.json";
const FIXTURE_ROOT_PATH = "scripts/movement-debug/fixtures/replay-studio";
const CONFIGURED_EXPORT_POINTER_PATH = "tmp/movement-replay-lab/runs/latest-export-path.txt";
const CONFIGURED_SESSION_DIR = "tmp/movement-replay-lab/configured-recording-sources";
const DIAGNOSE_SOURCE_PRIORITY = [
  "committed-fixture",
  "explicit-session",
  "explicit-analysis",
  "default-analysis",
  "configured-recording-source",
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    analysisPath: null,
    beforePath: null,
    fixture: null,
    fixtureId: null,
    frameIndex: null,
    json: false,
    listFixtures: false,
    mdOutPath: DEFAULT_PACKET_MARKDOWN_PATH,
    outPath: DEFAULT_PACKET_PATH,
    recordingId: null,
    renderedTelemetryPath: null,
    refreshArtifact: false,
    requireFreshArtifact: false,
    sessionPath: null,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--analysis") {
      args.analysisPath = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--before") {
      args.beforePath = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--fixture") {
      args.fixture = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--fixture-id") {
      args.fixtureId = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--session") {
      args.sessionPath = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--recording-id" || arg === "--session-id") {
      args.recordingId = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--rendered-telemetry") {
      args.renderedTelemetryPath = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--frame") {
      const frameValue = optionValue(argv, index, arg);
      const parsed = Number(frameValue);
      if (!Number.isInteger(parsed)) {
        missingInput(
          `Invalid --frame value: ${frameValue}.`,
          "Pass an integer frame index, or omit --frame to diagnose the worst Replay Studio frame.",
        );
      }
      args.frameIndex = parsed;
      index += 1;
    } else if (arg === "--out") {
      args.outPath = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--md-out") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        args.mdOutPath = next;
        index += 1;
      } else {
        args.mdOutPath = defaultMarkdownPath(args.outPath);
      }
    } else if (arg === "--no-md") {
      args.mdOutPath = null;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--list-fixtures") {
      args.listFixtures = true;
    } else if (arg === "--refresh" || arg === "--refresh-artifact") {
      args.refreshArtifact = true;
    } else if (arg === "--require-fresh-artifact") {
      args.requireFreshArtifact = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      missingInput(
        `Unknown option: ${arg}`,
        "Run npm run movement:diagnose -- --help for supported Replay Studio diagnosis options.",
      );
    }
  }

  return args;
}

function optionValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1] ?? null;
  if (!value || value.startsWith("--")) {
    missingInput(
      `Missing value for ${option}.`,
      `Pass ${option} <value>, or run npm run movement:diagnose -- --help for supported options.`,
    );
  }
  return value;
}

function printHelp() {
  console.log(`Build a Replay Studio repair packet for one recording/frame.

Usage:
  npm run movement:diagnose -- --session tmp/movement-replay-lab/replay-session.json --frame 42
  npm run movement:diagnose -- --analysis tmp/movement-replay-lab/current-avatar-follow-analysis-with-captures.json --recording-id <id>

Options:
  --session <file>       Replay Lab session fixture. Re-analyzes with current code.
  --analysis <file>      Existing replay analysis JSON. Defaults to the current tmp analysis files.
  --before <file>        Previous repair packet JSON to compare against.
  --fixture <id>         Resolve a committed Replay Studio fixture from the fixture registry.
  --fixture-id <id>      Mark the packet as coming from a committed Replay Studio fixture.
  --list-fixtures        List committed Replay Studio fixture ids, or JSON with --json.
  --recording-id <id>    Select one recording/session from an analysis array, or a committed fixture id when no artifact exists.
  --rendered-telemetry <file>
                         Complete final-VRM full-sequence telemetry for the same recording.
  --frame <index>        Focus the packet on one frame. Defaults to the worst Replay Studio frame.
  --out <file>           Write packet JSON. Defaults to ${DEFAULT_PACKET_PATH}.
  --md-out <file>        Write packet Markdown. Defaults to ${DEFAULT_PACKET_MARKDOWN_PATH}.
  --no-md                Do not write packet Markdown.
  --json                 Print packet JSON to stdout.
  --refresh              Require current/recomputed evidence before diagnosing. Does not fetch remote sources implicitly.
  --require-fresh-artifact
                          Exit non-zero when an analysis artifact is stale or lacks fingerprint freshness proof.
  --strict               Exit non-zero when the packet verdict is blocked.
`);
}

function defaultMarkdownPath(outPath: string) {
  return outPath.endsWith(".json") ? outPath.replace(/\.json$/, ".md") : `${outPath}.md`;
}

type ReplayStudioDiagnoseFailureContext = Partial<Pick<
  ReplayStudioDiagnoseFailure,
  "availableFixtureIds" | "availableRecordingIds" | "checkedPaths" | "refreshCommand" | "requestedRecordingId" | "sourcePriority"
>>;

function missingInput(
  message: string,
  recovery: string,
  filePath?: string,
  context: ReplayStudioDiagnoseFailureContext = {},
): never {
  throw new ReplayStudioDiagnoseCliError({
    ...context,
    ...(filePath ? { path: filePath } : {}),
    message,
    outcome: "missing-input",
    recovery,
  });
}

function staleInput(
  message: string,
  recovery: string,
  filePath?: string,
  context: ReplayStudioDiagnoseFailureContext = {},
): never {
  throw new ReplayStudioDiagnoseCliError({
    ...context,
    ...(filePath ? { path: filePath } : {}),
    message,
    outcome: "stale-input",
    recovery,
  });
}

function readJson(filePath: string, label: string): unknown {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    missingInput(
      `Missing ${label}: ${filePath}`,
      label === "analysis JSON"
        ? "Pass --analysis <file>, --session <file>, or regenerate the Replay analysis artifact before diagnosing."
        : "Provide an existing file path or regenerate the referenced artifact before diagnosing.",
      filePath,
    );
  }

  try {
    return JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    missingInput(
      `Invalid ${label}: ${filePath}.${detail}`,
      "Fix the JSON syntax, regenerate the artifact, or pass a different Replay Studio input path.",
      filePath,
    );
  }
}

function readRepairPacket(filePath: string | null): ReplayStudioRepairPacket | null {
  if (!filePath) return null;
  const packet = readJson(filePath, "previous repair packet JSON");
  if (!isRecord(packet) || packet.schemaVersion !== 1) {
    missingInput(
      `Expected ${filePath} to be a schemaVersion 1 Replay Studio repair packet.`,
      "Pass a previous packet produced by movement:diagnose --out <file>, or omit --before for a single-run diagnosis.",
      filePath,
    );
  }
  return packet as ReplayStudioRepairPacket;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function readExportEntry(exportPath: string, entryPath: string) {
  const resolvedExportPath = resolve(exportPath);
  const stats = statSync(resolvedExportPath);
  if (stats.isDirectory()) {
    const filePath = resolve(resolvedExportPath, entryPath);
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  }

  try {
    return execFileSync("unzip", ["-p", resolvedExportPath, entryPath], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function readStoragePayload(exportPath: string, storageId: string) {
  for (const extension of [".json", ".txt", ""]) {
    const payload = readExportEntry(exportPath, `_storage/${storageId}${extension}`);
    if (payload) return payload;
  }

  throw new Error(`Could not find storage payload ${storageId} in ${resolve(exportPath)}.`);
}

function readMovementRows(exportPath: string) {
  const payload = readExportEntry(exportPath, "movements/documents.jsonl");
  if (!payload) {
    throw new Error(`Could not find movements/documents.jsonl in ${resolve(exportPath)}.`);
  }

  return payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function recordingFromExportRow(row: unknown): MovementReplayRecordingSource | null {
  if (!isRecord(row)) return null;
  const poseData = stringValue(row.poseData, stringValue(row.poseStorageId));
  if (!poseData) return null;

  return {
    _id: stringValue(row._id, stringValue(row.id, "unknown")),
    captureFps: numberValue(row.captureFps),
    createdAt: numberValue(row.createdAt),
    durationMs: numberValue(row.durationMs),
    frameCount: numberValue(row.frameCount),
    poseData,
    poseDataFormat: movementDataFormat(row.poseDataFormat),
    title: stringValue(row.title, "Untitled movement"),
  };
}

function motionPipelineFingerprintsFromArtifact(value: unknown): string[] {
  const fingerprints = new Set<string>();
  const addRecordFingerprints = (record: Record<string, unknown>) => {
    const single = maybeString(record.motionPipelineFingerprint);
    if (single) fingerprints.add(single);
    if (Array.isArray(record.motionPipelineFingerprints)) {
      record.motionPipelineFingerprints.forEach((entry) => {
        const fingerprint = maybeString(entry);
        if (fingerprint) fingerprints.add(fingerprint);
      });
    }
  };

  if (isRecord(value)) {
    addRecordFingerprints(value);
    if (Array.isArray(value.analyses)) {
      value.analyses.forEach((entry) => {
        if (isRecord(entry)) addRecordFingerprints(entry);
      });
    }
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (isRecord(entry)) addRecordFingerprints(entry);
    });
  }

  return Array.from(fingerprints).sort();
}

function analysisArtifactFreshness(
  artifactJson: unknown,
  currentMotionPipelineFingerprint: string,
): ReplayStudioArtifactFreshness {
  const artifactFingerprints = motionPipelineFingerprintsFromArtifact(artifactJson);
  if (artifactFingerprints.length === 0) {
    return {
      currentMotionPipelineFingerprint,
      reason: "Analysis artifact does not declare a motion-pipeline fingerprint; regenerate the artifact for strict freshness proof.",
      status: "unknown",
    };
  }

  const allCurrent = artifactFingerprints.every((fingerprint) => fingerprint === currentMotionPipelineFingerprint);
  return {
    artifactMotionPipelineFingerprints: artifactFingerprints,
    currentMotionPipelineFingerprint,
    reason: allCurrent
      ? "Analysis artifact declares the current motion-pipeline fingerprint."
      : "Analysis artifact fingerprint differs from the current motion-pipeline fingerprint; regenerate before accepting this as fresh evidence.",
    status: allCurrent ? "current" : "stale",
  };
}

function withArtifactFreshness(
  artifact: ReplayStudioRepairPacketArtifact,
  freshness: ReplayStudioArtifactFreshness,
): ReplayStudioRepairPacketArtifact {
  return {
    ...artifact,
    freshness,
  };
}

function assertFreshArtifactIfRequired(
  artifact: ReplayStudioRepairPacketArtifact | null,
  requireFreshArtifact: boolean,
) {
  if (!requireFreshArtifact) return;
  const refreshHint = artifact?.refreshCommand ? ` Run: ${artifact.refreshCommand}` : "";
  const freshness = artifact?.freshness;
  if (!artifact || !freshness) {
    staleInput(
      "Artifact freshness is unavailable.",
      `Use --fixture, --session, or an analysis artifact that declares the current motion-pipeline fingerprint.${refreshHint}`,
      artifact?.path ?? undefined,
      {
        checkedPaths: artifact?.checkedPaths,
        refreshCommand: artifact?.refreshCommand,
        requestedRecordingId: artifact?.requestedRecordingId,
        sourcePriority: artifact?.sourcePriority,
      },
    );
  }
  if (
    freshness.status === "current" ||
    freshness.status === "not-required" ||
    freshness.status === "recomputed"
  ) {
    return;
  }

  staleInput(
    `Artifact freshness is ${freshness.status}: ${freshness.reason}`,
    `Regenerate the analysis artifact with the current motion pipeline, pass --session to re-analyze source frames, or use a committed fixture for minimized reproduction.${refreshHint}`,
    artifact.path ?? undefined,
    {
      checkedPaths: artifact.checkedPaths,
      refreshCommand: artifact.refreshCommand,
      requestedRecordingId: artifact.requestedRecordingId,
      sourcePriority: artifact.sourcePriority,
    },
  );
}

function assertRefreshArtifactIfRequested(
  artifact: ReplayStudioRepairPacketArtifact | null,
  refreshArtifact: boolean,
) {
  if (!refreshArtifact) return;
  const freshness = artifact?.freshness;
  if (
    freshness?.status === "current" ||
    freshness?.status === "not-required" ||
    freshness?.status === "recomputed"
  ) {
    return;
  }

  const refreshHint = artifact?.refreshCommand ? ` Run: ${artifact.refreshCommand}` : "";
  staleInput(
    freshness
      ? `Cannot refresh artifact automatically because freshness is ${freshness.status}: ${freshness.reason}`
      : "Cannot refresh artifact automatically because freshness metadata is unavailable.",
    `Use a committed fixture or source session for local recomputation, or run the artifact refresh command before diagnosis.${refreshHint}`,
    artifact?.path ?? undefined,
    {
      checkedPaths: artifact?.checkedPaths,
      refreshCommand: artifact?.refreshCommand,
      requestedRecordingId: artifact?.requestedRecordingId,
      sourcePriority: artifact?.sourcePriority,
    },
  );
}

function artifactNeedsAutomaticRefresh(artifact: ReplayStudioRepairPacketArtifact | null) {
  const freshness = artifact?.freshness;
  return Boolean(
    freshness &&
      freshness.status !== "current" &&
      freshness.status !== "not-required" &&
      freshness.status !== "recomputed",
  );
}

function isReplaySession(value: unknown): value is MovementDebugReplaySession {
  return isRecord(value) &&
    typeof value.id === "string" &&
    Array.isArray(value.samples);
}

function normalizeReplaySessions(value: unknown): MovementDebugReplaySession[] {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.every(isReplaySession)) return rows;
  return parseMovementDebugReplaySessions(value);
}

function normalizeAnalyses(value: unknown): MovementReplayAnalysis[] {
  if (Array.isArray(value)) return value as MovementReplayAnalysis[];
  if (isRecord(value) && Array.isArray(value.analyses)) return value.analyses as MovementReplayAnalysis[];
  if (isRecord(value) && isRecord(value.replayStudio)) return [value as MovementReplayAnalysis];
  throw new Error("Expected a MovementReplayAnalysis object, an array of analyses, or { analyses }.");
}

type AppliedRenderedTelemetry = {
  analysis: MovementReplayAnalysis;
  motionPipelineFingerprint: string | null;
  sourceHash: string | null;
};

function applyRenderedTelemetryToAnalysis(
  analysis: MovementReplayAnalysis,
  telemetryPath: string,
): AppliedRenderedTelemetry {
  const telemetry = readJson(telemetryPath, "rendered telemetry JSON");
  if (!isRecord(telemetry) || !Array.isArray(telemetry.frames)) {
    missingInput(
      `Expected ${telemetryPath} to contain full-sequence rendered telemetry frames.`,
      "Pass a player-avatar telemetry JSON produced by movement:replay:full-sequence.",
      telemetryPath,
    );
  }

  const expectedFrameCount = analysis.summary.frameCount || analysis.replayStudio.frames.length;
  const telemetryFrameCount = numberValue(telemetry.frameCount);
  const recordingId = analysisRecordingId(analysis);
  const telemetrySessionId = maybeString(telemetry.sessionId) ?? maybeString(telemetry.recordingId);
  if (telemetryFrameCount !== expectedFrameCount) {
    missingInput(
      `Rendered telemetry frame count ${telemetryFrameCount ?? "missing"} does not match expected ${expectedFrameCount}.`,
      "Regenerate complete rendered telemetry for the same immutable Replay session.",
      telemetryPath,
    );
  }
  if (telemetrySessionId && telemetrySessionId !== analysis.sessionId && telemetrySessionId !== recordingId) {
    missingInput(
      `Rendered telemetry session ${telemetrySessionId} does not match analysis ${analysis.sessionId}/${recordingId}.`,
      "Pass rendered telemetry generated from the same Replay recording as the diagnosis input.",
      telemetryPath,
    );
  }
  if (numberValue(telemetry.missingFrameCount) !== 0 || maybeString(telemetry.playbackError)) {
    missingInput(
      `Rendered telemetry is incomplete${maybeString(telemetry.playbackError) ? `: ${maybeString(telemetry.playbackError)}` : "."}`,
      "Regenerate the full sequence with zero missing frames and no playback error before packet generation.",
      telemetryPath,
    );
  }

  const framesByIndex = new Map<number, Record<string, unknown>>();
  telemetry.frames.forEach((candidate) => {
    if (!isRecord(candidate)) return;
    const frameIndex = numberValue(candidate.frameIndex);
    const debug = isRecord(candidate.debug) ? candidate.debug : null;
    if (!Number.isInteger(frameIndex) || !debug || !isRecord(debug.avatarVisual)) return;
    if (numberValue(candidate.renderedFrameIndex) !== undefined && candidate.renderedFrameIndex !== frameIndex) return;
    framesByIndex.set(frameIndex!, debug);
  });
  const missingFrameIndexes = Array.from({ length: expectedFrameCount }, (_, frameIndex) => frameIndex)
    .filter((frameIndex) => !framesByIndex.has(frameIndex));
  if (missingFrameIndexes.length > 0 || framesByIndex.size !== expectedFrameCount) {
    missingInput(
      `Rendered telemetry has ${framesByIndex.size}/${expectedFrameCount} unique final-VRM frames; first missing ${missingFrameIndexes[0] ?? "duplicate/out-of-range"}.`,
      "Regenerate deterministic full-sequence telemetry with complete frame accounting and zero silent skips.",
      telemetryPath,
    );
  }

  const nextAnalysis = structuredClone(analysis);
  const lowerErrors: number[] = [];
  nextAnalysis.replayStudio.frames = nextAnalysis.replayStudio.frames.map((frame) => {
    const debug = framesByIndex.get(frame.frameIndex);
    const avatarVisual = isRecord(debug?.avatarVisual) ? debug.avatarVisual : {};
    const lowerBodyDirectionError = numberValue(avatarVisual.averageLowerBodyDirectionError);
    if (lowerBodyDirectionError !== undefined) lowerErrors.push(lowerBodyDirectionError);
    return {
      ...frame,
      actual: {
        ...frame.actual,
        comparedLowerBodySegments: numberValue(avatarVisual.comparedLowerBodySegments) ?? 0,
        comparedUpperBodySegments: numberValue(avatarVisual.comparedUpperBodySegments) ?? 0,
        lowerBodyDirectionError: lowerBodyDirectionError ?? null,
        upperBodyDirectionError: numberValue(avatarVisual.averageUpperBodyDirectionError) ?? null,
      },
    };
  });
  const averageLowerError = lowerErrors.length > 0
    ? lowerErrors.reduce((sum, value) => sum + value, 0) / lowerErrors.length
    : 0;
  nextAnalysis.metrics.avatarVisualFrameCount = expectedFrameCount;
  nextAnalysis.metrics.averageAvatarLowerBodyDirectionError = averageLowerError;
  nextAnalysis.replayStudio.session = {
    ...nextAnalysis.replayStudio.session,
    summary: {
      ...nextAnalysis.replayStudio.session.summary,
      averageAvatarLowerBodyDirectionError: averageLowerError,
      avatarVisualFrameCount: expectedFrameCount,
    },
  };

  return {
    analysis: nextAnalysis,
    motionPipelineFingerprint: maybeString(telemetry.motionPipelineFingerprint),
    sourceHash: maybeString(telemetry.sourceHash),
  };
}

function readFixtureRegistry(): ReplayStudioFixtureRegistryEntry[] {
  const registry = readJson(FIXTURE_REGISTRY_PATH, "Replay Studio fixture registry");
  if (!isRecord(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.fixtures)) {
    throw new Error(`${FIXTURE_REGISTRY_PATH} must be a schemaVersion 1 registry with fixtures.`);
  }

  return registry.fixtures.map((fixture, index): ReplayStudioFixtureRegistryEntry => {
    if (!isRecord(fixture) || typeof fixture.id !== "string") {
      throw new Error(`Fixture at ${FIXTURE_REGISTRY_PATH}#${index} must declare id.`);
    }
    const analysis = maybeString(fixture.analysis);
    const session = maybeString(fixture.session);
    if (!analysis && !session) {
      throw new Error(`Fixture ${fixture.id} at ${FIXTURE_REGISTRY_PATH}#${index} must declare analysis or session.`);
    }
    return {
      ...(analysis ? { analysis } : {}),
      ...(isRecord(fixture.expected) ? { expected: fixture.expected } : {}),
      ...(typeof fixture.frame === "number" ? { frame: fixture.frame } : {}),
      id: fixture.id,
      ...(typeof fixture.recordingId === "string" ? { recordingId: fixture.recordingId } : {}),
      ...(session ? { session } : {}),
      ...(typeof fixture.title === "string" ? { title: fixture.title } : {}),
    };
  });
}

function printFixtureList(json: boolean) {
  const fixtures = readFixtureRegistry();
  if (json) {
    console.log(JSON.stringify({
      command: "movement:diagnose:list-fixtures",
      fixtureCount: fixtures.length,
      fixtures: fixtures.map((fixture) => ({
        ...fixture,
        inputKind: fixture.session ? "session" : "analysis",
        inputPath: fixtureInputPath(fixture),
        refreshCommand: fixtureRefreshCommand(fixture),
      })),
      schemaVersion: 1,
    }, null, 2));
    return;
  }

  console.log("Replay Studio fixtures:");
  fixtures.forEach((fixture) => {
    const title = fixture.title ? ` - ${fixture.title}` : "";
    const frame = typeof fixture.frame === "number" ? `frame ${fixture.frame}` : "default frame";
    const inputKind = fixture.session ? "session" : "analysis";
    console.log(`- ${fixture.id}${title} (${inputKind}, ${frame})`);
  });
}

function resolveFixture(id: string): ReplayStudioFixtureRegistryEntry {
  const fixtures = readFixtureRegistry();
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    missingInput(
      `Replay Studio fixture ${id} was not found in ${FIXTURE_REGISTRY_PATH}.`,
      "Choose a fixture id from the committed Replay Studio fixture registry, or pass --analysis <file> for a custom artifact.",
      FIXTURE_REGISTRY_PATH,
      {
        availableFixtureIds: fixtures.map((candidate) => candidate.id),
      },
    );
  }
  return fixture;
}

function applyFixtureArgs(args: CliArgs, fixture: ReplayStudioFixtureRegistryEntry): CliArgs {
  return {
    ...args,
    analysisPath: fixture.analysis ? fixtureAnalysisPath(fixture) : null,
    fixture: fixture.id,
    fixtureId: args.fixtureId ?? fixture.id,
    frameIndex: args.frameIndex ?? fixture.frame ?? null,
    recordingId: args.recordingId ?? fixture.recordingId ?? null,
    sessionPath: fixture.session ? fixtureSessionPath(fixture) : null,
  };
}

function resolveFixtureByRecordingId(id: string): ReplayStudioFixtureRegistryEntry | null {
  return readFixtureRegistry().find((candidate) => (
    candidate.id === id ||
    candidate.recordingId === id
  )) ?? null;
}

function fixtureAnalysisPath(fixture: ReplayStudioFixtureRegistryEntry) {
  if (!fixture.analysis) throw new Error(`Fixture ${fixture.id} does not declare an analysis artifact.`);
  return `${FIXTURE_ROOT_PATH}/${fixture.analysis}`;
}

function fixtureSessionPath(fixture: ReplayStudioFixtureRegistryEntry) {
  if (!fixture.session) throw new Error(`Fixture ${fixture.id} does not declare a session artifact.`);
  return `${FIXTURE_ROOT_PATH}/${fixture.session}`;
}

function fixtureInputPath(fixture: ReplayStudioFixtureRegistryEntry) {
  return fixture.session ? fixtureSessionPath(fixture) : fixtureAnalysisPath(fixture);
}

function fixtureForAnalysisPath(analysisPath: string): ReplayStudioFixtureRegistryEntry | null {
  const resolvedPath = resolve(analysisPath);
  return readFixtureRegistry().find((fixture) => (
    fixture.analysis &&
    resolve(fixtureAnalysisPath(fixture)) === resolvedPath
  )) ?? null;
}

function fixtureRefreshCommand(fixture: ReplayStudioFixtureRegistryEntry) {
  return `npm run movement:diagnose -- --fixture ${shellQuote(fixture.id)} --require-fresh-artifact`;
}

function analysisRefreshCommand(path: string, args: CliArgs) {
  const fixture = fixtureForAnalysisPath(path);
  if (fixture) return fixtureRefreshCommand(fixture);
  const recordingArg = args.recordingId ? ` --recording-ids ${shellQuote(args.recordingId)}` : "";
  return `npm run movement:replay:analyze -- --out ${shellQuote(path)}${recordingArg}`;
}

function sessionRefreshCommand(args: CliArgs) {
  if (!args.sessionPath) return undefined;
  const recordingArg = args.recordingId ? ` --recording-id ${shellQuote(args.recordingId)}` : "";
  const frameArg = typeof args.frameIndex === "number" ? ` --frame ${args.frameIndex}` : "";
  return `npm run movement:diagnose -- --session ${shellQuote(args.sessionPath)}${recordingArg}${frameArg} --require-fresh-artifact`;
}

function hasDefaultAnalysisArtifact() {
  return DEFAULT_ANALYSIS_PATHS.some((candidate) => existsSync(resolve(candidate)));
}

function resolveImplicitFixture(args: CliArgs): ReplayStudioFixtureRegistryEntry | null {
  if (args.fixture || args.analysisPath || args.sessionPath || !args.recordingId) return null;
  if (hasDefaultAnalysisArtifact()) return null;
  return resolveFixtureByRecordingId(args.recordingId);
}

function resolveAnalysisPath(requestedPath: string | null) {
  return resolveAnalysisArtifact(requestedPath).path;
}

function missingAnalysisInput(
  args: Pick<CliArgs, "recordingId"> | undefined,
  checkedPaths: string[],
): never {
  missingInput(
    `No analysis input found. Pass --session <file> or --analysis <file>. Checked: ${checkedPaths.join(", ")}`,
    "Run a Replay analysis/capture command first, pass an explicit --analysis <file> / --session <file> path, use --fixture/--recording-id for a committed Replay Studio fixture, or configure a local Replay export pointer.",
    undefined,
    {
      checkedPaths,
      requestedRecordingId: args?.recordingId,
      sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
    },
  );
}

function tryResolveAnalysisArtifact(
  requestedPath: string | null,
): ResolvedAnalysisArtifact | null {
  if (requestedPath) {
    return {
      checkedPaths: [requestedPath],
      kind: "explicit-analysis",
      path: requestedPath,
    };
  }

  const checkedPaths: string[] = [];
  for (const candidate of DEFAULT_ANALYSIS_PATHS) {
    checkedPaths.push(candidate);
    if (existsSync(resolve(candidate))) {
      return {
        checkedPaths,
        kind: "default-analysis",
        path: candidate,
      };
    }
  }

  return null;
}

function resolveAnalysisArtifact(
  requestedPath: string | null,
  args?: Pick<CliArgs, "recordingId">,
): ResolvedAnalysisArtifact {
  const artifact = tryResolveAnalysisArtifact(requestedPath);
  if (artifact) return artifact;
  missingAnalysisInput(args, [...DEFAULT_ANALYSIS_PATHS]);
}

function artifactForFixture({
  args,
  fixture,
  kind,
}: {
  args: CliArgs;
  fixture: ReplayStudioFixtureRegistryEntry;
  kind: Extract<
    ReplayStudioRepairPacketArtifact["kind"],
    "committed-fixture" | "recording-id-committed-fixture-fallback"
  >;
}): ReplayStudioRepairPacketArtifact {
  const isSourceSessionFixture = Boolean(fixture.session);
  return {
    checkedPaths: [FIXTURE_REGISTRY_PATH, fixtureInputPath(fixture)],
    ...(args.recordingId ? { requestedRecordingId: args.recordingId } : {}),
    ...(kind === "recording-id-committed-fixture-fallback"
      ? { fallbackReason: `No default Replay analysis artifact was available; recording id ${args.recordingId} matched a committed fixture.` }
      : {}),
    fixtureId: fixture.id,
    freshness: {
      reason: isSourceSessionFixture
        ? "Committed Replay session fixture is source-controlled and re-analyzed with the current motion code before packet generation."
        : "Committed minimized fixtures are source-controlled and their packet source hashes are enforced by the golden registry.",
      status: isSourceSessionFixture ? "recomputed" : "not-required",
    },
    kind,
    path: fixtureInputPath(fixture),
    refreshCommand: fixtureRefreshCommand(fixture),
    sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
  };
}

function artifactForAnalysis(artifact: ResolvedAnalysisArtifact, args: CliArgs): ReplayStudioRepairPacketArtifact {
  return {
    checkedPaths: artifact.checkedPaths,
    ...(args.recordingId ? { requestedRecordingId: args.recordingId } : {}),
    kind: artifact.kind,
    path: artifact.path,
    refreshCommand: analysisRefreshCommand(artifact.path, args),
    sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
  };
}

function artifactForSession(args: CliArgs): ReplayStudioRepairPacketArtifact {
  return {
    checkedPaths: args.sessionPath ? [args.sessionPath] : [],
    ...(args.recordingId ? { requestedRecordingId: args.recordingId } : {}),
    freshness: {
      reason: "Replay session input is re-analyzed with the current motion code before the repair packet is built.",
      status: "recomputed",
    },
    kind: "explicit-session",
    path: args.sessionPath,
    ...(sessionRefreshCommand(args) ? { refreshCommand: sessionRefreshCommand(args) } : {}),
    sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
  };
}

function safeConfiguredSessionId(recordingId: string) {
  return recordingId.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function configuredSessionPath(recordingId: string) {
  return `${CONFIGURED_SESSION_DIR}/${safeConfiguredSessionId(recordingId)}.session.json`;
}

function configuredRecordingRefreshCommand(recordingId: string) {
  return `npm run movement:diagnose -- --recording-id ${shellQuote(recordingId)} --refresh --require-fresh-artifact`;
}

function configuredRecordingArtifact({
  checkedPaths,
  recordingId,
  sessionPath,
  stalePath,
}: {
  checkedPaths: string[];
  recordingId: string;
  sessionPath: string;
  stalePath?: string | null;
}): ReplayStudioRepairPacketArtifact {
  return {
    checkedPaths: [...checkedPaths, sessionPath],
    ...(stalePath
      ? { fallbackReason: `Requested recording id ${recordingId} was not present in the default analysis artifact; regenerated a Replay session from the configured local export instead.` }
      : {}),
    freshness: {
      reason: "Configured local Replay export was converted to a Replay session and re-analyzed with the current motion code.",
      status: "recomputed",
    },
    kind: "configured-recording-source",
    path: sessionPath,
    refreshCommand: configuredRecordingRefreshCommand(recordingId),
    requestedRecordingId: recordingId,
    sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
    ...(stalePath ? { stalePath } : {}),
  };
}

function configuredExportPath(checkedPaths: string[]) {
  checkedPaths.push(CONFIGURED_EXPORT_POINTER_PATH);
  if (!existsSync(resolve(CONFIGURED_EXPORT_POINTER_PATH))) return null;
  const exportPath = readFileSync(resolve(CONFIGURED_EXPORT_POINTER_PATH), "utf8").trim();
  if (!exportPath) return null;
  checkedPaths.push(exportPath);
  if (!existsSync(resolve(exportPath))) {
    missingInput(
      `Configured Replay export path does not exist: ${exportPath}`,
      "Refresh the Replay export pointer or run movement:replay:analyze with --create-export before diagnosing this recording id.",
      exportPath,
      {
        checkedPaths,
        sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
      },
    );
  }
  return exportPath;
}

function resolveConfiguredRecordingSource(
  args: CliArgs,
  previousCheckedPaths: string[] = [],
  stalePath: string | null = null,
): ConfiguredRecordingSource | null {
  if (!args.recordingId || args.fixture || args.analysisPath || args.sessionPath) return null;

  const checkedPaths = [...previousCheckedPaths];
  const exportPath = configuredExportPath(checkedPaths);
  if (!exportPath) return null;

  const rows = readMovementRows(exportPath);
  const row = rows.find((candidate) => isRecord(candidate) && candidate._id === args.recordingId);
  if (!row) {
    missingInput(
      `Recording ${args.recordingId} was not found in configured Replay export ${exportPath}.`,
      "Choose a recording id present in the configured export, refresh the export, or use a committed fixture.",
      undefined,
      {
        availableRecordingIds: rows
          .filter(isRecord)
          .map((candidate) => stringValue(candidate._id, stringValue(candidate.id)))
          .filter((id) => id.length > 0),
        checkedPaths,
        requestedRecordingId: args.recordingId,
        sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
      },
    );
  }

  const recording = recordingFromExportRow(row);
  if (!recording) {
    missingInput(
      `Recording ${args.recordingId} in configured Replay export does not include pose data.`,
      "Refresh the export or choose a recording with inline pose data or storage-backed pose data.",
      undefined,
      {
        checkedPaths,
        requestedRecordingId: args.recordingId,
        sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
      },
    );
  }

  const storedInFile = !isInlinePoseData(recording.poseData);
  const payload = storedInFile
    ? readStoragePayload(exportPath, recording.poseData)
    : recording.poseData;
  const sourceFormat = recording.poseDataFormat ?? (storedInFile ? "legacy-storage-json" : "legacy-inline-json");
  const parsed = parseMovementFramePayload(payload, sourceFormat);
  const session = buildMovementReplaySessionFromRecording(
    recording,
    parsed.frames,
    recording.captureFps ?? parsed.fps,
    { captureStartReadiness: parsed.captureStartReadiness },
  );

  const sessionPath = configuredSessionPath(args.recordingId);
  mkdirSync(dirname(resolve(sessionPath)), { recursive: true });
  writeFileSync(resolve(sessionPath), `${JSON.stringify(session, null, 2)}\n`);

  return {
    artifact: configuredRecordingArtifact({
      checkedPaths,
      recordingId: args.recordingId,
      sessionPath,
      stalePath,
    }),
    sessionPath,
  };
}

function artifactForStaleDefaultFallback({
  args,
  checkedPaths,
  fixture,
  stalePath,
}: {
  args: CliArgs;
  checkedPaths: string[];
  fixture: ReplayStudioFixtureRegistryEntry;
  stalePath: string | null;
}): ReplayStudioRepairPacketArtifact {
  const isSourceSessionFixture = Boolean(fixture.session);
  return {
    checkedPaths: [
      ...checkedPaths,
      FIXTURE_REGISTRY_PATH,
      fixtureInputPath(fixture),
    ],
    fallbackReason: `Requested recording id ${args.recordingId} was not present in the default analysis artifact; using the matching committed fixture instead.`,
    fixtureId: fixture.id,
    freshness: {
      reason: isSourceSessionFixture
        ? "Fallback uses a committed source session fixture and re-analyzes it with the current motion code; the stale default artifact is not used as repair evidence."
        : "Fallback uses a committed minimized fixture; the stale default artifact is not used as repair evidence.",
      status: isSourceSessionFixture ? "recomputed" : "not-required",
    },
    kind: "default-analysis-committed-fixture-fallback",
    path: fixtureInputPath(fixture),
    refreshCommand: fixtureRefreshCommand(fixture),
    requestedRecordingId: args.recordingId,
    sourcePriority: [...DIAGNOSE_SOURCE_PRIORITY],
    ...(stalePath ? { stalePath } : {}),
  };
}

function analysisRecordingId(analysis: MovementReplayAnalysis) {
  return analysis.replayStudio.session.recordingId || analysis.sessionId;
}

function availableAnalysisRecordingIds(analyses: MovementReplayAnalysis[]) {
  return analyses.map(analysisRecordingId).filter((id) => id.length > 0);
}

function findAnalysis(analyses: MovementReplayAnalysis[], recordingId: string | null) {
  if (recordingId) {
    return analyses.find((candidate) => (
      candidate.sessionId === recordingId ||
      candidate.replayStudio.session.recordingId === recordingId
    )) ?? null;
  }

  if (analyses.length === 1) return analyses[0]!;
  missingInput(
    "Analysis input contains multiple recordings. Pass --recording-id <id>.",
    "Choose one available recording id and rerun movement:diagnose with --recording-id <id>.",
    undefined,
    {
      availableRecordingIds: availableAnalysisRecordingIds(analyses),
    },
  );
}

function selectAnalysis(analyses: MovementReplayAnalysis[], recordingId: string | null) {
  const analysis = findAnalysis(analyses, recordingId);
  if (analysis) return analysis;

  missingInput(
    `Recording/session ${recordingId} was not found in the analysis input.`,
    "Choose a recording id present in the analysis, rerun without --recording-id when the input contains one recording, or use --fixture <id> for a committed fixture.",
    undefined,
    {
      availableRecordingIds: availableAnalysisRecordingIds(analyses),
      requestedRecordingId: recordingId,
    },
  );
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function diagnoseInputCommandArg(args: CliArgs, analysisPath: string | null) {
  if (args.fixture) return `--fixture ${shellQuote(args.fixture)}`;
  if (args.sessionPath) return `--session ${shellQuote(args.sessionPath)}`;
  return `--analysis ${shellQuote(analysisPath ?? resolveAnalysisPath(args.analysisPath))}`;
}

function packetCommands({
  analysisPath,
  args,
  markdownPath,
  recordingId,
}: {
  analysisPath: string | null;
  args: CliArgs;
  markdownPath: string | null;
  recordingId: string;
}): ReplayStudioRepairPacket["commands"] {
  const inputArg = diagnoseInputCommandArg(args, analysisPath);
  const recordingArg = `--recording-id ${shellQuote(recordingId)}`;
  const frameArg = typeof args.frameIndex === "number" ? ` --frame ${args.frameIndex}` : "";
  const fixtureArg = args.fixtureId ? ` --fixture-id ${shellQuote(args.fixtureId)}` : "";
  const renderedTelemetryArg = args.renderedTelemetryPath
    ? ` --rendered-telemetry ${shellQuote(args.renderedTelemetryPath)}`
    : "";
  const compareMarkdownArg = markdownPath
    ? " --md-out tmp/movement-replay-lab/current-repair-packet.after.md"
    : " --no-md";
  const compareBeforeArg = ` --before ${shellQuote(args.outPath)}`;
  return {
    acceptance: "npm run movement:replay-studio-verdict-gate",
    compareAfterChange: `npm run movement:diagnose -- ${inputArg} ${recordingArg}${frameArg}${fixtureArg}${renderedTelemetryArg}${compareBeforeArg} --out tmp/movement-replay-lab/current-repair-packet.after.json${compareMarkdownArg}`,
    reproduce: `npm run movement:diagnose -- ${inputArg} ${recordingArg}${frameArg}${fixtureArg}${renderedTelemetryArg}`,
  };
}

function matchingSourceSession(
  sessions: MovementDebugReplaySession[] | null,
  analysis: MovementReplayAnalysis,
) {
  if (!sessions) return null;
  return sessions.find((session) => session.id === analysis.sessionId) ?? sessions[0] ?? null;
}

function printPacketSummary(packet: ReplayStudioRepairPacket) {
  console.log(
    `Replay Studio diagnosis: ${packet.verdict.status} / ${packet.verdict.failureCode} / ${packet.divergence.firstDivergentStage}`,
  );
  console.log(
    `Recording: ${packet.recording.id} (${packet.recording.sourceHashBasis} ${packet.recording.sourceHash})`,
  );
  if (packet.artifact) {
    console.log(`Artifact: ${packet.artifact.kind}${packet.artifact.path ? ` ${packet.artifact.path}` : ""}`);
    if (packet.artifact.refreshCommand) console.log(`Artifact refresh: ${packet.artifact.refreshCommand}`);
    if (packet.artifact.freshness) {
      console.log(`Artifact freshness: ${packet.artifact.freshness.status} (${packet.artifact.freshness.reason})`);
    }
    if (packet.artifact.fallbackReason) console.log(`Artifact fallback: ${packet.artifact.fallbackReason}`);
  }
  console.log(`Frame: ${packet.scope.frameStart}-${packet.scope.frameEnd}`);
  console.log(`Fix area: ${packet.repair.owner}`);
  if (packet.repair.likelyFiles.length > 0) {
    console.log(`Likely files: ${packet.repair.likelyFiles.slice(0, 4).join(", ")}`);
  }
  if (packet.comparison) {
    console.log(
      `Before comparison: ${packet.comparison.outcome} (${packet.comparison.summary})`,
    );
  }
  console.log(`Reproduce: ${packet.commands.reproduce}`);
}

export function failureForMovementReplayStudioDiagnoseError(
  error: unknown,
): { exitCode: number; failure: ReplayStudioDiagnoseFailure } {
  if (error instanceof ReplayStudioDiagnoseCliError) {
    return {
      exitCode: error.exitCode,
      failure: error.failure,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: 1,
    failure: {
      command: "movement:diagnose",
      detail: error instanceof Error ? error.stack : undefined,
      message,
      outcome: "harness-error",
      recovery: "Inspect the command, input schema, and stack trace; this is a harness error rather than a motion verdict.",
      schemaVersion: 1,
    },
  };
}

export function reportMovementReplayStudioDiagnoseFailure(error: unknown, argv: string[]) {
  const { exitCode, failure } = failureForMovementReplayStudioDiagnoseError(error);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ failure }, null, 2));
  } else {
    console.error(`Replay Studio diagnosis ${failure.outcome}: ${failure.message}`);
    console.error(`Recovery: ${failure.recovery}`);
    if (failure.path) console.error(`Path: ${failure.path}`);
    if (failure.checkedPaths?.length) console.error(`Checked paths: ${failure.checkedPaths.join(", ")}`);
    if (failure.availableFixtureIds?.length) console.error(`Available fixture ids: ${failure.availableFixtureIds.join(", ")}`);
    if (failure.availableRecordingIds?.length) console.error(`Available recording ids: ${failure.availableRecordingIds.join(", ")}`);
    if (failure.sourcePriority?.length) console.error(`Source priority: ${failure.sourcePriority.join(", ")}`);
    if (failure.refreshCommand) console.error(`Refresh: ${failure.refreshCommand}`);
    if (failure.outcome === "harness-error" && failure.detail) console.error(failure.detail);
  }
  return exitCode;
}

export async function runMovementReplayStudioDiagnoseCli(
  argv: string[],
  runtime: DiagnoseRuntime = {},
) {
  const args = parseArgs(argv);
  if (args.listFixtures) {
    printFixtureList(args.json);
    return;
  }
  if (args.fixture && (args.analysisPath || args.sessionPath)) {
    throw new Error("Use --fixture by itself, or pass --analysis/--session for custom inputs.");
  }
  const fixture = args.fixture ? resolveFixture(args.fixture) : resolveImplicitFixture(args);
  let effectiveArgs: CliArgs = fixture ? applyFixtureArgs(args, fixture) : args;
  let artifact: ReplayStudioRepairPacketArtifact | null = fixture
    ? artifactForFixture({
        args,
        fixture,
        kind: args.fixture ? "committed-fixture" : "recording-id-committed-fixture-fallback",
      })
    : null;
  let sessions: MovementDebugReplaySession[] | null = null;
  let analysisPath: string | null = null;
  let analyses: MovementReplayAnalysis[];
  if (effectiveArgs.sessionPath) {
    artifact = artifact ?? artifactForSession(effectiveArgs);
    sessions = normalizeReplaySessions(readJson(effectiveArgs.sessionPath, "Replay session fixture JSON"));
    analyses = analyzeMovementDebugReplaySessions(sessions);
  } else {
    const analysisArtifact = tryResolveAnalysisArtifact(effectiveArgs.analysisPath);
    if (analysisArtifact) {
      const analysisJson = readJson(analysisArtifact.path, "analysis JSON");
      artifact = artifact ?? withArtifactFreshness(
        artifactForAnalysis(analysisArtifact, effectiveArgs),
        analysisArtifactFreshness(
          analysisJson,
          runtime.motionPipelineFingerprint ?? "unknown",
        ),
      );
      analysisPath = analysisArtifact.path;
      analyses = normalizeAnalyses(analysisJson);
    } else {
      const configuredSource = resolveConfiguredRecordingSource(effectiveArgs, [...DEFAULT_ANALYSIS_PATHS]);
      if (!configuredSource) missingAnalysisInput(effectiveArgs, [...DEFAULT_ANALYSIS_PATHS, CONFIGURED_EXPORT_POINTER_PATH]);
      effectiveArgs = {
        ...effectiveArgs,
        sessionPath: configuredSource.sessionPath,
      };
      artifact = artifact ?? configuredSource.artifact;
      sessions = normalizeReplaySessions(readJson(configuredSource.sessionPath, "Replay session fixture JSON"));
      analyses = analyzeMovementDebugReplaySessions(sessions);
    }
  }
  let analysis = findAnalysis(analyses, effectiveArgs.recordingId);

  if (
    !analysis &&
    !args.fixture &&
    !args.analysisPath &&
    !args.sessionPath &&
    args.recordingId
  ) {
    const fallbackFixture = resolveFixtureByRecordingId(args.recordingId);
    if (fallbackFixture) {
      const staleCheckedPaths = artifact?.checkedPaths ?? [];
      const stalePath = analysisPath;
      effectiveArgs = applyFixtureArgs(args, fallbackFixture);
      if (effectiveArgs.sessionPath) {
        analysisPath = null;
        sessions = normalizeReplaySessions(readJson(effectiveArgs.sessionPath, "Replay session fixture JSON"));
        analyses = analyzeMovementDebugReplaySessions(sessions);
      } else {
        sessions = null;
        analysisPath = fixtureAnalysisPath(fallbackFixture);
        analyses = normalizeAnalyses(readJson(analysisPath, "analysis JSON"));
      }
      analysis = selectAnalysis(analyses, effectiveArgs.recordingId);
      artifact = artifactForStaleDefaultFallback({
        args,
        checkedPaths: staleCheckedPaths,
        fixture: fallbackFixture,
        stalePath,
      });
    } else {
      const configuredSource = resolveConfiguredRecordingSource(
        args,
        artifact?.checkedPaths ?? [],
        analysisPath,
      );
      if (configuredSource) {
        effectiveArgs = {
          ...args,
          sessionPath: configuredSource.sessionPath,
        };
        analysisPath = null;
        sessions = normalizeReplaySessions(readJson(configuredSource.sessionPath, "Replay session fixture JSON"));
        analyses = analyzeMovementDebugReplaySessions(sessions);
        analysis = selectAnalysis(analyses, effectiveArgs.recordingId);
        artifact = configuredSource.artifact;
      }
    }
  }

  if (!analysis) {
    analysis = selectAnalysis(analyses, effectiveArgs.recordingId);
  }

  if (
    (effectiveArgs.refreshArtifact || effectiveArgs.requireFreshArtifact) &&
    artifact?.kind === "default-analysis" &&
    artifactNeedsAutomaticRefresh(artifact)
  ) {
    const recordingIdForRefresh = effectiveArgs.recordingId ?? analysisRecordingId(analysis);
    const configuredSource = resolveConfiguredRecordingSource(
      {
        ...effectiveArgs,
        recordingId: recordingIdForRefresh,
      },
      artifact.checkedPaths ?? [],
      analysisPath,
    );
    if (configuredSource) {
      effectiveArgs = {
        ...effectiveArgs,
        recordingId: recordingIdForRefresh,
        sessionPath: configuredSource.sessionPath,
      };
      analysisPath = null;
      sessions = normalizeReplaySessions(readJson(configuredSource.sessionPath, "Replay session fixture JSON"));
      analyses = analyzeMovementDebugReplaySessions(sessions);
      analysis = selectAnalysis(analyses, effectiveArgs.recordingId);
      artifact = configuredSource.artifact;
    }
  }
  assertRefreshArtifactIfRequested(artifact, effectiveArgs.refreshArtifact);
  assertFreshArtifactIfRequired(artifact, effectiveArgs.requireFreshArtifact);
  const renderedTelemetry = effectiveArgs.renderedTelemetryPath
    ? applyRenderedTelemetryToAnalysis(analysis, effectiveArgs.renderedTelemetryPath)
    : null;
  if (renderedTelemetry) {
    analysis = renderedTelemetry.analysis;
    if (artifact) {
      artifact = {
        ...artifact,
        checkedPaths: [...new Set([...(artifact.checkedPaths ?? []), effectiveArgs.renderedTelemetryPath!])],
      };
    }
  }
  const sourceSession = matchingSourceSession(sessions, analysis);
  const sourceHashInput = sourceSession ?? analysis;
  const sourceHash = sourceSession
    ? await sourceHashForReplaySession(sourceSession)
    : stableReplayStudioSourceHash(analysis);
  if (renderedTelemetry?.sourceHash && renderedTelemetry.sourceHash !== sourceHash) {
    missingInput(
      `Rendered telemetry source hash ${renderedTelemetry.sourceHash} does not match diagnosis source ${sourceHash}.`,
      "Use final-VRM telemetry captured from the same immutable Replay source session.",
      effectiveArgs.renderedTelemetryPath ?? undefined,
    );
  }
  const recordingId = analysis.replayStudio.session.recordingId || analysis.sessionId;
  const markdownPath = effectiveArgs.mdOutPath === DEFAULT_PACKET_MARKDOWN_PATH && effectiveArgs.outPath !== DEFAULT_PACKET_PATH
    ? defaultMarkdownPath(effectiveArgs.outPath)
    : effectiveArgs.mdOutPath;
  const packet = buildReplayStudioRepairPacket(analysis, {
    code: {
      commit: gitCommit(),
      motionPipelineFingerprint:
        renderedTelemetry?.motionPipelineFingerprint ?? runtime.motionPipelineFingerprint ?? "unknown",
    },
    ...(artifact ? { artifact } : {}),
    commands: packetCommands({ analysisPath, args: effectiveArgs, markdownPath, recordingId }),
    fixtureId: effectiveArgs.fixtureId ?? undefined,
    frameIndex: effectiveArgs.frameIndex,
    recording: {
      id: recordingId,
      sourceHash,
      sourceHashBasis: sourceSession ? "source-session" : "analysis-report",
      title: sourceSession?.movementId ?? recordingId,
    },
    sourceHashInput,
  });
  const beforePacket = readRepairPacket(effectiveArgs.beforePath);
  if (beforePacket) {
    packet.comparison = compareReplayStudioRepairPackets({
      after: packet,
      before: beforePacket,
    });
  }

  const outPath = resolve(effectiveArgs.outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(packet, null, 2)}\n`);

  let resolvedMarkdownPath: string | null = null;
  if (markdownPath) {
    resolvedMarkdownPath = resolve(markdownPath);
    mkdirSync(dirname(resolvedMarkdownPath), { recursive: true });
    writeFileSync(
      resolvedMarkdownPath,
      formatReplayStudioRepairPacketMarkdown(packet, {
        includeJsonPointer: true,
        jsonPath: effectiveArgs.outPath,
      }),
    );
  }

  if (effectiveArgs.json) {
    console.log(JSON.stringify(packet, null, 2));
  } else {
    printPacketSummary(packet);
    console.log(`Wrote ${outPath}`);
    if (resolvedMarkdownPath) console.log(`Wrote ${resolvedMarkdownPath}`);
  }

  if (effectiveArgs.strict && packet.verdict.status !== "accepted") {
    process.exitCode = 1;
  }
}
