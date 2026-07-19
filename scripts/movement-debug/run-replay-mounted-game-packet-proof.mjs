#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReplayMountedGameChecksums } from "./compare-replay-mounted-game-checksums.mjs";
import { validateDeepCaptureReplayPacket } from "./validate-deep-capture-replay-packet.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const replayCaptureScript = path.join(scriptDirectory, "capture-replay-full-sequence.mjs");
const gameCaptureScript = path.join(scriptDirectory, "capture-mounted-game-packet.mjs");
export const REQUIRED_CHANNELS = ["blendshapes", "camera", "face", "hands", "pose", "worldPose"];

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isFiniteRotation = (value) => value && [value.x, value.y, value.z].every(isFiniteNumber);

export function validateDeepCaptureRenderedAvatar(game) {
  const failures = [];
  const frames = game?.final?.renderedFrames ?? [];
  if (frames.length === 0) return ["mounted Game has no rendered Deep Capture avatar frames"];

  frames.forEach((frame) => {
    const frameIndex = frame?.frameIndex ?? "unknown";
    const hands = frame?.playerApplied?.avatarHands;
    for (const side of ["left", "right"]) {
      const hand = hands?.[side];
      if (
        !isFiniteNumber(hand?.curlMagnitude) ||
        !isFiniteRotation(hand?.thumbProximal) ||
        !isFiniteRotation(hand?.indexProximal) ||
        !isFiniteRotation(hand?.middleProximal)
      ) {
        failures.push(`frame ${frameIndex} has non-finite final-avatar ${side} finger telemetry`);
      }
    }
    const expressions = frame?.playerApplied?.avatarExpressions;
    if (!["aa", "blinkLeft", "blinkRight", "happy"].every((key) => isFiniteNumber(expressions?.[key]))) {
      failures.push(`frame ${frameIndex} has non-finite final-avatar face telemetry`);
    }
  });
  return failures;
}

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    deepCapture: false,
    headed: false,
    localTestAuth: false,
    outDir: "tmp/movement-replay-lab/replay-mounted-game-packet-proof",
    packet: "",
    role: "super-admin",
    routeMovementId: "",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deep-capture") args.deepCapture = true;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--packet") args.packet = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--route-movement-id") args.routeMovementId = argv[++index] || "";
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Run one current complete packet through fresh Replay and the normal mounted Game lifecycle.

Usage:
  npm run movement:replay-game:packet-proof -- --packet <session.json> --out <directory>

Options:
  --base-url <url>          App URL. Defaults to http://localhost:3000
  --local-test-auth         Authenticate through /local-test-auth
  --secret <secret>         Local auth secret
  --storage-state <file>    Playwright storage state
  --role <role>             Local auth role. Defaults to super-admin
  --route-movement-id <id>  Existing movement used only to mount the injected packet's Game route
  --headed                  Show both proof browsers
  --deep-capture            Require schema-v3 Deep Capture evidence before either browser starts

Legacy packets and packets without the selected schema, channel, setup, readiness, and hash identity are rejected before browser capture.
`);
}

export function validateCompleteReplayGamePacket(packet, options = {}) {
  const failures = [];
  const expectedSchemaVersion = options.requireDeepCapture ? 3 : 2;
  if (packet?.schemaVersion !== expectedSchemaVersion) {
    failures.push(`recording schemaVersion must be ${expectedSchemaVersion}`);
  }
  if (packet?.inputContract?.id !== "movement-player-input-v1") {
    failures.push("input contract must be movement-player-input-v1");
  }
  if (packet?.inputContract?.setup?.id !== "movement-player-setup-v1") {
    failures.push("setup policy must be movement-player-setup-v1");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(packet?.sourcePacketHash ?? "")) {
    failures.push("sourcePacketHash must be a complete SHA-256 identity");
  }
  if (packet?.setupPrefix?.complete !== true) failures.push("setup prefix must be complete");
  const samples = Array.isArray(packet?.samples) ? packet.samples : [];
  if (samples.length === 0 || samples.length !== packet?.sampleCount) {
    failures.push("sampleCount must exactly match a non-empty samples array");
  }
  if (samples.some((sample) => !sample?.startReadiness)) {
    failures.push("every sample must preserve its readiness decision");
  }
  for (const channel of REQUIRED_CHANNELS) {
    const summary = packet?.channelSummary?.[channel];
    if (!summary || !Number.isInteger(summary.presentFrames) || summary.presentFrames <= 0) {
      failures.push(`${channel} channel evidence is missing`);
    }
    if (summary && summary.totalFrames !== samples.length) {
      failures.push(`${channel} channel total does not match sampleCount`);
    }
  }
  if (options.requireDeepCapture) failures.push(...validateDeepCaptureReplayPacket(packet));
  return failures;
}

function runProcess(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `${path.basename(script)} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
      ));
    });
  });
}

