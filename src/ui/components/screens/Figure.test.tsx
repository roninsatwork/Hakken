import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { Figure, FigureRow } from "./Figure";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/**
 * The number box every screen draws its headline figures with (2026-10-03
 * clean-up): Sites', Search Console's and admin's own copies became this.
 */
describe("Figure", () => {
  it("says what it is, the number and the line under it", () => {
    render(<Figure label="Keywords" value="807" detail="▲ 12 since 3 Sep" />);

    expect(screen.getByText("Keywords")).toBeInTheDocument();
    expect(screen.getByText("807")).toHaveClass("text-[24px]");
    expect(screen.getByText("▲ 12 since 3 Sep")).toBeInTheDocument();
  });

  it("opens the records behind it, and says so with an arrow", () => {
    render(<Figure label="Keywords" value="807" href="/app/sites/s/keywords" />);

    expect(screen.getByRole("link", { name: /Keywords →/ })).toHaveAttribute("href", "/app/sites/s/keywords");
  });

  it("marks the one figure the eye should land on first, and drops its frame inside a panel", () => {
    const { container, rerender } = render(<Figure label="Cost" value="$7.85" emphasis />);
    expect(container.firstElementChild).toHaveClass("border-brand/40");

    rerender(<Figure label="Cost" value="$7.85" framed={false} />);
    expect(container.firstElementChild).not.toHaveClass("border");
  });

  it("lays a row of figures out four across on a wide screen", () => {
    const { container } = render(<FigureRow><Figure label="A" value="1" /><Figure label="B" value="2" /></FigureRow>);

    expect(container.firstElementChild).toHaveClass("xl:grid-cols-4");
  });
});
