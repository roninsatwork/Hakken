import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MovementSaveDialog from "./MovementSaveDialog";
import { MIN_MOVEMENT_CAPTURE_FRAMES } from "../_lib/saveMovementRecording";
import type {
  MovementBodyFocus,
  MovementDifficulty,
  MovementSpineGoal,
} from "../_lib/movementTypes";

const baseProps = {
  spineGoal: "neutralStack" as MovementSpineGoal,
  primaryCue: "",
  bodyFocus: ["ribcage", "pelvis"] as MovementBodyFocus[],
  onSpineGoalChange: vi.fn(),
  onPrimaryCueChange: vi.fn(),
  onBodyFocusChange: vi.fn(),
};

describe("MovementSaveDialog", () => {
  it("stays hidden when closed", () => {
    render(
      <MovementSaveDialog
        isOpen={false}
        title=""
        difficulty={"Beginner" as MovementDifficulty}
        frameCount={0}
        isSaving={false}
        saveError={null}
        {...baseProps}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("Practice Name")).not.toBeInTheDocument();
  });

  it("shows frame guidance and blocks saving until title and enough frames exist", () => {
    const onTitleChange = vi.fn();
    const onSave = vi.fn();

    const { rerender } = render(
      <MovementSaveDialog
        isOpen
        title=""
        difficulty={"Beginner" as MovementDifficulty}
        frameCount={3}
        isSaving={false}
        saveError={null}
        {...baseProps}
        onClose={vi.fn()}
        onTitleChange={onTitleChange}
        onDifficultyChange={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByText(
      `Capture at least ${MIN_MOVEMENT_CAPTURE_FRAMES} posture moments before saving. Current moments: 3.`,
    )).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Practice" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g., Tall Spine Flow"), {
      target: { value: "Roll Down" },
    });

    expect(onTitleChange).toHaveBeenCalledWith("Roll Down");

    rerender(
      <MovementSaveDialog
        isOpen
        title="Roll Down"
        difficulty={"Beginner" as MovementDifficulty}
        frameCount={MIN_MOVEMENT_CAPTURE_FRAMES}
        isSaving={false}
        saveError={null}
        {...baseProps}
        onClose={vi.fn()}
        onTitleChange={onTitleChange}
        onDifficultyChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Save Practice" });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("updates difficulty and displays saving/error states", () => {
    const onDifficultyChange = vi.fn();
    const onSpineGoalChange = vi.fn();
    const onPrimaryCueChange = vi.fn();
    const onBodyFocusChange = vi.fn();

    render(
      <MovementSaveDialog
        isOpen
        title="Roll Down"
        difficulty="Intermediate"
        spineGoal="hipHinge"
        primaryCue="Keep ribs over hips"
        bodyFocus={["ribcage"]}
        frameCount={MIN_MOVEMENT_CAPTURE_FRAMES + 4}
        isSaving
        saveError="Upload failed"
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onDifficultyChange={onDifficultyChange}
        onSpineGoalChange={onSpineGoalChange}
        onPrimaryCueChange={onPrimaryCueChange}
        onBodyFocusChange={onBodyFocusChange}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText(
      `${MIN_MOVEMENT_CAPTURE_FRAMES + 4} posture moments ready to save.`,
    )).toBeInTheDocument();
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByText("Let the hips lead while the spine stays long.")).toBeInTheDocument();

    const [difficultySelect, spineGoalSelect] = screen.getAllByRole("combobox");
    fireEvent.change(difficultySelect, { target: { value: "Advanced" } });
    fireEvent.change(spineGoalSelect, { target: { value: "rollDown" } });
    fireEvent.change(screen.getByPlaceholderText("e.g., Keep ribs over hips"), {
      target: { value: "Roll down slowly" },
    });
    fireEvent.click(screen.getByText("Shoulders"));

    expect(onDifficultyChange).toHaveBeenCalledWith("Advanced");
    expect(onSpineGoalChange).toHaveBeenCalledWith("rollDown");
    expect(onPrimaryCueChange).toHaveBeenCalledWith("Roll down slowly");
    expect(onBodyFocusChange).toHaveBeenCalledWith(["ribcage", "shoulders"]);
  });
});
