#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { auditRootTurnSupportClaim } from "./root-turn-support-claim-audit.mjs";
import { auditSittingSupportReadiness } from "./sitting-support-readiness-audit.mjs";
import { auditSquatKneeLiftSupportClaim } from "./squat-knee-lift-support-claim-audit.mjs";
import {
  auditUpperBodyStandingSupportReadiness,
  mergeGameVisualPlans,
  mergeSemanticReviews,
} from "./upper-body-standing-support-readiness-audit.mjs";
import { auditWalkingSupportReadiness } from "./walking-support-readiness-audit.mjs";

const DEFAULT_ANALYSIS_PATH = "tmp/movement-replay-lab/current-analysis-reviewed.json";
const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const DEFAULT_GAME_REVIEW_PATH = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_GAME_CAPTURE_MANIFEST_PATH = "tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json";
const DEFAULT_BROAD_GAME_PLAN_PATH = "tmp/movement-replay-lab/current-game-visual-proof-plan.broad-upper-body.json";
const DEFAULT_BROAD_REVIEW_PATH = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.broad-upper-body.codex-semantic-review.json";
const DEFAULT_SITTING_MANIFEST_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.reviewed.proof-manifest.json";
const DEFAULT_SITTING_GAME_PLAN_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json";
const DEFAULT_SITTING_REVIEW_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_OUT_PATH = "tmp/movement-replay-lab/current-support-readiness-matrix.json";
const DEFAULT_MARKDOWN_OUT_PATH = "tmp/movement-replay-lab/current-support-readiness-matrix.md";

export const SUPPORT_READINESS_MATRIX_DEFAULT_PATHS = {
  analysisPath: DEFAULT_ANALYSIS_PATH,
  broadGamePlanPath: DEFAULT_BROAD_GAME_PLAN_PATH,
  broadReviewPath: DEFAULT_BROAD_REVIEW_PATH,
  gameCaptureManifestPath: DEFAULT_GAME_CAPTURE_MANIFEST_PATH,
  gameReviewPath: DEFAULT_GAME_REVIEW_PATH,
  manifestPath: DEFAULT_MANIFEST_PATH,
  sittingGamePlanPath: DEFAULT_SITTING_GAME_PLAN_PATH,
  sittingManifestPath: DEFAULT_SITTING_MANIFEST_PATH,
  sittingReviewPath: DEFAULT_SITTING_REVIEW_PATH,
};

const ALL_FAMILIES = [
  "upright",
  "upper-body-standing",
  "standing-side-bend-head-direction",
  "squat-knee-lift",
  "facing-occlusion",
  "root-turn",
  "root-travel",
  "walking",
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "sitting",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];

const GENERIC_PREVIEW_BLOCKERS = [
  "recorded replay analyzer proof",
  "recorded replay visual capture",
  "Game Studio parity proof",
  "dedicated support audit",
];

export function summarizeCoverageProductTruth(analysis) {
  const sessions = Array.isArray(analysis) ? analysis : [];
  const summary = sessions.find((session) => session.coverage?.summary)?.coverage?.summary ?? null;

  return {
    found: Boolean(summary),
    internalDemoOnlyFamilies: summary?.internalDemoOnlyFamilies ?? [],
    missingProofFamilies: summary?.missingProofFamilies ?? [],
    userFacingFamilies: summary?.userFacingFamilies ?? [],
  };
}

