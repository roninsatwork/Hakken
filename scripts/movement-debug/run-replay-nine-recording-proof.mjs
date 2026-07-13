#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ACCEPTANCE_REGISTRY_PATH = "scripts/movement-debug/fixtures/replay-studio/acceptance-recordings.json";
const DEFAULT_OUT_DIR = "tmp/movement-replay-lab/current-nine-recording-proof";

function parseArgs(argv) {
  const args = {
    avatarUrl: "",
    baseUrl: "http://localhost:3000",
    exportPath: "",
    headed: false,
    localTestAuth: false,
    outDir: DEFAULT_OUT_DIR,
    recordingIds: [],
    resume: false,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--export") args.exportPath = argv[++index] || "";
    else if (arg === "--out-dir") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--avatar-url") args.avatarUrl = argv[++index] || "";
    else if (arg === "--recording-ids") args.recordingIds.push(...parseIds(argv[++index] || ""));
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--resume") args.resume = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

function parseIds(value) {
  return value.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
}

function printHelp() {
  console.log(`Render and prove the canonical nine Replay recordings through current code.

Usage:
  npm run movement:replay:nine-proof -- --export <convex-export.zip|dir>

The command exports immutable Replay sessions, captures no-skip deterministic
player-avatar telemetry plus deterministic instructor/player-avatar proof for
every selected recording, writes a strict bundle manifest, and runs the
aggregate gate.

Options:
  --export <path>           Convex export containing the nine recordings and storage payloads.
  --out-dir <path>          Generated proof directory. Defaults to ${DEFAULT_OUT_DIR}
  --base-url <url>          Replay Lab URL origin. Defaults to http://localhost:3000
  --storage-state <path>    Playwright auth storage state.
  --local-test-auth         Sign in through local test auth instead of storage state.
  --secret <secret>         Local-test-auth secret.
  --role <role>             Local-test-auth role. Defaults to super-admin.
  --avatar-url <path>       VRM URL passed to Replay Lab.
  --recording-ids <ids>     Run a named subset for diagnosis; omitted means the canonical nine.
  --resume                  Reuse already-written sessions and captures. The final gate still rejects stale fingerprints.
  --headed                  Show browser capture.
`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), "utf8"));
}

function readAcceptanceRegistry() {
  const registry = readJson(ACCEPTANCE_REGISTRY_PATH);
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.recordings)) {
    throw new Error(`${ACCEPTANCE_REGISTRY_PATH} must be a schemaVersion 1 acceptance registry.`);
  }
  const ids = new Set();
  for (const recording of registry.recordings) {
    if (!recording || typeof recording.id !== "string" || !Number.isInteger(recording.expectedFrameCount)) {
      throw new Error(`Every acceptance registry row must declare id and integer expectedFrameCount.`);
    }
    if (ids.has(recording.id)) throw new Error(`Acceptance registry repeats ${recording.id}.`);
    ids.add(recording.id);
  }
  if (registry.recordings.length !== 9) {
    throw new Error(`Acceptance registry must contain exactly nine recordings; found ${registry.recordings.length}.`);
  }
  return registry;
}

function selectRecordings(registry, requestedIds) {
  if (requestedIds.length === 0) return registry.recordings;
  const requested = new Set(requestedIds);
  const records = registry.recordings.filter((recording) => requested.has(recording.id));
  const unknown = [...requested].filter((id) => !records.some((recording) => recording.id === id));
  if (unknown.length > 0) throw new Error(`Unknown canonical acceptance recording ids: ${unknown.join(", ")}.`);
  return records;
}

