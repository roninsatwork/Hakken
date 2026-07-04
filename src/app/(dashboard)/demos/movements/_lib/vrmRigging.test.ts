import { describe, expect, it } from "vitest";
import {
  createVrmImageSolverLandmarks,
  getVrmHandWristFallbackTarget,
  normalizeVrmLandmark,
  prepareVrmHandLandmarks,
  prepareVrmSolverInput,
  resolveVrmArmTargetLandmarks,
  resolveVrmHandRigOptions,
  resolveVrmHandRotationSpecs,
  resolveVrmHandRotationTargets,
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

  it("mirrors player display landmarks so source left drives avatar right", () => {
    const landmarks = makeLandmarks();
    landmarks[25] = { x: 0.25, y: 0.7, z: 0.01, visibility: 0.91 };
    landmarks[26] = { x: 0.75, y: 0.8, z: 0.02, visibility: 0.92 };

    const prepared = prepareVrmSolverInput({
      rawLandmarks: landmarks,
      payload: {
        hands: {
          left: { landmarks: [{ x: 0.2, y: 0.4, z: 0.1 }], worldLandmarks: [{ x: 0.3, y: 0.4, z: 0.1 }] },
          right: { landmarks: [{ x: 0.8, y: 0.4, z: 0.1 }], worldLandmarks: [{ x: 0.7, y: 0.4, z: 0.1 }] },
        },
        worldLandmarks: landmarks,
      },
      isPlayer: true,
      isPlaying: true,
      mirrorForDisplay: true,
    });

    expect(prepared.imageLandmarks[26]).toMatchObject({
      x: 0.75,
      y: 0.7,
      visibility: 0.91,
    });
    expect(prepared.imageLandmarks[25]).toMatchObject({
      x: 0.25,
      y: 0.8,
      visibility: 0.92,
    });
    expect(prepared.solverLandmarks[26]).toMatchObject({
      x: -0.25,
      y: 0.7,
      visibility: 0.91,
    });
    expect(prepared.rigHands?.right?.worldLandmarks?.[0]?.x).toBe(-0.3);
    expect(prepared.rigHands?.left?.worldLandmarks?.[0]?.x).toBe(-0.7);
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

  it("uses image-space solver landmarks for player arm targets", () => {
    const imageLandmarks = makeLandmarks().map((landmark, index) => normalizeVrmLandmark({
      ...landmark,
      x: index === 23 ? 0.4 : index === 24 ? 0.6 : landmark.x,
      z: 0.05,
    }));
    const solverLandmarks = imageLandmarks.map((landmark) => ({
      ...landmark,
      x: landmark.x + 10,
    }));

    const resolved = resolveVrmArmTargetLandmarks({
      imageLandmarks,
      isPlayer: true,
      solverLandmarks,
    });

    expect(resolved).not.toBe(solverLandmarks);
    expect(resolved[16]?.x).toBeCloseTo(0);
  });

  it("keeps prepared solver landmarks for recorded arm targets", () => {
    const imageLandmarks = makeLandmarks().map((landmark) => normalizeVrmLandmark(landmark));
    const solverLandmarks = imageLandmarks.map((landmark) => ({
      ...landmark,
      x: landmark.x + 10,
    }));

    const resolved = resolveVrmArmTargetLandmarks({
      imageLandmarks,
      isPlayer: false,
      solverLandmarks,
    });

    expect(resolved).toBe(solverLandmarks);
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

  it("resolves player and recorded hand rig options outside avatar bone application", () => {
    expect(resolveVrmHandRigOptions({ isPlayer: true })).toEqual({
      isPlayer: true,
      mirrorX: false,
      slerp: 0.85,
    });
    expect(resolveVrmHandRigOptions({ isPlayer: true, mirrorForDisplay: true })).toEqual({
      isPlayer: true,
      mirrorX: true,
      slerp: 0.85,
    });
    expect(resolveVrmHandRigOptions({ isPlayer: false })).toEqual({
      isPlayer: false,
      mirrorX: true,
      slerp: 0.55,
    });
  });

  it("resolves hand rotation specs outside avatar bone application", () => {
    const specs = resolveVrmHandRotationSpecs("left");

    expect(specs).toHaveLength(16);
    expect(specs[0]).toEqual({
      isThumb: false,
      isWrist: true,
      rigKey: "LeftWrist",
      shouldApply: false,
      vrmName: "leftHand",
    });
    expect(specs[1]).toEqual({
      isThumb: true,
      isWrist: false,
      rigKey: "LeftThumbProximal",
      shouldApply: true,
      vrmName: "leftThumbProximal",
    });
    expect(specs.at(-1)).toEqual({
      isThumb: false,
      isWrist: false,
      rigKey: "LeftLittleDistal",
      shouldApply: true,
      vrmName: "leftLittleDistal",
    });
    expect(resolveVrmHandRotationSpecs("right")[1]).toMatchObject({
      rigKey: "RightThumbProximal",
      vrmName: "rightThumbProximal",
    });
  });

  it("strengthens finger rotations while leaving wrist rotations unchanged for callers that keep wrist solving", () => {
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

  it("resolves hand rotation targets without wrist application details leaking into the renderer", () => {
    const targets = resolveVrmHandRotationTargets({
      isPlayer: true,
      rig: {
        LeftIndexProximal: { x: 0.2, y: -0.1, z: 0.3 },
        LeftThumbProximal: { x: 0.2, y: -0.1, z: 0.3 },
        LeftWrist: { x: 1, y: 1, z: 1 },
      },
      side: "left",
      slerp: 0.85,
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.rigKey)).toEqual([
      "LeftThumbProximal",
      "LeftIndexProximal",
    ]);
    expect(targets[0]).toMatchObject({
      rigKey: "LeftThumbProximal",
      slerp: 0.85,
      vrmName: "leftThumbProximal",
    });
    expect(targets[0].rotation.x).toBeCloseTo(0.243);
    expect(targets[0].rotation.y).toBeCloseTo(-0.1215);
    expect(targets[0].rotation.z).toBeCloseTo(0.3645);
    expect(targets[1]).toMatchObject({
      vrmName: "leftIndexProximal",
    });
    expect(targets[1].rotation.x).toBeCloseTo(0.27);
    expect(targets[1].rotation.y).toBeCloseTo(-0.135);
    expect(targets[1].rotation.z).toBeCloseTo(0.405);
  });
});
