import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./Select";

const options = (
  <>
    <option value="">Any position</option>
    <option value="p01_03">1–3</option>
    <option value="p04_10">4–10</option>
  </>
);

/** A chip's words, which are split so the label can sit dimmer than the choice. */
const chipWords = (text: string) => (_: string, element: Element | null) =>
  element?.getAttribute("aria-hidden") === "true" && element.textContent === text;

/**
 * The dropdown as a compact chip (Anthony, 2026-09-26, showing Ahrefs'
 * Organic keywords): it names its filter until a choice is made, then shows
 * the choice — in grey, never the brand colour (Anthony, 2026-10-03) — and
 * the native select still does the choosing, so the keyboard and a screen
 * reader work as they did.
 */
describe("Select as a chip", () => {
  it("names its filter until a choice is made", () => {
    const { container } = render(
      <Select chip={{ label: "Position", choice: null }} value="" onChange={vi.fn()}>{options}</Select>,
    );

    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Position" })).toHaveValue("");
    expect(container.firstChild).not.toHaveClass("text-brand");
  });

  it("shows the choice after the label, in grey rather than the brand colour", () => {
    const { container } = render(
      <Select chip={{ label: "Position", choice: "1–3" }} value="p01_03" onChange={vi.fn()}>{options}</Select>,
    );

    expect(screen.getByText(chipWords("Position: 1–3"))).toBeInTheDocument();
    expect(screen.getByText("Position:")).toHaveClass("text-secondary");
    expect(container.firstChild).toHaveClass("border-secondary/40", "bg-hover", "text-foreground");
    // Orange means the page's action; a filter only narrows what is on screen.
    // Only the keyboard-focus outline may still use the brand colour.
    const chipClasses = (container.firstChild as HTMLElement).className.replace("focus-within:border-brand/50", "");
    expect(chipClasses).not.toMatch(/brand/);
    expect(container.querySelector("svg")).toHaveClass("text-foreground");
  });

  it("chooses through the native select, laid over the whole chip", () => {
    const onChange = vi.fn();
    render(<Select chip={{ label: "Position" }} value="" onChange={onChange}>{options}</Select>);

    const select = screen.getByRole("combobox", { name: "Position" });
    fireEvent.change(select, { target: { value: "p04_10" } });

    expect(onChange).toHaveBeenCalledWith("p04_10");
    expect(select).toHaveClass("absolute", "inset-0", "opacity-0");
  });

  it("hides the chip's words from a screen reader, which reads the select's name and value", () => {
    render(<Select chip={{ label: "Position", choice: "1–3" }} value="p01_03" onChange={vi.fn()}>{options}</Select>);

    expect(screen.getByText(chipWords("Position: 1–3"))).toHaveAttribute("aria-hidden", "true");
  });

  it("leaves the ordinary dropdown as it was", () => {
    render(<Select aria-label="Position" value="" onChange={vi.fn()}>{options}</Select>);

    const select = screen.getByRole("combobox", { name: "Position" });
    expect(select).toHaveClass("h-[38px]");
    expect(select).not.toHaveClass("opacity-0");
  });
});
