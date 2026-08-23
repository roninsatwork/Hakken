import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("ties its label to the box, so the box has a name", () => {
    render(<Checkbox label="Wiki" checked={false} onChange={() => {}} />);

    // getByRole finds it by its accessible name, which only works when the
    // label is tied to the box — the part every hand-written version skipped.
    expect(screen.getByRole("checkbox", { name: "Wiki" })).toBeInTheDocument();
  });

  it("keeps the name when the label is hidden, for a box inside a table cell", () => {
    render(<Checkbox label="Tasks" labelHidden checked={false} onChange={() => {}} />);

    expect(screen.getByRole("checkbox", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toHaveClass("sr-only");
  });

  it("says whether it is ticked, and reports the new state on a click", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Calls" checked={false} onChange={onChange} />);

    const box = screen.getByRole("checkbox", { name: "Calls" });
    expect(box).not.toBeChecked();

    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports false when a ticked box is clicked", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Reports" checked onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Reports" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  // Asserted as the attribute rather than by clicking it: `fireEvent` dispatches
  // straight at the element, which is the one thing a browser will not do to a
  // disabled control, so a click here would prove the opposite of the truth.
  it("marks the box disabled", () => {
    render(<Checkbox label="Properties" checked={false} disabled onChange={() => {}} />);

    expect(screen.getByRole("checkbox", { name: "Properties" })).toBeDisabled();
  });

  it("gives each box its own id, so two never share a label", () => {
    render(
      <>
        <Checkbox label="Wiki" checked={false} onChange={() => {}} />
        <Checkbox label="Reports" checked={false} onChange={() => {}} />
      </>,
    );

    const [first, second] = screen.getAllByRole("checkbox");
    expect(first.id).not.toBe(second.id);
    expect(first.id).toBeTruthy();
  });
});
