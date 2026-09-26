import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "./DataTable";

/**
 * Two jobs here, and the second is the one that matters.
 *
 * The first is the ordinary one: the table renders, searches, pages and reports
 * empty correctly.
 *
 * The second is pinning the *standard shape*. Every screen in the app renders
 * through this, so these assertions are the app's house style expressed as a
 * test — one search box, one table, a footer that is always there, the same row
 * and cell classes the two reference screens use. A source scan can tell you a
 * screen imported the right thing; only rendering it tells you it produced the
 * right thing, and the faults found on 2026-08-16 were all of the second kind.
 */

type Person = { id: string; name: string; role: string };

const PEOPLE: Person[] = [
  { id: "1", name: "Ada Lovelace", role: "Admin" },
  { id: "2", name: "Grace Hopper", role: "User" },
];

const COLUMNS: DataTableColumn<Person>[] = [
  { key: "name", header: "Name", cell: (p) => p.name },
  { key: "role", header: "Role", align: "right", cell: (p) => p.role },
];

const EMPTY = { icon: <span aria-hidden="true">icon</span>, label: "Nobody here" };

const renderTable = (props: Partial<Parameters<typeof DataTable<Person>>[0]> = {}) =>
  render(
    <DataTable<Person>
      rows={PEOPLE}
      columns={COLUMNS}
      rowKey={(p) => p.id}
      empty={EMPTY}
      {...props}
    />
  );

