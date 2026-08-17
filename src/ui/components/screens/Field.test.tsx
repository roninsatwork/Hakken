import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { Field, TextAreaField } from "./Field";

/**
 * The assertions that matter here are the ones a screen was skipping when it
 * hand-wrote its own input: that the label actually addresses the field, and
 * that a hint or an error is announced with it rather than floating loose.
 */
describe("Field", () => {
  it("ties the label to the input, so finding it by label works", () => {
    renderWithProviders(<Field label="Task title" defaultValue="Call the vet" />);

    const input = screen.getByLabelText("Task title");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Call the vet");
  });

  it("points its label at the input, which is what makes clicking the label focus it", () => {
    renderWithProviders(<Field label="Due date" type="date" />);

    const input = screen.getByLabelText("Due date");
    const label = screen.getByText("Due date");
    expect(label).toHaveAttribute("for", input.id);
  });

  it("announces a hint through the field rather than beside it", () => {
    renderWithProviders(<Field label="Email" hint="We only use this to sign you in." />);

    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "We only use this to sign you in.",
    );
  });

  it("marks the field invalid and announces the error", () => {
    renderWithProviders(<Field label="Email" error="That address is not valid." />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("That address is not valid.");
  });

  it("is not marked invalid when there is no error", () => {
    renderWithProviders(<Field label="Email" />);

    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a caller-supplied id, so a screen can address the field itself", () => {
    renderWithProviders(<Field label="Search" id="chosen-id" />);

    expect(screen.getByLabelText("Search")).toHaveAttribute("id", "chosen-id");
  });

  it("gives two fields on one screen different ids", () => {
    renderWithProviders(
      <>
        <Field label="First" />
        <Field label="Second" />
      </>,
    );

    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });

  it("still labels the field when the label is hidden from view", () => {
    renderWithProviders(<Field label="Task title" labelHidden placeholder="What needs doing?" />);

    // Findable by its label, so it is labelled; the label carries sr-only, so
    // nobody sees it. Both halves matter — this is the option a quick-add row
    // uses, and it would be worthless if it dropped the label instead.
    const input = screen.getByLabelText("Task title");
    expect(input).toBeInTheDocument();
    expect(screen.getByText("Task title")).toHaveClass("sr-only");
  });

  it("passes the rest of its props through to the input", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Field label="Title" placeholder="What needs doing?" value="" onChange={onChange} />,
    );

    const input = screen.getByLabelText("Title");
    expect(input).toHaveAttribute("placeholder", "What needs doing?");

    fireEvent.change(input, { target: { value: "Ring the vet" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("TextAreaField", () => {
  it("ties the label to the textarea", () => {
    renderWithProviders(<TextAreaField label="Detail" defaultValue="Some notes" />);

    const textArea = screen.getByLabelText("Detail");
    expect(textArea.tagName).toBe("TEXTAREA");
    expect(textArea).toHaveValue("Some notes");
  });

  it("announces its error", () => {
    renderWithProviders(<TextAreaField label="Detail" error="Too long." />);

    const textArea = screen.getByLabelText("Detail");
    expect(textArea).toHaveAttribute("aria-invalid", "true");
    expect(textArea).toHaveAccessibleDescription("Too long.");
  });
});
