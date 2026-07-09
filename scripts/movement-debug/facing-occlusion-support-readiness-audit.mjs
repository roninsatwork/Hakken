#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  recordingGapPlanForRows,
  recordingGapPlanSummaryText,
  recordingGapProtocolText,
  recordingGapTopGroupsText,
} from "./recording-gap-plan.mjs";

const DEFAULT_ANALYSIS_PATH = "tmp/movement-replay-lab/current-analysis-reviewed.json";
const DEFAULT_GAME_VISUAL_PLAN_PATH = "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-plan.json";
const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const DEFAULT_RECORDING_PLAN_OUT_PATH = "tmp/movement-replay-lab/current-facing-occlusion-recording-plan.json";
const DEFAULT_SEMANTIC_REVIEW_PATH = "tmp/movement-replay-lab/current-facing-occlusion-game-visual-proof-review-decisions.codex-semantic-review.json";

export const FACING_OCCLUSION_SUPPORT_REQUIREMENTS = {
  family: "facing-occlusion",
  gameProofCases: [
    "strongest-facing-occlusion-recovery",
    "strongest-side-swap-recovery",
  ],
  recordedEvidenceRequirements: [
    "recorded fallback/readability proof",
    "side-swap recovery evidence",
    "self-occlusion recovery evidence",
  ],
  recordedProofCases: [
    "facing-occlusion-recovery",
    "side-swap-recovery",
    "self-occlusion-recovery",
  ],
};

