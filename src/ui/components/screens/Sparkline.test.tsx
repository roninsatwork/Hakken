import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Figure } from "./Figure";
import { Sparkline, monotonePath, sparkPath } from "./Sparkline";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/**
 * A figure's days as a small line under it (dashboard-way-1-plan-2026-11-21.md): drawn at its real width, the shape the
 * app's line charts draw, and at the foot of its figure so a row's lines always line up.
 */
const wide = (width: number) => vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });

afterEach(() => vi.restoreAllMocks());

describe("Sparkline", () => {
  it("draws at the width it's given, in real pixels, never stretched", () => {
    wide(240);
    render(<Sparkline values={[1, 4, 2, 6]} colour="#f97316" label="Visits each day in October" />);
    const drawing = screen.getByRole("img", { name: "Visits each day in October" });
    expect(drawing).toHaveAttribute("width", "240");
    expect(drawing).not.toHaveAttribute("viewBox");
  });

  it("draws nothing until it knows its width, or with fewer than two days", () => {
    wide(0);
    const { rerender } = render(<Sparkline values={[1, 4]} colour="#f97316" label="Visits" />);
    expect(screen.queryByRole("img")).toBeNull();
    wide(240);
    rerender(<Sparkline values={[5]} colour="#f97316" label="Visits" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the line inside the box, the busiest day near the top and an empty day near the bottom", () => {
    const d = sparkPath([0, 10], 100, 40);
    expect(d.startsWith("M0,37")).toBe(true);
    expect(d.endsWith("100,3")).toBe(true);
  });

  it("never overshoots a flat run, as recharts' monotone curve doesn't", () => {
    const numbers = (monotonePath([[0, 10], [10, 10], [20, 10]]).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const heights = numbers.filter((_, index) => index % 2 === 1);
    expect(heights.length).toBeGreaterThan(2);
    expect(heights.every((y) => y === 10)).toBe(true);
  });
});

describe("a figure with its days at its foot", () => {
  it("puts the line at the foot of the box, so a row's lines line up", () => {
    wide(240);
    const { container } = render(
      <Figure label="Events" value="5" detail="2.0 for every 100 visits." foot={<Sparkline values={[0, 1, 0, 2]} colour="#f43f5e" label="Events each day" />} />,
    );
    expect(container.firstElementChild).toHaveClass("flex", "flex-col");
    expect(container.querySelector('[data-part="figure-foot"]')).toHaveClass("mt-auto");
    expect(screen.getByRole("img", { name: "Events each day" })).toBeInTheDocument();
  });

  it("leaves a figure without a foot as it was", () => {
    const { container } = render(<Figure label="Visits" value="245" />);
    expect(container.firstElementChild).not.toHaveClass("flex");
  });
});
