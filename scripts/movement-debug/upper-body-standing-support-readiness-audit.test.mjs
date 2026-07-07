import { describe, expect, it } from "vitest";

import {
  applyBroadCaptureContractArgs,
  auditUpperBodyStandingSupportReadiness,
  formatBroadCaptureContract,
  formatBroadCaptureGuide,
  formatBroadCandidateReview,
  mergeGameVisualPlans,
  mergeSemanticReviews,
  parseUpperBodyStandingSupportReadinessAuditArgs,
  validateBroadCaptureContractAuditArtifacts,
  validateBroadCaptureContractGameVisualPlan,
  validateBroadCaptureContractSemanticReview,
  validateBroadCaptureContractShape,
} from "./upper-body-standing-support-readiness-audit.mjs";

function row(recordingId, proofCase, status = "passed", overrides = {}) {
  return {
    proofCase,
    recordingId,
    status,
    ...overrides,
  };
}

function decision(proofCase) {
  return {
    decision: "readable-pass",
    reviewContext: {
      cases: [proofCase],
    },
  };
}

const broadManifestProofCases = [
  "standing-arm-raise",
  "standing-twist",
  "standing-reach",
  "shoulder-scapula-control",
];

const broadReadableGameCases = [
  "strongest-side-bend",
  "strongest-head-direction",
  "strongest-standing-arm-raise",
  "strongest-standing-twist",
  "strongest-standing-reach",
];
const narrowReadableGameCases = [
  "strongest-side-bend",
  "strongest-head-direction",
];

