import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  aggregateScenarioValidationSummaries,
  aggregateScenarioValidationSummaryMarkdown,
  aggregateScenarioValidationSummaryText,
  analyzerArgsForRecordingValidationScenario,
  manifestPathForAnalyzerArgs,
  parseValidateRecordingScenarioArgs,
  proofManifestValidationSummary,
  proofManifestValidationSummaryText,
  resolveRecordingPlanForValidation,
  selectRecordingValidationScenario,
  validationDisplayCommand,
} from "./validate-recording-scenario.mjs";

const plan = {
  captureScenarios: [
    {
      freshRecordingLabel: "movement-proof-front-leg-isolation",
      id: "front-leg-isolation",
      proofCases: ["left-leg-raise", "mirror-side-ownership", "right-leg-raise"],
      title: "Front leg isolation and mirror side ownership",
      validation: {
        argvTemplate: [
          "--export",
          "<latest-export-path>",
          "--recording-plan",
          "tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json",
          "--recording-scenario",
          "movement-proof-front-leg-isolation",
          "--visual-captures",
          "tmp/movement-replay-lab/captures/current-proof-set",
          "--review-decisions",
          "tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json",
          "--source-limitation-decisions",
          "tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json",
          "--out",
          "tmp/movement-replay-lab/front-leg-isolation-scenario-reviewed-smoke.json",
        ],
        nodeVersion: "22.13.0",
        recordingScenario: "movement-proof-front-leg-isolation",
      },
    },
    {
      freshRecordingLabel: "movement-proof-root-travel",
      id: "root-travel",
      proofCases: ["root-travel"],
      title: "Root travel",
    },
  ],
};

