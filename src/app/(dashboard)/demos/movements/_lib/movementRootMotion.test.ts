import { describe, expect, it } from "vitest";
import {
  appendMovementRootMotionHistoryFrame,
  buildMovementRootMotionAnalysis,
  resolveMovementRootMotionJumpResponse,
  resolveMovementRootMotionStepResponse,
  type MovementRootMotionInputFrame,
} from "./movementRootMotion";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function emptyPose(): TrackingLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
  }));
}

function standingWorldPose(offset = { x: 0, z: 0 }, yaw = 0): TrackingLandmark[] {
  const pose = emptyPose();
  const points: Record<number, TrackingLandmark> = {
    0: { x: 0, y: 1.72, z: -0.08, visibility: 0.95 },
    7: { x: -0.09, y: 1.68, z: 0, visibility: 0.95 },
    8: { x: 0.09, y: 1.68, z: 0, visibility: 0.95 },
    11: { x: -0.22, y: 1.48, z: 0, visibility: 0.95 },
    12: { x: 0.22, y: 1.48, z: 0, visibility: 0.95 },
    23: { x: -0.14, y: 1.02, z: 0, visibility: 0.95 },
    24: { x: 0.14, y: 1.02, z: 0, visibility: 0.95 },
    25: { x: -0.14, y: 0.54, z: 0.02, visibility: 0.9 },
    26: { x: 0.14, y: 0.54, z: 0.02, visibility: 0.9 },
    27: { x: -0.14, y: 0.08, z: 0.04, visibility: 0.9 },
    28: { x: 0.14, y: 0.08, z: 0.04, visibility: 0.9 },
    29: { x: -0.15, y: 0.02, z: -0.06, visibility: 0.9 },
    30: { x: 0.15, y: 0.02, z: -0.06, visibility: 0.9 },
    31: { x: -0.13, y: 0, z: 0.18, visibility: 0.9 },
    32: { x: 0.13, y: 0, z: 0.18, visibility: 0.9 },
  };

  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  Object.entries(points).forEach(([index, point]) => {
    const x = point.x * cos - (point.z ?? 0) * sin;
    const z = point.x * sin + (point.z ?? 0) * cos;
    pose[Number(index)] = {
      ...point,
      x: x + offset.x,
      z: z + offset.z,
    };
  });

  return pose;
}

function frame(worldPose: TrackingLandmark[], pose = worldPose): MovementRootMotionInputFrame {
  return {
    pose,
    worldPose,
  };
}