describe("upper body standing support readiness audit", () => {
  it("blocks broad support when only narrow side-bend and head-direction proof exists", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: ["baseline", "strongest-squat"],
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          row("recording-b", "standing"),
          row("recording-b", "head-direction"),
        ],
      },
      semanticReview: {
        decisions: [
          decision("baseline"),
          decision("strongest-squat"),
        ],
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingBroadGamePlanCases: broadReadableGameCases,
      missingBroadManifestProofCases: broadManifestProofCases,
      missingBroadPassedProofCases: broadManifestProofCases,
      missingBroadReadableGameCases: broadReadableGameCases,
      missingNarrowGamePlanCases: narrowReadableGameCases,
      missingNarrowReadableGameCases: narrowReadableGameCases,
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: false,
    });
  });

  it("marks a narrow side-bend/head-direction claim ready when recorded and Game readability proof exist", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: narrowReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
        ],
      },
      semanticReview: {
        decisions: narrowReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingNarrowGamePlanCases: [],
      missingNarrowReadableGameCases: [],
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: true,
    });
  });

  it("passes when broad manifest proof and Game readability are both present", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: broadReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          ...broadManifestProofCases.map((proofCase) => row("recording-a", proofCase)),
        ],
      },
      semanticReview: {
        decisions: broadReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadPassingRecordingIds: ["recording-a"],
      broadPassedProofCandidates: [
        {
          missingPassedProofCases: [],
          passedProofCaseCount: 4,
          recordingId: "recording-a",
        },
      ],
      broadReady: true,
      missingBroadGamePlanCases: [],
      missingBroadManifestProofCases: [],
      missingBroadPassedProofCases: [],
      missingBroadReadableGameCases: [],
      missingNarrowGamePlanCases: [],
      missingNarrowReadableGameCases: [],
      narrowPassingRecordingIds: ["recording-a"],
      narrowReady: true,
    });
  });

  it("blocks broad support when broad passed proof cases are split across recordings", () => {
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: broadReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          row("recording-a", "standing-arm-raise"),
          row("recording-a", "standing-twist"),
          row("recording-b", "standing-reach"),
          row("recording-b", "shoulder-scapula-control"),
        ],
      },
      semanticReview: {
        decisions: broadReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadPassingRecordingIds: [],
      broadPassedProofCandidates: [
        {
          missingPassedProofCases: [
            "standing-reach",
            "shoulder-scapula-control",
          ],
          passedProofCaseCount: 2,
          recordingId: "recording-a",
        },
        {
          missingPassedProofCases: [
            "standing-arm-raise",
            "standing-twist",
          ],
          passedProofCaseCount: 2,
          recordingId: "recording-b",
        },
      ],
      broadReady: false,
      missingBroadGamePlanCases: [],
      missingBroadManifestProofCases: [],
      missingBroadPassedProofCases: [],
      missingBroadReadableGameCases: [],
    });

    const review = formatBroadCandidateReview(audit);
    expect(review).toContain("## Top Passed-Proof Candidates");
    expect(review).toContain("| 1 | `recording-a` | 2 | standing-reach, shoulder-scapula-control | standing-arm-raise, standing-twist |");
  });

  it("reports product-scoped broad evidence without treating it as passed proof", () => {
    const productScopedEvidence = {
      evidenceFrameCount: 12,
      expectedMinimumAmplitude: 1,
      observedAmplitude: 2,
    };
    const audit = auditUpperBodyStandingSupportReadiness({
      gameVisualPlan: {
        summary: {
          proofCases: broadReadableGameCases,
        },
      },
      manifest: {
        rows: [
          row("recording-a", "standing"),
          row("recording-a", "side-bend"),
          row("recording-a", "head-direction"),
          ...broadManifestProofCases.map((proofCase) => (
            row("recording-a", proofCase, "product-scope-limitation", productScopedEvidence)
          )),
          row("recording-b", "standing-arm-raise", "product-scope-limitation", productScopedEvidence),
          row("recording-b", "standing-twist", "product-scope-limitation", {
            evidenceFrameCount: 0,
            expectedMinimumAmplitude: 1,
            observedAmplitude: 0,
          }),
        ],
      },
      semanticReview: {
        decisions: broadReadableGameCases.map(decision),
      },
    });

    expect(audit).toMatchObject({
      broadReady: false,
      missingBroadPassedProofCases: broadManifestProofCases,
      productScopedBroadEvidenceRecordingIds: ["recording-a"],
      productScopedBroadEvidenceCandidates: [
        {
          missingProductScopedEvidenceCases: [],
          recordingId: "recording-a",
          totalEvidenceFrameCount: 48,
        },
        {
          missingProductScopedEvidenceCases: [
            "standing-twist",
            "standing-reach",
            "shoulder-scapula-control",
          ],
          recordingId: "recording-b",
          totalEvidenceFrameCount: 12,
        },
      ],
      productScopedBroadEvidenceSummary: {
        "standing-arm-raise": {
          evidenceProductScopeCount: 2,
          maxObservedAmplitude: 2,
          productScopeCount: 2,
        },
        "standing-twist": {
          evidenceProductScopeCount: 1,
          maxObservedAmplitude: 2,
          productScopeCount: 2,
        },
      },
    });

    const review = formatBroadCandidateReview(audit);
    expect(review).toContain("# Broad Upper-Body Standing Candidate Review");
    expect(review).toContain("`recording-a`");
    expect(review).toContain("standing-arm-raise: 12 frame(s), observed 2");
    expect(review).toContain("## Top Passed-Proof Candidates");
    expect(review).toContain("Capture Protocol");
    expect(review).toContain("Capture a new explicit broad upper-body bundle");

    const captureGuide = formatBroadCaptureGuide(audit, { captureLabel: "broad explicit!" });
    expect(captureGuide).toContain("# Broad Upper-Body Standing Explicit Capture Guide");
    expect(captureGuide).toContain("Suggested recording label: `broad-explicit-`");
    expect(captureGuide).toContain("--recording-ids <new-recording-id>");
    expect(captureGuide).toContain("pass `--recording-id <id>`");
    expect(captureGuide).toContain("--include-standing-upper-body-targets");
    expect(captureGuide).toContain("--include-broad-upper-body-product-scope-proof");
    expect(captureGuide).toContain("movement:replay:proof-set");
    expect(captureGuide).toContain("movement:replay:review");
    expect(captureGuide).toContain("--manifest tmp/movement-replay-lab/broad-explicit--analysis-reviewed.proof-manifest.json");
    expect(captureGuide).toContain("--proof-case strongest-standing-arm-raise");
    expect(captureGuide).toContain("movement:upper-body-standing-support-audit");
    expect(captureGuide).toContain("--capture-contract <capture-contract-file>");
    expect(captureGuide).not.toContain("--capture-contract <capture-contract-file> --strict");

    const recordingIdGuide = formatBroadCaptureGuide(audit, {
      captureLabel: "broad explicit!",
      recordingId: "rec_123 upper",
    });
    expect(recordingIdGuide).toContain("recording id `rec_123 upper`");
    expect(recordingIdGuide).toContain("--recording-ids 'rec_123 upper'");
    expect(recordingIdGuide).not.toContain("--recording-ids <new-recording-id>");

    const contract = formatBroadCaptureContract(audit, {
      captureLabel: "broad explicit!",
      recordingId: "rec_123 upper",
    });
    expect(contract).toMatchObject({
      broadPassedProofCandidates: [],
      broadPassingRecordingIds: [],
      broadReady: false,
      missingBroadGamePlanCases: [],
      missingBroadManifestProofCases: [],
      missingBroadPassedProofCases: broadManifestProofCases,
      missingBroadReadableGameCases: [],
      recordingId: "rec_123 upper",
      recordingIdPlaceholder: null,
      requiredGameProofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-twist",
        "strongest-standing-reach",
      ],
      requiredRecordedProofCases: broadManifestProofCases,
      safeLabel: "broad-explicit-",
      schema: "sonae-broad-upper-body-capture-contract/v1",
      supportClaimBlockers: {
        missingBroadGamePlanCases: [],
        missingBroadManifestProofCases: [],
        missingBroadPassedProofCases: broadManifestProofCases,
        missingBroadReadableGameCases: [],
        requiresSinglePassingRecordingBundle: true,
      },
      supportClaimStatus: "blocked-internal-demo-only",
    });
    expect(contract.commands).toHaveLength(8);
    expect(contract.commands[0]).toMatchObject({
      id: "initial-analysis",
    });
    expect(contract.commands[0].command).toContain("--recording-ids 'rec_123 upper'");
    expect(contract.commands.at(-1).command).toContain("movement:upper-body-standing-support-audit");
    expect(contract.commands.at(-1).command).toContain("--strict");
    expect(validateBroadCaptureContractShape(contract)).toEqual([]);

    const driftedContract = JSON.parse(JSON.stringify(contract));
    driftedContract.commands = driftedContract.commands.map((command) => (
      command.id === "focused-game-visual-plan"
        ? {
            ...command,
            command: command.command.replace(
              driftedContract.paths.gameVisualPlan,
              "tmp/movement-replay-lab/drifted-game-visual-proof-plan.json",
            ),
          }
        : command
    ));
    expect(validateBroadCaptureContractShape(driftedContract)).toContain(
      "expected focused-game-visual-plan command to reference contract path(s): tmp/movement-replay-lab/broad-explicit--game-visual-proof-plan.json",
    );

    const inconsistentContract = JSON.parse(JSON.stringify(contract));
    inconsistentContract.broadReady = true;
    expect(validateBroadCaptureContractShape(inconsistentContract)).toEqual(expect.arrayContaining([
      "expected supportClaimStatus ready-for-scoped-support-review when broadReady is true",
      "expected supportClaimBlockers to be empty when broadReady is true",
    ]));

    const malformedRetryStateContract = JSON.parse(JSON.stringify(contract));
    malformedRetryStateContract.broadPassingRecordingIds = [""];
    malformedRetryStateContract.broadPassedProofCandidates = [
      {
        missingPassedProofCases: ["unknown-proof-case"],
        passedProofCaseCount: 2,
        passedProofCases: ["standing-arm-raise"],
        recordingId: "",
      },
      "not-a-candidate",
    ];
    expect(validateBroadCaptureContractShape(malformedRetryStateContract)).toEqual(expect.arrayContaining([
      "expected broadPassingRecordingIds to contain non-empty strings",
      "expected broadPassedProofCandidates[0].recordingId non-empty string",
      "expected broadPassedProofCandidates[0].missingPassedProofCases to contain only required recorded proof cases",
      "expected broadPassedProofCandidates[0].passedProofCaseCount to match passedProofCases length",
      "expected broadPassedProofCandidates[1] object",
    ]));

    const malformedBlockerContract = JSON.parse(JSON.stringify(contract));
    malformedBlockerContract.missingBroadGamePlanCases = ["unknown-game-case"];
    malformedBlockerContract.missingBroadManifestProofCases = ["unknown-recorded-case"];
    malformedBlockerContract.supportClaimBlockers = {
      missingBroadGamePlanCases: ["unknown-game-case"],
      missingBroadManifestProofCases: ["unknown-recorded-case"],
      missingBroadPassedProofCases: ["unknown-recorded-case"],
      missingBroadReadableGameCases: ["unknown-game-case"],
      requiresSinglePassingRecordingBundle: true,
    };
    expect(validateBroadCaptureContractShape(malformedBlockerContract)).toEqual(expect.arrayContaining([
      "expected missingBroadGamePlanCases to contain only required proof cases",
      "expected missingBroadManifestProofCases to contain only required proof cases",
      "expected supportClaimBlockers.missingBroadGamePlanCases to contain only required proof cases",
      "expected supportClaimBlockers.missingBroadManifestProofCases to contain only required proof cases",
      "expected supportClaimBlockers.missingBroadPassedProofCases to contain only required proof cases",
      "expected supportClaimBlockers.missingBroadReadableGameCases to contain only required proof cases",
    ]));

    const mismatchedBlockerContract = JSON.parse(JSON.stringify(contract));
    mismatchedBlockerContract.supportClaimBlockers.missingBroadGamePlanCases = ["strongest-standing-arm-raise"];
    mismatchedBlockerContract.supportClaimBlockers.missingBroadManifestProofCases = ["standing-arm-raise"];
    expect(validateBroadCaptureContractShape(mismatchedBlockerContract)).toEqual(expect.arrayContaining([
      "expected supportClaimBlockers.missingBroadGamePlanCases to match missingBroadGamePlanCases",
      "expected supportClaimBlockers.missingBroadManifestProofCases to match missingBroadManifestProofCases",
    ]));

    expect(validateBroadCaptureContractShape({
      commands: [
        {
          command: "npx -p node@22.13.0 npm run movement:upper-body-standing-support-audit",
          id: "merged-readiness-audit",
        },
      ],
      requiredGameProofCases: ["strongest-standing-arm-raise"],
      requiredRecordedProofCases: ["standing-arm-raise"],
      schema: "old-contract/v0",
    })).toEqual([
      "expected schema sonae-broad-upper-body-capture-contract/v1",
      "expected command ids initial-analysis,replay-proof-set,replay-review,reviewed-analysis,focused-game-visual-plan,focused-game-visual-capture,focused-game-visual-review,merged-readiness-audit",
      "expected recorded proof cases standing-arm-raise,standing-twist,standing-reach,shoulder-scapula-control",
      "expected Game proof cases strongest-standing-arm-raise,strongest-standing-twist,strongest-standing-reach",
      "expected broadPassingRecordingIds array",
      "expected broadPassedProofCandidates array",
      "expected missingBroadGamePlanCases array",
      "expected missingBroadManifestProofCases array",
      "expected missingBroadPassedProofCases array",
      "expected missingBroadReadableGameCases array",
      "expected broadReady boolean",
      "expected supportClaimStatus blocked-internal-demo-only|ready-for-scoped-support-review",
      "expected supportClaimBlockers object",
      "expected merged-readiness-audit command to include --strict",
    ]);
  });

  it("parses CLI options", () => {
    expect(parseUpperBodyStandingSupportReadinessAuditArgs([
      "--manifest",
      "tmp/manifest.json",
      "--game-visual-plan",
      "tmp/plan.json",
      "--game-visual-plan",
      "tmp/broad-plan.json",
      "--semantic-review",
      "tmp/review.json",
      "--semantic-review",
      "tmp/broad-review.json",
      "--capture-contract",
      "tmp/capture-contract-input.json",
      "--candidate-review-out",
      "tmp/candidate-review.md",
      "--capture-guide-out",
      "tmp/capture-guide.md",
      "--capture-contract-out",
      "tmp/capture-contract.json",
      "--capture-label",
      "movement proof broad",
      "--recording-id",
      "rec_123",
      "--strict",
      "--json",
    ])).toEqual({
      gameVisualPlanPaths: ["tmp/plan.json", "tmp/broad-plan.json"],
      captureContractPath: "tmp/capture-contract-input.json",
      captureGuideOutPath: "tmp/capture-guide.md",
      captureLabel: "movement proof broad",
      candidateReviewOutPath: "tmp/candidate-review.md",
      captureContractOutPath: "tmp/capture-contract.json",
      json: true,
      manifestPath: "tmp/manifest.json",
      recordingId: "rec_123",
      semanticReviewPaths: ["tmp/review.json", "tmp/broad-review.json"],
      strict: true,
    });
  });

  it("applies generated broad capture contract paths to final audit inputs", () => {
    expect(applyBroadCaptureContractArgs({
      gameVisualPlanPaths: ["tmp/default-plan.json"],
      manifestPath: "tmp/default-manifest.json",
      semanticReviewPaths: ["tmp/default-review.json"],
      strict: false,
    }, {
      paths: {
        gameVisualPlan: "tmp/focused-plan.json",
        reviewedManifest: "tmp/reviewed-manifest.json",
        semanticReviewDecisions: "tmp/focused-review.json",
      },
    })).toMatchObject({
      gameVisualPlanPaths: [
        "tmp/movement-replay-lab/current-game-visual-proof-plan.json",
        "tmp/focused-plan.json",
      ],
      manifestPath: "tmp/reviewed-manifest.json",
      semanticReviewPaths: [
        "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.codex-semantic-review.json",
        "tmp/focused-review.json",
      ],
      strict: true,
    });

    expect(() => applyBroadCaptureContractArgs({}, {
      paths: {
        gameVisualPlan: "tmp/focused-plan.json",
      },
    })).toThrow("Broad capture contract is missing path(s): reviewedManifest, semanticReviewDecisions");
  });

  it("validates generated broad capture contract artifacts before final audit", () => {
    const contract = {
      paths: {
        gameVisualPlan: "tmp/focused-plan.json",
        reviewedManifest: "tmp/reviewed-manifest.json",
        semanticReviewDecisions: "tmp/focused-review.json",
      },
    };
    const existingPaths = new Set([
      "/repo/tmp/focused-plan.json",
      "/repo/tmp/focused-review.json",
      "/repo/tmp/reviewed-manifest.json",
    ]);

    expect(validateBroadCaptureContractAuditArtifacts(contract, {
      fileExists: (filePath) => existingPaths.has(filePath),
      rootDir: "/repo",
    })).toEqual([]);

    expect(validateBroadCaptureContractAuditArtifacts(contract, {
      fileExists: (filePath) => filePath !== "/repo/tmp/reviewed-manifest.json",
      rootDir: "/repo",
    })).toEqual([
      {
        key: "reviewedManifest",
        nextAction: "run the reviewed-analysis command from the capture contract",
        path: "tmp/reviewed-manifest.json",
      },
    ]);

    expect(validateBroadCaptureContractAuditArtifacts({ paths: {} }, {
      fileExists: () => true,
      rootDir: "/repo",
    })).toEqual([
      {
        key: "reviewedManifest",
        nextAction: "run the reviewed-analysis command from the capture contract",
        path: null,
      },
      {
        key: "gameVisualPlan",
        nextAction: "run the focused-game-visual-plan command from the capture contract",
        path: null,
      },
      {
        key: "semanticReviewDecisions",
        nextAction: "fill the focused Game semantic review decisions after running focused-game-visual-review",
        path: null,
      },
    ]);
  });

  it("validates focused semantic review decisions before a contract final audit", () => {
    const contract = {
      requiredGameProofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-twist",
        "strongest-standing-reach",
      ],
    };

    expect(validateBroadCaptureContractSemanticReview(contract, {
      decisions: [
        decision("strongest-standing-arm-raise"),
        decision("strongest-standing-twist"),
        decision("strongest-standing-reach"),
      ],
    })).toEqual([]);

    expect(validateBroadCaptureContractSemanticReview(contract, {
      decisions: [
        decision("strongest-standing-arm-raise"),
        {
          decision: "TODO",
          reviewContext: {
            cases: ["strongest-standing-twist"],
          },
        },
      ],
    })).toEqual([
      {
        observedDecisions: ["TODO"],
        proofCase: "strongest-standing-twist",
        nextAction: "review the focused Game capture and mark this proof case readable-pass only if the screenshot supports it",
      },
      {
        observedDecisions: [],
        proofCase: "strongest-standing-reach",
        nextAction: "run focused-game-visual-review and add this proof case to the semantic review decisions",
      },
    ]);
  });

  it("validates focused Game visual plan cases before a contract final audit", () => {
    const contract = {
      requiredGameProofCases: [
        "strongest-standing-arm-raise",
        "strongest-standing-twist",
        "strongest-standing-reach",
      ],
    };

    expect(validateBroadCaptureContractGameVisualPlan(contract, {
      summary: {
        proofCases: [
          "strongest-standing-arm-raise",
          "strongest-standing-twist",
          "strongest-standing-reach",
        ],
      },
    })).toEqual([]);

    expect(validateBroadCaptureContractGameVisualPlan(contract, {
      captures: [
        {
          target: {
            cases: ["strongest-standing-arm-raise"],
          },
        },
        {
          target: {
            cases: ["strongest-standing-twist"],
          },
        },
      ],
    })).toEqual([
      {
        plannedProofCases: [
          "strongest-standing-arm-raise",
          "strongest-standing-twist",
        ],
        proofCase: "strongest-standing-reach",
        nextAction: "rerun focused-game-visual-plan from the capture contract so the broad Game proof case is captured and reviewed",
      },
    ]);
  });

  it("merges default and supplemental Game visual proof artifacts", () => {
    expect(mergeGameVisualPlans([
      {
        summary: {
          proofCases: ["strongest-side-bend", "strongest-head-direction"],
        },
      },
      {
        sessions: [
          {
            proofCases: ["strongest-standing-arm-raise"],
          },
        ],
      },
    ])).toEqual({
      captures: [],
      sessions: [
        {
          proofCases: ["strongest-standing-arm-raise"],
        },
      ],
      summary: {
        proofCases: [
          "strongest-head-direction",
          "strongest-side-bend",
          "strongest-standing-arm-raise",
        ],
      },
    });

    expect(mergeSemanticReviews([
      {
        decisions: [decision("strongest-side-bend")],
      },
      {
        decisions: [decision("strongest-standing-arm-raise")],
      },
    ])).toEqual({
      decisions: [
        decision("strongest-side-bend"),
        decision("strongest-standing-arm-raise"),
      ],
    });
  });
});
