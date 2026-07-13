import { describe, expect, it } from "vitest";
import { analyzeFullSequence } from "./analyze-replay-full-sequence.mjs";

function renderedSideBendFrame(frameIndex, sideBend) {
  return {
    debug: {
      avatarSpine: {
        chest: { x: 0, y: 0, z: sideBend * 1.4 },
        upperChest: { x: 0, y: 0, z: sideBend * 1.2 },
      },
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: {
          leftFootClearance: 0,
          rightFootClearance: 0,
        },
        segments: {
          spine: {
            direction: { x: 0.1, y: 0.99, z: 0 },
          },
        },
      },
      fallbacks: {
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
      },
      retarget: {
        appliedLowerBody: 6,
        sourceQuality: 0.9,
      },
      spineDrive: {
        sideBend,
      },
    },
    frameIndex,
  };
}

describe("full-sequence rendered side-bend analysis", () => {
  it("uses actual chest rotations instead of the non-rotating hips-to-spine offset", () => {
    const sideBends = [0.1, 0.16, 0.22, 0.28, 0.34, 0.4];
    const analysis = analyzeFullSequence({
      session: {
        samples: sideBends.map(() => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: sideBends.length,
        frames: sideBends.map((sideBend, frameIndex) => (
          renderedSideBendFrame(frameIndex, sideBend)
        )),
        missingFrames: [],
        sessionId: "rendered-side-bend-test",
      },
    });

    expect(analysis.sideBend.correlation).toBe(1);
    expect(analysis.sideBend.responseRatio).toBeGreaterThan(1);
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-side-bend-under-response" }),
    );
  });

  it("blocks an inverted final VRM side bend even when its magnitude is plausible", () => {
    const sideBends = [-0.12, -0.18, 0.14, 0.22, -0.28, 0.32];
    const analysis = analyzeFullSequence({
      session: {
        samples: sideBends.map(() => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: sideBends.length,
        frames: sideBends.map((sideBend, frameIndex) => {
          const frame = renderedSideBendFrame(frameIndex, -sideBend);
          frame.debug.spineDrive.sideBend = sideBend;
          return frame;
        }),
        missingFrames: [],
        sessionId: "inverted-rendered-side-bend-test",
      },
    });

    expect(analysis.sideBend.correlation).toBe(-1);
    expect(analysis.failures).toContainEqual(
      expect.objectContaining({ code: "rendered-side-bend-under-response" }),
    );
    expect(analysis.status).toBe("blocked");
  });

  it("does not treat near-zero threshold-tail variation as a side-bend response exercise", () => {
    const sourceSideBends = [0.0802, 0.081, 0.0818, 0.0821, 0.0815, 0.0804];
    const renderedSideBends = [0.14, 0.13, 0.12, 0.11, 0.12, 0.13];
    const analysis = analyzeFullSequence({
      session: {
        samples: sourceSideBends.map(() => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: sourceSideBends.length,
        frames: sourceSideBends.map((sourceSideBend, frameIndex) => {
          const frame = renderedSideBendFrame(frameIndex, renderedSideBends[frameIndex]);
          frame.debug.spineDrive.sideBend = sourceSideBend;
          return frame;
        }),
        missingFrames: [],
        sessionId: "threshold-tail-side-bend-test",
      },
    });

    expect(analysis.sideBend).toMatchObject({ sampleCount: 6, sourceRange: 0.0019 });
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-side-bend-under-response" }),
    );
  });
});

function renderedHeadPitchFrame(frameIndex, pitch) {
  return {
    debug: {
      avatarHead: {
        bonePitch: -pitch,
      },
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: {
          leftFootClearance: 0,
          rightFootClearance: 0,
        },
        segments: {},
      },
      fallbacks: {
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
      },
      headRaw: {
        pitch,
      },
      retarget: {
        appliedLowerBody: 6,
        sourceQuality: 0.9,
      },
      spineDrive: {
        sideBend: 0,
      },
    },
    frameIndex,
  };
}

