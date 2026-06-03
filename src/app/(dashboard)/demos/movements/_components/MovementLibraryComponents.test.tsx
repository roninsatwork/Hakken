import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import MovementDeleteDialog from "./MovementDeleteDialog";
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
      onView: vi.fn(),
      onDelete: vi.fn(),
    };

    const { rerender } = render(<MovementLibraryTable {...baseProps} isLoading />);

    expect(screen.getByText("Loading movement library...")).toBeInTheDocument();

    rerender(<MovementLibraryTable {...baseProps} isLoading={false} searchTerm="spine" />);

    expect(screen.getByText("No Movements Recorded")).toBeInTheDocument();
    expect(screen.getByText("No recordings match your search.")).toBeInTheDocument();
  });

  it("wires movement row actions and pagination", () => {
    const movement = makeMovement();
    const onLoadMore = vi.fn();
    const onPlay = vi.fn();
    const onView = vi.fn();
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
        onView={onView}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Roll Down")).toBeInTheDocument();
    expect(screen.getByText("Beginner")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "View Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Roll Down" }));
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));

    expect(onPlay).toHaveBeenCalledWith(movement);
    expect(onView).toHaveBeenCalledWith(movement);
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
});
