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

const DEFAULT_MANIFEST_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-analysis.validation.proof-manifest.json";
const DEFAULT_GAME_VISUAL_PLAN_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-plan.json";
const DEFAULT_SEMANTIC_REVIEW_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json";
const DEFAULT_RECORDING_PLAN_OUT_PATH = "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json";

export const SITTING_SUPPORT_REQUIREMENTS = {
  family: "sitting",
  gameProofCases: MOVEMENT_EXPANSION_HANDOFFS.sitting.requiredGameProofCases,
  recordedProofCases: MOVEMENT_EXPANSION_HANDOFFS.sitting.requiredRecordedProofCases,
};

function printHelp() {
  console.log(`Audit whether sitting is ready for a user-facing support claim.

Usage:
  npm run movement:sitting-support-audit
  npm run movement:sitting-support-audit -- --strict

Options:
  --manifest <file>          Opt-in seated proof manifest. Defaults to ${DEFAULT_MANIFEST_PATH}
  --game-visual-plan <file>  Focused seated Game visual target plan. Defaults to ${DEFAULT_GAME_VISUAL_PLAN_PATH}
  --semantic-review <file>   Focused seated Game semantic review decisions. Defaults to ${DEFAULT_SEMANTIC_REVIEW_PATH}
  --recording-plan-out <f>   Write the support recording-gap plan used by quick validation. Defaults to ${DEFAULT_RECORDING_PLAN_OUT_PATH}
  --no-recording-plan-out    Do not write the support recording-gap plan.
  --strict                   Exit non-zero when sitting support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseSittingSupportReadinessAuditArgs(argv) {
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

function manualReviewRowsForCase(groups, proofCase) {
  return (groups[proofCase] ?? []).filter((row) => (
    row.status === "manual-review" ||
    row.proofBlockerCode === "manual-review-pending"
  ));
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

function missingAnalyzerReasonForCase(groups, proofCase) {
  const rows = groups[proofCase] ?? [];
  const missingRows = rows.filter((row) => (
    row.status === "missing-proof" ||
    row.automatedStatus === "missing-proof" ||
    row.proofBlockerCode
  ));
  const proofBlockerCounts = missingRows.reduce((counts, row) => {
    const blocker = row.proofBlockerCode ?? "unknown";
    counts[blocker] = (counts[blocker] ?? 0) + 1;
    return counts;
  }, {});
  const recordingIds = Array.from(new Set(
    rows.map((row) => row.recordingId).filter(Boolean),
  )).sort();
  const sourceRow = missingRows.find((row) => row.proofBlockerCode === "no-candidate-amplitude") ??
    missingRows.find((row) => row.proofBlockerCode) ??
    missingRows[0];
  if (!sourceRow) return null;

  return {
    candidateAmplitude: sourceRow.candidateAmplitude ?? null,
    evidenceFrameCount: sourceRow.evidenceFrameCount ?? 0,
    expectedMinimumAmplitude: sourceRow.expectedMinimumAmplitude ?? null,
    nextAction: sourceRow.nextAction ?? null,
    proofBlockerCode: sourceRow.proofBlockerCode ?? null,
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

function recordingIdsForProofCases(groups, proofCases) {
  return Array.from(new Set(
    proofCases.flatMap((proofCase) => (
      (groups[proofCase] ?? []).map((row) => row.recordingId).filter(Boolean)
    )),
  )).sort();
}

function recordingsWithPassedProofCases(groups, proofCases) {
  return recordingIdsForProofCases(groups, proofCases)
    .filter((recordingId) => proofCases.every((proofCase) => (
      passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
    )));
}

function seatedProofCandidates(groups, proofCases) {
  return recordingIdsForProofCases(groups, proofCases)
    .map((recordingId) => {
      const passedProofCases = proofCases.filter((proofCase) => (
        passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const analyzerProofCases = proofCases.filter((proofCase) => (
        automatedEvidenceRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const reviewPendingProofCases = proofCases.filter((proofCase) => (
        manualReviewRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const missingPassedProofCases = proofCases.filter((proofCase) => !passedProofCases.includes(proofCase));
      const missingAnalyzerProofCases = proofCases.filter((proofCase) => !analyzerProofCases.includes(proofCase));

      return {
        analyzerProofCaseCount: analyzerProofCases.length,
        analyzerProofCases,
        missingAnalyzerProofCases,
        missingPassedProofCases,
        passedProofCaseCount: passedProofCases.length,
        passedProofCases,
        recordingId,
        reviewPendingProofCaseCount: reviewPendingProofCases.length,
        reviewPendingProofCases,
      };
    })
    .filter((candidate) => candidate.analyzerProofCaseCount > 0 || candidate.passedProofCaseCount > 0)
    .sort((left, right) => {
      if (left.missingPassedProofCases.length !== right.missingPassedProofCases.length) {
        return left.missingPassedProofCases.length - right.missingPassedProofCases.length;
      }
      if (left.missingAnalyzerProofCases.length !== right.missingAnalyzerProofCases.length) {
        return left.missingAnalyzerProofCases.length - right.missingAnalyzerProofCases.length;
      }
      if (left.analyzerProofCaseCount !== right.analyzerProofCaseCount) {
        return right.analyzerProofCaseCount - left.analyzerProofCaseCount;
      }
      return left.recordingId.localeCompare(right.recordingId);
    });
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

export function auditSittingSupportReadiness({
  gameVisualPlan,
  manifest,
  recordingPlanPath = DEFAULT_RECORDING_PLAN_OUT_PATH,
  requirements = SITTING_SUPPORT_REQUIREMENTS,
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
  const reviewPendingRecordedProofCases = requirements.recordedProofCases
    .filter((proofCase) => manualReviewRowsForCase(groups, proofCase).length > 0);
  const missingGamePlanCases = requirements.gameProofCases
    .filter((proofCase) => !visualPlanCases.includes(proofCase));
  const missingReadableGameCases = requirements.gameProofCases
    .filter((proofCase) => !readableCases.includes(proofCase));
  const passingRecordingIds = recordingsWithPassedProofCases(groups, requirements.recordedProofCases);
  const ready = (
    passingRecordingIds.length > 0 &&
    missingRecordedManifestProofCases.length === 0 &&
    missingRecordedPassedProofCases.length === 0 &&
    missingGamePlanCases.length === 0 &&
    missingReadableGameCases.length === 0
  );

  return {
    decision: ready
      ? "Sitting can be considered for a scoped user-facing support claim."
      : "Keep sitting internal preview/demo-only; seated proof is not ready for product support.",
    family: requirements.family,
    missingAnalyzerProofCases,
    missingAnalyzerProofReasons,
    missingGamePlanCases,
    missingReadableGameCases,
    missingRecordedManifestProofCases,
    missingRecordedPassedProofCases,
    passingRecordingIds,
    proofCaseSummary: proofCaseSummary(manifest, requirements.recordedProofCases),
    readableCases,
    recordingGap,
    ready,
    requirements,
    reviewPendingRecordedProofCases,
    seatedProofCandidates: seatedProofCandidates(groups, requirements.recordedProofCases),
    visualPlanCases,
  };
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "none";
}

function formatAmplitude(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : null;
}

function formatCandidate(candidate, total) {
  return `${candidate.recordingId}: analyzer ${candidate.analyzerProofCaseCount}/${total}, passed ${candidate.passedProofCaseCount}/${total}` +
    `${candidate.reviewPendingProofCaseCount > 0 ? `, review pending ${candidate.reviewPendingProofCases.join(",")}` : ""}` +
    `${candidate.missingAnalyzerProofCases.length > 0 ? `, missing analyzer ${candidate.missingAnalyzerProofCases.join(",")}` : ""}` +
    `${candidate.missingPassedProofCases.length > 0 ? `, missing passed ${candidate.missingPassedProofCases.join(",")}` : ""}`;
}

export function formatSittingSupportReadiness(audit) {
  const lines = [
    `Sitting support readiness: ${audit.ready ? "ready" : "blocked"}`,
    `Decision: ${audit.decision}`,
    `Passing recording bundles: ${formatList(audit.passingRecordingIds)}`,
    `Missing recorded manifest cases: ${formatList(audit.missingRecordedManifestProofCases)}`,
    `Missing recorded passed proof cases: ${formatList(audit.missingRecordedPassedProofCases)}`,
    `Replay visual review pending cases: ${formatList(audit.reviewPendingRecordedProofCases)}`,
    `Missing analyzer proof cases: ${formatList(audit.missingAnalyzerProofCases)}`,
    `Missing Game plan cases: ${formatList(audit.missingGamePlanCases)}`,
    `Missing readable Game cases: ${formatList(audit.missingReadableGameCases)}`,
    `Next recording targets: ${formatList(audit.missingAnalyzerProofCases)}`,
    `Next review targets: ${formatList(audit.reviewPendingRecordedProofCases)}`,
  ];

  if (audit.missingAnalyzerProofCases.length > 0) {
    lines.push("Missing analyzer proof reasons:");
    audit.missingAnalyzerProofCases.forEach((proofCase) => {
      const reason = audit.missingAnalyzerProofReasons?.[proofCase];
      const candidateAmplitude = formatAmplitude(reason?.candidateAmplitude);
      const expectedMinimumAmplitude = formatAmplitude(reason?.expectedMinimumAmplitude);
      const reasonParts = [
        reason?.proofBlockerCode,
        candidateAmplitude && expectedMinimumAmplitude
          ? `best ${candidateAmplitude}/${expectedMinimumAmplitude}`
          : candidateAmplitude ? `best ${candidateAmplitude}` : null,
        reason?.searchedRecordingCount
          ? `searched ${reason.searchedRecordingCount} recording${reason.searchedRecordingCount === 1 ? "" : "s"}`
          : reason?.recordingId ? `recording ${reason.recordingId}` : null,
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

  if (audit.seatedProofCandidates.length > 0) {
    lines.push("Best seated proof candidates:");
    audit.seatedProofCandidates.slice(0, 5).forEach((candidate, index) => {
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
  const args = parseSittingSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifest = await readJsonIfPresent(args.manifestPath);
  if (!manifest) {
    throw new Error(`Missing seated proof manifest: ${args.manifestPath}. Run movement:replay:analyze with --include-seated-product-scope-proof first.`);
  }
  const gameVisualPlan = await readJsonIfPresent(args.gameVisualPlanPath) ?? {};
  const semanticReview = await readJsonIfPresent(args.semanticReviewPath) ?? {};
  const audit = auditSittingSupportReadiness({
    gameVisualPlan,
    manifest,
    recordingPlanPath: args.recordingPlanOutPath,
    semanticReview,
  });
  await writeJsonFile(args.recordingPlanOutPath, audit.recordingGap?.plan);

  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else {
    console.log(formatSittingSupportReadiness(audit));
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
