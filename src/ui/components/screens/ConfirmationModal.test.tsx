import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationModal } from "./ConfirmationModal";

describe("ConfirmationModal", () => {
  it("renders the shared confirmation content, warning, error, and actions", () => {
    render(
      <ConfirmationModal
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
      </ConfirmationModal>
    );

    expect(screen.getByRole("heading", { name: "Delete Tenant" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(screen.getByText("Cascade warning")).toBeInTheDocument();
    expect(screen.getByText("All linked data will be removed.")).toBeInTheDocument();
    expect(screen.getByText("Delete failed")).toHaveClass("text-red-500");
  });

  it("supports warning copy without a warning title", () => {
    render(
      <ConfirmationModal
        isOpen
        onClose={vi.fn()}
        title="Delete Plan"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting={false}
        onConfirm={vi.fn()}
        warning={{ description: "Existing subscribers may be affected." }}
      >
        <p>Delete this plan?</p>
      </ConfirmationModal>
    );

    expect(screen.getByText("Existing subscribers may be affected.")).toBeInTheDocument();
  });

  it("can render as a compact confirmation dialog", () => {
    render(
      <ConfirmationModal
        isOpen
        onClose={vi.fn()}
        title="Delete Trace"
        size="sm"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting={false}
        onConfirm={vi.fn()}
      >
        <p>Remove this trace?</p>
      </ConfirmationModal>
    );

    expect(screen.getByRole("heading", { name: "Delete Trace" })).toBeInTheDocument();
    expect(screen.getByText("Remove this trace?")).toBeInTheDocument();
  });

  it("forwards cancel and confirm actions", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationModal
        isOpen
        onClose={onClose}
        title="Delete Agent"
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting={false}
        onConfirm={onConfirm}
      >
        <p>Delete this agent?</p>
      </ConfirmationModal>
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
      <ConfirmationModal
        isOpen
        onClose={onClose}
        title="Delete Agent"
        cancelLabel="Cancel"
        confirmLabel="Deleting"
        isSubmitting
        onConfirm={onConfirm}
      >
        <p>Delete this agent?</p>
      </ConfirmationModal>
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deleting" })).toBeDisabled();
  });
});
