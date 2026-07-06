import { describe, expect, it } from "vitest";

import {
  decisionTemplateForRows,
  recordingGuideMarkdownForPlan,
  recordingPlanForRows,
  reviewStatusSummary,
  reviewQueueSummaryForRows,
  reviewQueueSummaryText,
  sourceLimitationTemplateForRows,
  strictDecisionSummaryText,
  summarizeDecisions,
  unresolvedPassedVisualAuditRowsForRows,
} from "./write-replay-proof-review.mjs";
import {
  recordingGapPlanSummaryText,
  recordingGapTopGroupsText,
} from "./recording-gap-plan.mjs";

const reviewRow = {
  automatedStatus: "passed",
  avatarSide: "avatar-left",
  bodyPartMotion: "torso side bend",
  candidateAmplitude: 0.34,
  candidateRejectionCode: undefined,
  candidateRejectionReason: undefined,
  directionSign: "positive",
  evidenceFrameCount: 3,
  expectedFrameWindow: { endFrame: 42, startFrame: 12 },
  expectedMinimumAmplitude: 0.12,
  missingLayers: [],
  nextAction: "Manual visual readability review is required.",
  observedAmplitude: 0.34,
  proofBlockerCode: "manual-review-pending",
  proofCase: "side-bend",
  recordingId: "recording-1",
  requiredLayers: ["recorded replay analyzer proof", "recorded replay visual capture"],
  sourceSide: "left",
  status: "manual-review",
  statusReason: "Recorded analyzer proof exists; visual review is required.",
  visualCaptureDiagnostics: {
    avatarLowerError: {
      average: 0.13,
      count: 2,
      max: 0.18,
    },
    avatarUpperError: {
      average: 0.05,
      count: 2,
      max: 0.08,
    },
  },
  visualCaptureFrameCount: 2,
  visualCaptureFrames: [18, 24],
};

const sourceLimitationRow = {
  ...reviewRow,
  acceptedProductLimitation: false,
  automatedStatus: "source-data-limitation",
  proofBlockerCode: "source-data-limitation",
  proofCase: "weak-feet",
  status: "source-data-limitation",
  statusReason: "Recording contains source-limited frames.",
};

const acceptedSourceLimitationRow = {
  ...sourceLimitationRow,
  acceptedProductLimitation: true,
  proofBlockerCode: null,
};

const missingProofRow = {
  ...reviewRow,
  acceptedProductLimitation: false,
  candidateAmplitude: 0.05,
  candidateRejectionCode: "amplitude-below-threshold",
  candidateRejectionReason: "Best candidate amplitude 0.050 is below required 0.160.",
  expectedMinimumAmplitude: 0.16,
  missingLayers: ["recorded replay analyzer proof", "recorded replay visual capture"],
  proofBlockerCode: "candidate-below-threshold",
  proofCase: "root-travel",
  status: "missing-proof",
};

const headDirectionReviewRow = {
  ...reviewRow,
  proofCase: "head-direction",
  recordingId: "recording-2",
};

const passedVisualAuditRow = {
  ...reviewRow,
  manualReview: undefined,
  proofCase: "left-leg-raise",
  recordingId: "recording-5",
  status: "passed",
};

const subtleSquatPassedVisualAuditRow = {
  ...passedVisualAuditRow,
  proofCase: "squat",
  recordingId: "px7b0y1rcfbe1e1zanknsgefp986f1qs",
};

const validSourceLimitationResults = new Set([
  "accepted-product-limitation",
  "needs-better-recording",
]);

