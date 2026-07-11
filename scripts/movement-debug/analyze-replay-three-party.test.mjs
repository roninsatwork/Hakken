import { describe, expect, it } from "vitest";
import { analyzeThreePartyReplay } from "./analyze-replay-three-party.mjs";

function debug(direction) {
  const segments = Object.fromEntries([
    "leftFoot", "leftLowerArm", "leftShin", "leftThigh", "leftUpperArm",
    "rightFoot", "rightLowerArm", "rightShin", "rightThigh", "rightUpperArm",
  ].map((segment) => [segment, { confidence: 0.9, direction }]));
  return {
    avatarSpine: {
      chest: { x: 0.1, y: 0.05, z: 0.02 },
      upperChest: { x: 0.08, y: 0.04, z: 0.01 },
    },
    avatarVisual: { segments },
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
});
