import { describe, expect, it } from "vitest";

import { recordingGapPlanForRows } from "./recording-gap-plan.mjs";

function missingProofRow(proofCase, overrides = {}) {
  return {
    acceptedProductLimitation: false,
    avatarSide: "n/a",
    bodyPartMotion: proofCase,
    candidateAmplitude: 0,
    candidateRejectionCode: null,
    candidateRejectionReason: null,
    directionSign: "unknown",
    expectedFrameWindow: {
      endFrame: null,
      startFrame: null,
    },
    expectedMinimumAmplitude: 1,
    missingLayers: ["recorded replay analyzer proof"],
    nextAction: `Add proof for ${proofCase}.`,
    proofBlockerCode: "no-candidate-amplitude",
    proofCase,
    recordingId: `${proofCase}-recording`,
    requiredLayers: ["recorded replay analyzer proof"],
    sourceSide: "both",
    status: "missing-proof",
    statusReason: `${proofCase} is missing.`,
    visualCaptureFrameCount: 0,
    ...overrides,
  };
}

describe("recording gap plan", () => {
  it("adds facing/occlusion analyzer flags to focused validation scenarios", () => {
    const plan = recordingGapPlanForRows([
      missingProofRow("facing-occlusion-recovery"),
      missingProofRow("side-swap-recovery"),
      missingProofRow("self-occlusion-recovery"),
    ], {
      recordingPlanPath: "tmp/current-facing-plan.json",
    });
    const scenario = plan.captureScenarios.find((entry) => entry.id === "facing-occlusion-recovery");

    expect(scenario?.validationArgs).toEqual(expect.arrayContaining([
      "--include-facing-occlusion-targets",
      "--include-product-scope-proof-case",
      "facing-occlusion-recovery",
      "side-swap-recovery",
      "self-occlusion-recovery",
    ]));
    expect(scenario?.validation.argvTemplate).toEqual(expect.arrayContaining([
      "--include-facing-occlusion-targets",
      "--include-product-scope-proof-case",
      "facing-occlusion-recovery",
      "side-swap-recovery",
      "self-occlusion-recovery",
    ]));
  });

  it("adds seated and root-travel analyzer flags to their focused validation scenarios", () => {
    const plan = recordingGapPlanForRows([
      missingProofRow("seated-forward-fold"),
      missingProofRow("root-travel"),
    ], {
      recordingPlanPath: "tmp/current-support-plan.json",
    });
    const seated = plan.captureScenarios.find((entry) => entry.id === "seated-forward-fold");
    const rootTravel = plan.captureScenarios.find((entry) => entry.id === "root-travel");

    expect(seated?.validationArgs).toEqual(expect.arrayContaining([
      "--include-seated-targets",
      "--include-seated-product-scope-proof",
    ]));
    expect(rootTravel?.validationArgs).toEqual(expect.arrayContaining([
      "--include-walking-product-scope-proof",
    ]));
  });

  it("keeps synthetic capture-needed rows from filtering validation to fake recording ids", () => {
    const plan = recordingGapPlanForRows([
      missingProofRow("facing-occlusion-recovery", {
        recordingId: "",
      }),
    ], {
      recordingPlanPath: "tmp/current-facing-plan.json",
    });
    const scenario = plan.captureScenarios.find((entry) => entry.id === "facing-occlusion-recovery");

    expect(scenario?.recordingIds).toEqual([]);
    expect(plan.summary.recordingIds).toEqual([]);
    expect(plan.actionGroups[0]?.recordingIds).toEqual([]);
    expect(scenario?.validation.argvTemplate).toEqual(expect.arrayContaining([
      "--recording-scenario",
      "movement-proof-facing-occlusion-recovery",
    ]));
  });
});
