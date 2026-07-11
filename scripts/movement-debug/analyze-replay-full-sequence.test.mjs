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
        frameCount: 2,
        frames: [
          armOwnershipFrame(0, { confidence: 0.7, leftDirection: stable, rightDirection: stable }),
          armOwnershipFrame(1, { confidence: 0.7, leftDirection: moved, rightDirection: stable }),
        ],
        missingFrames: [],
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
        frameCount: 2,
        frames: [
          rootRelativeArmFrame(5, { armAngle: 0, targetYaw: 0 }),
          rootRelativeArmFrame(6, { armAngle: 0.2, targetYaw }),
        ],
        missingFrames: [],
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
        frameCount: 2,
        frames: [
          rootRelativeArmFrame(5, { armAngle: 0, forwardLean: 0, targetYaw: 0 }),
          rootRelativeArmFrame(6, { armAngle: 0.2, forwardLean: 0.4, targetYaw: 0 }),
        ],
        missingFrames: [],
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
});
