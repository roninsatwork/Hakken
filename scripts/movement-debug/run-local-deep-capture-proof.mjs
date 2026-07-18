#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const recoveryScript = path.join(scriptDirectory, "recover-local-movement-packet.mjs");
const packetProofScript = path.join(scriptDirectory, "run-replay-mounted-game-packet-proof.mjs");

export function parseLocalDeepCaptureProofArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    headed: false,
    localTestAuth: false,
    outDir: "tmp/movement-replay-lab/local-deep-capture-proof",
    packet: "",
    preflightOnly: false,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--packet") args.packet = argv[++index] || "";
    else if (arg === "--out") args.outDir = argv[++index] || args.outDir;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--preflight-only") args.preflightOnly = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Recover a browser-downloaded schema-v3 packet and run its Replay/mounted Game proof.

Usage:
  npm run movement:replay-game:deep-local-proof -- --packet ~/Downloads/sonae-movement-schema-v3-*.json --local-test-auth --secret <secret>

Options:
  --out <directory>        Recovery and proof artifacts directory
  --base-url <url>         App URL; defaults to http://localhost:3000
  --local-test-auth        Authenticate proof browsers through /local-test-auth
  --secret <secret>        Local test-auth secret
  --storage-state <file>   Existing Playwright authentication state
  --role <role>            Local auth role; defaults to super-admin
  --headed                 Show proof browsers
  --preflight-only         Recover and validate without starting browsers

The source download is read-only: it is not uploaded, moved, overwritten, or deleted.
`);
}

export function buildLocalDeepCaptureProofPlan(args) {
  if (!args.packet) throw new Error("Pass --packet <downloaded-schema-v3-packet.json>.");
  const sourcePacketPath = path.resolve(args.packet);
  const outDir = path.resolve(args.outDir);
  const recoveredSessionPath = path.join(outDir, "recovered-session.json");
  const recoveryArgs = [
    "--packet", sourcePacketPath,
    "--out", recoveredSessionPath,
  ];
  const proofArgs = [
    "--deep-capture",
    "--packet", recoveredSessionPath,
    "--out", outDir,
    "--base-url", args.baseUrl,
    "--role", args.role,
  ];
  if (args.localTestAuth) proofArgs.push("--local-test-auth");
  if (args.secret) proofArgs.push("--secret", args.secret);
  if (args.storageState) proofArgs.push("--storage-state", args.storageState);
  if (args.headed) proofArgs.push("--headed");
  return {
    outDir,
    proof: { args: proofArgs, script: packetProofScript },
    recoveredSessionPath,
    recovery: { args: recoveryArgs, script: recoveryScript },
    sourcePacketPath,
  };
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

export async function runLocalDeepCaptureProof(argv, deps = {}) {
  const args = parseLocalDeepCaptureProofArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const plan = buildLocalDeepCaptureProofPlan(args);
  const run = deps.runProcess || runProcess;
  await run(plan.recovery.script, plan.recovery.args);
  if (!args.preflightOnly) await run(plan.proof.script, plan.proof.args);
  console.log(`Source backup preserved at ${plan.sourcePacketPath}`);
  console.log(args.preflightOnly
    ? `Local Deep Capture preflight passed. Recovered session: ${plan.recoveredSessionPath}`
    : `Local Deep Capture Replay/mounted Game proof passed. Artifacts: ${plan.outDir}`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocalDeepCaptureProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
