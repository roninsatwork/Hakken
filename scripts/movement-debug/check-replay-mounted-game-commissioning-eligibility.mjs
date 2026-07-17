#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const exportSessionScript = path.join(scriptDirectory, "export-replay-session.mjs");

function parseArgs(argv) {
  const args = {
    convertedOutDir: "tmp/movement-replay-lab/commissioning-eligibility-converted",
    exportPath: "",
    failOnIneligible: false,
    manifests: [],
    out: "",
    packets: [],
    recordingIds: [],
    recordingManifests: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--converted-out") args.convertedOutDir = argv[++index] || args.convertedOutDir;
    else if (arg === "--export") args.exportPath = argv[++index] || "";
    else if (arg === "--manifest") args.manifests.push(argv[++index] || "");
    else if (arg === "--recording-id") args.recordingIds.push(argv[++index] || "");
    else if (arg === "--recording-manifest") args.recordingManifests.push(argv[++index] || "");
    else if (arg === "--packet") args.packets.push(argv[++index] || "");
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--fail-on-ineligible") args.failOnIneligible = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Check whether existing Replay session packets can be used as commissioning proof.

Usage:
  npm run movement:replay-game:commissioning-eligibility -- --manifest <nine-manifest.json> --out <summary.json>
  npm run movement:replay-game:commissioning-eligibility -- --recording-manifest <nine-manifest.json> --export <convex-export.zip>
  npm run movement:replay-game:commissioning-eligibility -- --packet <session.json> --packet <session.json>

Options:
  --manifest <file>        Manifest with recordings[].session entries. Can repeat.
  --recording-manifest <file>
                           Manifest with recordings[].id entries. Converts each recording from --export first.
  --recording-id <id>      Saved recording id to convert from --export. Can repeat.
  --export <zip|dir>       Convex export used for --recording-id / --recording-manifest conversion.
  --converted-out <dir>    Directory for converted Replay session packets.
  --packet <file>          Replay session packet to check. Can repeat.
  --out <file>             Write JSON summary.
  --fail-on-ineligible     Exit non-zero if any packet is ineligible.

This is a preflight only. Eligible packets can then be passed to
movement:replay-game:packet-proof or, by recording id, to movement:replay-game:commissioning-proof.
`);
}

function uniqueTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = path.resolve(target.packetPath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function targetsFromManifest(manifestPath) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(resolvedManifestPath, "utf8"));
  const recordings = Array.isArray(manifest?.recordings) ? manifest.recordings : [];
  return recordings
    .filter((recording) => recording && typeof recording.session === "string")
    .map((recording) => ({
      expectedFrameCount: recording.expectedFrameCount,
      manifestPath: resolvedManifestPath,
      packetPath: recording.session,
      recordingId: typeof recording.id === "string" ? recording.id : undefined,
      title: typeof recording.title === "string" ? recording.title : undefined,
    }));
}

async function recordingTargetsFromManifest(manifestPath) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(resolvedManifestPath, "utf8"));
  const recordings = Array.isArray(manifest?.recordings) ? manifest.recordings : [];
  return recordings
    .filter((recording) => recording && typeof recording.id === "string")
    .map((recording) => ({
      expectedFrameCount: recording.expectedFrameCount,
      manifestPath: resolvedManifestPath,
      recordingId: recording.id,
      title: typeof recording.title === "string" ? recording.title : undefined,
    }));
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

async function convertRecordingTargets(args, recordingTargets, deps = {}) {
  if (recordingTargets.length === 0) return [];
  if (!args.exportPath) throw new Error("Pass --export <convex-export.zip|dir> for recording-id eligibility checks.");
  const convertedOutDir = path.resolve(args.convertedOutDir);
  await mkdir(convertedOutDir, { recursive: true });
  const run = deps.runProcess || runProcess;
  const exportPath = path.resolve(args.exportPath);
  const targets = [];
  for (const target of recordingTargets) {
    const sessionPath = path.join(convertedOutDir, `${target.recordingId}.session.json`);
    await run(exportSessionScript, [
      "--export",
      exportPath,
      "--recording-id",
      target.recordingId,
      "--out",
      sessionPath,
    ]);
    targets.push({
      ...target,
      convertedFromExport: exportPath,
      packetPath: sessionPath,
    });
  }
  return targets;
}

async function collectTargets(args, deps = {}) {
  const targets = [];
  for (const manifest of args.manifests.filter(Boolean)) {
    targets.push(...await targetsFromManifest(manifest));
  }
  const recordingTargets = args.recordingIds.filter(Boolean).map((recordingId) => ({ recordingId }));
  for (const manifest of args.recordingManifests.filter(Boolean)) {
    recordingTargets.push(...await recordingTargetsFromManifest(manifest));
  }
  targets.push(...await convertRecordingTargets(args, recordingTargets, deps));
  for (const packet of args.packets.filter(Boolean)) {
    targets.push({ packetPath: packet });
  }
  return uniqueTargets(targets);
}

function countFailures(results) {
  const counts = new Map();
  for (const result of results) {
    for (const failure of result.failures) {
      counts.set(failure, (counts.get(failure) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]));
}

export async function buildReplayMountedGameCommissioningEligibilityReport(targets) {
  const results = [];
  for (const target of targets) {
    const packetPath = path.resolve(target.packetPath);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const failures = validateCompleteReplayGamePacket(packet);
    results.push({
      eligible: failures.length === 0,
      convertedFromExport: target.convertedFromExport,
      expectedFrameCount: target.expectedFrameCount,
      failures,
      packetPath,
      recordingId: target.recordingId || packet.id || packet.recordingId || null,
      sampleCount: packet.sampleCount ?? null,
      title: target.title || packet.title || packet.warningSummary || "Untitled",
    });
  }
  const eligible = results.filter((result) => result.eligible);
  const ineligible = results.filter((result) => !result.eligible);
  return {
    eligibleCount: eligible.length,
    failureCounts: countFailures(results),
    ineligibleCount: ineligible.length,
    passed: ineligible.length === 0 && results.length > 0,
    results,
    targetCount: results.length,
  };
}

function printReport(report) {
  console.log(
    `Commissioning eligibility: ${report.eligibleCount}/${report.targetCount} eligible, ` +
    `${report.ineligibleCount} ineligible.`,
  );
  for (const result of report.results) {
    const status = result.eligible ? "ELIGIBLE" : "INELIGIBLE";
    console.log(`- ${status} ${result.title} (${result.recordingId || "unknown-id"})`);
    if (!result.eligible) {
      console.log(`  ${result.failures.join("; ")}`);
    }
  }
}

export async function runReplayMountedGameCommissioningEligibility(argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const targets = await collectTargets(args, deps);
  if (targets.length === 0) {
    throw new Error("Pass at least one --manifest <file> or --packet <session.json>.");
  }
  const report = await buildReplayMountedGameCommissioningEligibilityReport(targets);
  printReport(report);
  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
  }
  if (args.failOnIneligible && !report.passed) {
    throw new Error(`${report.ineligibleCount} commissioning packet(s) are ineligible.`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runReplayMountedGameCommissioningEligibility(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
