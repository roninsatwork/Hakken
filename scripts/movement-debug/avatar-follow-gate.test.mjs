import { describe, expect, it } from "vitest";

import { evaluateAvatarFollowGate } from "./avatar-follow-gate.mjs";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";

const testMotionPipelineFingerprint = movementPipelineFingerprint();

function analysis(overrides = {}) {
  return {
    metrics: {
      averageAvatarLowerBodyDirectionError: 0,
      avatarVisualFrameCount: 0,
      lowerBodyOwnerTransitions: 0,
      ownerTransitionsPerSecond: 0,
      visualMatchScore: 0.92,
      ...overrides.metrics,
    },
    gamePath: overrides.gamePath,
    failures: overrides.failures,
    replayStudio: overrides.replayStudio,
    sessionId: overrides.sessionId ?? "recording-1",
  };
}

function row(overrides = {}) {
  return {
    acceptedProductLimitation: false,
    automatedStatus: "passed",
    evidenceFrameCount: 3,
    proofCase: "squat",
    recordingId: "recording-1",
    status: "passed",
    visualCaptureDiagnostics: {
      avatarLowerError: {
        average: 0.11,
        count: 2,
        max: 0.2,
      },
      avatarPlantedFootClearance: {
        average: null,
        count: 0,
        max: null,
      },
      avatarUpperError: {
        average: 0.08,
        count: 2,
        max: 0.1,
      },
    },
    visualCaptureFrameCount: 2,
    visualCaptureFrames: [10, 20],
    ...overrides,
  };
}

function manifest(rows) {
  return {
    motionPipelineFingerprints: [testMotionPipelineFingerprint],
    rows,
  };
}