function printHelp() {
  console.log(`Build a movement-family support readiness matrix.

Usage:
  npm run movement:support-readiness-matrix
  npm run movement:support-readiness-matrix -- --json --no-write

Options:
  --analysis <file>          Reviewed replay analysis. Defaults to ${DEFAULT_ANALYSIS_PATH}
  --manifest <file>          Reviewed proof manifest. Defaults to ${DEFAULT_MANIFEST_PATH}
  --game-review <file>       Game semantic review decisions. Defaults to ${DEFAULT_GAME_REVIEW_PATH}
  --game-captures <file>     Game capture manifest. Defaults to ${DEFAULT_GAME_CAPTURE_MANIFEST_PATH}
  --broad-game-plan <file>   Supplemental broad upper-body Game plan. Defaults to ${DEFAULT_BROAD_GAME_PLAN_PATH}
  --broad-review <file>      Supplemental broad upper-body semantic review. Defaults to ${DEFAULT_BROAD_REVIEW_PATH}
  --sitting-manifest <file>  Focused sitting proof manifest. Defaults to ${DEFAULT_SITTING_MANIFEST_PATH}
  --sitting-game-plan <file> Focused sitting Game plan. Defaults to ${DEFAULT_SITTING_GAME_PLAN_PATH}
  --sitting-review <file>    Focused sitting semantic review. Defaults to ${DEFAULT_SITTING_REVIEW_PATH}
  --out <file>               JSON output. Defaults to ${DEFAULT_OUT_PATH}
  --markdown-out <file>      Markdown output. Defaults to ${DEFAULT_MARKDOWN_OUT_PATH}
  --no-write                 Do not write JSON/Markdown outputs.
  --strict                   Exit non-zero if any current user-facing family lacks passing support proof.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseSupportReadinessMatrixArgs(argv) {
  const args = {
    analysisPath: DEFAULT_ANALYSIS_PATH,
    broadGamePlanPath: DEFAULT_BROAD_GAME_PLAN_PATH,
    broadReviewPath: DEFAULT_BROAD_REVIEW_PATH,
    gameCaptureManifestPath: DEFAULT_GAME_CAPTURE_MANIFEST_PATH,
    gameReviewPath: DEFAULT_GAME_REVIEW_PATH,
    help: false,
    json: false,
    manifestPath: DEFAULT_MANIFEST_PATH,
    markdownOutPath: DEFAULT_MARKDOWN_OUT_PATH,
    outPath: DEFAULT_OUT_PATH,
    sittingGamePlanPath: DEFAULT_SITTING_GAME_PLAN_PATH,
    sittingManifestPath: DEFAULT_SITTING_MANIFEST_PATH,
    sittingReviewPath: DEFAULT_SITTING_REVIEW_PATH,
    strict: false,
    write: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--game-review") {
      args.gameReviewPath = argv[++index] || args.gameReviewPath;
    } else if (arg === "--game-captures") {
      args.gameCaptureManifestPath = argv[++index] || args.gameCaptureManifestPath;
    } else if (arg === "--broad-game-plan") {
      args.broadGamePlanPath = argv[++index] || args.broadGamePlanPath;
    } else if (arg === "--broad-review") {
      args.broadReviewPath = argv[++index] || args.broadReviewPath;
    } else if (arg === "--sitting-manifest") {
      args.sittingManifestPath = argv[++index] || args.sittingManifestPath;
    } else if (arg === "--sitting-game-plan") {
      args.sittingGamePlanPath = argv[++index] || args.sittingGamePlanPath;
    } else if (arg === "--sitting-review") {
      args.sittingReviewPath = argv[++index] || args.sittingReviewPath;
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

async function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function readRequiredJson(filePath, label) {
  const value = await readJsonIfPresent(filePath);
  if (!value) throw new Error(`Missing ${label}: ${filePath}`);
  return value;
}

function supportCategory(family, coverageProductTruth) {
  if (coverageProductTruth.userFacingFamilies.includes(family)) return "user-facing";
  if (family === "facing-occlusion") return "internal-diagnostic";
  if (coverageProductTruth.internalDemoOnlyFamilies.includes(family)) return "internal-preview";
  return "unknown";
}

function genericPreviewRow(family, category) {
  return {
    audit: "none",
    blockers: [...GENERIC_PREVIEW_BLOCKERS],
    category,
    family,
    nextAction: "Add recorded replay proof, Game visual proof, semantic review, and a dedicated support audit before promotion.",
    readyForUserFacing: false,
  };
}

function supportedRow({
  audit,
  blocker = "",
  family,
  passingBundles = null,
  ready,
  source,
}) {
  return {
    audit,
    blockers: ready ? [] : [blocker || "support audit is blocked"],
    category: "user-facing",
    family,
    nextAction: ready ? "Keep proof artifacts fresh after motion/rendering changes." : "Reopen support claim before product copy expands.",
    passingBundles,
    readyForUserFacing: ready,
    source,
  };
}

function sittingRow(sittingSupport, category) {
  return {
    audit: "movement:sitting-support-audit",
    blockers: [
      ...sittingSupport.missingAnalyzerProofCases.map((proofCase) => `analyzer ${proofCase}`),
      ...sittingSupport.missingRecordedPassedProofCases.map((proofCase) => `recorded passed ${proofCase}`),
      ...sittingSupport.missingGamePlanCases.map((proofCase) => `Game plan ${proofCase}`),
      ...sittingSupport.missingReadableGameCases.map((proofCase) => `Game readability ${proofCase}`),
    ],
    category,
    family: "sitting",
    nextAction: sittingSupport.recordingGap?.captureScenarios?.[0]?.quickValidationCommand ||
      "Record and validate seated-forward-fold proof.",
    readyForUserFacing: sittingSupport.ready,
  };
}

function walkingRows(walkingSupport, coverageProductTruth) {
  const blockers = [
    ...walkingSupport.missingAnalyzerProofCases.map((proofCase) => `analyzer ${proofCase}`),
    ...walkingSupport.missingRecordedPassedProofCases.map((proofCase) => `recorded passed ${proofCase}`),
    ...walkingSupport.missingGamePlanCases.map((proofCase) => `Game plan ${proofCase}`),
    ...walkingSupport.missingReadableGameCases.map((proofCase) => `Game readability ${proofCase}`),
  ];
  const nextAction = walkingSupport.recordingGap?.captureScenarios?.[0]?.quickValidationCommand ||
    "Record and validate root-travel proof.";

  return ["root-travel", "walking"].map((family) => ({
    audit: "movement:walking-support-audit",
    blockers,
    category: supportCategory(family, coverageProductTruth),
    family,
    nextAction,
    readyForUserFacing: walkingSupport.ready,
  }));
}

export function buildSupportReadinessMatrix({
  analysis,
  broadGameVisualPlan = null,
  broadSemanticReview = null,
  gameCaptureManifest,
  generatedAt = new Date().toISOString(),
  manifest,
  semanticReview,
  sittingGameVisualPlan = {},
  sittingManifest = {},
  sittingSemanticReview = {},
}) {
  const coverageProductTruth = summarizeCoverageProductTruth(analysis);
  const rootTurn = auditRootTurnSupportClaim({ manifest, semanticReview });
  const squatKneeLift = auditSquatKneeLiftSupportClaim({ manifest, semanticReview });
  const upperBody = auditUpperBodyStandingSupportReadiness({
    gameVisualPlan: broadGameVisualPlan
      ? mergeGameVisualPlans([gameCaptureManifest, broadGameVisualPlan])
      : gameCaptureManifest,
    manifest,
    semanticReview: broadSemanticReview
      ? mergeSemanticReviews([semanticReview, broadSemanticReview])
      : semanticReview,
  });
  const sitting = auditSittingSupportReadiness({
    gameVisualPlan: sittingGameVisualPlan,
    manifest: sittingManifest,
    semanticReview: sittingSemanticReview,
  });
  const walking = auditWalkingSupportReadiness({
    gameVisualPlan: gameCaptureManifest,
    manifest,
    semanticReview,
  });

  const rowByFamily = new Map();
  const addRow = (row) => rowByFamily.set(row.family, row);
  addRow(supportedRow({
    audit: "built-in coverage truth",
    family: "upright",
    passingBundles: null,
    ready: coverageProductTruth.userFacingFamilies.includes("upright"),
    source: "coverageProductTruth",
  }));
  addRow(supportedRow({
    audit: "movement:upper-body-standing-support-audit",
    family: "standing-side-bend-head-direction",
    passingBundles: upperBody.narrowPassingCandidateCount ?? upperBody.narrowPassingCandidates?.length ?? null,
    ready: upperBody.narrowReady,
    source: "upperBodyStandingSupport.narrowReady",
  }));
  addRow(supportedRow({
    audit: "movement:upper-body-standing-support-audit",
    family: "upper-body-standing",
    passingBundles: upperBody.broadPassingRecordingCount ?? null,
    ready: upperBody.broadReady,
    source: "upperBodyStandingSupport.broadReady",
  }));
  addRow(supportedRow({
    audit: "movement:squat-knee-lift-support-audit",
    family: "squat-knee-lift",
    passingBundles: squatKneeLift.passingCandidateCount,
    ready: squatKneeLift.ok,
    source: "squatKneeLiftSupportClaim.ok",
  }));
  addRow(supportedRow({
    audit: "movement:root-turn-support-audit",
    family: "root-turn",
    passingBundles: rootTurn.passingCandidateCount,
    ready: rootTurn.ok,
    source: "rootTurnSupportClaim.ok",
  }));
  addRow(sittingRow(sitting, supportCategory("sitting", coverageProductTruth)));
  walkingRows(walking, coverageProductTruth).forEach(addRow);

  ALL_FAMILIES.forEach((family) => {
    if (rowByFamily.has(family)) return;
    const category = supportCategory(family, coverageProductTruth);
    const row = genericPreviewRow(family, category);
    if (category === "internal-diagnostic") {
      row.blockers = [
        "recorded fallback/readability proof",
        "side-swap and occlusion recovery evidence",
        "dedicated support audit before any product claim",
      ];
      row.nextAction = "Keep diagnostic-only until recorded fallback/readability proof exists.";
    }
    addRow(row);
  });

  const rows = ALL_FAMILIES.map((family) => rowByFamily.get(family));
  const userFacingRows = rows.filter((row) => row.category === "user-facing");
  const internalRows = rows.filter((row) => row.category !== "user-facing");
  const blockedUserFacingRows = userFacingRows.filter((row) => !row.readyForUserFacing);
  const productionFamilySupportPercent = Math.round((userFacingRows.length / Math.max(rows.length, 1)) * 100);

  return {
    blockedInternalFamilies: internalRows.map((row) => row.family),
    blockedUserFacingFamilies: blockedUserFacingRows.map((row) => row.family),
    coverageProductTruth,
    familyCount: rows.length,
    generatedAt,
    internalFamilyCount: internalRows.length,
    productionFamilySupportPercent,
    ready: blockedUserFacingRows.length === 0 && coverageProductTruth.found,
    rows,
    userFacingCount: userFacingRows.length,
  };
}

export function supportReadinessStrictFailure(matrix) {
  if (matrix.ready) return "";
  const blockers = matrix.blockedUserFacingFamilies.length > 0
    ? matrix.blockedUserFacingFamilies.join(", ")
    : "coverage product truth missing";
  return `Movement support readiness matrix is blocked for current user-facing families: ${blockers}.`;
}

export function formatSupportReadinessMatrix(matrix) {
  const lines = [
    "# Movement Support Readiness Matrix",
    "",
    `Status: ${matrix.ready ? "ready" : "blocked"}`,
    `User-facing production support: ${matrix.userFacingCount}/${matrix.familyCount} (${matrix.productionFamilySupportPercent}%)`,
    `Internal preview/diagnostic families: ${matrix.internalFamilyCount}/${matrix.familyCount}`,
    `Blocked current user-facing families: ${matrix.blockedUserFacingFamilies.length > 0 ? matrix.blockedUserFacingFamilies.join(", ") : "none"}`,
    "",
    "| Family | Category | Ready | Audit | Blockers | Next action |",
    "| --- | --- | --- | --- | --- | --- |",
    ...matrix.rows.map((row) => [
      row.family,
      row.category,
      row.readyForUserFacing ? "yes" : "no",
      row.audit,
      row.blockers.length > 0 ? row.blockers.join("; ") : "none",
      row.nextAction,
    ].map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")).map((line) => `| ${line} |`),
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
  const args = parseSupportReadinessMatrixArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const matrix = buildSupportReadinessMatrix({
    analysis: await readRequiredJson(args.analysisPath, "reviewed analysis"),
    broadGameVisualPlan: await readJsonIfPresent(args.broadGamePlanPath),
    broadSemanticReview: await readJsonIfPresent(args.broadReviewPath),
    gameCaptureManifest: await readRequiredJson(args.gameCaptureManifestPath, "Game capture manifest"),
    manifest: await readRequiredJson(args.manifestPath, "reviewed proof manifest"),
    semanticReview: await readRequiredJson(args.gameReviewPath, "Game semantic review"),
    sittingGameVisualPlan: await readJsonIfPresent(args.sittingGamePlanPath) ?? {},
    sittingManifest: await readJsonIfPresent(args.sittingManifestPath) ?? {},
    sittingSemanticReview: await readJsonIfPresent(args.sittingReviewPath) ?? {},
  });
  const markdown = formatSupportReadinessMatrix(matrix);

  if (args.write) {
    await writeJsonFile(args.outPath, matrix);
    await writeTextFile(args.markdownOutPath, markdown);
  }

  console.log(args.json ? JSON.stringify(matrix, null, 2) : markdown);
  if (!args.json && args.write) {
    console.log(`Wrote ${args.outPath}`);
    console.log(`Wrote ${args.markdownOutPath}`);
  }

  if (args.strict && !matrix.ready) {
    console.error(supportReadinessStrictFailure(matrix));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
