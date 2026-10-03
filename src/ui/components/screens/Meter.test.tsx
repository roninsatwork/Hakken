import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Meter } from "./Meter";

/** A share drawn as a thin bar beside its number (2026-10-03 clean-up). */
describe("Meter", () => {
  it("fills its share of the track, never past either end", () => {
    const { container, rerender } = render(<Meter value={0.25} colour="#3b82f6" />);
    const fill = () => container.firstElementChild?.firstElementChild as HTMLElement | null;
    expect(fill()?.style.width).toBe("25%");

    rerender(<Meter value={1.7} />);
    expect(fill()?.style.width).toBe("100%");
    expect(fill()).toHaveClass("bg-brand");

    rerender(<Meter value={null} />);
    expect(fill()).toBeNull();
  });

  it("is hidden from a screen reader: the number beside it says it", () => {
    const { container } = render(<Meter value={0.5} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