describe("full-sequence rendered head analysis", () => {
  it("compares final VRM head-bone pitch in source-intent space", () => {
    const pitches = [0.08, 0.12, 0.16, 0.2, 0.24, 0.28];
    const analysis = analyzeFullSequence({
      session: {
        samples: pitches.map(() => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: pitches.length,
        frames: pitches.map((pitch, frameIndex) => renderedHeadPitchFrame(frameIndex, pitch)),
        missingFrames: [],
        sessionId: "rendered-head-pitch-sign-test",
      },
    });

    expect(analysis.head.correlation).toBe(1);
    expect(analysis.head.responseRatio).toBe(1);
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-head-pitch-under-response" }),
    );
    expect(analysis.status).toBe("passed");
  });
});

function footClearancePose(rightAnkleY) {
  const pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  pose[11] = { x: 0.4, y: 0.3, z: 0 };
  pose[12] = { x: 0.6, y: 0.3, z: 0 };
  pose[23] = { x: 0.45, y: 0.5, z: 0 };
  pose[24] = { x: 0.55, y: 0.5, z: 0 };
  pose[27] = { x: 0.45, y: 0.9, z: 0 };
  pose[28] = { x: 0.55, y: rightAnkleY, z: 0 };
  return pose;
}

function footClearanceFrame(frameIndex, leftFootClearance) {
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: {
          leftFootClearance,
          rightFootClearance: 0,
        },
        segments: {},
      },
      fallbacks: {
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
      },
      retarget: {
        appliedLowerBody: 6,
        sourceQuality: 0.9,
      },
      spineDrive: {
        sideBend: 0,
      },
    },
    frameIndex,
  };
}

describe("full-sequence rendered foot-clearance analysis", () => {
  it("blocks a frame that is present in telemetry but has no rendered avatar data", () => {
    const analysis = analyzeFullSequence({
      session: { samples: [{ tracking: { pose: footClearancePose(0.9) } }] },
      telemetry: {
        frameCount: 1,
        frames: [{ debug: null, frameIndex: 0 }],
        missingFrames: [],
        sessionId: "zero-rendered-frame-test",
      },
    });

    expect(analysis.frameAccounting).toEqual({
      compared: 0,
      complete: false,
      expected: 1,
      missing: 0,
      rendered: 0,
    });
    expect(analysis.failures).toContainEqual({ code: "rendered-debug-missing", count: 1 });
    expect(analysis.failures).toContainEqual({ code: "rendered-avatar-telemetry-missing", count: 1 });
    expect(analysis.status).toBe("blocked");
  });

  it("blocks duplicate frame indexes instead of counting a duplicate as extra proof", () => {
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: footClearancePose(0.9) } },
          { tracking: { pose: footClearancePose(0.9) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [footClearanceFrame(0, 0), footClearanceFrame(0, 0)],
        missingFrames: [1],
        sessionId: "duplicate-frame-index-test",
      },
    });

    expect(analysis.failures).toContainEqual({ code: "rendered-frames-missing", count: 1 });
    expect(analysis.failures).toContainEqual({ code: "rendered-frame-index-duplicate", count: 1 });
    expect(analysis.status).toBe("blocked");
  });

  it("does not report genuine mirrored source-foot travel as a clearance jerk", () => {
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: footClearancePose(0.9) } },
          { tracking: { pose: footClearancePose(0.86) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [footClearanceFrame(0, 0), footClearanceFrame(1, 0.2)],
        missingFrames: [],
        sessionId: "rendered-foot-travel-test",
      },
    });

    expect(analysis.jerk.frameCount).toBe(0);
  });

  it("keeps a clearance jump blocked when the mirrored source foot is stable", () => {
    const stablePose = footClearancePose(0.9);
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: stablePose } },
          { tracking: { pose: stablePose } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [footClearanceFrame(0, 0), footClearanceFrame(1, 0.2)],
        missingFrames: [],
        sessionId: "rendered-foot-snap-test",
      },
    });

    expect(analysis.jerk.frameCount).toBe(1);
    expect(analysis.jerk.worstFrames[0]).toMatchObject({
      avatarStep: 0.2,
      segment: "leftFootClearance",
      sourceStep: 0,
    });
  });

  it("reports but does not gate temporal jerk during deterministic frame stepping", () => {
    const stablePose = footClearancePose(0.9);
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: stablePose } },
          { tracking: { pose: stablePose } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [footClearanceFrame(0, 0), footClearanceFrame(1, 0.2)],
        missingFrames: [],
        playbackMode: "deterministic-rendered-frame-step",
        sessionId: "deterministic-foot-snap-diagnostic-test",
      },
    });

    expect(analysis.jerk).toMatchObject({ blocking: false, frameCount: 1 });
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-motion-jerk" }),
    );
    expect(analysis.status).toBe("passed");
  });

  it("keeps missing rendered frames blocking during deterministic frame stepping", () => {
    const analysis = analyzeFullSequence({
      session: { samples: [{ tracking: { pose: footClearancePose(0.9) } }] },
      telemetry: {
        frameCount: 1,
        frames: [],
        missingFrames: [0],
        playbackMode: "deterministic-rendered-frame-step",
        sessionId: "deterministic-missing-frame-test",
      },
    });

    expect(analysis.failures).toContainEqual({ code: "rendered-frames-missing", count: 1 });
    expect(analysis.status).toBe("blocked");
  });
});

