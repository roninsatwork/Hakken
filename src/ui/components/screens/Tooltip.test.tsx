import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

/** The app's own tooltip (sees-header-and-rolling-dates-plan.md, part one): above the control, on hover and on focus, named to a screen reader. */
describe("Tooltip", () => {
  it("shows its words while the mouse rests on the control or it has focus, and names them to a screen reader", () => {
    render(
      <Tooltip label="What Hakken sees · 2 things to do first">
        <Button variant="ghost" aria-label="What Hakken sees">eye</Button>
      </Tooltip>,
    );
    const control = screen.getByRole("button", { name: "What Hakken sees" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(control).not.toHaveAttribute("aria-describedby");
    fireEvent.mouseEnter(control);
    expect(screen.getByRole("tooltip")).toHaveTextContent("What Hakken sees · 2 things to do first");
    expect(control).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.mouseLeave(control);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(control);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(control, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("Tooltip at the window's edge", () => {
  it("moves in from the right edge as far as it must, measured once, and wraps a long label deeper rather than wider", () => {
    // A box that would run 80px past a 1,000px window, reported wherever the tooltip has moved it to: the
    // shift must settle, not chase itself (a square at the map's right edge crashed the page, 2026-10-29).
    const measured: number[] = [];
    const rect = (shift: number) => ({ left: 700 + shift, right: 1080 + shift, width: 380, height: 40, top: 0, bottom: 40, x: 700 + shift, y: 0, toJSON: () => ({}) });
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.getAttribute("role") !== "tooltip") return original.call(this);
      const shift = Number(/\+ (-?\d+)px/.exec((this as HTMLElement).style.transform)?.[1] ?? 0);
      measured.push(shift);
      return rect(shift) as DOMRect;
    };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    try {
      render(
        <Tooltip label="Added to basket → No page recorded\n122\nthe month before 115 (▲ 6.1%)" shown>
          <Button variant="ghost" aria-label="square">122</Button>
        </Tooltip>,
      );
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.style.transform).toBe("translate(calc(-50% + -88px), -100%)");
      expect(measured.length).toBeLessThanOrEqual(3);
      expect(tooltip).toHaveClass("max-w-[14rem]", "whitespace-pre-line");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});
