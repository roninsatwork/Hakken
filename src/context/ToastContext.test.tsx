import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ToastProvider, toUserFacingMessage, useToast } from "./ToastContext";

// Matches the repo's existing convention (see ChatStatusComponents.test.tsx).
// Without this, AnimatePresence keeps exiting toasts mounted and dismissal can
// never be asserted.
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
          ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children),
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    },
  ),
}));

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useToast>) => void }) {
  const api = useToast();
  return (
    <button type="button" onClick={() => onReady(api)}>
      trigger
    </button>
  );
}

function renderWithToasts(onReady: (api: ReturnType<typeof useToast>) => void) {
  render(
    <ToastProvider>
      <Harness onReady={onReady} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("trigger"));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("toUserFacingMessage", () => {
  test("strips Convex framing so the author's sentence is what the user sees", () => {
    expect(
      toUserFacingMessage(new Error("Uncaught Error: Unauthorized: Widget is inactive"), "fallback"),
    ).toBe("Unauthorized: Widget is inactive");
    expect(toUserFacingMessage(new Error("ConvexError: Plan limit reached"), "fallback")).toBe(
      "Plan limit reached",
    );
  });

  test("drops appended stack traces", () => {
    const error = new Error("Unauthorized\n    at handler (../convex/widgets.ts:340:5)");
    expect(toUserFacingMessage(error, "fallback")).toBe("Unauthorized");
  });

  test("falls back rather than showing an internal dump", () => {
    expect(toUserFacingMessage(new Error("x".repeat(400)), "fallback")).toBe("fallback");
    expect(toUserFacingMessage(new Error("   "), "fallback")).toBe("fallback");
    expect(toUserFacingMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("toast surface", () => {
  test("shows a caught error to the user and reports it once", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderWithToasts((api) => {
      api.showErrorToast(new Error("ConvexError: Plan limit reached"), { scope: "test-scope" });
    });

    expect(screen.getByText("Plan limit reached")).toBeInTheDocument();

    // Same call also reaches the reporting seam, so nothing is user-visible-only.
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.parse(consoleError.mock.calls[0][0] as string)).toMatchObject({
      scope: "test-scope",
    });
  });

  test("announces assertively for screen readers", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithToasts((api) => api.showErrorToast(new Error("boom")));

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  test("can be dismissed manually", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithToasts((api) => api.showToast("Saved", "success"));

    expect(screen.getByText("Saved")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  test("auto-dismisses so failures do not pile up on screen", () => {
    vi.useFakeTimers();
    renderWithToasts((api) => api.showToast("Saved", "success"));

    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
