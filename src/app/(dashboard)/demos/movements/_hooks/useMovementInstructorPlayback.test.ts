import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildInstructorRetargetAnalysis,
  buildInstructorRetargetSourceModel,
  useMovementInstructorPlayback,
} from "./useMovementInstructorPlayback";
import type { MovementInstructorMotionFrame } from "./useMovementInstructorPlayback";

const makePose = () =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
  const pose = makePose();
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.9 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.9 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.9 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.9 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.9 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.9 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.9 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.9 };
  return pose;
}

describe("buildInstructorRetargetSourceModel", () => {
  it("chooses the most neutral knee baseline instead of the first valid frame", () => {
    const crouchedPose = withCorePose();
    crouchedPose[25] = { ...crouchedPose[25]!, y: 0.68 };
    crouchedPose[26] = { ...crouchedPose[26]!, y: 0.68 };

    const uprightPose = withCorePose();
    const model = buildInstructorRetargetSourceModel([
      { landmarks: crouchedPose },
      { landmarks: uprightPose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    if (!model) throw new Error("Expected an instructor retarget source model.");

    expect(model.calibratedAt).toBe(1);
    expect(model.neutralKneeLift.left).toBe(0);
    expect(model.neutralKneeLift.right).toBe(0);
  });

  it("chooses an upright spine baseline over a side-bent frame", () => {
    const sideBentPose = withCorePose();
    sideBentPose[0] = { ...sideBentPose[0]!, x: 0.66 };
    sideBentPose[7] = { ...sideBentPose[7]!, x: 0.62 };
    sideBentPose[8] = { ...sideBentPose[8]!, x: 0.7 };
    sideBentPose[11] = { ...sideBentPose[11]!, x: 0.54 };
    sideBentPose[12] = { ...sideBentPose[12]!, x: 0.78 };

    const uprightPose = withCorePose();
    const model = buildInstructorRetargetSourceModel([
      { landmarks: sideBentPose },
      { landmarks: uprightPose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    if (!model) throw new Error("Expected an instructor retarget source model.");

    expect(model.calibratedAt).toBe(1);
    expect(Math.abs(model.shoulderCenter.x - model.hipCenter.x)).toBeLessThan(0.02);
  });

  it("does not choose a forward hinge as the neutral world-torso baseline", () => {
    const hingedPose = withCorePose();
    const uprightPose = withCorePose();
    const hingedWorldPose = structuredClone(hingedPose);
    const uprightWorldPose = structuredClone(uprightPose);

    [11, 12].forEach((index) => {
      hingedWorldPose[index] = {
        ...hingedWorldPose[index]!,
        y: -0.18,
        z: 0.34,
      };
      uprightWorldPose[index] = {
        ...uprightWorldPose[index]!,
        y: -0.42,
        z: 0.03,
      };
    });
    [23, 24].forEach((index) => {
      hingedWorldPose[index] = {
        ...hingedWorldPose[index]!,
        y: 0,
        z: 0,
      };
      uprightWorldPose[index] = {
        ...uprightWorldPose[index]!,
        y: 0,
        z: 0,
      };
    });

    const model = buildInstructorRetargetSourceModel([
      { landmarks: hingedPose, worldLandmarks: hingedWorldPose },
      { landmarks: uprightPose, worldLandmarks: uprightWorldPose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    expect(model?.calibratedAt).toBe(1);
    expect(model?.semanticNeutral?.torsoDirection?.y).toBeGreaterThan(0.98);
  });

  it("reflects front-facing instructor coordinates without swapping anatomical sides", () => {
    const pose = withCorePose();
    pose[23] = { ...pose[23]!, x: 0.58 };
    pose[24] = { ...pose[24]!, x: 0.42 };
    pose[25] = { ...pose[25]!, x: 0.56 };
    pose[26] = { ...pose[26]!, x: 0.44 };
    pose[27] = { ...pose[27]!, x: 0.55 };
    pose[28] = { ...pose[28]!, x: 0.45 };
    pose[31] = { ...pose[31]!, x: 0.54 };
    pose[32] = { ...pose[32]!, x: 0.46 };

    const model = buildInstructorRetargetSourceModel([
      { landmarks: pose },
    ] satisfies MovementInstructorMotionFrame[]);

    expect(model).not.toBeNull();
    expect(model?.segments.leftThigh?.direction.x).toBeGreaterThan(0);
    expect(model?.segments.rightThigh?.direction.x).toBeLessThan(0);
  });

  it("finds the strongest single-knee lift frame in a recording", () => {
    const uprightPose = withCorePose();
    const squatPose = withCorePose();
    squatPose[23] = { ...squatPose[23]!, y: 0.8 };
    squatPose[24] = { ...squatPose[24]!, y: 0.8 };
    squatPose[25] = { ...squatPose[25]!, y: 0.74 };
    squatPose[26] = { ...squatPose[26]!, y: 0.74 };

    const kneeLiftPose = withCorePose();
    kneeLiftPose[25] = { ...kneeLiftPose[25]!, y: 0.54 };
    kneeLiftPose[27] = { ...kneeLiftPose[27]!, y: 0.68 };
    kneeLiftPose[29] = { ...kneeLiftPose[29]!, y: 0.7 };
    kneeLiftPose[31] = { ...kneeLiftPose[31]!, y: 0.7 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: squatPose },
      { landmarks: kneeLiftPose },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(1);
    expect(analysis.peakSquat?.balancedPlantedSquatDepth).toBeGreaterThan(0.5);
    expect(analysis.peakSingleKneeLift?.frameIndex).toBe(2);
    expect(analysis.peakSingleKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakLeftKneeLift?.leftKneeLift).toBeGreaterThan(0.6);
    expect(analysis.peakRightKneeLift?.rightKneeLift).toBeLessThan(0.2);
  });

  it("drives planted full-body squat only on the recorded squat frame", () => {
    const uprightPose = withCorePose();
    const fullBodySquatPose = withCorePose();
    fullBodySquatPose[23] = { ...fullBodySquatPose[23]!, y: 0.82 };
    fullBodySquatPose[24] = { ...fullBodySquatPose[24]!, y: 0.82 };
    fullBodySquatPose[25] = { ...fullBodySquatPose[25]!, y: 0.74 };
    fullBodySquatPose[26] = { ...fullBodySquatPose[26]!, y: 0.74 };

    const leftKneeLiftPose = withCorePose();
    leftKneeLiftPose[25] = { ...leftKneeLiftPose[25]!, y: 0.54 };
    leftKneeLiftPose[27] = { ...leftKneeLiftPose[27]!, y: 0.68 };
    leftKneeLiftPose[29] = { ...leftKneeLiftPose[29]!, y: 0.7 };
    leftKneeLiftPose[31] = { ...leftKneeLiftPose[31]!, y: 0.7 };

    const rightKneeLiftPose = withCorePose();
    rightKneeLiftPose[26] = { ...rightKneeLiftPose[26]!, y: 0.54 };
    rightKneeLiftPose[28] = { ...rightKneeLiftPose[28]!, y: 0.68 };
    rightKneeLiftPose[30] = { ...rightKneeLiftPose[30]!, y: 0.7 };
    rightKneeLiftPose[32] = { ...rightKneeLiftPose[32]!, y: 0.7 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: fullBodySquatPose },
      { landmarks: leftKneeLiftPose },
      { landmarks: rightKneeLiftPose },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(1);
    expect(analysis.peakSquat?.balancedPlantedSquatDepth).toBeGreaterThan(0.75);
    expect(analysis.peakSingleKneeLift?.frameIndex).not.toBe(1);
    expect(analysis.peakSingleKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakLeftKneeLift?.balancedPlantedSquatDepth).toBe(0);
    expect(analysis.peakRightKneeLift?.balancedPlantedSquatDepth).toBe(0);
  });

  it("ignores weak startup frames when choosing peak squat", () => {
    const uprightPose = withCorePose();
    const weakStartupSquat = withCorePose();
    weakStartupSquat[23] = { ...weakStartupSquat[23]!, y: 0.88, visibility: 0.42 };
    weakStartupSquat[24] = { ...weakStartupSquat[24]!, y: 0.88, visibility: 0.42 };
    weakStartupSquat[25] = { ...weakStartupSquat[25]!, y: 0.84, visibility: 0.42 };
    weakStartupSquat[26] = { ...weakStartupSquat[26]!, y: 0.84, visibility: 0.42 };
    weakStartupSquat[27] = { ...weakStartupSquat[27]!, visibility: 0.42 };
    weakStartupSquat[28] = { ...weakStartupSquat[28]!, visibility: 0.42 };
    weakStartupSquat[31] = { ...weakStartupSquat[31]!, visibility: 0.42 };
    weakStartupSquat[32] = { ...weakStartupSquat[32]!, visibility: 0.42 };

    const validSquat = withCorePose();
    validSquat[23] = { ...validSquat[23]!, y: 0.8 };
    validSquat[24] = { ...validSquat[24]!, y: 0.8 };
    validSquat[25] = { ...validSquat[25]!, y: 0.74 };
    validSquat[26] = { ...validSquat[26]!, y: 0.74 };

    const frames = [
      { landmarks: uprightPose },
      { landmarks: weakStartupSquat },
      { landmarks: validSquat },
    ] satisfies MovementInstructorMotionFrame[];
    const sourceModel = buildInstructorRetargetSourceModel(frames);
    const analysis = buildInstructorRetargetAnalysis(frames, sourceModel);

    expect(analysis.peakSquat?.frameIndex).toBe(2);
    expect(analysis.peakSquat?.sourceQuality).toBeGreaterThan(0.7);
  });
});

describe("useMovementInstructorPlayback wall-clock playback", () => {
  it("advances by recorded timestamps, not by one frame per render tick", () => {
    // Recorded at ~13.3fps (75ms cadence) — a render loop calling advance at
    // 60Hz must NOT step one frame per call.
    const frames = Array.from({ length: 20 }, (_, index) => ({
      timestamp: index * 75,
      landmarks: withCorePose(),
    })) satisfies MovementInstructorMotionFrame[];
    let nowMs = 1000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    try {
      const { result } = renderHook(() => useMovementInstructorPlayback(frames));

      // The first call anchors the clock; four more 60Hz ticks accumulate
      // ~67ms of wall time — the 75ms-cadence recording stays on frame 0.
      act(() => {
        expect(result.current.advanceInstructorFrame().frameIndex).toBe(0);
        for (let tick = 0; tick < 4; tick++) {
          nowMs += 1000 / 60;
          expect(result.current.advanceInstructorFrame().frameIndex).toBe(0);
        }
      });
      // Crossing 75ms of accumulated playback time reaches frame 1.
      act(() => {
        nowMs += 1000 / 60;
        expect(result.current.advanceInstructorFrame().frameIndex).toBe(1);
      });
      // A long stall (e.g. tab throttling or pause) is capped at 250ms of
      // playback progress, never a fast-forward across the whole recording.
      act(() => {
        nowMs += 10_000;
        const advance = result.current.advanceInstructorFrame();
        expect(advance.frameIndex).toBeLessThanOrEqual(4);
        expect(advance.frameIndex).toBeLessThan(frames.length - 1);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("resyncs the playback clock when scrubbed to a frame", () => {
    const frames = [0, 75, 150, 225].map((timestamp) => ({
      timestamp,
      landmarks: withCorePose(),
    })) satisfies MovementInstructorMotionFrame[];
    let nowMs = 5000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    try {
      const { result } = renderHook(() => useMovementInstructorPlayback(frames));

      act(() => {
        result.current.setInstructorFrame(2);
      });
      // Immediately after a scrub, playback holds the scrubbed frame...
      act(() => {
        nowMs += 1000 / 60;
        expect(result.current.advanceInstructorFrame().frameIndex).toBe(2);
      });
      // ...and advances only after the next recorded interval elapses.
      act(() => {
        for (let tick = 0; tick < 5; tick++) nowMs += 1000 / 60;
        expect(result.current.advanceInstructorFrame().frameIndex).toBe(3);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("useMovementInstructorPlayback source frame synchronisation", () => {
  it("holds and advances against the controlled recorded Game frame", () => {
    const sourceFrameIndexRef = { current: { frameIndex: 0 } };
    const frames = [0, 1, 2].map((capturedAt) => ({
      capturedAt,
      landmarks: withCorePose(),
    })) satisfies MovementInstructorMotionFrame[];
    const { result } = renderHook(() => useMovementInstructorPlayback(
      frames,
      { sourceFrameIndexRef },
    ));

    act(() => {
      expect(result.current.advanceInstructorFrame().frameIndex).toBe(0);
    });
    sourceFrameIndexRef.current.frameIndex = 2;
    act(() => {
      expect(result.current.advanceInstructorFrame().frameIndex).toBe(2);
    });
    expect(result.current.instructorCurrentLmRef.current).toEqual({
      ...frames[2],
      landmarks: frames[2]?.landmarks?.map((landmark) => ({ ...landmark, z: landmark.z ?? 0 })),
      worldLandmarks: undefined,
      hands: undefined,
    });
    act(() => {
      expect(result.current.advanceInstructorFrame().status).toBe("complete");
    });
  });
});
