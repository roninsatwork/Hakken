#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  SUPPORT_READINESS_MATRIX_DEFAULT_PATHS,
  buildSupportReadinessMatrix,
} from "./movement-support-readiness-matrix.mjs";

const DEFAULT_PLAN_PATH = "docs/plans/completed/movement-studio-best-practice-architecture-plan.md";
const DEFAULT_OUT_PATH = "tmp/movement-replay-lab/current-roadmap-progress-report.json";
const DEFAULT_MARKDOWN_OUT_PATH = "tmp/movement-replay-lab/current-roadmap-progress-report.md";
const EXPECTED_SECTION_COUNT = 15;

function printHelp() {
  console.log(`Report movement roadmap progress from the plan and support matrix.

Usage:
  npm run movement:roadmap-progress-report
  npm run movement:roadmap-progress-report -- --strict --json

Options:
  --plan <file>              Architecture plan Markdown. Defaults to ${DEFAULT_PLAN_PATH}
  --out <file>               JSON output. Defaults to ${DEFAULT_OUT_PATH}
  --markdown-out <file>      Markdown output. Defaults to ${DEFAULT_MARKDOWN_OUT_PATH}
  --no-write                 Do not write JSON/Markdown outputs.
  --strict                   Exit non-zero when progress/reporting inputs are inconsistent.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseMovementRoadmapProgressReportArgs(argv) {
  const args = {
    help: false,
    json: false,
    markdownOutPath: DEFAULT_MARKDOWN_OUT_PATH,
    outPath: DEFAULT_OUT_PATH,
    planPath: DEFAULT_PLAN_PATH,
    strict: false,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--plan") {
      args.planPath = argv[++index] || args.planPath;
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--markdown-out") {
      args.markdownOutPath = argv[++index] || args.markdownOutPath;
    } else if (arg === "--no-write") {
      args.write = false;
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

function currentProgressSection(planText) {
  const section = currentBoardSection(planText);
  const start = section.indexOf("Current progress estimates:");
  if (start === -1) return "";
  return section.slice(start);
}

function parseCurrentProgressItems(planText) {
  const section = currentProgressSection(planText);
  return Array.from(section.matchAll(/^- ([^:]+): (.+)$/gm), (match) => {
    const text = match[2].trim();
    return {
      label: match[1].trim(),
      percentages: Array.from(text.matchAll(/(\d+)%/g), (percentMatch) => Number(percentMatch[1])),
      text,
    };
  });
}

function currentProgressByLabel(items) {
  return Object.fromEntries(items.map((item) => [item.label, item]));
}

export function parseSectionProgressRows(planText) {
  return Array.from(planText.matchAll(/^\| Phase (\d+): ([^|]+) \| (\d+)% \|/gm), (match) => ({
    percent: Number(match[3]),
    phase: Number(match[1]),
    title: match[2].trim(),
  })).sort((a, b) => a.phase - b.phase);
}

function averagePercent(rows) {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.percent, 0) / rows.length;
}

function requiredCurrentPercent(progressByLabel, label) {
  return progressByLabel[label]?.percentages?.[0] ?? null;
}

export function buildMovementRoadmapProgressReport({
  matrix,
  planText,
}) {
  const currentProgressItems = parseCurrentProgressItems(planText);
  const progressByLabel = currentProgressByLabel(currentProgressItems);
  const sectionRows = parseSectionProgressRows(planText);
  const sectionAverageExact = averagePercent(sectionRows);
  const sectionAverageRounded = Math.round(sectionAverageExact);
  const sectionAverageNearestFive = Math.round(sectionAverageExact / 5) * 5;
  const overallPercent = requiredCurrentPercent(progressByLabel, "Overall full human-movement engine");
  const statedSectionAverage = requiredCurrentPercent(progressByLabel, "Average progress across the 15 plan sections");
  const failures = [];

  if (sectionRows.length !== EXPECTED_SECTION_COUNT) {
    failures.push(`expected ${EXPECTED_SECTION_COUNT} section progress rows, got ${sectionRows.length}`);
  }
  if (overallPercent === null) {
    failures.push("missing current progress estimate: Overall full human-movement engine");
  }
  if (statedSectionAverage === null) {
    failures.push("missing current progress estimate: Average progress across the 15 plan sections");
  } else if (Math.abs(statedSectionAverage - sectionAverageNearestFive) > 1) {
    failures.push(`expected stated section average about ${sectionAverageNearestFive}%, got ${statedSectionAverage}%`);
  }
  if (overallPercent !== null && overallPercent >= sectionAverageNearestFive) {
    failures.push(`expected overall full human-movement progress to stay below section average until production support catches up, got ${overallPercent}% vs about ${sectionAverageNearestFive}%`);
  }
  if (overallPercent !== null && overallPercent <= matrix.productionFamilySupportPercent) {
    failures.push(`expected overall full human-movement progress to stay above production family support, got ${overallPercent}% vs ${matrix.productionFamilySupportPercent}%`);
  }
  (matrix.futureFamilyShapeFailures ?? []).forEach((failure) => {
    failures.push(`future-family support matrix shape drift: ${failure}`);
  });

  const internalRows = matrix.rows.filter((row) => row.category !== "user-facing");
  const highlightedBlockers = internalRows
    .filter((row) => ["sitting", "walking", "root-travel", "facing-occlusion"].includes(row.family))
    .map((row) => ({
      blockers: row.blockers,
      family: row.family,
      nextAction: row.nextAction,
    }));

  return {
    explanation: "Overall progress is a stricter full human-movement product estimate, not the average of architecture phases. It stays below the section average because most movement families are still internal preview/diagnostic and production support is 5/19.",
    failures,
    matrix: {
      blockedUserFacingFamilies: matrix.blockedUserFacingFamilies,
      familyCount: matrix.familyCount,
      futureFamilyShapeFailures: matrix.futureFamilyShapeFailures ?? [],
      internalFamilyCount: matrix.internalFamilyCount,
      productionFamilySupportPercent: matrix.productionFamilySupportPercent,
      userFacingCount: matrix.userFacingCount,
    },
    ok: failures.length === 0,
    progress: {
      overallPercent,
      sectionAverageExact: Number(sectionAverageExact.toFixed(1)),
      sectionAverageNearestFive,
      sectionAverageRounded,
      statedSectionAverage,
    },
    sectionRows,
    highlightedBlockers,
  };
}

export function formatMovementRoadmapProgressReport(report) {
  const lines = [
    "# Movement Roadmap Progress Report",
    "",
    `Status: ${report.ok ? "ready" : "blocked"}`,
    `Overall full human-movement engine: ${report.progress.overallPercent ?? "missing"}%`,
    `Average section progress: ${report.progress.sectionAverageExact}% (about ${report.progress.sectionAverageNearestFive}%)`,
    `Movement-family production support: ${report.matrix.userFacingCount}/${report.matrix.familyCount} (${report.matrix.productionFamilySupportPercent}%)`,
    `Internal preview/diagnostic families: ${report.matrix.internalFamilyCount}/${report.matrix.familyCount}`,
    `Blocked current user-facing families: ${report.matrix.blockedUserFacingFamilies.join(", ") || "none"}`,
    `Future-family shape failures: ${report.matrix.futureFamilyShapeFailures.length}`,
    "",
    report.explanation,
    "",
    "## Section Progress",
    "",
    "| Phase | Section | Progress |",
    "| --- | --- | --- |",
    ...report.sectionRows.map((row) => `| ${row.phase} | ${row.title.replaceAll("|", "\\|")} | ${row.percent}% |`),
    "",
    "## Current Family Blockers",
    "",
    ...report.highlightedBlockers.map((row) => (
      `- ${row.family}: ${row.blockers.length > 0 ? row.blockers.join("; ") : "none"}; next: ${row.nextAction}`
    )),
    "",
  ];

  if (report.failures.length > 0) {
    lines.push("## Failures", "", ...report.failures.map((failure) => `- ${failure}`), "");
  }

  return lines.join("\n");
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
  const args = parseMovementRoadmapProgressReportArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const planText = await readFile(path.resolve(args.planPath), "utf8");
  const matrix = await buildCurrentSupportMatrix();
  const report = buildMovementRoadmapProgressReport({ matrix, planText });
  const markdown = formatMovementRoadmapProgressReport(report);

  if (args.write) {
    await writeJsonFile(args.outPath, report);
    await writeTextFile(args.markdownOutPath, markdown);
  }

  console.log(args.json ? JSON.stringify(report, null, 2) : markdown);
  if (!args.json && args.write) {
    console.log(`Wrote ${args.outPath}`);
    console.log(`Wrote ${args.markdownOutPath}`);
  }
  if (args.strict && !report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
