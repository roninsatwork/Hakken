#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const defaultGameVisualPlanPath = "tmp/movement-replay-lab/current-game-visual-proof-plan.json";
const defaultSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";

export const UPPER_BODY_STANDING_SUPPORT_REQUIREMENTS = {
  broadManifestProofCases: [
    "standing-arm-raise",
    "standing-twist",
    "standing-reach",
    "shoulder-scapula-control",
  ],
  broadReadableGameCases: [
    "strongest-side-bend",
    "strongest-head-direction",
    "strongest-standing-arm-raise",
    "strongest-standing-twist",
    "strongest-standing-reach",
  ],
  narrowManifestProofCases: [
    "standing",
    "side-bend",
    "head-direction",
  ],
  narrowReadableGameCases: [
    "strongest-side-bend",
    "strongest-head-direction",
  ],
};

function printHelp() {
  console.log(`Audit whether upper-body-standing is ready for a user-facing support claim.

Usage:
  npm run movement:upper-body-standing-support-audit
  npm run movement:upper-body-standing-support-audit -- --strict

Options:
  --manifest <file>          Reviewed proof manifest. Defaults to ${defaultManifestPath}
  --game-visual-plan <file>  Game visual target plan. Defaults to ${defaultGameVisualPlanPath}
                             Can be repeated for supplemental focused plans.
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
                             Can be repeated for supplemental focused reviews.
  --strict                   Exit non-zero when broad upper-body support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseUpperBodyStandingSupportReadinessAuditArgs(argv) {
  const args = {
    gameVisualPlanPaths: [defaultGameVisualPlanPath],
    json: false,
    manifestPath: defaultManifestPath,
    semanticReviewPaths: [defaultSemanticReviewPath],
    strict: false,
  };
  let sawExplicitGameVisualPlan = false;
  let sawExplicitSemanticReview = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--game-visual-plan") {
      if (!sawExplicitGameVisualPlan) {
        args.gameVisualPlanPaths = [];
        sawExplicitGameVisualPlan = true;
      }
      args.gameVisualPlanPaths.push(argv[++index] || defaultGameVisualPlanPath);
    } else if (arg === "--semantic-review") {
      if (!sawExplicitSemanticReview) {
        args.semanticReviewPaths = [];
        sawExplicitSemanticReview = true;
      }
      args.semanticReviewPaths.push(argv[++index] || defaultSemanticReviewPath);
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

export function mergeGameVisualPlans(plans) {
  const mergedSessions = plans.flatMap((plan) => Array.isArray(plan?.sessions) ? plan.sessions : []);
  const mergedCaptures = plans.flatMap((plan) => Array.isArray(plan?.captures) ? plan.captures : []);
  const proofCases = Array.from(new Set(plans.flatMap(planProofCases))).sort();

  return {
    captures: mergedCaptures,
    sessions: mergedSessions,
    summary: {
      proofCases,
    },
  };
}

export function mergeSemanticReviews(reviews) {
  return {
    decisions: reviews.flatMap((review) => Array.isArray(review?.decisions) ? review.decisions : []),
  };
}

function countByStatus(rows) {
  return rows.reduce((counts, row) => {
    const status = row?.status || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
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

function proofCaseSummary(manifest) {
  const groups = rowsByProofCase(manifest);
  return Object.fromEntries(
    Object.entries(groups).map(([proofCase, rows]) => [
      proofCase,
      countByStatus(rows),
    ]),
  );
}

function passedRowsForCase(groups, proofCase) {
  return (groups[proofCase] ?? []).filter((row) => row.status === "passed");
}

function recordingsWithPassedProofCases(groups, proofCases) {
  const recordingIds = new Set(
    proofCases.flatMap((proofCase) => passedRowsForCase(groups, proofCase).map((row) => row.recordingId)),
  );

  return Array.from(recordingIds)
    .filter((recordingId) => proofCases.every((proofCase) => (
      passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
    )))
    .sort();
}

function rowHasAnalyzerEvidence(row) {
  if ((row?.evidenceFrameCount ?? 0) <= 0) return false;
  const expectedMinimumAmplitude = row?.expectedMinimumAmplitude;
  if (typeof expectedMinimumAmplitude !== "number" || !Number.isFinite(expectedMinimumAmplitude)) return true;
  return (row?.observedAmplitude ?? Number.NEGATIVE_INFINITY) >= expectedMinimumAmplitude;
}

function productScopedEvidenceRowsForCase(groups, proofCase) {
  return (groups[proofCase] ?? [])
    .filter((row) => row.status === "product-scope-limitation" && rowHasAnalyzerEvidence(row));
}

function productScopedBroadEvidenceSummary(groups, proofCases) {
  return Object.fromEntries(
    proofCases.map((proofCase) => {
      const rows = groups[proofCase] ?? [];
      const evidenceRows = productScopedEvidenceRowsForCase(groups, proofCase);
      const maxObservedAmplitude = evidenceRows.reduce((max, row) => (
        Math.max(max, row.observedAmplitude ?? Number.NEGATIVE_INFINITY)
      ), Number.NEGATIVE_INFINITY);

      return [proofCase, {
        evidenceProductScopeCount: evidenceRows.length,
        maxObservedAmplitude: Number.isFinite(maxObservedAmplitude) ? maxObservedAmplitude : null,
        productScopeCount: rows.filter((row) => row.status === "product-scope-limitation").length,
      }];
    }),
  );
}

function recordingsWithProductScopedBroadEvidence(groups, proofCases) {
  const recordingIds = new Set(
    proofCases.flatMap((proofCase) => (
      productScopedEvidenceRowsForCase(groups, proofCase).map((row) => row.recordingId)
    )),
  );

  return Array.from(recordingIds)
    .filter((recordingId) => proofCases.every((proofCase) => (
      productScopedEvidenceRowsForCase(groups, proofCase)
        .some((row) => row.recordingId === recordingId)
    )))
    .sort();
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

export function auditUpperBodyStandingSupportReadiness({
  gameVisualPlan,
  manifest,
  requirements = UPPER_BODY_STANDING_SUPPORT_REQUIREMENTS,
  semanticReview,
}) {
  const groups = rowsByProofCase(manifest);
  const summaryByProofCase = proofCaseSummary(manifest);
  const narrowPassingRecordingIds = recordingsWithPassedProofCases(groups, requirements.narrowManifestProofCases);
  const presentProofCases = new Set(Object.keys(groups));
  const missingBroadManifestProofCases = requirements.broadManifestProofCases
    .filter((proofCase) => !presentProofCases.has(proofCase));
  const missingBroadPassedProofCases = requirements.broadManifestProofCases
    .filter((proofCase) => passedRowsForCase(groups, proofCase).length === 0);
  const visualPlanCases = planProofCases(gameVisualPlan);
  const readableCases = reviewedReadableCases(semanticReview);
  const missingBroadGamePlanCases = requirements.broadReadableGameCases
    .filter((proofCase) => !visualPlanCases.includes(proofCase));
  const missingBroadReadableGameCases = requirements.broadReadableGameCases
    .filter((proofCase) => !readableCases.includes(proofCase));
  const missingNarrowGamePlanCases = requirements.narrowReadableGameCases
    .filter((proofCase) => !visualPlanCases.includes(proofCase));
  const missingNarrowReadableGameCases = requirements.narrowReadableGameCases
    .filter((proofCase) => !readableCases.includes(proofCase));
  const narrowReady = (
    narrowPassingRecordingIds.length > 0 &&
    missingNarrowGamePlanCases.length === 0 &&
    missingNarrowReadableGameCases.length === 0
  );

  const broadReady = (
    missingBroadManifestProofCases.length === 0 &&
    missingBroadPassedProofCases.length === 0 &&
    missingBroadGamePlanCases.length === 0 &&
    missingBroadReadableGameCases.length === 0
  );

  return {
    broadReady,
    decision: broadReady
      ? "Upper-body standing can be considered for a scoped user-facing support claim."
      : "Keep upper-body-standing internal/demo-only; current proof supports only narrow side-bend/head-direction confidence, not the broader family label.",
    missingBroadGamePlanCases,
    missingBroadManifestProofCases,
    missingBroadPassedProofCases,
    missingBroadReadableGameCases,
    missingNarrowGamePlanCases,
    missingNarrowReadableGameCases,
    narrowPassingRecordingIds,
    narrowReady,
    proofCaseSummary: summaryByProofCase,
    productScopedBroadEvidenceRecordingIds: recordingsWithProductScopedBroadEvidence(
      groups,
      requirements.broadManifestProofCases,
    ),
    productScopedBroadEvidenceSummary: productScopedBroadEvidenceSummary(
      groups,
      requirements.broadManifestProofCases,
    ),
    readableCases,
    requirements,
    visualPlanCases,
  };
}

function formatList(values) {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatEvidenceSummary(summary) {
  return Object.entries(summary)
    .map(([proofCase, value]) => (
      `${proofCase} ${value.evidenceProductScopeCount}/${value.productScopeCount}` +
      `${value.maxObservedAmplitude === null ? "" : ` max ${value.maxObservedAmplitude}`}`
    ))
    .join("; ");
}

function formatAudit(audit) {
  return [
    `Upper-body standing support-readiness audit: ${audit.broadReady ? "passed" : "blocked"}`,
    audit.decision,
    `Narrow recorded proof bundles: ${audit.narrowPassingRecordingIds.length} (${formatList(audit.narrowPassingRecordingIds)}).`,
    `Missing broad manifest proof definitions: ${formatList(audit.missingBroadManifestProofCases)}.`,
    `Missing broad passed proof cases: ${formatList(audit.missingBroadPassedProofCases)}.`,
    `Missing narrow Game target-plan cases: ${formatList(audit.missingNarrowGamePlanCases)}.`,
    `Missing narrow readable Game cases: ${formatList(audit.missingNarrowReadableGameCases)}.`,
    `Missing broad Game target-plan cases: ${formatList(audit.missingBroadGamePlanCases)}.`,
    `Missing broad readable Game cases: ${formatList(audit.missingBroadReadableGameCases)}.`,
    `Product-scoped broad evidence rows: ${formatEvidenceSummary(audit.productScopedBroadEvidenceSummary)}.`,
    `Recordings with product-scoped evidence for all broad cases: ${formatList(audit.productScopedBroadEvidenceRecordingIds)}.`,
  ].join("\n");
}

async function main() {
  const args = parseUpperBodyStandingSupportReadinessAuditArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"));
  const gameVisualPlan = mergeGameVisualPlans(await Promise.all(
    args.gameVisualPlanPaths.map(async (planPath) => (
      JSON.parse(await readFile(path.resolve(planPath), "utf8"))
    )),
  ));
  const semanticReview = mergeSemanticReviews(await Promise.all(
    args.semanticReviewPaths.map(async (reviewPath) => (
      JSON.parse(await readFile(path.resolve(reviewPath), "utf8"))
    )),
  ));
  const audit = auditUpperBodyStandingSupportReadiness({ gameVisualPlan, manifest, semanticReview });

  console.log(args.json ? JSON.stringify(audit, null, 2) : formatAudit(audit));
  if (args.strict && !audit.broadReady) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
