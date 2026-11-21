import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CountFilters } from "./CountFilters";

const items = [
  { key: "all", label: "All", count: 24 },
  { key: "attention", label: "Needs attention", count: 4, attention: true },
  { key: "high", label: "High risk", count: 2 },
];

/**
 * Counts you can press to filter a table (the Governance canvas, 2026-11-11):
 * plain words and numbers, never capsules, with the one in force underlined.
 */
describe("CountFilters", () => {
  it("draws each count as a word and its number in one named group", () => {
    render(<CountFilters label="Show" items={items} value="all" onChange={() => {}} />);

    const group = screen.getByRole("group", { name: "Show" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 24" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Needs attention 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High risk 2" })).toBeInTheDocument();
  });

  it("says which one is pressed, and only that one", () => {
    render(<CountFilters label="Show" items={items} value="high" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "High risk 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All 24" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Needs attention 4" })).toHaveAttribute("aria-pressed", "false");
  });

  it("underlines the pressed one in the reading colour and keeps the rest quiet", () => {
    render(<CountFilters label="Show" items={items} value="all" onChange={() => {}} />);

    const pressed = screen.getByRole("button", { name: "All 24" });
    const quiet = screen.getByRole("button", { name: "High risk 2" });
    expect(pressed).toHaveClass("border-foreground", "text-foreground");
    expect(quiet).toHaveClass("border-transparent", "text-secondary");
  });

  it("draws no capsule: no rounded edge and no fill", () => {
    render(<CountFilters label="Show" items={items} value="all" onChange={() => {}} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.className).not.toMatch(/rounded-(full|\[6px\])/);
      expect(button.className).not.toMatch(/\bbg-(?!transparent)/);
      expect(button).toHaveClass("rounded-none");
    }
  });

  it("puts a count that asks for something in the warning colour, pressed or not", () => {
    const { rerender } = render(<CountFilters label="Show" items={items} value="all" onChange={() => {}} />);
    expect(screen.getByText("4")).toHaveClass("text-warning");
    expect(screen.getByText("2")).not.toHaveClass("text-warning");

    rerender(<CountFilters label="Show" items={items} value="attention" onChange={() => {}} />);
    expect(screen.getByText("4")).toHaveClass("text-warning");
  });

  it("reports the key that was pressed", () => {
    const onChange = vi.fn();
    render(<CountFilters label="Show" items={items} value="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Needs attention 4" }));

    expect(onChange).toHaveBeenCalledWith("attention");
  });

  it("lets the row wrap onto a second line in a narrow window", () => {
    render(<CountFilters label="Show" items={items} value="all" onChange={() => {}} />);

    expect(screen.getByRole("group", { name: "Show" })).toHaveClass("flex-wrap");
  });
});
