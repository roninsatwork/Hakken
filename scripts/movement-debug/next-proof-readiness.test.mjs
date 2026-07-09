import { describe, expect, it } from "vitest";

import {
  buildNextProofCapturePreflight,
  buildNextProofCaptureQueue,
  buildNextProofReadinessSummary,
  formatNextProofCaptureQueueSummary,
  formatNextProofRehearsalSummary,
  formatNextProofReadinessSummary,
  nextProofCapturePreflightStrictFailure,
  nextProofCaptureQueueStrictFailure,
  nextProofReadinessStrictFailure,
  parseNextProofReadinessArgs,
  supportRecordingPlansByPath,
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
      "--capture-queue-only",
      "--capture-queue-strict",
      "--capture-preflight-strict",
      "--rehearsal-only",
    ])).toEqual({
      captureQueueOnly: true,
      capturePreflightStrict: true,
      captureQueueStrict: true,
      help: false,
      json: true,
      markdownOutPath: "tmp/summary.md",
      outPath: "tmp/summary.json",
      rehearsalOnly: true,
      strict: true,
      write: false,
    });
  });

  it("builds the current rehearsal queue from the shared app data", () => {
    const queue = buildNextProofCaptureQueue([
      {
        family: "root-travel",
        nextFreshRecordingLabel: "movement-proof-root-travel",
        nextProofCases: ["root-travel"],
        quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
        ready: false,
        recordingPlanPath: "tmp/root-travel-plan.json",
      },
      {
        family: "sitting",
        nextFreshRecordingLabel: "movement-proof-seated-forward-fold",
        nextProofCases: ["seated-forward-fold"],
        quickValidationScriptCommand: "npm run movement:proof:validate:seated-forward-fold",
        ready: false,
        recordingPlanPath: "tmp/sitting-plan.json",
      },
    ]);

    expect(queue).toEqual([
      expect.objectContaining({
        freshRecordingLabel: "movement-proof-root-travel",
        rehearsal: expect.objectContaining({
          stopIf: expect.arrayContaining([
            "The motion reads as weight shift only; no clear root path is visible.",
          ]),
        }),
      }),
      expect.objectContaining({
        freshRecordingLabel: "movement-proof-seated-forward-fold",
        rehearsal: expect.objectContaining({
          stopIf: expect.arrayContaining([
            "Chair contact is hidden or unstable.",
          ]),
        }),
      }),
    ]);
  });

  it("summarizes sitting and walking proof blockers with short commands", () => {
    const rootTravelAudit = audit({
      family: "root-travel",
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
            recordingIds: ["root-travel-partial"],
            validationCommand: "npx -p node@22.13.0 npm run movement:replay:analyze -- --recording-scenario movement-proof-root-travel",
            validationOutputPath: "tmp/movement-replay-lab/root-travel-scenario-reviewed-smoke.json",
          },
        ],
        planPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
        summary: {
          captureScenarioCount: 1,
          totalRows: 9,
        },
      },
    });
    const summary = buildNextProofReadinessSummary({
      facingOcclusion: audit({
        family: "facing-occlusion",
        missingAnalyzerProofCases: [],
        missingGamePlanCases: [],
        missingReadableGameCases: [],
        missingRecordedEvidenceRequirements: [
          "recorded fallback/readability proof",
          "side-swap recovery evidence",
          "self-occlusion recovery evidence",
        ],
        missingRecordedPassedProofCases: [
          "facing-occlusion-recovery",
          "side-swap-recovery",
          "self-occlusion-recovery",
        ],
        nextActions: [
          "Review existing facing/occlusion candidate recording(s) px72q2e5m8pw9gctaj11yh36a989wjt7 and convert the recorded proof rows from manual-review to passed only if Replay visual/source review confirms them.",
        ],
        recordedReviewCandidateIds: ["px72q2e5m8pw9gctaj11yh36a989wjt7"],
        recordingGap: {
          captureScenarios: [],
          planPath: "tmp/movement-replay-lab/current-facing-occlusion-recording-plan.json",
          summary: {
            captureScenarioCount: 0,
            totalRows: 0,
          },
        },
      }),
      generatedAt: "2026-07-07T00:00:00.000Z",
      rootTravel: rootTravelAudit,
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
      blockedFamilies: ["facing-occlusion", "root-travel", "sitting", "walking"],
      capturePreflight: {
        failureCount: 0,
        itemCount: 2,
        ok: true,
      },
      ready: false,
    });
    expect(summary.nextCommands).toEqual([
      "npm run movement:proof:validate:root-travel",
      "npm run movement:proof:validate:seated-forward-fold",
    ]);
    expect(summary.captureQueue).toEqual([
      expect.objectContaining({
        families: ["root-travel", "walking"],
        freshRecordingLabel: "movement-proof-root-travel",
        proofCases: ["root-travel"],
        quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
        rehearsal: expect.objectContaining({
          motionChecks: expect.arrayContaining([
            "Root visibly travels across the frame instead of only swaying in place.",
          ]),
          stopIf: expect.arrayContaining([
            "The motion reads as weight shift only; no clear root path is visible.",
          ]),
        }),
      }),
      expect.objectContaining({
        families: ["sitting"],
        freshRecordingLabel: "movement-proof-seated-forward-fold",
        proofCases: ["seated-forward-fold"],
        quickValidationScriptCommand: "npm run movement:proof:validate:seated-forward-fold",
        rehearsal: expect.objectContaining({
          motionChecks: expect.arrayContaining([
            "Head and shoulders move clearly toward the knees from a neutral seated start.",
          ]),
          stopIf: expect.arrayContaining([
            "Chair contact is hidden or unstable.",
          ]),
        }),
      }),
    ]);
    expect(summary.families[0]).toMatchObject({
      family: "facing-occlusion",
      nextFreshRecordingLabel: "",
      nextReviewAction: "Review existing facing/occlusion candidate recording(s) px72q2e5m8pw9gctaj11yh36a989wjt7 and convert the recorded proof rows from manual-review to passed only if Replay visual/source review confirms them.",
      quickValidationCommand: "",
      quickValidationScript: "",
      quickValidationScriptCommand: "",
      recordedReviewCandidateIds: ["px72q2e5m8pw9gctaj11yh36a989wjt7"],
      recordingPlanPath: "tmp/movement-replay-lab/current-facing-occlusion-recording-plan.json",
    });
    expect(summary.families[1]).toMatchObject({
      family: "root-travel",
      nextBlockerCodes: ["candidate-below-threshold"],
      nextFreshRecordingLabel: "movement-proof-root-travel",
      nextProofCases: ["root-travel"],
      nextRecordingIds: ["root-travel-partial"],
      quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
      recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
    });
    expect(summary.families[2]).toMatchObject({
      family: "sitting",
      nextBlockerCodes: ["no-candidate-amplitude"],
      nextFreshRecordingLabel: "movement-proof-seated-forward-fold",
      nextProtocolText: "Setup: Camera sees the seated body and chair contact throughout. Movement: Fold forward from the hips and return to seated neutral. Acceptance: Analyzer should observe seated forward-fold amplitude while chair contact remains stable.",
      nextProofCases: ["seated-forward-fold"],
      nextRecordingIds: ["seated-partial"],
      nextValidationCommand: "npx -p node@22.13.0 npm run movement:replay:analyze -- --recording-scenario movement-proof-seated-forward-fold",
      nextValidationOutputPath: "tmp/movement-replay-lab/seated-forward-fold-scenario-reviewed-smoke.json",
      quickValidationScriptCommand: "npm run movement:proof:validate:seated-forward-fold",
      recordingPlanPath: "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
    });
  });

  it("formats a Markdown readiness handoff", () => {
    const summary = buildNextProofReadinessSummary({
      generatedAt: "2026-07-07T00:00:00.000Z",
      rootTravel: audit({
        family: "root-travel",
        recordingGap: {
          captureScenarios: [],
          summary: {
            captureScenarioCount: 0,
            totalRows: 0,
          },
        },
      }),
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
      rootTravelText: "Root-travel support readiness: blocked",
      sittingText: "Sitting support readiness: blocked",
      walkingText: "Walking support readiness: blocked",
    });

    expect(markdown).toContain("# Movement Next Proof Readiness");
    expect(markdown).toContain("Blocked families: root-travel, sitting, walking");
    expect(markdown).toContain("## Capture Queue");
    expect(markdown).toContain("Capture preflight: blocked");
    expect(markdown).toContain("1. movement-proof-seated-forward-fold");
    expect(markdown).toContain("   Families: sitting");
    expect(markdown).toContain("   Quick validation: npm run movement:proof:validate:seated-forward-fold");
    expect(markdown).toContain("   Rehearsal setup:");
    expect(markdown).toContain("   Stop if:");
    expect(markdown).toContain("## Root Travel");
    expect(markdown).toContain("## Next Scenario Details");
    expect(markdown).toContain("Recording plan: tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json");
    expect(markdown).toContain("Validation output: tmp/movement-replay-lab/seated-forward-fold-scenario-reviewed-smoke.json");
    expect(markdown).toContain("Quick validation script: npm run movement:proof:validate:seated-forward-fold");
    expect(markdown).toContain("Protocol: Setup: Camera sees the seated body and chair contact throughout.");
    expect(markdown).toContain("movement-proof-seated-forward-fold");
    expect(markdown).toContain("Sitting support readiness: blocked");
    expect(markdown).toContain("Walking support readiness: blocked");
  });

  it("formats a compact capture queue handoff", () => {
    const summary = buildNextProofReadinessSummary({
      generatedAt: "2026-07-07T00:00:00.000Z",
      sitting: audit(),
      walking: audit({
        family: "walking",
        recordingGap: {
          captureScenarios: [
            {
              freshRecordingLabel: "movement-proof-root-travel",
              proofCases: ["root-travel"],
              protocol: {
                acceptance: "Analyzer should observe root path travel >= 0.160 while tracking remains stable.",
                movement: "Take large deliberate steps across the camera view.",
                setup: "Full body visible with enough floor space to move across frame.",
              },
              quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
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
    const markdown = formatNextProofCaptureQueueSummary(summary);

    expect(markdown).toContain("# Movement Next Proof Capture Queue");
    expect(markdown).toContain("Capture preflight: blocked");
    expect(markdown).toContain("1. movement-proof-seated-forward-fold");
    expect(markdown).toContain("2. movement-proof-root-travel");
    expect(markdown).toContain("Quick validation aliases:");
    expect(markdown).toContain("`npm run movement:proof:validate:seated-forward-fold`");
    expect(markdown).toContain("Rehearsal motion");
    expect(markdown).toContain("Root visibly travels across the frame instead of only swaying in place.");
    expect(markdown).not.toContain("## Next Scenario Details");
    expect(markdown).not.toContain("## Sitting");
  });

  it("formats a rehearsal-only handoff for the next capture pass", () => {
    const summary = buildNextProofReadinessSummary({
      generatedAt: "2026-07-07T00:00:00.000Z",
      sitting: audit(),
      walking: audit({
        family: "walking",
        recordingGap: {
          captureScenarios: [
            {
              freshRecordingLabel: "movement-proof-root-travel",
              proofCases: ["root-travel"],
              protocol: {
                acceptance: "Analyzer should observe root path travel >= 0.160 while tracking remains stable.",
                movement: "Take large deliberate steps across the camera view.",
                setup: "Full body visible with enough floor space to move across frame.",
              },
              quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
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
    const markdown = formatNextProofRehearsalSummary(summary);

    expect(markdown).toContain("# Movement Next Proof Rehearsal");
    expect(markdown).toContain("1. movement-proof-seated-forward-fold");
    expect(markdown).toContain("2. movement-proof-root-travel");
    expect(markdown).toContain("Setup checks:");
    expect(markdown).toContain("Motion checks:");
    expect(markdown).toContain("Validation checks:");
    expect(markdown).toContain("Stop if:");
    expect(markdown).toContain("Chair contact is hidden or unstable.");
    expect(markdown).toContain("The motion reads as weight shift only; no clear root path is visible.");
    expect(markdown).not.toContain("## Sitting");
  });

  it("reports strict failure text only when blockers remain", () => {
    expect(nextProofReadinessStrictFailure({
      blockedFamilies: ["facing-occlusion", "root-travel", "sitting", "walking"],
      ready: false,
    })).toBe("Movement next proof readiness is blocked for: facing-occlusion, root-travel, sitting, walking.");
    expect(nextProofReadinessStrictFailure({
      blockedFamilies: [],
      ready: true,
    })).toBe("");
  });

  it("reports capture queue drift separately from blocker readiness", () => {
    expect(nextProofCaptureQueueStrictFailure({
      captureQueue: [
        { freshRecordingLabel: "movement-proof-root-travel" },
        { freshRecordingLabel: "movement-proof-seated-forward-fold" },
      ],
    })).toBe("");
    expect(nextProofCaptureQueueStrictFailure({
      captureQueue: [
        { freshRecordingLabel: "movement-proof-facing-occlusion-recovery" },
        { freshRecordingLabel: "movement-proof-root-travel" },
        { freshRecordingLabel: "movement-proof-seated-forward-fold" },
      ],
    })).toBe("Movement next proof capture queue drifted: expected movement-proof-root-travel, movement-proof-seated-forward-fold, got movement-proof-facing-occlusion-recovery, movement-proof-root-travel, movement-proof-seated-forward-fold.");
  });

  it("reports capture preflight failures for incomplete queue handoffs", () => {
    const preflight = buildNextProofCapturePreflight({
      captureQueue: [
        {
          families: ["root-travel", "walking"],
          freshRecordingLabel: "movement-proof-root-travel",
          proofCases: ["root-travel"],
          quickValidationScriptCommand: "npm run movement:proof:validate:root-travel",
          recordingPlanPath: "tmp/plan.json",
          validationOutputPath: "tmp/output.json",
          protocolText: "Protocol text",
          rehearsal: {
            motionChecks: ["Motion check"],
            setupChecks: ["Setup check"],
            stopIf: ["Stop check"],
            validationChecks: ["Validation check"],
          },
        },
        {
          families: ["sitting"],
          freshRecordingLabel: "movement-proof-seated-forward-fold",
          proofCases: ["seated-forward-fold"],
          quickValidationScriptCommand: "",
          recordingPlanPath: "tmp/plan.json",
          validationOutputPath: "tmp/output.json",
          protocolText: "Protocol text",
          rehearsal: {
            motionChecks: ["Motion check"],
            setupChecks: ["Setup check"],
            stopIf: ["Stop check"],
            validationChecks: ["Validation check"],
          },
        },
      ],
    });

    expect(preflight).toEqual({
      failureCount: 1,
      failures: [
        "movement-proof-seated-forward-fold: missing quick validation npm alias",
      ],
      itemCount: 2,
      ok: false,
    });
    expect(nextProofCapturePreflightStrictFailure({
      capturePreflight: preflight,
    })).toBe("Movement next proof capture preflight is incomplete: movement-proof-seated-forward-fold: missing quick validation npm alias.");
  });

  it("keeps the fullest support recording plan when two audits share a plan path", () => {
    const sharedPath = "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json";
    const plans = supportRecordingPlansByPath([
      {
        recordingGap: {
          plan: {
            label: "walking",
            summary: {
              totalRows: 1,
            },
          },
          planPath: sharedPath,
        },
      },
      {
        recordingGap: {
          plan: {
            label: "root-travel",
            summary: {
              totalRows: 9,
            },
          },
          planPath: sharedPath,
        },
      },
    ]);

    expect(plans.get(sharedPath)).toMatchObject({
      label: "root-travel",
      summary: {
        totalRows: 9,
      },
    });
  });

  it("omits ready families from the capture queue", () => {
    const queue = buildNextProofCaptureQueue([
      {
        family: "upright",
        nextFreshRecordingLabel: "",
        ready: true,
      },
      {
        family: "sitting",
        nextBlockerCodes: ["candidate-below-threshold"],
        nextFreshRecordingLabel: "movement-proof-seated-forward-fold",
        nextProofCases: ["seated-forward-fold"],
        nextProtocolText: "Protocol text",
        quickValidationScriptCommand: "npm run movement:proof:validate:seated-forward-fold",
        ready: false,
        recordingPlanPath: "tmp/plan.json",
      },
    ]);

    expect(queue).toEqual([
      expect.objectContaining({
        blockerCodes: ["candidate-below-threshold"],
        families: ["sitting"],
        freshRecordingLabel: "movement-proof-seated-forward-fold",
        proofCases: ["seated-forward-fold"],
        protocolText: "Protocol text",
        quickValidationScriptCommand: "npm run movement:proof:validate:seated-forward-fold",
        recordingPlanPath: "tmp/plan.json",
        validationOutputPath: "",
      }),
    ]);
    expect(queue[0]?.rehearsal).toMatchObject({
      motionChecks: expect.arrayContaining([
        "Head and shoulders move clearly toward the knees from a neutral seated start.",
      ]),
      setupChecks: expect.arrayContaining([
        "Keep the chair, hips, knees, feet, head, shoulders, and torso visible at the same time.",
      ]),
      stopIf: expect.arrayContaining([
        "Chair contact is hidden or unstable.",
      ]),
      validationChecks: expect.arrayContaining([
        "Expect seated-forward-fold amplitude to be detected while chair contact remains stable.",
      ]),
    });
  });
});
