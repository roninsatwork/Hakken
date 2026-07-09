#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { auditRootTurnSupportClaim } from "./root-turn-support-claim-audit.mjs";
import { auditRootTravelSupportReadiness } from "./root-travel-support-readiness-audit.mjs";
import { auditFacingOcclusionSupportReadiness } from "./facing-occlusion-support-readiness-audit.mjs";
import {
  futureFamilySupportAuditShapeForFamily,
  FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES,
} from "./future-family-support-audit-shapes.mjs";
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
const DEFAULT_FACING_ANALYSIS_PATH = "tmp/movement-replay-lab/facing-occlusion-recovery-scenario-reviewed-smoke.json";
const DEFAULT_FACING_GAME_PLAN_PATH = "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-plan.json";
const DEFAULT_FACING_MANIFEST_PATH = "tmp/movement-replay-lab/facing-occlusion-recovery-scenario-reviewed-smoke.proof-manifest.json";
const DEFAULT_FACING_REVIEW_PATH = "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_SITTING_MANIFEST_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.reviewed.proof-manifest.json";
const DEFAULT_SITTING_GAME_PLAN_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json";
const DEFAULT_SITTING_REVIEW_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_OUT_PATH = "tmp/movement-replay-lab/current-support-readiness-matrix.json";
const DEFAULT_MARKDOWN_OUT_PATH = "tmp/movement-replay-lab/current-support-readiness-matrix.md";

export const SUPPORT_READINESS_MATRIX_DEFAULT_PATHS = {
  analysisPath: DEFAULT_ANALYSIS_PATH,
  broadGamePlanPath: DEFAULT_BROAD_GAME_PLAN_PATH,
  broadReviewPath: DEFAULT_BROAD_REVIEW_PATH,
  facingAnalysisPath: DEFAULT_FACING_ANALYSIS_PATH,
  facingGamePlanPath: DEFAULT_FACING_GAME_PLAN_PATH,
  facingManifestPath: DEFAULT_FACING_MANIFEST_PATH,
  facingReviewPath: DEFAULT_FACING_REVIEW_PATH,
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
const STRICT_AUDIT_BY_AUDIT = {
  "movement:facing-occlusion-support-audit": "movement:facing-occlusion-support-audit:strict",
  "movement:root-travel-support-audit": "movement:root-travel-support-audit:strict",
  "movement:sitting-support-audit": "movement:sitting-support-audit:strict",
  "movement:walking-support-audit": "movement:walking-support-audit:strict",
};

const QUICK_VALIDATION_SCRIPT_BY_SCENARIO = {
  "movement-proof-facing-occlusion-recovery": "movement:proof:validate:facing-occlusion",
  "movement-proof-root-travel": "movement:proof:validate:root-travel",
  "movement-proof-seated-forward-fold": "movement:proof:validate:seated-forward-fold",
};

function quickValidationNextAction(support, fallback) {
  const scenario = support.recordingGap?.captureScenarios?.[0] ?? null;
  if (scenario?.quickValidationScriptCommand) return scenario.quickValidationScriptCommand;
  const scriptName = scenario?.quickValidationScript ?? QUICK_VALIDATION_SCRIPT_BY_SCENARIO[scenario?.freshRecordingLabel];
  if (scriptName) return `npm run ${scriptName}`;
  return scenario?.quickValidationCommand || fallback;
}

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
  --facing-analysis <file>   Focused facing/occlusion analysis. Defaults to ${DEFAULT_FACING_ANALYSIS_PATH}
  --facing-manifest <file>   Focused facing/occlusion proof manifest. Defaults to ${DEFAULT_FACING_MANIFEST_PATH}
  --facing-game-plan <file>  Focused facing/occlusion Game plan. Defaults to ${DEFAULT_FACING_GAME_PLAN_PATH}
  --facing-review <file>     Focused facing/occlusion semantic review. Defaults to ${DEFAULT_FACING_REVIEW_PATH}
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
    facingAnalysisPath: DEFAULT_FACING_ANALYSIS_PATH,
    facingGamePlanPath: DEFAULT_FACING_GAME_PLAN_PATH,
    facingManifestPath: DEFAULT_FACING_MANIFEST_PATH,
    facingReviewPath: DEFAULT_FACING_REVIEW_PATH,
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
    } else if (arg === "--facing-analysis") {
      args.facingAnalysisPath = argv[++index] || args.facingAnalysisPath;
    } else if (arg === "--facing-manifest") {
      args.facingManifestPath = argv[++index] || args.facingManifestPath;
    } else if (arg === "--facing-game-plan") {
      args.facingGamePlanPath = argv[++index] || args.facingGamePlanPath;
    } else if (arg === "--facing-review") {
      args.facingReviewPath = argv[++index] || args.facingReviewPath;
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
  const shape = futureFamilySupportAuditShapeForFamily(family);
  if (shape) {
    return {
      audit: "movement:future-family-support-audit-shapes",
      auditShape: {
        acceptableSupportClaim: shape.acceptableSupportClaim,
        fallbackRule: shape.fallbackRule,
        gameVisualCases: shape.gameVisualCases,
        recordedProofCases: shape.recordedProofCases,
      },
      blockers: [
        `recorded proof cases ${shape.recordedProofCases.join(",")}`,
        `Game visual cases ${shape.gameVisualCases.join(",")}`,
        "semantic review decisions",
        "dedicated support audit implementation",
        "strict npm alias",
        "architecture-guard readiness signal",
      ],
      category,
      family,
      nextAction: "Implement a dedicated support audit from the first-pass shape before promotion.",
      readyForUserFacing: false,
      strictAudit: "none",
    };
  }

  return {
    audit: "none",
    blockers: [...GENERIC_PREVIEW_BLOCKERS],
    category,
    family,
    nextAction: "Add recorded replay proof, Game visual proof, semantic review, and a dedicated support audit before promotion.",
    readyForUserFacing: false,
    strictAudit: "none",
  };
}

