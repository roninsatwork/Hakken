import { describe, expect, it } from "vitest";

import {
  auditRootTurnSupportClaim,
  parseRootTurnSupportClaimAuditArgs,
} from "./root-turn-support-claim-audit.mjs";

function manifestRow(recordingId, proofCase = "root-turn", status = "passed") {
  return {
    proofCase,
    recordingId,
    status,
  };
}

function readableDecision(recordingId, visualCase = "strongest-root-turn", frameIndex = 1) {
  return {
    decision: "readable-pass",
    key: `${recordingId}:${frameIndex}:${visualCase}`,
    reviewContext: {
      cases: [visualCase],
      frameIndex,
      recordingId,
    },
  };
}

describe("root turn support claim audit", () => {
  it("passes when one reviewed recording bundle contains root-turn proof and readable Game turn", () => {
    const audit = auditRootTurnSupportClaim({
      manifest: {
        rows: [
          manifestRow("recording-a"),
        ],
      },
      semanticReview: {
        decisions: [
          readableDecision("recording-a"),
        ],
      },
    });

    expect(audit.ok).toBe(true);
    expect(audit.passingCandidateCount).toBe(1);
    expect(audit.bestCandidate).toMatchObject({
      missingManifestProofCases: [],
      missingReadableGameCases: [],
      recordingId: "recording-a",
    });
  });

  it("blocks when recorded proof and Game readability are split across recordings", () => {
    const audit = auditRootTurnSupportClaim({
      manifest: {
        rows: [
          manifestRow("recording-a"),
        ],
      },
      semanticReview: {
        decisions: [
          readableDecision("recording-b"),
        ],
      },
    });

    expect(audit.ok).toBe(false);
    expect(audit.passingCandidateCount).toBe(0);
    expect(audit.bestCandidate.missingReadableGameCases).toEqual(["strongest-root-turn"]);
  });

  it("blocks when root-turn proof is only product-scoped or covered by another recording", () => {
    const audit = auditRootTurnSupportClaim({
      manifest: {
        rows: [
          manifestRow("recording-a", "root-turn", "covered-by-other-recording"),
          manifestRow("recording-a", "root-travel", "passed"),
        ],
      },
      semanticReview: {
        decisions: [
          readableDecision("recording-a"),
        ],
      },
    });

    expect(audit.ok).toBe(false);
    expect(audit.bestCandidate).toMatchObject({
      missingManifestProofCases: ["root-turn"],
      missingReadableGameCases: [],
    });
  });

  it("parses CLI options", () => {
    expect(parseRootTurnSupportClaimAuditArgs([
      "--manifest",
      "tmp/manifest.json",
      "--semantic-review",
      "tmp/review.json",
      "--strict",
      "--json",
    ])).toEqual({
      json: true,
      manifestPath: "tmp/manifest.json",
      semanticReviewPath: "tmp/review.json",
      strict: true,
    });
  });
});