describe("write replay proof review decision summaries", () => {
  it("keeps generated TODO templates from counting as valid decisions", () => {
    const template = decisionTemplateForRows([reviewRow]);

    expect(template.summary).toMatchObject({
      byProofCase: {
        "side-bend": 1,
      },
      topProofCases: [
        {
          count: 1,
          proofCase: "side-bend",
        },
      ],
      totalRows: 1,
    });
    expect(summarizeDecisions([reviewRow], template.decisions)).toMatchObject({
      invalid: 0,
      missing: 0,
      missingContext: 0,
      required: 1,
      todo: 1,
      unknown: 0,
      valid: 0,
    });
    expect(template.decisions[0].reviewContext.visualCaptureDiagnostics).toEqual(
      reviewRow.visualCaptureDiagnostics,
    );
  });

  it("accepts a filled decision when its review context matches the manifest row", () => {
    const [decision] = decisionTemplateForRows([reviewRow]).decisions;
    decision.result = "readable-pass";

    expect(summarizeDecisions([reviewRow], [decision])).toMatchObject({
      contextMismatch: 0,
      invalid: 0,
      missing: 0,
      missingContext: 0,
      required: 1,
      todo: 0,
      unknown: 0,
      valid: 1,
    });
  });

  it("flags legacy decisions that omit embedded review context", () => {
    const [decision] = decisionTemplateForRows([reviewRow]).decisions;
    decision.result = "readable-pass";
    delete decision.reviewContext;

    expect(summarizeDecisions([reviewRow], [decision])).toMatchObject({
      contextMismatch: 0,
      missingContext: 1,
      required: 1,
      valid: 1,
    });
  });

  it("flags decisions made against stale review context", () => {
    const [decision] = decisionTemplateForRows([reviewRow]).decisions;
    decision.result = "readable-pass";
    decision.reviewContext.status = "passed";

    expect(summarizeDecisions([reviewRow], [decision])).toMatchObject({
      contextMismatch: 1,
      missingContext: 0,
      required: 1,
      unknown: 0,
      valid: 1,
    });
  });

  it("flags decisions for rows that are not in the current review set", () => {
    const [decision] = decisionTemplateForRows([reviewRow]).decisions;
    decision.result = "readable-pass";
    decision.recordingId = "old-recording";

    expect(summarizeDecisions([reviewRow], [decision])).toMatchObject({
      missing: 1,
      required: 1,
      unknown: 1,
      valid: 0,
    });
  });

  it("formats strict decision summaries for CLI and thrown errors", () => {
    expect(strictDecisionSummaryText({
      contextMismatch: 1,
      duplicate: 2,
      invalid: 3,
      missing: 4,
      missingContext: 5,
      required: 10,
      todo: 6,
      unknown: 7,
      valid: 1,
    })).toBe(
      "1/10 valid, 6 TODO, 4 missing, 3 invalid, 2 duplicate, 5 missing context, 1 stale context, 7 unknown row",
    );
  });

  it("keeps generated source-limitation templates from counting as accepted limitations", () => {
    const template = sourceLimitationTemplateForRows([sourceLimitationRow]);

    expect(template.summary).toMatchObject({
      byProofCase: {
        "weak-feet": 1,
      },
      byStatus: {
        "source-data-limitation": 1,
      },
      topProofCases: [
        {
          count: 1,
          proofCase: "weak-feet",
        },
      ],
      totalRows: 1,
    });
    expect(reviewQueueSummaryText(template.summary)).toBe(
      "1 row(s); top proof cases weak-feet:1",
    );
    expect(summarizeDecisions(
      [sourceLimitationRow],
      template.limitations,
      validSourceLimitationResults,
    )).toMatchObject({
      invalid: 0,
      missing: 0,
      missingContext: 0,
      required: 1,
      todo: 1,
      unknown: 0,
      valid: 0,
    });
  });

  it("accepts explicit source-limitation decisions with matching context", () => {
    const [decision] = sourceLimitationTemplateForRows([sourceLimitationRow]).limitations;
    decision.result = "accepted-product-limitation";

    expect(summarizeDecisions(
      [sourceLimitationRow],
      [decision],
      validSourceLimitationResults,
    )).toMatchObject({
      contextMismatch: 0,
      invalid: 0,
      missing: 0,
      missingContext: 0,
      required: 1,
      todo: 0,
      unknown: 0,
      valid: 1,
    });
  });

  it("flags source-limitation decisions for rows outside the current source-limitation set", () => {
    const [decision] = sourceLimitationTemplateForRows([sourceLimitationRow]).limitations;
    decision.result = "accepted-product-limitation";
    decision.proofCase = "lower-body-out-of-frame";

    expect(summarizeDecisions(
      [sourceLimitationRow],
      [decision],
      validSourceLimitationResults,
    )).toMatchObject({
      missing: 1,
      required: 1,
      unknown: 1,
      valid: 0,
    });
  });

  it("can build source-limitation templates only for unresolved source limitations", () => {
    const unresolvedRows = [sourceLimitationRow, acceptedSourceLimitationRow]
      .filter((row) => row.status === "source-data-limitation" && !row.acceptedProductLimitation);

    expect(sourceLimitationTemplateForRows(unresolvedRows).limitations).toEqual([
      expect.objectContaining({
        proofCase: "weak-feet",
        recordingId: "recording-1",
      }),
    ]);
  });

  it("summarizes the manual-review queue by top proof case", () => {
    const summary = reviewQueueSummaryForRows([
      reviewRow,
      headDirectionReviewRow,
      {
        ...headDirectionReviewRow,
        recordingId: "recording-3",
      },
    ]);

    expect(summary).toEqual({
      byBlockerCode: {
        "manual-review-pending": 3,
      },
      byProofCase: {
        "head-direction": 2,
        "side-bend": 1,
      },
      byStatus: {
        "manual-review": 3,
      },
      topProofCases: [
        {
          count: 2,
          proofCase: "head-direction",
        },
        {
          count: 1,
          proofCase: "side-bend",
        },
      ],
      totalRows: 3,
    });
    expect(reviewQueueSummaryText(summary)).toBe(
      "3 row(s); top proof cases head-direction:2, side-bend:1",
    );
  });

  it("keeps passed visual-audit rows open when the decision needs a stronger automated assertion", () => {
    const rows = [passedVisualAuditRow, subtleSquatPassedVisualAuditRow];
    const [legRaiseDecision, squatDecision] = decisionTemplateForRows(rows).decisions;
    legRaiseDecision.result = "readable-pass";
    squatDecision.result = "needs-stronger-automated-assertion";

    expect(summarizeDecisions(rows, [legRaiseDecision, squatDecision])).toMatchObject({
      contextMismatch: 0,
      invalid: 0,
      missing: 0,
      missingContext: 0,
      required: 2,
      todo: 0,
      unknown: 0,
      valid: 2,
    });
    expect(unresolvedPassedVisualAuditRowsForRows(rows, [
      legRaiseDecision,
      squatDecision,
    ])).toEqual([
      expect.objectContaining({
        proofCase: "squat",
        recordingId: "px7b0y1rcfbe1e1zanknsgefp986f1qs",
      }),
    ]);
  });

  it("builds a compact review status summary for handoff tooling", () => {
    const rows = [
      reviewRow,
      headDirectionReviewRow,
      missingProofRow,
      sourceLimitationRow,
      acceptedSourceLimitationRow,
    ];
    const recordingPlan = recordingPlanForRows(rows);
    const reviewQueueSummary = reviewQueueSummaryForRows([
      reviewRow,
      headDirectionReviewRow,
    ]);
    const sourceLimitationQueueSummary = reviewQueueSummaryForRows([
      sourceLimitationRow,
    ]);

    expect(reviewStatusSummary({
      decisionSummary: {
        contextMismatch: 0,
        duplicate: 0,
        invalid: 0,
        missing: 2,
        missingContext: 0,
        required: 2,
        todo: 0,
        unknown: 0,
        valid: 0,
      },
      manifest: {
        rows,
        summary: {
          acceptedProductLimitationCount: 1,
          manualReviewCount: 2,
          missingProofCount: 1,
          passedCount: 0,
          sourceDataLimitationCount: 2,
          totalRows: 5,
          visualCaptureFrameCount: 6,
          visualCaptureRowCount: 2,
        },
      },
      passedVisualAuditRows: [passedVisualAuditRow],
      passedVisualAuditSummary: reviewQueueSummaryForRows([passedVisualAuditRow]),
      proofGapRows: [missingProofRow, sourceLimitationRow],
      recordingPlan,
      reviewQueueSummary,
      reviewRows: [reviewRow, headDirectionReviewRow],
      sourceLimitationDecisionSummary: {
        contextMismatch: 0,
        duplicate: 0,
        invalid: 0,
        missing: 1,
        missingContext: 0,
        required: 1,
        todo: 0,
        unknown: 0,
        valid: 0,
      },
      sourceLimitationQueueSummary,
    })).toMatchObject({
      decisionProgress: {
        manualReview: {
          missing: 2,
          required: 2,
        },
        sourceLimitation: {
          missing: 1,
          required: 1,
        },
      },
      manifestSummary: {
        acceptedProductLimitationCount: 1,
        manualReviewCount: 2,
        missingProofCount: 1,
        sourceDataLimitationCount: 2,
        totalRows: 5,
        visualCaptureFrameCount: 6,
        visualCaptureRowCount: 2,
      },
      proofGapRowCount: 2,
      queues: {
        manualReview: {
          totalRows: 2,
        },
        passedVisualAudit: {
          totalRows: 1,
        },
        recordingGap: {
          totalRows: 2,
        },
        sourceLimitation: {
          totalRows: 1,
        },
      },
      passedVisualAuditRowCount: 1,
      reportRowCount: 2,
      strictReady: {
        manualReviewDecisions: false,
        sourceLimitationDecisions: false,
      },
    });
  });

  it("builds a recording gap plan for rows visual review cannot close", () => {
    const plan = recordingPlanForRows([
      reviewRow,
      missingProofRow,
      sourceLimitationRow,
      acceptedSourceLimitationRow,
    ]);

    expect(plan.summary).toMatchObject({
      byProofCase: {
        "root-travel": 1,
        "weak-feet": 1,
      },
      allScenariosQuickValidation: expect.objectContaining({
        argvTemplate: expect.arrayContaining([
          "--all",
          "--quiet",
          "--controlling-manifest",
          "tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json",
        ]),
        command: "npm run movement:replay:validate-scenario --",
        outputPaths: expect.objectContaining({
          markdownSummaryPath: "tmp/movement-replay-lab/current-scenario-validation-summary.md",
          summaryPath: "tmp/movement-replay-lab/current-scenario-validation-summary.json",
        }),
      }),
      allScenariosQuickValidationCommand: expect.stringContaining("--all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json"),
      byOwner: {
        product: 1,
        recording: 1,
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
          proofCase: "root-travel",
          triageDisposition: "full-rerecord",
        }),
      ],
      captureScenarioCount: 1,
      minimumFreshRecordingCount: 1,
      totalRows: 2,
    });
    expect(plan.captureScenarios).toEqual([
      expect.objectContaining({
        acceptance: "Analyzer should observe root path travel >= 0.160 while tracking remains stable.",
        estimatedRowsClosed: 1,
        freshRecordingLabel: "movement-proof-root-travel",
        proofCases: ["root-travel"],
        quickValidation: expect.objectContaining({
          argvTemplate: ["--scenario", "movement-proof-root-travel", "--quiet"],
          command: "npm run movement:replay:validate-scenario --",
          recordingScenario: "movement-proof-root-travel",
        }),
        quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet",
        rowCount: 1,
        title: "Root travel",
        validationArgs: expect.arrayContaining([
          "--recording-scenario movement-proof-root-travel",
          "--out tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json",
        ]),
        validationCommand: expect.stringContaining("--recording-scenario movement-proof-root-travel"),
        validation: expect.objectContaining({
          argvTemplate: expect.arrayContaining(["--recording-scenario", "movement-proof-root-travel"]),
          latestExportPointerPath: "tmp/movement-replay-lab/runs/latest-export-path.txt",
          outputPath: "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json",
          recordingScenario: "movement-proof-root-travel",
        }),
        validationOutputPath: "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json",
      }),
    ]);
    expect(plan.rows).toEqual([
      expect.objectContaining({
        owner: "recording",
        amplitudeRatio: 0.3125,
        proofCase: "root-travel",
        priority: "recording-high",
        requiredLayers: ["recorded replay analyzer proof", "recorded replay visual capture"],
        sourceSide: "left",
        protocol: expect.objectContaining({
          acceptance: "Analyzer should observe root path travel >= 0.160 while the body stays visible and trackable.",
          movement: "Take large, deliberate side steps or forward/back steps across the camera view, pause at each end, and repeat 2-3 times.",
        }),
        recommendedAction: "Capture a recording with larger, clearer movement amplitude for this proof case.",
        status: "missing-proof",
        triageDisposition: "full-rerecord",
      }),
      expect.objectContaining({
        owner: "product",
        proofCase: "weak-feet",
        priority: "product-decision",
        recommendedAction: "Get product-owner source-limitation decision, or capture a stronger recording if this should be supported.",
        status: "source-data-limitation",
        triageDisposition: "product-decision-needed",
      }),
    ]);
    expect(plan.actionGroups).toEqual([
      expect.objectContaining({
        count: 1,
        owner: "product",
        priority: "product-decision",
        proofCase: "weak-feet",
        recordingIds: ["recording-1"],
        triageDisposition: "product-decision-needed",
      }),
      expect.objectContaining({
        count: 1,
        owner: "recording",
        priority: "recording-high",
        protocol: expect.objectContaining({
          setup: "Start centered with the full body visible; leave enough floor space so the root visibly travels instead of just swaying.",
        }),
        proofCase: "root-travel",
        recordingIds: ["recording-1"],
        triageDisposition: "full-rerecord",
      }),
    ]);
    expect(recordingGapPlanSummaryText(plan)).toBe(
      "2 row(s); 2 action group(s); 1 capture scenario(s); 1 fresh recording(s) minimum; owners product:1, recording:1; priorities product-decision:1, recording-high:1; triage full-rerecord:1, product-decision-needed:1",
    );
    expect(recordingGapTopGroupsText(plan)).toBe(
      "product/product-decision/weak-feet/source-data-limitation:1; recording/recording-high/root-travel/candidate-below-threshold:1",
    );
  });

  it("renders a concise standalone recording guide from the recording plan", () => {
    const plan = recordingPlanForRows([
      missingProofRow,
      {
        ...missingProofRow,
        proofCase: "left-leg-raise",
        recordingId: "recording-2",
        sourceSide: "left",
      },
    ]);
    const markdown = recordingGuideMarkdownForPlan(plan, {
      generatedAt: "2026-07-06T10:00:00.000Z",
      manifestPath: "/tmp/manifest.json",
    });

    expect(markdown).toContain("# Movement Replay Recording Guide");
    expect(markdown).toContain("Manifest: /tmp/manifest.json");
    expect(markdown).toContain("Capture scenarios: 2");
    expect(markdown).toContain("Minimum fresh recordings: 2");
    expect(markdown).toContain("All-scenario quick validation:");
    expect(markdown).toContain("movement:replay:validate-scenario -- --all --quiet --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json");
    expect(markdown).toContain("Fresh recording label: movement-proof-front-leg-isolation");
    expect(markdown).toContain("Front leg isolation and mirror side ownership");
    expect(markdown).toContain("Root travel");
    expect(markdown).toContain("Analyzer should observe root path travel >= 0.160 while tracking remains stable.");
    expect(markdown).toContain("| Scenario | Fresh Recording Label | Estimated Rows Closed | Proof Cases | Blockers | Setup | Movement | Acceptance | Quick Validation | Analyzer Validation Command |");
    expect(markdown).toContain("movement:replay:validate-scenario -- --scenario movement-proof-front-leg-isolation --quiet");
    expect(markdown).toContain("--recording-scenario movement-proof-front-leg-isolation");
    expect(markdown).toContain("--visual-captures tmp/movement-replay-lab/captures/current-proof-set");
    expect(markdown).toContain("| Owner | Priority | Triage | Status | Blocker | Proof Case | Recording | Candidate / Required | Proof Context | Recommended Action | Capture Protocol |");
    expect(markdown).toContain("full-rerecord");
    expect(markdown).toContain("Source/avatar side: left / avatar-left");
    expect(markdown).toContain("Required layers: recorded replay analyzer proof, recorded replay visual capture");
  });
});
