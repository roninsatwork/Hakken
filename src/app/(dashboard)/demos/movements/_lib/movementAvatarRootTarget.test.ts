import { describe, expect, it } from "vitest";
import { resolveMovementAvatarRootTarget } from "./movementAvatarRootTarget";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import type { MovementRootMotionFrame } from "./movementRootMotion";

const uprightRootOrientation: MovementAvatarRootOrientationDecision = {
  heightLerp: 0.16,
  owner: "upright-root",
  reason: "upright",
  shouldApply: false,
  shouldApplyHeight: false,
  slerp: 0.16,
  targetHeightDrop: 0,
  targetPitch: 0,
  targetRoll: 0,
};

function rootMotionFrame(
  overrides: Partial<MovementRootMotionFrame> = {},
): MovementRootMotionFrame {
  return {
    debug: {
      reasons: [],
      source: "world-landmarks",
    },
    feet: {
      left: {
        contact: true,
        confidence: 1,
        stepPhase: "planted",
        worldPosition: null,
      },
      right: {
        contact: true,
        confidence: 1,
        stepPhase: "planted",
        worldPosition: null,
      },
    },
    floor: {
      confidence: 0.9,
      y: 0,
    },
    frameIndex: 12,
    headingConfidence: 0.9,
    headingYaw: 0.4,
    intent: {
      confidence: 0.9,
      headingDelta: 0,
      key: "root-travel",
      label: "Root travel",
      plantedFoot: "both",
      summary: "travel",
      swingFoot: "none",
      travelDirection: "forward",
      travelDistance: 0.4,
    },
    rootPosition: { x: 0.8, y: 0, z: -1 },
    rootPositionConfidence: 0.9,
    ...overrides,
  };
}

describe("movement avatar root target", () => {
  it("keeps neutral root targets when root motion is unavailable", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0.2, 0, -0.3],
      rootMotion: null,
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0.12,
    });

    expect(target.source).toBe("unavailable");
    expect(target.targetYaw).toBe(Math.PI);
    expect(target.rootHeadingYaw).toBe(0);
    expect(target.targetX).toBe(0.2);
    expect(target.targetZ).toBe(-0.3);
    expect(target.targetY).toBeCloseTo(-2.92);
    expect(target.jumpResponse.owner).toBe("jump-response-unavailable");
    expect(target.stepResponse.owner).toBe("step-response-unavailable");
    expect(target.rootHeightLerp).toBe(0.2);
  });

  it("applies confident world-space root heading and travel offsets", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0.2, 0, -0.3],
      rootMotion: rootMotionFrame({
        rootPosition: { x: 9, y: 0, z: -9 },
      }),
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });

    expect(target.source).toBe("world-landmarks");
    expect(target.rootHeadingYaw).toBe(0.4);
    expect(target.targetYaw).toBeCloseTo(Math.PI + 0.4);
    expect(target.targetX).toBeCloseTo(2.6);
    expect(target.targetZ).toBeCloseTo(-2.7);
  });

  it("holds forward-facing root heading for stationary side bends", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0.2, 0, -0.3],
      rootMotion: rootMotionFrame({
        headingYaw: -0.61,
        intent: {
          confidence: 0.99,
          headingDelta: 0,
          key: "root-stationary",
          label: "Stationary root",
          plantedFoot: "both",
          summary: "stationary",
          swingFoot: "none",
          travelDirection: "none",
          travelDistance: 0,
        },
      }),
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });

    expect(target.rootHeadingYaw).toBe(0);
    expect(target.targetYaw).toBe(Math.PI);
  });

  it("applies a confident cumulative heading when a slow turn never trips per-frame turn intent", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0.2, 0, -0.3],
      rootMotion: rootMotionFrame({
        headingYaw: 0.91,
        intent: {
          confidence: 0.99,
          headingDelta: 0.02,
          key: "root-stationary",
          label: "Stationary root",
          plantedFoot: "both",
          summary: "stationary",
          swingFoot: "none",
          travelDirection: "none",
          travelDistance: 0,
        },
      }),
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });

    expect(target.rootHeadingYaw).toBe(0.91);
    expect(target.targetYaw).toBeCloseTo(Math.PI + 0.91);
  });

  it("ignores image-space root travel while preserving root-motion intent responses", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0.2, 0, -0.3],
      rootMotion: rootMotionFrame({
        debug: {
          reasons: ["image fallback"],
          source: "image-landmarks",
        },
        intent: {
          confidence: 0.8,
          headingDelta: 0,
          key: "left-foot-release",
          label: "Left release",
          plantedFoot: "right",
          summary: "left released",
          swingFoot: "left",
          travelDirection: "forward",
          travelDistance: 0.2,
        },
        rootPosition: { x: 1.2, y: 0, z: 1.2 },
      }),
      rootOrientation: uprightRootOrientation,
      visualRootDrop: 0,
    });

    expect(target.rootHeadingYaw).toBe(0);
    expect(target.targetX).toBe(0.2);
    expect(target.targetZ).toBe(-0.3);
    expect(target.stepResponse.owner).toBe("step-response-left-release");
  });

  it("combines posture drop and jump response as one root application target", () => {
    const target = resolveMovementAvatarRootTarget({
      avatarBaseY: -2.8,
      avatarRootVisualLerp: 0.2,
      positionOffset: [0, 0, 0],
      rootMotion: rootMotionFrame({
        intent: {
          confidence: 1,
          headingDelta: 0,
          key: "jump-flight",
          label: "Jump flight",
          plantedFoot: "none",
          summary: "jump",
          swingFoot: "both",
          travelDirection: "none",
          travelDistance: 0.3,
        },
      }),
      rootOrientation: {
        ...uprightRootOrientation,
        heightLerp: 0.18,
        owner: "body-orientation-seated",
        shouldApplyHeight: true,
        targetHeightDrop: 0.72,
      },
      visualRootDrop: 0.25,
    });

    expect(target.targetHeightDrop).toBe(0.72);
    expect(target.targetJumpHeightOffset).toBeGreaterThan(0);
    expect(target.targetY).toBeCloseTo(-2.8 - 0.72 + target.targetJumpHeightOffset);
    expect(target.rootHeightLerp).toBe(target.jumpResponse.slerp);
  });
});
