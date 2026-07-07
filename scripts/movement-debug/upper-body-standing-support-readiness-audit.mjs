#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const defaultGameVisualPlanPath = "tmp/movement-replay-lab/current-game-visual-proof-plan.json";
const defaultSupplementalBroadGameVisualPlanPath = "tmp/movement-replay-lab/current-game-visual-proof-plan.broad-upper-body.json";
const defaultSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";
const defaultSupplementalBroadSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.broad-upper-body.codex-semantic-review.json";
const defaultBroadCaptureContractPath = "tmp/movement-replay-lab/current-upper-body-standing-broad-capture-contract.json";
const defaultBroadCaptureLabel = "movement-proof-upper-body-standing-broad-explicit";
const BROAD_UPPER_BODY_CAPTURE_CONTRACT_SCHEMA = "sonae-broad-upper-body-capture-contract/v1";
const BROAD_UPPER_BODY_GAME_PROOF_CASES = [
  "strongest-standing-arm-raise",
  "strongest-standing-twist",
  "strongest-standing-reach",
];
const BROAD_UPPER_BODY_CAPTURE_COMMAND_IDS = [
  "initial-analysis",
  "replay-session-export",
  "replay-proof-set",
  "replay-review",
  "reviewed-analysis",
  "focused-game-visual-plan",
  "focused-game-visual-capture",
  "focused-game-visual-review",
  "merged-readiness-audit",
];
const BROAD_UPPER_BODY_SUPPORT_CLAIM_STATUSES = [
  "blocked-internal-demo-only",
  "ready-for-scoped-support-review",
];
const BROAD_UPPER_BODY_CAPTURE_WORKFLOW_STATES = [
  "waiting-for-recording-id",
  "recording-id-bound",
];

const BROAD_UPPER_BODY_CAPTURE_PROTOCOL = [
  "neutral standing baseline with full upper body visible",
  "standing overhead arm raise with both shoulders and elbows visible",
  "standing torso twist with shoulders visibly rotating against stable hips",
  "standing forward/diagonal reach with clear arm extension",
  "shoulder/scapula control segment with visible shoulder blade/upper-back intent",
  "hold each shape for at least 2 seconds before returning to neutral",
];

