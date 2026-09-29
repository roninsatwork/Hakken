import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusLabel } from "./StatusLabel";
import type { StatusTone } from "./statusTone";

/**
 * A status is a line icon in the tone's colour, then plain words — never a
 * pill (Anthony, 2026-09-29; docs/plans/active/status-labels-plan.md).
 */
describe("StatusLabel", () => {
  const cases: Array<[StatusTone, string, string]> = [
    ["success", "lucide-check", "text-success"],
    ["info", "lucide-info", "text-info"],
    ["warning", "lucide-triangle-alert", "text-warning"],
    ["danger", "lucide-circle-x", "text-destructive"],
    ["neutral", "lucide-minus", "text-secondary"],
  ];

  it.each(cases)("draws %s as its own icon, in its colour, beside plain words", (tone, iconClass, colour) => {
    const { container } = render(<StatusLabel tone={tone}>Commercial</StatusLabel>);
    const label = screen.getByText("Commercial");
    const icon = container.querySelector("svg")!;

    expect(icon).toHaveClass(iconClass, colour);
    expect(icon).toHaveAttribute("aria-hidden", "true");
    // Only the icon is coloured; the words keep the page's text colour.
    expect(label).toHaveClass("text-foreground/85");
    expect(label.className).not.toMatch(/text-(success|info|warning|destructive|secondary)\b/);
  });

  it("has no box: no border, fill or rounded ends", () => {
    render(<StatusLabel tone="warning">ronins.co.uk not mentioned</StatusLabel>);
    expect(screen.getByText("ronins.co.uk not mentioned").className).not.toMatch(/\b(rounded|border|bg-)/);
  });

  it("reads as its words alone to a screen reader", () => {
    render(<p><StatusLabel tone="danger">Failed</StatusLabel></p>);
    expect(screen.getByText("Failed").closest("p")).toHaveTextContent(/^Failed$/);
  });

  it("comes in two sizes, for tables and for headers", () => {
    const { container, rerender } = render(<StatusLabel tone="info">Running</StatusLabel>);
    expect(screen.getByText("Running")).toHaveClass("text-[12px]");
    expect(container.querySelector("svg")).toHaveClass("h-3.5", "w-3.5");

    rerender(<StatusLabel tone="info" size="md">Running</StatusLabel>);
    expect(screen.getByText("Running")).toHaveClass("text-[13px]");
    expect(container.querySelector("svg")).toHaveClass("h-[15px]", "w-[15px]");
  });

  it("takes a named icon for a meaning the tone does not carry, still in the tone's colour", () => {
    const { container, rerender } = render(<StatusLabel tone="warning" icon="working">Processing</StatusLabel>);
    expect(container.querySelector("svg")).toHaveClass("animate-spin", "text-warning");

    rerender(<StatusLabel tone="warning" icon="approval">Needs you</StatusLabel>);
    expect(container.querySelector("svg")).toHaveClass("lucide-user-check", "text-warning");
    expect(container.querySelector("svg")).not.toHaveClass("animate-spin");
  });
});
