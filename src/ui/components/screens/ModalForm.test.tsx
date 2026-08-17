import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ModalFormActions,
  ModalFormError,
  ModalFormField,
  modalInputClassName,
  modalTextareaClassName,
} from "./ModalForm";

describe("ModalFormField", () => {
  it("renders a shared label, optional hint, and control", () => {
    render(
      <ModalFormField label="Name" hint="Optional">
        <input className={modalInputClassName} />
      </ModalFormField>
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveClass("focus:border-brand/50");
  });
});

describe("ModalFormError", () => {
  it("renders only when an error is present", () => {
    const { rerender } = render(<ModalFormError />);

    expect(document.querySelector(".text-red-500")).not.toBeInTheDocument();

    rerender(<ModalFormError>Save failed</ModalFormError>);

    expect(screen.getByText("Save failed")).toHaveClass("text-red-500");
  });
});

describe("ModalFormActions", () => {
  it("forwards cancel clicks and disables both actions while submitting", () => {
    const onCancel = vi.fn();

    render(
      <form>
        <ModalFormActions
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
        <ModalFormActions
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
    expect(modalTextareaClassName).toContain(modalInputClassName);
    expect(modalTextareaClassName).toContain("min-h-[120px]");
  });
});
