import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { Change, ChangeLine } from "./Change";

// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" "),
  };
});

/**
 * A move up or down (2026-10-03 clean-up): Sites' ChangeCell, Search
 * Console's clicks and places, and the admin's arrows became this. The arrow
 * carries the meaning; the colour only repeats it.
 */
describe("Change", () => {
  it("draws a rise and a fall with their arrows", () => {
    const { rerender } = render(<Change by={12} />);
    expect(screen.getByText("▲ 12")).toHaveClass("text-success");

    rerender(<Change by={-3} />);
    expect(screen.getByText("▼ 3")).toHaveClass("text-destructive");
  });

  it("says nothing it cannot know, and no move as a dash or in words", () => {
    const { rerender } = render(<Change by={null} />);
    expect(screen.getByText("–")).toHaveClass("text-muted");

    rerender(<Change by={0} same />);
    expect(screen.getByText("ui.change.same")).toBeInTheDocument();
  });

  it("counts places risen, a smaller move than a twentieth of a place being none", () => {
    const { rerender } = render(<Change by={0.8} kind="places" format={(value) => value.toFixed(1)} />);
    expect(screen.getByText("▲ ui.change.places 0.8")).toHaveClass("text-success");

    rerender(<Change by={0.01} kind="places" />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("calls a row with nothing before it new", () => {
    render(<Change by={5} isNew />);

    expect(screen.getByText("ui.change.new")).toHaveClass("text-success");
  });
});

describe("ChangeLine", () => {
  it("colours a figure's change sentence by one rule", () => {
    const { rerender } = render(<ChangeLine by={4}>▲ 4 since 3 Sep</ChangeLine>);
    expect(screen.getByText("▲ 4 since 3 Sep")).toHaveClass("text-success");

    rerender(<ChangeLine by={-4}>▼ 4 since 3 Sep</ChangeLine>);
    expect(screen.getByText("▼ 4 since 3 Sep")).toHaveClass("text-destructive");

    rerender(<ChangeLine by={0}>No change since 3 Sep</ChangeLine>);
    expect(screen.getByText("No change since 3 Sep")).toHaveClass("text-muted");

    rerender(<ChangeLine by={4} neutral>▲ 4 on the 30 days before</ChangeLine>);
    expect(screen.getByText("▲ 4 on the 30 days before")).toHaveClass("text-secondary");
  });
});