function ownerFrame(frameIndex, owners, direction = { x: 0, y: 1, z: 0 }) {
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: {
          leftFootClearance: 0,
          rightFootClearance: 0,
        },
        segments: {
          spine: { direction },
        },
      },
      fallbacks: {
        owners,
      },
      retarget: {
        appliedLowerBody: 6,
        sourceQuality: 0.9,
      },
      spineDrive: {
        sideBend: 0,
      },
    },
    frameIndex,
  };
}

describe("full-sequence owner-flicker analysis", () => {
  it("blocks a one-frame owner switch when the final rendered avatar visibly snaps out and back", () => {
    const analysis = analyzeFullSequence({
      session: {
        samples: Array.from({ length: 3 }, () => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: 3,
        frames: [
          ownerFrame(0, "lower player-retarget; feet recorded-retarget"),
          ownerFrame(1, "lower neutral; feet neutral", { x: 1, y: 0, z: 0 }),
          ownerFrame(2, "lower player-retarget; feet recorded-retarget"),
        ],
        missingFrames: [],
        sessionId: "one-frame-owner-flicker-test",
      },
    });

    expect(analysis.failures).toContainEqual({ code: "rendered-owner-flicker", count: 1 });
    expect(analysis.ownerFlickers).toMatchObject({
      count: 1,
      worstFrames: [
        expect.objectContaining({
          frameIndex: 1,
          from: "lower player-retarget; feet recorded-retarget",
          to: "lower neutral; feet neutral",
        }),
      ],
    });
    expect(analysis.status).toBe("blocked");
  });

  it("reports a transient owner label without blocking when final rendered bones remain smooth", () => {
    const analysis = analyzeFullSequence({
      session: {
        samples: Array.from({ length: 3 }, () => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: 3,
        frames: [
          ownerFrame(0, "lower player-retarget; feet recorded-retarget"),
          ownerFrame(1, "lower neutral; feet neutral"),
          ownerFrame(2, "lower player-retarget; feet recorded-retarget"),
        ],
        missingFrames: [],
        sessionId: "smooth-owner-label-transition-test",
      },
    });

    expect(analysis.ownerFlickers.count).toBe(0);
    expect(analysis.transientOwnerTransitions.count).toBe(1);
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-owner-flicker" }),
    );
    expect(analysis.status).toBe("passed");
  });

  it("reports a stable owner transition without treating it as one-frame flicker", () => {
    const analysis = analyzeFullSequence({
      session: {
        samples: Array.from({ length: 3 }, () => ({ tracking: { pose: [] } })),
      },
      telemetry: {
        frameCount: 3,
        frames: [
          ownerFrame(0, "lower neutral; feet neutral"),
          ownerFrame(1, "lower player-retarget; feet recorded-retarget"),
          ownerFrame(2, "lower player-retarget; feet recorded-retarget"),
        ],
        missingFrames: [],
        sessionId: "stable-owner-transition-test",
      },
    });

    expect(analysis.frameAccounting).toEqual({
      compared: 3,
      complete: true,
      expected: 3,
      missing: 0,
      rendered: 3,
    });
    expect(analysis.ownerTransitions.count).toBe(1);
    expect(analysis.ownerFlickers.count).toBe(0);
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-owner-flicker" }),
    );
    expect(analysis.status).toBe("passed");
  });
});