describe("validate recording scenario", () => {
  it("parses scenario validation CLI options", () => {
    expect(parseValidateRecordingScenarioArgs([
      "--scenario",
      "movement-proof-front-leg-isolation",
      "--controlling-manifest",
      "tmp/reviewed.proof-manifest.json",
      "--recording-plan",
      "tmp/plan.json",
      "--export",
      "tmp/export.zip",
      "--out",
      "tmp/out.json",
      "--summary-out",
      "tmp/summary.json",
      "--summary-markdown-out",
      "tmp/summary.md",
      "--strict-manifest",
      "--quiet",
      "--dry-run",
    ])).toEqual({
      all: false,
      controllingManifestPath: "tmp/reviewed.proof-manifest.json",
      dryRun: true,
      exportPath: "tmp/export.zip",
      out: "tmp/out.json",
      quiet: true,
      recordingPlanPath: "tmp/plan.json",
      recordingPlanPathExplicit: true,
      scenario: "movement-proof-front-leg-isolation",
      strict: false,
      strictManifest: true,
      summaryMarkdownOut: "tmp/summary.md",
      summaryOut: "tmp/summary.json",
    });
  });

  it("parses all-scenario validation mode", () => {
    expect(parseValidateRecordingScenarioArgs([
      "--all",
      "--quiet",
    ])).toMatchObject({
      all: true,
      quiet: true,
      scenario: "",
    });
  });

  it("auto-discovers a support recording plan when the scenario is not in the default plan", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "movement-validate-plan-"));
    const defaultPlanPath = path.join(tempDir, "default.json");
    const supportPlanPath = path.join(tempDir, "support.json");

    try {
      await writeFile(defaultPlanPath, `${JSON.stringify({ captureScenarios: [] })}\n`);
      await writeFile(supportPlanPath, `${JSON.stringify({
        captureScenarios: [
          {
            freshRecordingLabel: "movement-proof-seated-forward-fold",
            id: "seated-forward-fold",
            proofCases: ["seated-forward-fold"],
          },
        ],
      })}\n`);

      const result = await resolveRecordingPlanForValidation(
        {
          all: false,
          recordingPlanPath: defaultPlanPath,
          recordingPlanPathExplicit: false,
          scenario: "movement-proof-seated-forward-fold",
        },
        {
          supportRecordingPlanPaths: [supportPlanPath],
        },
      );

      expect(result.recordingPlanPath).toBe(supportPlanPath);
      expect(result.preselectedScenario.id).toBe("seated-forward-fold");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("requires an explicit recording plan when auto-discovery is ambiguous", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "movement-validate-plan-"));
    const firstPlanPath = path.join(tempDir, "first.json");
    const secondPlanPath = path.join(tempDir, "second.json");
    const duplicatePlan = {
      captureScenarios: [
        {
          freshRecordingLabel: "movement-proof-root-travel",
          id: "root-travel",
          proofCases: ["root-travel"],
        },
      ],
    };

    try {
      await writeFile(firstPlanPath, `${JSON.stringify(duplicatePlan)}\n`);
      await writeFile(secondPlanPath, `${JSON.stringify(duplicatePlan)}\n`);

      await expect(resolveRecordingPlanForValidation(
        {
          all: false,
          recordingPlanPath: firstPlanPath,
          recordingPlanPathExplicit: false,
          scenario: "movement-proof-root-travel",
        },
        {
          supportRecordingPlanPaths: [secondPlanPath],
        },
      )).rejects.toThrow("matched multiple recording plans");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("selects scenarios by label, id, title, or proof case", () => {
    expect(selectRecordingValidationScenario(plan, "movement-proof-front-leg-isolation").id).toBe("front-leg-isolation");
    expect(selectRecordingValidationScenario(plan, "front-leg-isolation").id).toBe("front-leg-isolation");
    expect(selectRecordingValidationScenario(plan, "Front leg isolation and mirror side ownership").id).toBe("front-leg-isolation");
    expect(selectRecordingValidationScenario(plan, "mirror-side-ownership").id).toBe("front-leg-isolation");
  });

  it("fills validation argv templates with export, plan, and output overrides", () => {
    const scenario = selectRecordingValidationScenario(plan, "front-leg-isolation");

    expect(analyzerArgsForRecordingValidationScenario(scenario, {
      exportPath: "tmp/latest-export.zip",
      out: "tmp/custom-front-leg.json",
      recordingPlanPath: "tmp/custom-plan.json",
      strict: true,
      strictManifest: false,
    })).toEqual([
      "--export",
      "tmp/latest-export.zip",
      "--recording-plan",
      "tmp/custom-plan.json",
      "--recording-scenario",
      "movement-proof-front-leg-isolation",
      "--visual-captures",
      "tmp/movement-replay-lab/captures/current-proof-set",
      "--review-decisions",
      "tmp/movement-replay-lab/current-proof-review-decisions.codex-visual-review.json",
      "--source-limitation-decisions",
      "tmp/movement-replay-lab/current-proof-source-limitations.codex-product-limitations.json",
      "--out",
      "tmp/custom-front-leg.json",
      "--strict",
    ]);
  });

  it("falls back to a minimal analyzer argv when an older plan lacks validation", () => {
    const scenario = selectRecordingValidationScenario(plan, "root-travel");

    expect(analyzerArgsForRecordingValidationScenario(scenario, {
      exportPath: "tmp/latest-export.zip",
      out: "",
      recordingPlanPath: "tmp/custom-plan.json",
      strict: false,
      strictManifest: true,
    })).toEqual([
      "--export",
      "tmp/latest-export.zip",
      "--recording-plan",
      "tmp/custom-plan.json",
      "--recording-scenario",
      "movement-proof-root-travel",
      "--strict-manifest",
    ]);
  });

  it("formats a dry-run command for humans", () => {
    expect(validationDisplayCommand([
      "--export",
      "tmp/latest export.zip",
      "--recording-scenario",
      "movement-proof-root-travel",
    ])).toBe(
      "npx -p node@22.13.0 npm run movement:replay:analyze -- --export 'tmp/latest export.zip' --recording-scenario movement-proof-root-travel",
    );
  });

  it("derives the proof manifest path from analyzer args", () => {
    expect(manifestPathForAnalyzerArgs([
      "--out",
      "tmp/front-leg.json",
    ])).toBe("tmp/front-leg.proof-manifest.json");
    expect(manifestPathForAnalyzerArgs([
      "--out",
      "tmp/front-leg",
    ])).toBe("tmp/front-leg.proof-manifest.json");
    expect(manifestPathForAnalyzerArgs([
      "--manifest-out",
      "tmp/custom-manifest.json",
      "--out",
      "tmp/front-leg.json",
    ])).toBe("tmp/custom-manifest.json");
  });

  it("summarizes proof manifest results for the validator", () => {
    const manifest = {
      summary: {
        acceptedProductLimitationCount: 10,
        blockingRowsByProofBlockerCode: {
          "candidate-below-threshold": 20,
          "mirror-side-not-isolated": 5,
        },
        failedCount: 0,
        manualReviewCount: 0,
        missingProofCount: 25,
        passedCount: 30,
        totalRows: 65,
        visualCaptureFrameCount: 230,
        visualCaptureRowCount: 40,
      },
    };

    expect(proofManifestValidationSummary(manifest)).toMatchObject({
      acceptedProductLimitationCount: 10,
      missingProofCount: 25,
      passedCount: 30,
      totalRows: 65,
    });
    expect(proofManifestValidationSummaryText(manifest, "tmp/front-leg.proof-manifest.json")).toContain(
      "65 rows; 30 passed; 0 failed; 25 missing-proof; 0 manual-review; 0 product-scope-limitation; 10 accepted limitations; 40 visual rows; 230 frame matches",
    );
    expect(proofManifestValidationSummaryText(manifest, "tmp/front-leg.proof-manifest.json")).toContain(
      "candidate-below-threshold:20, mirror-side-not-isolated:5",
    );
  });

  it("aggregates all-scenario validation results as row-occurrences", () => {
    const aggregate = aggregateScenarioValidationSummaries(
      [
        {
          manifestPath: "tmp/front-leg.proof-manifest.json",
          scenario: "movement-proof-front-leg-isolation",
          summary: {
            acceptedProductLimitationCount: 10,
            blockerCodes: {
              "candidate-below-threshold": 20,
              "mirror-side-not-isolated": 5,
            },
            failedCount: 0,
            manualReviewCount: 0,
            missingProofCount: 25,
            passedCount: 30,
            sourceDataLimitationCount: 10,
            totalRows: 65,
            visualCaptureFrameCount: 230,
            visualCaptureRowCount: 40,
          },
        },
        {
          manifestPath: "tmp/root-turn.proof-manifest.json",
          scenario: "movement-proof-root-turn",
          summary: {
            acceptedProductLimitationCount: 8,
            blockerCodes: {
              "candidate-below-threshold": 10,
              "far-camera-source-quality": 1,
            },
            failedCount: 0,
            manualReviewCount: 0,
            missingProofCount: 12,
            passedCount: 32,
            sourceDataLimitationCount: 8,
            totalRows: 52,
            visualCaptureFrameCount: 217,
            visualCaptureRowCount: 40,
          },
        },
      ],
      {
        controllingManifest: {
          summary: {
            acceptedProductLimitationCount: 18,
            blockingRowsByProofBlockerCode: {
              "candidate-below-threshold": 28,
              "mirror-side-not-isolated": 5,
            },
            failedCount: 0,
            manualReviewCount: 0,
            missingProofCount: 35,
            passedCount: 64,
            totalRows: 117,
          },
        },
        controllingManifestPath: "tmp/reviewed.proof-manifest.json",
      },
    );

    expect(aggregate).toMatchObject({
      scenarioCount: 2,
      totals: {
        acceptedProductLimitationCount: 18,
        blockerCodes: {
          "candidate-below-threshold": 30,
          "far-camera-source-quality": 1,
          "mirror-side-not-isolated": 5,
        },
        manualReviewCount: 0,
        missingProofCount: 37,
        passedCount: 62,
        totalRows: 117,
      },
    });
    expect(aggregate.controllingManifest).toMatchObject({
      path: "tmp/reviewed.proof-manifest.json",
      summary: {
        missingProofCount: 35,
        passedCount: 64,
        totalRows: 117,
      },
    });
    expect(aggregate.scenarioRowsNote).toContain("row-occurrences");
    expect(aggregateScenarioValidationSummaryText(aggregate)).toContain(
      "Unique controlling manifest: 117 rows; 64 passed; 0 failed; 35 missing-proof; 0 manual-review; 0 product-scope-limitation; 18 accepted limitations.",
    );
    expect(aggregateScenarioValidationSummaryText(aggregate)).toContain(
      "2 scenario(s); 117 row-occurrences; 62 passed; 0 failed; 37 missing-proof; 0 manual-review; 0 product-scope-limitation; 18 accepted limitations",
    );
    expect(aggregateScenarioValidationSummaryText(aggregate)).toContain(
      "Aggregate blockers: candidate-below-threshold:30, mirror-side-not-isolated:5, far-camera-source-quality:1.",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain(
      "## Controlling Reviewed Manifest",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain(
      "Unique rows: 117",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain(
      "| Scenario | Rows | Passed | Missing Proof | Manual Review | Product-Scope Limitations | Accepted Limitations | Visual Rows | Frame Matches | Blockers | Manifest |",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain(
      "| movement-proof-front-leg-isolation | 65 | 30 | 25 | 0 | 0 | 10 | 40 | 230 | candidate-below-threshold:20, mirror-side-not-isolated:5 | tmp/front-leg.proof-manifest.json |",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain(
      "Scenario rows can overlap; totals are row-occurrences, not unique proof rows.",
    );
  });

  it("summarizes an empty all-scenario validation plan without blockers", () => {
    const aggregate = aggregateScenarioValidationSummaries([], {
      controllingManifest: {
        summary: {
          acceptedProductLimitationCount: 27,
          blockingRowsByProofBlockerCode: {},
          failedCount: 0,
          manualReviewCount: 0,
          missingProofCount: 0,
          passedCount: 64,
          productScopeLimitationCount: 9,
          totalRows: 117,
        },
      },
      controllingManifestPath: "tmp/current-analysis-reviewed.proof-manifest.json",
    });

    expect(aggregate).toMatchObject({
      scenarioCount: 0,
      totals: {
        acceptedProductLimitationCount: 0,
        blockerCodes: {},
        missingProofCount: 0,
        passedCount: 0,
        productScopeLimitationCount: 0,
        totalRows: 0,
      },
    });
    expect(aggregate.controllingManifest).toMatchObject({
      summary: {
        acceptedProductLimitationCount: 27,
        missingProofCount: 0,
        passedCount: 64,
        productScopeLimitationCount: 9,
        totalRows: 117,
      },
    });
    expect(aggregateScenarioValidationSummaryText(aggregate)).toContain(
      "0 scenario(s); 0 row-occurrences; 0 passed; 0 failed; 0 missing-proof; 0 manual-review; 0 product-scope-limitation; 0 accepted limitations",
    );
    expect(aggregateScenarioValidationSummaryMarkdown(aggregate)).toContain("Scenarios: 0");
  });
});
