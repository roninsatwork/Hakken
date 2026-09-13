import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGameViewport } from "./useGameViewport";
const mock = vi.hoisted(() => ({ open: true, set: vi.fn() }));
vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: mock.open, setIsSidebarOpen: mock.set }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("collapses the sidebar on a narrow screen and restores the previous state", () => {
  let change: () => void = () => {};
  const query = {
    matches: false,
    addEventListener: vi.fn((_event, callback) => {
      change = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  const hook = renderHook(() => useGameViewport());
  expect(mock.set).not.toHaveBeenCalled();
  act(() => {
    query.matches = true;
    change();
  });
  expect(mock.set).toHaveBeenLastCalledWith(false);
  hook.unmount();
  expect(mock.set).toHaveBeenLastCalledWith(true);
  expect(query.removeEventListener).toHaveBeenCalledWith("change", change);
});
