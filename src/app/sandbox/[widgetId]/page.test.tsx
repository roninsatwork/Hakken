import { act, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WidgetSandboxPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ widgetId: "widget-123" }) }));

describe("WidgetSandboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    (window as typeof window & { HakkenWidgetInitialized?: boolean }).HakkenWidgetInitialized = true;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the exact initializing and unavailable states immediate", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);
    const { rerender } = render(<WidgetSandboxPage />);

    expect(screen.getByText("Initializing Sandbox...")).toBeInTheDocument();
    expect(screen.queryByText("AcmeCorp System")).not.toBeInTheDocument();

    vi.mocked(useQuery).mockReturnValue(null);
    rerender(<WidgetSandboxPage />);

    expect(screen.getByRole("heading", { name: "Sandbox Unavailable" })).toBeInTheDocument();
  });

  it("injects and cleans up the same widget loader around the answered presentation", async () => {
    vi.mocked(useQuery).mockReturnValue({ _id: "widget-123" } as ReturnType<typeof useQuery>);

    let unmount = () => {};
    await act(async () => {
      ({ unmount } = render(<WidgetSandboxPage />));
      await import("./WidgetSandboxPresentation");
    });

    expect(screen.getByText("AcmeCorp System")).toBeInTheDocument();
    const script = document.body.querySelector<HTMLScriptElement>('script[data-widget-id="widget-123"]');
    expect(script).not.toBeNull();
    expect(script?.async).toBe(true);
    expect(script?.src).toMatch(/\/embed\.js\?t=\d+$/);

    const widgetContainer = document.createElement("div");
    widgetContainer.id = "hakken-widget-container";
    document.body.appendChild(widgetContainer);

    unmount();

    expect(document.body.querySelector('script[data-widget-id="widget-123"]')).toBeNull();
    expect(document.getElementById("hakken-widget-container")).toBeNull();
    expect((window as typeof window & { HakkenWidgetInitialized?: boolean }).HakkenWidgetInitialized).toBe(false);
  });
});
