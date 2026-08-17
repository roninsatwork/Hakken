import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ModalFormActions,
  ModalFormError,
  ModalFormField,
  ModalTextAreaField,
  modalInputClassName,
  modalTextareaClassName,
} from "./ModalForm";

/**
 * `ModalField` already tied a single-line box to its label. The text areas beside
 * it were still written out by hand — the shared wrapper around a raw
 * `<textarea>` — and the tie is the part that got dropped every time, which is
 * invisible on screen and silent to whoever wrote the form.
 */
describe("ModalTextAreaField", () => {
  it("ties its label to the text area, so clicking the label reaches it", () => {
    render(<ModalTextAreaField label="What a good answer looks like" />);

    const box = screen.getByLabelText("What a good answer looks like");
    expect(box.tagName).toBe("TEXTAREA");
  });

  it("gives two on one form separate labels rather than one shared id", () => {
    render(
      <>
        <ModalTextAreaField label="First" />
        <ModalTextAreaField label="Second" />
      </>,
    );

    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });

  it("keeps the shared styling and takes only a height from the caller", () => {
    render(<ModalTextAreaField label="Notes" minHeightClassName="min-h-[130px]" />);

    const box = screen.getByLabelText("Notes");
    expect(box.className).toContain(modalTextareaClassName);
    expect(box.className).toContain("min-h-[130px]");
  });
});

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