const BROAD_UPPER_BODY_ACCEPTANCE_CHECKLIST = [
  "One recording contains neutral standing plus all broad segments in sequence.",
  "Both shoulders, elbows, upper torso, hips, knees, and feet remain visible.",
  "Arm raise, twist, reach, and shoulder/scapula intent each have a held readable peak.",
  "The analyzer produces non-product-scoped passed rows for `standing-arm-raise`, `standing-twist`, `standing-reach`, and `shoulder-scapula-control`.",
  "Replay proof-set screenshots are captured and reviewed for all broad recorded rows that start as visual manual-review rows.",
  "Focused broad Game captures are reviewed as readable for `strongest-standing-arm-raise`, `strongest-standing-twist`, and `strongest-standing-reach`.",
  "The merged `movement:upper-body-standing-support-audit` passes before any coverage registry or product-copy change.",
];

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
                             and auto-adds ${defaultSupplementalBroadGameVisualPlanPath} when present.
                             Can be repeated for supplemental focused plans.
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
                             and auto-adds ${defaultSupplementalBroadSemanticReviewPath} when present.
                             Can be repeated for supplemental focused reviews.
  --capture-contract <file>  Use a generated broad capture contract for strict final merged audit inputs.
  --capture-contract-preflight <file>
                             Report whether a broad capture contract is ready for final strict audit.
  --candidate-review-out <file>
                             Write a Markdown checklist for ranked broad evidence candidates.
  --capture-guide-out <file>
                             Write a Markdown guide for capturing and validating one explicit broad bundle.
  --capture-contract-out <file>
                             Write a JSON contract for the explicit broad capture workflow.
  --capture-label <label>    Suggested fresh recording label for --capture-guide-out.
                             Defaults to ${defaultBroadCaptureLabel}
  --recording-id <id>        Optional saved Movement recording id to write into --capture-guide-out commands.
  --recording-id-from-top-candidate
                             Bind the generated guide/contract to the top product-scoped broad evidence candidate.
  --strict                   Exit non-zero when broad upper-body support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseUpperBodyStandingSupportReadinessAuditArgs(argv) {
  const args = {
    gameVisualPlanPaths: [defaultGameVisualPlanPath],
    gameVisualPlanPathsAreDefault: true,
    captureContractPath: null,
    captureContractPreflightPath: null,
    captureContractOutPath: null,
    captureGuideOutPath: null,
    captureLabel: defaultBroadCaptureLabel,
    candidateReviewOutPath: null,
    json: false,
    manifestPath: defaultManifestPath,
    recordingId: null,
    recordingIdFromTopCandidate: false,
    semanticReviewPaths: [defaultSemanticReviewPath],
    semanticReviewPathsAreDefault: true,
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
        args.gameVisualPlanPathsAreDefault = false;
        sawExplicitGameVisualPlan = true;
      }
      args.gameVisualPlanPaths.push(argv[++index] || defaultGameVisualPlanPath);
    } else if (arg === "--semantic-review") {
      if (!sawExplicitSemanticReview) {
        args.semanticReviewPaths = [];
        args.semanticReviewPathsAreDefault = false;
        sawExplicitSemanticReview = true;
      }
      args.semanticReviewPaths.push(argv[++index] || defaultSemanticReviewPath);
    } else if (arg === "--capture-contract") {
      args.captureContractPath = argv[++index] || null;
    } else if (arg === "--capture-contract-preflight") {
      const maybePath = argv[index + 1];
      if (maybePath && !maybePath.startsWith("--")) {
        args.captureContractPreflightPath = maybePath;
        index += 1;
      } else {
        args.captureContractPreflightPath = defaultBroadCaptureContractPath;
      }
    } else if (arg === "--candidate-review-out") {
      args.candidateReviewOutPath = argv[++index] || null;
    } else if (arg === "--capture-guide-out") {
      args.captureGuideOutPath = argv[++index] || null;
    } else if (arg === "--capture-contract-out") {
      args.captureContractOutPath = argv[++index] || null;
    } else if (arg === "--capture-label") {
      args.captureLabel = argv[++index] || defaultBroadCaptureLabel;
    } else if (arg === "--recording-id") {
      args.recordingId = argv[++index] || null;
    } else if (arg === "--recording-id-from-top-candidate") {
      args.recordingIdFromTopCandidate = true;
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

export function resolveUpperBodyStandingSupportAuditArtifactPaths(args, {
  fileExists = existsSync,
  rootDir = process.cwd(),
} = {}) {
  const appendIfDefaultAndPresent = ({
    isDefault,
    paths,
    supplementalPath,
  }) => {
    if (!isDefault) return paths;
    const resolvedPath = path.resolve(rootDir, supplementalPath);
    if (!fileExists(resolvedPath)) return paths;
    return paths.includes(supplementalPath) ? paths : [...paths, supplementalPath];
  };

  return {
    ...args,
    gameVisualPlanPaths: appendIfDefaultAndPresent({
      isDefault: args.gameVisualPlanPathsAreDefault,
      paths: args.gameVisualPlanPaths,
      supplementalPath: defaultSupplementalBroadGameVisualPlanPath,
    }),
    semanticReviewPaths: appendIfDefaultAndPresent({
      isDefault: args.semanticReviewPathsAreDefault,
      paths: args.semanticReviewPaths,
      supplementalPath: defaultSupplementalBroadSemanticReviewPath,
    }),
  };
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
    .filter(isNonEmptyString)
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
    .filter(isNonEmptyString)
    .filter((recordingId) => proofCases.every((proofCase) => (
      productScopedEvidenceRowsForCase(groups, proofCase)
        .some((row) => row.recordingId === recordingId)
    )))
    .sort();
}

function productScopedBroadEvidenceCandidates(groups, proofCases) {
  const recordingIds = new Set(
    proofCases.flatMap((proofCase) => (
      (groups[proofCase] ?? []).map((row) => row.recordingId)
    )),
  );

  return Array.from(recordingIds)
    .filter(isNonEmptyString)
    .map((recordingId) => {
      const proofCaseEvidence = Object.fromEntries(
        proofCases.map((proofCase) => {
          const row = productScopedEvidenceRowsForCase(groups, proofCase)
            .find((candidateRow) => candidateRow.recordingId === recordingId);
          return [proofCase, {
            evidenceFrameCount: row?.evidenceFrameCount ?? 0,
            observedAmplitude: row?.observedAmplitude ?? null,
          }];
        }),
      );
      const missingProductScopedEvidenceCases = proofCases.filter((proofCase) => (
        proofCaseEvidence[proofCase].evidenceFrameCount <= 0
      ));

      return {
        missingProductScopedEvidenceCases,
        proofCaseEvidence,
        recordingId,
        totalEvidenceFrameCount: Object.values(proofCaseEvidence)
          .reduce((total, evidence) => total + evidence.evidenceFrameCount, 0),
      };
    })
    .sort((left, right) => {
      if (left.missingProductScopedEvidenceCases.length !== right.missingProductScopedEvidenceCases.length) {
        return left.missingProductScopedEvidenceCases.length - right.missingProductScopedEvidenceCases.length;
      }
      if (left.totalEvidenceFrameCount !== right.totalEvidenceFrameCount) {
        return right.totalEvidenceFrameCount - left.totalEvidenceFrameCount;
      }
      return left.recordingId.localeCompare(right.recordingId);
    });
}

function broadPassedProofCandidates(groups, proofCases) {
  const recordingIds = new Set(
    proofCases.flatMap((proofCase) => (
      (groups[proofCase] ?? []).map((row) => row.recordingId)
    )),
  );

  return Array.from(recordingIds)
    .filter(isNonEmptyString)
    .map((recordingId) => {
      const passedProofCases = proofCases.filter((proofCase) => (
        passedRowsForCase(groups, proofCase).some((row) => row.recordingId === recordingId)
      ));
      const missingPassedProofCases = proofCases.filter((proofCase) => !passedProofCases.includes(proofCase));

      return {
        missingPassedProofCases,
        passedProofCaseCount: passedProofCases.length,
        passedProofCases,
        recordingId,
      };
    })
    .filter((candidate) => candidate.passedProofCaseCount > 0)
    .sort((left, right) => {
      if (left.missingPassedProofCases.length !== right.missingPassedProofCases.length) {
        return left.missingPassedProofCases.length - right.missingPassedProofCases.length;
      }
      if (left.passedProofCaseCount !== right.passedProofCaseCount) {
        return right.passedProofCaseCount - left.passedProofCaseCount;
      }
      return left.recordingId.localeCompare(right.recordingId);
    });
}

function broadSupportClaimStatus(audit) {
  return audit.broadReady
    ? "ready-for-scoped-support-review"
    : "blocked-internal-demo-only";
}

function broadSupportClaimBlockers(audit) {
  return {
    missingBroadGamePlanCases: audit.missingBroadGamePlanCases,
    missingBroadManifestProofCases: audit.missingBroadManifestProofCases,
    missingBroadPassedProofCases: audit.missingBroadPassedProofCases,
    missingBroadReadableGameCases: audit.missingBroadReadableGameCases,
    requiresSinglePassingRecordingBundle: audit.broadPassingRecordingIds.length === 0,
  };
}

function broadCaptureWorkflowState(recordingId) {
  return recordingId ? "recording-id-bound" : "waiting-for-recording-id";
}

function broadCaptureNextWorkflowAction(recordingId) {
  return recordingId
    ? "run initial-analysis after confirming the local export path and services are ready"
    : "capture or tag one explicit broad upper-body recording, then regenerate this contract with --recording-id <id>";
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
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
  const broadPassingRecordingIds = recordingsWithPassedProofCases(groups, requirements.broadManifestProofCases);
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
    broadPassingRecordingIds.length > 0 &&
    missingBroadManifestProofCases.length === 0 &&
    missingBroadPassedProofCases.length === 0 &&
    missingBroadGamePlanCases.length === 0 &&
    missingBroadReadableGameCases.length === 0
  );

  return {
    broadPassingRecordingIds,
    broadPassedProofCandidates: broadPassedProofCandidates(
      groups,
      requirements.broadManifestProofCases,
    ),
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
    productScopedBroadEvidenceCandidates: productScopedBroadEvidenceCandidates(
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
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "none";
}

function formatEvidenceSummary(summary) {
  return Object.entries(summary)
    .map(([proofCase, value]) => (
      `${proofCase} ${value.evidenceProductScopeCount}/${value.productScopeCount}` +
      `${value.maxObservedAmplitude === null ? "" : ` max ${value.maxObservedAmplitude}`}`
    ))
    .join("; ");
}

function formatCandidateSummary(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, 3)
    .map((candidate) => (
      `${candidate.recordingId} ${candidate.totalEvidenceFrameCount} frame(s)` +
      `${candidate.missingProductScopedEvidenceCases.length > 0
        ? ` missing ${candidate.missingProductScopedEvidenceCases.join(",")}`
        : ""}`
    ))
    .join("; ");
}

function formatPassedProofCandidateSummary(candidates) {
  return candidates
    .slice(0, 3)
    .map((candidate) => (
      `${candidate.recordingId} ${candidate.passedProofCaseCount} passed case(s)` +
      `${candidate.missingPassedProofCases.length > 0
        ? ` missing ${candidate.missingPassedProofCases.join(",")}`
        : ""}`
    ))
    .join("; ");
}

function topProductScopedCandidateHandoffCommand(candidates) {
  const topCandidate = Array.isArray(candidates) ? candidates[0] : null;
  return isNonEmptyString(topCandidate?.recordingId)
    ? `npx -p node@22.13.0 npm run movement:upper-body-standing-capture-handoff -- --recording-id ${shellArg(topCandidate.recordingId)}`
    : null;
}

function formatCandidateEvidence(candidate) {
  return Object.entries(candidate.proofCaseEvidence)
    .map(([proofCase, evidence]) => (
      `${proofCase}: ${evidence.evidenceFrameCount} frame(s)` +
      `${evidence.observedAmplitude === null ? "" : `, observed ${evidence.observedAmplitude}`}`
    ))
    .join("; ");
}

export function formatBroadCandidateReview(audit) {
  const candidateRows = audit.productScopedBroadEvidenceCandidates
    .slice(0, 3)
    .map((candidate, index) => (
      `| ${index + 1} | \`${candidate.recordingId}\` | ${candidate.totalEvidenceFrameCount} | ` +
      `${candidate.missingProductScopedEvidenceCases.length > 0
        ? candidate.missingProductScopedEvidenceCases.join(", ")
        : "none"} | ${formatCandidateEvidence(candidate)} |`
    ));
  const passedProofCandidateRows = audit.broadPassedProofCandidates
    .slice(0, 3)
    .map((candidate, index) => (
      `| ${index + 1} | \`${candidate.recordingId}\` | ${candidate.passedProofCaseCount} | ` +
      `${candidate.missingPassedProofCases.length > 0
        ? candidate.missingPassedProofCases.join(", ")
        : "none"} | ${candidate.passedProofCases.join(", ") || "none"} |`
    ));

  return [
    "# Broad Upper-Body Standing Candidate Review",
    "",
    "This checklist is decision support only. Broad `upper-body-standing` remains internal/demo-only until recorded proof rows are no longer product-scoped and the readiness audit passes.",
    "",
    `Audit decision: ${audit.decision}`,
    `Missing broad passed proof cases: ${formatList(audit.missingBroadPassedProofCases)}`,
    `Missing broad readable Game cases: ${formatList(audit.missingBroadReadableGameCases)}`,
    "",
    "## Top Candidates",
    "",
    "| Rank | Recording | Evidence frames | Missing evidence cases | Evidence detail |",
    "| ---: | --- | ---: | --- | --- |",
    ...(candidateRows.length > 0 ? candidateRows : ["| n/a | none | 0 | n/a | n/a |"]),
    "",
    "## Top Passed-Proof Candidates",
    "",
    "| Rank | Recording | Passed cases | Missing passed cases | Passed detail |",
    "| ---: | --- | ---: | --- | --- |",
    ...(passedProofCandidateRows.length > 0
      ? passedProofCandidateRows
      : ["| n/a | none | 0 | n/a | n/a |"]),
    "",
    "## Reviewer Decision",
    "",
    "- [ ] Existing candidate is sufficient for a scoped broad upper-body manual review.",
    "- [ ] Existing candidate only proves presentation plumbing; keep broad rows product-scoped.",
    "- [ ] Capture a new explicit broad upper-body bundle before any support-claim change.",
    "",
    "## Capture Protocol",
    "",
    ...BROAD_UPPER_BODY_CAPTURE_PROTOCOL.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function shellValue(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function shellArg(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function commandById(commands, id) {
  return commands.find((command) => command.id === id)?.command ?? "";
}

function commandIncludesAll(command, values) {
  return values.every((value) => typeof value === "string" && value.length > 0 && command.includes(value));
}

function buildBroadCaptureWorkflow({
  captureLabel = defaultBroadCaptureLabel,
  recordingId = null,
} = {}) {
  const safeLabel = shellValue(captureLabel || defaultBroadCaptureLabel);
  const recordingIdValue = recordingId ? shellArg(recordingId) : "<new-recording-id>";
  const paths = {
    analysis: `tmp/movement-replay-lab/${safeLabel}-analysis.json`,
    manifest: `tmp/movement-replay-lab/${safeLabel}-analysis.proof-manifest.json`,
    replaySession: `tmp/movement-replay-lab/${safeLabel}-replay-session.json`,
    replayCapture: `tmp/movement-replay-lab/captures/${safeLabel}-replay-proof-set`,
    replayReview: `tmp/movement-replay-lab/${safeLabel}-replay-proof-review.md`,
    replayReviewDecisions: `tmp/movement-replay-lab/${safeLabel}-replay-proof-review-decisions.template.json`,
    reviewedAnalysis: `tmp/movement-replay-lab/${safeLabel}-analysis-reviewed.json`,
    reviewedManifest: `tmp/movement-replay-lab/${safeLabel}-analysis-reviewed.proof-manifest.json`,
    gameVisualPlan: `tmp/movement-replay-lab/${safeLabel}-game-visual-proof-plan.json`,
    gameCapture: `tmp/movement-replay-lab/captures/${safeLabel}-game-visual-proof`,
    gameReview: `tmp/movement-replay-lab/${safeLabel}-game-visual-proof-review.md`,
    gameReviewDecisions: `tmp/movement-replay-lab/${safeLabel}-game-visual-proof-review-decisions.template.json`,
    semanticReviewDecisions: `tmp/movement-replay-lab/${safeLabel}-game-visual-proof-review-decisions.codex-semantic-review.json`,
  };
  const commands = [
    {
      id: "initial-analysis",
      command: `npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-ids ${recordingIdValue} --include-standing-upper-body-targets --include-broad-upper-body-product-scope-proof --out ${paths.analysis} --manifest-out ${paths.manifest}`,
    },
    {
      id: "replay-session-export",
      command: `npx -p node@22.13.0 npm run movement:replay:export-session -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-id ${recordingIdValue} --out ${paths.replaySession}`,
    },
    {
      id: "replay-proof-set",
      command: `npx -p node@22.13.0 npm run movement:replay:proof-set -- --analysis ${paths.analysis} --manifest ${paths.manifest} --out ${paths.replayCapture} --debug-session-json ${paths.replaySession} --base-url http://localhost:3100 --local-test-auth --secret sonae-local-test-auth`,
    },
    {
      id: "replay-review",
      command: `npx -p node@22.13.0 npm run movement:replay:review -- --manifest ${paths.manifest} --captures ${paths.replayCapture} --out ${paths.replayReview} --decisions-out ${paths.replayReviewDecisions}`,
    },
    {
      id: "reviewed-analysis",
      command: `npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-ids ${recordingIdValue} --include-standing-upper-body-targets --include-broad-upper-body-product-scope-proof --visual-captures ${paths.replayCapture} --review-decisions ${paths.replayReviewDecisions} --out ${paths.reviewedAnalysis} --manifest-out ${paths.reviewedManifest}`,
    },
    {
      id: "focused-game-visual-plan",
      command: `npx -p node@22.13.0 npm run movement:game-visual-plan -- --analysis ${paths.reviewedAnalysis} --out ${paths.gameVisualPlan} --base-url http://localhost:3100 ${BROAD_UPPER_BODY_GAME_PROOF_CASES.map((proofCase) => `--proof-case ${proofCase}`).join(" ")}`,
    },
    {
      id: "focused-game-visual-capture",
      command: `npx -p node@22.13.0 npm run movement:game-visual-capture -- --base-url http://localhost:3100 --plan ${paths.gameVisualPlan} --out ${paths.gameCapture} --local-test-auth --secret sonae-local-test-auth`,
    },
    {
      id: "focused-game-visual-review",
      command: `npx -p node@22.13.0 npm run movement:game-visual-review -- --manifest ${paths.gameCapture}/game-visual-proof-captures-manifest.json --out ${paths.gameReview} --decisions-out ${paths.gameReviewDecisions}`,
    },
    {
      id: "merged-readiness-audit",
      command: `npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --manifest ${paths.reviewedManifest} --game-visual-plan tmp/movement-replay-lab/current-game-visual-proof-plan.json --game-visual-plan ${paths.gameVisualPlan} --semantic-review tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json --semantic-review ${paths.semanticReviewDecisions} --strict`,
    },
  ];

  return {
    commands,
    paths,
    recordingId,
    recordingIdValue,
    safeLabel,
  };
}

export function formatBroadCaptureGuide(audit, {
  captureContractPath = "<capture-contract-file>",
  captureLabel = defaultBroadCaptureLabel,
  recordingId = null,
} = {}) {
  const workflow = buildBroadCaptureWorkflow({ captureLabel, recordingId });
  const commandById = Object.fromEntries(workflow.commands.map((command) => [command.id, command.command]));
  const usesDefaultCaptureContract = captureContractPath === defaultBroadCaptureContractPath;
  const contractPreflightCommand = usesDefaultCaptureContract
    ? "npx -p node@22.13.0 npm run movement:upper-body-standing-capture-preflight"
    : `npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --capture-contract-preflight ${captureContractPath}`;
  const contractReadyCommand = usesDefaultCaptureContract
    ? "npx -p node@22.13.0 npm run movement:upper-body-standing-capture-ready"
    : `npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --capture-contract-preflight ${captureContractPath} --strict`;
  const contractFinalAuditCommand = usesDefaultCaptureContract
    ? "npx -p node@22.13.0 npm run movement:upper-body-standing-capture-final-audit"
    : `npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --capture-contract ${captureContractPath}`;

  return [
    "# Broad Upper-Body Standing Explicit Capture Guide",
    "",
    "This guide is for one intentional broad upper-body bundle. It does not promote broad `upper-body-standing`; promotion still requires passed recorded proof rows and readable Game targets.",
    "",
    `Suggested recording label: \`${workflow.safeLabel}\``,
    `Workflow state: ${broadCaptureWorkflowState(recordingId)}`,
    `Next action: ${broadCaptureNextWorkflowAction(recordingId)}`,
    `Current audit decision: ${audit.decision}`,
    `Missing broad passed proof cases: ${formatList(audit.missingBroadPassedProofCases)}`,
    `Missing broad readable Game cases: ${formatList(audit.missingBroadReadableGameCases)}`,
    "",
    "## Capture Protocol",
    "",
    ...BROAD_UPPER_BODY_CAPTURE_PROTOCOL.map((item) => `- ${item}`),
    "",
    "## Acceptance Checklist",
    "",
    ...BROAD_UPPER_BODY_ACCEPTANCE_CHECKLIST.map((item) => `- [ ] ${item}`),
    "",
    "## After Capture",
    "",
    recordingId
      ? `This guide was generated for recording id \`${recordingId}\`, so the commands below are ready to run after checking paths and local services.`
      : "Replace `<new-recording-id>` with the saved Movement recording id for this explicit bundle, or pass `--recording-id <id>` to generate executable commands after the recording is saved.",
    "",
    "```bash",
    commandById["initial-analysis"],
    "```",
    "",
    "```bash",
    commandById["replay-session-export"],
    "```",
    "",
    "```bash",
    commandById["replay-proof-set"],
    "```",
    "",
    "```bash",
    commandById["replay-review"],
    "```",
    "",
    "Review the Replay proof checklist, then refresh the analysis with the visual captures:",
    "",
    "```bash",
    commandById["reviewed-analysis"],
    "```",
    "",
    "```bash",
    commandById["focused-game-visual-plan"],
    "```",
    "",
    "```bash",
    commandById["focused-game-visual-capture"],
    "```",
    "",
    "```bash",
    commandById["focused-game-visual-review"],
    "```",
    "",
    "Fill the semantic review decisions, then run the merged readiness audit:",
    "",
    "```bash",
    commandById["merged-readiness-audit"],
    "```",
    "",
    "If you generated a JSON capture contract, the final merged audit can load those paths directly:",
    "",
    "Run the contract preflight first. It reports staged workflow progress, the next command if the workflow is partly complete, and whether the strict final audit is ready:",
    "",
    "```bash",
    contractPreflightCommand,
    "```",
    "",
    "Use the strict ready gate when automation should fail until the contract is ready:",
    "",
    "```bash",
    contractReadyCommand,
    "```",
    "",
    "```bash",
    contractFinalAuditCommand,
    "```",
    "",
  ].join("\n");
}

export function formatBroadCaptureContract(audit, {
  captureLabel = defaultBroadCaptureLabel,
  recordingId = null,
} = {}) {
  const workflow = buildBroadCaptureWorkflow({ captureLabel, recordingId });

  return {
    acceptanceChecklist: BROAD_UPPER_BODY_ACCEPTANCE_CHECKLIST,
    auditDecision: audit.decision,
    broadPassedProofCandidates: audit.broadPassedProofCandidates,
    broadPassingRecordingIds: audit.broadPassingRecordingIds,
    broadReady: audit.broadReady,
    captureProtocol: BROAD_UPPER_BODY_CAPTURE_PROTOCOL,
    captureWorkflowState: broadCaptureWorkflowState(recordingId),
    commands: workflow.commands,
    missingBroadGamePlanCases: audit.missingBroadGamePlanCases,
    missingBroadManifestProofCases: audit.missingBroadManifestProofCases,
    missingBroadPassedProofCases: audit.missingBroadPassedProofCases,
    missingBroadReadableGameCases: audit.missingBroadReadableGameCases,
    nextWorkflowAction: broadCaptureNextWorkflowAction(recordingId),
    paths: workflow.paths,
    productScopedBroadEvidenceCandidates: audit.productScopedBroadEvidenceCandidates.slice(0, 3),
    productScopedBroadEvidenceRecordingIds: audit.productScopedBroadEvidenceRecordingIds,
    recordingId,
    recordingIdPlaceholder: recordingId ? null : "<new-recording-id>",
    requiredGameProofCases: BROAD_UPPER_BODY_GAME_PROOF_CASES,
    requiredRecordedProofCases: audit.requirements.broadManifestProofCases,
    safeLabel: workflow.safeLabel,
    schema: BROAD_UPPER_BODY_CAPTURE_CONTRACT_SCHEMA,
    supportClaimBlockers: broadSupportClaimBlockers(audit),
    supportClaimStatus: broadSupportClaimStatus(audit),
  };
}

export function validateBroadCaptureContractShape(contract) {
  const issues = [];
  const commandIds = Array.isArray(contract?.commands)
    ? contract.commands.map((command) => command.id)
    : [];
  const commands = Array.isArray(contract?.commands) ? contract.commands : [];
  const finalAuditCommand = commandById(commands, "merged-readiness-audit");
  const requiredRecordedProofCases = Array.isArray(contract?.requiredRecordedProofCases)
    ? contract.requiredRecordedProofCases
    : [];
  const requiredGameProofCases = Array.isArray(contract?.requiredGameProofCases)
    ? contract.requiredGameProofCases
    : [];

  if (contract?.schema !== BROAD_UPPER_BODY_CAPTURE_CONTRACT_SCHEMA) {
    issues.push(`expected schema ${BROAD_UPPER_BODY_CAPTURE_CONTRACT_SCHEMA}`);
  }
  if (!arraysEqual(commandIds, BROAD_UPPER_BODY_CAPTURE_COMMAND_IDS)) {
    issues.push(`expected command ids ${BROAD_UPPER_BODY_CAPTURE_COMMAND_IDS.join(",")}`);
  }
  if (!arraysEqual(requiredRecordedProofCases, UPPER_BODY_STANDING_SUPPORT_REQUIREMENTS.broadManifestProofCases)) {
    issues.push(`expected recorded proof cases ${UPPER_BODY_STANDING_SUPPORT_REQUIREMENTS.broadManifestProofCases.join(",")}`);
  }
  if (!arraysEqual(requiredGameProofCases, BROAD_UPPER_BODY_GAME_PROOF_CASES)) {
    issues.push(`expected Game proof cases ${BROAD_UPPER_BODY_GAME_PROOF_CASES.join(",")}`);
  }
  if (!BROAD_UPPER_BODY_CAPTURE_WORKFLOW_STATES.includes(contract?.captureWorkflowState)) {
    issues.push(`expected captureWorkflowState ${BROAD_UPPER_BODY_CAPTURE_WORKFLOW_STATES.join("|")}`);
  }
  if (!isNonEmptyString(contract?.nextWorkflowAction)) {
    issues.push("expected nextWorkflowAction non-empty string");
  }
  if (
    BROAD_UPPER_BODY_CAPTURE_WORKFLOW_STATES.includes(contract?.captureWorkflowState) &&
    contract.captureWorkflowState !== broadCaptureWorkflowState(contract?.recordingId)
  ) {
    issues.push("expected captureWorkflowState to match recordingId presence");
  }
  if (!Array.isArray(contract?.broadPassingRecordingIds)) {
    issues.push("expected broadPassingRecordingIds array");
  } else if (!contract.broadPassingRecordingIds.every(isNonEmptyString)) {
    issues.push("expected broadPassingRecordingIds to contain non-empty strings");
  }
  if (!Array.isArray(contract?.broadPassedProofCandidates)) {
    issues.push("expected broadPassedProofCandidates array");
  } else {
    contract.broadPassedProofCandidates.forEach((candidate, index) => {
      const prefix = `expected broadPassedProofCandidates[${index}]`;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        issues.push(`${prefix} object`);
        return;
      }
      if (!isNonEmptyString(candidate.recordingId)) {
        issues.push(`${prefix}.recordingId non-empty string`);
      }
      if (!Number.isInteger(candidate.passedProofCaseCount)) {
        issues.push(`${prefix}.passedProofCaseCount integer`);
      }
      [
        "missingPassedProofCases",
        "passedProofCases",
      ].forEach((key) => {
        if (!Array.isArray(candidate[key])) {
          issues.push(`${prefix}.${key} array`);
        } else if (!candidate[key].every((proofCase) => requiredRecordedProofCases.includes(proofCase))) {
          issues.push(`${prefix}.${key} to contain only required recorded proof cases`);
        }
      });
      if (
        Number.isInteger(candidate.passedProofCaseCount) &&
        Array.isArray(candidate.passedProofCases) &&
        candidate.passedProofCaseCount !== candidate.passedProofCases.length
      ) {
        issues.push(`${prefix}.passedProofCaseCount to match passedProofCases length`);
      }
    });
  }
  if (Array.isArray(contract?.productScopedBroadEvidenceCandidates)) {
    contract.productScopedBroadEvidenceCandidates.forEach((candidate, index) => {
      const prefix = `expected productScopedBroadEvidenceCandidates[${index}]`;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        issues.push(`${prefix} object`);
        return;
      }
      if (!isNonEmptyString(candidate.recordingId)) {
        issues.push(`${prefix}.recordingId non-empty string`);
      }
      if (!Number.isInteger(candidate.totalEvidenceFrameCount)) {
        issues.push(`${prefix}.totalEvidenceFrameCount integer`);
      }
      if (!Array.isArray(candidate.missingProductScopedEvidenceCases)) {
        issues.push(`${prefix}.missingProductScopedEvidenceCases array`);
      } else if (!candidate.missingProductScopedEvidenceCases.every((proofCase) => requiredRecordedProofCases.includes(proofCase))) {
        issues.push(`${prefix}.missingProductScopedEvidenceCases to contain only required recorded proof cases`);
      }
      if (!candidate.proofCaseEvidence || typeof candidate.proofCaseEvidence !== "object" || Array.isArray(candidate.proofCaseEvidence)) {
        issues.push(`${prefix}.proofCaseEvidence object`);
      }
    });
  }
  if (
    Array.isArray(contract?.productScopedBroadEvidenceRecordingIds) &&
    !contract.productScopedBroadEvidenceRecordingIds.every(isNonEmptyString)
  ) {
    issues.push("expected productScopedBroadEvidenceRecordingIds to contain non-empty strings");
  }
  const topLevelCaseDomains = {
    missingBroadGamePlanCases: requiredGameProofCases,
    missingBroadManifestProofCases: requiredRecordedProofCases,
    missingBroadPassedProofCases: requiredRecordedProofCases,
    missingBroadReadableGameCases: requiredGameProofCases,
  };
  Object.entries(topLevelCaseDomains).forEach(([key, allowedCases]) => {
    if (!Array.isArray(contract?.[key])) {
      issues.push(`expected ${key} array`);
    } else if (!contract[key].every((proofCase) => allowedCases.includes(proofCase))) {
      issues.push(`expected ${key} to contain only required proof cases`);
    }
  });
  if (typeof contract?.broadReady !== "boolean") {
    issues.push("expected broadReady boolean");
  }
  if (!BROAD_UPPER_BODY_SUPPORT_CLAIM_STATUSES.includes(contract?.supportClaimStatus)) {
    issues.push(`expected supportClaimStatus ${BROAD_UPPER_BODY_SUPPORT_CLAIM_STATUSES.join("|")}`);
  }
  if (
    typeof contract?.broadReady === "boolean" &&
    BROAD_UPPER_BODY_SUPPORT_CLAIM_STATUSES.includes(contract?.supportClaimStatus)
  ) {
    const expectedStatus = contract.broadReady
      ? "ready-for-scoped-support-review"
      : "blocked-internal-demo-only";
    if (contract.supportClaimStatus !== expectedStatus) {
      issues.push(`expected supportClaimStatus ${expectedStatus} when broadReady is ${contract.broadReady}`);
    }
  }
  const supportClaimBlockers = contract?.supportClaimBlockers;
  if (!supportClaimBlockers || typeof supportClaimBlockers !== "object" || Array.isArray(supportClaimBlockers)) {
    issues.push("expected supportClaimBlockers object");
  } else {
    const blockerCaseDomains = {
      missingBroadGamePlanCases: requiredGameProofCases,
      missingBroadManifestProofCases: requiredRecordedProofCases,
      missingBroadPassedProofCases: requiredRecordedProofCases,
      missingBroadReadableGameCases: requiredGameProofCases,
    };
    Object.entries(blockerCaseDomains).forEach(([key, allowedCases]) => {
      if (!Array.isArray(supportClaimBlockers[key])) {
        issues.push(`expected supportClaimBlockers.${key} array`);
      } else if (!supportClaimBlockers[key].every((proofCase) => allowedCases.includes(proofCase))) {
        issues.push(`expected supportClaimBlockers.${key} to contain only required proof cases`);
      }
    });
    if (typeof supportClaimBlockers.requiresSinglePassingRecordingBundle !== "boolean") {
      issues.push("expected supportClaimBlockers.requiresSinglePassingRecordingBundle boolean");
    }
    if (
      Array.isArray(contract?.broadPassingRecordingIds) &&
      typeof supportClaimBlockers.requiresSinglePassingRecordingBundle === "boolean" &&
      supportClaimBlockers.requiresSinglePassingRecordingBundle !== (contract.broadPassingRecordingIds.length === 0)
    ) {
      issues.push("expected supportClaimBlockers.requiresSinglePassingRecordingBundle to match broadPassingRecordingIds");
    }
    if (
      Array.isArray(contract?.missingBroadGamePlanCases) &&
      Array.isArray(supportClaimBlockers.missingBroadGamePlanCases) &&
      !arraysEqual(contract.missingBroadGamePlanCases, supportClaimBlockers.missingBroadGamePlanCases)
    ) {
      issues.push("expected supportClaimBlockers.missingBroadGamePlanCases to match missingBroadGamePlanCases");
    }
    if (
      Array.isArray(contract?.missingBroadManifestProofCases) &&
      Array.isArray(supportClaimBlockers.missingBroadManifestProofCases) &&
      !arraysEqual(contract.missingBroadManifestProofCases, supportClaimBlockers.missingBroadManifestProofCases)
    ) {
      issues.push("expected supportClaimBlockers.missingBroadManifestProofCases to match missingBroadManifestProofCases");
    }
    if (
      Array.isArray(contract?.missingBroadPassedProofCases) &&
      Array.isArray(supportClaimBlockers.missingBroadPassedProofCases) &&
      !arraysEqual(contract.missingBroadPassedProofCases, supportClaimBlockers.missingBroadPassedProofCases)
    ) {
      issues.push("expected supportClaimBlockers.missingBroadPassedProofCases to match missingBroadPassedProofCases");
    }
    if (
      Array.isArray(contract?.missingBroadReadableGameCases) &&
      Array.isArray(supportClaimBlockers.missingBroadReadableGameCases) &&
      !arraysEqual(contract.missingBroadReadableGameCases, supportClaimBlockers.missingBroadReadableGameCases)
    ) {
      issues.push("expected supportClaimBlockers.missingBroadReadableGameCases to match missingBroadReadableGameCases");
    }
    if (contract?.broadReady === true) {
      const blockerCaseKeys = [
        "missingBroadGamePlanCases",
        "missingBroadManifestProofCases",
        "missingBroadPassedProofCases",
        "missingBroadReadableGameCases",
      ];
      const hasBlockingCases = blockerCaseKeys.some((key) => (
        Array.isArray(supportClaimBlockers[key]) && supportClaimBlockers[key].length > 0
      ));
      if (hasBlockingCases || supportClaimBlockers.requiresSinglePassingRecordingBundle === true) {
        issues.push("expected supportClaimBlockers to be empty when broadReady is true");
      }
    }
  }
  if (!/\s--strict(?:\s|$)/.test(finalAuditCommand)) {
    issues.push("expected merged-readiness-audit command to include --strict");
  }
  const paths = contract?.paths ?? null;
  if (paths && typeof paths === "object") {
    const commandPathRequirements = [
      {
        id: "initial-analysis",
        paths: [paths.analysis, paths.manifest],
      },
      {
        id: "replay-session-export",
        paths: [paths.replaySession],
      },
      {
        id: "replay-proof-set",
        paths: [paths.analysis, paths.manifest, paths.replaySession, paths.replayCapture],
      },
      {
        id: "replay-review",
        paths: [paths.manifest, paths.replayCapture, paths.replayReview, paths.replayReviewDecisions],
      },
      {
        id: "reviewed-analysis",
        paths: [paths.replayCapture, paths.replayReviewDecisions, paths.reviewedAnalysis, paths.reviewedManifest],
      },
      {
        id: "focused-game-visual-plan",
        paths: [paths.reviewedAnalysis, paths.gameVisualPlan],
      },
      {
        id: "focused-game-visual-capture",
        paths: [paths.gameVisualPlan, paths.gameCapture],
      },
      {
        id: "focused-game-visual-review",
        paths: [paths.gameCapture, paths.gameReview, paths.gameReviewDecisions],
      },
      {
        id: "merged-readiness-audit",
        paths: [paths.reviewedManifest, paths.gameVisualPlan, paths.semanticReviewDecisions],
      },
    ];
    commandPathRequirements.forEach(({ id, paths: expectedPaths }) => {
      const missingPaths = expectedPaths
        .filter((expectedPath) => (
          typeof expectedPath !== "string" ||
          expectedPath.length === 0 ||
          !commandIncludesAll(commandById(commands, id), [expectedPath])
        ))
        .map((expectedPath) => expectedPath || "<missing>");
      if (missingPaths.length > 0) {
        issues.push(`expected ${id} command to reference contract path(s): ${missingPaths.join(",")}`);
      }
    });
  }

  return issues;
}

export function applyBroadCaptureContractArgs(args, contract) {
  const paths = contract?.paths ?? {};
  const requiredPaths = [
    "reviewedManifest",
    "gameVisualPlan",
    "semanticReviewDecisions",
  ];
  const missingPaths = requiredPaths.filter((key) => typeof paths[key] !== "string" || paths[key].length === 0);
  if (missingPaths.length > 0) {
    throw new Error(`Broad capture contract is missing path(s): ${missingPaths.join(", ")}`);
  }

  return {
    ...args,
    gameVisualPlanPaths: [
      defaultGameVisualPlanPath,
      paths.gameVisualPlan,
    ],
    gameVisualPlanPathsAreDefault: false,
    manifestPath: paths.reviewedManifest,
    semanticReviewPaths: [
      defaultSemanticReviewPath,
      paths.semanticReviewDecisions,
    ],
    semanticReviewPathsAreDefault: false,
    strict: true,
  };
}

export function validateBroadCaptureContractAuditArtifacts(contract, {
  fileExists = existsSync,
  rootDir = process.cwd(),
} = {}) {
  const paths = contract?.paths ?? {};
  const requiredArtifacts = [
    {
      key: "reviewedManifest",
      nextAction: "run the reviewed-analysis command from the capture contract",
    },
    {
      key: "gameVisualPlan",
      nextAction: "run the focused-game-visual-plan command from the capture contract",
    },
    {
      key: "semanticReviewDecisions",
      nextAction: "fill the focused Game semantic review decisions after running focused-game-visual-review",
    },
  ];

  return requiredArtifacts
    .filter(({ key }) => {
      const artifactPath = paths[key];
      return typeof artifactPath !== "string" || artifactPath.length === 0 ||
        !fileExists(path.resolve(rootDir, artifactPath));
    })
    .map(({ key, nextAction }) => ({
      key,
      nextAction,
      path: paths[key] ?? null,
    }));
}

export function validateBroadCaptureContractSemanticReview(contract, semanticReview) {
  const requiredGameProofCases = Array.isArray(contract?.requiredGameProofCases)
    ? contract.requiredGameProofCases
    : BROAD_UPPER_BODY_GAME_PROOF_CASES;
  const decisions = Array.isArray(semanticReview?.decisions) ? semanticReview.decisions : [];

  return requiredGameProofCases
    .map((proofCase) => {
      const matchingDecisions = decisions.filter((decision) => (
        Array.isArray(decision?.reviewContext?.cases) &&
        decision.reviewContext.cases.includes(proofCase)
      ));
      if (matchingDecisions.some((decision) => decision.decision === "readable-pass")) {
        return null;
      }
      const observedDecisions = Array.from(new Set(
        matchingDecisions.map((decision) => decision.decision || "TODO"),
      )).sort();

      return {
        observedDecisions,
        proofCase,
        nextAction: matchingDecisions.length === 0
          ? "run focused-game-visual-review and add this proof case to the semantic review decisions"
          : "review the focused Game capture and mark this proof case readable-pass only if the screenshot supports it",
      };
    })
    .filter(Boolean);
}

export function validateBroadCaptureContractGameVisualPlan(contract, gameVisualPlan) {
  const requiredGameProofCases = Array.isArray(contract?.requiredGameProofCases)
    ? contract.requiredGameProofCases
    : BROAD_UPPER_BODY_GAME_PROOF_CASES;
  const plannedProofCases = planProofCases(gameVisualPlan);

  return requiredGameProofCases
    .filter((proofCase) => !plannedProofCases.includes(proofCase))
    .map((proofCase) => ({
      plannedProofCases,
      proofCase,
      nextAction: "rerun focused-game-visual-plan from the capture contract so the broad Game proof case is captured and reviewed",
    }));
}

export function summarizeBroadCaptureContractWorkflowProgress(contract, {
  fileExists = existsSync,
  rootDir = process.cwd(),
} = {}) {
  const commands = Array.isArray(contract?.commands) ? contract.commands : [];
  const paths = contract?.paths ?? {};
  const artifactInDir = (dirPath, fileName) => (
    typeof dirPath === "string" && dirPath.length > 0 ? `${dirPath}/${fileName}` : null
  );
  const resolveExists = (artifactPath) => (
    typeof artifactPath === "string" &&
    artifactPath.length > 0 &&
    fileExists(path.resolve(rootDir, artifactPath))
  );
  const stages = [
    {
      commandId: "initial-analysis",
      label: "initial explicit broad analysis",
      requiredArtifacts: [
        { key: "analysis", path: paths.analysis },
        { key: "manifest", path: paths.manifest },
      ],
    },
    {
      commandId: "replay-session-export",
      label: "Replay Lab session fixture export",
      requiredArtifacts: [
        { key: "replaySession", path: paths.replaySession },
      ],
    },
    {
      commandId: "replay-proof-set",
      label: "Replay proof-set capture",
      requiredArtifacts: [
        { key: "replaySession", path: paths.replaySession },
        { key: "replayCapture", path: artifactInDir(paths.replayCapture, "movement-replay-proof-set-manifest.json") },
      ],
    },
    {
      commandId: "replay-review",
      label: "Replay proof review",
      requiredArtifacts: [
        { key: "replayReview", path: paths.replayReview },
        { key: "replayReviewDecisions", path: paths.replayReviewDecisions },
      ],
    },
    {
      commandId: "reviewed-analysis",
      label: "reviewed explicit broad analysis",
      requiredArtifacts: [
        { key: "reviewedAnalysis", path: paths.reviewedAnalysis },
        { key: "reviewedManifest", path: paths.reviewedManifest },
      ],
    },
    {
      commandId: "focused-game-visual-plan",
      label: "focused broad Game visual plan",
      requiredArtifacts: [
        { key: "gameVisualPlan", path: paths.gameVisualPlan },
      ],
    },
    {
      commandId: "focused-game-visual-capture",
      label: "focused broad Game visual capture",
      requiredArtifacts: [
        { key: "gameCapture", path: artifactInDir(paths.gameCapture, "game-visual-proof-captures-manifest.json") },
      ],
    },
    {
      commandId: "focused-game-visual-review",
      label: "focused broad Game visual review",
      requiredArtifacts: [
        { key: "gameReview", path: paths.gameReview },
        { key: "gameReviewDecisions", path: paths.gameReviewDecisions },
      ],
    },
    {
      commandId: "fill-focused-semantic-review",
      label: "filled focused semantic review decisions",
      requiredArtifacts: [
        { key: "semanticReviewDecisions", path: paths.semanticReviewDecisions },
      ],
    },
  ].map((stage) => {
    const missingArtifacts = stage.requiredArtifacts.filter(({ path: artifactPath }) => !resolveExists(artifactPath));
    return {
      ...stage,
      command: commandById(commands, stage.commandId),
      complete: missingArtifacts.length === 0,
      missingArtifacts,
    };
  });
  const nextStage = contract?.recordingId
    ? stages.find((stage) => !stage.complete) ?? null
    : null;
  const recordingBound = isNonEmptyString(contract?.recordingId);
  const recordingIdHandoffCommand = "npx -p node@22.13.0 npm run movement:upper-body-standing-capture-handoff -- --recording-id <new-recording-id>";

  return {
    nextCommand: nextStage?.command || (recordingBound ? null : recordingIdHandoffCommand),
    nextCommandId: nextStage?.commandId ?? (recordingBound ? null : "bind-recording-id"),
    nextStageLabel: nextStage?.label ?? (recordingBound ? "strict final audit" : "capture or tag one explicit broad upper-body recording"),
    recordingBound,
    stages,
  };
}

export async function preflightBroadCaptureContractForFinalAudit(contract, {
  fileExists = existsSync,
  rootDir = process.cwd(),
  readJson = async (artifactPath) => JSON.parse(await readFile(path.resolve(rootDir, artifactPath), "utf8")),
} = {}) {
  const shapeIssues = validateBroadCaptureContractShape(contract);
  const workflowProgress = summarizeBroadCaptureContractWorkflowProgress(contract, { fileExists, rootDir });
  const report = {
    artifactPreflightStatus: "not-checked",
    broadPassingRecordingIds: Array.isArray(contract?.broadPassingRecordingIds)
      ? contract.broadPassingRecordingIds
      : [],
    captureWorkflowState: contract?.captureWorkflowState ?? null,
    gameVisualPlanIssues: [],
    missingBroadGamePlanCases: Array.isArray(contract?.missingBroadGamePlanCases)
      ? contract.missingBroadGamePlanCases
      : [],
    missingBroadManifestProofCases: Array.isArray(contract?.missingBroadManifestProofCases)
      ? contract.missingBroadManifestProofCases
      : [],
    missingBroadPassedProofCases: Array.isArray(contract?.missingBroadPassedProofCases)
      ? contract.missingBroadPassedProofCases
      : [],
    missingBroadReadableGameCases: Array.isArray(contract?.missingBroadReadableGameCases)
      ? contract.missingBroadReadableGameCases
      : [],
    missingArtifacts: [],
    nextWorkflowAction: contract?.nextWorkflowAction ?? null,
    productScopedBroadEvidenceCandidates: Array.isArray(contract?.productScopedBroadEvidenceCandidates)
      ? contract.productScopedBroadEvidenceCandidates
      : [],
    productScopedBroadEvidenceRecordingIds: Array.isArray(contract?.productScopedBroadEvidenceRecordingIds)
      ? contract.productScopedBroadEvidenceRecordingIds
      : [],
    readyForFinalAudit: false,
    recordingId: contract?.recordingId ?? null,
    semanticReviewIssues: [],
    shapeIssues,
    supportClaimStatus: contract?.supportClaimStatus ?? null,
    workflowProgress,
  };
  if (shapeIssues.length > 0) {
    return report;
  }
  if (!workflowProgress.recordingBound) {
    report.artifactPreflightStatus = "waiting-for-recording-id";
    return report;
  }

  report.missingArtifacts = validateBroadCaptureContractAuditArtifacts(contract, { fileExists, rootDir });
  if (report.missingArtifacts.length > 0) {
    report.artifactPreflightStatus = "missing-artifacts";
    return report;
  }
  report.artifactPreflightStatus = "ready";

  const focusedGameVisualPlan = await readJson(contract.paths.gameVisualPlan);
  report.gameVisualPlanIssues = validateBroadCaptureContractGameVisualPlan(
    contract,
    focusedGameVisualPlan,
  );
  if (report.gameVisualPlanIssues.length > 0) {
    return report;
  }

  const focusedSemanticReview = await readJson(contract.paths.semanticReviewDecisions);
  report.semanticReviewIssues = validateBroadCaptureContractSemanticReview(
    contract,
    focusedSemanticReview,
  );
  report.readyForFinalAudit = report.semanticReviewIssues.length === 0;

  return report;
}

export function formatBroadCaptureContractPreflight(report) {
  const missingArtifactText = report.missingArtifacts
    .map((artifact) => `${artifact.key}${artifact.path ? ` (${artifact.path})` : ""}: ${artifact.nextAction}`);
  const gamePlanIssueText = report.gameVisualPlanIssues
    .map((issue) => `${issue.proofCase}: ${issue.nextAction}`);
  const semanticReviewIssueText = report.semanticReviewIssues
    .map((issue) => `${issue.proofCase} (${formatList(issue.observedDecisions)}): ${issue.nextAction}`);
  const stageSummary = report.workflowProgress?.stages
    ?.map((stage) => `${stage.commandId}:${stage.complete ? "complete" : "missing " + stage.missingArtifacts.map((artifact) => artifact.key).join(",")}`) ?? [];

  return [
    `Broad upper-body capture-contract preflight: ${report.readyForFinalAudit ? "ready" : "blocked"}`,
    `Workflow state: ${report.captureWorkflowState ?? "unknown"}.`,
    `Recording id: ${report.recordingId ?? "none"}.`,
    `Support claim status: ${report.supportClaimStatus ?? "unknown"}.`,
    `Broad passing recording ids: ${formatList(report.broadPassingRecordingIds)}.`,
    `Product-scoped broad evidence recording ids: ${formatList(report.productScopedBroadEvidenceRecordingIds)}.`,
    `Top product-scoped broad evidence candidates: ${formatCandidateSummary(report.productScopedBroadEvidenceCandidates) || "none"}.`,
    `Top candidate handoff command: ${topProductScopedCandidateHandoffCommand(report.productScopedBroadEvidenceCandidates) ?? "none"}.`,
    `Missing broad passed proof cases: ${formatList(report.missingBroadPassedProofCases)}.`,
    `Missing broad Game target-plan cases: ${formatList(report.missingBroadGamePlanCases)}.`,
    `Missing broad readable Game cases: ${formatList(report.missingBroadReadableGameCases)}.`,
    `Next action: ${report.nextWorkflowAction ?? "unknown"}.`,
    `Next workflow stage: ${report.workflowProgress?.nextStageLabel ?? "unknown"}.`,
    `Next workflow command id: ${report.workflowProgress?.nextCommandId ?? "none"}.`,
    `Next workflow command: ${report.workflowProgress?.nextCommand ?? "none"}.`,
    `Shape issues: ${formatList(report.shapeIssues)}.`,
    `Workflow stages: ${formatList(stageSummary)}.`,
    `Final-audit artifact check: ${report.artifactPreflightStatus ?? "unknown"}.`,
    `Missing artifacts: ${formatList(missingArtifactText)}.`,
    `Focused Game plan issues: ${formatList(gamePlanIssueText)}.`,
    `Focused semantic review issues: ${formatList(semanticReviewIssueText)}.`,
    `Strict final audit: ${report.readyForFinalAudit ? "ready to run" : "not ready"}.`,
  ].join("\n");
}

function formatAudit(audit) {
  return [
    `Upper-body standing support-readiness audit: ${audit.broadReady ? "passed" : "blocked"}`,
    audit.decision,
    `Narrow recorded proof bundles: ${audit.narrowPassingRecordingIds.length} (${formatList(audit.narrowPassingRecordingIds)}).`,
    `Broad recorded proof bundles: ${audit.broadPassingRecordingIds.length} (${formatList(audit.broadPassingRecordingIds)}).`,
    `Top broad passed-proof candidates: ${formatPassedProofCandidateSummary(audit.broadPassedProofCandidates) || "none"}.`,
    `Missing broad manifest proof definitions: ${formatList(audit.missingBroadManifestProofCases)}.`,
    `Missing broad passed proof cases: ${formatList(audit.missingBroadPassedProofCases)}.`,
    `Missing narrow Game target-plan cases: ${formatList(audit.missingNarrowGamePlanCases)}.`,
    `Missing narrow readable Game cases: ${formatList(audit.missingNarrowReadableGameCases)}.`,
    `Missing broad Game target-plan cases: ${formatList(audit.missingBroadGamePlanCases)}.`,
    `Missing broad readable Game cases: ${formatList(audit.missingBroadReadableGameCases)}.`,
    `Product-scoped broad evidence rows: ${formatEvidenceSummary(audit.productScopedBroadEvidenceSummary)}.`,
    `Recordings with product-scoped evidence for all broad cases: ${formatList(audit.productScopedBroadEvidenceRecordingIds)}.`,
    `Top broad evidence candidates: ${formatCandidateSummary(audit.productScopedBroadEvidenceCandidates) || "none"}.`,
    `Broad capture protocol if candidates are not acceptable: ${BROAD_UPPER_BODY_CAPTURE_PROTOCOL.join("; ")}.`,
  ].join("\n");
}

async function main() {
  let args = parseUpperBodyStandingSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.captureContractPreflightPath) {
    const captureContract = JSON.parse(await readFile(path.resolve(args.captureContractPreflightPath), "utf8"));
    const preflight = await preflightBroadCaptureContractForFinalAudit(captureContract);
    console.log(args.json ? JSON.stringify(preflight, null, 2) : formatBroadCaptureContractPreflight(preflight));
    if (args.strict && !preflight.readyForFinalAudit) {
      process.exitCode = 1;
    }
    return;
  }
  if (args.captureContractPath) {
    const captureContract = JSON.parse(await readFile(path.resolve(args.captureContractPath), "utf8"));
    const contractShapeIssues = validateBroadCaptureContractShape(captureContract);
    if (contractShapeIssues.length > 0) {
      throw new Error(`Broad capture contract is not valid for final audit: ${contractShapeIssues.join("; ")}`);
    }
    const missingContractArtifacts = validateBroadCaptureContractAuditArtifacts(captureContract);
    if (missingContractArtifacts.length > 0) {
      const missingText = missingContractArtifacts
        .map((artifact) => `${artifact.key}${artifact.path ? ` (${artifact.path})` : ""}: ${artifact.nextAction}`)
        .join("; ");
      throw new Error(`Broad capture contract is not ready for final audit: ${missingText}`);
    }
    const focusedGameVisualPlan = JSON.parse(
      await readFile(path.resolve(captureContract.paths.gameVisualPlan), "utf8"),
    );
    const gameVisualPlanIssues = validateBroadCaptureContractGameVisualPlan(
      captureContract,
      focusedGameVisualPlan,
    );
    if (gameVisualPlanIssues.length > 0) {
      const issueText = gameVisualPlanIssues
        .map((issue) => `${issue.proofCase}: ${issue.nextAction}`)
        .join("; ");
      throw new Error(`Broad capture contract Game visual plan is not ready for final audit: ${issueText}`);
    }
    const focusedSemanticReview = JSON.parse(
      await readFile(path.resolve(captureContract.paths.semanticReviewDecisions), "utf8"),
    );
    const semanticReviewIssues = validateBroadCaptureContractSemanticReview(
      captureContract,
      focusedSemanticReview,
    );
    if (semanticReviewIssues.length > 0) {
      const issueText = semanticReviewIssues
        .map((issue) => `${issue.proofCase} (${formatList(issue.observedDecisions)}): ${issue.nextAction}`)
        .join("; ");
      throw new Error(`Broad capture contract semantic review is not ready for final audit: ${issueText}`);
    }
    args = applyBroadCaptureContractArgs(args, captureContract);
  }
  args = resolveUpperBodyStandingSupportAuditArtifactPaths(args);
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
  if (args.recordingIdFromTopCandidate) {
    const topCandidate = audit.productScopedBroadEvidenceCandidates[0];
    if (!isNonEmptyString(topCandidate?.recordingId)) {
      throw new Error("No product-scoped broad evidence candidate is available to bind as recording id.");
    }
    args = {
      ...args,
      recordingId: topCandidate.recordingId,
    };
    console.error(`Resolved --recording-id-from-top-candidate to ${topCandidate.recordingId}`);
  }

  if (args.candidateReviewOutPath) {
    const candidateReviewPath = path.resolve(args.candidateReviewOutPath);
    await mkdir(path.dirname(candidateReviewPath), { recursive: true });
    await writeFile(candidateReviewPath, formatBroadCandidateReview(audit));
    console.error(`Wrote ${candidateReviewPath}`);
  }

  if (args.captureGuideOutPath) {
    const captureGuidePath = path.resolve(args.captureGuideOutPath);
    await mkdir(path.dirname(captureGuidePath), { recursive: true });
    await writeFile(captureGuidePath, formatBroadCaptureGuide(audit, {
      captureContractPath: args.captureContractOutPath || "<capture-contract-file>",
      captureLabel: args.captureLabel,
      recordingId: args.recordingId,
    }));
    console.error(`Wrote ${captureGuidePath}`);
  }

  if (args.captureContractOutPath) {
    const captureContractPath = path.resolve(args.captureContractOutPath);
    await mkdir(path.dirname(captureContractPath), { recursive: true });
    await writeFile(captureContractPath, `${JSON.stringify(formatBroadCaptureContract(audit, {
      captureLabel: args.captureLabel,
      recordingId: args.recordingId,
    }), null, 2)}\n`);
    console.error(`Wrote ${captureContractPath}`);
  }

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
