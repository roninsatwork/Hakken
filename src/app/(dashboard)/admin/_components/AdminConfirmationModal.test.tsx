import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminConfirmationModal } from "./AdminConfirmationModal";

describe("AdminConfirmationModal", () => {
  it("renders the shared confirmation content, warning, error, and actions", () => {
    render(
      <AdminConfirmationModal
        isOpen
        onClose={vi.fn()}
        title="Delete Tenant"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting={false}
        onConfirm={vi.fn()}
        error="Delete failed"
        warning={{ title: "Cascade warning", description: "All linked data will be removed." }}
      >
        <p>Are you sure?</p>
      </AdminConfirmationModal>
    );

    expect(screen.getByRole("heading", { name: "Delete Tenant" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByText("Cascade warning")).toBeInTheDocument();
    expect(screen.getByText("All linked data will be removed.")).toBeInTheDocument();
    expect(screen.getByText("Delete failed")).toHaveClass("text-red-500");
  });

  it("forwards cancel and confirm actions", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AdminConfirmationModal
        isOpen
        onClose={onClose}
        title="Delete Agent"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting={false}
        onConfirm={onConfirm}
      >
        <p>Delete this agent?</p>
      </AdminConfirmationModal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables destructive actions while submitting", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AdminConfirmationModal
        isOpen
        onClose={onClose}
        title="Delete Agent"
        cancelLabel="Cancel"
        confirmLabel="Deleting"
        isSubmitting
        onConfirm={onConfirm}
      >
        <p>Delete this agent?</p>
      </AdminConfirmationModal>
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deleting" })).toBeDisabled();
  });
});
