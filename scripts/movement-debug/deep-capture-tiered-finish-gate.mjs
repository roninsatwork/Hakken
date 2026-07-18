#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEEP_CAPTURE_PROOF_TIERS } from "./run-replay-mounted-game-deep-tier-proof.mjs";

function parseArgs(argv) {
  const args = { summaries: {}, through: "all-nine" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--through") args.through = argv[++index] || args.through;
    else if (arg === "--targeted-summary") args.summaries.targeted = argv[++index] || "";
    else if (arg === "--representative-summary") args.summaries.representative = argv[++index] || "";
    else if (arg === "--all-nine-summary") args.summaries["all-nine"] = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function defaultSummaryPath(tier) {
  return `tmp/movement-replay-lab/current-deep-capture-${tier}-proof/summary.json`;
}

export function auditDeepCaptureTieredFinishGate({ summaries, through = "all-nine" }) {
  const throughIndex = DEEP_CAPTURE_PROOF_TIERS.indexOf(through);
  if (throughIndex < 0) throw new Error(`Unknown Deep Capture finish tier ${through}.`);
  const requiredTiers = DEEP_CAPTURE_PROOF_TIERS.slice(0, throughIndex + 1);
  const failures = [];
  for (const tier of requiredTiers) {
    const summary = summaries[tier];
    if (!summary) {
      failures.push(`${tier}: summary is missing`);
      continue;
    }
    if (summary.proofProfile !== "deep-capture-v1") failures.push(`${tier}: proof profile is not Deep Capture`);
    if (summary.proofTier !== tier) failures.push(`${tier}: summary declares tier ${summary.proofTier ?? "missing"}`);
    if (summary.passed !== true) failures.push(`${tier}: proof did not pass`);
    if (!Number.isInteger(summary.recordingCount) || summary.recordingCount <= 0) {
      failures.push(`${tier}: recording count is missing`);
    }
    if (tier === "representative" && summary.recordingCount !== 3) {
      failures.push("representative: proof must contain exactly three recordings");
    }
    if (tier === "all-nine" && summary.recordingCount !== 9) {
      failures.push("all-nine: proof must contain exactly nine recordings");
    }
    if ((summary.exactChecksumDivergenceCount ?? 0) !== 0) {
      failures.push(`${tier}: exact Replay/Game boundary divergence is non-zero`);
    }
  }
  return { failures, passed: failures.length === 0, requiredTiers, through };
}

async function printHelp() {
  console.log(`Require ordered current Deep Capture Replay/mounted Game tier summaries.

Usage:
  npm run movement:replay-game:deep-tiered-finish-gate -- --through targeted|representative|all-nine
`);
}

export async function runDeepCaptureTieredFinishGate(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    await printHelp();
    return null;
  }
  const throughIndex = DEEP_CAPTURE_PROOF_TIERS.indexOf(args.through);
  if (throughIndex < 0) throw new Error(`Unknown Deep Capture finish tier ${args.through}.`);
  const summaries = {};
  for (const tier of DEEP_CAPTURE_PROOF_TIERS.slice(0, throughIndex + 1)) {
    const summaryPath = path.resolve(args.summaries[tier] || defaultSummaryPath(tier));
    try {
      summaries[tier] = JSON.parse(await readFile(summaryPath, "utf8"));
    } catch {
      summaries[tier] = null;
    }
  }
  const report = auditDeepCaptureTieredFinishGate({ summaries, through: args.through });
  console.log(
    `Deep Capture tiered finish gate: ${report.passed ? "passed" : "blocked"} ` +
    `through ${report.through} (${report.requiredTiers.join(" -> ")}).`,
  );
  if (!report.passed) {
    report.failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDeepCaptureTieredFinishGate(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