export function buildNineRecordingBundleManifest({ outDir, recordings }) {
  return {
    recordingSetId: "replay-mirror-acceptance-nine-current",
    recordings: recordings.map((recording) => ({
      expectedFrameCount: recording.expectedFrameCount,
      id: recording.id,
      proofMode: "player-avatar",
      requireCurrentFingerprint: true,
      requireThreeParty: true,
      session: `${outDir}/sessions/${recording.id}.session.json`,
      telemetry: `${outDir}/telemetry/${recording.id}.player-avatar-deterministic.json`,
      threePartyTelemetry: `${outDir}/telemetry/${recording.id}.three-party-deterministic.json`,
      title: recording.title,
    })),
    requiredRecordingIds: recordings.map((recording) => recording.id),
    schemaVersion: 1,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status ?? "without a status"}.`);
  }
}

function captureArgs({ args, deterministic, outPath, sessionPath, threeParty }) {
  const commandArgs = [
    "scripts/movement-debug/capture-replay-full-sequence.mjs",
    "--debug-session-json", sessionPath,
    "--out", outPath,
    "--base-url", args.baseUrl,
  ];
  if (deterministic) commandArgs.push("--deterministic");
  if (threeParty) commandArgs.push("--three-party");
  if (args.storageState) commandArgs.push("--storage-state", args.storageState);
  if (args.localTestAuth) commandArgs.push("--local-test-auth", "--secret", args.secret, "--role", args.role);
  if (args.avatarUrl) commandArgs.push("--avatar-url", args.avatarUrl);
  if (args.headed) commandArgs.push("--headed");
  return commandArgs;
}

function ensureArtifact({ args, commandArgs, outPath }) {
  if (args.resume && existsSync(resolve(outPath))) {
    try {
      const artifact = readJson(outPath);
      const frameIndexes = Array.isArray(artifact.frames)
        ? artifact.frames.map((frame) => frame?.frameIndex)
        : [];
      const uniqueIndexes = new Set(frameIndexes);
      const isComplete = artifact.playbackCompleted === true &&
        Array.isArray(artifact.missingFrames) && artifact.missingFrames.length === 0 &&
        Number.isInteger(artifact.frameCount) && artifact.frameCount > 0 &&
        uniqueIndexes.size === artifact.frameCount && frameIndexes.length === artifact.frameCount;
      if (isComplete) {
        console.log(`Reusing complete ${outPath}`);
        return;
      }
      console.log(`Discarding incomplete capture ${outPath}; recapturing every frame.`);
    } catch {
      console.log(`Discarding unreadable capture ${outPath}; recapturing every frame.`);
    }
  }
  run(process.execPath, commandArgs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.exportPath) throw new Error("Pass --export <convex-export.zip|dir>.");
  if (!existsSync(resolve(args.exportPath))) throw new Error(`Export does not exist: ${args.exportPath}`);
  if (args.localTestAuth && !args.secret) throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");

  const registry = readAcceptanceRegistry();
  const recordings = selectRecordings(registry, args.recordingIds);
  const outDir = args.outDir.replace(/\/$/, "");
  mkdirSync(resolve(`${outDir}/sessions`), { recursive: true });
  mkdirSync(resolve(`${outDir}/telemetry`), { recursive: true });

  for (const [index, recording] of recordings.entries()) {
    const sessionPath = `${outDir}/sessions/${recording.id}.session.json`;
    const playerAvatarPath = `${outDir}/telemetry/${recording.id}.player-avatar-deterministic.json`;
    const threePartyPath = `${outDir}/telemetry/${recording.id}.three-party-deterministic.json`;
    console.log(`\n[${index + 1}/${recordings.length}] ${recording.title} (${recording.id})`);

    if (args.resume && existsSync(resolve(sessionPath))) {
      console.log(`Reusing ${sessionPath}`);
    } else {
      run(process.execPath, [
        "scripts/movement-debug/export-replay-session.mjs",
        "--export", args.exportPath,
        "--recording-id", recording.id,
        "--out", sessionPath,
      ]);
    }
    ensureArtifact({
      args,
      commandArgs: captureArgs({ args, deterministic: true, outPath: playerAvatarPath, sessionPath, threeParty: false }),
      outPath: playerAvatarPath,
    });
    ensureArtifact({
      args,
      commandArgs: captureArgs({ args, deterministic: true, outPath: threePartyPath, sessionPath, threeParty: true }),
      outPath: threePartyPath,
    });
  }

  const manifest = buildNineRecordingBundleManifest({ outDir, recordings });
  const manifestPath = `${outDir}/manifest.json`;
  writeFileSync(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  const reportPath = `${outDir}/bundle-report.json`;
  run(process.execPath, [
    "scripts/movement-debug/analyze-replay-full-sequence-bundle.mjs",
    "--manifest", manifestPath,
    "--out", reportPath,
    "--strict",
  ]);
  console.log(`\nNine-recording rendered proof passed. Manifest: ${resolve(manifestPath)}`);
  console.log(`Bundle report: ${resolve(reportPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
