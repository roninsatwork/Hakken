import { describe, expect, it } from "vitest";

import {
  controllingManifestSummaryForManifest,
  scenarioNameFromManifestPath,
  scenarioSmokeSummaryForEntries,
  scenarioSmokeSummaryForManifest,
  scenarioSmokeSummaryMarkdown,
} from "./scenario-smoke-summary.mjs";

const manifest = {
  rows: [
    { recordingId: "recording-1" },
    { recordingId: "recording-1" },
    { recordingId: "recording-2" },
  ],
  summary: {
    acceptedProductLimitationCount: 2,
    blockingRowsByProofBlockerCode: {
      "candidate-below-threshold": 3,
    },
    blockingRowsByProofCase: {
      "root-travel": 2,
      "side-bend": 1,
    },
    failedCount: 0,
    manualReviewCount: 0,
    missingProofCount: 3,
    passedCount: 7,
    sourceDataLimitationCount: 2,
    totalRows: 12,
    visualCaptureFrameCount: 42,
    visualCaptureRowCount: 9,
  },
};

describe("scenario smoke summary", () => {
  it("derives stable scenario names from raw and reviewed smoke manifest paths", () => {
    expect(scenarioNameFromManifestPath(
      "tmp/movement-replay-lab/front-leg-isolation-scenario-smoke.proof-manifest.json",
    )).toBe("front-leg-isolation");
    expect(scenarioNameFromManifestPath(
      "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.proof-manifest.json",
    )).toBe("root-travel");
  });

  it("summarizes manifest status counts and unique recordings", () => {
    expect(scenarioSmokeSummaryForManifest(manifest, { scenario: "root-travel" })).toMatchObject({
      acceptedProductLimitationCount: 2,
      manualReviewCount: 0,
      missingProofCount: 3,
      passedCount: 7,
      recordingIdCount: 2,
      scenario: "root-travel",
      totalRows: 12,
      visualCaptureFrameCount: 42,
      visualCaptureRowCount: 9,
    });
    expect(controllingManifestSummaryForManifest(manifest, { path: "reviewed.proof-manifest.json" })).toMatchObject({
      blockerCodes: {
        "candidate-below-threshold": 3,
      },
      missingProofCount: 3,
      path: "reviewed.proof-manifest.json",
      totalRows: 12,
    });
  });

  it("builds aggregate JSON and Markdown tables", () => {
    const summary = scenarioSmokeSummaryForEntries(
      [
        {
          manifest,
          path: "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.proof-manifest.json",
        },
        {
          manifest: {
            rows: [{ recordingId: "recording-3" }],
            summary: {
              acceptedProductLimitationCount: 0,
              manualReviewCount: 0,
              missingProofCount: 1,
              passedCount: 2,
              totalRows: 3,
            },
          },
          path: "tmp/movement-replay-lab/root-turn-scenario-reviewed-smoke.proof-manifest.json",
        },
      ],
      {
        controllingManifest: manifest,
        controllingManifestPath: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
      },
    );

    expect(summary.controllingManifest).toMatchObject({
      missingProofCount: 3,
      path: "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
      totalRows: 12,
    });
    expect(summary.totals).toMatchObject({
      acceptedProductLimitationCount: 2,
      manualReviewCount: 0,
      missingProofCount: 4,
      passedCount: 9,
      recordingIdCount: 3,
      totalRows: 15,
    });
    expect(scenarioSmokeSummaryMarkdown(summary)).toContain(
      "| root-travel | 2 | 7 | 3 | 0 | 0 | 2 | 9 | 42 | candidate-below-threshold:3 | root-travel:2, side-bend:1 |",
    );
    expect(scenarioSmokeSummaryMarkdown(summary)).toContain(
      "Unique rows: 12; 7 passed; 3 missing-proof; 0 manual-review; 0 product-scope-limitation; 2 accepted limitations; 9 visual rows; 42 frame matches",
    );
    expect(scenarioSmokeSummaryMarkdown(summary)).toContain(
      "Unique blockers: candidate-below-threshold:3.",
    );
    expect(summary.totalsNote).toContain("row-occurrences");
    expect(scenarioSmokeSummaryMarkdown(summary)).toContain(
      "Scenario rows can overlap, so totals below are row-occurrences.",
    );
    expect(scenarioSmokeSummaryMarkdown(summary)).toContain(
      "Scenario row-occurrence totals: 9 passed 4 missing-proof 0 manual-review 0 product-scope-limitation 2 accepted limitations",
    );
  });
});
