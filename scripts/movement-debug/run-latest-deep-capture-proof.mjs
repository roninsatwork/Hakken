#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const inventoryScript = path.join(
  scriptDirectory,
  "check-replay-mounted-game-commissioning-eligibility.mjs",
);
const commissioningProofScript = path.join(
  scriptDirectory,
  "run-replay-mounted-game-commissioning-proof.mjs",
);

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    exportPath: "",
    headed: false,
    localTestAuth: false,
    outDir: "tmp/movement-replay-lab/current-latest-deep-capture-proof",
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
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Discover the newest eligible schema-v3 recording and run its Replay/Game proof.

Usage:
  npm run movement:replay-game:deep-latest-proof -- --out <directory>

Options:
  --export <zip|dir>       Reuse an existing Convex export instead of creating a fresh one
  --out <directory>        Output directory
  --base-url <url>         App URL. Defaults to http://localhost:3000
  --local-test-auth        Authenticate through /local-test-auth
  --secret <secret>        Local auth secret
  --storage-state <file>   Playwright storage state
  --role <role>            Local auth role. Defaults to super-admin
  --headed                 Show both proof browsers

The command inventories every saved movement, selects the newest packet that passes the full
schema-v3 preflight, then routes its immutable recording id through fresh Replay and mounted Game.
`);
}

export function selectLatestEligibleDeepCapture(report) {
  const eligible = (Array.isArray(report?.results) ? report.results : [])
    .filter((result) => result?.eligible === true && result.schemaVersion === 3)
    .filter((result) => typeof result.recordingId === "string" && result.recordingId.trim())
    .filter((result) => Number.isFinite(result.createdAt))
    .sort((left, right) => (
      right.createdAt - left.createdAt || left.recordingId.localeCompare(right.recordingId)
    ));
  if (eligible.length === 0) {
    throw new Error(
      "No eligible schema-v3 Deep Capture recording exists in the current export. " +
      "Keep legacy recordings; save one proof-ready Deep Capture packet first.",
    );
  }
  return eligible[0];
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
      env: { ...process.env, SENTRY_DSN: "" },
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

export async function runLatestDeepCaptureProof(argv, deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (args.localTestAuth && !args.secret) {
    throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  }

  const outDir = path.resolve(args.outDir);
  const exportPath = args.exportPath
    ? path.resolve(args.exportPath)
    : path.join(outDir, "source.convex-export.zip");
  const inventoryDir = path.join(outDir, "inventory");
  const inventoryPath = path.join(inventoryDir, "eligibility.json");
  const commissioningOutDir = path.join(outDir, "commissioning-proof");
  const commissioningSummaryPath = path.join(commissioningOutDir, "summary.json");
  const summaryPath = path.join(outDir, "summary.json");
  const run = deps.runProcess || runProcess;

  await mkdir(outDir, { recursive: true });
  if (!args.exportPath) {
    await run("npx", [
      "convex",
      "export",
      "--include-file-storage",
      "--path",
      exportPath,
    ]);
  }
  await run(process.execPath, [
    inventoryScript,
    "--deep-capture",
    "--all-recordings",
    "--export", exportPath,
    "--converted-out", path.join(inventoryDir, "packets"),
    "--out", inventoryPath,
  ]);
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  const selected = selectLatestEligibleDeepCapture(inventory);

  await run(process.execPath, [
    commissioningProofScript,
    "--deep-capture",
    "--recording-id", selected.recordingId,
    "--export", exportPath,
    "--out", commissioningOutDir,
    ...proofAuthArgs(args),
  ]);
  const commissioning = JSON.parse(await readFile(commissioningSummaryPath, "utf8"));
  const summary = {
    commissioningSummaryPath,
    createdAt: selected.createdAt,
    exportPath,
    inventoryPath,
    passed: commissioning.passed === true,
    proofProfile: "deep-capture-v1",
    recordingId: selected.recordingId,
    summaryPath,
    title: selected.title,
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) throw new Error("Latest Deep Capture Replay/Game proof failed.");
  console.log(`Latest Deep Capture proof passed for ${summary.title} (${summary.recordingId}).`);
  console.log(`Wrote ${summaryPath}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLatestDeepCaptureProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