function commonCaptureArgs(args) {
  const values = ["--base-url", args.baseUrl];
  if (args.localTestAuth) values.push("--local-test-auth");
  if (args.secret) values.push("--secret", args.secret);
  if (args.storageState) values.push("--storage-state", args.storageState);
  if (args.role) values.push("--role", args.role);
  if (args.headed) values.push("--headed");
  return values;
}

export async function runReplayMountedGamePacketProof(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.packet) throw new Error("Pass --packet <session.json>.");
  const packetPath = path.resolve(args.packet);
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  const packetFailures = validateCompleteReplayGamePacket(packet, {
    requireDeepCapture: args.deepCapture,
  });
  if (packetFailures.length > 0) {
    throw new Error(`Complete packet preflight failed: ${packetFailures.join("; ")}`);
  }

  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const replayPath = path.join(outDir, "replay-three-party.json");
  const gamePath = path.join(outDir, "mounted-game.json");
  const gameCanvasScreenshotPath = path.join(outDir, "mounted-game-canvas-visible.png");
  const gameScreenshotPath = path.join(outDir, "mounted-game-visible.png");
  const comparisonPath = path.join(outDir, "comparison.json");
  const summaryPath = path.join(outDir, "summary.json");
  const commonArgs = commonCaptureArgs(args);
  const gameRouteArgs = args.routeMovementId
    ? ["--route-movement-id", args.routeMovementId]
    : [];

  await runProcess(replayCaptureScript, [
    ...commonArgs,
    "--debug-session-json", packetPath,
    "--out", replayPath,
    "--deterministic",
    "--three-party",
  ]);
  await runProcess(gameCaptureScript, [
    ...commonArgs,
    ...gameRouteArgs,
    "--canvas-screenshot", gameCanvasScreenshotPath,
    "--debug-session-json", packetPath,
    "--out", gamePath,
    "--screenshot", gameScreenshotPath,
    "--skip-pause",
  ]);

  const replay = JSON.parse(await readFile(replayPath, "utf8"));
  const game = JSON.parse(await readFile(gamePath, "utf8"));
  const comparison = compareReplayMountedGameChecksums({ game, replay });
  const renderedAvatarFailures = args.deepCapture
    ? validateDeepCaptureRenderedAvatar(game)
    : [];
  await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
  const summary = {
    comparedFrameCount: comparison.comparedFrameCount,
    comparedBoundaryCount: comparison.comparedBoundaryCount,
    comparisonPath,
    exactChecksumDivergenceCount: comparison.exactChecksumDivergenceCount,
    failures: [...comparison.failures, ...renderedAvatarFailures],
    gameCanvasScreenshotPath,
    gamePath,
    gameScreenshotPath,
    identityStatus: comparison.identityStatus,
    packetId: packet.id,
    packetPath,
    passed: game.passed === true && comparison.passed === true && renderedAvatarFailures.length === 0,
    proofProfile: args.deepCapture ? "deep-capture-v1" : "commissioning-v2",
    replayPath,
    schemaVersion: packet.schemaVersion,
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) {
    throw new Error(`Replay/mounted Game packet proof failed: ${summary.failures.join("; ")}`);
  }
  console.log(
    `Replay/mounted Game packet proof passed (${summary.comparedFrameCount} active frame(s), ` +
    `${summary.comparedBoundaryCount} exact boundaries).`,
  );
  console.log(`Wrote ${summaryPath}`);
  return summary;
}

if (
  process.argv[1] &&
  path.basename(process.argv[1]) === "run-replay-mounted-game-packet-proof.mjs" &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  runReplayMountedGamePacketProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
