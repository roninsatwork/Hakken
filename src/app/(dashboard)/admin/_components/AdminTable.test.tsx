import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdminPaginationFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
} from "./AdminTable";

describe("AdminPaginationFooter", () => {
  it("clamps stale page values after result counts change", () => {
    const onPageChange = vi.fn();

    render(
      <AdminPaginationFooter
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

describe("AdminSearchBar", () => {
  it("emits search changes through the shared callback", () => {
    const onChange = vi.fn();

    render(<AdminSearchBar value="" onChange={onChange} placeholder="Search records" />);

    fireEvent.change(screen.getByPlaceholderText("Search records"), { target: { value: "acme" } });

    expect(onChange).toHaveBeenCalledWith("acme");
  });
});

describe("Admin table rows", () => {
  it("renders shared loading and empty states inside a table", () => {
    render(
      <table>
        <tbody>
          <AdminTableLoadingRow colSpan={3} />
          <AdminTableEmptyRow colSpan={3} icon={<span aria-hidden="true">Icon</span>} label="Nothing here" />
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
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>Name</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">Actions</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
      </table>
    );

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toHaveClass("text-right");
  });

  it("renders shared row action buttons and stops row click propagation", () => {
    const onRowClick = vi.fn();
    const onActionClick = vi.fn();

    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <AdminRowActions>
                <AdminRowIconButton label="Delete item" tone="danger" onClick={onActionClick}>
                  X
                </AdminRowIconButton>
              </AdminRowActions>
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
