import { describe, expect, it } from "vitest";
import { analyzeThreePartyReplay } from "./analyze-replay-three-party.mjs";

function debug(direction) {
  const segments = Object.fromEntries([
    "leftFoot", "leftLowerArm", "leftShin", "leftThigh", "leftUpperArm",
    "rightFoot", "rightLowerArm", "rightShin", "rightThigh", "rightUpperArm", "spine",
  ].map((segment) => [segment, { confidence: 0.9, direction, sourceError: 0 }]));
  return {
    avatarHead: {
      appliedLocalPitch: 0.1,
      appliedLocalRoll: 0.04,
      appliedLocalYaw: 0.02,
      appliedWorldPitch: 0.1,
      appliedWorldRoll: 0.04,
      appliedWorldYaw: 0.02,
      bonePitch: 0.1,
      boneRoll: 0.04,
      boneYaw: 0.02,
    },
    avatarSpine: {
      chest: { x: 0.1, y: 0.05, z: 0.02 },
      upperChest: { x: 0.08, y: 0.04, z: 0.01 },
    },
    avatarVisual: { segments },
    headRaw: { confidence: 0.9 },
    headApplied: { pitch: 0.1, roll: 0.04, yaw: 0.02 },
  };
}

function telemetry(playerDirection = { x: 1, y: 0, z: 0 }) {
  return {
    frameCount: 2,
    frames: [0, 1].map((frameIndex) => ({
      avatars: {
        instructor: debug({ x: 1, y: 0, z: 0 }),
        player: debug(playerDirection),
      },
      frameIndex,
    })),
    missingFrameCount: 0,
    proofMode: "three-party-mirror",
    sessionId: "three-party-test",
  };
}

