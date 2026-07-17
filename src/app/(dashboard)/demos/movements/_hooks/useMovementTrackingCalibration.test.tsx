import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMovementTrackingCalibration } from "./useMovementTrackingCalibration";
import type { VrmMotionRef, VrmPoseLandmark } from "../_lib/vrmRigging";

const makePose = (visibility = 0.9): VrmPoseLandmark[] => {
  const pose = Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility,
  }));

  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility };

  return pose;
};

function installAnimationFrameMock() {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    return window.setTimeout(() => {
      now += 16;
      callback(now);
    }, 0);
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
}

describe("useMovementTrackingCalibration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installAnimationFrameMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds calibration after enough high-quality samples", () => {
    const playerLiveLmRef = {
      current: { landmarks: makePose(), faceLandmarks: null },
    } as RefObject<VrmMotionRef>;

    const { result } = renderHook(() =>
      useMovementTrackingCalibration({ isVisionReady: true, playerLiveLmRef }),
    );

    act(() => result.current.startCalibration());

    expect(result.current.isCalibrating).toBe(true);
    expect(result.current.calibrationStatus).toBe("Get ready");
    expect(result.current.calibrationCountdownSeconds).toBe(3);
    expect(result.current.calibrationSampleCount).toBe(0);

    act(() => vi.runAllTimers());

    expect(result.current.isCalibrated).toBe(true);
    expect(result.current.calibrationStatus).toBe("Calibrated");
    expect(result.current.calibrationCountdownSeconds).toBe(0);
    expect(result.current.calibrationProgress).toBe(100);
    expect(result.current.calibrationSampleCount).toBeGreaterThanOrEqual(60);
    expect(result.current.calibration?.quality).toBeGreaterThan(0.8);
    expect(result.current.retargetSourceModel?.quality).toBeGreaterThan(0.8);
    expect(result.current.retargetSourceModel?.segments.leftThigh?.confidence).toBeGreaterThan(0.7);
  });

  it("rejects calibration when tracking confidence is weak", () => {
    const playerLiveLmRef = {
      current: { landmarks: makePose(0.1), faceLandmarks: null },
    } as RefObject<VrmMotionRef>;

    const { result } = renderHook(() =>
      useMovementTrackingCalibration({ isVisionReady: true, playerLiveLmRef }),
    );

    act(() => result.current.startCalibration());
    act(() => vi.runAllTimers());

    expect(result.current.isCalibrated).toBe(false);
    expect(result.current.calibrationStatus).toBe("Needs stronger tracking");
    expect(result.current.retargetSourceModel).toBeNull();
    expect(result.current.calibrationProgress).toBe(100);
    expect(result.current.calibrationSampleCount).toBe(0);
  });

  it("does not start calibration until vision is ready", () => {
    const playerLiveLmRef = {
      current: { landmarks: makePose(), faceLandmarks: null },
    } as RefObject<VrmMotionRef>;

    const { result } = renderHook(() =>
      useMovementTrackingCalibration({ isVisionReady: false, playerLiveLmRef }),
    );

    act(() => result.current.startCalibration());

    expect(result.current.isCalibrating).toBe(false);
    expect(result.current.calibrationStatus).toBe("Waiting for vision");
    expect(result.current.calibrationProgress).toBe(0);
  });

  it("allows calibration to be skipped for manual tuning", () => {
    const playerLiveLmRef = {
      current: { landmarks: makePose(0.1), faceLandmarks: null },
    } as RefObject<VrmMotionRef>;

    const { result } = renderHook(() =>
      useMovementTrackingCalibration({ isVisionReady: true, playerLiveLmRef }),
    );

    act(() => result.current.skipCalibration());

    expect(result.current.isCalibrated).toBe(false);
    expect(result.current.isCalibrationSkipped).toBe(true);
    expect(result.current.calibrationStatus).toBe("Skipped calibration");
    expect(result.current.retargetSourceModel).toBeNull();

    act(() => result.current.resetCalibration());

    expect(result.current.isCalibrationSkipped).toBe(false);
    expect(result.current.calibrationStatus).toBe("Calibration needed");
  });
});