function armOwnershipPose(leftLowerArmAngle, rightLowerArmAngle = 0) {
  const pose = Array.from({ length: 33 }, () => null);
  pose[13] = { x: 0, y: 0, z: 0 };
  pose[15] = { x: Math.cos(leftLowerArmAngle), y: Math.sin(leftLowerArmAngle), z: 0 };
  pose[14] = { x: 0, y: 0, z: 0 };
  pose[16] = {
    x: Math.cos(rightLowerArmAngle),
    y: Math.sin(rightLowerArmAngle),
    z: 0,
  };
  return pose;
}

function armOwnershipFrame(frameIndex, { confidence, leftDirection, rightDirection }) {
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: { leftFootClearance: 0, rightFootClearance: 0 },
        segments: {
          leftLowerArm: { confidence, direction: leftDirection, sourceDirection: leftDirection },
          rightLowerArm: { confidence, direction: rightDirection, sourceDirection: rightDirection },
        },
      },
      fallbacks: {
        leftArm: "retargeted-arm",
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
        rightArm: "retargeted-arm",
      },
      retarget: { appliedLowerBody: 6, sourceQuality: 0.9 },
      spineDrive: { sideBend: 0 },
    },
    frameIndex,
  };
}

describe("full-sequence mirrored arm ownership analysis", () => {
  it("excludes low-confidence recovery instead of counting catch-up as wrong-side motion", () => {
    const stable = { x: 1, y: 0, z: 0 };
    const moved = { x: Math.cos(0.2), y: Math.sin(0.2), z: 0 };
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: armOwnershipPose(0) } },
          { tracking: { pose: armOwnershipPose(0.2) } },
        ],
      },
      telemetry: {
        frameCount: 7,
        frames: [
          armOwnershipFrame(0, { confidence: 0.7, leftDirection: stable, rightDirection: stable }),
          armOwnershipFrame(1, { confidence: 0.7, leftDirection: moved, rightDirection: stable }),
        ],
        missingFrames: [0, 1, 2, 3, 4],
        sessionId: "low-confidence-arm-ownership-test",
      },
    });

    expect(analysis.mirrorSideOwnership["lower-arm"]).toMatchObject({
      excludedFrameCount: 1,
      failedFrameCount: 0,
      sampleCount: 0,
    });
  });

  it("keeps high-confidence wrong-side movement as failed ownership evidence", () => {
    const stable = { x: 1, y: 0, z: 0 };
    const moved = { x: Math.cos(0.2), y: Math.sin(0.2), z: 0 };
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: armOwnershipPose(0) } },
          { tracking: { pose: armOwnershipPose(0.2) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [
          armOwnershipFrame(0, { confidence: 0.9, leftDirection: stable, rightDirection: stable }),
          armOwnershipFrame(1, { confidence: 0.9, leftDirection: moved, rightDirection: stable }),
        ],
        missingFrames: [],
        sessionId: "high-confidence-arm-ownership-test",
      },
    });

    expect(analysis.mirrorSideOwnership["lower-arm"]).toMatchObject({
      ambiguousFrameCount: 0,
      excludedFrameCount: 0,
      failedFrameCount: 1,
      sampleCount: 1,
    });
  });

  it("reports near-tied side response as ambiguous rather than reversed", () => {
    const stable = { x: 1, y: 0, z: 0 };
    const expected = { x: Math.cos(0.02), y: Math.sin(0.02), z: 0 };
    const nearTie = { x: Math.cos(0.024), y: Math.sin(0.024), z: 0 };
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: armOwnershipPose(0) } },
          { tracking: { pose: armOwnershipPose(0.2) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [
          armOwnershipFrame(0, { confidence: 0.9, leftDirection: stable, rightDirection: stable }),
          armOwnershipFrame(1, { confidence: 0.9, leftDirection: nearTie, rightDirection: expected }),
        ],
        missingFrames: [],
        sessionId: "ambiguous-arm-ownership-test",
      },
    });

    expect(analysis.mirrorSideOwnership["lower-arm"]).toMatchObject({
      ambiguousFrameCount: 1,
      failedFrameCount: 0,
      sampleCount: 0,
    });
  });

  it("does not report a side swap while a smoothed arm finishes the prior side's movement", () => {
    const direction = (angle) => ({ x: Math.cos(angle), y: Math.sin(angle), z: 0 });
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: armOwnershipPose(0, 0) } },
          { tracking: { pose: armOwnershipPose(0, 0.1) } },
          { tracking: { pose: armOwnershipPose(0.1, 0.1) } },
          { tracking: { pose: armOwnershipPose(0.2, 0.1) } },
        ],
      },
      telemetry: {
        frameCount: 4,
        frames: [
          armOwnershipFrame(0, { confidence: 0.9, leftDirection: direction(0), rightDirection: direction(0) }),
          armOwnershipFrame(1, { confidence: 0.9, leftDirection: direction(0), rightDirection: direction(0) }),
          armOwnershipFrame(2, { confidence: 0.9, leftDirection: direction(0.1), rightDirection: direction(0) }),
          armOwnershipFrame(3, { confidence: 0.9, leftDirection: direction(0.1), rightDirection: direction(0.1) }),
        ],
        missingFrames: [],
        sessionId: "smoothed-arm-side-handoff-test",
      },
    });

    expect(analysis.mirrorSideOwnership["lower-arm"]).toMatchObject({
      failedFrameCount: 0,
    });
  });

  it("blocks a persistent high-confidence wrong-side rendered response", () => {
    const direction = (value) => ({ x: Math.cos(value), y: Math.sin(value), z: 0 });
    const angles = [0, 0.08, 0.16, 0.24, 0.32];
    const analysis = analyzeFullSequence({
      session: {
        samples: angles.map((value) => ({ tracking: { pose: armOwnershipPose(value) } })),
      },
      telemetry: {
        frameCount: angles.length,
        frames: angles.map((value, frameIndex) => armOwnershipFrame(frameIndex, {
          confidence: 0.9,
          leftDirection: direction(value),
          rightDirection: direction(0),
        })),
        missingFrames: [],
        sessionId: "persistent-wrong-side-arm-test",
      },
    });

    expect(analysis.mirrorSideOwnership["lower-arm"]).toMatchObject({
      hardFailedFrameCount: 4,
      persistentHardMismatchRuns: [{ frameEnd: 4, frameStart: 1, length: 4 }],
    });
    expect(analysis.failures).toContainEqual({
      code: "rendered-mirror-side-persistent-mismatch",
      count: 4,
      segment: "lower-arm",
    });
    expect(analysis.status).toBe("blocked");
  });
});

