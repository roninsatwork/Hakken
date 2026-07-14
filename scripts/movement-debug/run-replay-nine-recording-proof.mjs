#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ACCEPTANCE_REGISTRY_PATH = "scripts/movement-debug/fixtures/replay-studio/acceptance-recordings.json";
const DEFAULT_OUT_DIR_BY_TIER = {
  "all-nine": "tmp/movement-replay-lab/current-nine-recording-proof",
  "fast-subset": "tmp/movement-replay-lab/current-fast-subset-proof",
  targeted: "tmp/movement-replay-lab/current-targeted-proof",
};
const FAST_SUBSET_TITLES = new Set([
  "Full Spinal Flow",
  "Spins",
  "Full Motion Exercises",
]);
const PROOF_TIER_SET_IDS = {
  "all-nine": "replay-mirror-acceptance-nine-current",
  "fast-subset": "replay-mirror-repair-fast-subset-current",
  targeted: "replay-mirror-repair-targeted-current",
};
const EXPECTED_GAME_RUNTIME_CONTRACT = "movement-game-runtime-v1";

function parseArgs(argv) {
  const args = {
    avatarUrl: "",
    baseUrl: "http://localhost:3000",
    exportPath: "",
    headed: false,
    localTestAuth: false,
    outDir: "",
    proofTier: "",
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
    else if (arg === "--proof-tier") args.proofTier = argv[++index] || "";
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
  console.log(`Render and prove Replay recordings through current code.

Usage:
  npm run movement:replay:nine-proof -- --export <convex-export.zip|dir>
  npm run movement:replay:nine-proof -- --proof-tier fast-subset --export <convex-export.zip|dir>
  npm run movement:replay:nine-proof -- --proof-tier targeted --recording-ids <ids> --export <convex-export.zip|dir>

The command exports immutable Replay sessions, captures intended-time Game
player telemetry, no-skip deterministic Game player telemetry, and deterministic
Game instructor/player proof for every selected recording. It then runs one
strict aggregate gate.

Options:
  --export <path>           Convex export containing the nine recordings and storage payloads.
  --proof-tier <tier>       all-nine, fast-subset, or targeted. Defaults to all-nine unless --recording-ids is supplied.
  --out-dir <path>          Generated proof directory. Defaults to a tier-specific tmp/movement-replay-lab path.
  --base-url <url>          Replay Lab URL origin. Defaults to http://localhost:3000
  --storage-state <path>    Playwright auth storage state.
  --local-test-auth         Sign in through local test auth instead of storage state.
  --secret <secret>         Local-test-auth secret.
  --role <role>             Local-test-auth role. Defaults to super-admin.
  --avatar-url <path>       VRM URL passed to Replay Lab.
  --recording-ids <ids>     Run a named targeted subset; omitted means the tier's configured recording set.
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

function normalizeProofTier({ proofTier, requestedIds }) {
  const tier = proofTier || (requestedIds.length > 0 ? "targeted" : "all-nine");
  if (!Object.hasOwn(PROOF_TIER_SET_IDS, tier)) {
    throw new Error(`Unknown proof tier ${tier}. Use all-nine, fast-subset, or targeted.`);
  }
  if (tier === "targeted" && requestedIds.length === 0) {
    throw new Error("--proof-tier targeted requires --recording-ids <ids>.");
  }
  if (tier === "all-nine" && requestedIds.length > 0) {
    throw new Error("Use --proof-tier targeted with --recording-ids, or omit --recording-ids for final all-nine proof.");
  }
  return tier;
}

function configuredIdsForTier(registry, proofTier) {
  if (proofTier === "all-nine") return [];
  if (proofTier === "targeted") return [];
  return registry.recordings
    .filter((recording) => FAST_SUBSET_TITLES.has(recording.title))
    .map((recording) => recording.id);
}

export function selectProofRecordings({ proofTier, registry, requestedIds = [] }) {
  const tier = normalizeProofTier({ proofTier, requestedIds });
  const tierIds = requestedIds.length > 0 ? requestedIds : configuredIdsForTier(registry, tier);
  const recordings = selectRecordings(registry, tierIds);
  if (tier === "fast-subset" && recordings.length !== FAST_SUBSET_TITLES.size) {
    throw new Error(`Fast subset must resolve ${FAST_SUBSET_TITLES.size} recordings; found ${recordings.length}.`);
  }
  return { proofTier: tier, recordings };
}

export function buildNineRecordingBundleManifest({ outDir, proofTier = "all-nine", recordings }) {
  return {
    recordingSetId: PROOF_TIER_SET_IDS[proofTier] ?? PROOF_TIER_SET_IDS["all-nine"],
    recordings: recordings.map((recording) => ({
      expectedFrameCount: recording.expectedFrameCount,
      id: recording.id,
      proofMode: "player-avatar",
      requireCurrentFingerprint: true,
      requireTimed: true,
      requireThreeParty: true,
      runtimeContract: EXPECTED_GAME_RUNTIME_CONTRACT,
      session: `${outDir}/sessions/${recording.id}.session.json`,
      telemetry: `${outDir}/telemetry/${recording.id}.player-avatar-deterministic.json`,
      threePartyTelemetry: `${outDir}/telemetry/${recording.id}.three-party-deterministic.json`,
      timedTelemetry: `${outDir}/telemetry/${recording.id}.player-avatar-intended-time.json`,
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
      const hasCompleteDeterministicFrames =
        artifact.playbackMode === "deterministic-rendered-frame-step" &&
        uniqueIndexes.size === artifact.frameCount && frameIndexes.length === artifact.frameCount;
      const hasCompleteSourceTimeProcessing =
        artifact.playbackMode === "uninterrupted-source-time-sequence" &&
        artifact.processedFrameCount === artifact.frameCount &&
        artifact.processedMissingFrameCount === 0;
      const isComplete = artifact.playbackCompleted === true &&
        Array.isArray(artifact.missingFrames) && artifact.missingFrames.length === 0 &&
        Number.isInteger(artifact.frameCount) && artifact.frameCount > 0 &&
        (hasCompleteDeterministicFrames || hasCompleteSourceTimeProcessing);
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
  const { proofTier, recordings } = selectProofRecordings({
    proofTier: args.proofTier,
    registry,
    requestedIds: args.recordingIds,
  });
  const outDir = (args.outDir || DEFAULT_OUT_DIR_BY_TIER[proofTier]).replace(/\/$/, "");
  mkdirSync(resolve(`${outDir}/sessions`), { recursive: true });
  mkdirSync(resolve(`${outDir}/telemetry`), { recursive: true });
  console.log(`Replay rendered proof tier: ${proofTier}`);

  for (const [index, recording] of recordings.entries()) {
    const sessionPath = `${outDir}/sessions/${recording.id}.session.json`;
    const playerAvatarPath = `${outDir}/telemetry/${recording.id}.player-avatar-deterministic.json`;
    const timedPlayerAvatarPath = `${outDir}/telemetry/${recording.id}.player-avatar-intended-time.json`;
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
      commandArgs: captureArgs({ args, deterministic: false, outPath: timedPlayerAvatarPath, sessionPath, threeParty: false }),
      outPath: timedPlayerAvatarPath,
    });
    ensureArtifact({
      args,
      commandArgs: captureArgs({ args, deterministic: true, outPath: threePartyPath, sessionPath, threeParty: true }),
      outPath: threePartyPath,
    });
  }

  const manifest = buildNineRecordingBundleManifest({ outDir, proofTier, recordings });
  const manifestPath = `${outDir}/manifest.json`;
  writeFileSync(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  const reportPath = `${outDir}/bundle-report.json`;
  run(process.execPath, [
    "scripts/movement-debug/analyze-replay-full-sequence-bundle.mjs",
    "--manifest", manifestPath,
    "--out", reportPath,
    "--strict",
  ]);
  console.log(`\n${proofTier} rendered proof passed for ${recordings.length} recording(s). Manifest: ${resolve(manifestPath)}`);
  console.log(`Bundle report: ${resolve(reportPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
