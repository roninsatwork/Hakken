import { fireEvent, screen } from "@testing-library/react";
// The demo renders the shared Table/ConfirmationModal, whose own copy now
// resolves through the catalogue, so tests render inside the intl provider
// the way the app does (harness-only change; the frozen demo is untouched).
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import MovementDeleteDialog from "./MovementDeleteDialog";
import MovementEditDialog, {
  toMovementDifficulty,
  toMovementSpineGoal,
} from "./MovementEditDialog";
import MovementLibraryTable from "./MovementLibraryTable";

const makeMovement = (overrides: Partial<Doc<"movements">> = {}): Doc<"movements"> =>
  ({
    _id: "movement_1" as Id<"movements">,
    _creationTime: 1,
    title: "Roll Down",
    difficulty: "Beginner",
    poseData: "storage-id",
    createdAt: 1_700_000_000_000,
    ...overrides,
  }) as Doc<"movements">;

describe("movement library components", () => {
  it("renders loading and empty table states", () => {
    const baseProps = {
      movements: [],
      isLoadingMore: false,
      canLoadMore: false,
      searchTerm: "",
      itemsPerPage: 15,
      onLoadMore: vi.fn(),
      onPlay: vi.fn(),
      onDebugAutoBaseline: vi.fn(),
      onView: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    };

    const { container, rerender } = render(<MovementLibraryTable {...baseProps} isLoading />);

    // The kit's spinner, since 2026-08-17. This used to be the words "Loading
    // posture studio..." sitting in the table like a row anyone might click.
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    rerender(<MovementLibraryTable {...baseProps} isLoading={false} searchTerm="spine" />);

    expect(screen.getByText("No Routines Recorded")).toBeInTheDocument();
    expect(screen.getByText("No routines match your search.")).toBeInTheDocument();
  });

  it("wires movement row actions and pagination", () => {
    const movement = makeMovement();
    const onLoadMore = vi.fn();
    const onPlay = vi.fn();
    const onDebugAutoBaseline = vi.fn();
    const onView = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <MovementLibraryTable
        movements={[movement]}
        isLoading={false}
        isLoadingMore={false}
        canLoadMore
        searchTerm=""
        itemsPerPage={15}
        onLoadMore={onLoadMore}
        onPlay={onPlay}
        onDebugAutoBaseline={onDebugAutoBaseline}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Roll Down")).toBeInTheDocument();
    expect(screen.getByText("Beginner")).toBeInTheDocument();
    expect(screen.getByText("Spine awareness")).toBeInTheDocument();
    // The house footer states the count in a sentence; the hand-written one it
    // replaced put the bare number in its own element.
    expect(screen.getByText("Showing 1 routines")).toBeInTheDocument();
    expect(screen.getByTitle("Start live practice")).toBeInTheDocument();
    expect(screen.getByTitle("Debug auto baseline")).toBeInTheDocument();
    expect(screen.getByTitle("Review recording")).toBeInTheDocument();
    expect(screen.getByTitle("Edit name and level")).toBeInTheDocument();
    expect(screen.getByTitle("Delete routine")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start practice Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Debug auto baseline Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Review routine Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit routine Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete routine Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));

    expect(onPlay).toHaveBeenCalledWith(movement);
    expect(onDebugAutoBaseline).toHaveBeenCalledWith(movement);
    expect(onView).toHaveBeenCalledWith(movement);
    expect(onEdit).toHaveBeenCalledWith(movement);
    expect(onDelete).toHaveBeenCalledWith(movement);
    expect(onLoadMore).toHaveBeenCalledWith(15);
  });

  it("shows delete confirmation and forwards dialog actions", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <MovementDeleteDialog
        isOpen={false}
        movement={makeMovement()}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByText("Are you sure you want to delete")).not.toBeInTheDocument();

    rerender(
      <MovementDeleteDialog
        isOpen
        movement={makeMovement()}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Roll Down")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Routine" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
  it("edits a routine's name and level", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onTitleChange = vi.fn();
    const onDifficultyChange = vi.fn();
    const onSpineGoalChange = vi.fn();
    const onPrimaryCueChange = vi.fn();

    render(
      <MovementEditDialog
        isOpen
        title="Roll Down"
        difficulty="Beginner"
        spineGoal="rollDown"
        primaryCue="Keep ribs over hips"
        isSaving={false}
        saveError={null}
        onClose={onClose}
        onTitleChange={onTitleChange}
        onDifficultyChange={onDifficultyChange}
        onSpineGoalChange={onSpineGoalChange}
        onPrimaryCueChange={onPrimaryCueChange}
        onSave={onSave}
      />,
    );

    const nameField = screen.getByLabelText("Routine Name");
    expect(nameField).toHaveValue("Roll Down");
    expect(screen.getByLabelText("Difficulty")).toHaveValue("Beginner");

    fireEvent.change(nameField, { target: { value: "Tall Spine Flow" } });
    expect(onTitleChange).toHaveBeenCalledWith("Tall Spine Flow");

    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "Advanced" } });
    expect(onDifficultyChange).toHaveBeenCalledWith("Advanced");

    expect(screen.getByLabelText("Spine Goal")).toHaveValue("rollDown");
    // The chosen goal explains itself, the way it does in the save dialog.
    expect(screen.getByText("Move through the spine with control.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Spine Goal"), { target: { value: "sideBend" } });
    expect(onSpineGoalChange).toHaveBeenCalledWith("sideBend");

    const cueField = screen.getByLabelText(/Instructor Cue/);
    expect(cueField).toHaveValue("Keep ribs over hips");
    fireEvent.change(cueField, { target: { value: "Lengthen through the crown" } });
    expect(onPrimaryCueChange).toHaveBeenCalledWith("Lengthen through the crown");

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a save failure and keeps the way out open while saving", () => {
    render(
      <MovementEditDialog
        isOpen
        title="Roll Down"
        difficulty="Beginner"
        spineGoal=""
        primaryCue=""
        isSaving
        saveError="That did not save. Try again."
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onSpineGoalChange={vi.fn()}
        onPrimaryCueChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("That did not save. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    // A dialog mid-save still has to be leavable, so Cancel is not a write control.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("opens on a real level when the stored one is not one of the three", () => {
    expect(toMovementDifficulty("Advanced")).toBe("Advanced");
    expect(toMovementDifficulty("intermediate")).toBe("Intermediate");
    // Legacy captures stored their own words; a blank dropdown would save as one.
    expect(toMovementDifficulty("EASY")).toBe("Beginner");
    expect(toMovementDifficulty(undefined)).toBe("Beginner");
  });

  it("leaves a routine with no spine goal without one", () => {
    expect(toMovementSpineGoal("thoracicRotation")).toBe("thoracicRotation");
    // Unlike the level, having none is a real state — the box must not invent one.
    expect(toMovementSpineGoal(undefined)).toBe("");
    expect(toMovementSpineGoal("LENGTHEN")).toBe("");
  });
});
