#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json";
const defaultSemanticReviewPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json";

export const ROOT_TURN_SUPPORT_REQUIREMENTS = {
  manifestProofCases: [
    "root-turn",
  ],
  readableGameCases: [
    "strongest-root-turn",
  ],
};

function printHelp() {
  console.log(`Audit whether root-turn is ready for a user-facing support claim.

Usage:
  npm run movement:root-turn-support-audit
  npm run movement:root-turn-support-audit -- --strict

Options:
  --manifest <file>          Reviewed proof manifest. Defaults to ${defaultManifestPath}
  --semantic-review <file>   Game visual semantic review decisions. Defaults to ${defaultSemanticReviewPath}
  --strict                   Exit non-zero when the support claim is not ready.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseRootTurnSupportClaimAuditArgs(argv) {
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
  return (semanticReview?.decisions ?? []).reduce((groups, decision) => {
    const recordingId = decision?.reviewContext?.recordingId;
    if (!recordingId || decision.decision !== "readable-pass") return groups;
    groups[recordingId] ??= [];
    groups[recordingId].push(decision);
    return groups;
  }, {});
}

function hasPassedProofCase(rows, proofCase) {
  return rows.some((row) => row.proofCase === proofCase && row.status === "passed");
}

function hasReadableGameCase(decisions, visualCase) {
  return decisions.some((decision) => (
    decision.decision === "readable-pass" &&
    (decision.reviewContext?.cases ?? []).includes(visualCase)
  ));
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
  const gameReadability = requirements.readableGameCases.map((visualCase) => ({
    ok: hasReadableGameCase(decisions, visualCase),
    visualCase,
  }));
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

export function auditRootTurnSupportClaim({
  manifest,
  requirements = ROOT_TURN_SUPPORT_REQUIREMENTS,
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
      ? `Root-turn support claim has ${passingCandidates.length} reviewed bundle(s); selected ${passingCandidates[0].recordingId}.`
      : "Root-turn support claim is not ready: no single reviewed recording bundle satisfies recorded root-turn proof and Game readability.",
  };
}

function formatAudit(audit) {
  const lines = [
    `Root-turn support-claim audit: ${audit.ok ? "passed" : "blocked"}`,
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
  const args = parseRootTurnSupportClaimAuditArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifestPath), "utf8"));
  const semanticReview = JSON.parse(await readFile(path.resolve(args.semanticReviewPath), "utf8"));
  const audit = auditRootTurnSupportClaim({ manifest, semanticReview });

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
