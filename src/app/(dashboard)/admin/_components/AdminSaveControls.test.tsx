import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminSaveAction, AdminSaveError, AdminSaveFeedback } from "./AdminSaveControls";

describe("AdminSaveAction", () => {
  it("renders the save label and forwards click handling", () => {
    const onClick = vi.fn();

    render(
      <AdminSaveAction
        isSaving={false}
        label="Save settings"
        savingLabel="Saving..."
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders success feedback and disabled saving state", () => {
    render(
      <AdminSaveAction
        isSaving
        label="Save"
        savingLabel="Saving..."
        successLabel="Synchronized"
        showSuccess
      />
    );

    expect(screen.getByText("Synchronized")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("can submit a parent form", () => {
    render(
      <form>
        <AdminSaveAction isSaving={false} label="Save" savingLabel="Saving..." type="submit" />
      </form>
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });
});

describe("AdminSaveError", () => {
  it("renders only when an error is present", () => {
    const { rerender } = render(<AdminSaveError />);

    expect(document.querySelector(".text-red-400")).not.toBeInTheDocument();

    rerender(<AdminSaveError>Save failed</AdminSaveError>);

    expect(screen.getByText("Save failed")).toHaveClass("text-red-400");
  });
});

describe("AdminSaveFeedback", () => {
  it("renders success feedback", () => {
    render(
      <AdminSaveFeedback
        status="success"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Everything is synchronized.")).toBeInTheDocument();
  });

  it("renders error feedback", () => {
    render(
      <AdminSaveFeedback
        status="error"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("renders nothing when idle", () => {
    render(
      <AdminSaveFeedback
        status="idle"
        successTitle="Saved"
        successMessage="Everything is synchronized."
        errorTitle="Failed"
        errorMessage="Save failed"
      />
    );

    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });
});
