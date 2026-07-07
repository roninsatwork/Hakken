#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  auditSittingSupportReadiness,
  formatSittingSupportReadiness,
} from "./sitting-support-readiness-audit.mjs";
import {
  auditWalkingSupportReadiness,
  formatWalkingSupportReadiness,
} from "./walking-support-readiness-audit.mjs";
import {
  recordingGapProtocolText,
} from "./recording-gap-plan.mjs";

const DEFAULT_OUT_PATH = "tmp/movement-replay-lab/current-next-proof-readiness.json";
const DEFAULT_MARKDOWN_OUT_PATH = "tmp/movement-replay-lab/current-next-proof-readiness.md";

export const NEXT_PROOF_READINESS_DEFAULT_PATHS = {
  sitting: {
    gameVisualPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.reviewed.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
  walking: {
    gameVisualPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-plan.json",
    manifestPath: "tmp/movement-replay-lab/current-expansion-preview-walking-flag-smoke-analysis.proof-manifest.json",
    recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
    semanticReviewPath: "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-review-decisions.codex-semantic-review.json",
  },
};

function printHelp() {
  console.log(`Summarize the next movement proof blockers and quick validation commands.

Usage:
  npm run movement:next-proof-readiness
  npm run movement:next-proof-readiness -- --json

Options:
  --out <file>               JSON summary output. Defaults to ${DEFAULT_OUT_PATH}
  --markdown-out <file>      Markdown summary output. Defaults to ${DEFAULT_MARKDOWN_OUT_PATH}
  --no-write                 Do not write JSON/Markdown outputs or support recording plans.
  --json                     Print machine-readable JSON.
  --strict                   Exit non-zero when any family is still blocked.
  --help                     Show this help.
`);
}

export function parseNextProofReadinessArgs(argv) {
  const args = {
    help: false,
    json: false,
    markdownOutPath: DEFAULT_MARKDOWN_OUT_PATH,
    outPath: DEFAULT_OUT_PATH,
    strict: false,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--markdown-out") {
      args.markdownOutPath = argv[++index] || args.markdownOutPath;
    } else if (arg === "--no-write") {
      args.write = false;
    } else if (arg === "--strict") {
      args.strict = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

export function nextProofReadinessStrictFailure(summary) {
  if (summary.ready) return "";
  const blockedFamilies = summary.blockedFamilies.length > 0
    ? summary.blockedFamilies.join(", ")
    : "unknown";
  return `Movement next proof readiness is blocked for: ${blockedFamilies}.`;
}

async function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readRequiredJson(filePath, label) {
  const value = await readJsonIfPresent(filePath);
  if (!value) throw new Error(`Missing ${label}: ${filePath}`);
  return value;
}

function firstCaptureScenario(audit) {
  return audit.recordingGap?.captureScenarios?.[0] ?? null;
}

function familySummary(audit) {
  const scenario = firstCaptureScenario(audit);
  return {
    family: audit.family,
    missingAnalyzerProofCases: audit.missingAnalyzerProofCases,
    missingGamePlanCases: audit.missingGamePlanCases,
    missingReadableGameCases: audit.missingReadableGameCases,
    missingRecordedPassedProofCases: audit.missingRecordedPassedProofCases,
    nextBlockerCodes: scenario?.blockerCodes ?? [],
    nextFreshRecordingLabel: scenario?.freshRecordingLabel ?? "",
    nextProtocol: scenario?.protocol ?? null,
    nextProtocolText: recordingGapProtocolText(scenario?.protocol ?? scenario),
    nextProofCases: scenario?.proofCases ?? [],
    nextRecordingIds: scenario?.recordingIds ?? [],
    nextValidationCommand: scenario?.validationCommand ?? "",
    nextValidationOutputPath: scenario?.validationOutputPath ?? "",
    quickValidationCommand: scenario?.quickValidationCommand ?? "",
    ready: audit.ready,
    recordingPlanPath: audit.recordingGap?.planPath ?? "",
    recordingGapSummary: audit.recordingGap?.summary ?? null,
  };
}

export function buildNextProofReadinessSummary({
  generatedAt = new Date().toISOString(),
  sitting,
  walking,
}) {
  const families = [
    familySummary(sitting),
    familySummary(walking),
  ];
  return {
    blockedFamilies: families.filter((family) => !family.ready).map((family) => family.family),
    families,
    generatedAt,
    nextCommands: families
      .map((family) => family.quickValidationCommand)
      .filter(Boolean),
    ready: families.every((family) => family.ready),
  };
}

export function formatNextProofReadinessSummary(summary, {
  sittingText = "",
  walkingText = "",
} = {}) {
  const lines = [
    "# Movement Next Proof Readiness",
    "",
    `Status: ${summary.ready ? "ready" : "blocked"}`,
    `Blocked families: ${summary.blockedFamilies.length > 0 ? summary.blockedFamilies.join(", ") : "none"}`,
    "",
    "## Next Commands",
    "",
    ...(
      summary.nextCommands.length > 0
        ? summary.nextCommands.map((command) => `- \`${command}\``)
        : ["- none"]
    ),
    "",
    "## Next Scenario Details",
    "",
    ...summary.families.flatMap((family) => [
      `### ${family.family}`,
      "",
      `Fresh recording: ${family.nextFreshRecordingLabel || "none"}`,
      `Proof cases: ${family.nextProofCases.length > 0 ? family.nextProofCases.join(", ") : "none"}`,
      `Recording plan: ${family.recordingPlanPath || "none"}`,
      `Validation output: ${family.nextValidationOutputPath || "none"}`,
      family.nextProtocolText ? `Protocol: ${family.nextProtocolText}` : "Protocol: none",
      "",
    ]),
    "",
    "## Sitting",
    "",
    "```text",
    sittingText || "No sitting audit output.",
    "```",
    "",
    "## Walking",
    "",
    "```text",
    walkingText || "No walking audit output.",
    "```",
    "",
  ];

  return lines.join("\n");
}

async function writeJsonFile(filePath, value) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath, value) {
  if (!filePath) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function main() {
  const args = parseNextProofReadinessArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const paths = NEXT_PROOF_READINESS_DEFAULT_PATHS;
  const sitting = auditSittingSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(paths.sitting.gameVisualPlanPath) ?? {},
    manifest: await readRequiredJson(paths.sitting.manifestPath, "sitting proof manifest"),
    recordingPlanPath: paths.sitting.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.sitting.semanticReviewPath) ?? {},
  });
  const walking = auditWalkingSupportReadiness({
    gameVisualPlan: await readJsonIfPresent(paths.walking.gameVisualPlanPath) ?? {},
    manifest: await readRequiredJson(paths.walking.manifestPath, "walking proof manifest"),
    recordingPlanPath: paths.walking.recordingPlanPath,
    semanticReview: await readJsonIfPresent(paths.walking.semanticReviewPath) ?? {},
  });
  const sittingText = formatSittingSupportReadiness(sitting);
  const walkingText = formatWalkingSupportReadiness(walking);
  const summary = buildNextProofReadinessSummary({ sitting, walking });
  const markdown = formatNextProofReadinessSummary(summary, { sittingText, walkingText });

  if (args.write) {
    await writeJsonFile(paths.sitting.recordingPlanPath, sitting.recordingGap?.plan);
    await writeJsonFile(paths.walking.recordingPlanPath, walking.recordingGap?.plan);
    await writeJsonFile(args.outPath, summary);
    await writeTextFile(args.markdownOutPath, markdown);
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(markdown);
    if (args.write) {
      console.log(`Wrote ${args.outPath}`);
      console.log(`Wrote ${args.markdownOutPath}`);
    }
  }

  if (args.strict && !summary.ready) {
    console.error(nextProofReadinessStrictFailure(summary));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
