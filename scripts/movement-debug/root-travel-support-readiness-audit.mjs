#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  auditWalkingSupportReadiness,
  formatWalkingSupportReadiness,
  WALKING_SUPPORT_REQUIREMENTS,
} from "./walking-support-readiness-audit.mjs";

const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const DEFAULT_GAME_VISUAL_PLAN_PATH = "tmp/movement-replay-lab/current-game-visual-proof-plan.json";
const DEFAULT_SEMANTIC_REVIEW_PATH = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_RECORDING_PLAN_OUT_PATH = "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json";

export const ROOT_TRAVEL_SUPPORT_REQUIREMENTS = {
  ...WALKING_SUPPORT_REQUIREMENTS,
  family: "root-travel",
};

function printHelp() {
  console.log(`Audit whether root-travel is ready for a user-facing support claim.

Usage:
  npm run movement:root-travel-support-audit
  npm run movement:root-travel-support-audit -- --strict

Options:
  --manifest <file>          Focused root-travel proof manifest. Defaults to ${DEFAULT_MANIFEST_PATH}
  --game-visual-plan <file>  Focused root-travel Game visual target plan. Defaults to ${DEFAULT_GAME_VISUAL_PLAN_PATH}
  --semantic-review <file>   Focused root-travel Game semantic review decisions. Defaults to ${DEFAULT_SEMANTIC_REVIEW_PATH}
  --recording-plan-out <f>   Write the support recording-gap plan used by quick validation. Defaults to ${DEFAULT_RECORDING_PLAN_OUT_PATH}
  --no-recording-plan-out    Do not write the support recording-gap plan.
  --strict                   Exit non-zero when root-travel support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseRootTravelSupportReadinessAuditArgs(argv) {
  const args = {
    gameVisualPlanPath: DEFAULT_GAME_VISUAL_PLAN_PATH,
    help: false,
    json: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    recordingPlanOutPath: DEFAULT_RECORDING_PLAN_OUT_PATH,
    semanticReviewPath: DEFAULT_SEMANTIC_REVIEW_PATH,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--game-visual-plan") {
      args.gameVisualPlanPath = argv[++index] || args.gameVisualPlanPath;
    } else if (arg === "--semantic-review") {
      args.semanticReviewPath = argv[++index] || args.semanticReviewPath;
    } else if (arg === "--recording-plan-out") {
      args.recordingPlanOutPath = argv[++index] || args.recordingPlanOutPath;
    } else if (arg === "--no-recording-plan-out") {
      args.recordingPlanOutPath = "";
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

export function auditRootTravelSupportReadiness(options = {}) {
  const audit = auditWalkingSupportReadiness({
    ...options,
    requirements: options.requirements ?? ROOT_TRAVEL_SUPPORT_REQUIREMENTS,
  });

  return {
    ...audit,
    decision: audit.ready
      ? "Root-travel can be considered for a scoped user-facing support claim."
      : "Keep root-travel internal preview/demo-only; recorded root-travel proof is not ready for product support.",
    family: "root-travel",
  };
}

export function formatRootTravelSupportReadiness(audit) {
  return formatWalkingSupportReadiness({
    ...audit,
    decision: audit.decision,
    family: "root-travel",
  }).replace("Walking support readiness:", "Root-travel support readiness:");
}

async function readJsonIfPresent(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!existsSync(resolvedPath)) return null;
  return JSON.parse(await readFile(resolvedPath, "utf8"));
}

async function writeJsonFile(filePath, value) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseRootTravelSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifest = await readJsonIfPresent(args.manifestPath);
  if (!manifest) {
    throw new Error(`Missing root-travel proof manifest: ${args.manifestPath}. Run the walking/root-travel handoff analysis first.`);
  }
  const audit = auditRootTravelSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(args.gameVisualPlanPath) ?? {},
    manifest,
    recordingPlanPath: args.recordingPlanOutPath,
    semanticReview: await readJsonIfPresent(args.semanticReviewPath) ?? {},
  });
  await writeJsonFile(args.recordingPlanOutPath, audit.recordingGap?.plan);

  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatRootTravelSupportReadiness(audit));
  }

  if (args.strict && !audit.ready) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
