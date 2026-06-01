import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminModalFormActions,
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "./AdminModalForm";

describe("AdminModalFormField", () => {
  it("renders a shared label, optional hint, and control", () => {
    render(
      <AdminModalFormField label="Name" hint="Optional">
        <input className={adminModalInputClassName} />
      </AdminModalFormField>
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveClass("focus:border-brand/50");
  });
});

describe("AdminModalFormError", () => {
  it("renders only when an error is present", () => {
    const { rerender } = render(<AdminModalFormError />);

    expect(document.querySelector(".text-red-500")).not.toBeInTheDocument();

    rerender(<AdminModalFormError>Save failed</AdminModalFormError>);

    expect(screen.getByText("Save failed")).toHaveClass("text-red-500");
  });
});

describe("AdminModalFormActions", () => {
  it("forwards cancel clicks and disables both actions while submitting", () => {
    const onCancel = vi.fn();

    render(
      <form>
        <AdminModalFormActions
          cancelLabel="Cancel"
          submitLabel="Saving"
          isSubmitting
          onCancel={onCancel}
        />
      </form>
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
  });

  it("keeps the submit button typed for form submission", () => {
    const onCancel = vi.fn();

    render(
      <form>
        <AdminModalFormActions
          cancelLabel="Cancel"
          submitLabel="Save"
          isSubmitting={false}
          onCancel={onCancel}
        />
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });
});

describe("admin modal control classes", () => {
  it("keeps textarea styling aligned with the shared input control", () => {
    expect(adminModalTextareaClassName).toContain(adminModalInputClassName);
    expect(adminModalTextareaClassName).toContain("min-h-[120px]");
  });
});
