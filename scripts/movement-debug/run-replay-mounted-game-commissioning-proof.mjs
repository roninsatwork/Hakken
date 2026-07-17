#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const exportSessionScript = path.join(scriptDirectory, "export-replay-session.mjs");
const packetProofScript = path.join(scriptDirectory, "run-replay-mounted-game-packet-proof.mjs");

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function parseCommissioningProofArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    exportPath: "",
    headed: false,
    localTestAuth: false,
    outDir: "",
    recordingId: "",
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headed") args.headed = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--export") args.exportPath = argv[++index] || "";
    else if (arg === "--out") args.outDir = argv[++index] || "";
    else if (arg === "--recording-id") args.recordingId = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Run one saved commissioning recording through fresh Replay and mounted Game proof.

Usage:
  npm run movement:replay-game:commissioning-proof -- --recording-id <id> --out <directory>

Options:
  --recording-id <id>      Saved movement recording id from commissioning capture
  --out <directory>        Output directory. Defaults to a timestamped commissioning-proof run
  --export <zip|dir>       Reuse an existing Convex export instead of creating a fresh one
  --base-url <url>         App URL. Defaults to http://localhost:3000
  --local-test-auth        Authenticate through /local-test-auth
  --secret <secret>        Local auth secret
  --storage-state <file>   Playwright storage state
  --role <role>            Local auth role. Defaults to super-admin
  --headed                 Show both proof browsers

Without --export, this command creates a fresh Convex export with file storage, converts the
recording to a Replay session packet, and then runs movement:replay-game:packet-proof.
`);
}

export function buildCommissioningProofPlan(args, now = timestampForPath()) {
  const recordingId = args.recordingId.trim();
  if (!recordingId) throw new Error("Pass --recording-id <movement id>.");

  const outDir = path.resolve(
    args.outDir || path.join("tmp/movement-replay-lab/replay-mounted-game-commissioning-proof", `${recordingId}-${now}`),
  );
  const exportPath = args.exportPath
    ? path.resolve(args.exportPath)
    : path.join(outDir, "source.convex-export.zip");
  const sessionPath = path.join(outDir, "replay-session.json");
  const packetProofOutDir = path.join(outDir, "packet-proof");
  const packetProofSummaryPath = path.join(packetProofOutDir, "summary.json");
  const summaryPath = path.join(outDir, "summary.json");

  return {
    createFreshExport: !args.exportPath,
    exportPath,
    outDir,
    packetProofOutDir,
    packetProofSummaryPath,
    recordingId,
    sessionPath,
    summaryPath,
  };
}

function proofAuthArgs(args) {
  const values = ["--base-url", args.baseUrl];
  if (args.localTestAuth) values.push("--local-test-auth");
  if (args.secret) values.push("--secret", args.secret);
  if (args.storageState) values.push("--storage-state", args.storageState);
  if (args.role) values.push("--role", args.role);
  if (args.headed) values.push("--headed");
  return values;
}

function runProcess(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      env: {
        ...process.env,
        SENTRY_DSN: "",
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(
        `${path.basename(command)} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
      ));
    });
  });
}

export async function runReplayMountedGameCommissioningProof(argv, deps = {}) {
  const args = parseCommissioningProofArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const plan = buildCommissioningProofPlan(args);
  const run = deps.runProcess || runProcess;

  await mkdir(plan.outDir, { recursive: true });
  if (plan.createFreshExport) {
    await run("npx", [
      "convex",
      "export",
      "--include-file-storage",
      "--path",
      plan.exportPath,
    ]);
  }
  await run(process.execPath, [
    exportSessionScript,
    "--export",
    plan.exportPath,
    "--recording-id",
    plan.recordingId,
    "--out",
    plan.sessionPath,
  ]);
  await run(process.execPath, [
    packetProofScript,
    ...proofAuthArgs(args),
    "--packet",
    plan.sessionPath,
    "--out",
    plan.packetProofOutDir,
  ]);

  const packetProofSummary = JSON.parse(await readFile(plan.packetProofSummaryPath, "utf8"));
  const summary = {
    createFreshExport: plan.createFreshExport,
    exportPath: plan.exportPath,
    packetProofOutDir: plan.packetProofOutDir,
    packetProofSummaryPath: plan.packetProofSummaryPath,
    passed: packetProofSummary.passed === true,
    recordingId: plan.recordingId,
    sessionPath: plan.sessionPath,
    summaryPath: plan.summaryPath,
  };
  await writeFile(plan.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) {
    throw new Error(`Commissioning Replay/Game proof failed. See ${plan.packetProofSummaryPath}`);
  }
  console.log(`Commissioning Replay/Game proof passed for ${plan.recordingId}.`);
  console.log(`Wrote ${plan.summaryPath}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runReplayMountedGameCommissioningProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
