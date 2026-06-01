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

    expect(screen.getByText("No schema nodes declared. Dynamic structure implicitly inferred.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add Node/i }));
    fireEvent.change(screen.getByPlaceholderText("key_identifier"), { target: { value: "first name!" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "NUMBER" } });
    fireEvent.change(screen.getByPlaceholderText("Tell LLM exactly what to extract for this key..."), {
      target: { value: "Customer age" },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      JSON.stringify(
        {
          type: "OBJECT",
          properties: {
            first_name_: {
              type: "NUMBER",
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
          type: "OBJECT",
          properties: { score: { type: "NUMBER", description: "Confidence score" } },
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

    expect(screen.getByText("No schema nodes declared. Dynamic structure implicitly inferred.")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
