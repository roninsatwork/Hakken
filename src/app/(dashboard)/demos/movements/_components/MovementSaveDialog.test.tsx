import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MovementSaveDialog from "./MovementSaveDialog";

describe("MovementSaveDialog", () => {
  it("stays hidden when closed", () => {
    render(
      <MovementSaveDialog
        isOpen={false}
        title=""
        difficulty="Beginner"
        frameCount={0}
        isSaving={false}
        saveError={null}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("Routine Name")).not.toBeInTheDocument();
  });

  it("shows frame guidance and blocks saving until title and enough frames exist", () => {
    const onTitleChange = vi.fn();
    const onSave = vi.fn();

    const { rerender } = render(
      <MovementSaveDialog
        isOpen
        title=""
        difficulty="Beginner"
        frameCount={3}
        isSaving={false}
        saveError={null}
        onClose={vi.fn()}
        onTitleChange={onTitleChange}
        onDifficultyChange={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Capture at least 5 valid frames before saving. Current valid frames: 3.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to Library" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g., Morning Squats"), {
      target: { value: "Roll Down" },
    });

    expect(onTitleChange).toHaveBeenCalledWith("Roll Down");

    rerender(
      <MovementSaveDialog
        isOpen
        title="Roll Down"
        difficulty="Beginner"
        frameCount={5}
        isSaving={false}
        saveError={null}
        onClose={vi.fn()}
        onTitleChange={onTitleChange}
        onDifficultyChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Save to Library" });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("updates difficulty and displays saving/error states", () => {
    const onDifficultyChange = vi.fn();

    render(
      <MovementSaveDialog
        isOpen
        title="Roll Down"
        difficulty="Intermediate"
        frameCount={9}
        isSaving
        saveError="Upload failed"
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onDifficultyChange={onDifficultyChange}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("9 valid frames ready to save.")).toBeInTheDocument();
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Advanced" } });

    expect(onDifficultyChange).toHaveBeenCalledWith("Advanced");
  });
});