describe("movement root motion", () => {
  it("appends live history frames, trims to the configured limit, and returns the latest root-motion frame", () => {
    const history: MovementRootMotionInputFrame[] = [];

    const first = appendMovementRootMotionHistoryFrame({
      history,
      limit: 2,
      pose: standingWorldPose(),
      worldPose: standingWorldPose(),
    });
    const second = appendMovementRootMotionHistoryFrame({
      history,
      limit: 2,
      pose: standingWorldPose({ x: 0.2, z: 0.05 }),
      worldPose: standingWorldPose({ x: 0.2, z: 0.05 }),
    });
    const third = appendMovementRootMotionHistoryFrame({
      history,
      limit: 2,
      pose: standingWorldPose({ x: 0.45, z: 0.1 }),
      worldPose: standingWorldPose({ x: 0.45, z: 0.1 }),
    });

    expect(first?.frameIndex).toBe(0);
    expect(second?.frameIndex).toBe(1);
    expect(third?.frameIndex).toBe(1);
    expect(history).toHaveLength(2);
    expect(third?.rootPosition.x).toBeCloseTo(0.25, 2);
  });

  it("does not append invalid live root-motion poses", () => {
    const history: MovementRootMotionInputFrame[] = [];

    const result = appendMovementRootMotionHistoryFrame({
      history,
      pose: standingWorldPose().slice(0, 20),
      worldPose: standingWorldPose(),
    });

    expect(result).toBeNull();
    expect(history).toHaveLength(0);
  });

  it("stores null world pose when the provided live world landmarks are incomplete", () => {
    const history: MovementRootMotionInputFrame[] = [];

    appendMovementRootMotionHistoryFrame({
      history,
      pose: standingWorldPose(),
      worldPose: standingWorldPose().slice(0, 20),
    });

    expect(history[0]?.worldPose).toBeNull();
  });

  it("keeps fixed-spot saved movement frames near zero path drift", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose()),
      frame(standingWorldPose()),
    ]);

    expect(analysis.summary.worldLandmarkFrameCount).toBe(3);
    expect(analysis.summary.sourceLimitedFrameCount).toBe(0);
    expect(analysis.summary.maxPathDistance).toBeLessThan(0.001);
    expect(analysis.frames[2]?.rootPosition).toMatchObject({
      x: expect.closeTo(0, 5),
      z: expect.closeTo(0, 5),
    });
  });

  it("derives a 180 degree turn from saved world points", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0, z: 0 }, Math.PI / 2)),
      frame(standingWorldPose({ x: 0, z: 0 }, Math.PI)),
    ]);

    expect(analysis.summary.maxYawDelta).toBeGreaterThan(3.0);
    expect(analysis.frames[1]?.headingYaw).toBeCloseTo(Math.PI / 2, 2);
    expect(analysis.frames[2]?.headingYaw).toBeCloseTo(Math.PI, 2);
    expect(analysis.frames[2]?.headingConfidence).toBeGreaterThan(0.8);
  });

  it("normalizes wrapped heading into an avatar-safe yaw", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0, z: 0 }, Math.PI * 1.5)),
      frame(standingWorldPose({ x: 0, z: 0 }, Math.PI * 3.5)),
    ]);

    expect(Math.abs(analysis.frames[1]?.headingYaw ?? 0)).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(analysis.frames[2]?.headingYaw ?? 0)).toBeLessThanOrEqual(Math.PI);
    expect(analysis.summary.maxYawDelta).toBeLessThanOrEqual(Math.PI);
  });

  it("derives X/Z path from saved world landmarks when the body travels", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0.28, z: 0.18 })),
      frame(standingWorldPose({ x: 0.52, z: 0.24 })),
    ]);

    expect(analysis.summary.maxPathDistance).toBeGreaterThan(0.55);
    expect(analysis.frames[2]?.rootPosition.x).toBeCloseTo(0.52, 2);
    expect(analysis.frames[2]?.rootPosition.z).toBeCloseTo(0.24, 2);
    expect(analysis.frames[2]?.rootPositionConfidence).toBeGreaterThan(0.8);
  });

  it("labels root travel, travel direction, and turn-and-travel intent", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0.28, z: 0.02 })),
      frame(standingWorldPose({ x: 0.5, z: 0.24 }, Math.PI / 2)),
    ]);

    expect(analysis.frames[1]?.intent.key).toBe("root-travel");
    expect(analysis.frames[1]?.intent.travelDirection).toBe("right");
    expect(analysis.frames[1]?.intent.travelDistance).toBeGreaterThan(0.25);
    expect(analysis.frames[2]?.intent.key).toBe("turn-and-travel");
    expect(analysis.frames[2]?.intent.headingDelta).toBeGreaterThan(1.4);
  });

  it("labels on-the-spot turns when heading changes without root travel", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0, z: 0 }, Math.PI / 2)),
    ]);

    expect(analysis.frames[1]?.intent.key).toBe("turn-on-spot");
    expect(analysis.frames[1]?.intent.travelDistance).toBeLessThan(0.01);
    expect(analysis.frames[1]?.intent.plantedFoot).toBe("both");
  });

  it("labels a planted-foot pivot when one foot stays down through a turn", () => {
    const pivot = standingWorldPose({ x: 0, z: 0 }, Math.PI / 2);
    pivot[28] = { ...pivot[28]!, y: 0.38 };
    pivot[30] = { ...pivot[30]!, y: 0.36 };
    pivot[32] = { ...pivot[32]!, y: 0.34 };
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(pivot),
    ]);

    expect(analysis.frames[1]?.intent.key).toBe("left-foot-pivot");
    expect(analysis.frames[1]?.intent.plantedFoot).toBe("left");
    expect(analysis.frames[1]?.intent.swingFoot).toBe("right");
  });

  it("labels planted weight transfer before treating small shifts as travel", () => {
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(standingWorldPose({ x: 0.08, z: 0.01 })),
    ]);

    expect(analysis.frames[1]?.intent.key).toBe("weight-transfer");
    expect(analysis.frames[1]?.intent.plantedFoot).toBe("both");
    expect(analysis.frames[1]?.intent.travelDistance).toBeGreaterThan(0.05);
  });

  it("labels both-feet airborne and landing phases as jump diagnostics", () => {
    const airborne = standingWorldPose();
    [27, 28, 29, 30, 31, 32].forEach((index) => {
      airborne[index] = { ...airborne[index]!, y: 0.34 };
    });
    const analysis = buildMovementRootMotionAnalysis([
      frame(standingWorldPose()),
      frame(airborne),
      frame(standingWorldPose()),
    ]);

    expect(analysis.frames[1]?.feet.left.contact).toBe(false);
    expect(analysis.frames[1]?.feet.right.contact).toBe(false);
    expect(analysis.frames[1]?.intent.key).toBe("jump-flight");
    expect(analysis.frames[1]?.intent.swingFoot).toBe("both");
    expect(analysis.frames[2]?.intent.key).toBe("jump-landing");
    expect(analysis.frames[2]?.intent.plantedFoot).toBe("both");

    const flightResponse = resolveMovementRootMotionJumpResponse(analysis.frames[1]!.intent);
    const landingResponse = resolveMovementRootMotionJumpResponse(analysis.frames[2]!.intent);
    expect(flightResponse).toMatchObject({
      owner: "jump-response-flight",
      shouldApply: true,
    });
    expect(flightResponse.heightOffset).toBeGreaterThan(0);
    expect(landingResponse).toMatchObject({
      owner: "jump-response-landing",
      shouldApply: true,
    });
    expect(landingResponse.heightOffset).toBeLessThan(0);
  });

  it("classifies image-only saved points as source-limited for physical path", () => {
    const pose = standingWorldPose();
    const analysis = buildMovementRootMotionAnalysis([
      { pose, worldPose: null },
      { pose: standingWorldPose({ x: 0.3, z: 0.2 }), worldPose: null },
    ]);

    expect(analysis.summary.worldLandmarkFrameCount).toBe(0);
    expect(analysis.summary.sourceLimitedFrameCount).toBe(2);
    expect(analysis.frames[1]?.debug.source).toBe("image-landmarks");
    expect(analysis.frames[1]?.debug.reasons).toContain(
      "image landmarks can show pose and limited heading but do not prove floor path",
    );
    expect(analysis.frames[1]?.rootPositionConfidence).toBe(0);
  });

  it("marks foot contact and basic step phases from saved world points", () => {
    const neutral = standingWorldPose();
    const lifted = standingWorldPose();
    lifted[31] = { ...lifted[31]!, y: 0.36, z: 0.34 };
    lifted[29] = { ...lifted[29]!, y: 0.32, z: 0.12 };
    lifted[27] = { ...lifted[27]!, y: 0.34, z: 0.18 };

    const analysis = buildMovementRootMotionAnalysis([
      frame(neutral),
      frame(lifted),
      frame(standingWorldPose({ x: 0.2, z: 0.12 })),
    ]);

    expect(analysis.frames[0]?.feet.left.stepPhase).toBe("planted");
    expect(analysis.frames[1]?.feet.left.stepPhase).toBe("lifting");
    expect(analysis.frames[2]?.feet.left.stepPhase).toBe("landing");
    expect(analysis.frames[1]?.intent.key).toBe("left-foot-release");
    expect(analysis.frames[2]?.intent.key).toBe("left-foot-landing");

    const releaseResponse = resolveMovementRootMotionStepResponse(analysis.frames[1]!.intent);
    const landingResponse = resolveMovementRootMotionStepResponse(analysis.frames[2]!.intent);
    expect(releaseResponse).toMatchObject({
      owner: "step-response-left-release",
      shouldApply: true,
      side: "left",
    });
    expect(releaseResponse.footLiftOffset).toBeGreaterThan(0);
    expect(landingResponse).toMatchObject({
      owner: "step-response-left-landing",
      shouldApply: true,
      side: "left",
    });
    expect(landingResponse.footLiftOffset).toBeLessThan(0);
  });
});