describe("avatar follow gate", () => {
  it("blocks proof captured without a motion-pipeline fingerprint", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: { rows: [row()] },
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toContain(
      "motion-pipeline-fingerprint-missing",
    );
  });

  it("blocks proof captured against different motion-pipeline code", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      expectedMotionPipelineFingerprint: testMotionPipelineFingerprint,
      manifest: {
        motionPipelineFingerprints: ["sha256:stale-motion-pipeline"],
        rows: [row()],
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toContain(
      "motion-pipeline-fingerprint-mismatch",
    );
  });

  it("passes when supported proof rows have capture-backed avatar-follow evidence", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("passed");
    expect(result.recordings).toEqual([
      expect.objectContaining({
        combinedAvatarVisualFrameCount: 2,
        visualCaptureFrameCount: 2,
      }),
    ]);
  });

  it("blocks supported proof rows without Replay visual captures", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row({
          status: "manual-review",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: null, count: 0, max: null },
            avatarPlantedFootClearance: { average: null, count: 0, max: null },
            avatarUpperError: { average: null, count: 0, max: null },
          },
          visualCaptureFrameCount: 0,
          visualCaptureFrames: [],
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "avatar-visual-frame-count-zero",
      "supported-row-missing-visual-capture",
      "lower-body-direction-error-missing",
    ]));
  });

  it("allows clean capture-backed avatar proof to override source-coverage visual match warnings", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          metrics: {
            visualMatchScore: 0.84,
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("passed");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      acceptanceStatus: "accepted",
      visualMatchBasis: "replay-visual-captures",
      visualMatchScore: 0.84,
    }));
    expect(result.failures.map((failure) => failure.code)).not.toContain("visual-match-below-threshold");
  });

  it("blocks the screenshot-shaped false green: review session, 84% match, no telemetry, and capture proof", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          metrics: {
            avatarVisualFrameCount: 0,
            visualMatchScore: 0.84,
          },
          replayStudio: {
            session: {
              blockedFrameCount: 0,
              failureCount: 0,
              reviewedFrameCount: 1,
              status: "review",
              worstFrames: [],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("blocked");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      analysisAvatarVisualFrameCount: 0,
      combinedAvatarVisualFrameCount: 2,
      visualMatchBasis: "replay-visual-captures",
      visualMatchScore: 0.84,
    }));
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "visual-acceptance-review-session",
      "visual-match-below-threshold",
    ]));
  });

  it("blocks Replay Studio review status even when captures are clean and no worst frame was persisted", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          metrics: {
            avatarVisualFrameCount: 0,
            visualMatchScore: 0.79,
          },
          replayStudio: {
            session: {
              blockedFrameCount: 0,
              failureCount: 5,
              reviewedFrameCount: 0,
              status: "review",
              worstFrames: [],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("blocked");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      acceptanceStatus: "review-only",
      visualMatchBasis: "replay-visual-captures",
    }));
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "visual-acceptance-review-session",
      "visual-match-below-threshold",
    ]));
  });

  it("resolves a headless visual-match-only review with clean rendered proof", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          failures: [{ code: "visual_match_low", severity: "warning" }],
          metrics: {
            avatarVisualFrameCount: 0,
            visualMatchScore: 0.69,
          },
          replayStudio: {
            session: {
              blockedFrameCount: 0,
              failureCount: 1,
              reviewedFrameCount: 0,
              status: "review",
              worstFrames: [],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("passed");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      acceptanceStatus: "accepted",
      replayStudio: expect.objectContaining({
        analysisStatus: "review",
        renderedProofResolvedReview: true,
        status: "pass",
      }),
    }));
    expect(result.failures.map((failure) => failure.code)).not.toContain(
      "visual-match-below-threshold",
    );
  });

  it("blocks general capture-backed lower-body error above 0.22", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row({
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.221, count: 2, max: 0.24 },
            avatarPlantedFootClearance: { average: null, count: 0, max: null },
            avatarUpperError: { average: 0.04, count: 2, max: 0.05 },
          },
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.thresholds.maxLowerBodyDirectionError).toBe(0.22);
    expect(result.failures.map((failure) => failure.code)).toContain(
      "lower-body-direction-error-above-threshold",
    );
  });

  it("blocks low analyzer avatar visual match and lower-body owner flicker", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          metrics: {
            avatarVisualFrameCount: 2,
            lowerBodyOwnerTransitions: 4,
            ownerTransitionsPerSecond: 1.8,
            visualMatchScore: 0.72,
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "visual-match-below-threshold",
      "lower-body-owner-flicker-above-threshold",
    ]));
  });

  it("blocks capture-backed proof when the planted foot is visibly above the floor", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row({
          proofCase: "right-leg-raise",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.04, count: 2, max: 0.05 },
            avatarPlantedFootClearance: { average: 0.11, count: 2, max: 0.14 },
            avatarUpperError: { average: 0.03, count: 2, max: 0.04 },
          },
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toContain("avatar-planted-foot-diverged");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      maxAvatarPlantedFootClearance: 0.14,
    }));
  });

  it("reports recordings with no supported avatar-follow rows instead of silently dropping them", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis(),
        analysis({ sessionId: "recording-2", metrics: { visualMatchScore: 0.52 } }),
      ],
      manifest: manifest([
        row(),
        row({
          automatedStatus: "covered-by-other-recording",
          evidenceFrameCount: 12,
          proofCase: "standing",
          recordingId: "recording-2",
          status: "covered-by-other-recording",
          visualCaptureFrameCount: 0,
          visualCaptureFrames: [],
        }),
        row({
          automatedStatus: "source-data-limitation",
          evidenceFrameCount: 6,
          proofCase: "weak-feet",
          recordingId: "recording-2",
          status: "source-data-limitation",
          visualCaptureFrameCount: 2,
          visualCaptureFrames: [0, 1],
        }),
      ]),
    });

    expect(result.status).toBe("passed");
    expect(result.recordingCount).toBe(2);
    expect(result.recordings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        avatarFollowScopeStatus: "not-supported",
        recordingId: "recording-2",
        supportedProofRowCount: 0,
      }),
    ]));
  });

  it("blocks excessive capture-backed avatar direction error", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row({
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.61, count: 2, max: 0.7 },
            avatarUpperError: { average: 0.22, count: 2, max: 0.25 },
          },
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "lower-body-direction-error-above-threshold",
      "upper-body-direction-error-above-threshold",
    ]));
  });

  it("does not allow hard root or seated cases to pass on analyzer proxy alone", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis({ metrics: { avatarVisualFrameCount: 1 } })],
      manifest: manifest([
        row({
          proofCase: "root-turn",
          visualCaptureFrameCount: 0,
          visualCaptureFrames: [],
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "hard-case-passed-without-visual-capture",
      "supported-row-missing-visual-capture",
    ]));
  });

  it("does not block covered-by-other leg rows without local visual frames", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row(),
        row({
          automatedStatus: "covered-by-other-recording",
          proofCase: "right-leg-raise",
          status: "covered-by-other-recording",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.22, count: 3, max: 0.28 },
            avatarUpperError: { average: 0.06, count: 3, max: 0.09 },
          },
          visualCaptureFrameCount: 0,
          visualCaptureFrames: [],
        }),
      ]),
    });

    expect(result.status).toBe("passed");
    expect(result.failures.map((failure) => failure.code)).not.toContain("avatar-not-following-leg");
  });

  it("blocks capture-backed leg rows with local visual frames even when covered elsewhere", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [analysis()],
      manifest: manifest([
        row(),
        row({
          automatedStatus: "covered-by-other-recording",
          proofCase: "right-leg-raise",
          status: "covered-by-other-recording",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.22, count: 3, max: 0.28 },
            avatarUpperError: { average: 0.06, count: 3, max: 0.09 },
          },
          visualCaptureFrameCount: 1,
          visualCaptureFrames: [12],
        }),
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toContain("avatar-not-following-leg");
  });

  it("blocks when the Replay Studio judge reports a bad frame even if averages are acceptable", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          replayStudio: {
            session: {
              blockedFrameCount: 1,
              failureCount: 1,
              reviewedFrameCount: 0,
              status: "blocked",
              worstFrames: [
                {
                  actual: {
                    comparedLowerBodySegments: 6,
                    lowerBodyDirectionError: 0.22,
                    lowerOwner: "player-right-leg-raise",
                  },
                  expected: {
                    motion: "leg-raise",
                    owner: "player-right-leg-raise",
                    side: "right",
                  },
                  failures: [
                    {
                      code: "avatar-not-following-leg",
                      detail: "Frame 868 has active leg-raise motion but avatar lower-body direction error is 0.22.",
                      nextFixArea: "VRM lower-body application / leg-retarget output",
                      severity: "error",
                    },
                  ],
                  frameIndex: 868,
                  source: {
                    readiness: "ready",
                    sourceQuality: 0.97,
                    visibleBodyParts: ["head", "torso", "feet"],
                  },
                  status: "blocked",
                },
              ],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("blocked");
    expect(result.recordings[0]).toEqual(expect.objectContaining({
      replayStudio: expect.objectContaining({
        blockedFrameCount: 1,
        status: "blocked",
      }),
    }));
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "replay-studio-session-blocked",
      "replay-studio-blocked-frame",
    ]));
    expect(result.failures.find((failure) => failure.code === "replay-studio-blocked-frame")).toEqual(
      expect.objectContaining({
        detail: expect.stringContaining("avatar-not-following-leg"),
      }),
    );
  });

  it("reports review frames without duplicating a session-review issue", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          replayStudio: {
            session: {
              blockedFrameCount: 0,
              failureCount: 1,
              reviewedFrameCount: 1,
              status: "review",
              worstFrames: [
                {
                  actual: {
                    supportIntent: "seat-chair",
                    supportPresentation: "support-presentation-seated",
                  },
                  expected: {
                    motion: "support",
                    owner: "player-retarget",
                    side: null,
                  },
                  failures: [
                    {
                      code: "avatar-seated-while-source-standing",
                      detail: "Frame 62 used seated support while source stayed upright.",
                      nextFixArea: "support intent / seated presentation guard",
                      severity: "warning",
                    },
                  ],
                  frameIndex: 62,
                  source: {
                    readiness: "ready",
                    sourceQuality: 0.94,
                    visibleBodyParts: ["head", "torso", "feet"],
                  },
                  status: "review",
                },
              ],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });

    expect(result.status).toBe("blocked");
    expect(result.failures.map((failure) => failure.code)).toContain("replay-studio-review-frame");
    expect(result.failures.map((failure) => failure.code)).not.toContain("replay-studio-session-review");
  });

  it("uses the actionable non-source replay failure as the primary review-frame detail", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          replayStudio: {
            session: {
              blockedFrameCount: 0,
              failureCount: 2,
              reviewedFrameCount: 1,
              status: "review",
              worstFrames: [
                {
                  actual: {
                    supportIntent: "seat-chair",
                    supportPresentation: "support-presentation-seated",
                  },
                  expected: {
                    motion: "support",
                    owner: "neutral",
                    side: null,
                  },
                  failures: [
                    {
                      code: "source-not-trustworthy",
                      detail: "Frame 0 source is not ready.",
                      nextFixArea: "source setup / visibility",
                      severity: "warning",
                    },
                    {
                      code: "avatar-seated-while-source-standing",
                      detail: "Frame 0 used seated support while source stayed upright.",
                      nextFixArea: "support intent / seated presentation guard",
                      severity: "warning",
                    },
                  ],
                  frameIndex: 0,
                  source: {
                    readiness: "blocked",
                    sourceQuality: 0.48,
                    visibleBodyParts: ["head", "torso"],
                  },
                  status: "review",
                },
              ],
            },
          },
        }),
      ],
      manifest: manifest([row()]),
    });
    const replayFrameFailure = result.failures.find((failure) => failure.code === "replay-studio-review-frame");
    const fixLogEntry = result.fixLog.entries.find((entry) => entry.code === "replay-studio-review-frame");

    expect(replayFrameFailure?.detail).toContain("avatar-seated-while-source-standing");
    expect(fixLogEntry).toEqual(expect.objectContaining({
      nextFixArea: "support intent / seated presentation guard",
    }));
  });

  it("adds game-path frame context to capture-backed fix-log entries", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          gamePath: {
            frames: [
              {
                feetOwner: "recorded-retarget",
                lowerLabel: "right-knee-raise",
                lowerOwner: "player-right-leg-raise",
                sourceQuality: 0.97,
                supportIntentKey: "feet-floor",
                supportPresentationOwner: "support-presentation-none",
              },
            ],
            sourceFrames: [
              {
                startReadinessState: "ready",
                truthSkeletonWeakestGroup: "feet",
                visibleBodyParts: ["head", "torso", "feet"],
              },
            ],
          },
        }),
      ],
      manifest: manifest([
        row({
          proofCase: "right-leg-raise",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.22, count: 1, max: 0.28 },
            avatarUpperError: { average: 0.04, count: 1, max: 0.05 },
          },
          visualCaptureFrameCount: 1,
          visualCaptureFrames: [0],
        }),
      ]),
    });

    const entry = result.fixLog.entries.find((fixLogEntry) => (
      fixLogEntry.code === "avatar-not-following-leg"
    ));

    expect(entry).toEqual(expect.objectContaining({
      actual: expect.objectContaining({
        lowerBodyDirectionError: 0.22,
        lowerOwner: "player-right-leg-raise",
        supportIntent: "feet-floor",
      }),
      expected: expect.objectContaining({
        motion: "right-knee-raise",
        proofCase: "right-leg-raise",
        side: "right",
      }),
      frameIndex: 0,
      source: expect.objectContaining({
        readiness: "ready",
        sourceQuality: 0.97,
        visibleBodyParts: ["head", "torso", "feet"],
      }),
    }));
  });

  it("classifies seated frames selected for standing leg proof as proof-window diagnostics", () => {
    const result = evaluateAvatarFollowGate({
      analyses: [
        analysis({
          gamePath: {
            frames: [
              {
                exercisePoseKey: "chair-seated",
                feetOwner: "recorded-retarget",
                lowerLabel: "neutral",
                lowerOwner: "player-retarget",
                sourceQuality: 0.98,
                supportIntentKey: "seat-chair",
                supportPresentationOwner: "support-presentation-seated",
              },
            ],
            sourceFrames: [
              {
                startReadinessState: "ready",
                truthSkeletonWeakestGroup: "feet",
                visibleBodyParts: ["head", "torso", "feet"],
              },
            ],
          },
        }),
      ],
      manifest: manifest([
        row({
          proofCase: "mirror-side-ownership",
          status: "manual-review",
          visualCaptureDiagnostics: {
            avatarLowerError: { average: 0.3, count: 1, max: 0.44 },
            avatarUpperError: { average: 0.2, count: 1, max: 0.26 },
          },
          visualCaptureFrameCount: 1,
          visualCaptureFrames: [0],
        }),
      ]),
    });

    expect(result.failures.map((failure) => failure.code)).toContain("standing-leg-proof-context-mismatch");
    expect(result.failures.map((failure) => failure.code)).not.toContain("avatar-wrong-side");
    expect(result.fixLog.entries.find((entry) => entry.code === "standing-leg-proof-context-mismatch")).toEqual(
      expect.objectContaining({
        actual: expect.objectContaining({
          supportIntent: "seat-chair",
          supportPresentation: "support-presentation-seated",
        }),
        nextFixArea: "Replay proof window selection / standing leg isolation",
      }),
    );
  });
});
