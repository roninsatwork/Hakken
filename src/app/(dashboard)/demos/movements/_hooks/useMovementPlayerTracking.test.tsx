import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import type Webcam from "react-webcam";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "../_lib/movementAvatarProofFixtures";
import { useMovementLivePlayerSetup } from "./useMovementLivePlayerSetup";
import {
  createMovementRecordedSourcePlaybackState,
  useMovementPlayerTracking,
  type MovementPlayerMotionPayload,
} from "./useMovementPlayerTracking";

describe("useMovementPlayerTracking recorded source boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 1)
    ));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("streams the recorded setup prefix through tracking before automatic Game setup", () => {
    const frames: MovementPlayerMotionPayload[] = Array.from({ length: 61 }, (_, index) => ({
      ...makeMovementAvatarProofMotionPayload(index === 60 ? "left-leg-out-45" : "standing"),
      capturedAt: index,
    }));
    const onBodyTracked = vi.fn();
    const { result } = renderHook(() => {
      const trackingRef = useMovementPlayerTracking({
        faceLandmarker: null,
        handLandmarker: null,
        onBodyTracked,
        poseLandmarker: null,
        recordedSourceSequence: frames,
        webcamRef: { current: null } as RefObject<Webcam | null>,
      });
      const setup = useMovementLivePlayerSetup({
        isVisionReady: true,
        playerLiveLmRef: trackingRef,
      });
      return { setup, trackingRef };
    });

    for (let index = 0; index < 400; index += 1) {
      act(() => vi.runOnlyPendingTimers());
    }

    expect(result.current.setup?.provenance).toMatchObject({
      frameLimit: 59,
      sampleLimit: 12,
    });
    expect(result.current.trackingRef.current?.capturedAt).toBe(60);
    expect(onBodyTracked).toHaveBeenCalled();
  });

  it("holds after setup and processes each remaining frame once at recorded source time", () => {
    const frames: MovementPlayerMotionPayload[] = [0, 20, 70, 100].map((capturedAt) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt,
    }));
    const controlRef = { current: { isCheckingStart: false, isPlaying: false } };
    const stateRef = { current: createMovementRecordedSourcePlaybackState() };
    const { result } = renderHook(() => useMovementPlayerTracking({
      faceLandmarker: null,
      handLandmarker: null,
      poseLandmarker: null,
      recordedSourcePlayback: {
        controlRef,
        fallbackFps: 30,
        setupFrameCount: 2,
        stateRef,
      },
      recordedSourceSequence: frames,
      webcamRef: { current: null } as RefObject<Webcam | null>,
    }));

    act(() => vi.advanceTimersByTime(20));
    expect(stateRef.current).toMatchObject({
      frameIndex: 1,
      phase: "ready",
      processedFrameIndexes: [0, 1],
    });

    act(() => vi.advanceTimersByTime(20));
    expect(result.current.current?.capturedAt).toBe(20);

    controlRef.current.isPlaying = true;
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(49));
    expect(stateRef.current.frameIndex).toBe(1);
    act(() => vi.advanceTimersByTime(1));
    expect(stateRef.current.frameIndex).toBe(2);

    controlRef.current.isPlaying = false;
    controlRef.current.isCheckingStart = true;
    act(() => vi.advanceTimersByTime(30));
    expect(stateRef.current).toMatchObject({ frameIndex: 2, phase: "paused" });

    controlRef.current.isCheckingStart = false;
    controlRef.current.isPlaying = true;
    act(() => vi.advanceTimersByTime(31));
    expect(stateRef.current).toMatchObject({
      frameIndex: 3,
      phase: "complete",
      processedFrameIndexes: [0, 1, 2, 3],
    });
  });

  it("does not advance an active source frame until mounted rendering acknowledges it", () => {
    const frames: MovementPlayerMotionPayload[] = [0, 20, 40].map((capturedAt) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt,
    }));
    const controlRef = { current: { isPlaying: true } };
    const renderedFrameIndexRef = { current: -1 };
    const stateRef = { current: createMovementRecordedSourcePlaybackState() };
    renderHook(() => useMovementPlayerTracking({
      faceLandmarker: null,
      handLandmarker: null,
      poseLandmarker: null,
      recordedSourcePlayback: {
        controlRef,
        renderedFrameIndexRef,
        setupFrameCount: 1,
        stateRef,
      },
      recordedSourceSequence: frames,
      webcamRef: { current: null } as RefObject<Webcam | null>,
    }));

    act(() => vi.advanceTimersByTime(21));
    expect(stateRef.current.frameIndex).toBe(1);
    act(() => vi.advanceTimersByTime(100));
    expect(stateRef.current.frameIndex).toBe(1);

    renderedFrameIndexRef.current = 1;
    act(() => vi.advanceTimersByTime(21));
    expect(stateRef.current).toMatchObject({ frameIndex: 2, phase: "playing" });
    renderedFrameIndexRef.current = 2;
    act(() => vi.advanceTimersByTime(1));
    expect(stateRef.current.phase).toBe("complete");
  });

  it("continues chronological frames during the normal Game fresh-frame check", () => {
    const frames: MovementPlayerMotionPayload[] = [0, 20, 40, 60, 80].map((capturedAt) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt,
    }));
    const controlRef = { current: { isCheckingStart: false, isPlaying: false } };
    const motionFrameIndexRef = { current: -1 };
    const renderedFrameIndexRef = { current: -1 };
    const stateRef = { current: createMovementRecordedSourcePlaybackState() };
    renderHook(() => useMovementPlayerTracking({
      faceLandmarker: null,
      handLandmarker: null,
      poseLandmarker: null,
      recordedSourcePlayback: {
        controlRef,
        motionFrameIndexRef,
        renderedFrameIndexRef,
        setupFrameCount: 2,
        stateRef,
      },
      recordedSourceSequence: frames,
      webcamRef: { current: null } as RefObject<Webcam | null>,
    }));

    act(() => vi.advanceTimersByTime(21));
    expect(stateRef.current).toMatchObject({ frameIndex: 1, phase: "ready" });

    controlRef.current.isCheckingStart = true;
    act(() => vi.advanceTimersByTime(21));
    expect(stateRef.current).toMatchObject({
      frameIndex: 2,
      phase: "checking-start",
      processedFrameIndexes: [0, 1, 2],
    });
    act(() => vi.advanceTimersByTime(50));
    expect(stateRef.current.frameIndex).toBe(2);

    motionFrameIndexRef.current = 2;
    controlRef.current.isCheckingStart = false;
    controlRef.current.isPlaying = true;
    act(() => vi.advanceTimersByTime(1));
    expect(stateRef.current.activeFrameStartIndex).toBe(3);
    act(() => vi.advanceTimersByTime(20));
    expect(stateRef.current).toMatchObject({ frameIndex: 3, phase: "playing" });

    renderedFrameIndexRef.current = 3;
    act(() => vi.advanceTimersByTime(21));
    expect(stateRef.current.frameIndex).toBe(4);
    renderedFrameIndexRef.current = 4;
    act(() => vi.advanceTimersByTime(1));
    expect(stateRef.current).toMatchObject({
      activeFrameStartIndex: 3,
      phase: "complete",
      processedFrameIndexes: [0, 1, 2, 3, 4],
    });
  });
});