describe("three-party rendered Replay analyzer", () => {
  it("blocks an empty artifact even when its declared missing-frame count is zero", () => {
    const analysis = analyzeThreePartyReplay({
      telemetry: {
        frameCount: 9,
        frames: [],
        missingFrameCount: 0,
        proofMode: "three-party-mirror",
        sessionId: "empty-three-party-proof",
      },
    });

    expect(analysis.frameAccounting).toEqual({
      compared: 0,
      complete: false,
      expected: 9,
      missing: 9,
      rendered: 0,
    });
    expect(analysis.failures).toContainEqual({ code: "three-party-rendered-frames-missing", count: 9 });
    expect(analysis.failures).toContainEqual({ code: "three-party-frame-accounting-mismatch", count: 1 });
    expect(analysis.status).toBe("blocked");
  });

  it("blocks duplicate frame indexes rather than treating them as complete proof", () => {
    const input = telemetry();
    input.frameCount = 3;
    input.frames.push({ ...input.frames[1], frameIndex: 1 });
    input.missingFrameCount = 0;

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.failures).toContainEqual({ code: "three-party-rendered-frames-missing", count: 1 });
    expect(analysis.failures).toContainEqual({ code: "three-party-frame-index-duplicate", count: 1 });
    expect(analysis.status).toBe("blocked");
  });

  it("passes matching actual instructor and player destination bones", () => {
    const analysis = analyzeThreePartyReplay({ telemetry: telemetry() });
    expect(analysis.status).toBe("passed");
    expect(analysis.failures).toEqual([]);
  });

  it("blocks visibly divergent same-destination bones", () => {
    const analysis = analyzeThreePartyReplay({ telemetry: telemetry({ x: 0, y: 1, z: 0 }) });
    expect(analysis.status).toBe("blocked");
    expect(analysis.failures).toContainEqual(expect.objectContaining({
      code: "three-party-segment-diverged",
      segment: "rightUpperArm",
    }));
  });

  it("blocks avatars that agree with each other but both miss their own source", () => {
    const input = telemetry();
    input.frames.forEach((frame) => {
      frame.avatars.instructor.avatarVisual.segments.leftUpperArm.sourceError = 0.3;
      frame.avatars.player.avatarVisual.segments.leftUpperArm.sourceError = 0.3;
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.segments.leftUpperArm.p95Difference).toBe(0);
    expect(analysis.failures).toContainEqual({
      code: "three-party-source-fidelity-severe",
      count: 2,
      role: "instructor",
      segment: "leftUpperArm",
    });
    expect(analysis.failures).toContainEqual({
      code: "three-party-source-fidelity-severe",
      count: 2,
      role: "player",
      segment: "leftUpperArm",
    });
    expect(analysis.status).toBe("blocked");
  });

  it("grades held spine owners against each role's prior rendered pose", () => {
    const input = telemetry();
    input.frames.forEach((frame, frameIndex) => {
      for (const role of ["instructor", "player"]) {
        const rotations = {
          chest: { x: 0.2, y: 0.03, z: -0.02 },
          spine: { x: 0.12, y: 0.02, z: -0.01 },
          upperChest: { x: 0.15, y: 0.025, z: -0.015 },
        };
        frame.avatars[role].avatarSpine = structuredClone(rotations);
        frame.avatars[role].spineDrive = {
          confidence: 0.99,
          owner: frameIndex === 0 ? "player-spine-model" : "player-spine-held",
          targetRotations: frameIndex === 0
            ? structuredClone(rotations)
            : {
                chest: { x: 0, y: 0, z: 0 },
                spine: { x: 0, y: 0, z: 0 },
                upperChest: { x: 0, y: 0, z: 0 },
              },
        };
      }
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.sourceFidelity.roles.instructor.segments.spine).toMatchObject({
      maxError: 0,
      repairSampleCount: 0,
    });
    expect(analysis.sourceFidelity.roles.player.segments.spine).toMatchObject({
      maxError: 0,
      repairSampleCount: 0,
    });
    expect(analysis.status).toBe("passed");
  });

  it("blocks a held spine owner that jumps away from its prior rendered pose", () => {
    const input = telemetry();
    input.frames.forEach((frame, frameIndex) => {
      for (const role of ["instructor", "player"]) {
        const priorRotations = {
          chest: { x: 0.2, y: 0, z: 0 },
          spine: { x: 0.1, y: 0, z: 0 },
          upperChest: { x: 0.15, y: 0, z: 0 },
        };
        frame.avatars[role].avatarSpine = structuredClone(priorRotations);
        frame.avatars[role].spineDrive = {
          confidence: 0.99,
          owner: frameIndex === 0 ? "player-spine-model" : "player-spine-held",
          targetRotations: frameIndex === 0
            ? structuredClone(priorRotations)
            : {
                chest: { x: 0, y: 0, z: 0 },
                spine: { x: 0, y: 0, z: 0 },
                upperChest: { x: 0, y: 0, z: 0 },
              },
        };
        if (frameIndex === 1) frame.avatars[role].avatarSpine.chest.x += 0.2;
      }
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.failures).toContainEqual({
      code: "three-party-source-fidelity-blocked",
      count: 1,
      role: "instructor",
      segment: "spine",
    });
    expect(analysis.failures).toContainEqual({
      code: "three-party-source-fidelity-blocked",
      count: 1,
      role: "player",
      segment: "spine",
    });
    expect(analysis.status).toBe("blocked");
  });

  it("blocks matching avatars when both final head bones miss their own target", () => {
    const input = telemetry();
    input.frames.forEach((frame, frameIndex) => {
      for (const role of ["instructor", "player"]) {
        frame.avatars[role].avatarHead.boneYaw = 0.3;
        frame.avatars[role].avatarHead.appliedWorldYaw = frameIndex === 0 ? 0.3 : 0;
      }
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.axial.p95Difference).toBe(0);
    expect(analysis.failures).toContainEqual({
      axis: "yaw",
      code: "three-party-source-head-fidelity-severe",
      count: 1,
      role: "instructor",
    });
    expect(analysis.failures).toContainEqual({
      axis: "yaw",
      code: "three-party-source-head-fidelity-severe",
      count: 1,
      role: "player",
    });
  });

  it("uses final world quaternion deltas so yaw wrapping cannot create a false severe failure", () => {
    const input = telemetry();
    input.frames.forEach((frame, frameIndex) => {
      const yaw = frameIndex === 0 ? Math.PI : -0.9;
      const quaternion = {
        w: Math.cos(yaw / 2),
        x: 0,
        y: Math.sin(yaw / 2),
        z: 0,
      };
      for (const role of ["instructor", "player"]) {
        frame.avatars[role].avatarHead.boneYaw = yaw;
        frame.avatars[role].avatarHead.appliedWorldYaw = yaw;
        frame.avatars[role].avatarHead.targetWorldQuaternion = quaternion;
        frame.avatars[role].avatarHead.appliedWorldQuaternion = quaternion;
      }
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.sourceFidelity.roles.instructor.head.yaw.maxErrorRadians).toBe(0);
    expect(analysis.sourceFidelity.roles.player.head.yaw.maxErrorRadians).toBe(0);
    expect(analysis.failures).not.toContainEqual(expect.objectContaining({
      code: "three-party-source-head-fidelity-severe",
    }));
  });

  it("still blocks divergent rendered bones when source confidence is low", () => {
    const input = telemetry();
    input.frames.forEach((frame) => {
      frame.avatars.instructor.avatarVisual.segments.rightFoot.confidence = 0.1;
      frame.avatars.player.avatarVisual.segments.rightFoot.confidence = 0.1;
      frame.avatars.player.avatarVisual.segments.rightFoot.direction = { x: 0, y: 1, z: 0 };
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });
    expect(analysis.failures).toContainEqual(expect.objectContaining({
      code: "three-party-segment-diverged",
      segment: "rightFoot",
    }));
    expect(analysis.segments.rightFoot.confidentSampleCount).toBe(0);
    expect(analysis.segments.rightFoot.sampleCount).toBe(2);
  });

  it("blocks any missing rendered segment instead of treating it as low source confidence", () => {
    const input = telemetry();
    delete input.frames[1].avatars.player.avatarVisual.segments.leftFoot;

    const analysis = analyzeThreePartyReplay({ telemetry: input });
    expect(analysis.failures).toContainEqual({
      code: "three-party-segment-render-missing",
      count: 1,
      segment: "leftFoot",
    });
  });

  it("blocks missing rendered roles even when frame accounting is complete", () => {
    const input = telemetry();
    delete input.frames[1].avatars.instructor;
    const analysis = analyzeThreePartyReplay({ telemetry: input });
    expect(analysis.failures).toContainEqual({ code: "three-party-rendered-role-missing", count: 1 });
    expect(analysis.status).toBe("blocked");
  });

  it("blocks sustained segment divergence hidden below the session p95", () => {
    const input = telemetry();
    input.frameCount = 100;
    input.frames = Array.from({ length: 100 }, (_, frameIndex) => ({
      avatars: {
        instructor: debug({ x: 1, y: 0, z: 0 }),
        player: debug(
          frameIndex >= 40 && frameIndex <= 42
            ? { x: 0, y: 1, z: 0 }
            : { x: 1, y: 0, z: 0 },
        ),
      },
      frameIndex,
    }));

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.segments.rightUpperArm.p95Difference).toBe(0);
    expect(analysis.segments.rightUpperArm.persistentDivergenceRuns).toEqual([{
      frameEnd: 42,
      frameStart: 40,
      length: 3,
      maxDifference: 1.5708,
    }]);
    expect(analysis.failures).toContainEqual({
      code: "three-party-segment-sustained-divergence",
      count: 3,
      segment: "rightUpperArm",
    });
  });

  it("blocks sustained axial divergence hidden by other axes and frames", () => {
    const input = telemetry();
    input.frameCount = 100;
    input.frames = Array.from({ length: 100 }, (_, frameIndex) => {
      const instructor = debug({ x: 1, y: 0, z: 0 });
      const player = debug({ x: 1, y: 0, z: 0 });
      if (frameIndex >= 60 && frameIndex <= 62) player.avatarHead.appliedWorldPitch = 0.5;
      return { avatars: { instructor, player }, frameIndex };
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.axial.p95Difference).toBe(0);
    expect(analysis.axial.persistentDivergenceRuns).toContainEqual({
      axis: "head.pitch",
      frameEnd: 62,
      frameStart: 60,
      length: 3,
      maxDifference: 0.4,
    });
    expect(analysis.failures).toContainEqual({
      code: "three-party-axial-sustained-divergence",
      count: 3,
    });
  });

  it("blocks rendered head divergence even when the pre-application targets match", () => {
    const input = telemetry();
    input.frames.forEach((frame) => {
      frame.avatars.player.avatarHead.appliedWorldYaw = 0.4;
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.failures).toContainEqual({
      code: "three-party-axial-diverged",
      count: 2,
    });
    expect(analysis.axial.worstFrames[0]).toMatchObject({
      axis: "head.yaw",
      difference: 0.38,
    });
  });

  it("compares rendered head yaw across the signed angle boundary", () => {
    const input = telemetry();
    input.frames.forEach((frame) => {
      frame.avatars.instructor.avatarHead.appliedWorldYaw = 3.13;
      frame.avatars.player.avatarHead.appliedWorldYaw = -3.13;
    });

    const analysis = analyzeThreePartyReplay({ telemetry: input });

    expect(analysis.status).toBe("passed");
    expect(analysis.axial.worstFrames).toContainEqual(expect.objectContaining({
      axis: "head.yaw",
      difference: 0.0232,
    }));
  });
});
