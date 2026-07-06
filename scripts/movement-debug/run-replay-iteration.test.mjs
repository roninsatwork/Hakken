import { describe, expect, it } from "vitest";

import {
  iterationPointerPaths,
  iterationRunSummary,
  recordingGapPlanForManifest,
  recordingGapRowsForManifest,
  renderComparison,
  renderProofQueueSummaryLines,
  renderRecordingGapActions,
} from "./run-replay-iteration.mjs";
import { proofQueueSummariesForManifest } from "./proof-queue-summary.mjs";

const missingProofRow = {
  acceptedProductLimitation: false,
  candidateAmplitude: 0.04,
  candidateRejectionCode: "amplitude-below-threshold",
  candidateRejectionReason: "Best candidate amplitude is below required threshold.",
  expectedMinimumAmplitude: 0.18,
  missingLayers: ["recorded replay analyzer proof"],
  nextAction: "Record or tag a stronger left-leg-raise sample.",
  proofBlockerCode: "candidate-below-threshold",
  proofCase: "left-leg-raise",
  recordingId: "recording-1",
  sourceSide: "left",
  status: "missing-proof",
};

const manualReviewRow = {
  ...missingProofRow,
  proofBlockerCode: "manual-review-pending",
  proofCase: "side-bend",
  recordingId: "recording-2",
  status: "manual-review",
};

const sourceLimitationRow = {
  ...missingProofRow,
  candidateAmplitude: null,
  candidateRejectionCode: null,
  candidateRejectionReason: null,
  expectedMinimumAmplitude: null,
  missingLayers: [],
  proofBlockerCode: "source-data-limitation",
  proofCase: "weak-feet",
  recordingId: "recording-3",
  sourceSide: "both",
  status: "source-data-limitation",
};

const acceptedSourceLimitationRow = {
  ...sourceLimitationRow,
  acceptedProductLimitation: true,
  proofBlockerCode: null,
  recordingId: "recording-4",
};

