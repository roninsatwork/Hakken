import { describe, expect, it } from "vitest";
import type {
  MovementReplayAnalysis,
  MovementReplayStudioFrameVerdict,
  ReplayStudioFailureCode,
} from "./movementReplayAnalyzer";
import {
  buildReplayStudioRepairPacket,
  compareReplayStudioRepairPackets,
  formatReplayStudioRepairPacketMarkdown,
  REPLAY_STUDIO_FAILURE_REPAIR_ROUTES,
  replayStudioFailureCodeForAnalyzerFailure,
  replayStudioFrameFailureForMovementFailure,
  replayStudioRepairRouteForFailureCode,
  stableReplayStudioSourceHash,
} from "./movementReplayStudioRepairPacket";

const replayStudioFailureCodes: ReplayStudioFailureCode[] = [
  "source-not-trustworthy",
  "source-normalization-mismatch",
  "calibration-unreliable",
  "avatar-head-diverged",
  "avatar-not-following-leg",
  "avatar-planted-foot-diverged",
  "avatar-upper-body-diverged",
  "avatar-wrong-side",
  "avatar-collapsed-to-squat",
  "avatar-seated-while-source-standing",
  "avatar-output-missing",
  "owner-flicker",
  "visual-proof-missing",
  "replay-game-diverged",
  "root-motion-wrong",
];

function frameFailure(code: ReplayStudioFailureCode, detail: string) {
  const route = replayStudioRepairRouteForFailureCode(code);
  return {
    analyzerCode: "false_knee_raise_candidate" as const,
    code,
    detail,
    doNotPatch: [...route.doNotPatch],
    evidenceStatus: route.evidenceStatus,
    focusedTests: [...route.focusedTests],
    likelyFiles: [...route.likelyFiles],
    nextFixArea: route.nextFixArea,
    repairStage: route.stage,
    severity: "error" as const,
  };
}

function replayFrame(): MovementReplayStudioFrameVerdict {
  return {
    actual: {
      comparedLowerBodySegments: 4,
      comparedUpperBodySegments: 2,
      feetOwner: "neutral",
      lowerBodyDirectionError: 0.44,
      lowerOwner: "player-left-leg-raise",
      supportIntent: "feet-floor",
      supportPresentation: "none",
      upperBodyDirectionError: 0.08,
    },
    expected: {
      motion: "leg-raise",
      owner: "player-right-leg-raise",
      side: "right",
    },
    failures: [
      frameFailure("avatar-wrong-side", "Frame 7 drove the left avatar leg for a right source leg raise."),
    ],
    frameIndex: 7,
    source: {
      readiness: "ready",
      sourceQuality: 0.91,
      visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
      weakestGroup: "feet",
    },
    status: "blocked",
  };
}

function replayFrameWith({
  code,
  detail,
  frameIndex,
  lowerBodyDirectionError,
  upperBodyDirectionError = 0.08,
}: {
  code: ReplayStudioFailureCode;
  detail: string;
  frameIndex: number;
  lowerBodyDirectionError: number;
  upperBodyDirectionError?: number;
}): MovementReplayStudioFrameVerdict {
  const frame = replayFrame();
  return {
    ...frame,
    actual: {
      ...frame.actual,
      lowerBodyDirectionError,
      upperBodyDirectionError,
    },
    failures: [frameFailure(code, detail)],
    frameIndex,
    status: "blocked",
  };
}