export function auditFutureFamilySupportAuditShapeRows(rows) {
  const failures = [];

  FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES.forEach((shape) => {
    const row = rows.find((candidate) => candidate.family === shape.family);
    const prefix = shape.family;
    if (!row) {
      failures.push(`${prefix} is missing from the support-readiness matrix`);
      return;
    }
    if (row.audit !== "movement:future-family-support-audit-shapes") {
      failures.push(`${prefix} must use movement:future-family-support-audit-shapes until it has a dedicated support audit`);
    }
    if (row.category !== "internal-preview") {
      failures.push(`${prefix} must remain internal-preview until a dedicated promotion audit is ready`);
    }
    if (row.readyForUserFacing !== false) {
      failures.push(`${prefix} must not be ready for user-facing support from a first-pass audit shape`);
    }
    if ((row.strictAudit ?? "none") !== "none") {
      failures.push(`${prefix} must not name a strict audit before a dedicated support audit exists`);
    }
    [
      `recorded proof cases ${shape.recordedProofCases.join(",")}`,
      `Game visual cases ${shape.gameVisualCases.join(",")}`,
      "semantic review decisions",
      "dedicated support audit implementation",
      "strict npm alias",
      "architecture-guard readiness signal",
    ]
      .filter((blocker) => !row.blockers.includes(blocker))
      .forEach((blocker) => failures.push(`${prefix} is missing blocker: ${blocker}`));
    if (JSON.stringify(row.auditShape) !== JSON.stringify({
      acceptableSupportClaim: shape.acceptableSupportClaim,
      fallbackRule: shape.fallbackRule,
      gameVisualCases: shape.gameVisualCases,
      recordedProofCases: shape.recordedProofCases,
    })) {
      failures.push(`${prefix} audit shape does not match the source-backed future-family shape`);
    }
  });

  return {
    failures,
    ok: failures.length === 0,
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
    strictAudit: STRICT_AUDIT_BY_AUDIT[audit] ?? "none",
  };
}

function sittingRow(sittingSupport, category) {
  const audit = "movement:sitting-support-audit";
  return {
    audit,
    blockers: [
      ...sittingSupport.missingAnalyzerProofCases.map((proofCase) => `analyzer ${proofCase}`),
      ...sittingSupport.missingRecordedPassedProofCases.map((proofCase) => `recorded passed ${proofCase}`),
      ...sittingSupport.missingGamePlanCases.map((proofCase) => `Game plan ${proofCase}`),
      ...sittingSupport.missingReadableGameCases.map((proofCase) => `Game readability ${proofCase}`),
    ],
    category,
    family: "sitting",
    nextAction: quickValidationNextAction(sittingSupport, "Record and validate seated-forward-fold proof."),
    readyForUserFacing: sittingSupport.ready,
    strictAudit: STRICT_AUDIT_BY_AUDIT[audit],
  };
}

function locomotionBlockers(support) {
  return [
    ...support.missingAnalyzerProofCases.map((proofCase) => `analyzer ${proofCase}`),
    ...support.missingRecordedPassedProofCases.map((proofCase) => `recorded passed ${proofCase}`),
    ...support.missingGamePlanCases.map((proofCase) => `Game plan ${proofCase}`),
    ...support.missingReadableGameCases.map((proofCase) => `Game readability ${proofCase}`),
  ];
}

function rootTravelRow(rootTravelSupport, category) {
  const audit = "movement:root-travel-support-audit";
  return {
    audit,
    blockers: locomotionBlockers(rootTravelSupport),
    category,
    family: "root-travel",
    nextAction: quickValidationNextAction(rootTravelSupport, "Record and validate root-travel proof."),
    readyForUserFacing: rootTravelSupport.ready,
    strictAudit: STRICT_AUDIT_BY_AUDIT[audit],
  };
}

function walkingRow(walkingSupport, category) {
  const audit = "movement:walking-support-audit";
  const blockers = [
    ...locomotionBlockers(walkingSupport),
  ];
  const nextAction = quickValidationNextAction(walkingSupport, "Record and validate root-travel proof.");

  return {
    audit,
    blockers,
    category,
    family: "walking",
    nextAction,
    readyForUserFacing: walkingSupport.ready,
    strictAudit: STRICT_AUDIT_BY_AUDIT[audit],
  };
}

