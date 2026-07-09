import { describe, expect, it } from "vitest";

import {
  buildMovementExpansionPreviewHandoff,
  formatMovementExpansionPreviewReadiness,
  formatMovementExpansionPreviewHandoffGuide,
  parseMovementExpansionPreviewHandoffArgs,
  selectMovementExpansionPreviewBestPartialRecordingId,
  summarizeMovementExpansionPreviewReadiness,
} from "./movement-expansion-preview-handoff.mjs";

describe("movement expansion preview handoff", () => {
  it("parses sitting handoff arguments", () => {
    expect(parseMovementExpansionPreviewHandoffArgs([
      "--family",
      "sitting",
      "--out",
      "tmp/handoff.json",
      "--guide-out",
      "tmp/handoff.md",
      "--game-visual-plan",
      "tmp/plan.json",
      "--recording-id",
      "recording-a",
      "--readiness",
    ])).toMatchObject({
      family: "sitting",
      gameVisualPlan: "tmp/plan.json",
      guideOut: "tmp/handoff.md",
      out: "tmp/handoff.json",
      readiness: true,
      recordingId: "recording-a",
      recordingIdFromBestPartial: false,
    });
  });

  it("parses facing/occlusion handoff arguments", () => {
    expect(parseMovementExpansionPreviewHandoffArgs([
      "--family",
      "facing-occlusion",
      "--out",
      "tmp/facing-handoff.json",
      "--guide-out",
      "tmp/facing-handoff.md",
    ])).toMatchObject({
      family: "facing-occlusion",
      guideOut: "tmp/facing-handoff.md",
      out: "tmp/facing-handoff.json",
    });
  });

  it("parses best partial recording-id binding", () => {
    expect(parseMovementExpansionPreviewHandoffArgs([
      "--family",
      "sitting",
      "--recording-id-from-best-partial",
      "--readiness",
    ])).toMatchObject({
      family: "sitting",
      readiness: true,
      recordingId: "<new-recording-id>",
      recordingIdFromBestPartial: true,
    });
  });

  it("rejects mixed explicit and best partial recording-id binding", () => {
    expect(() => parseMovementExpansionPreviewHandoffArgs([
      "--recording-id",
      "recording-a",
      "--recording-id-from-best-partial",
    ])).toThrow("Use either --recording-id or --recording-id-from-best-partial");
  });

  it("rejects unsupported preview families", () => {
    expect(() => parseMovementExpansionPreviewHandoffArgs([
      "--family",
      "props-contact",
    ])).toThrow("Unsupported preview family");
  });

  it("builds the sitting recorded-proof handoff contract", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "sitting",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "recording-a",
    });

    expect(contract).toMatchObject({
      family: "sitting",
      previewAuditCase: {
        expectedFamily: "sitting",
        mode: "seated-twist",
      },
      recordingId: "recording-a",
      requiredGameProofCases: [
        "strongest-seated-chair-contact",
        "strongest-seated-twist",
        "strongest-seated-forward-fold",
        "strongest-seated-leg-lift",
      ],
      requiredRecordedProofCases: [
        "seated-neutral",
        "seated-twist",
        "seated-forward-fold",
        "seated-leg-lift",
        "chair-contact",
      ],
      supportClaimStatus: "internal-preview-needs-recorded-proof",
    });
    expect(contract.commands.map((command) => command.id)).toEqual([
      "preview-audit",
      "recorded-analysis",
      "replay-session-export",
      "replay-proof-set",
      "replay-review",
      "reviewed-analysis",
      "game-visual-plan",
      "game-visual-capture",
      "game-visual-review",
      "sitting-support-audit",
    ]);
    expect(contract.commands[1].command).toContain("--include-seated-targets");
    expect(contract.commands[1].command).toContain("--include-seated-product-scope-proof");
    expect(contract.commands[1].command).toContain("current-expansion-preview-sitting-analysis.validation.proof-manifest.json");
    expect(contract.commands[3].command).toContain("--debug-session-json tmp/movement-replay-lab/current-expansion-preview-sitting-replay-session.json");
    expect(contract.commands[5].command).toContain("--review-decisions tmp/movement-replay-lab/current-expansion-preview-sitting-replay-proof-review-decisions.json");
    expect(contract.commands[6].command).toContain("current-expansion-preview-sitting-analysis.validation.reviewed.json");
    expect(contract.commands[6].command).toContain("--proof-case strongest-seated-twist");
    expect(contract.commands[8].command).toContain("current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json");
    expect(contract.commands[9].command).toContain("npm run movement:sitting-support-audit");
    expect(contract.commands[9].command).toContain("current-expansion-preview-sitting-game-visual-proof-review-decisions.codex-semantic-review.json");
    expect(contract.commands[9].command).toContain("--strict");
  });

  it("builds the walking recorded-proof handoff contract", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "walking",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "recording-a",
    });

    expect(contract).toMatchObject({
      family: "walking",
      previewAuditCase: {
        expectedFamily: "walking",
        mode: "root-travel-forward",
      },
      recordingId: "recording-a",
      requiredGameProofCases: [
        "strongest-root-travel",
      ],
      requiredRecordedProofCases: [
        "root-travel",
      ],
      supportClaimStatus: "internal-preview-needs-recorded-proof",
    });
    expect(contract.commands.map((command) => command.id)).toEqual([
      "preview-audit",
      "recorded-analysis",
      "replay-session-export",
      "replay-proof-set",
      "replay-review",
      "reviewed-analysis",
      "game-visual-plan",
      "game-visual-capture",
      "game-visual-review",
      "walking-support-audit",
    ]);
    expect(contract.commands[1].command).not.toContain("--include-seated-targets");
    expect(contract.commands[1].command).toContain("--include-walking-product-scope-proof");
    expect(contract.commands[1].command).toContain("current-expansion-preview-walking-analysis.validation.proof-manifest.json");
    expect(contract.commands[6].command).toContain("--proof-case strongest-root-travel");
    expect(contract.commands[9].command).toContain("npm run movement:walking-support-audit");
    expect(contract.commands[9].command).toContain("current-expansion-preview-walking-game-visual-proof-review-decisions.codex-semantic-review.json");
    expect(contract.commands[9].command).toContain("--strict");
  });

  it("builds the facing/occlusion recorded-proof handoff contract", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "facing-occlusion",
      generatedAt: "2026-07-08T00:00:00.000Z",
      recordingId: "recording-a",
    });

    expect(contract).toMatchObject({
      family: "facing-occlusion",
      previewAuditCase: {
        expectedFamily: "facing-occlusion",
        mode: "root-turn-left",
      },
      recordingId: "recording-a",
      requiredGameProofCases: [
        "strongest-facing-occlusion-recovery",
        "strongest-side-swap-recovery",
      ],
      requiredRecordedProofCases: [
        "facing-occlusion-recovery",
        "side-swap-recovery",
        "self-occlusion-recovery",
      ],
      supportClaimStatus: "internal-preview-needs-recorded-proof",
    });
    expect(contract.commands.map((command) => command.id)).toEqual([
      "preview-audit",
      "recorded-analysis",
      "replay-session-export",
      "replay-proof-set",
      "replay-review",
      "reviewed-analysis",
      "game-visual-plan",
      "game-visual-capture",
      "game-visual-review",
      "facing-occlusion-support-audit",
    ]);
    expect(contract.commands[1].command).toContain("--include-facing-occlusion-targets");
    expect(contract.commands[1].command).toContain("--include-product-scope-proof-case facing-occlusion-recovery");
    expect(contract.commands[1].command).toContain("--include-product-scope-proof-case side-swap-recovery");
    expect(contract.commands[1].command).toContain("--include-product-scope-proof-case self-occlusion-recovery");
    expect(contract.commands[1].command).toContain("current-facing-occlusion-analysis.validation.proof-manifest.json");
    expect(contract.commands[6].command).toContain("--proof-case strongest-facing-occlusion-recovery");
    expect(contract.commands[6].command).toContain("--proof-case strongest-side-swap-recovery");
    expect(contract.commands[8].command).toContain("current-facing-occlusion-game-visual-proof-review-decisions.codex-semantic-review.json");
    expect(contract.commands[9].command).toContain("npm run movement:facing-occlusion-support-audit");
    expect(contract.commands[9].command).toContain("current-facing-occlusion-game-visual-proof-plan.json");
    expect(contract.commands[9].command).toContain("--strict");
  });

  it("formats the sitting handoff guide with checklist and commands", () => {
    const guide = formatMovementExpansionPreviewHandoffGuide(buildMovementExpansionPreviewHandoff({
      family: "sitting",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "recording-a",
    }));

    expect(guide).toContain("# Movement Expansion Preview Handoff: Sitting");
    expect(guide).toContain("- [ ] Start with neutral seated posture");
    expect(guide).toContain("`seated-twist`");
    expect(guide).toContain("`strongest-seated-chair-contact`");
    expect(guide).toContain("npm run movement:expansion-preview-audit");
    expect(guide).toContain("--include-seated-targets");
    expect(guide).toContain("--include-seated-product-scope-proof");
    expect(guide).toContain("npm run movement:sitting-support-audit");
  });

  it("summarizes missing seated Game visual proof cases from a generated plan", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "sitting",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "recording-a",
    });
    const readiness = summarizeMovementExpansionPreviewReadiness({
      contract,
      gameVisualPlan: {
        sessions: [
          {
            proofCases: [
              "strongest-seated-chair-contact",
              "strongest-seated-twist",
            ],
            recordingId: "recording-a",
            targetFrameCount: 1,
          },
          {
            proofCases: ["strongest-seated-chair-contact"],
            recordingId: "recording-b",
            targetFrameCount: 1,
          },
        ],
        summary: {
          selectedSessionCount: 2,
          targetFrameCount: 2,
        },
      },
    });

    expect(readiness).toMatchObject({
      coveredGameProofCases: [
        "strongest-seated-chair-contact",
        "strongest-seated-twist",
      ],
      missingGameProofCases: [
        "strongest-seated-forward-fold",
        "strongest-seated-leg-lift",
      ],
      ok: false,
      targetFrameCount: 2,
    });
    expect(readiness.bestPartialCandidates[0]).toMatchObject({
      matchedRequiredCaseCount: 2,
      recordingId: "recording-a",
    });
    expect(formatMovementExpansionPreviewReadiness(readiness)).toContain("Status: needs-recording");
  });

  it("selects the best partial seated recording from the Game visual plan", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "sitting",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "<new-recording-id>",
    });
    const selection = selectMovementExpansionPreviewBestPartialRecordingId({
      contract,
      gameVisualPlan: {
        sessions: [
          {
            proofCases: ["strongest-seated-chair-contact"],
            recordingId: "recording-b",
            targetFrameCount: 2,
          },
          {
            proofCases: [
              "strongest-seated-chair-contact",
              "strongest-seated-twist",
            ],
            recordingId: "recording-a",
            targetFrameCount: 1,
          },
        ],
      },
    });

    expect(selection).toMatchObject({
      recordingId: "recording-a",
    });
    expect(selection.readiness.bestPartialCandidates[0]).toMatchObject({
      matchedRequiredCaseCount: 2,
      recordingId: "recording-a",
    });
  });

  it("selects the best partial walking recording from the Game visual plan", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "walking",
      generatedAt: "2026-07-07T00:00:00.000Z",
      recordingId: "<new-recording-id>",
    });
    const selection = selectMovementExpansionPreviewBestPartialRecordingId({
      contract,
      gameVisualPlan: {
        sessions: [
          {
            proofCases: [],
            recordingId: "recording-b",
            targetFrameCount: 2,
          },
          {
            proofCases: [
              "strongest-root-travel",
            ],
            recordingId: "recording-a",
            targetFrameCount: 1,
          },
        ],
      },
    });

    expect(selection).toMatchObject({
      recordingId: "recording-a",
    });
    expect(selection.readiness.bestPartialCandidates[0]).toMatchObject({
      matchedRequiredCaseCount: 1,
      recordingId: "recording-a",
    });
  });

  it("selects the best partial facing/occlusion recording from the Game visual plan", () => {
    const contract = buildMovementExpansionPreviewHandoff({
      family: "facing-occlusion",
      generatedAt: "2026-07-08T00:00:00.000Z",
      recordingId: "<new-recording-id>",
    });
    const selection = selectMovementExpansionPreviewBestPartialRecordingId({
      contract,
      gameVisualPlan: {
        sessions: [
          {
            proofCases: ["strongest-side-swap-recovery"],
            recordingId: "recording-b",
            targetFrameCount: 1,
          },
          {
            proofCases: [
              "strongest-facing-occlusion-recovery",
              "strongest-side-swap-recovery",
            ],
            recordingId: "recording-a",
            targetFrameCount: 2,
          },
        ],
      },
    });

    expect(selection).toMatchObject({
      recordingId: "recording-a",
    });
    expect(selection.readiness.bestPartialCandidates[0]).toMatchObject({
      matchedRequiredCaseCount: 2,
      recordingId: "recording-a",
    });
  });
});
