#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReplayMountedGameChecksums } from "./compare-replay-mounted-game-checksums.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const replayCaptureScript = path.join(scriptDirectory, "capture-replay-full-sequence.mjs");

function parseArgs(argv) {
  const args = {
    allowLegacy: false,
    baseUrl: "http://localhost:3000",
    gameSummary: "tmp/movement-replay-lab/mounted-game-nine-proof/summary.json",
    localTestAuth: false,
    manifest: "tmp/movement-replay-lab/current-nine-recording-proof-final-v3-2026-07-14/manifest.json",
    outDir: "tmp/movement-replay-lab/replay-mounted-game-nine-comparison",
    replayDirs: [],
    recordingId: "",
    resumePassed: false,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-legacy") args.allowLegacy = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--resume-passed") args.resumePassed = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--game-summary") args.gameSummary = argv[++index] || args.gameSummary;
    else if (arg === "--manifest") args.manifest = argv[++index] || args.manifest;
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--recording-id") args.recordingId = argv[++index] || "";
    else if (arg === "--replay-dir") args.replayDirs.push(argv[++index] || "");
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Compare every runnable recording in the nine-recording set through Replay and mounted Game.

Usage:
  npm run movement:replay-game:nine-compare -- --game-summary <summary.json> --out <directory>

Options:
  --base-url <url>          App URL
  --manifest <file>         Controlling nine-recording manifest
  --game-summary <file>     Completed mounted Game nine-proof summary
  --allow-legacy            Diagnose historical sessions without accepting source identity
  --local-test-auth         Authenticate through /local-test-auth
  --secret <secret>         Local auth secret
  --storage-state <file>    Playwright storage state
  --recording-id <id>       Compare one selected recording
  --replay-dir <directory>  Reuse existing <id>.replay-three-party.json captures; repeatable
  --resume-passed           Reuse an existing passing comparison
`);
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function findReusableReplayPath(replayDirs, recordingId) {
  for (const replayDir of replayDirs) {
    const candidate = path.resolve(replayDir, `${recordingId}.replay-three-party.json`);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Replay capture exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

function replayCaptureArgs(args, recording, replayPath) {
  const values = [
    replayCaptureScript,
    "--base-url", args.baseUrl,
    "--debug-session-json", recording.session,
    "--out", replayPath,
    "--deterministic",
    "--three-party",
  ];
  if (args.localTestAuth) values.push("--local-test-auth");
  if (args.secret) values.push("--secret", args.secret);
  if (args.role) values.push("--role", args.role);
  if (args.storageState) values.push("--storage-state", args.storageState);
  return values;
}

export function buildReplayGameNineComparisonSummary({ gameSummaryPath, manifestPath, recordingSetId, rows }) {
  const runnableRows = rows.filter((row) => row.gamePassed);
  const blockedRows = rows.filter((row) => !row.gamePassed);
  return {
    blockedRecordingCount: blockedRows.length,
    comparedFrameCount: runnableRows.reduce((sum, row) => sum + row.comparedFrameCount, 0),
    exactChecksumDivergenceCount: runnableRows.reduce(
      (sum, row) => sum + row.exactChecksumDivergenceCount,
      0,
    ),
    gameSummaryPath,
    generatedAt: new Date().toISOString(),
    manifestPath,
    passed: rows.length > 0 && rows.every((row) => row.passed),
    recordingCount: rows.length,
    recordingSetId,
    rows,
    runnablePassed: runnableRows.length > 0 && runnableRows.every((row) => row.passed),
    runnableRecordingCount: runnableRows.length,
    toleranceDivergenceCount: runnableRows.reduce((sum, row) => sum + row.divergenceCount, 0),
  };
}

export async function runReplayMountedGameNineComparison(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const manifestPath = path.resolve(args.manifest);
  const gameSummaryPath = path.resolve(args.gameSummary);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const gameSummary = JSON.parse(await readFile(gameSummaryPath, "utf8"));
  const gameRows = new Map(gameSummary.rows.map((row) => [row.id, row]));
  let recordings = Array.isArray(manifest.recordings) ? manifest.recordings : [];
  if (args.recordingId) recordings = recordings.filter((recording) => recording.id === args.recordingId);
  if (recordings.length === 0) throw new Error("The manifest did not select any recordings.");

  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const rows = [];
  for (let index = 0; index < recordings.length; index += 1) {
    const recording = recordings[index];
    const gameRow = gameRows.get(recording.id);
    if (!gameRow) throw new Error(`Mounted Game summary is missing ${recording.title} (${recording.id}).`);
    const replayCapturePath = path.join(outDir, `${recording.id}.replay-three-party.json`);
    const replayPath = await findReusableReplayPath(args.replayDirs, recording.id)
      ?? replayCapturePath;
    const comparisonPath = path.join(outDir, `${recording.id}.comparison.json`);
    console.log(`[${index + 1}/${recordings.length}] ${recording.title}`);

    if (!gameRow.passed) {
      rows.push({
        comparedFrameCount: 0,
        comparisonPath: null,
        divergenceCount: 0,
        error: gameRow.error || "Mounted Game did not complete.",
        exactChecksumDivergenceCount: 0,
        gamePassed: false,
        id: recording.id,
        identityStatus: "not-compared",
        passed: false,
        replayPath: null,
        title: recording.title,
      });
      console.log(`[${index + 1}/${recordings.length}] BLOCKED BY GAME SETUP`);
      continue;
    }

    let comparison = null;
    if (args.resumePassed && await fileExists(comparisonPath)) {
      const existing = JSON.parse(await readFile(comparisonPath, "utf8"));
      if (existing.passed === true) {
        comparison = existing;
        console.log(`[${index + 1}/${recordings.length}] REUSED PASS`);
      }
    }
    let error = "";
    if (!comparison) {
      try {
        if (replayPath === replayCapturePath) {
          await runProcess(process.execPath, replayCaptureArgs(args, recording, replayPath));
        } else {
          console.log(`[${index + 1}/${recordings.length}] REUSED REPLAY CAPTURE`);
        }
        const replay = JSON.parse(await readFile(replayPath, "utf8"));
        const game = JSON.parse(await readFile(path.resolve(gameRow.reportPath), "utf8"));
        comparison = compareReplayMountedGameChecksums({
          allowLegacy: args.allowLegacy,
          game,
          replay,
        });
        await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
      }
    }
    rows.push({
      comparedFrameCount: comparison?.comparedFrameCount ?? 0,
      comparisonPath: comparison ? path.relative(process.cwd(), comparisonPath) : null,
      divergenceCount: comparison?.divergenceCount ?? 0,
      error: error || comparison?.failures?.join("; ") || null,
      exactChecksumDivergenceCount: comparison?.exactChecksumDivergenceCount ?? 0,
      gamePassed: true,
      id: recording.id,
      identityStatus: comparison?.identityStatus ?? "not-compared",
      passed: comparison?.passed === true && !error,
      replayPath: await fileExists(replayPath) ? path.relative(process.cwd(), replayPath) : null,
      title: recording.title,
    });
    console.log(`[${index + 1}/${recordings.length}] ${rows.at(-1).passed ? "PASS" : "FAIL"}`);
    await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify({ rows }, null, 2)}\n`);
  }

  const summary = buildReplayGameNineComparisonSummary({
    gameSummaryPath: path.relative(process.cwd(), gameSummaryPath),
    manifestPath: path.relative(process.cwd(), manifestPath),
    recordingSetId: gameSummary.recordingSetId,
    rows,
  });
  const summaryPath = path.join(outDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `Replay/mounted Game nine comparison: ${rows.filter((row) => row.passed).length}/${rows.length} ` +
    `recordings passed; ${summary.blockedRecordingCount} setup-blocked.`,
  );
  console.log(`Wrote ${summaryPath}`);
  if (!summary.passed) process.exitCode = 1;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReplayMountedGameNineComparison(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
