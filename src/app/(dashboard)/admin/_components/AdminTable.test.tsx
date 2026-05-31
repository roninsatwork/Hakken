import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPaginationFooter } from "./AdminTable";

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