function analysis(): MovementReplayAnalysis {
  const blockedFrame = replayFrame();
  return {
    failures: [
      {
        code: "false_knee_raise_candidate",
        detail: "Frame 7 is right-knee-raise with strong data but neutral feet.",
        frameIndex: 7,
        semanticCode: "leg-lift-wrong-side",
        severity: "error",
      },
    ],
    gamePath: {
      frames: [
        {
          frameIndex: 7,
          rootHeadingYaw: 0.18,
          rootMotionIntentKey: "feet-floor",
          rootMotionTravelDirection: "none",
          rootPathDistance: 0.01,
        },
      ],
    },
    metrics: {
      avatarVisualFrameCount: 1,
    },
    replayStudio: {
      frames: [blockedFrame],
      session: {
        blockedFrameCount: 1,
        failureCount: 1,
        recordingId: "recording-1",
        reviewedFrameCount: 0,
        status: "blocked",
        summary: {
          averageAvatarLowerBodyDirectionError: 0.44,
          avatarVisualFrameCount: 1,
          lowerBodyOwnerTransitionsPerSecond: 0.2,
          visualMatchScore: 0.72,
        },
        worstFrames: [blockedFrame],
      },
    },
    sessionId: "recording-1",
    summary: {
      frameCount: 12,
    },
  } as unknown as MovementReplayAnalysis;
}

