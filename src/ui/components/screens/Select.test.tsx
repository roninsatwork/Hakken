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

/**
 * The dropdown as a compact chip (Anthony, 2026-09-26, showing Ahrefs'
 * Organic keywords): it names its filter until a choice is made, then shows
 * the choice in the brand tint — and the native select still does the
 * choosing, so the keyboard and a screen reader work as they did.
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

  it("shows the choice after the label, in the brand tint", () => {
    const { container } = render(
      <Select chip={{ label: "Position", choice: "1–3" }} value="p01_03" onChange={vi.fn()}>{options}</Select>,
    );

    expect(screen.getByText("Position: 1–3")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-brand/15", "text-brand");
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

    expect(screen.getByText("Position: 1–3")).toHaveAttribute("aria-hidden", "true");
  });

  it("leaves the ordinary dropdown as it was", () => {
    render(<Select aria-label="Position" value="" onChange={vi.fn()}>{options}</Select>);

    const select = screen.getByRole("combobox", { name: "Position" });
    expect(select).toHaveClass("h-[38px]");
    expect(select).not.toHaveClass("opacity-0");
  });
});
