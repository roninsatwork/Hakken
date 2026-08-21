import React from "react";
import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import TimeframeDropdown from "./TimeframeDropdown";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

describe("TimeframeDropdown", () => {
  it("selects preset ranges and closes the menu", () => {
    const setTimeframe = vi.fn();

    render(
      <TimeframeDropdown
        timeframe="7d"
        setTimeframe={setTimeframe}
        customStart=""
        setCustomStart={vi.fn()}
        customEnd=""
        setCustomEnd={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Last 7 Days/i }));
    fireEvent.click(screen.getByRole("button", { name: "Last 30 Days" }));

    expect(setTimeframe).toHaveBeenCalledWith("30d");
    expect(screen.queryByText("Presets")).not.toBeInTheDocument();
  });

  it("edits custom dates and applies custom only when a start date exists", () => {
    const setTimeframe = vi.fn();
    const setCustomStart = vi.fn();
    const setCustomEnd = vi.fn();
    const { rerender } = render(
      <TimeframeDropdown
        timeframe="custom"
        setTimeframe={setTimeframe}
        customStart=""
        setCustomStart={setCustomStart}
        customEnd=""
        setCustomEnd={setCustomEnd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Custom Range/i }));

    expect(screen.getByRole("button", { name: "Apply Range" })).toBeDisabled();

    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-06-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-06-30" } });

    expect(setCustomStart).toHaveBeenCalledWith("2026-06-01");
    expect(setCustomEnd).toHaveBeenCalledWith("2026-06-30");

    rerender(
      <TimeframeDropdown
        timeframe="custom"
        setTimeframe={setTimeframe}
        customStart="2026-06-01"
        setCustomStart={setCustomStart}
        customEnd="2026-06-30"
        setCustomEnd={setCustomEnd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply Range" }));

    expect(setTimeframe).toHaveBeenCalledWith("custom");
  });

  it("closes when clicking outside the dropdown", () => {
    render(
      <div>
        <button type="button">outside</button>
        <TimeframeDropdown
          timeframe="today"
          setTimeframe={vi.fn()}
          customStart=""
          setCustomStart={vi.fn()}
          customEnd=""
          setCustomEnd={vi.fn()}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: /Today/i }));
    expect(screen.getByText("Presets")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByText("Presets")).not.toBeInTheDocument();
  });
});
