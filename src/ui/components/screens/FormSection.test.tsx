import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { FormSection } from "./FormSection";

describe("FormSection", () => {
  it("heads what it holds with a small heading and lays it out in a grid", () => {
    render(
      <FormSection title="Imports to check">
        <span>First import</span>
        <span>Second import</span>
      </FormSection>,
    );

    expect(screen.getByRole("heading", { name: "Imports to check" })).toBeInTheDocument();
    expect(screen.getByText("First import").parentElement).toHaveClass("grid");
  });

  it("drops its rule when it is the first part on the page", () => {
    const { container } = render(
      <FormSection title="First">
        <span>a</span>
      </FormSection>,
    );

    expect(container.querySelector("section")).toHaveClass("first:border-t-0");
  });

  it("puts a plain line under the heading and an action at its right", () => {
    render(
      <FormSection title="Open questions" hint="Two pages disagree." action={<button type="button">Undo</button>} columns={1}>
        <span>A question</span>
      </FormSection>,
    );

    expect(screen.getByRole("heading", { name: "Open questions" }).nextElementSibling).toHaveTextContent("Two pages disagree.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByText("A question").parentElement).toHaveClass("grid-cols-1");
  });

  it("can be one ruled part with no heading", () => {
    const { container } = render(
      <div>
        <FormSection title="About the goal">
          <span>Name</span>
        </FormSection>
        <FormSection columns={1}>
          <span>Saved</span>
        </FormSection>
      </div>,
    );

    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(container.querySelectorAll("section")[1]).toHaveClass("border-t");
  });
});
