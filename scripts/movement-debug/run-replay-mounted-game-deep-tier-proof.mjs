#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const REPRESENTATIVE_TITLES = new Set([
  "Full Motion Exercises",
  "Full Spinal Flow",
  "Spins",
]);
export const DEEP_CAPTURE_PROOF_TIERS = ["targeted", "representative", "all-nine"];

function parseIds(value) {
  return value.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
}

export function parseDeepCaptureTierProofArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    headed: false,
    localTestAuth: false,
    manifest: "",
    outDir: "",
    recordingIds: [],
    resumePassed: false,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
    tier: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headed") args.headed = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--resume-passed") args.resumePassed = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--manifest") args.manifest = argv[++index] || "";
    else if (arg === "--out") args.outDir = argv[++index] || "";
    else if (arg === "--recording-ids") args.recordingIds.push(...parseIds(argv[++index] || ""));
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--tier") args.tier = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Run one ordered Deep Capture tier through eligibility, mounted Game, Replay, and exact comparison.

Usage:
  npm run movement:replay-game:deep-targeted-proof -- --manifest <manifest.json> --recording-ids <ids>
  npm run movement:replay-game:deep-representative-proof -- --manifest <manifest.json>
  npm run movement:replay-game:deep-all-nine-proof -- --manifest <manifest.json>

Options:
  --tier <tier>             targeted, representative, or all-nine
  --manifest <file>         Manifest with recordings[].session schema-v3 packets
  --recording-ids <ids>     Required only for targeted proof
  --out <directory>         Tier artifact directory
  --base-url <url>          App URL
  --local-test-auth         Authenticate through /local-test-auth
  --secret <secret>         Local auth secret
  --role <role>             Local auth role
  --storage-state <file>    Playwright storage state
  --headed                  Show proof browsers
  --resume-passed           Reuse complete passing mounted/comparison artifacts