function heldStaticUpperArmFrame(frameIndex, targetAngle) {
  const stable = { x: 1, y: 0, z: 0 };
  const target = { x: Math.cos(targetAngle), y: Math.sin(targetAngle), z: 0 };
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: { leftFootClearance: 0, rightFootClearance: 0 },
        segments: {
          leftUpperArm: { confidence: 0.9, direction: stable, sourceDirection: stable },
          rightUpperArm: { confidence: 0.9, direction: stable, sourceDirection: target },
        },
      },
      fallbacks: {
        leftArm: "retargeted-arm",
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
        rightArm: "retargeted-arm",
      },
      retarget: { appliedLowerBody: 6, sourceQuality: 0.9 },
      spineDrive: { sideBend: 0 },
    },
    frameIndex,
  };
}

describe("full-sequence sustained rendered response analysis", () => {
  it("blocks a segment held static across sustained moving target frames", () => {
    const targetAngles = [0, 0.04, 0.08, 0.12, 0.16];
    const analysis = analyzeFullSequence({
      session: {
        samples: targetAngles.map(() => ({ tracking: { pose: stableUpperArmPose() } })),
      },
      telemetry: {
        frameCount: targetAngles.length,
        frames: targetAngles.map((targetAngle, frameIndex) => (
          heldStaticUpperArmFrame(frameIndex, targetAngle)
        )),
        missingFrames: [],
        sessionId: "held-static-upper-arm-test",
      },
    });

    expect(analysis.mirrorSegments["arm:rightUpperArm"]).toMatchObject({
      persistentStaticFrameCount: 4,
      persistentStaticRuns: [{ frameEnd: 4, frameStart: 1, length: 4 }],
    });
    expect(analysis.failures).toContainEqual({
      code: "rendered-segment-held-static",
      count: 4,
      segment: "arm:rightUpperArm",
    });
    expect(analysis.status).toBe("blocked");
  });

  it("does not block a held segment whose source confidence is below its application gate", () => {
    const direction = (angle) => ({ x: Math.sin(angle), y: Math.cos(angle), z: 0 });
    const pose = (angle) => {
      const landmarks = Array.from({ length: 33 }, () => null);
      landmarks[25] = { x: 0, y: 0, z: 0 };
      landmarks[27] = direction(angle);
      landmarks[26] = { x: 0, y: 0, z: 0 };
      landmarks[28] = direction(0);
      return landmarks;
    };
    const targetAngles = [0, 0.04, 0.08, 0.12, 0.16];
    const analysis = analyzeFullSequence({
      session: {
        samples: targetAngles.map((targetAngle) => ({ tracking: { pose: pose(targetAngle) } })),
      },
      telemetry: {
        frameCount: targetAngles.length,
        frames: targetAngles.map((targetAngle, frameIndex) => ({
          debug: {
            avatarVisual: {
              averageLowerBodyDirectionError: 0,
              footing: { leftFootClearance: 0, rightFootClearance: 0 },
              segments: {
                leftShin: { confidence: 0.1, direction: direction(0), sourceDirection: direction(targetAngle) },
                rightShin: { confidence: 0.1, direction: direction(0), sourceDirection: direction(0) },
              },
            },
            fallbacks: { owners: "head pose; torso player-spine-model; lower neutral; feet neutral" },
            retarget: { appliedLowerBody: 0, sourceQuality: 0.5 },
            spineDrive: { sideBend: 0 },
          },
          frameIndex,
        })),
        missingFrames: [],
        sessionId: "weak-held-static-shin-test",
      },
    });

    expect(analysis.mirrorSegments["leg:rightShin"].persistentStaticFrameCount).toBe(0);
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-segment-held-static", segment: "leg:rightShin" }),
    );
  });
});

