import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseMovementFramePayload } from "../../src/app/(dashboard)/demos/movements/_lib/movementFrameCodec";
import {
  validateMovementCommissioningEnvelope,
  validateMovementDeepCaptureEnvelope,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingCommissioning";
import { buildMovementReplaySessionFromRecording } from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import type { MovementFrameEnvelope } from "../../src/app/(dashboard)/demos/movements/_lib/movementTypes";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";

type RecoveryArgs = {
  out: string | null;
  packet: string | null;
  recordingId: string | null;
  title: string | null;
};

function parseArgs(argv: string[]): RecoveryArgs {
  const args: RecoveryArgs = { out: null, packet: null, recordingId: null, title: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--packet") args.packet = argv[++index] ?? null;
    else if (arg === "--out") args.out = argv[++index] ?? null;
    else if (arg === "--recording-id") args.recordingId = argv[++index] ?? null;
    else if (arg === "--title") args.title = argv[++index] ?? null;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Recover a browser-downloaded movement packet as a Replay/Game harness session.

Usage:
  npm run movement:replay:recover-local-packet -- --packet ~/Downloads/sonae-movement-schema-v3-*.json --out tmp/movement-replay-lab/recovered-session.json

The input is derived tracking JSON only. This command does not upload, move, or delete it.
`);
}

function isEnvelope(value: unknown): value is MovementFrameEnvelope {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Array.isArray((value as { frames?: unknown }).frames);
}

export function recoverLocalMovementPacket({
  outPath,
  packetPath,
  recordingId,
  title,
}: {
  outPath: string;
  packetPath: string;
  recordingId?: string | null;
  title?: string | null;
}) {
  const resolvedPacketPath = resolve(packetPath);
  const rawPacket = readFileSync(resolvedPacketPath, "utf8");
  const envelope = JSON.parse(rawPacket) as unknown;
  if (!isEnvelope(envelope)) {
    throw new Error("Local backup must be a versioned movement frame envelope.");
  }

  const validation = envelope.schemaVersion === 3
    ? validateMovementDeepCaptureEnvelope(envelope)
    : envelope.schemaVersion === 2
      ? validateMovementCommissioningEnvelope(envelope)
      : null;
  if (!validation) {
    throw new Error(`Local recovery requires schema v2 or v3; received schema v${envelope.schemaVersion}.`);
  }
  if (!validation.passed) {
    throw new Error(`Local movement packet is not proof-ready: ${validation.failures.join(" ")}`);
  }

  const parsed = parseMovementFramePayload(
    envelope,
    envelope.schemaVersion === 3 ? "storage-json-v3" : "storage-json-v2",
  );
  const packetHashSuffix = envelope.sourcePacketHash?.replace(/^sha256:/, "").slice(0, 12) ?? "unknown";
  const id = recordingId?.trim() || `local-backup-${packetHashSuffix}`;
  const session = buildMovementReplaySessionFromRecording({
    _id: id,
    captureFps: parsed.fps,
    createdAt: envelope.capturedAt,
    poseData: rawPacket,
    poseDataFormat: parsed.format,
    title: title?.trim() || basename(resolvedPacketPath, ".json"),
  }, parsed.frames, parsed.fps, {
    captureStartReadiness: parsed.captureStartReadiness,
    channelSummary: parsed.channelSummary,
    deepCaptureChannelSummary: parsed.deepCaptureChannelSummary,
    deepCaptureProfile: parsed.deepCaptureProfile,
    inputContract: parsed.inputContract,
    schemaVersion: parsed.schemaVersion,
    setupPrefix: parsed.setupPrefix,
    sourcePacketHash: parsed.sourcePacketHash,
  });
  const preflightFailures = validateCompleteReplayGamePacket(session, {
    requireDeepCapture: envelope.schemaVersion === 3,
  });
  if (preflightFailures.length > 0) {
    throw new Error(
      `Recovered packet failed Replay/Game preflight: ${preflightFailures.join("; ")}`,
    );
  }

  const resolvedOutPath = resolve(outPath);
  mkdirSync(dirname(resolvedOutPath), { recursive: true });
  writeFileSync(resolvedOutPath, `${JSON.stringify(session)}\n`);
  return {
    outPath: resolvedOutPath,
    packetPath: resolvedPacketPath,
    preflightFailures,
    session,
  };
}

export function runRecoverLocalMovementPacketCli(argv: string[]) {
  const args = parseArgs(argv);
  if (!args.packet) throw new Error("Pass --packet <downloaded-packet.json>.");
  if (!args.out) throw new Error("Pass --out <replay-session.json>.");

  const result = recoverLocalMovementPacket({
    outPath: args.out,
    packetPath: args.packet,
    recordingId: args.recordingId,
    title: args.title,
  });
  console.log(
    `Recovered ${result.session.id}: schema v${result.session.schemaVersion}, ${result.session.sampleCount} frame(s).`,
  );
  console.log(`Source backup preserved at ${result.packetPath}`);
  console.log("Shared Replay/Game packet preflight passed with zero failures.");
  console.log(`Wrote Replay/Game session ${result.outPath}`);
}