describe("run replay iteration recording gap helpers", () => {
  it("builds stable latest artifact pointer paths", () => {
    expect(iterationPointerPaths("/tmp/replay-runs")).toEqual({
      latestAnalysisPath: "/tmp/replay-runs/latest-analysis-path.txt",
      latestExportPath: "/tmp/replay-runs/latest-export-path.txt",
      latestRecordingGuidePath: "/tmp/replay-runs/latest-recording-guide-path.txt",
      latestRecordingPlanPath: "/tmp/replay-runs/latest-recording-plan-path.txt",
      latestReportPath: "/tmp/replay-runs/latest-report-path.txt",
      latestSummaryPath: "/tmp/replay-runs/latest-summary-path.txt",
    });
  });

  it("keeps only rows that visual review cannot close", () => {
    const rows = recordingGapRowsForManifest({
      rows: [
        manualReviewRow,
        sourceLimitationRow,
        acceptedSourceLimitationRow,
        missingProofRow,
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        proofCase: "left-leg-raise",
        status: "missing-proof",
      }),
      expect.objectContaining({
        proofCase: "weak-feet",
        status: "source-data-limitation",
      }),
    ]);
  });

  it("builds a machine-readable recording action plan", () => {
    const plan = recordingGapPlanForManifest({
      rows: [missingProofRow, sourceLimitationRow],
    });

    expect(plan.summary).toMatchObject({
      byBlockerCode: {
        "candidate-below-threshold": 1,
        "source-data-limitation": 1,
      },
      allScenariosQuickValidation: expect.objectContaining({
        argvTemplate: expect.arrayContaining([
          "--all",
          "--quiet",
          "--controlling-manifest",
          "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
        ]),
        command: "npm run movement:replay:validate-scenario --",
      }),
      allScenariosQuickValidationCommand: expect.stringContaining("--all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json"),
      byOwner: {
        product: 1,
        recording: 1,
      },
      byProofCase: {
        "left-leg-raise": 1,
        "weak-feet": 1,
      },
      byPriority: {
        "product-decision": 1,
        "recording-high": 1,
      },
      byStatus: {
        "missing-proof": 1,
        "source-data-limitation": 1,
      },
      byTriageDisposition: {
        "full-rerecord": 1,
        "product-decision-needed": 1,
      },
      recordingIdCount: 2,
      recordingIds: ["recording-1", "recording-3"],
      topActionGroups: [
        expect.objectContaining({
          count: 1,
          owner: "product",
          proofCase: "weak-feet",
          triageDisposition: "product-decision-needed",
        }),
        expect.objectContaining({
          count: 1,
          owner: "recording",
          proofCase: "left-leg-raise",
          triageDisposition: "full-rerecord",
        }),
      ],
      captureScenarioCount: 1,
      totalRows: 2,
    });
    expect(plan.captureScenarios).toEqual([
      expect.objectContaining({
        proofCases: ["left-leg-raise"],
        quickValidation: expect.objectContaining({
          argvTemplate: ["--scenario", "movement-proof-front-leg-isolation", "--quiet"],
          command: "npm run movement:replay:validate-scenario --",
        }),
        quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-front-leg-isolation --quiet",
        rowCount: 1,
        title: "Front leg isolation and mirror side ownership",
        validationArgs: expect.arrayContaining([
          "--recording-scenario movement-proof-front-leg-isolation",
        ]),
        validationCommand: expect.stringContaining("--recording-scenario movement-proof-front-leg-isolation"),
        validation: expect.objectContaining({
          argvTemplate: expect.arrayContaining(["--recording-scenario", "movement-proof-front-leg-isolation"]),
          outputPath: "tmp/movement-replay-lab/front-leg-isolation-scenario-reviewed-smoke.json",
        }),
        validationOutputPath: "tmp/movement-replay-lab/front-leg-isolation-scenario-reviewed-smoke.json",
      }),
    ]);
    expect(plan.rows).toEqual([
      expect.objectContaining({
        owner: "recording",
        amplitudeRatio: 0.22222222222222224,
        priority: "recording-high",
        protocol: expect.objectContaining({
          acceptance: "Analyzer should observe anatomical left knee lift >= 0.180 while right-leg lift stays below the isolation threshold.",
          movement: "Raise only the child's anatomical left knee clearly toward the torso, hold near the top for about one second, lower, and repeat 3 times.",
        }),
        recommendedAction: "Capture a recording with larger, clearer movement amplitude for this proof case.",
        triageDisposition: "full-rerecord",
      }),
      expect.objectContaining({
        owner: "product",
        priority: "product-decision",
        recommendedAction: "Get product-owner source-limitation decision, or capture a stronger recording if this should be supported.",
        triageDisposition: "product-decision-needed",
      }),
    ]);
    expect(plan.actionGroups).toEqual([
      expect.objectContaining({
        count: 1,
        owner: "product",
        priority: "product-decision",
        proofCase: "weak-feet",
        recordingIds: ["recording-3"],
        triageDisposition: "product-decision-needed",
      }),
      expect.objectContaining({
        count: 1,
        owner: "recording",
        priority: "recording-high",
        proofCase: "left-leg-raise",
        recordingIds: ["recording-1"],
        triageDisposition: "full-rerecord",
      }),
    ]);
  });

  it("renders the recording gap section separately from manual review", () => {
    const markdown = renderRecordingGapActions({
      rows: [manualReviewRow, missingProofRow],
    }).join("\n");

    expect(markdown).toContain("## Recording Gap Actions");
    expect(markdown).toContain("### Capture Scenarios");
    expect(markdown).toContain("| Scenario | Fresh Recording Label | Estimated Rows Closed | Proof Cases | Blockers | Setup | Movement | Acceptance | Quick Validation | Analyzer Validation Command |");
    expect(markdown).toContain("movement:replay:validate-scenario -- --scenario movement-proof-front-leg-isolation --quiet");
    expect(markdown).toContain("--recording-scenario movement-proof-front-leg-isolation");
    expect(markdown).toContain("--review-decisions tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json");
    expect(markdown).toContain("Front leg isolation and mirror side ownership");
    expect(markdown).toContain("### Grouped Actions");
    expect(markdown).toContain("| Owner | Priority | Triage | Status | Blocker | Proof Case | Count | Recommended Action | Capture Protocol |");
    expect(markdown).toContain("### Action Rows");
    expect(markdown).toContain("| Owner | Priority | Triage | Status | Blocker | Proof Case | Recording | Candidate / Required | Recommended Action | Capture Protocol |");
    expect(markdown).toContain("recording | recording-high | full-rerecord");
    expect(markdown).toContain("left-leg-raise");
    expect(markdown).toContain("Raise only the child's anatomical left knee clearly toward the torso");
    expect(markdown).not.toContain("side-bend");
  });

  it("renders proof queue summary lines for iteration reports", () => {
    const summary = renderProofQueueSummaryLines({
      rows: [
        manualReviewRow,
        {
          ...manualReviewRow,
          proofCase: "head-direction",
          recordingId: "recording-5",
        },
        sourceLimitationRow,
        acceptedSourceLimitationRow,
        missingProofRow,
      ],
    });

    expect(summary.lines).toEqual([
      "- Manual review queue: 2 row(s); top proof cases head-direction:1, side-bend:1",
      "- Source limitation queue: 1 row(s); top proof cases weak-feet:1",
    ]);
    expect(summary.manualReviewQueueSummary.totalRows).toBe(2);
    expect(summary.sourceLimitationQueueSummary.totalRows).toBe(1);
  });

  it("summarizes unresolved proof queues from a manifest", () => {
    const {
      manualReviewQueueSummary,
      sourceLimitationQueueSummary,
    } = proofQueueSummariesForManifest({
      rows: [
        manualReviewRow,
        sourceLimitationRow,
        acceptedSourceLimitationRow,
        missingProofRow,
      ],
    });

    expect(manualReviewQueueSummary.totalRows).toBe(1);
    expect(manualReviewQueueSummary.byProofCase).toEqual({
      "side-bend": 1,
    });
    expect(sourceLimitationQueueSummary.totalRows).toBe(1);
    expect(sourceLimitationQueueSummary.byProofCase).toEqual({
      "weak-feet": 1,
    });
  });

  it("builds a compact iteration run summary for handoff tooling", () => {
    const proofManifest = {
      rows: [
        manualReviewRow,
        sourceLimitationRow,
        missingProofRow,
      ],
      summary: {
        acceptedProductLimitationCount: 0,
        appliedManualReviewDecisionCount: 1,
        appliedSourceLimitationDecisionCount: 0,
        failedCount: 0,
        manualReviewCount: 1,
        missingProofCount: 1,
        passedCount: 2,
        sourceDataLimitationCount: 1,
        totalRows: 5,
        visualCaptureRowCount: 3,
      },
    };
    const proofQueueSummary = renderProofQueueSummaryLines(proofManifest);
    const recordingGapPlan = recordingGapPlanForManifest(proofManifest);

    expect(iterationRunSummary({
      analysisPath: "tmp/run.analysis.json",
      analyses: [
        {
          coverage: {
            summary: {
              internalDemoOnlyCount: 2,
              missingProofCount: 3,
              userFacingCount: 1,
            },
          },
          failures: [
            { severity: "warning" },
            { severity: "error" },
          ],
          pass: false,
        },
      ],
      comparison: {
        proofManifest: {
          deltas: {
            counts: {
              blockingRowCount: {
                after: 2,
                before: 3,
                delta: -1,
              },
            },
          },
          improvementReasons: [
            "blockingRowCount decreased by 1",
          ],
        },
      },
      comparisonPath: "tmp/run.comparison.json",
      generatedAt: "2026-07-06T10:00:00.000Z",
      label: "reviewed",
      previousPath: "tmp/previous.analysis.json",
      proofManifest,
      proofManifestPath: "tmp/run.proof-manifest.json",
      proofQueueSummary,
      recordingGuidePath: "tmp/run.recording-guide.md",
      recordingGapPlan,
      recordingGapPlanPath: "tmp/run.recording-plan.json",
      reportPath: "tmp/run.md",
      reviewDecisionPath: "tmp/review-decisions.json",
      sourceLimitationDecisionPath: "tmp/source-limitations.json",
      visualCapturePaths: ["tmp/captures"],
    })).toMatchObject({
      analysisSummary: {
        coverageInternalDemoOnly: 2,
        coverageMissingProof: 3,
        coverageUserFacing: 1,
        errors: 1,
        failed: 1,
        sessions: 1,
        warnings: 1,
      },
      inputs: {
        previousAnalysisPath: "tmp/previous.analysis.json",
        reviewDecisionPath: "tmp/review-decisions.json",
        sourceLimitationDecisionPath: "tmp/source-limitations.json",
        visualCapturePaths: ["tmp/captures"],
      },
      proofSummary: {
        appliedManualReviewDecision: 1,
        manualReview: 1,
        missingProof: 1,
        passed: 2,
        sourceDataLimitation: 1,
        total: 5,
      },
      proofTrend: "improved",
      recordingGuidePath: "tmp/run.recording-guide.md",
      recordingGapPlanPath: "tmp/run.recording-plan.json",
      reportPath: "tmp/run.md",
      queues: {
        manualReview: {
          totalRows: 1,
        },
        recordingGap: {
          totalRows: 2,
        },
        sourceLimitation: {
          totalRows: 1,
        },
      },
    });
  });

  it("renders proof-manifest deltas in iteration comparisons", () => {
    const markdown = renderComparison({
      after: { errorCount: 0, failedSessionCount: 0, warningCount: 0 },
      before: { errorCount: 0, failedSessionCount: 0, warningCount: 0 },
      deltas: {
        errorCount: 0,
        failedSessionCount: 0,
        failureCountsByCode: {},
        metrics: {},
        warningCount: 0,
      },
      proofManifest: {
        deltas: {
          blockingRowsByProofBlockerCode: {
            "candidate-below-threshold": {
              after: 28,
              before: 30,
              delta: -2,
            },
          },
          counts: {
            blockingRowCount: {
              after: 104,
              before: 110,
              delta: -6,
            },
          },
        },
        improvementReasons: [
          "blockingRowCount decreased by 6",
        ],
      },
    }).join("\n");

    expect(markdown).toContain("### Proof-Manifest Deltas");
    expect(markdown).toContain("Proof trend: improved.");
    expect(markdown).toContain("Improvements: blockingRowCount decreased by 6.");
    expect(markdown).toContain("blockingRowCount");
    expect(markdown).toContain("### Proof-Blocker Deltas");
    expect(markdown).toContain("candidate-below-threshold");
  });
});
