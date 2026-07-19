#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const captureScript = path.join(scriptDirectory, "capture-mounted-game-packet.mjs");

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    chunkSize: 300,
    localTestAuth: false,
    outDir: "tmp/movement-replay-lab/mounted-game-chunked-proof",
    overlap: 60,
    packet: "",
    resume: false,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--resume") args.resume = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--chunk-size") args.chunkSize = parsePositiveInteger(argv[++index], "--chunk-size");
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--overlap") args.overlap = parsePositiveInteger(argv[++index], "--overlap");
    else if (arg === "--packet") args.packet = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (args.overlap >= args.chunkSize) throw new Error("--overlap must be smaller than --chunk-size.");
  return args;
}

function printHelp() {
  console.log(`Run a complete movement packet through mounted Game in overlapping browser windows.

Usage:
  npm run movement:game:chunked-packet-proof -- --packet <session.json> --out <directory>

Options:
  --base-url <url>       App URL. Defaults to http://localhost:3000
  --chunk-size <frames> Active source frames per browser. Defaults to 300
  --overlap <frames>    Active-source overlap between browsers. Defaults to 60
  --local-test-auth     Sign in through /local-test-auth
  --resume              Reuse only passing chunk reports whose packet identity
                        and exact source window still match this run
  --role <role>         Local auth role. Defaults to super-admin
  --secret <secret>     Local auth secret
  --storage-state <file>
                        Playwright storage state

The aggregate fails unless every source frame is processed and every globally
active source frame is rendered at least once with zero per-window silent skips.
`);
}

export function buildMountedGameChunkWindows({ chunkSize, overlap, sampleCount, setupFrameCount }) {
  if (!Number.isInteger(sampleCount) || sampleCount <= setupFrameCount) {
    throw new Error("Packet must contain active frames after its setup prefix.");
  }
  if (!Number.isInteger(setupFrameCount) || setupFrameCount < 0) {
    throw new Error("setupFrameCount must be a non-negative integer.");
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0 || !Number.isInteger(overlap) || overlap <= 0) {
    throw new Error("chunkSize and overlap must be positive integers.");
  }
  if (overlap >= chunkSize) throw new Error("overlap must be smaller than chunkSize.");

  const windows = [];
  let frameStart = setupFrameCount;
  while (frameStart < sampleCount) {
    const frameEnd = Math.min(sampleCount - 1, frameStart + chunkSize - 1);
    if (
      frameEnd === sampleCount - 1 &&
      frameEnd - frameStart + 1 < chunkSize &&
      windows.length > 0
    ) {
      // A short tail may be entirely consumed by the normal Game readiness
      // gate. Extend the final window backwards so it can start naturally and
      // still render the true low-evidence ending without bypassing the gate.
      frameStart = Math.max(setupFrameCount, sampleCount - chunkSize);
    }
    windows.push({ frameEnd, frameStart });
    if (frameEnd === sampleCount - 1) break;
    frameStart = frameEnd - overlap + 1;
  }
  return windows;
}

function missingIndexes(observed, start, end) {
  const missing = [];
  for (let index = start; index <= end; index += 1) {
    if (!observed.has(index)) missing.push(index);
  }
  return missing;
}

export function aggregateMountedGameChunkReports({ reports, sampleCount }) {
  const failures = [];
  const processedSourceIndexes = new Set();
  const renderedSourceIndexes = new Set();
  const sourcePacketHashes = new Set();

  reports.forEach((report, chunkIndex) => {
    const packetFrameStart = report?.sourceWindow?.packetFrameStart;
    const final = report?.final;
    if (!Number.isInteger(packetFrameStart) || !final) {
      failures.push(`chunk ${chunkIndex} is missing source-window metadata`);
      return;
    }
    if (report.passed !== true) failures.push(`chunk ${chunkIndex} did not pass mounted Game`);
    if (final.contractStatus !== "matched") failures.push(`chunk ${chunkIndex} did not match the input contract`);
    if ((final.missingFrameIndexes ?? []).length > 0) failures.push(`chunk ${chunkIndex} silently skipped source frames`);
    if ((final.missingRenderedFrameIndexes ?? []).length > 0) failures.push(`chunk ${chunkIndex} silently skipped rendered frames`);
    (final.processedFrameIndexes ?? []).forEach((index) => processedSourceIndexes.add(packetFrameStart + index));
    (final.renderedFrames ?? []).forEach((frame) => renderedSourceIndexes.add(packetFrameStart + frame.frameIndex));
    if (report?.identity?.sourcePacketHash) sourcePacketHashes.add(report.identity.sourcePacketHash);
  });

  const firstRenderedSourceFrame = renderedSourceIndexes.size > 0
    ? Math.min(...renderedSourceIndexes)
    : null;
  const missingProcessedSourceIndexes = missingIndexes(processedSourceIndexes, 0, sampleCount - 1);
  const missingRenderedSourceIndexes = firstRenderedSourceFrame === null
    ? Array.from({ length: sampleCount }, (_, index) => index)
    : missingIndexes(renderedSourceIndexes, firstRenderedSourceFrame, sampleCount - 1);
  if (missingProcessedSourceIndexes.length > 0) {
    failures.push(`${missingProcessedSourceIndexes.length} original source frame(s) were never processed`);
  }
  if (firstRenderedSourceFrame === null) failures.push("no mounted-Game frame was rendered");
  else if (missingRenderedSourceIndexes.length > 0) {
    failures.push(`${missingRenderedSourceIndexes.length} globally active source frame(s) were never rendered`);
  }
  if (sourcePacketHashes.size !== 1) failures.push("chunk source-packet identity is missing or inconsistent");

  return {
    chunkCount: reports.length,
    failures,
    firstRenderedSourceFrame,
    lastRenderedSourceFrame: renderedSourceIndexes.size > 0 ? Math.max(...renderedSourceIndexes) : null,
    missingProcessedSourceIndexes,
    missingRenderedSourceIndexes,
    passed: failures.length === 0,
    processedSourceFrameCount: processedSourceIndexes.size,
    renderedSourceFrameCount: renderedSourceIndexes.size,
    sampleCount,
    sourcePacketHash: sourcePacketHashes.size === 1 ? [...sourcePacketHashes][0] : null,
  };
}

