import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildMovementReplaySessionFromRecording,
  type MovementReplayRecordingSource,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import {
  isInlinePoseData,
  parseMovementFramePayload,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementFrameCodec";
import type { MovementDataFormat } from "../../src/app/(dashboard)/demos/movements/_lib/movementTypes";

type CliArgs = {
  exportPath: string | null;
  out: string | null;
  recordingId: string | null;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    exportPath: null,
    out: null,
    recordingId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--export") {
      args.exportPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--recording-id") {
      args.recordingId = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Export one Convex movement recording as a Replay Lab session fixture.

Usage:
  npm run movement:replay:export-session -- --export tmp/movement-replay-lab/runs/latest.zip --recording-id <id> --out tmp/movement-replay-lab/replay-session.json
`);
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
  return value === "legacy-inline-json" || value === "legacy-storage-json" || value === "storage-json-v1" || value === "storage-json-v2"
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

function recordingFromRow(row: unknown): MovementReplayRecordingSource | null {
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

export async function runMovementReplaySessionExportCli(argv: string[]) {
  const args = parseArgs(argv);
  if (!args.exportPath) throw new Error("Pass --export <convex-export.zip|dir>.");
  if (!args.recordingId) throw new Error("Pass --recording-id <movement id>.");
  if (!args.out) throw new Error("Pass --out <replay-session.json>.");

  const row = readMovementRows(args.exportPath)
    .find((candidate) => isRecord(candidate) && candidate._id === args.recordingId);
  if (!row) {
    throw new Error(`Recording ${args.recordingId} was not found in ${resolve(args.exportPath)}.`);
  }

  const recording = recordingFromRow(row);
  if (!recording) {
    throw new Error(`Recording ${args.recordingId} does not include pose data.`);
  }

  const storedInFile = !isInlinePoseData(recording.poseData);
  const payload = storedInFile
    ? readStoragePayload(args.exportPath, recording.poseData)
    : recording.poseData;
  const sourceFormat = recording.poseDataFormat ?? (storedInFile ? "legacy-storage-json" : "legacy-inline-json");
  const parsed = parseMovementFramePayload(payload, sourceFormat);
  const session = buildMovementReplaySessionFromRecording(
    recording,
    parsed.frames,
    recording.captureFps ?? parsed.fps,
    {
      captureStartReadiness: parsed.captureStartReadiness,
      channelSummary: parsed.channelSummary,
      inputContract: parsed.inputContract,
      setupPrefix: parsed.setupPrefix,
      sourcePacketHash: parsed.sourcePacketHash,
    },
  );

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(session)}\n`);

  console.log(`Exported Replay Lab session ${session.id} (${session.sampleCount} frame(s)).`);
  console.log(`Wrote ${outPath}`);
}