function printHelp() {
  console.log(`Audit whether facing/occlusion is ready for a user-facing support claim.

Usage:
  npm run movement:facing-occlusion-support-audit
  npm run movement:facing-occlusion-support-audit -- --strict

Options:
  --analysis <file>          Reviewed replay analysis. Defaults to ${DEFAULT_ANALYSIS_PATH}
  --manifest <file>          Reviewed proof manifest. Defaults to ${DEFAULT_MANIFEST_PATH}
  --game-visual-plan <file>  Focused facing/occlusion Game visual target plan. Defaults to ${DEFAULT_GAME_VISUAL_PLAN_PATH}
  --semantic-review <file>   Focused facing/occlusion Game semantic review decisions. Defaults to ${DEFAULT_SEMANTIC_REVIEW_PATH}
  --recording-plan-out <f>   Write the support recording-gap plan used by quick validation. Defaults to ${DEFAULT_RECORDING_PLAN_OUT_PATH}
  --no-recording-plan-out    Do not write the support recording-gap plan.
  --strict                   Exit non-zero when facing/occlusion support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseFacingOcclusionSupportReadinessAuditArgs(argv) {
  const args = {
    analysisPath: DEFAULT_ANALYSIS_PATH,
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
    } else if (arg === "--analysis") {
      args.analysisPath = argv[++index] || args.analysisPath;
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

async function readJsonIfPresent(filePath) {
  if (!filePath || !existsSync(path.resolve(filePath))) return null;
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

function coverageSummary(analysis) {
  const sessions = Array.isArray(analysis) ? analysis : [];
  return sessions.find((session) => session.coverage?.summary)?.coverage?.summary ?? null;
}

function rowsByProofCase(manifest) {
  return (manifest?.rows ?? []).reduce((groups, row) => {
    const proofCase = row?.proofCase;
    if (!proofCase) return groups;
    groups[proofCase] ??= [];
    groups[proofCase].push(row);
    return groups;
  }, {});
}

function countByStatus(rows) {
  return rows.reduce((counts, row) => {
    const status = row?.status || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function proofCaseSummary(manifest, proofCases) {
  const groups = rowsByProofCase(manifest);
  return Object.fromEntries(
    proofCases.map((proofCase) => [
      proofCase,
      countByStatus(groups[proofCase] ?? []),
    ]),
  );
}

function passedRowsForCase(groups, proofCase) {
  return (groups[proofCase] ?? []).filter((row) => row.status === "passed");
}

function automatedEvidenceRowsForCase(groups, proofCase) {
  return (groups[proofCase] ?? []).filter((row) => (
    row.status !== "product-scope-limitation" &&
    (
      row.automatedStatus === "passed" ||
      ((row.evidenceFrameCount ?? 0) > 0 && row.proofBlockerCode !== "missing-analyzer-proof")
    )
  ));
}

function recordingIdsForRows(rows) {
  return Array.from(new Set(
    rows
      .map((row) => row.recordingId)
      .filter(Boolean),
  )).sort((left, right) => String(left).localeCompare(String(right)));
}

function commonRecordingIdsForProofCases(groups, proofCases, rowsForCase) {
  const [firstProofCase, ...remainingProofCases] = proofCases;
  if (!firstProofCase) return [];

  const firstRecordingIds = recordingIdsForRows(rowsForCase(groups, firstProofCase));
  return firstRecordingIds.filter((recordingId) => remainingProofCases.every((proofCase) => (
    rowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
  )));
}

function evidenceRequirementForProofCase(proofCase) {
  const index = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases.indexOf(proofCase);
  return FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedEvidenceRequirements[index] ?? proofCase;
}

function planProofCases(gameVisualPlan) {
  return Array.isArray(gameVisualPlan?.summary?.proofCases)
    ? gameVisualPlan.summary.proofCases
    : Array.from(new Set([
        ...(gameVisualPlan?.sessions ?? []).flatMap((session) => session.proofCases ?? []),
        ...(gameVisualPlan?.captures ?? []).flatMap((capture) => capture?.target?.cases ?? []),
      ])).sort();
}

function readableCases(semanticReview) {
  return Array.from(new Set(
    (semanticReview?.decisions ?? [])
      .filter((decision) => decision.decision === "readable-pass")
      .flatMap((decision) => decision.reviewContext?.cases ?? []),
  )).sort();
}

function syntheticRecordingGapRows(proofCases) {
  return proofCases.map((proofCase) => ({
    nextAction: "Capture a focused facing/occlusion recovery recording before changing product truth.",
    proofBlockerCode: "no-candidate-amplitude",
    proofCase,
    recordingId: "",
    status: "missing-proof",
    statusReason: `${evidenceRequirementForProofCase(proofCase)} is missing for facing/occlusion promotion.`,
  }));
}

function recordingGapSummaryForRows(rows, options = {}) {
  const plan = recordingGapPlanForRows(rows, {
    omitRecordingPlanInQuickValidationCommand: true,
    recordingPlanPath: options.recordingPlanPath,
  });
  return {
    captureScenarios: plan.captureScenarios,
    plan,
    planPath: options.recordingPlanPath ?? "",
    summary: plan.summary,
    summaryText: recordingGapPlanSummaryText(plan),
    topGroupsText: recordingGapTopGroupsText(plan),
  };
}

export function auditFacingOcclusionSupportReadiness({
  analysis = [],
  gameVisualPlan = null,
  manifest = null,
  recordingPlanPath = DEFAULT_RECORDING_PLAN_OUT_PATH,
  semanticReview = null,
} = {}) {
  const summary = coverageSummary(analysis);
  const userFacing = summary?.userFacingFamilies?.includes("facing-occlusion") ?? false;
  const internalDiagnostic = summary?.internalDemoOnlyFamilies?.includes("facing-occlusion") ?? false;
  const groups = rowsByProofCase(manifest);
  const presentRecordedProofCases = new Set(Object.keys(groups));
  const plannedCases = planProofCases(gameVisualPlan);
  const readable = readableCases(semanticReview);
  const missingRecordedManifestProofCases = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases
    .filter((proofCase) => !presentRecordedProofCases.has(proofCase));
  const missingRecordedPassedProofCases = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases
    .filter((proofCase) => passedRowsForCase(groups, proofCase).length === 0);
  const missingAnalyzerProofCases = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases
    .filter((proofCase) => automatedEvidenceRowsForCase(groups, proofCase).length === 0);
  const missingGamePlanCases = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.gameProofCases
    .filter((proofCase) => !plannedCases.includes(proofCase));
  const missingReadableGameCases = FACING_OCCLUSION_SUPPORT_REQUIREMENTS.gameProofCases
    .filter((proofCase) => !readable.includes(proofCase));
  const missingRecordedEvidenceRequirements = missingRecordedPassedProofCases
    .map(evidenceRequirementForProofCase);
  const recordedReviewCandidateIds = commonRecordingIdsForProofCases(
    groups,
    FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases,
    automatedEvidenceRowsForCase,
  );
  const recordedReviewPendingCases = missingRecordedPassedProofCases
    .filter((proofCase) => automatedEvidenceRowsForCase(groups, proofCase).length > 0);
  const recordingGapRows = missingAnalyzerProofCases.length > 0
    ? syntheticRecordingGapRows(missingAnalyzerProofCases)
    : [];
  const recordingGap = recordingGapSummaryForRows(recordingGapRows, { recordingPlanPath });
  const passingRecordingIds = commonRecordingIdsForProofCases(
    groups,
    FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases,
    passedRowsForCase,
  );
  const proofReadyForPromotion =
    passingRecordingIds.length > 0 &&
    missingRecordedManifestProofCases.length === 0 &&
    missingRecordedPassedProofCases.length === 0 &&
    missingRecordedEvidenceRequirements.length === 0 &&
    missingGamePlanCases.length === 0 &&
    missingReadableGameCases.length === 0;
  const nextActions = [];
  if (missingAnalyzerProofCases.length > 0) {
    nextActions.push("Record movement-proof-facing-occlusion-recovery with fallback/readability, side-swap recovery, and self-occlusion recovery beats.");
  }
  if (recordedReviewCandidateIds.length > 0 && missingRecordedPassedProofCases.length > 0) {
    nextActions.push(`Review existing facing/occlusion candidate recording(s) ${recordedReviewCandidateIds.join(", ")} and convert the recorded proof rows from manual-review to passed only if Replay visual/source review confirms them.`);
  } else if (missingRecordedPassedProofCases.length > 0) {
    nextActions.push("Capture reviewed replay proof for the facing/occlusion recovery cases before changing product truth.");
  }
  if (missingGamePlanCases.length > 0) {
    nextActions.push("Add focused Game visual target selection for facing/occlusion recovery.");
  }
  if (missingReadableGameCases.length > 0) {
    nextActions.push("Complete readable focused Game semantic review for facing/occlusion recovery.");
  }
  if (nextActions.length === 0) {
    nextActions.push(proofReadyForPromotion && !userFacing
      ? "Recorded Replay proof and focused Game proof are closed; keep facing/occlusion diagnostic-only until a deliberate product-truth promotion decision is made."
      : "Keep facing/occlusion diagnostic-only until coverage product truth, recorded proof, Game proof, and the strict audit all agree.");
  }
  const ready = userFacing && proofReadyForPromotion;

  return {
    decision: ready
      ? "Facing/occlusion is ready for a user-facing support claim."
      : proofReadyForPromotion
        ? "Facing/occlusion proof is ready for promotion review, but coverage product truth still keeps it diagnostic-only."
      : "Keep facing/occlusion diagnostic-only; robust recovery proof is not ready for product support.",
    family: "facing-occlusion",
    internalDiagnostic,
    missingAnalyzerProofCases,
    missingGamePlanCases,
    missingReadableGameCases,
    missingRecordedEvidenceRequirements,
    missingRecordedManifestProofCases,
    missingRecordedPassedProofCases,
    nextActions: [
      ...nextActions,
    ],
    passingRecordingIds,
    plannedCases,
    proofReadyForPromotion,
    proofCaseSummary: proofCaseSummary(manifest, FACING_OCCLUSION_SUPPORT_REQUIREMENTS.recordedProofCases),
    readableCases: readable,
    recordedReviewCandidateIds,
    recordedReviewPendingCases,
    recordingGap,
    ready,
    requirements: FACING_OCCLUSION_SUPPORT_REQUIREMENTS,
    userFacing,
  };
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "none";
}

export function formatFacingOcclusionSupportReadiness(audit) {
  const lines = [
    `Facing/occlusion support readiness: ${audit.ready ? "ready" : "blocked"}`,
    `Decision: ${audit.decision}`,
    `Coverage state: ${audit.userFacing ? "user-facing" : audit.internalDiagnostic ? "internal diagnostic/demo-only" : "not found in reviewed coverage"}`,
    `Proof ready for promotion review: ${audit.proofReadyForPromotion ? "yes" : "no"}`,
    `Missing recorded evidence: ${formatList(audit.missingRecordedEvidenceRequirements)}`,
    `Missing analyzer proof cases: ${formatList(audit.missingAnalyzerProofCases)}`,
    `Missing Game plan cases: ${formatList(audit.missingGamePlanCases)}`,
    `Missing readable Game cases: ${formatList(audit.missingReadableGameCases)}`,
    `Recorded review candidates: ${formatList(audit.recordedReviewCandidateIds)}`,
    `Next actions: ${audit.nextActions.join(" ")}`,
  ];

  if (audit.recordingGap?.summary?.totalRows > 0) {
    lines.push(`Recording gap plan: ${audit.recordingGap.summaryText}`);
    lines.push(`Recording gap top groups: ${audit.recordingGap.topGroupsText}`);
    audit.recordingGap.captureScenarios?.slice(0, 2).forEach((scenario) => {
      lines.push(`Fresh recording scenario: ${scenario.freshRecordingLabel || scenario.id}`);
      lines.push(`Protocol: ${recordingGapProtocolText(scenario.protocol ?? scenario)}`);
      lines.push(`Quick validation: ${scenario.quickValidationScriptCommand || scenario.quickValidationCommand}`);
    });
  }

  return lines.join("\n");
}

async function main() {
  const args = parseFacingOcclusionSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const audit = auditFacingOcclusionSupportReadiness({
    analysis: await readJsonIfPresent(args.analysisPath) ?? [],
    gameVisualPlan: await readJsonIfPresent(args.gameVisualPlanPath),
    manifest: await readJsonIfPresent(args.manifestPath),
    recordingPlanPath: args.recordingPlanOutPath,
    semanticReview: await readJsonIfPresent(args.semanticReviewPath),
  });
  if (args.recordingPlanOutPath) {
    await mkdir(path.dirname(args.recordingPlanOutPath), { recursive: true });
    await writeFile(args.recordingPlanOutPath, `${JSON.stringify(audit.recordingGap?.plan, null, 2)}\n`, "utf8");
  }

  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatFacingOcclusionSupportReadiness(audit));
  }

  if (args.strict && !audit.ready) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
