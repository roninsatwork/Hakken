import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "../_lib/movementAvatarProofFixtures";
import {
  useMovementLiveMotionFrame,
  type MovementLiveMotionFrameProcessingDebug,
} from "./useMovementLiveMotionFrame";

describe("useMovementLiveMotionFrame initial sequence", () => {
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

  it("does not consume canonical setup-prefix frames a second time from the live ref", () => {
    const frames = [0, 1, 2].map((index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
      frameId: `recording:${index}`,
    }));
    const playerLiveLmRef = { current: frames[0] };
    const debugProcessingRef = {
      current: {
        effectRunCount: 0,
        processedFrameIds: [],
        processedFrames: [],
      } satisfies MovementLiveMotionFrameProcessingDebug,
    };
    const { result } = renderHook(() => useMovementLiveMotionFrame({
      calibration: null,
      debugProcessingRef,
      initialMotionSequence: frames.slice(0, 2),
      isPlaying: true,
      playerLiveLmRef,
      retargetSourceModel: null,
    }));

    act(() => vi.advanceTimersByTime(5));
    expect(debugProcessingRef.current.processedFrameIds).toEqual([
      "recording:0",
      "recording:1",
    ]);
    expect(result.current.current).not.toBeNull();

    playerLiveLmRef.current = frames[2];
    act(() => vi.advanceTimersByTime(2));
    expect(debugProcessingRef.current.processedFrameIds).toEqual([
      "recording:0",
      "recording:1",
      "recording:2",
    ]);
    expect(debugProcessingRef.current.processedFrames).toHaveLength(3);
  });

  it("retains pre-start source frames for mounted Game renderer warm-up only while requested", () => {
    const frames = [0, 1, 2, 3].map((index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
      frameId: `recording:${index}`,
    }));
    const playerLiveLmRef = { current: frames[1] };
    const collectInitialFramesRef = { current: true };
    const initialFrameSequenceRef = { current: [] as Array<{
      motionFrame: NonNullable<ReturnType<typeof useMovementLiveMotionFrame>["current"]>;
      motionRef: (typeof frames)[number];
    }> };
    renderHook(() => useMovementLiveMotionFrame({
      calibration: null,
      collectInitialFramesRef,
      initialFrameSequenceRef,
      initialMotionSequence: frames.slice(0, 2),
      isPlaying: true,
      playerLiveLmRef,
      retargetSourceModel: null,
    }));

    expect(initialFrameSequenceRef.current.map((frame) => frame.motionRef.frameId)).toEqual([
      "recording:0",
      "recording:1",
    ]);

    playerLiveLmRef.current = frames[2];
    act(() => vi.advanceTimersByTime(2));
    expect(initialFrameSequenceRef.current.map((frame) => frame.motionRef.frameId)).toEqual([
      "recording:0",
      "recording:1",
      "recording:2",
    ]);

    collectInitialFramesRef.current = false;
    playerLiveLmRef.current = frames[3];
    act(() => vi.advanceTimersByTime(2));
    expect(initialFrameSequenceRef.current.map((frame) => frame.motionRef.frameId)).toEqual([
      "recording:0",
      "recording:1",
      "recording:2",
    ]);
  });
});
