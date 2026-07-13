import { describe, expect, it } from "vitest";
import type { VrmMotionPayload, VrmPoseLandmark } from "../../_lib/vrmRigging";
import {
  REPLAY_THREE_PARTY_POSE_PAIRS,
  buildOppositePlayerImitationOracle,
  buildOppositePlayerRetargetSourceModelOracle,
} from "./replayThreePartyMirrorOracle";

function pose(): VrmPoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    visibility: 0.9,
    x: index / 100,
    y: index,
    z: -index,
  }));
}

describe("Replay three-party independent imitation oracle", () => {
  it("constructs the opposite anatomical player without using production mapping", () => {
    const instructor = pose();
    const opposite = buildOppositePlayerImitationOracle({ landmarks: instructor });
    const oppositeLandmarks = opposite.landmarks ?? [];

    expect(REPLAY_THREE_PARTY_POSE_PAIRS).toHaveLength(16);
    expect(oppositeLandmarks[0]).toEqual(instructor[0]);
    REPLAY_THREE_PARTY_POSE_PAIRS.forEach(([leftIndex, rightIndex]) => {
      expect(oppositeLandmarks[leftIndex]).toEqual({
        ...instructor[rightIndex],
        x: instructor[rightIndex]!.x,
      });
      expect(oppositeLandmarks[rightIndex]).toEqual({
        ...instructor[leftIndex],
        x: instructor[leftIndex]!.x,
      });
    });
    expect(oppositeLandmarks).not.toBe(instructor);
    expect(instructor[11]?.x).toBe(0.11);
  });

  it("swaps hand and asymmetric face ownership independently", () => {
    const instructor: VrmMotionPayload = {
      blendshapes: [
        { categoryName: "eyeBlinkLeft", displayName: "", index: 0, score: 0.8 },
        { categoryName: "eyeBlinkRight", displayName: "", index: 1, score: 0.2 },
      ],
      hands: {
        left: { landmarks: [{ x: 0.1, y: 0.2, z: 0 }] },
        right: { landmarks: [{ x: 0.9, y: 0.2, z: 0 }] },
      },
      landmarks: pose(),
    };
    const opposite = buildOppositePlayerImitationOracle(instructor);

    expect(opposite.hands?.left?.landmarks[0]?.x).toBeCloseTo(0.9);
    expect(opposite.hands?.right?.landmarks[0]?.x).toBeCloseTo(0.1);
    expect(opposite.blendshapes?.map((shape) => shape.categoryName)).toEqual([
      "eyeBlinkRight",
      "eyeBlinkLeft",
    ]);
  });

  it("derives the opposite player neutral model from the same selected instructor evidence", () => {
    const opposite = buildOppositePlayerRetargetSourceModelOracle({
      calibratedAt: 1,
      floorY: 0.9,
      hipCenter: { x: 0.45, y: 0.7, z: 0 },
      neutralKneeLift: { left: 0.1, right: 0.2 },
      quality: 0.9,
      segments: {
        leftUpperArm: { confidence: 0.8, direction: { x: -0.3, y: 0.9, z: 0.1 }, length: 1 },
        rightUpperArm: { confidence: 0.9, direction: { x: 0.2, y: 0.95, z: 0.05 }, length: 1.1 },
        spine: { confidence: 1, direction: { x: -0.15, y: -0.95, z: -0.25 }, length: 1.2 },
      },
      shoulderCenter: { x: 0.46, y: 0.4, z: 0 },
      space: "world",
      torsoHeight: 0.3,
      worldTorsoHeight: 0.5,
    });

    expect(opposite).toMatchObject({
      hipCenter: { x: 0.55 },
      neutralKneeLift: { left: 0.2, right: 0.1 },
      shoulderCenter: { x: 0.54 },
      segments: {
        leftUpperArm: { confidence: 0.9, direction: { x: -0.2, y: 0.95, z: 0.05 } },
        rightUpperArm: { confidence: 0.8, direction: { x: 0.3, y: 0.9, z: 0.1 } },
        spine: { direction: { x: 0.15, y: -0.95, z: -0.25 } },
      },
    });
  });
});
