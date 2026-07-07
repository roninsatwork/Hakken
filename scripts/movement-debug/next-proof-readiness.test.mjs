import { describe, expect, it } from "vitest";

import {
  buildNextProofReadinessSummary,
  formatNextProofReadinessSummary,
  nextProofReadinessStrictFailure,
  parseNextProofReadinessArgs,
} from "./next-proof-readiness.mjs";

function audit(overrides = {}) {
  return {
    family: "sitting",
    missingAnalyzerProofCases: ["seated-forward-fold"],
    missingGamePlanCases: ["strongest-seated-forward-fold"],
    missingReadableGameCases: ["strongest-seated-forward-fold"],
    missingRecordedPassedProofCases: ["seated-forward-fold"],
    ready: false,
    recordingGap: {
      captureScenarios: [
        {
          blockerCodes: ["no-candidate-amplitude"],
          freshRecordingLabel: "movement-proof-seated-forward-fold",
          protocol: {
            acceptance: "Analyzer should observe seated forward-fold amplitude while chair contact remains stable.",
            movement: "Fold forward from the hips and return to seated neutral.",
            setup: "Camera sees the seated body and chair contact throughout.",
          },
          proofCases: ["seated-forward-fold"],
          quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet",
          recordingIds: ["seated-partial"],
          validationCommand: "npx -p node@22.13.0 npm run movement:replay:analyze -- --recording-scenario movement-proof-seated-forward-fold",
          validationOutputPath: "tmp/movement-replay-lab/seated-forward-fold-scenario-reviewed-smoke.json",
        },
      ],
      planPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
      summary: {
        captureScenarioCount: 1,
        totalRows: 1,
      },
    },
    ...overrides,
  };
}

describe("next proof readiness", () => {
  it("parses CLI options", () => {
    expect(parseNextProofReadinessArgs([
      "--json",
      "--out",
      "tmp/summary.json",
      "--markdown-out",
      "tmp/summary.md",
      "--no-write",
      "--strict",
    ])).toEqual({
      help: false,
      json: true,
      markdownOutPath: "tmp/summary.md",
      outPath: "tmp/summary.json",
      strict: true,
      write: false,
    });
  });

  it("summarizes sitting and walking proof blockers with short commands", () => {
    const summary = buildNextProofReadinessSummary({
      generatedAt: "2026-07-07T00:00:00.000Z",
      sitting: audit(),
      walking: audit({
        family: "walking",
        missingAnalyzerProofCases: ["root-travel"],
        missingGamePlanCases: ["strongest-root-travel"],
        missingReadableGameCases: ["strongest-root-travel"],
        missingRecordedPassedProofCases: ["root-travel"],
        recordingGap: {
          captureScenarios: [
            {
              blockerCodes: ["candidate-below-threshold"],
              freshRecordingLabel: "movement-proof-root-travel",
              protocol: {
                acceptance: "Analyzer should observe root path travel >= 0.160 while tracking remains stable.",
                movement: "Take large deliberate steps across the camera view.",
                setup: "Full body visible with enough floor space to move across frame.",
              },
              proofCases: ["root-travel"],
              quickValidationCommand: "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet",
              recordingIds: ["walking-partial"],
              validationCommand: "npx -p node@22.13.0 npm run movement:replay:analyze -- --recording-scenario movement-proof-root-travel",
              validationOutputPath: "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json",
            },
          ],
          planPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
          summary: {
            captureScenarioCount: 1,
            totalRows: 1,
          },
        },
      }),
    });

    expect(summary).toMatchObject({
      blockedFamilies: ["sitting", "walking"],
      ready: false,
    });
    expect(summary.nextCommands).toEqual([
      "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet",
      "npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-root-travel --quiet",
    ]);
    expect(summary.families[0]).toMatchObject({
      family: "sitting",
      nextBlockerCodes: ["no-candidate-amplitude"],
      nextFreshRecordingLabel: "movement-proof-seated-forward-fold",
      nextProtocolText: "Setup: Camera sees the seated body and chair contact throughout. Movement: Fold forward from the hips and return to seated neutral. Acceptance: Analyzer should observe seated forward-fold amplitude while chair contact remains stable.",
      nextProofCases: ["seated-forward-fold"],
      nextRecordingIds: ["seated-partial"],
      nextValidationCommand: "npx -p node@22.13.0 npm run movement:replay:analyze -- --recording-scenario movement-proof-seated-forward-fold",
      nextValidationOutputPath: "tmp/movement-replay-lab/seated-forward-fold-scenario-reviewed-smoke.json",
      recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
    });
  });

  it("formats a Markdown readiness handoff", () => {
    const summary = buildNextProofReadinessSummary({
      generatedAt: "2026-07-07T00:00:00.000Z",
      sitting: audit(),
      walking: audit({
        family: "walking",
        recordingGap: {
          captureScenarios: [],
          summary: {
            captureScenarioCount: 0,
            totalRows: 0,
          },
        },
      }),
    });
    const markdown = formatNextProofReadinessSummary(summary, {
      sittingText: "Sitting support readiness: blocked",
      walkingText: "Walking support readiness: blocked",
    });

    expect(markdown).toContain("# Movement Next Proof Readiness");
    expect(markdown).toContain("Blocked families: sitting, walking");
    expect(markdown).toContain("## Next Scenario Details");
    expect(markdown).toContain("Recording plan: tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json");
    expect(markdown).toContain("Validation output: tmp/movement-replay-lab/seated-forward-fold-scenario-reviewed-smoke.json");
    expect(markdown).toContain("Protocol: Setup: Camera sees the seated body and chair contact throughout.");
    expect(markdown).toContain("movement-proof-seated-forward-fold");
    expect(markdown).toContain("Sitting support readiness: blocked");
    expect(markdown).toContain("Walking support readiness: blocked");
  });

  it("reports strict failure text only when blockers remain", () => {
    expect(nextProofReadinessStrictFailure({
      blockedFamilies: ["sitting", "walking"],
      ready: false,
    })).toBe("Movement next proof readiness is blocked for: sitting, walking.");
    expect(nextProofReadinessStrictFailure({
      blockedFamilies: [],
      ready: true,
    })).toBe("");
  });
});
