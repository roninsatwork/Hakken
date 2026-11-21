import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepProgress } from "./StepProgress";

/**
 * Background work moving in whole steps (the wiki's check-up, S8): the step
 * it's on and what it has done, above a bar of one segment a step.
 */
describe("StepProgress", () => {
  it("shows the step it's on and what it has done above the bar", () => {
    render(<StepProgress done={2} total={7} label="Filling gaps" detail="Step 3 of 7" />);

    expect(screen.getByText("Filling gaps")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 7")).toBeInTheDocument();
  });

  it("reads out how far along it is, one segment a step", () => {
    render(<StepProgress done={2} total={7} label="Filling gaps" />);

    const bar = screen.getByRole("progressbar", { name: "Filling gaps" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    expect(bar.children).toHaveLength(7);
  });

  it("lights the finished steps, the step under way more softly, and leaves the rest", () => {
    render(<StepProgress done={2} total={4} label="Filling gaps" />);

    const segments = [...screen.getByRole("progressbar").children].map((segment) => segment.getAttribute("data-segment"));
    expect(segments).toEqual(["done", "done", "now", "to-do"]);
  });

  it("never claims more done than there are steps, or less than none", () => {
    const { unmount } = render(<StepProgress done={9} total={3} label="All done" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    unmount();

    render(<StepProgress done={-1} total={3} label="Starting" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("uses the theme's own colours, never orange", () => {
    render(<StepProgress done={1} total={3} label="Filling gaps" />);

    for (const segment of screen.getByRole("progressbar").children) {
      expect(segment.className).not.toMatch(/brand/);
      expect(segment.className).toMatch(/bg-foreground/);
    }
  });
});
