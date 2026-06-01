import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useDebounce from "./useDebounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the previous value until the delay elapses", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: "initial", delay: 300 },
    });

    expect(result.current).toBe("initial");

    rerender({ value: "next", delay: 300 });

    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe("initial");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe("next");
  });

  it("clears stale timers when the value changes again before the delay", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "c" });

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe("c");
  });
});
