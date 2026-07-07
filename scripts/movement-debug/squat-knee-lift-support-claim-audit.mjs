#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const defaultSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";

export const SQUAT_KNEE_LIFT_SUPPORT_REQUIREMENTS = {
  manifestProofCases: [
    "standing",
    "squat",
    "left-leg-raise",
    "right-leg-raise",
    "mirror-side-ownership",
  ],
  readableGameCases: [
    "baseline",
    "strongest-squat",
    "strongest-left-leg-lift",
    "strongest-right-leg-lift",
    "first-source-display-divergence",
  ],
  readableGameLabelChecks: {
    baseline: { displayLowerLabel: "neutral" },
    "first-source-display-divergence": {},
    "strongest-left-leg-lift": { displayLowerLabel: "left-knee-raise" },
    "strongest-right-leg-lift": { displayLowerLabel: "right-knee-raise" },
    "strongest-squat": { displayLowerLabel: "squat" },
  },
};

function printHelp() {
  console.log(`Audit whether squat-knee-lift is ready for a user-facing support claim.

Usage:
  npm run movement:squat-knee-lift-support-audit
  npm run movement:squat-knee-lift-support-audit -- --strict

Options:
  --manifest <file>          Reviewed proof manifest. Defaults to ${defaultManifestPath}
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
  --strict                   Exit non-zero when the support claim is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseSquatKneeLiftSupportClaimAuditArgs(argv) {
  const args = {
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

function rowsByRecording(manifest) {
  return (manifest?.rows ?? []).reduce((groups, row) => {
    const recordingId = row?.recordingId;
    if (!recordingId) return groups;
    groups[recordingId] ??= [];
    groups[recordingId].push(row);
    return groups;
  }, {});
}

function readableDecisionsByRecording(semanticReview) {
  return (semanticReview?.decisions ?? []).reduce((groups, row) => {
    const context = row?.reviewContext ?? {};
    const recordingId = context.recordingId;
    if (!recordingId || row.decision !== "readable-pass") return groups;
    groups[recordingId] ??= [];
    groups[recordingId].push(row);
    return groups;
  }, {});
}

function hasPassedProofCase(rows, proofCase) {
  return rows.some((row) => row.proofCase === proofCase && row.status === "passed");
}

function decisionMatchesCase(decision, visualCase, labelCheck) {
  const context = decision?.reviewContext ?? {};
  const cases = Array.isArray(context.cases) ? context.cases : [];
  if (!cases.includes(visualCase)) return false;
  return Object.entries(labelCheck ?? {}).every(([key, expected]) => context[key] === expected);
}

function firstMatchingDecision(decisions, visualCase, labelCheck) {
  return decisions.find((decision) => decisionMatchesCase(decision, visualCase, labelCheck)) ?? null;
}

function supportCandidateForRecording({
  decisions,
  recordingId,
  requirements,
  rows,
}) {
  const manifestProof = requirements.manifestProofCases.map((proofCase) => ({
    ok: hasPassedProofCase(rows, proofCase),
    proofCase,
  }));
  const gameReadability = requirements.readableGameCases.map((visualCase) => {
    const decision = firstMatchingDecision(
      decisions,
      visualCase,
      requirements.readableGameLabelChecks[visualCase],
    );
    return {
      decisionKey: decision?.key ?? null,
      frameIndex: decision?.reviewContext?.frameIndex ?? null,
      ok: Boolean(decision),
      recordingId,
      visualCase,
    };
  });
  const missingManifestProofCases = manifestProof
    .filter((result) => !result.ok)
    .map((result) => result.proofCase);
  const missingReadableGameCases = gameReadability
    .filter((result) => !result.ok)
    .map((result) => result.visualCase);

  return {
    gameReadability,
    manifestProof,
    missingManifestProofCases,
    missingReadableGameCases,
    ok: missingManifestProofCases.length === 0 && missingReadableGameCases.length === 0,
    recordingId,
  };
}

export function auditSquatKneeLiftSupportClaim({
  manifest,
  requirements = SQUAT_KNEE_LIFT_SUPPORT_REQUIREMENTS,
  semanticReview,
}) {
  const manifestGroups = rowsByRecording(manifest);
  const decisionGroups = readableDecisionsByRecording(semanticReview);
  const recordingIds = Array.from(new Set([
    ...Object.keys(manifestGroups),
    ...Object.keys(decisionGroups),
  ])).sort();
  const candidates = recordingIds.map((recordingId) => supportCandidateForRecording({
    decisions: decisionGroups[recordingId] ?? [],
    recordingId,
    requirements,
    rows: manifestGroups[recordingId] ?? [],
  }));
  const passingCandidates = candidates.filter((candidate) => candidate.ok);
  const bestCandidate = passingCandidates[0] ?? candidates
    .slice()
    .sort((left, right) => (
      (left.missingManifestProofCases.length + left.missingReadableGameCases.length) -
      (right.missingManifestProofCases.length + right.missingReadableGameCases.length)
    ))[0] ?? null;

  return {
    bestCandidate,
    candidateCount: candidates.length,
    candidates,
    ok: passingCandidates.length > 0,
    passingCandidateCount: passingCandidates.length,
    requirements,
    summary: passingCandidates.length > 0
      ? `Squat/knee-lift support claim has ${passingCandidates.length} reviewed bundle(s); selected ${passingCandidates[0].recordingId}.`
      : "Squat/knee-lift support claim is not ready: no single reviewed recording bundle satisfies every required proof case and Game readability target.",
  };
}

function formatAudit(audit) {
  const lines = [
    `Squat/knee-lift support-claim audit: ${audit.ok ? "passed" : "blocked"}`,
    audit.summary,
    `Candidate recordings: ${audit.candidateCount}; passing bundles: ${audit.passingCandidateCount}.`,
  ];

  if (audit.bestCandidate) {
    lines.push(
      `Best candidate: ${audit.bestCandidate.recordingId}`,
      `Missing manifest proof: ${audit.bestCandidate.missingManifestProofCases.join(", ") || "none"}`,
      `Missing Game readability: ${audit.bestCandidate.missingReadableGameCases.join(", ") || "none"}`,
    );
  }

  return lines.join("\n");
}

async function main() {
  const args = parseSquatKneeLiftSupportClaimAuditArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"));
  const semanticReview = JSON.parse(await readFile(path.resolve(args.semanticReviewPath), "utf8"));
  const audit = auditSquatKneeLiftSupportClaim({ manifest, semanticReview });

  console.log(args.json ? JSON.stringify(audit, null, 2) : formatAudit(audit));
  if (args.strict && !audit.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
