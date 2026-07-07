import { describe, expect, it } from "vitest";

import {
  auditSquatKneeLiftSupportClaim,
  parseSquatKneeLiftSupportClaimAuditArgs,
} from "./squat-knee-lift-support-claim-audit.mjs";

function manifestRows(recordingId, proofCases) {
  return proofCases.map((proofCase) => ({
    proofCase,
    recordingId,
    status: "passed",
  }));
}

function readableDecision(recordingId, visualCase, displayLowerLabel, frameIndex = 1) {
  return {
    decision: "readable-pass",
    key: `${recordingId}:${frameIndex}:${visualCase}`,
    reviewContext: {
      cases: [visualCase],
      displayLowerLabel,
      frameIndex,
      recordingId,
    },
  };
}

const allManifestCases = [
  "standing",
  "squat",
  "left-leg-raise",
  "right-leg-raise",
  "mirror-side-ownership",
];

const allReadableDecisions = [
  readableDecision("recording-a", "baseline", "neutral", 0),
  readableDecision("recording-a", "strongest-squat", "squat", 10),
  readableDecision("recording-a", "strongest-left-leg-lift", "left-knee-raise", 20),
  readableDecision("recording-a", "strongest-right-leg-lift", "right-knee-raise", 30),
  readableDecision("recording-a", "first-source-display-divergence", "left-knee-raise", 40),
];

describe("squat knee lift support claim audit", () => {
  it("passes when one reviewed recording bundle contains every required proof and Game target", () => {
    const audit = auditSquatKneeLiftSupportClaim({
      manifest: {
        rows: manifestRows("recording-a", allManifestCases),
      },
      semanticReview: {
        decisions: allReadableDecisions,
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

  it("blocks when required proof cases are split across recordings", () => {
    const audit = auditSquatKneeLiftSupportClaim({
      manifest: {
        rows: [
          ...manifestRows("recording-a", ["standing", "squat"]),
          ...manifestRows("recording-b", ["left-leg-raise", "right-leg-raise", "mirror-side-ownership"]),
        ],
      },
      semanticReview: {
        decisions: [
          ...allReadableDecisions,
          ...allReadableDecisions.map((decision) => ({
            ...decision,
            key: decision.key.replace("recording-a", "recording-b"),
            reviewContext: {
              ...decision.reviewContext,
              recordingId: "recording-b",
            },
          })),
        ],
      },
    });

    expect(audit.ok).toBe(false);
    expect(audit.bestCandidate.missingManifestProofCases).not.toEqual([]);
  });

  it("requires readable Game decisions with the expected display labels", () => {
    const audit = auditSquatKneeLiftSupportClaim({
      manifest: {
        rows: manifestRows("recording-a", allManifestCases),
      },
      semanticReview: {
        decisions: [
          readableDecision("recording-a", "baseline", "neutral", 0),
          readableDecision("recording-a", "strongest-squat", "squat", 10),
          readableDecision("recording-a", "strongest-left-leg-lift", "neutral", 20),
          readableDecision("recording-a", "strongest-right-leg-lift", "right-knee-raise", 30),
          readableDecision("recording-a", "first-source-display-divergence", "left-knee-raise", 40),
        ],
      },
    });

    expect(audit.ok).toBe(false);
    expect(audit.bestCandidate).toMatchObject({
      missingManifestProofCases: [],
      missingReadableGameCases: ["strongest-left-leg-lift"],
    });
  });

  it("parses CLI options", () => {
    expect(parseSquatKneeLiftSupportClaimAuditArgs([
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