describe("DataTable", () => {
  it("renders a row per record and a cell per column", () => {
    renderTable();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(document.querySelectorAll("tbody tr")[0].querySelectorAll("td")).toHaveLength(2);
  });

  it("shows the loading row while the query has not answered", () => {
    const { container } = renderTable({ rows: undefined });

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is nothing, not a blank table", () => {
    renderTable({ rows: [] });

    expect(screen.getByText("Nobody here")).toBeInTheDocument();
  });

  it("spans the empty and loading rows across every column", () => {
    // A colSpan that does not match the column count leaves a visible notch.
    const { rerender } = renderTable({ rows: [] });
    expect(document.querySelector("tbody td")).toHaveAttribute("colspan", "2");

    rerender(
      <DataTable<Person> rows={undefined} columns={COLUMNS} rowKey={(p) => p.id} empty={EMPTY} />
    );
    expect(document.querySelector("tbody td")).toHaveAttribute("colspan", "2");
  });

  it("passes search text up rather than filtering on screen", () => {
    const onChange = vi.fn();
    renderTable({ search: { value: "", onChange, placeholder: "Search people" } });

    fireEvent.change(screen.getByPlaceholderText("Search people"), { target: { value: "ada" } });

    expect(onChange).toHaveBeenCalledWith("ada");
  });

  it("shows every row it is given, even when the search box holds a term", () => {
    // The search value must not filter anything here. The table holds one page
    // at a time, so filtering the rendered rows would search a fifteen-row
    // window and call it a result — the server does the filtering and hands back
    // what matched. Asserted with a term that matches only one of the two rows,
    // because an empty term would pass whether this filtered or not.
    renderTable({ search: { value: "ada", onChange: vi.fn(), placeholder: "Search people" } });

    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("calls back with the row that was clicked", () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick });

    fireEvent.click(screen.getByText("Grace Hopper"));

    expect(onRowClick).toHaveBeenCalledWith(PEOPLE[1]);
  });

  it("leaves rows unclickable when no handler is given", () => {
    renderTable();

    expect(document.querySelector("tbody tr")).not.toHaveClass("cursor-pointer");
  });

  it("does not offer the pointer on a row that cannot be clicked", () => {
    // A directory lists pending invitations beside people. The invitation must
    // not take the pointer and the hover and then do nothing — that reads as a
    // broken screen rather than a deliberate one.
    const onRowClick = vi.fn();
    renderTable({ onRowClick, rowClickable: (person) => person.id !== "1" });

    const [first, second] = document.querySelectorAll("tbody tr");
    expect(first).not.toHaveClass("cursor-pointer");
    expect(second).toHaveClass("cursor-pointer");

    fireEvent.click(screen.getByText("Ada Lovelace"));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Grace Hopper"));
    expect(onRowClick).toHaveBeenCalledWith(PEOPLE[1]);
  });

  it("draws the load-more footer, and its button only when there is more", () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderTable({
      footer: { mode: "loadMore", visibleCount: 2, canLoadMore: true, isLoading: false, onLoadMore },
    });

    expect(screen.getByText("Showing 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <DataTable<Person>
        rows={PEOPLE}
        columns={COLUMNS}
        rowKey={(p) => p.id}
        empty={EMPTY}
        footer={{ mode: "loadMore", visibleCount: 2, canLoadMore: false, isLoading: false, onLoadMore }}
      />
    );

    // The bar stays; only the button goes. A footer that disappears entirely was
    // one of the two faults this component exists to stop.
    expect(screen.getByText("Showing 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("draws the paged footer with page controls", () => {
    const onPageChange = vi.fn();
    renderTable({
      footer: {
        mode: "paged",
        page: 1,
        totalPages: 2,
        totalCount: 20,
        pageSize: 15,
        isLoading: false,
        onPageChange,
      },
    });

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe("the standard shape every screen inherits", () => {
  it("puts the search box in one box, not a box inside a box", () => {
    // The workspace directory shipped its search inside a second bordered
    // wrapper. Nothing in the code looked wrong; it just did not match.
    const { container } = renderTable({
      search: { value: "", onChange: vi.fn(), placeholder: "Search people" },
    });

    const input = screen.getByPlaceholderText("Search people");
    let bordered = 0;
    for (let node = input.parentElement; node && node !== container; node = node.parentElement) {
      if (/\bborder\b/.test(node.className)) bordered += 1;
    }

    expect(bordered).toBe(1);
  });

  it("renders exactly one table and one search box", () => {
    const { container } = renderTable({
      search: { value: "", onChange: vi.fn(), placeholder: "Search people" },
    });

    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(container.querySelectorAll("input")).toHaveLength(1);
  });

  it("never nests a table inside a table", () => {
    // Two governance screens shipped this in Phase 2 by passing a <table> into
    // the shell, which draws its own. Impossible to express here, and asserted
    // so it stays impossible.
    const { container } = renderTable();

    expect(container.querySelector("table table")).toBeNull();
  });

  it("uses the house row and cell styling from the reference screens", () => {
    renderTable();

    const row = document.querySelector("tbody tr");
    expect(row).toHaveClass("border-b", "border-border-dim/50", "hover:bg-foreground/[0.02]");
    expect(row?.querySelector("td")).toHaveClass("px-4", "py-3");
  });

  it("keeps a right-aligned column right-aligned in header and body alike", () => {
    renderTable();

    expect(screen.getByText("Role")).toHaveClass("text-right");
    expect(screen.getByText("Admin")).toHaveClass("text-right");
  });
});

/**
 * Headings that order the list (Anthony, 2026-09-26, showing Ahrefs: "the
 * table heading clickable so I can sort them"). The table only draws the
 * order and says which heading was pressed; the screen decides what that
 * means, and orders the whole list on the server.
 */
describe("headings that order the list", () => {
  const SORTABLE: DataTableColumn<Person>[] = [
    { key: "name", header: "Name", sortable: true, cell: (p) => p.name },
    { key: "role", header: "Role", align: "right", sortable: true, cell: (p) => p.role },
    { key: "notes", header: "Notes", cell: () => "–" },
  ];

  it("makes a sortable heading a button that names its column", () => {
    const onSort = vi.fn();
    renderTable({ columns: SORTABLE, sort: { key: "name", direction: "asc", onSort } });

    fireEvent.click(screen.getByRole("button", { name: "Role" }));
    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    expect(onSort.mock.calls).toEqual([["role"], ["name"]]);
  });

  it("tells a screen reader which column leads, and which way", () => {
    renderTable({ columns: SORTABLE, sort: { key: "role", direction: "desc", onSort: vi.fn() } });

    const [name, role, notes] = screen.getAllByRole("columnheader");
    expect(name).toHaveAttribute("aria-sort", "none");
    expect(role).toHaveAttribute("aria-sort", "descending");
    expect(notes).not.toHaveAttribute("aria-sort");
  });

  it("leaves other headings as words, and every heading of a table given no order", () => {
    const { unmount } = renderTable({ columns: SORTABLE, sort: { key: "name", direction: "asc", onSort: vi.fn() } });
    expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
    unmount();

    renderTable({ columns: SORTABLE });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
  });

  it("keeps the heading's own capitals, which a button would otherwise reset", () => {
    renderTable({ columns: SORTABLE, sort: { key: "name", direction: "asc", onSort: vi.fn() } });

    expect(screen.getByRole("button", { name: "Name" }).className).toContain("[text-transform:inherit]");
  });
});