`);
}

export function selectDeepCaptureTierRecordings({ manifest, recordingIds = [], tier }) {
  if (!DEEP_CAPTURE_PROOF_TIERS.includes(tier)) {
    throw new Error(`Unknown Deep Capture proof tier ${tier || "(missing)"}.`);
  }
  const recordings = Array.isArray(manifest?.recordings) ? manifest.recordings : [];
  if (recordings.length === 0) throw new Error("Deep Capture manifest has no recordings.");
  const ids = new Set(recordingIds);
  let selected;
  if (tier === "targeted") {
    if (ids.size === 0) throw new Error("Targeted Deep Capture proof requires --recording-ids <ids>.");
    selected = recordings.filter((recording) => ids.has(recording.id));
    const missingIds = [...ids].filter((id) => !selected.some((recording) => recording.id === id));
    if (missingIds.length > 0) throw new Error(`Unknown targeted recording ids: ${missingIds.join(", ")}.`);
  } else {
    if (ids.size > 0) throw new Error(`The ${tier} tier selects its fixed recording set; omit --recording-ids.`);
    selected = tier === "representative"
      ? recordings.filter((recording) => REPRESENTATIVE_TITLES.has(recording.title))
      : recordings;
  }
  if (tier === "representative" && selected.length !== REPRESENTATIVE_TITLES.size) {
    throw new Error(`Representative Deep Capture proof requires Full Motion Exercises, Full Spinal Flow, and Spins; found ${selected.length}/3.`);
  }
  if (tier === "all-nine" && selected.length !== 9) {
    throw new Error(`Final Deep Capture proof requires exactly nine recordings; found ${selected.length}.`);
  }
  for (const recording of selected) {
    if (!recording?.id || !recording?.session) {
      throw new Error("Every selected Deep Capture recording must declare id and session.");
    }
  }
  return selected;
}

export function buildDeepCaptureTierProofPlan(args, manifest, now = Date.now()) {
  const recordings = selectDeepCaptureTierRecordings({
    manifest,
    recordingIds: args.recordingIds,
    tier: args.tier,
  });
  const outDir = path.resolve(
    args.outDir || `tmp/movement-replay-lab/current-deep-capture-${args.tier}-proof`,
  );
  const selectedManifest = {
    ...manifest,
    proofProfile: "deep-capture-v1",
    proofTier: args.tier,
    recordingSetId: `deep-capture-${args.tier}-current`,
    recordings,
    requiredRecordingIds: recordings.map((recording) => recording.id),
  };
  return {
    comparisonOutDir: path.join(outDir, "comparison"),
    eligibilityPath: path.join(outDir, "eligibility.json"),
    gameOutDir: path.join(outDir, "mounted-game"),
    generatedAt: new Date(now).toISOString(),
    outDir,
    proofProfile: "deep-capture-v1",
    proofTier: args.tier,
    recordingCount: recordings.length,
    selectedManifest,
    selectedManifestPath: path.join(outDir, "selected-manifest.json"),
    summaryPath: path.join(outDir, "summary.json"),
  };
}

function runProcess(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptDirectory, script), ...args], {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

function browserArgs(args) {
  const result = ["--base-url", args.baseUrl];
  if (args.localTestAuth) result.push("--local-test-auth");
  if (args.secret) result.push("--secret", args.secret);
  if (args.role) result.push("--role", args.role);
  if (args.storageState) result.push("--storage-state", args.storageState);
  return result;
}

export async function runReplayMountedGameDeepTierProof(argv, deps = {}) {
  const args = parseDeepCaptureTierProofArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.manifest) throw new Error("Pass --manifest <manifest.json>.");
  if (args.localTestAuth && !args.secret) {
    throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  }
  const manifest = JSON.parse(await readFile(path.resolve(args.manifest), "utf8"));
  const plan = buildDeepCaptureTierProofPlan(args, manifest);
  await mkdir(plan.outDir, { recursive: true });
  await writeFile(plan.selectedManifestPath, `${JSON.stringify(plan.selectedManifest, null, 2)}\n`);
  const run = deps.runProcess || runProcess;
  await run("check-replay-mounted-game-commissioning-eligibility.mjs", [
    "--deep-capture",
    "--manifest", plan.selectedManifestPath,
    "--out", plan.eligibilityPath,
    "--fail-on-ineligible",
  ]);
  await run("run-mounted-game-nine-proof.mjs", [
    "--manifest", plan.selectedManifestPath,
    "--out", plan.gameOutDir,
    "--skip-pause",
    ...(args.resumePassed ? ["--resume-passed"] : []),
    ...browserArgs(args),
  ]);
  await run("run-replay-mounted-game-nine-comparison.mjs", [
    "--manifest", plan.selectedManifestPath,
    "--game-summary", path.join(plan.gameOutDir, "summary.json"),
    "--out", plan.comparisonOutDir,
    ...(args.resumePassed ? ["--resume-passed"] : []),
    ...browserArgs(args),
  ]);
  const eligibility = JSON.parse(await readFile(plan.eligibilityPath, "utf8"));
  const mountedGame = JSON.parse(await readFile(path.join(plan.gameOutDir, "summary.json"), "utf8"));
  const comparison = JSON.parse(await readFile(path.join(plan.comparisonOutDir, "summary.json"), "utf8"));
  const summary = {
    comparisonPath: path.join(plan.comparisonOutDir, "summary.json"),
    comparedFrameCount: comparison.comparedFrameCount ?? 0,
    eligibilityPath: plan.eligibilityPath,
    exactChecksumDivergenceCount: comparison.exactChecksumDivergenceCount ?? 0,
    generatedAt: plan.generatedAt,
    mountedGamePath: path.join(plan.gameOutDir, "summary.json"),
    passed: eligibility.passed === true && mountedGame.passed === true && comparison.passed === true,
    proofProfile: plan.proofProfile,
    proofTier: plan.proofTier,
    recordingCount: plan.recordingCount,
    selectedManifestPath: plan.selectedManifestPath,
  };
  await writeFile(plan.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.passed) throw new Error(`Deep Capture ${plan.proofTier} proof failed.`);
  console.log(`Deep Capture ${plan.proofTier} proof passed for ${plan.recordingCount} recording(s).`);
  console.log(`Wrote ${plan.summaryPath}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReplayMountedGameDeepTierProof(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
