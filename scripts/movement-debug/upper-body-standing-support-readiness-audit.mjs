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
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
  --strict                   Exit non-zero when broad upper-body support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseUpperBodyStandingSupportReadinessAuditArgs(argv) {
  const args = {
    gameVisualPlanPath: defaultGameVisualPlanPath,
    json: false,
    manifestPath: defaultManifestPath,
    semanticReviewPath: defaultSemanticReviewPath,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--game-visual-plan") {
      args.gameVisualPlanPath = argv[++index] || args.gameVisualPlanPath;
    } else if (arg === "--semantic-review") {
      args.semanticReviewPath = argv[++index] || args.semanticReviewPath;
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
    readableCases,
    requirements,
    visualPlanCases,
  };
}

function formatList(values) {
  return values.length > 0 ? values.join(", ") : "none";
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
  ].join("\n");
}

async function main() {
  const args = parseUpperBodyStandingSupportReadinessAuditArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"));
  const gameVisualPlan = JSON.parse(await readFile(path.resolve(args.gameVisualPlanPath), "utf8"));
  const semanticReview = JSON.parse(await readFile(path.resolve(args.semanticReviewPath), "utf8"));
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
