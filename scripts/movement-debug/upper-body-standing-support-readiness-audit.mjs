#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const defaultGameVisualPlanPath = "tmp/movement-replay-lab/current-game-visual-proof-plan.json";
const defaultSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";
const defaultBroadCaptureLabel = "movement-proof-upper-body-standing-broad-explicit";
const BROAD_UPPER_BODY_GAME_PROOF_CASES = [
  "strongest-standing-arm-raise",
  "strongest-standing-twist",
  "strongest-standing-reach",
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
                             Can be repeated for supplemental focused plans.
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
                             Can be repeated for supplemental focused reviews.
  --capture-contract <file>  Use a generated broad capture contract for the final merged audit inputs.
  --candidate-review-out <file>
                             Write a Markdown checklist for ranked broad evidence candidates.
  --capture-guide-out <file>
                             Write a Markdown guide for capturing and validating one explicit broad bundle.
  --capture-contract-out <file>
                             Write a JSON contract for the explicit broad capture workflow.
  --capture-label <label>    Suggested fresh recording label for --capture-guide-out.
                             Defaults to ${defaultBroadCaptureLabel}
  --recording-id <id>        Optional saved Movement recording id to write into --capture-guide-out commands.
  --strict                   Exit non-zero when broad upper-body support is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseUpperBodyStandingSupportReadinessAuditArgs(argv) {
  const args = {
    gameVisualPlanPaths: [defaultGameVisualPlanPath],
    captureContractPath: null,
    captureContractOutPath: null,
    captureGuideOutPath: null,
    captureLabel: defaultBroadCaptureLabel,
    candidateReviewOutPath: null,
    json: false,
    manifestPath: defaultManifestPath,
    recordingId: null,
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
    } else if (arg === "--capture-contract") {
      args.captureContractPath = argv[++index] || null;
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

function productScopedBroadEvidenceCandidates(groups, proofCases) {
  const recordingIds = new Set(
    proofCases.flatMap((proofCase) => (
      (groups[proofCase] ?? []).map((row) => row.recordingId)
    )),
  );

  return Array.from(recordingIds)
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

function formatCandidateSummary(candidates) {
  return candidates
    .slice(0, 3)
    .map((candidate) => (
      `${candidate.recordingId} ${candidate.totalEvidenceFrameCount} frame(s)` +
      `${candidate.missingProductScopedEvidenceCases.length > 0
        ? ` missing ${candidate.missingProductScopedEvidenceCases.join(",")}`
        : ""}`
    ))
    .join("; ");
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

function buildBroadCaptureWorkflow({
  captureLabel = defaultBroadCaptureLabel,
  recordingId = null,
} = {}) {
  const safeLabel = shellValue(captureLabel || defaultBroadCaptureLabel);
  const recordingIdValue = recordingId ? shellArg(recordingId) : "<new-recording-id>";
  const paths = {
    analysis: `tmp/movement-replay-lab/${safeLabel}-analysis.json`,
    manifest: `tmp/movement-replay-lab/${safeLabel}-analysis.proof-manifest.json`,
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
      id: "replay-proof-set",
      command: `npx -p node@22.13.0 npm run movement:replay:proof-set -- --analysis ${paths.analysis} --manifest ${paths.manifest} --out ${paths.replayCapture} --base-url http://localhost:3100 --local-test-auth --secret sonae-local-test-auth`,
    },
    {
      id: "replay-review",
      command: `npx -p node@22.13.0 npm run movement:replay:review -- --manifest ${paths.manifest} --captures ${paths.replayCapture} --out ${paths.replayReview} --decisions-out ${paths.replayReviewDecisions}`,
    },
    {
      id: "reviewed-analysis",
      command: `npx -p node@22.13.0 npm run movement:replay:analyze -- --export "$(cat tmp/movement-replay-lab/runs/latest-export-path.txt)" --recording-ids ${recordingIdValue} --include-standing-upper-body-targets --include-broad-upper-body-product-scope-proof --visual-captures ${paths.replayCapture} --out ${paths.reviewedAnalysis} --manifest-out ${paths.reviewedManifest}`,
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
      command: `npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --manifest ${paths.reviewedManifest} --game-visual-plan tmp/movement-replay-lab/current-game-visual-proof-plan.json --game-visual-plan ${paths.gameVisualPlan} --semantic-review tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json --semantic-review ${paths.semanticReviewDecisions}`,
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
  captureLabel = defaultBroadCaptureLabel,
  recordingId = null,
} = {}) {
  const workflow = buildBroadCaptureWorkflow({ captureLabel, recordingId });
  const commandById = Object.fromEntries(workflow.commands.map((command) => [command.id, command.command]));

  return [
    "# Broad Upper-Body Standing Explicit Capture Guide",
    "",
    "This guide is for one intentional broad upper-body bundle. It does not promote broad `upper-body-standing`; promotion still requires passed recorded proof rows and readable Game targets.",
    "",
    `Suggested recording label: \`${workflow.safeLabel}\``,
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
    "```bash",
    "npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit -- --capture-contract <capture-contract-file>",
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
    broadReady: audit.broadReady,
    captureProtocol: BROAD_UPPER_BODY_CAPTURE_PROTOCOL,
    commands: workflow.commands,
    missingBroadPassedProofCases: audit.missingBroadPassedProofCases,
    missingBroadReadableGameCases: audit.missingBroadReadableGameCases,
    paths: workflow.paths,
    recordingId,
    recordingIdPlaceholder: recordingId ? null : "<new-recording-id>",
    requiredGameProofCases: BROAD_UPPER_BODY_GAME_PROOF_CASES,
    requiredRecordedProofCases: audit.requirements.broadManifestProofCases,
    safeLabel: workflow.safeLabel,
    schema: "sonae-broad-upper-body-capture-contract/v1",
  };
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
    manifestPath: paths.reviewedManifest,
    semanticReviewPaths: [
      defaultSemanticReviewPath,
      paths.semanticReviewDecisions,
    ],
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
    `Top broad evidence candidates: ${formatCandidateSummary(audit.productScopedBroadEvidenceCandidates) || "none"}.`,
    `Broad capture protocol if candidates are not acceptable: ${BROAD_UPPER_BODY_CAPTURE_PROTOCOL.join("; ")}.`,
  ].join("\n");
}

async function main() {
  let args = parseUpperBodyStandingSupportReadinessAuditArgs(process.argv.slice(2));
  if (args.captureContractPath) {
    const captureContract = JSON.parse(await readFile(path.resolve(args.captureContractPath), "utf8"));
    const missingContractArtifacts = validateBroadCaptureContractAuditArtifacts(captureContract);
    if (missingContractArtifacts.length > 0) {
      const missingText = missingContractArtifacts
        .map((artifact) => `${artifact.key}${artifact.path ? ` (${artifact.path})` : ""}: ${artifact.nextAction}`)
        .join("; ");
      throw new Error(`Broad capture contract is not ready for final audit: ${missingText}`);
    }
    args = applyBroadCaptureContractArgs(args, captureContract);
  }
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
