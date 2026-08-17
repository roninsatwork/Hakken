import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PaginationFooter,
  RowActions,
  RowIconButton,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "./Table";

describe("PaginationFooter", () => {
  it("clamps stale page values after result counts change", () => {
    const onPageChange = vi.fn();

    render(
      <PaginationFooter
        page={5}
        totalPages={2}
        totalCount={20}
        pageSize={15}
        isLoading={false}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 16-20 of 20")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Previous"));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

describe("SearchBar", () => {
  it("emits search changes through the shared callback", () => {
    const onChange = vi.fn();

    render(<SearchBar value="" onChange={onChange} placeholder="Search records" />);

    fireEvent.change(screen.getByPlaceholderText("Search records"), { target: { value: "acme" } });

    expect(onChange).toHaveBeenCalledWith("acme");
  });

  /**
   * Found on the plans screen and the wiki on 2026-08-17, and it was the same
   * box both times, because it is this one. The icon beside it is a picture and
   * the placeholder goes as soon as anyone types, so without a name the search
   * box on every screen built from this bar announced itself as nothing.
   */
  it("names the search box, so it is not announced as an unlabelled input", () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search records" />);

    expect(screen.getByLabelText("Search records")).toBe(screen.getByPlaceholderText("Search records"));
  });
});

describe("Admin table rows", () => {
  it("renders shared loading and empty states inside a table", () => {
    render(
      <table>
        <tbody>
          <TableLoadingRow colSpan={3} />
          <TableEmptyRow colSpan={3} icon={<span aria-hidden="true">Icon</span>} label="Nothing here" />
        </tbody>
      </table>
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders shared header cells with alignment", () => {
    render(
      <table>
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell align="right">Actions</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toHaveClass("text-right");
  });

  /**
   * The variant is the reason six detail-page tables could come onto the kit
   * without changing on screen. The test that matters is that a cell takes its
   * look from its row: passing the variant per cell was the alternative, and a
   * header whose cells disagree with their row is a near-miss nobody catches.
   */
  it("gives the filled header strip to a row that asks for it, and to its cells", () => {
    const { container } = render(
      <table>
        <thead>
          <TableHeaderRow variant="strip">
            <TableHeaderCell>Device</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(container.querySelector("tr")).toHaveClass("bg-sidebar/20");
    expect(screen.getByText("Device")).toHaveClass("px-5", "tracking-widest");
  });

  it("draws no card at all when asked for a bare shell", () => {
    // The option five screens were missing: a table already inside a panel.
    // If this starts drawing a border again, those screens get a card in a card.
    const { container } = render(
      <TableShell variant="bare">
        <tbody />
      </TableShell>
    );

    const shell = container.firstElementChild;
    expect(shell?.className).not.toMatch(/border|rounded/);
    expect(container.querySelector("table")).toBeInTheDocument();
  });

  it("keeps the card on the default shell", () => {
    const { container } = render(
      <TableShell>
        <tbody />
      </TableShell>
    );

    expect(container.firstElementChild).toHaveClass("border", "rounded-[16px]");
  });

  it("leaves a row that asks for nothing on the plain header", () => {
    const { container } = render(
      <table>
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>Device</TableHeaderCell>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(container.querySelector("tr")).not.toHaveClass("bg-sidebar/20");
    expect(screen.getByText("Device")).toHaveClass("px-4");
  });

  it("renders shared row action buttons and stops row click propagation", () => {
    const onRowClick = vi.fn();
    const onActionClick = vi.fn();

    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <RowActions>
                <RowIconButton label="Delete item" tone="danger" onClick={onActionClick}>
                  X
                </RowIconButton>
              </RowActions>
            </td>
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));

    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
