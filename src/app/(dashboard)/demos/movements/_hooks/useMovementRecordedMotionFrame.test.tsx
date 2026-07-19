import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "../_lib/movementAvatarProofFixtures";
import type { MovementLiveInitialFrame } from "./useMovementLiveMotionFrame";
import { useMovementRecordedMotionFrame } from "./useMovementRecordedMotionFrame";

describe("useMovementRecordedMotionFrame initial sequence", () => {
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

  it("builds a renderer warm-up history and does not consume setup frames twice", () => {
    const frames = [0, 1, 2].map((index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
      frameId: `recording:${index}`,
    }));
    const instructorFrameRef = { current: frames[0] };
    const initialFrameSequenceRef = { current: [] as MovementLiveInitialFrame[] };
    const { result } = renderHook(() => useMovementRecordedMotionFrame({
      initialFrameSequenceRef,
      initialMotionSequence: frames.slice(0, 2),
      instructorFrameRef,
      isPlaying: true,
      retargetSourceModel: null,
    }));

    expect(initialFrameSequenceRef.current).toHaveLength(2);
    expect(initialFrameSequenceRef.current.map((frame) => frame.motionRef)).toEqual(
      frames.slice(0, 2),
    );
    expect(result.current.current?.source.frameId).toBe("recording:1");

    act(() => vi.advanceTimersByTime(5));
    expect(result.current.current?.source.frameId).toBe("recording:1");

    instructorFrameRef.current = frames[2];
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.current?.source.frameId).toBe("recording:2");
  });

  it("keeps recorded history intact when playback changes from setup to playing", () => {
    const frames = [0, 1].map((index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
      frameId: `recording:${index}`,
    }));
    const instructorFrameRef = { current: frames[0] };
    const initialFrameSequenceRef = { current: [] as MovementLiveInitialFrame[] };
    const { rerender } = renderHook(({ isPlaying }) => useMovementRecordedMotionFrame({
      initialFrameSequenceRef,
      initialMotionSequence: frames,
      instructorFrameRef,
      isPlaying,
      retargetSourceModel: null,
    }), { initialProps: { isPlaying: false } });
    const setupHistory = initialFrameSequenceRef.current;

    rerender({ isPlaying: true });
    act(() => vi.advanceTimersByTime(2));

    expect(initialFrameSequenceRef.current).toBe(setupHistory);
    expect(initialFrameSequenceRef.current).toHaveLength(2);
  });

  it("processes every controlled instructor frame when the source index jumps", () => {
    const frames = [0, 1, 2].map((index) => ({
      ...makeMovementAvatarProofMotionPayload("standing"),
      capturedAt: index,
      frameId: `recording:${index}`,
    }));
    const controlledFrameIndexRef = { current: { frameIndex: 0 } };
    const initialFrameSequenceRef = { current: [] as MovementLiveInitialFrame[] };
    const { result } = renderHook(() => useMovementRecordedMotionFrame({
      controlledFrameIndexRef,
      controlledMotionSequence: frames,
      initialFrameSequenceRef,
      initialMotionSequence: frames.slice(0, 1),
      instructorFrameRef: { current: frames[0] },
      isPlaying: true,
      retargetSourceModel: null,
    }));

    controlledFrameIndexRef.current.frameIndex = 2;
    act(() => vi.advanceTimersByTime(2));

    expect(initialFrameSequenceRef.current.map((frame) => frame.motionRef)).toEqual(frames);
    expect(result.current.current?.source.frameId).toBe("recording:2");
  });
});