export function reusableMountedGameChunkReportFailure({
  packet,
  report,
  setupFrameCount,
  window,
}) {
  if (report?.passed !== true || (report?.failures ?? []).length > 0) return "report did not pass";
  if (report?.identity?.sourcePacketHash !== packet?.sourcePacketHash) {
    return "source packet identity changed";
  }
  if (report?.final?.contractStatus !== "matched") return "input contract did not match";
  if ((report?.final?.missingFrameIndexes ?? []).length > 0) return "source frames were skipped";
  if ((report?.final?.missingRenderedFrameIndexes ?? []).length > 0) {
    return "rendered frames were skipped";
  }
  const expectedPacketFrameStart = Math.max(0, window.frameStart - setupFrameCount);
  const sourceWindow = report?.sourceWindow;
  if (
    sourceWindow?.activeFrameStart !== window.frameStart ||
    sourceWindow?.activeFrameEnd !== window.frameEnd ||
    sourceWindow?.packetFrameStart !== expectedPacketFrameStart ||
    sourceWindow?.packetFrameEnd !== window.frameEnd ||
    sourceWindow?.setupFrameCount !== setupFrameCount
  ) {
    return "source window changed";
  }
  return null;
}

function runProcess(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(script)} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

export async function runMountedGamePacketChunkedProof(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.packet) throw new Error("Pass --packet <session.json>.");
  const packetPath = path.resolve(args.packet);
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  const sampleCount = Array.isArray(packet?.samples) ? packet.samples.length : 0;
  if (sampleCount !== packet?.sampleCount) throw new Error("Packet sampleCount does not match its samples array.");
  const setupFrameCount = Number(
    packet?.setupPrefix?.requiredFrameCount ?? packet?.inputContract?.setup?.prefixFrameCount ?? 0,
  );
  const windows = buildMountedGameChunkWindows({
    chunkSize: args.chunkSize,
    overlap: args.overlap,
    sampleCount,
    setupFrameCount,
  });
  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const reports = [];

  for (const [index, window] of windows.entries()) {
    const outputPath = path.join(outDir, `chunk-${String(index + 1).padStart(2, "0")}-${window.frameStart}-${window.frameEnd}.json`);
    const captureArgs = [
      "--base-url", args.baseUrl,
      "--debug-session-json", packetPath,
      "--frame-start", String(window.frameStart),
      "--frame-end", String(window.frameEnd),
      "--out", outputPath,
      "--skip-pause",
    ];
    if (args.localTestAuth) captureArgs.push("--local-test-auth");
    if (args.role) captureArgs.push("--role", args.role);
    if (args.secret) captureArgs.push("--secret", args.secret);
    if (args.storageState) captureArgs.push("--storage-state", args.storageState);
    console.log(`Mounted Game chunk ${index + 1}/${windows.length}: source ${window.frameStart}-${window.frameEnd}`);
    if (args.resume) {
      try {
        const existingReport = JSON.parse(await readFile(outputPath, "utf8"));
        const reuseFailure = reusableMountedGameChunkReportFailure({
          packet,
          report: existingReport,
          setupFrameCount,
          window,
        });
        if (!reuseFailure) {
          console.log(`Reusing validated chunk ${index + 1}/${windows.length}.`);
          reports.push(existingReport);
          continue;
        }
        console.log(`Rerunning chunk ${index + 1}/${windows.length}: ${reuseFailure}.`);
      } catch {
        // Missing or unreadable output is an incomplete chunk, so capture it.
      }
    }
    await runProcess(captureScript, captureArgs);
    reports.push(JSON.parse(await readFile(outputPath, "utf8")));
  }

  const aggregate = aggregateMountedGameChunkReports({ reports, sampleCount });
  const summary = {
    ...aggregate,
    chunkSize: args.chunkSize,
    overlap: args.overlap,
    packetPath,
    setupFrameCount,
    windows,
  };
  const summaryPath = path.join(outDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) throw new Error(`Chunked mounted-Game proof failed: ${summary.failures.join("; ")}`);
  console.log(
    `Chunked mounted Game proof passed: ${summary.processedSourceFrameCount}/${sampleCount} processed, ` +
    `${summary.renderedSourceFrameCount} globally active frame(s) rendered across ${summary.chunkCount} browser(s).`,
  );
  console.log(`Wrote ${summaryPath}`);
  return summary;
}

if (
  process.argv[1] &&
  path.basename(process.argv[1]) === "run-mounted-game-packet-chunked-proof.mjs" &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  runMountedGamePacketChunkedProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
