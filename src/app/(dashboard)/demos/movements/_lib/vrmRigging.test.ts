import { describe, expect, it } from "vitest";
import {
  createVrmImageSolverLandmarks,
  getVrmHandWristFallbackTarget,
  normalizeVrmLandmark,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
  strengthenVrmHandRotation,
} from "./vrmRigging";
import type { VrmPoseLandmark } from "./vrmRigging";

const makeLandmarks = (): VrmPoseLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: index / 32,
    y: 0.5,
    visibility: 0.9,
  }));

describe("vrmRigging", () => {
  it("normalizes legacy landmarks without depth", () => {
    expect(normalizeVrmLandmark({ x: 0.2, y: 0.4 })).toMatchObject({
      x: 0.2,
      y: 0.4,
      z: 0,
      visibility: 0.8,
    });
  });

  it("forces instructor standby landmarks to invisible", () => {
    const prepared = prepareVrmSolverInput({
      rawLandmarks: makeLandmarks(),
      payload: null,
      isPlayer: false,
      isPlaying: false,
    });

    expect(prepared.forceStandby).toBe(true);
    expect(prepared.imageLandmarks.every((landmark) => landmark.visibility === 0)).toBe(true);
  });

  it("mirrors instructor hands and blendshape side names", () => {
    const prepared = prepareVrmSolverInput({
      rawLandmarks: makeLandmarks(),
      payload: {
        hands: {
          left: { landmarks: [], worldLandmarks: [{ x: 0.3, y: 0.4, z: 0.1 }] },
          right: { landmarks: [], worldLandmarks: [{ x: 0.7, y: 0.4, z: 0.1 }] },
        },
        blendshapes: [
          { index: 1, categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", score: 0.8 },
          { index: 2, categoryName: "mouthSmileRight", displayName: "mouthSmileRight", score: 0.4 },
        ],
      },
      isPlayer: false,
      isPlaying: true,
    });

    expect(prepared.rigHands?.right?.worldLandmarks?.[0]?.x).toBe(-0.3);
    expect(prepared.rigHands?.left?.worldLandmarks?.[0]?.x).toBe(-0.7);
    expect(prepared.rigBlendshapes?.map((blendshape) => blendshape.categoryName)).toEqual([
      "eyeBlinkRight",
      "mouthSmileLeft",
    ]);
  });

  it("creates image-space solver landmarks around the hips", () => {
    const landmarks = makeLandmarks().map((landmark, index) => ({
      ...landmark,
      y: index === 23 || index === 24 ? 0.5 : landmark.y,
      z: 0.05,
    }));

    landmarks[23] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[24] = { x: 0.6, y: 0.5, z: 0, visibility: 0.8 };
    landmarks[16] = { x: 0.8, y: 0.2, z: 0.1, visibility: 0.7 };

    const prepared = createVrmImageSolverLandmarks(
      landmarks.map((landmark) => normalizeVrmLandmark(landmark)),
    );

    expect(prepared[16]).toMatchObject({
      x: 0.9000000000000001,
      y: -0.8999999999999999,
      z: 0.30000000000000004,
      visibility: 0.7,
    });
  });

  it("uses the tracked hand wrist as a forearm target in image solver space", () => {
    const landmarks = makeLandmarks();
    landmarks[23] = { x: 0.4, y: 0.5, visibility: 0.9 };
    landmarks[24] = { x: 0.6, y: 0.5, visibility: 0.8 };

    const target = getVrmHandWristFallbackTarget(
      { landmarks: [{ x: 0.7, y: 0.3, z: 0.05 }] },
      landmarks.map((landmark) => normalizeVrmLandmark(landmark)),
    );

    expect(target).toMatchObject({
      x: 0.5999999999999999,
      y: -0.6000000000000001,
      z: 0.15000000000000002,
      visibility: 0.95,
    });
  });

  it("prepares hand landmarks with optional x mirroring", () => {
    const prepared = prepareVrmHandLandmarks({
      landmarks: [
        { x: 0.2, y: 0.3, z: 0.1 },
        { x: 0.8, y: 0.4, z: 0.2 },
      ],
    }, { mirrorX: true });

    expect(prepared.map((landmark) => landmark.x)).toEqual([0.8, 0.19999999999999996]);
  });

  it("strengthens finger rotations while leaving wrist rotations untouched", () => {
    const wrist = strengthenVrmHandRotation(
      { x: 0.2, y: -0.1, z: 0.3 },
      { isPlayer: true, isWrist: true, isThumb: false },
    );
    const finger = strengthenVrmHandRotation(
      { x: 0.2, y: -0.1, z: 0.3 },
      { isPlayer: true, isWrist: false, isThumb: false },
    );

    expect(wrist).toEqual({ x: 0.2, y: -0.1, z: 0.3 });
    expect(finger).toMatchObject({ x: 0.27, y: -0.135, z: 0.405 });
  });
});