function rootRelativeArmFrame(frameIndex, { armAngle, forwardLean = 0, targetYaw }) {
  const direction = { x: Math.cos(armAngle), y: Math.sin(armAngle), z: 0 };
  const stable = { x: 1, y: 0, z: 0 };
  return {
    debug: {
      avatarRoot: { targetYaw },
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: { leftFootClearance: 0, rightFootClearance: 0 },
        segments: {
          leftUpperArm: { confidence: 0.9, direction: stable, sourceDirection: stable },
          rightUpperArm: { confidence: 0.9, direction, sourceDirection: stable },
        },
      },
      fallbacks: {
        leftArm: "retargeted-arm",
        owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
        rightArm: "retargeted-arm",
      },
      retarget: { appliedLowerBody: 6, sourceQuality: 0.9 },
      spineDrive: { forwardLean, sideBend: 0, twist: 0 },
    },
    frameIndex,
  };
}

function stableUpperArmPose() {
  const pose = Array.from({ length: 33 }, () => null);
  pose[11] = { x: 0, y: 0, z: 0 };
  pose[13] = { x: 1, y: 0, z: 0 };
  pose[12] = { x: 0, y: 0, z: 0 };
  pose[14] = { x: 1, y: 0, z: 0 };
  return pose;
}

describe("full-sequence root-relative limb jerk analysis", () => {
  function analyzeRootRelativeArm(targetYaw) {
    const samples = Array.from({ length: 7 }, () => ({ tracking: { pose: stableUpperArmPose() } }));
    return analyzeFullSequence({
      session: { samples },
      telemetry: {
        frameCount: 7,
        frames: [
          rootRelativeArmFrame(5, { armAngle: 0, targetYaw: 0 }),
          rootRelativeArmFrame(6, { armAngle: 0.2, targetYaw }),
        ],
        missingFrames: [0, 1, 2, 3, 4],
        sessionId: "root-relative-arm-jerk-test",
      },
    });
  }

  it("does not report child world motion caused by an intended root turn", () => {
    expect(analyzeRootRelativeArm(0.2).jerk.frameCount).toBe(0);
  });

  it("keeps the same child motion blocked against a stable root target", () => {
    expect(analyzeRootRelativeArm(0).jerk).toMatchObject({
      frameCount: 1,
      worstFrames: [expect.objectContaining({ segment: "rightUpperArm" })],
    });
  });

  it("does not double-count intended source spine motion as an arm jerk", () => {
    const samples = Array.from({ length: 7 }, () => ({ tracking: { pose: stableUpperArmPose() } }));
    const analysis = analyzeFullSequence({
      session: { samples },
      telemetry: {
        frameCount: 7,
        frames: [
          rootRelativeArmFrame(5, { armAngle: 0, forwardLean: 0, targetYaw: 0 }),
          rootRelativeArmFrame(6, { armAngle: 0.2, forwardLean: 0.4, targetYaw: 0 }),
        ],
        missingFrames: [0, 1, 2, 3, 4],
        sessionId: "spine-relative-arm-jerk-test",
      },
    });

    expect(analysis.jerk.frameCount).toBe(0);
  });
});

