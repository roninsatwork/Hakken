#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const exportSessionScript = path.join(scriptDirectory, "export-replay-session.mjs");

function parseArgs(argv) {
  const args = {
    convertedOutDir: "tmp/movement-replay-lab/commissioning-eligibility-converted",
    allRecordings: false,
    deepCapture: false,
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
    if (arg === "--all-recordings") args.allRecordings = true;
    else if (arg === "--deep-capture") args.deepCapture = true;
    else if (arg === "--converted-out") args.convertedOutDir = argv[++index] || args.convertedOutDir;
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
  npm run movement:replay-game:deep-recording-inventory -- --export <convex-export.zip> --out <summary.json>
  npm run movement:replay-game:commissioning-eligibility -- --packet <session.json> --packet <session.json>

Options:
  --manifest <file>        Manifest with recordings[].session entries. Can repeat.
  --recording-manifest <file>
                           Manifest with recordings[].id entries. Converts each recording from --export first.
  --recording-id <id>      Saved recording id to convert from --export. Can repeat.
  --all-recordings         Discover and convert every saved movement in --export.
  --export <zip|dir>       Convex export used for saved-recording conversion.
  --converted-out <dir>    Directory for converted Replay session packets.
  --packet <file>          Replay session packet to check. Can repeat.
  --out <file>             Write JSON summary.
  --fail-on-ineligible     Exit non-zero if any packet is ineligible.
  --deep-capture            Require complete schema-v3 Deep Capture evidence.

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

async function readMovementRowsFromExport(exportPath) {
  const resolvedExportPath = path.resolve(exportPath);
  const exportStats = await stat(resolvedExportPath);
  const contents = exportStats.isDirectory()
    ? await readFile(path.join(resolvedExportPath, "movements/documents.jsonl"), "utf8")
    : execFileSync("unzip", ["-p", resolvedExportPath, "movements/documents.jsonl"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function recordingTargetsFromExport(exportPath) {
  if (!exportPath) throw new Error("Pass --export <convex-export.zip|dir> with --all-recordings.");
  const rows = await readMovementRowsFromExport(exportPath);
  return rows
    .filter((row) => row && typeof row._id === "string" && typeof row.poseData === "string")
    .map((row) => ({
      expectedFrameCount: Number.isFinite(row.frameCount) ? row.frameCount : undefined,
      recordingId: row._id,
      title: typeof row.title === "string" ? row.title : undefined,
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
  if (args.allRecordings) {
    recordingTargets.push(...await recordingTargetsFromExport(args.exportPath));
  }
  for (const manifest of args.recordingManifests.filter(Boolean)) {
    recordingTargets.push(...await recordingTargetsFromManifest(manifest));
  }
  targets.push(...await convertRecordingTargets(args, recordingTargets, deps));
  for (const packet of args.packets.filter(Boolean)) {
    targets.push({ packetPath: packet });
  }
  return uniqueTargets(targets);
}

function failureGroupKey(failure) {
  const frameMatch = /^Frame (\d+) (.+)$/.exec(failure);
  if (!frameMatch) return { frame: null, key: `packet:${failure}`, message: failure, scope: "packet" };
  const frame = Number(frameMatch[1]);
  const message = frameMatch[2]
    .replace(/\banchor (?:\d+|[^\s.]+)(?= has| contains)/g, "anchor {id}");
  return { frame, key: `frame:${message}`, message, scope: "frame" };
}

export function compactEligibilityFailures(failures) {
  const groups = new Map();
  for (const failure of failures) {
    const normalized = failureGroupKey(failure);
    const existing = groups.get(normalized.key) || {
      affectedFrames: new Set(),
      message: normalized.message,
      occurrenceCount: 0,
      scope: normalized.scope,
    };
    existing.occurrenceCount += 1;
    if (normalized.frame !== null) existing.affectedFrames.add(normalized.frame);
    groups.set(normalized.key, existing);
  }

  return [...groups.values()].map((group) => {
    const frames = [...group.affectedFrames].sort((left, right) => left - right);
    const affectedFrameCount = frames.length;
    const firstFrame = affectedFrameCount > 0 ? frames[0] : null;
    const lastFrame = affectedFrameCount > 0 ? frames[affectedFrameCount - 1] : null;
    const summary = group.scope === "frame"
      ? `${group.message} (${group.occurrenceCount} occurrence(s) across ${affectedFrameCount} frame(s), frames ${firstFrame}-${lastFrame})`
      : group.occurrenceCount === 1
        ? group.message
        : `${group.message} (${group.occurrenceCount} occurrences)`;
    return {
      affectedFrameCount,
      firstFrame,
      lastFrame,
      message: group.message,
      occurrenceCount: group.occurrenceCount,
      scope: group.scope,
      summary,
    };
  });
}

function countFailures(results) {
  const counts = new Map();
  for (const result of results) {
    for (const group of result.failureGroups) {
      const label = group.scope === "frame" ? `Per-frame: ${group.message}` : group.message;
      counts.set(label, (counts.get(label) || 0) + group.occurrenceCount);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]));
}

export async function buildReplayMountedGameCommissioningEligibilityReport(targets, options = {}) {
  const results = [];
  for (const target of targets) {
    const packetPath = path.resolve(target.packetPath);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    const rawFailures = validateCompleteReplayGamePacket(packet, {
      requireDeepCapture: options.requireDeepCapture,
    });
    const failureGroups = compactEligibilityFailures(rawFailures);
    results.push({
      createdAt: Number.isFinite(packet.createdAt) ? packet.createdAt : null,
      eligible: rawFailures.length === 0,
      convertedFromExport: target.convertedFromExport,
      expectedFrameCount: target.expectedFrameCount,
      failureGroups,
      failures: failureGroups.map((group) => group.summary),
      packetPath,
      rawFailureCount: rawFailures.length,
      recordingId: target.recordingId || packet.id || packet.recordingId || null,
      sampleCount: packet.sampleCount ?? null,
      schemaVersion: packet.schemaVersion ?? null,
      title: packet.title || packet.warningSummary || target.title || "Untitled",
    });
  }
  const eligible = results.filter((result) => result.eligible);
  const ineligible = results.filter((result) => !result.eligible);
  return {
    eligibleCount: eligible.length,
    failureCounts: countFailures(results),
    ineligibleCount: ineligible.length,
    passed: ineligible.length === 0 && results.length > 0,
    proofProfile: options.requireDeepCapture ? "deep-capture-v1" : "commissioning-v2",
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
      const visibleFailures = result.failures.slice(0, 8);
      console.log(`  ${visibleFailures.join("; ")}`);
      if (result.failures.length > visibleFailures.length) {
        console.log(
          `  ... ${result.failures.length - visibleFailures.length} more grouped reason(s); ` +
          `${result.rawFailureCount} raw failure occurrence(s) total.`,
        );
      }
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
    throw new Error(
      "Pass --all-recordings, at least one --recording-id/--recording-manifest, " +
      "or at least one --manifest/--packet.",
    );
  }
  const report = {
    ...await buildReplayMountedGameCommissioningEligibilityReport(targets, {
      requireDeepCapture: args.deepCapture,
    }),
    selectionMode: args.allRecordings ? "all-recordings" : "explicit-targets",
    sourceExport: args.exportPath ? path.resolve(args.exportPath) : null,
  };
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
