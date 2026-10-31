import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { closeSees, noteSeesThread, resetSees, toggleSees, useSeesThread } from "./hakkenSeesStore";

/**
 * The eye's panel and its conversation (ask-hakken-every-chart-plan-2026-10-31.md, §2b; Anthony: "every time we press
 * the eye it should open a new chat thread"): the conversation lasts while the panel is open, and each press starts
 * a new one.
 */
describe("the eye's panel conversation", () => {
  afterEach(() => resetSees());

  it("keeps its conversation while open, and starts a new one at the next press", () => {
    const { result } = renderHook(() => useSeesThread("googleAnalytics.conversions|lastMonth"));
    act(() => toggleSees());
    act(() => noteSeesThread("googleAnalytics.conversions|lastMonth", "threads_1"));
    expect(result.current).toBe("threads_1");
    act(() => closeSees());
    // Closed, it is still the one asked in; pressed again, the panel opens empty.
    expect(result.current).toBe("threads_1");
    act(() => toggleSees());
    expect(result.current).toBeNull();
  });
});
