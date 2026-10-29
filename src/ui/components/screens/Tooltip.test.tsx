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
