#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MOVEMENT_EXPANSION_HANDOFFS,
} from "./movement-expansion-preview-handoff.mjs";
import {
  recordingGapPlanForRows,
  recordingGapPlanSummaryText,
  recordingGapProtocolText,
  recordingGapTopGroupsText,
} from "./recording-gap-plan.mjs";

const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/current-expansion-preview-walking-analysis.validation.proof-manifest.json";
const DEFAULT_GAME_VISUAL_PLAN_PATH = "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-plan.json";
const DEFAULT_SEMANTIC_REVIEW_PATH = "tmp/movement-replay-lab/current-expansion-preview-walking-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_RECORDING_PLAN_OUT_PATH = "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json";

export const WALKING_SUPPORT_REQUIREMENTS = {
  family: "walking",
  gameProofCases: MOVEMENT_EXPANSION_HANDOFFS.walking.requiredGameProofCases,
  recordedProofCases: MOVEMENT_EXPANSION_HANDOFFS.walking.requiredRecordedProofCases,
};

function printHelp() {
  console.log(`Audit whether walking is ready for a user-facing support claim.

Usage:
  npm run movement:walking-support-audit
  npm run movement:walking-support-audit -- --strict

Options:
  --manifest <file>          Focused walking proof manifest. Defaults to ${DEFAULT_MANIFEST_PATH}
  --game-visual-plan <file>  Focused walking Game visual target plan. Defaults to ${DEFAULT_GAME_VISUAL_PLAN_PATH}
  --semantic-review <file>   Focused walking Game semantic review decisions. Defaults to ${DEFAULT_SEMANTIC_REVIEW_PATH}
  --recording-plan-out <f>   Write the support recording-gap plan used by quick validation. Defaults to ${DEFAULT_RECORDING_PLAN_OUT_PATH}
  --no-recording-plan-out    Do not write the support recording-gap plan.
  --strict                   Exit non-zero when walking support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseWalkingSupportReadinessAuditArgs(argv) {
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

function rowsForStatus(groups, proofCase, status) {
  return (groups[proofCase] ?? []).filter((row) => row.status === status);
}

function passedRowsForCase(groups, proofCase) {
  return rowsForStatus(groups, proofCase, "passed");
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

function planProofCases(gameVisualPlan) {
  return Array.isArray(gameVisualPlan?.summary?.proofCases)
    ? gameVisualPlan.summary.proofCases
    : Array.from(new Set([
        ...(gameVisualPlan?.sessions ?? []).flatMap((session) => session.proofCases ?? []),
        ...(gameVisualPlan?.captures ?? []).flatMap((capture) => capture?.target?.cases ?? []),
      ])).sort();
}

function reviewedReadableCases(semanticReview) {
  return Array.from(new Set(
    (semanticReview?.decisions ?? [])
      .filter((decision) => decision.decision === "readable-pass")
      .flatMap((decision) => decision.reviewContext?.cases ?? []),
  )).sort();
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "none";
}

function proofCaseSummary(manifest, proofCases) {
  const groups = rowsByProofCase(manifest);
  return Object.fromEntries(
    proofCases.map((proofCase) => {
      const rows = groups[proofCase] ?? [];
      return [proofCase, countByStatus(rows)];
    }),
  );
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNumber(value) {
  const number = numberOrNull(value);
  return number === null ? "n/a" : number.toFixed(3);
}

function walkingPromotionBlockerCodeForRow(row) {
  if (row.proofBlockerCode) return row.proofBlockerCode;
  const candidateAmplitude = numberOrNull(row.candidateAmplitude);
  const expectedMinimumAmplitude = numberOrNull(row.expectedMinimumAmplitude);
  if (
    row.status === "product-scope-limitation" &&
    candidateAmplitude !== null &&
    expectedMinimumAmplitude !== null &&
    candidateAmplitude < expectedMinimumAmplitude
  ) {
    return "candidate-below-threshold";
  }
  return row.status ?? null;
}

function bestAmplitudeRow(rows) {
  return [...rows]
    .filter((row) => numberOrNull(row.candidateAmplitude) !== null)
    .sort((left, right) => right.candidateAmplitude - left.candidateAmplitude)[0] ?? null;
}

function missingAnalyzerReasonForCase(groups, proofCase) {
  const rows = groups[proofCase] ?? [];
  const missingRows = rows.filter((row) => (
    row.status !== "passed" ||
    row.automatedStatus === "missing-proof" ||
    row.status === "product-scope-limitation" ||
    row.proofBlockerCode
  ));
  const proofBlockerCounts = missingRows.reduce((counts, row) => {
    const blocker = walkingPromotionBlockerCodeForRow(row) ?? "unknown";
    counts[blocker] = (counts[blocker] ?? 0) + 1;
    return counts;
  }, {});
  const recordingIds = Array.from(new Set(
    rows.map((row) => row.recordingId).filter(Boolean),
  )).sort();
  const sourceRow = bestAmplitudeRow(missingRows) ??
    missingRows.find((row) => row.proofBlockerCode) ??
    missingRows[0];
  if (!sourceRow) return null;

  const candidateAmplitude = numberOrNull(sourceRow.candidateAmplitude);
  const expectedMinimumAmplitude = numberOrNull(sourceRow.expectedMinimumAmplitude);
  const amplitudeRatio = candidateAmplitude !== null && expectedMinimumAmplitude !== null && expectedMinimumAmplitude > 0
    ? candidateAmplitude / expectedMinimumAmplitude
    : null;

  return {
    amplitudeRatio,
    candidateAmplitude,
    evidenceFrameCount: sourceRow.evidenceFrameCount ?? 0,
    expectedMinimumAmplitude,
    nextAction: sourceRow.proofBlockerCode || sourceRow.status !== "product-scope-limitation"
      ? sourceRow.nextAction ?? null
      : "Capture a recording with larger, clearer root-travel movement for walking promotion.",
    proofBlockerCode: walkingPromotionBlockerCodeForRow(sourceRow),
    proofBlockerCounts,
    recordingId: sourceRow.recordingId ?? null,
    recordingIds,
    searchedRecordingCount: recordingIds.length,
    statusReason: sourceRow.statusReason ?? sourceRow.automatedStatusReason ?? null,
  };
}

function recordingRowsForProofCases(groups, proofCases) {
  return proofCases.flatMap((proofCase) => groups[proofCase] ?? []);
}

function promotionGapRowsForRows(rows) {
  return rows.map((row) => {
    if (row.status !== "product-scope-limitation") return row;
    return {
      ...row,
      acceptedProductLimitation: false,
      nextAction: "Capture a recording with larger, clearer root-travel movement for walking promotion.",
      proofBlockerCode: walkingPromotionBlockerCodeForRow(row) ?? "missing-analyzer-proof",
      status: "missing-proof",
      statusReason: row.statusReason ?? "Root-travel is product-scoped in the default gate; a walking promotion attempt still needs recorded analyzer proof.",
    };
  });
}

function recordingGapSummaryForRows(rows, options = {}) {
  const plan = recordingGapPlanForRows(promotionGapRowsForRows(rows), {
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

function recordingIdsForRows(rows) {
  return Array.from(new Set(rows.map((row) => row.recordingId).filter(Boolean))).sort();
}

function walkingProofCandidates(groups, proofCases) {
  const recordingIds = Array.from(new Set(
    proofCases.flatMap((proofCase) => (
      (groups[proofCase] ?? []).map((row) => row.recordingId).filter(Boolean)
    )),
  )).sort();

  return recordingIds
    .map((recordingId) => {
      const passedProofCases = proofCases.filter((proofCase) => (
        passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const evidenceProofCases = proofCases.filter((proofCase) => (
        automatedEvidenceRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const productScopedProofCases = proofCases.filter((proofCase) => (
        rowsForStatus(groups, proofCase, "product-scope-limitation").some((row) => row.recordingId === recordingId)
      ));

      return {
        evidenceProofCaseCount: evidenceProofCases.length,
        evidenceProofCases,
        missingPassedProofCases: proofCases.filter((proofCase) => !passedProofCases.includes(proofCase)),
        passedProofCaseCount: passedProofCases.length,
        passedProofCases,
        productScopedProofCases,
        recordingId,
      };
    })
    .filter((candidate) => (
      candidate.evidenceProofCaseCount > 0 ||
      candidate.passedProofCaseCount > 0 ||
      candidate.productScopedProofCases.length > 0
    ))
    .sort((left, right) => (
      right.passedProofCaseCount - left.passedProofCaseCount ||
      right.evidenceProofCaseCount - left.evidenceProofCaseCount ||
      left.recordingId.localeCompare(right.recordingId)
    ));
}

export function auditWalkingSupportReadiness({
  gameVisualPlan,
  manifest,
  recordingPlanPath = DEFAULT_RECORDING_PLAN_OUT_PATH,
  requirements = WALKING_SUPPORT_REQUIREMENTS,
  semanticReview,
}) {
  const groups = rowsByProofCase(manifest);
  const presentRecordedProofCases = new Set(Object.keys(groups));
  const visualPlanCases = planProofCases(gameVisualPlan);
  const readableCases = reviewedReadableCases(semanticReview);
  const missingRecordedManifestProofCases = requirements.recordedProofCases
    .filter((proofCase) => !presentRecordedProofCases.has(proofCase));
  const missingRecordedPassedProofCases = requirements.recordedProofCases
    .filter((proofCase) => passedRowsForCase(groups, proofCase).length === 0);
  const productScopedRecordedProofCases = requirements.recordedProofCases
    .filter((proofCase) => rowsForStatus(groups, proofCase, "product-scope-limitation").length > 0);
  const missingAnalyzerProofCases = requirements.recordedProofCases
    .filter((proofCase) => automatedEvidenceRowsForCase(groups, proofCase).length === 0);
  const missingAnalyzerProofReasons = Object.fromEntries(
    missingAnalyzerProofCases
      .map((proofCase) => [proofCase, missingAnalyzerReasonForCase(groups, proofCase)])
      .filter(([, reason]) => reason),
  );
  const recordingGap = recordingGapSummaryForRows(recordingRowsForProofCases(
    groups,
    missingAnalyzerProofCases.length > 0 ? missingAnalyzerProofCases : requirements.recordedProofCases,
  ), { recordingPlanPath });
  const missingGamePlanCases = requirements.gameProofCases
    .filter((proofCase) => !visualPlanCases.includes(proofCase));
  const missingReadableGameCases = requirements.gameProofCases
    .filter((proofCase) => !readableCases.includes(proofCase));
  const passingRecordingIds = recordingIdsForRows(
    requirements.recordedProofCases.flatMap((proofCase) => passedRowsForCase(groups, proofCase)),
  ).filter((recordingId) => requirements.recordedProofCases.every((proofCase) => (
    passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
  )));
  const ready = (
    passingRecordingIds.length > 0 &&
    productScopedRecordedProofCases.length === 0 &&
    missingRecordedManifestProofCases.length === 0 &&
    missingRecordedPassedProofCases.length === 0 &&
    missingGamePlanCases.length === 0 &&
    missingReadableGameCases.length === 0
  );

  return {
    decision: ready
      ? "Walking can be considered for a scoped user-facing support claim."
      : "Keep walking internal preview/demo-only; recorded walking proof is not ready for product support.",
    family: requirements.family,
    missingAnalyzerProofCases,
    missingAnalyzerProofReasons,
    missingGamePlanCases,
    missingReadableGameCases,
    missingRecordedManifestProofCases,
    missingRecordedPassedProofCases,
    passingRecordingIds,
    productScopedRecordedProofCases,
    proofCaseSummary: proofCaseSummary(manifest, requirements.recordedProofCases),
    readableCases,
    recordingGap,
    ready,
    requirements,
    visualPlanCases,
    walkingProofCandidates: walkingProofCandidates(groups, requirements.recordedProofCases),
  };
}

function formatCandidate(candidate, total) {
  return `${candidate.recordingId}: evidence ${candidate.evidenceProofCaseCount}/${total}, passed ${candidate.passedProofCaseCount}/${total}` +
    `${candidate.productScopedProofCases.length > 0 ? `, product-scoped ${candidate.productScopedProofCases.join(",")}` : ""}` +
    `${candidate.missingPassedProofCases.length > 0 ? `, missing passed ${candidate.missingPassedProofCases.join(",")}` : ""}`;
}

export function formatWalkingSupportReadiness(audit) {
  const lines = [
    `Walking support readiness: ${audit.ready ? "ready" : "blocked"}`,
    `Decision: ${audit.decision}`,
    `Passing recording bundles: ${formatList(audit.passingRecordingIds)}`,
    `Product-scoped recorded proof cases: ${formatList(audit.productScopedRecordedProofCases)}`,
    `Missing recorded manifest cases: ${formatList(audit.missingRecordedManifestProofCases)}`,
    `Missing recorded passed proof cases: ${formatList(audit.missingRecordedPassedProofCases)}`,
    `Missing analyzer proof cases: ${formatList(audit.missingAnalyzerProofCases)}`,
    `Missing Game plan cases: ${formatList(audit.missingGamePlanCases)}`,
    `Missing readable Game cases: ${formatList(audit.missingReadableGameCases)}`,
    `Next recording targets: ${formatList(audit.missingRecordedPassedProofCases)}`,
    `Next review targets: ${formatList(audit.missingReadableGameCases)}`,
  ];

  if (audit.missingAnalyzerProofCases.length > 0) {
    lines.push("Missing analyzer proof reasons:");
    audit.missingAnalyzerProofCases.forEach((proofCase) => {
      const reason = audit.missingAnalyzerProofReasons?.[proofCase];
      const reasonParts = [
        reason?.proofBlockerCode,
        reason?.searchedRecordingCount
          ? `searched ${reason.searchedRecordingCount} recording${reason.searchedRecordingCount === 1 ? "" : "s"}`
          : reason?.recordingId ? `recording ${reason.recordingId}` : null,
        reason?.candidateAmplitude !== null && reason?.candidateAmplitude !== undefined
          ? `best candidate ${formatNumber(reason.candidateAmplitude)}/${formatNumber(reason.expectedMinimumAmplitude)}${Number.isFinite(reason.amplitudeRatio) ? ` (${Math.round(reason.amplitudeRatio * 100)}%)` : ""}`
          : null,
        reason?.proofBlockerCounts
          ? `blockers ${Object.entries(reason.proofBlockerCounts).map(([key, count]) => `${key}:${count}`).join(",")}`
          : null,
        reason?.nextAction,
      ].filter(Boolean);
      lines.push(`- ${proofCase}: ${reasonParts.length > 0 ? reasonParts.join("; ") : "no analyzer evidence"}`);
    });
  }

  if (audit.recordingGap?.summary?.totalRows > 0) {
    lines.push(`Recording gap plan: ${audit.recordingGap.summaryText}`);
    lines.push(`Recording gap top groups: ${audit.recordingGap.topGroupsText}`);
    audit.recordingGap.captureScenarios?.slice(0, 2).forEach((scenario) => {
      lines.push(`Fresh recording scenario: ${scenario.freshRecordingLabel || scenario.id}`);
      lines.push(`Protocol: ${recordingGapProtocolText(scenario.protocol ?? scenario)}`);
      lines.push(`Quick validation: ${scenario.quickValidationScriptCommand || scenario.quickValidationCommand}`);
    });
  }

  if (audit.walkingProofCandidates.length > 0) {
    lines.push("Best walking proof candidates:");
    audit.walkingProofCandidates.slice(0, 5).forEach((candidate, index) => {
      lines.push(`${index + 1}. ${formatCandidate(candidate, audit.requirements.recordedProofCases.length)}`);
    });
  }

  return lines.join("\n");
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
  const args = parseWalkingSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifest = await readJsonIfPresent(args.manifestPath);
  if (!manifest) {
    throw new Error(`Missing walking proof manifest: ${args.manifestPath}. Run the walking handoff analysis first.`);
  }
  const gameVisualPlan = await readJsonIfPresent(args.gameVisualPlanPath) ?? {};
  const semanticReview = await readJsonIfPresent(args.semanticReviewPath) ?? {};
  const audit = auditWalkingSupportReadiness({
    gameVisualPlan,
    manifest,
    recordingPlanPath: args.recordingPlanOutPath,
    semanticReview,
  });
  await writeJsonFile(args.recordingPlanOutPath, audit.recordingGap?.plan);

  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatWalkingSupportReadiness(audit));
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
