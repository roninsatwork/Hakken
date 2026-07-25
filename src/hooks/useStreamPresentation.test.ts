import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STREAM_STALE_AFTER_MS } from "@/convex/streamingService";
import { STREAM_STALE_CHECK_INTERVAL_MS, useStreamPresentation } from "./useStreamPresentation";

describe("useStreamPresentation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a finished reply as complete and schedules no work", () => {
    const { result } = renderHook(() => useStreamPresentation({ isStreaming: false, streamStartedAt: 0 }));

    expect(result.current).toBe("complete");
    // A settled conversation must not sit re-rendering on a timer.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a live reply as streaming", () => {
    const startedAt = Date.now();
    const { result } = renderHook(() => useStreamPresentation({ isStreaming: true, streamStartedAt: startedAt }));

    expect(result.current).toBe("streaming");
  });

  it("resolves an abandoned reply to stalled without any other render", () => {
    // The whole point of ticking: nothing else re-renders this component, so
    // reading the clock during render would leave the caret blinking forever.
    const startedAt = Date.now() - (STREAM_STALE_AFTER_MS + 1000);
    const { result } = renderHook(() => useStreamPresentation({ isStreaming: true, streamStartedAt: startedAt }));

    // Wrapped in act so the state update from the timer is flushed.
    act(() => {
      vi.advanceTimersByTime(STREAM_STALE_CHECK_INTERVAL_MS + 1);
    });

    expect(result.current).toBe("stalled");
  });

  it("stops ticking once unmounted", () => {
    const { unmount } = renderHook(() => useStreamPresentation({ isStreaming: true, streamStartedAt: Date.now() }));

    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