describe("full-sequence parent-relative child limb jerk analysis", () => {
  it("does not report lower-arm world motion caused by its moving upper-arm target", () => {
    const pose = armOwnershipPose(0);
    const stable = { x: 1, y: 0, z: 0 };
    const moved = { x: Math.cos(0.2), y: Math.sin(0.2), z: 0 };
    const frames = [0, 1].map((frameIndex) => ({
      debug: {
        avatarVisual: {
          averageLowerBodyDirectionError: 0,
          footing: { leftFootClearance: 0, rightFootClearance: 0 },
          segments: {
            leftLowerArm: { confidence: 0.9, direction: stable, sourceDirection: stable },
            leftUpperArm: { confidence: 0.9, direction: stable, sourceDirection: stable },
            rightLowerArm: {
              confidence: 0.9,
              direction: frameIndex === 0 ? stable : moved,
              sourceDirection: stable,
            },
            rightUpperArm: {
              confidence: 0.9,
              direction: frameIndex === 0 ? stable : moved,
              sourceDirection: frameIndex === 0 ? stable : moved,
            },
          },
        },
        fallbacks: {
          leftArm: "retargeted-arm",
          owners: "head pose; torso player-spine-model; lower player-retarget; feet recorded-retarget",
          rightArm: "retargeted-arm",
        },
        retarget: { appliedLowerBody: 6, sourceQuality: 0.9 },
        spineDrive: { sideBend: 0 },
      },
      frameIndex: frameIndex + 5,
    }));
    const samples = Array.from({ length: 7 }, () => ({ tracking: { pose } }));
    const analysis = analyzeFullSequence({
      session: { samples },
      telemetry: { frameCount: 2, frames, missingFrames: [], sessionId: "parent-relative-child-test" },
    });

    expect(analysis.jerk.frameCount).toBe(0);
  });
});

function thighOwnershipPose(leftThighAngle) {
  const pose = Array.from({ length: 33 }, () => null);
  pose[23] = { x: 0, y: 0, z: 0 };
  pose[25] = { x: Math.sin(leftThighAngle), y: Math.cos(leftThighAngle), z: 0 };
  pose[24] = { x: 0, y: 0, z: 0 };
  pose[26] = { x: 0, y: 1, z: 0 };
  return pose;
}