function facingOcclusionRow(facingOcclusionSupport, category) {
  const audit = "movement:facing-occlusion-support-audit";
  const proofReadyInternalBlocker = facingOcclusionSupport.proofReadyForPromotion &&
    !facingOcclusionSupport.userFacing
    ? ["coverage product truth is still internal diagnostic"]
    : [];
  return {
    audit,
    blockers: [
      ...facingOcclusionSupport.missingRecordedEvidenceRequirements,
      ...facingOcclusionSupport.missingGamePlanCases.map((proofCase) => `Game plan ${proofCase}`),
      ...facingOcclusionSupport.missingReadableGameCases.map((proofCase) => `Game readability ${proofCase}`),
      ...proofReadyInternalBlocker,
    ],
    category,
    family: "facing-occlusion",
    nextAction: quickValidationNextAction(
      facingOcclusionSupport,
      facingOcclusionSupport.nextActions[0] ??
        "Keep diagnostic-only until recorded fallback/readability proof exists.",
    ),
    readyForUserFacing: facingOcclusionSupport.ready,
    strictAudit: STRICT_AUDIT_BY_AUDIT[audit],
  };
}

export function buildSupportReadinessMatrix({
  analysis,
  broadGameVisualPlan = null,
  broadSemanticReview = null,
  facingAnalysis = null,
  facingGameVisualPlan = {},
  facingManifest = null,
  facingSemanticReview = {},
  gameCaptureManifest,
  generatedAt = new Date().toISOString(),
  manifest,
  semanticReview,
  sittingGameVisualPlan = {},
  sittingManifest = {},
  sittingSemanticReview = {},
}) {
  const coverageProductTruth = summarizeCoverageProductTruth(analysis);
  const facingOcclusion = auditFacingOcclusionSupportReadiness({
    analysis: facingAnalysis ?? analysis,
    gameVisualPlan: facingGameVisualPlan,
    manifest: facingManifest ?? manifest,
    semanticReview: facingSemanticReview,
  });
  const rootTurn = auditRootTurnSupportClaim({ manifest, semanticReview });
  const rootTravel = auditRootTravelSupportReadiness({
    gameVisualPlan: gameCaptureManifest,
    manifest,
    semanticReview,
  });
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
  addRow(rootTravelRow(rootTravel, supportCategory("root-travel", coverageProductTruth)));
  addRow(walkingRow(walking, supportCategory("walking", coverageProductTruth)));
  addRow(facingOcclusionRow(facingOcclusion, supportCategory("facing-occlusion", coverageProductTruth)));

  ALL_FAMILIES.forEach((family) => {
    if (rowByFamily.has(family)) return;
    const category = supportCategory(family, coverageProductTruth);
    const row = genericPreviewRow(family, category);
    addRow(row);
  });

  const rows = ALL_FAMILIES.map((family) => rowByFamily.get(family));
  const userFacingRows = rows.filter((row) => row.category === "user-facing");
  const internalRows = rows.filter((row) => row.category !== "user-facing");
  const blockedUserFacingRows = userFacingRows.filter((row) => !row.readyForUserFacing);
  const productionFamilySupportPercent = Math.round((userFacingRows.length / Math.max(rows.length, 1)) * 100);
  const futureFamilyShapeRows = auditFutureFamilySupportAuditShapeRows(rows);

  return {
    blockedInternalFamilies: internalRows.map((row) => row.family),
    blockedUserFacingFamilies: blockedUserFacingRows.map((row) => row.family),
    coverageProductTruth,
    familyCount: rows.length,
    futureFamilyShapeFailures: futureFamilyShapeRows.failures,
    generatedAt,
    internalFamilyCount: internalRows.length,
    productionFamilySupportPercent,
    ready: blockedUserFacingRows.length === 0 && coverageProductTruth.found && futureFamilyShapeRows.ok,
    rows,
    userFacingCount: userFacingRows.length,
  };
}

export function supportReadinessStrictFailure(matrix) {
  if (matrix.ready) return "";
  if (matrix.futureFamilyShapeFailures?.length > 0) {
    return `Movement support readiness matrix has future-family shape drift: ${matrix.futureFamilyShapeFailures.join("; ")}.`;
  }
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
    `Future-family shape failures: ${matrix.futureFamilyShapeFailures?.length ?? 0}`,
    "",
    "| Family | Category | Ready | Audit | Strict audit | Blockers | Next action |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...matrix.rows.map((row) => [
      row.family,
      row.category,
      row.readyForUserFacing ? "yes" : "no",
      row.audit,
      row.strictAudit ?? "none",
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
    facingAnalysis: await readJsonIfPresent(args.facingAnalysisPath),
    facingGameVisualPlan: await readJsonIfPresent(args.facingGamePlanPath) ?? {},
    facingManifest: await readJsonIfPresent(args.facingManifestPath),
    facingSemanticReview: await readJsonIfPresent(args.facingReviewPath) ?? {},
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
