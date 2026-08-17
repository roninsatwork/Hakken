import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompactList, type CompactListColumn } from "./CompactList";

/**
 * The point of this component is what it refuses to add.
 *
 * Four screens hand-wrote a table because the records table would have forced a
 * card, a thousand-pixel minimum and rows five times taller on them. So the
 * assertions that matter are the absences: no card, no search box, no footer, no
 * heading row when nobody asked for one.
 */

type Line = { id: string; product: string; value: string };

const LINES: Line[] = [
  { id: "1", product: "Widget A", value: "£120" },
  { id: "2", product: "Widget B", value: "£80" },
];

const COLUMNS: CompactListColumn<Line>[] = [
  { key: "product", header: "Product", cell: (line) => line.product },
  { key: "value", header: "Value", align: "right", cell: (line) => line.value },
];

const HEADLESS: CompactListColumn<Line>[] = [
  { key: "product", cell: (line) => line.product },
  { key: "value", align: "right", cell: (line) => line.value },
];

describe("CompactList", () => {
  it("renders a row per record", () => {
    render(<CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />);

    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("draws headings when columns name them", () => {
    render(<CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />);

    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(document.querySelectorAll("thead")).toHaveLength(1);
  });

  it("draws no heading row at all when no column names one", () => {
    // The dashboard ledger. A heading row there would label the obvious.
    const { container } = render(
      <CompactList rows={LINES} columns={HEADLESS} rowKey={(l) => l.id} empty="Nothing" />
    );

    expect(container.querySelector("thead")).toBeNull();
    expect(screen.getByText("Widget A")).toBeInTheDocument();
  });

  it("adds no card, no search box and no footer", () => {
    // Every one of these was the reason a screen could not use the records
    // table. If any of them appears here, this component has become that one.
    const { container } = render(
      <CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />
    );

    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.firstElementChild?.className).not.toMatch(/\bborder\b|rounded/);
  });

  it("imposes no minimum width unless asked", () => {
    // A thousand-pixel minimum inside a narrow indented column is a scrollbar
    // where there was none.
    const { container } = render(
      <CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />
    );

    expect(container.querySelector("table")?.className).not.toMatch(/min-w-/);
  });

  it("keeps rows tight", () => {
    render(<CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />);

    expect(document.querySelector("tbody td")).toHaveClass("py-2.5");
  });

  it("rules between rows by default, and drops the rule when asked", () => {
    const { container, rerender } = render(
      <CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />
    );
    expect(container.querySelector("tbody tr")).toHaveClass("border-b");

    rerender(
      <CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" dividers="none" />
    );
    expect(container.querySelector("tbody tr")).not.toHaveClass("border-b");
  });

  it("says what is missing rather than drawing an empty table", () => {
    const { container } = render(
      <CompactList rows={[]} columns={COLUMNS} rowKey={(l) => l.id} empty="No line items" />
    );

    expect(screen.getByText("No line items")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("shows its own loading line while the query has not answered", () => {
    render(
      <CompactList
        rows={undefined}
        columns={COLUMNS}
        rowKey={(l) => l.id}
        empty="No line items"
        loading="Loading..."
      />
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("No line items")).not.toBeInTheDocument();
  });

  it("right-aligns a column in heading and body alike", () => {
    render(<CompactList rows={LINES} columns={COLUMNS} rowKey={(l) => l.id} empty="Nothing" />);

    expect(screen.getByText("Value")).toHaveClass("text-right");
    expect(screen.getByText("£120")).toHaveClass("text-right");
  });
});