describe("Replay Studio repair packet", () => {
  it("routes every Replay Studio failure code to a stable repair owner", () => {
    expect(Object.keys(REPLAY_STUDIO_FAILURE_REPAIR_ROUTES).sort()).toEqual(
      [...replayStudioFailureCodes].sort(),
    );

    replayStudioFailureCodes.forEach((code) => {
      const route = replayStudioRepairRouteForFailureCode(code);
      expect(route.stage).not.toBe("unknown");
      expect(route.nextFixArea.length).toBeGreaterThan(0);
      expect(route.likelyFiles.length).toBeGreaterThan(0);
      expect(route.focusedTests.length).toBeGreaterThan(0);
    });
  });

  it("keeps source normalization mismatches separate from source capture", () => {
    const code = replayStudioFailureCodeForAnalyzerFailure("start_readiness_replay_mismatch");
    const route = replayStudioRepairRouteForFailureCode(code);

    expect(code).toBe("source-normalization-mismatch");
    expect(route.stage).toBe("source-normalization");
    expect(route.likelyFiles).toContain(
      "src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.ts",
    );
  });

  it("routes calibration-sensitive analyzer failures to the calibration owner", () => {
    const frameFailure = replayStudioFrameFailureForMovementFailure({
      code: "spine_vertical_reference_missing",
      detail: "Frame lacks neutral spine reference despite a calibration model.",
      frameIndex: 3,
      severity: "error",
    });

    expect(frameFailure.code).toBe("calibration-unreliable");
    expect(frameFailure.repairStage).toBe("calibration");
    expect(frameFailure.focusedTests).toContain(
      "src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.test.ts",
    );
  });

  it("builds an agent-readable packet from the canonical Replay Studio verdict", () => {
    const packet = buildReplayStudioRepairPacket(analysis(), {
      code: {
        commit: "abc1234",
        motionPipelineFingerprint: "sha256:test",
      },
      fixtureId: "wrong-side-leg-raise-minimal",
      frameIndex: 7,
      generatedAt: "2026-07-12T12:00:00.000Z",
      artifact: {
        checkedPaths: [
          "scripts/movement-debug/fixtures/replay-studio/registry.json",
          "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
        ],
        fixtureId: "wrong-side-leg-raise-minimal",
        freshness: {
          reason: "Committed minimized fixtures are source-controlled.",
          status: "not-required",
        },
        kind: "committed-fixture",
        path: "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
        refreshCommand: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact",
        sourcePriority: ["committed-fixture", "explicit-analysis", "default-analysis"],
      },
      recording: {
        id: "recording-1",
        sourceHash: "sha256:source",
        sourceHashBasis: "provided",
        title: "Right leg raise fixture",
      },
    });

    expect(packet).toEqual(expect.objectContaining({
      schemaVersion: 1,
      code: {
        commit: "abc1234",
        motionPipelineFingerprint: "sha256:test",
      },
      recording: expect.objectContaining({
        fixtureId: "wrong-side-leg-raise-minimal",
        id: "recording-1",
        sourceHash: "sha256:source",
      }),
      artifact: expect.objectContaining({
        fixtureId: "wrong-side-leg-raise-minimal",
        freshness: expect.objectContaining({
          status: "not-required",
        }),
        kind: "committed-fixture",
        path: "scripts/movement-debug/fixtures/replay-studio/wrong-side-leg-raise-minimal/analysis.json",
        refreshCommand: "npm run movement:diagnose -- --fixture wrong-side-leg-raise-minimal --require-fresh-artifact",
      }),
    }));
    expect(packet.verdict).toEqual(expect.objectContaining({
      evidenceStatus: "proven",
      failureCode: "avatar-wrong-side",
      severity: "error",
      status: "blocked",
    }));
    expect(packet.divergence).toEqual(expect.objectContaining({
      firstDivergentStage: "mirror-side-mapping",
    }));
    expect(packet.repair.likelyFiles).toContain(
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts",
    );
    expect(packet.repair.focusedTests).toContain(
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.test.ts",
    );
    expect(packet.commands.reproduce).toContain("--recording-id recording-1");
    expect(packet.commands.reproduce).toContain("--frame 7");
  });

  it("hashes source evidence deterministically across object key order", () => {
    expect(stableReplayStudioSourceHash({ b: 2, a: [1, { c: true }] })).toBe(
      stableReplayStudioSourceHash({ a: [1, { c: true }], b: 2 }),
    );
  });

  it("formats a compact Markdown repair handoff from the packet", () => {
    const packet = buildReplayStudioRepairPacket(analysis(), {
      code: {
        commit: "abc1234",
        motionPipelineFingerprint: "sha256:test",
      },
      frameIndex: 7,
      generatedAt: "2026-07-12T12:00:00.000Z",
      artifact: {
        checkedPaths: ["tmp/movement-replay-lab/current-analysis.json"],
        freshness: {
          currentMotionPipelineFingerprint: "sha256:test",
          reason: "Analysis artifact does not declare a motion-pipeline fingerprint.",
          status: "unknown",
        },
        kind: "default-analysis",
        path: "tmp/movement-replay-lab/current-analysis.json",
        refreshCommand: "npm run movement:replay:analyze -- --out tmp/movement-replay-lab/current-analysis.json --recording-ids recording-1",
        requestedRecordingId: "recording-1",
        sourcePriority: ["committed-fixture", "explicit-analysis", "default-analysis"],
      },
      recording: {
        id: "recording-1",
        sourceHash: "sha256:source",
        sourceHashBasis: "provided",
        title: "Right leg raise fixture",
      },
    });
    const markdown = formatReplayStudioRepairPacketMarkdown(packet, {
      includeJsonPointer: true,
      jsonPath: "tmp/movement-replay-lab/current-repair-packet.json",
    });

    expect(markdown).toContain("# Replay Studio Repair Packet");
    expect(markdown).toContain("- Status: `blocked`");
    expect(markdown).toContain("- First divergent stage: `mirror-side-mapping`");
    expect(markdown).toContain("## Artifact Resolution");
    expect(markdown).toContain("- Kind: `default-analysis`");
    expect(markdown).toContain("- Freshness: `unknown`");
    expect(markdown).toContain("- Freshness reason: Analysis artifact does not declare a motion-pipeline fingerprint.");
    expect(markdown).toContain("- Current fingerprint: `sha256:test`");
    expect(markdown).toContain("- Refresh command: `npm run movement:replay:analyze -- --out tmp/movement-replay-lab/current-analysis.json --recording-ids recording-1`");
    expect(markdown).toContain("- Checked paths: `tmp/movement-replay-lab/current-analysis.json`");
    expect(markdown).toContain("Likely files:");
    expect(markdown).toContain("src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts");
    expect(markdown).toContain("Focused tests:");
    expect(markdown).toContain("npm run movement:diagnose");
    expect(markdown).toContain("JSON packet: `tmp/movement-replay-lab/current-repair-packet.json`");
  });

  it("compares before and after packets only when the source recording matches", () => {
    const baseAnalysis = analysis();
    const before = buildReplayStudioRepairPacket(baseAnalysis, {
      frameIndex: 7,
      generatedAt: "2026-07-12T12:00:00.000Z",
      recording: {
        id: "recording-1",
        sourceHash: "sha256:source",
        sourceHashBasis: "provided",
        title: "Right leg raise fixture",
      },
    });
    const blockedFrame = replayFrame();
    const cleanFrame = {
      ...blockedFrame,
      actual: {
        ...blockedFrame.actual,
        lowerBodyDirectionError: 0.06,
      },
      failures: [],
      status: "pass" as const,
    };
    const after = buildReplayStudioRepairPacket({
      ...baseAnalysis,
      failures: [],
      metrics: {
        avatarVisualFrameCount: 12,
      },
      replayStudio: {
        frames: Array.from({ length: 12 }, (_, frameIndex) => ({
          ...cleanFrame,
          frameIndex,
        })),
        session: {
          ...baseAnalysis.replayStudio.session,
          blockedFrameCount: 0,
          failureCount: 0,
          status: "pass" as const,
          summary: {
            ...baseAnalysis.replayStudio.session.summary,
            lowerBodyOwnerTransitionsPerSecond: 0,
            visualMatchScore: 0.93,
          },
          worstFrames: [],
        },
      },
    } as unknown as MovementReplayAnalysis, {
      frameIndex: 7,
      generatedAt: "2026-07-12T12:05:00.000Z",
      recording: {
        id: "recording-1",
        sourceHash: "sha256:source",
        sourceHashBasis: "provided",
        title: "Right leg raise fixture",
      },
    });

    const comparison = compareReplayStudioRepairPackets({ after, before });

    expect(comparison).toEqual(expect.objectContaining({
      outcome: "improved",
      sameSourceHash: true,
    }));
    expect(comparison.before).toEqual(expect.objectContaining({
      failureCode: "avatar-wrong-side",
      status: "blocked",
    }));
    expect(comparison.after).toEqual(expect.objectContaining({
      failureCode: "none",
      status: "accepted",
    }));
    expect(comparison.metricDeltas).toEqual(expect.objectContaining({
      frameLowerBodyDirectionError: -0.38,
      totalFramesRendered: 11,
      visualMatchScore: 0.21,
    }));

    const changedSource = compareReplayStudioRepairPackets({
      after: {
        ...after,
        recording: {
          ...after.recording,
          sourceHash: "sha256:different-source",
        },
      },
      before,
    });
    expect(changedSource).toEqual(expect.objectContaining({
      outcome: "source-changed",
      sameSourceHash: false,
    }));
  });

  it("does not invent a repair owner for accepted packets with no failure", () => {
    const cleanFrame = {
      ...replayFrame(),
      failures: [],
      status: "pass" as const,
    };
    const packet = buildReplayStudioRepairPacket({
      ...analysis(),
      failures: [],
      summary: {
        frameCount: 1,
      },
      replayStudio: {
        frames: [cleanFrame],
        session: {
          ...analysis().replayStudio.session,
          blockedFrameCount: 0,
          failureCount: 0,
          status: "pass" as const,
          worstFrames: [],
        },
      },
    } as unknown as MovementReplayAnalysis, {
      frameIndex: 7,
    });

    expect(packet.verdict).toEqual(expect.objectContaining({
      evidenceStatus: "proven",
      failureCode: "none",
      status: "accepted",
    }));
    expect(packet.divergence.firstDivergentStage).toBe("unknown");
    expect(packet.repair.owner).toBe("unknown");
    expect(packet.repair.likelyFiles).toEqual([]);
  });

  it("fails closed when an accepted analyzer result lacks complete rendered proof", () => {
    const cleanFrame = {
      ...replayFrame(),
      failures: [],
      status: "pass" as const,
    };
    const packet = buildReplayStudioRepairPacket({
      ...analysis(),
      failures: [],
      replayStudio: {
        frames: [cleanFrame],
        session: {
          ...analysis().replayStudio.session,
          blockedFrameCount: 0,
          failureCount: 0,
          status: "pass" as const,
          worstFrames: [],
        },
      },
    } as unknown as MovementReplayAnalysis);

    expect(packet.verdict).toEqual(expect.objectContaining({
      evidenceStatus: "insufficient-evidence",
      failureCode: "avatar-output-missing",
      status: "blocked",
    }));
    expect(packet.divergence.firstDivergentStage).toBe("rendered-telemetry");
    expect(packet.scope).toEqual(expect.objectContaining({
      silentSkipCount: 11,
      totalFramesCompared: 1,
      totalFramesExpected: 12,
      totalFramesRendered: 1,
    }));
  });

  it("lets browser-only supplemental failures drive the packet verdict through the same route map", () => {
    const baseAnalysis = analysis();
    const cleanFrame = {
      ...replayFrame(),
      failures: [],
      status: "pass" as const,
    };
    const cleanAnalysis = {
      ...baseAnalysis,
      failures: [],
      replayStudio: {
        frames: [cleanFrame],
        session: {
          ...baseAnalysis.replayStudio.session,
          blockedFrameCount: 0,
          failureCount: 0,
          status: "pass" as const,
          worstFrames: [],
        },
      },
    };
    const packet = buildReplayStudioRepairPacket(cleanAnalysis, {
      frameIndex: 7,
      supplementalFailures: [{
        code: "avatar_arm_pose_diverged",
        detail: "Browser telemetry saw arm segment divergence after VRM application.",
        frameIndex: 7,
        severity: "error",
      }],
    });

    expect(packet.verdict).toEqual(expect.objectContaining({
      failureCode: "avatar-upper-body-diverged",
      status: "blocked",
    }));
    expect(packet.divergence.firstDivergentStage).toBe("vrm-application");
    expect(packet.repair.likelyFiles).toContain(
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarArmApplication.ts",
    );
  });

  it("ranks repair candidates by blocked status then route confidence before fixture order", () => {
    const lowConfidenceFrame = replayFrameWith({
      code: "avatar-output-missing",
      detail: "Rendered telemetry is missing on an earlier frame.",
      frameIndex: 2,
      lowerBodyDirectionError: 0.95,
    });
    const highConfidenceFrame = replayFrameWith({
      code: "avatar-wrong-side",
      detail: "Wrong-side avatar leg moved on a later frame.",
      frameIndex: 7,
      lowerBodyDirectionError: 0.12,
    });
    const packet = buildReplayStudioRepairPacket({
      ...analysis(),
      replayStudio: {
        ...analysis().replayStudio,
        frames: [lowConfidenceFrame, highConfidenceFrame],
        session: {
          ...analysis().replayStudio.session,
          worstFrames: [lowConfidenceFrame, highConfidenceFrame],
        },
      },
    } as unknown as MovementReplayAnalysis);

    expect(packet.scope.frameStart).toBe(7);
    expect(packet.verdict.failureCode).toBe("avatar-wrong-side");
    expect(packet.divergence.firstDivergentStage).toBe("mirror-side-mapping");
  });

  it("uses failure magnitude before frame index when route confidence ties", () => {
    const earlySmallFrame = replayFrameWith({
      code: "avatar-not-following-leg",
      detail: "Earlier leg-following error is small.",
      frameIndex: 1,
      lowerBodyDirectionError: 0.12,
    });
    const laterLargeFrame = replayFrameWith({
      code: "avatar-not-following-leg",
      detail: "Later leg-following error is larger.",
      frameIndex: 9,
      lowerBodyDirectionError: 0.74,
    });
    const packet = buildReplayStudioRepairPacket({
      ...analysis(),
      replayStudio: {
        ...analysis().replayStudio,
        frames: [earlySmallFrame, laterLargeFrame],
        session: {
          ...analysis().replayStudio.session,
          worstFrames: [earlySmallFrame, laterLargeFrame],
        },
      },
    } as unknown as MovementReplayAnalysis);

    expect(packet.scope.frameStart).toBe(9);
    expect(packet.verdict.failureCode).toBe("avatar-not-following-leg");
    expect(packet.divergence.explanation).toBe("Later leg-following error is larger.");
  });
});
