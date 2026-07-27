import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JsonSchemaBuilder from "./JsonSchemaBuilder";

describe("JsonSchemaBuilder", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
  });

  it("renders an empty state and emits a schema when a node is configured", () => {
    const onChange = vi.fn();

    render(<JsonSchemaBuilder title="Input Schema" subtitle="Data to collect" onChange={onChange} />);

    expect(screen.getByText("No fields yet, so the agent answers in plain English.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add a field/i }));
    fireEvent.change(screen.getByPlaceholderText("field_name"), { target: { value: "first name!" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "NUMBER" } });
    fireEvent.change(screen.getByPlaceholderText("What should go in this field?"), {
      target: { value: "Customer age" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      JSON.stringify(
        {
          type: "object",
          properties: {
            first_name_: {
              type: "number",
              description: "Customer age",
            },
          },
          required: ["first_name_"],
        },
        null,
        2
      )
    );
  });

  it("parses initial schema, toggles required fields, and removes properties", () => {
    const onChange = vi.fn();
    render(
      <JsonSchemaBuilder
        title="Output Schema"
        subtitle="Returned fields"
        onChange={onChange}
        initialSchemaJson={JSON.stringify({
          type: "OBJECT",
          properties: {
            score: { type: "NUMBER", description: "Confidence score" },
          },
          required: ["score"],
        })}
      />
    );

    expect(screen.getByDisplayValue("score")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Confidence score")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenLastCalledWith(
      JSON.stringify(
        {
          type: "object",
          properties: { score: { type: "number", description: "Confidence score" } },
        },
        null,
        2
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "" }));

    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("ignores invalid initial schema json", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<JsonSchemaBuilder title="Broken" subtitle="Invalid" onChange={vi.fn()} initialSchemaJson="not-json" />);

    expect(screen.getByText("No fields yet, so the agent answers in plain English.")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  /**
   * Shapes saved before the spelling was fixed.
   *
   * The builder used to write `"OBJECT"` and `"NUMBER"` in capitals, which the
   * one runtime path that read them would have rejected. Anything already saved
   * that way still has to open here, or fixing the spelling would silently empty
   * every schema anyone had built.
   */
  it("opens a schema saved in the old capitalised spelling", () => {
    const onChange = vi.fn();
    render(
      <JsonSchemaBuilder
        title="Output Schema"
        subtitle="Returned fields"
        onChange={onChange}
        initialSchemaJson={JSON.stringify({
          type: "OBJECT",
          properties: { score: { type: "NUMBER", description: "Confidence score" } },
          required: ["score"],
        })}
      />
    );

    expect(screen.getByDisplayValue("score")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Confidence score")).toBeInTheDocument();
  });

});
