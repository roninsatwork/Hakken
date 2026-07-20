#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  SUPPORT_READINESS_MATRIX_DEFAULT_PATHS,
  buildSupportReadinessMatrix,
} from "./movement-support-readiness-matrix.mjs";

const DEFAULT_PLAN_PATH = "docs/plans/completed/movement-studio-best-practice-architecture-plan.md";

function printHelp() {
  console.log(`Audit that the movement architecture plan's current board matches support proof.

Usage:
  npm run movement:architecture-plan-status-audit
  npm run movement:architecture-plan-status-audit -- --strict

Options:
  --plan <file>              Architecture plan Markdown. Defaults to ${DEFAULT_PLAN_PATH}
  --strict                   Exit non-zero when the current board is stale.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseMovementArchitecturePlanStatusAuditArgs(argv) {
  const args = {
    help: false,
    json: false,
    planPath: DEFAULT_PLAN_PATH,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--plan") {
      args.planPath = argv[++index] || args.planPath;
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

function currentBoardSection(planText) {
  const start = planText.indexOf("## Current Standing Board");
  const end = planText.indexOf("## Executive Verdict");
  if (start === -1 || end === -1 || end <= start) return "";
  return planText.slice(start, end);
}

function missingExpectedSubstrings(section, expectedSubstrings) {
  return expectedSubstrings.filter((expected) => !section.includes(expected));
}

function forbiddenCurrentBoardSubstrings(section, forbiddenSubstrings) {
  return forbiddenSubstrings.filter((forbidden) => section.includes(forbidden));
}

function familyBacktickList(families) {
  return families.map((family) => `\`${family}\``);
}

export function auditMovementArchitecturePlanStatus({
  matrix,
  planText,
}) {
  const section = currentBoardSection(planText);
  const userFacingFamilies = matrix.rows
    .filter((row) => row.category === "user-facing")
    .map((row) => row.family);
  const internalFamilies = matrix.rows
    .filter((row) => row.category !== "user-facing")
    .map((row) => row.family);
  const expectedSubstrings = [
    `User-facing supported families: ${matrix.userFacingCount}/${matrix.familyCount}.`,
    `Non-user-facing internal families: ${matrix.internalFamilyCount}/${matrix.familyCount}.`,
    `Movement-family preview coverage slice: 100% testable preview/diagnostic coverage, ${matrix.productionFamilySupportPercent}% user-facing production support.`,
    `production family support, ${matrix.blockedUserFacingFamilies.length} blocked current user-facing families`,
    "futureFamilyShapeFailures: []",
    ...familyBacktickList(userFacingFamilies),
    ...familyBacktickList(internalFamilies),
  ];
  const forbiddenSubstrings = [
    "User-facing supported families: 4/19.",
    "Non-user-facing internal families: 15/19.",
    "21% user-facing production support",
    "4 user-facing families",
    "15 internal preview/demo/diagnostic families",
  ];
  const failures = [];

  if (!section) {
    failures.push("missing Current Standing Board section before Executive Verdict");
  }

  missingExpectedSubstrings(section, expectedSubstrings).forEach((expected) => {
    failures.push(`missing current-board text: ${expected}`);
  });
  forbiddenCurrentBoardSubstrings(section, forbiddenSubstrings).forEach((forbidden) => {
    failures.push(`stale current-board text is still present: ${forbidden}`);
  });
  (matrix.futureFamilyShapeFailures ?? []).forEach((failure) => {
    failures.push(`support matrix future-family shape drift: ${failure}`);
  });

  return {
    expected: {
      blockedUserFacingFamilies: matrix.blockedUserFacingFamilies,
      futureFamilyShapeFailures: matrix.futureFamilyShapeFailures ?? [],
      internalFamilyCount: matrix.internalFamilyCount,
      productionFamilySupportPercent: matrix.productionFamilySupportPercent,
      userFacingCount: matrix.userFacingCount,
    },
    failures,
    ok: failures.length === 0,
  };
}

async function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function readRequiredJson(filePath, label) {
  const value = await readJsonIfPresent(filePath);
  if (!value) throw new Error(`Missing ${label}: ${filePath}`);
  return value;
}

async function buildCurrentSupportMatrix() {
  const paths = SUPPORT_READINESS_MATRIX_DEFAULT_PATHS;
  return buildSupportReadinessMatrix({
    analysis: await readRequiredJson(paths.analysisPath, "reviewed analysis"),
    broadGameVisualPlan: await readJsonIfPresent(paths.broadGamePlanPath),
    broadSemanticReview: await readJsonIfPresent(paths.broadReviewPath),
    facingAnalysis: await readJsonIfPresent(paths.facingAnalysisPath),
    facingGameVisualPlan: await readJsonIfPresent(paths.facingGamePlanPath) ?? {},
    facingManifest: await readJsonIfPresent(paths.facingManifestPath),
    facingSemanticReview: await readJsonIfPresent(paths.facingReviewPath) ?? {},
    gameCaptureManifest: await readRequiredJson(paths.gameCaptureManifestPath, "Game capture manifest"),
    manifest: await readRequiredJson(paths.manifestPath, "reviewed proof manifest"),
    semanticReview: await readRequiredJson(paths.gameReviewPath, "Game semantic review"),
    sittingGameVisualPlan: await readJsonIfPresent(paths.sittingGamePlanPath) ?? {},
    sittingManifest: await readJsonIfPresent(paths.sittingManifestPath) ?? {},
    sittingSemanticReview: await readJsonIfPresent(paths.sittingReviewPath) ?? {},
  });
}

export function formatAudit(audit) {
  const lines = [
    `Movement architecture plan status audit: ${audit.ok ? "passed" : "blocked"}`,
    `Expected user-facing support: ${audit.expected.userFacingCount}/19 (${audit.expected.productionFamilySupportPercent}%)`,
    `Expected internal families: ${audit.expected.internalFamilyCount}/19`,
    `Blocked current user-facing families: ${audit.expected.blockedUserFacingFamilies.join(", ") || "none"}`,
    `Future-family shape failures: ${audit.expected.futureFamilyShapeFailures.length}`,
  ];

  if (audit.failures.length > 0) {
    lines.push("", "Failures:", ...audit.failures.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

async function main() {
  const args = parseMovementArchitecturePlanStatusAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const planText = await readFile(path.resolve(args.planPath), "utf8");
  const matrix = await buildCurrentSupportMatrix();
  const audit = auditMovementArchitecturePlanStatus({ matrix, planText });

  console.log(args.json ? JSON.stringify(audit, null, 2) : formatAudit(audit));
  if (args.strict && !audit.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
