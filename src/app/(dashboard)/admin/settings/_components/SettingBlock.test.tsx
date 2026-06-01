import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorInput, SettingBlock } from "./SettingBlock";

describe("settings shared blocks", () => {
  it("renders a titled settings block with child controls", () => {
    render(
      <SettingBlock title="Brand" sub="Workspace identity">
        <button type="button">Update</button>
      </SettingBlock>
    );

    expect(screen.getByRole("heading", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByText("Workspace identity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("normalizes color input values to uppercase and handles empty colors", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ColorInput label="Brand color" value="#ff5500" onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue("#ff5500"), { target: { value: "#00aaee" } });

    expect(screen.getByText("#FF5500")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("#00AAEE");

    rerender(<ColorInput label="Brand color" value="" onChange={onChange} />);

    expect(screen.getByDisplayValue("#000000")).toBeInTheDocument();
  });
});