function thighOwnershipFrame(frameIndex, { appliedLowerBody, leftDirection, rightDirection }) {
  return {
    debug: {
      avatarVisual: {
        averageLowerBodyDirectionError: 0,
        footing: { leftFootClearance: 0, rightFootClearance: 0 },
        segments: {
          leftThigh: { confidence: 0.9, direction: leftDirection, sourceDirection: leftDirection },
          rightThigh: { confidence: 0.9, direction: rightDirection, sourceDirection: rightDirection },
        },
      },
      fallbacks: { owners: "head pose; torso player-spine-model; lower neutral; feet neutral" },
      retarget: { appliedLowerBody, sourceQuality: 0.9 },
      spineDrive: { sideBend: 0 },
    },
    frameIndex,
  };
}

describe("full-sequence mirrored leg ownership eligibility", () => {
  it("excludes side comparisons while the lower-body retargeter owns no leg chain", () => {
    const stable = { x: 0, y: 1, z: 0 };
    const moved = { x: Math.sin(0.2), y: Math.cos(0.2), z: 0 };
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: thighOwnershipPose(0) } },
          { tracking: { pose: thighOwnershipPose(0.2) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [
          thighOwnershipFrame(0, { appliedLowerBody: 0, leftDirection: stable, rightDirection: stable }),
          thighOwnershipFrame(1, { appliedLowerBody: 0, leftDirection: moved, rightDirection: stable }),
        ],
        missingFrames: [],
        sessionId: "inactive-thigh-ownership-test",
      },
    });

    expect(analysis.mirrorSideOwnership.thigh).toMatchObject({
      excludedFrameCount: 1,
      failedFrameCount: 0,
      sampleCount: 0,
    });
  });

  it("does not infer lower-limb side ownership from incidental head-only lower-limb drift", () => {
    const stable = { x: 0, y: 1, z: 0 };
    const drift = { x: Math.sin(0.04), y: Math.cos(0.04), z: 0 };
    const analysis = analyzeFullSequence({
      session: {
        samples: [
          { tracking: { pose: thighOwnershipPose(0) } },
          { tracking: { pose: thighOwnershipPose(0.04) } },
        ],
      },
      telemetry: {
        frameCount: 2,
        frames: [
          thighOwnershipFrame(0, { appliedLowerBody: 6, leftDirection: stable, rightDirection: stable }),
          thighOwnershipFrame(1, { appliedLowerBody: 6, leftDirection: drift, rightDirection: stable }),
        ],
        missingFrames: [],
        sessionId: "incidental-thigh-drift-test",
      },
    });

    expect(analysis.mirrorSideOwnership.thigh).toMatchObject({
      failedFrameCount: 0,
      sampleCount: 0,
    });
  });

  it("uses world-pose side dominance when the avatar retarget also uses world pose", () => {
    const direction = (value) => ({ x: Math.sin(value), y: Math.cos(value), z: 0 });
    const pose = (leftAngle, rightAngle) => {
      const landmarks = Array.from({ length: 33 }, () => null);
      landmarks[23] = { x: 0, y: 0, z: 0 };
      landmarks[25] = direction(leftAngle);
      landmarks[24] = { x: 0, y: 0, z: 0 };
      landmarks[26] = direction(rightAngle);
      return landmarks;
    };
    const angles = [0, 0.08, 0.16, 0.24, 0.32];
    const analysis = analyzeFullSequence({
      session: {
        samples: angles.map((value) => ({
          tracking: {
            // Perspective says source-left moved, but metric world space—the
            // space consumed by retargeting—says source-right moved.
            pose: pose(value, 0),
            worldPose: pose(0, value),
          },
        })),
      },
      telemetry: {
        frameCount: angles.length,
        frames: angles.map((value, frameIndex) => thighOwnershipFrame(frameIndex, {
          appliedLowerBody: 6,
          leftDirection: direction(value),
          rightDirection: direction(0),
        })),
        missingFrames: [],
        sessionId: "world-space-thigh-ownership-test",
      },
    });

    expect(analysis.mirrorSideOwnership.thigh).toMatchObject({
      failedFrameCount: 0,
      hardFailedFrameCount: 0,
    });
    expect(analysis.failures).not.toContainEqual(
      expect.objectContaining({ code: "rendered-mirror-side-persistent-mismatch", segment: "thigh" }),
    );
  });
});
